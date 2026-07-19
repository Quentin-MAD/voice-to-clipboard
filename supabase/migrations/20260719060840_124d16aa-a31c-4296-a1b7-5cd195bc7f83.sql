
CREATE OR REPLACE FUNCTION public.consume_translation(_user_id uuid)
 RETURNS TABLE(ok boolean, reason text, remaining_free integer, remaining_purchased integer, subscribed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  daily_count INT;
  monthly_free_used INT;
  free_quota CONSTANT INT := 20;
  daily_limit CONSTANT INT := 150;
  sub_active BOOLEAN;
  purchased INT;
BEGIN
  -- Rate limit anti-spam : 150/jour quoi qu'il arrive
  SELECT COUNT(*) INTO daily_count
  FROM public.translations_log
  WHERE user_id = _user_id AND created_at > now() - INTERVAL '1 day';
  IF daily_count >= daily_limit THEN
    RETURN QUERY SELECT false, 'daily_limit', 0, 0, false;
    RETURN;
  END IF;

  SELECT (status = 'active' AND (current_period_end IS NULL OR current_period_end > now()))
    INTO sub_active FROM public.subscriptions WHERE user_id = _user_id;
  sub_active := COALESCE(sub_active, false);

  IF sub_active THEN
    INSERT INTO public.translations_log (user_id, source_type) VALUES (_user_id, 'subscription');
    RETURN QUERY SELECT true, 'subscription', 0, 0, true;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO monthly_free_used
  FROM public.translations_log
  WHERE user_id = _user_id
    AND source_type = 'free_monthly'
    AND created_at > date_trunc('month', now());

  IF monthly_free_used < free_quota THEN
    INSERT INTO public.translations_log (user_id, source_type) VALUES (_user_id, 'free_monthly');
    RETURN QUERY SELECT true, 'free_monthly', (free_quota - monthly_free_used - 1), 0, false;
    RETURN;
  END IF;

  SELECT purchased_balance INTO purchased FROM public.credit_wallets WHERE user_id = _user_id FOR UPDATE;
  purchased := COALESCE(purchased, 0);
  IF purchased > 0 THEN
    UPDATE public.credit_wallets SET purchased_balance = purchased - 1, updated_at = now() WHERE user_id = _user_id;
    INSERT INTO public.translations_log (user_id, source_type) VALUES (_user_id, 'purchased_credit');
    RETURN QUERY SELECT true, 'purchased_credit', 0, (purchased - 1), false;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, 'no_credits', 0, 0, false;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_user_status(_user_id uuid)
 RETURNS TABLE(subscribed boolean, free_remaining integer, purchased_balance integer, hourly_used integer, hourly_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  free_quota CONSTANT INT := 20;
  daily_limit CONSTANT INT := 150;
  free_used INT;
BEGIN
  SELECT COUNT(*) INTO free_used FROM public.translations_log
    WHERE user_id = _user_id AND source_type = 'free_monthly'
      AND created_at > date_trunc('month', now());
  RETURN QUERY
  SELECT
    COALESCE((SELECT s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now())
              FROM public.subscriptions s WHERE s.user_id = _user_id), false),
    GREATEST(0, free_quota - free_used),
    COALESCE((SELECT w.purchased_balance FROM public.credit_wallets w WHERE w.user_id = _user_id), 0),
    (SELECT COUNT(*)::INT FROM public.translations_log tl
       WHERE tl.user_id = _user_id AND tl.created_at > now() - INTERVAL '1 day'),
    daily_limit;
END; $function$;
