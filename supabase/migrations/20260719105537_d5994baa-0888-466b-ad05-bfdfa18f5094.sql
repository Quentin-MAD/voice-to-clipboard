CREATE OR REPLACE FUNCTION public.consume_voice_read(_user_id uuid)
 RETURNS TABLE(ok boolean, reason text, remaining_voice integer, subscribed boolean, voice_daily_used integer, voice_daily_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  global_daily_count INT;
  voice_daily_count INT;
  global_daily_limit CONSTANT INT := 150;
  free_cap CONSTANT INT := 5;
  paid_cap CONSTANT INT := 10;
  sub_active BOOLEAN;
  vbal INT;
  applied_cap INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
BEGIN
  -- Anti-spam global : 150 operations/jour quoi qu'il arrive
  SELECT COUNT(*) INTO global_daily_count FROM public.translations_log
    WHERE user_id = _user_id AND created_at >= today_start;
  IF global_daily_count >= global_daily_limit THEN
    RETURN QUERY SELECT false, 'daily_limit', 0, false, 0, paid_cap;
    RETURN;
  END IF;

  SELECT (status = 'active' AND (current_period_end IS NULL OR current_period_end > now()))
    INTO sub_active FROM public.subscriptions WHERE user_id = _user_id;
  sub_active := COALESCE(sub_active, false);

  SELECT voice_balance INTO vbal FROM public.credit_wallets WHERE user_id = _user_id FOR UPDATE;
  vbal := COALESCE(vbal, 0);

  -- Seul l'abonnement permet la limite 10 lectures/jour ; les packs de credits vocaux gardent 5/jour
  applied_cap := CASE WHEN sub_active THEN paid_cap ELSE free_cap END;

  SELECT COUNT(*) INTO voice_daily_count FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'read_message'
      AND created_at >= today_start;

  IF voice_daily_count >= applied_cap THEN
    RETURN QUERY SELECT false,
      CASE WHEN applied_cap = free_cap THEN 'voice_daily_limit_free' ELSE 'voice_daily_limit' END,
      vbal, sub_active, voice_daily_count, applied_cap;
    RETURN;
  END IF;

  IF sub_active THEN
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_user_id, 'subscription', 'read_message');
    RETURN QUERY SELECT true, 'subscription', vbal, true, voice_daily_count + 1, applied_cap;
    RETURN;
  END IF;

  IF vbal < 1 THEN
    RETURN QUERY SELECT false, 'no_voice_credits', 0, false, voice_daily_count, applied_cap;
    RETURN;
  END IF;

  UPDATE public.credit_wallets SET voice_balance = vbal - 1, updated_at = now() WHERE user_id = _user_id;
  INSERT INTO public.translations_log (user_id, source_type, operation_type)
    VALUES (_user_id, 'voice_purchased', 'read_message');
  RETURN QUERY SELECT true, 'voice_purchased', vbal - 1, false, voice_daily_count + 1, applied_cap;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_user_status(_user_id uuid)
 RETURNS TABLE(subscribed boolean, free_remaining integer, purchased_balance integer, hourly_used integer, hourly_limit integer, daily_used integer, daily_limit integer, daily_reset_at timestamp with time zone, voice_balance integer, voice_daily_used integer, voice_daily_limit integer, voice_daily_reset_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  free_quota CONSTANT INT := 20;
  daily_cap CONSTANT INT := 150;
  voice_free_cap CONSTANT INT := 5;
  voice_paid_cap CONSTANT INT := 10;
  free_used INT; d_used INT;
  sub_active BOOLEAN; vbal INT; v_used INT; v_cap INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
  next_reset TIMESTAMPTZ := today_start + interval '1 day';
BEGIN
  SELECT COUNT(*) INTO free_used FROM public.translations_log
    WHERE user_id = _user_id AND source_type = 'free_monthly'
      AND created_at > date_trunc('month', now());

  SELECT COUNT(*) INTO d_used FROM public.translations_log
    WHERE user_id = _user_id AND created_at >= today_start;

  SELECT (s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now()))
    INTO sub_active FROM public.subscriptions s WHERE s.user_id = _user_id;
  sub_active := COALESCE(sub_active, false);

  SELECT w.voice_balance INTO vbal FROM public.credit_wallets w WHERE w.user_id = _user_id;
  vbal := COALESCE(vbal, 0);

  v_cap := CASE WHEN sub_active THEN voice_paid_cap ELSE voice_free_cap END;

  SELECT COUNT(*) INTO v_used FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'read_message'
      AND created_at >= today_start;

  RETURN QUERY
  SELECT sub_active,
    GREATEST(0, free_quota - free_used),
    COALESCE((SELECT w.purchased_balance FROM public.credit_wallets w WHERE w.user_id = _user_id), 0),
    d_used, daily_cap, d_used, daily_cap,
    next_reset,
    vbal, v_used, v_cap,
    next_reset;
END; $function$;