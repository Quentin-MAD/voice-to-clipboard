DROP FUNCTION IF EXISTS public.get_user_status(uuid);

CREATE OR REPLACE FUNCTION public.get_user_status(_user_id uuid)
 RETURNS TABLE(
   subscribed boolean,
   is_tester boolean,
   has_purchased boolean,
   free_remaining integer,
   purchased_balance integer,
   hourly_used integer,
   hourly_limit integer,
   daily_used integer,
   daily_limit integer,
   daily_reset_at timestamp with time zone,
   voice_balance integer,
   voice_daily_used integer,
   voice_daily_limit integer,
   voice_daily_reset_at timestamp with time zone
 )
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
  sub_active BOOLEAN; tester BOOLEAN; purchased BOOLEAN;
  vbal INT; v_used INT; v_cap INT;
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
  tester := public.has_role(_user_id, 'tester'::app_role);

  SELECT EXISTS (
    SELECT 1 FROM public.payment_transactions t
    WHERE t.user_id = _user_id AND t.kind = 'one_time'
  ) INTO purchased;
  purchased := COALESCE(purchased, false);

  SELECT w.voice_balance INTO vbal FROM public.credit_wallets w WHERE w.user_id = _user_id;
  vbal := COALESCE(vbal, 0);

  v_cap := CASE WHEN sub_active OR tester THEN voice_paid_cap ELSE voice_free_cap END;

  SELECT COUNT(*) INTO v_used FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'read_message'
      AND created_at >= today_start;

  RETURN QUERY
  SELECT sub_active OR tester,
    tester,
    purchased,
    GREATEST(0, free_quota - free_used),
    COALESCE((SELECT w.purchased_balance FROM public.credit_wallets w WHERE w.user_id = _user_id), 0),
    d_used, daily_cap, d_used, daily_cap,
    next_reset,
    vbal, v_used, v_cap,
    next_reset;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.get_user_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_status(uuid) TO service_role;