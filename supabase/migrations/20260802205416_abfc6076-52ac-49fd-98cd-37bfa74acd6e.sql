CREATE OR REPLACE FUNCTION public.consume_mobile_translation(_user_id uuid)
 RETURNS TABLE(ok boolean, reason text, remaining integer, daily_used integer, daily_limit integer, mobile_balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  mobile_daily_free CONSTANT INT := 15;
  used INT;
  phrases INT;
  mbal INT;
  sub_active BOOLEAN;
  is_tester BOOLEAN;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
BEGIN
  sub_active := public.is_subscription_active(_user_id);
  is_tester := public.has_role(_user_id, 'tester'::app_role);

  SELECT COALESCE(cw.mobile_balance, 0) INTO mbal FROM public.credit_wallets cw WHERE cw.user_id = _user_id;
  mbal := COALESCE(mbal, 0);

  SELECT COUNT(*) INTO used FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'mobile_dialog' AND created_at >= today_start;

  SELECT COUNT(*) INTO phrases FROM public.translations_log
    WHERE user_id = _user_id AND operation_type IN ('mobile_dialog','mobile_phrase') AND created_at >= today_start;

  IF (phrases % 2) = 0 THEN
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_user_id, 'mobile_pair', 'mobile_phrase');
    RETURN QUERY SELECT true, 'mobile_pair', mbal, used,
      CASE WHEN sub_active OR is_tester THEN 0 ELSE mobile_daily_free END, mbal;
    RETURN;
  END IF;

  IF sub_active OR is_tester THEN
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_user_id, CASE WHEN is_tester AND NOT sub_active THEN 'tester' ELSE 'subscription' END, 'mobile_dialog');
    RETURN QUERY SELECT true, 'subscription', 0, used + 1, 0, mbal;
    RETURN;
  END IF;

  IF used < mobile_daily_free THEN
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_user_id, 'mobile_free', 'mobile_dialog');
    RETURN QUERY SELECT true, 'mobile_free', GREATEST(0, mobile_daily_free - used - 1), used + 1, mobile_daily_free, mbal;
    RETURN;
  END IF;

  SELECT cw.mobile_balance INTO mbal FROM public.credit_wallets cw WHERE cw.user_id = _user_id FOR UPDATE;
  mbal := COALESCE(mbal, 0);
  IF mbal < 1 THEN
    RETURN QUERY SELECT false, 'mobile_no_credits', 0, used, mobile_daily_free, 0;
    RETURN;
  END IF;

  UPDATE public.credit_wallets SET mobile_balance = mbal - 1, updated_at = now() WHERE user_id = _user_id;
  INSERT INTO public.translations_log (user_id, source_type, operation_type)
    VALUES (_user_id, 'mobile_purchased', 'mobile_dialog');
  RETURN QUERY SELECT true, 'mobile_purchased', mbal - 1, used + 1, mobile_daily_free, mbal - 1;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_user_status(_user_id uuid)
 RETURNS TABLE(subscribed boolean, is_tester boolean, has_purchased boolean, free_remaining integer, purchased_balance integer, hourly_used integer, hourly_limit integer, daily_used integer, daily_limit integer, daily_reset_at timestamp with time zone, voice_balance integer, voice_daily_used integer, voice_daily_limit integer, voice_daily_reset_at timestamp with time zone, mobile_balance integer, mobile_daily_used integer, mobile_daily_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  free_daily_quota CONSTANT INT := 20;
  voice_free_cap CONSTANT INT := 10;
  mobile_daily_free CONSTANT INT := 15;
  free_used_today INT; d_used INT;
  sub_active BOOLEAN; tester BOOLEAN; purchased BOOLEAN;
  vbal INT; v_used INT; v_cap INT;
  mbal INT; m_used INT; m_cap INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
  next_reset TIMESTAMPTZ := today_start + interval '1 day';
BEGIN
  sub_active := public.is_subscription_active(_user_id);
  tester := public.has_role(_user_id, 'tester'::app_role);

  SELECT COUNT(*) INTO free_used_today FROM public.translations_log
    WHERE user_id = _user_id AND source_type = 'free_daily' AND created_at >= today_start;

  SELECT COUNT(*) INTO d_used FROM public.translations_log
    WHERE user_id = _user_id AND created_at >= today_start;

  SELECT EXISTS (SELECT 1 FROM public.payment_transactions t WHERE t.user_id = _user_id AND t.kind = 'one_time') INTO purchased;
  purchased := COALESCE(purchased, false);

  SELECT w.voice_balance, w.mobile_balance INTO vbal, mbal
    FROM public.credit_wallets w WHERE w.user_id = _user_id;
  vbal := COALESCE(vbal, 0);
  mbal := COALESCE(mbal, 0);

  SELECT COUNT(*) INTO v_used FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'read_message'
      AND source_type = 'voice_free' AND created_at >= today_start;

  SELECT COUNT(*) INTO m_used FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'mobile_dialog' AND created_at >= today_start;

  IF sub_active OR tester THEN
    v_cap := 0;
    m_cap := 0;
  ELSE
    v_cap := voice_free_cap;
    m_cap := mobile_daily_free;
  END IF;

  RETURN QUERY
  SELECT sub_active, tester, purchased,
    CASE WHEN sub_active OR tester THEN 0 ELSE GREATEST(0, free_daily_quota - free_used_today) END,
    COALESCE((SELECT w.purchased_balance FROM public.credit_wallets w WHERE w.user_id = _user_id), 0),
    d_used, 0, d_used, 0, next_reset,
    vbal, v_used, v_cap, next_reset,
    mbal, m_used, m_cap;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_free_remaining(_target_user uuid, _kind text, _remaining integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  quota INT;
  src TEXT;
  op TEXT;
  to_insert INT;
  i INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
BEGIN
  IF _kind = 'text' THEN
    quota := 20; src := 'free_daily'; op := 'translate';
  ELSIF _kind = 'voice' THEN
    quota := 10; src := 'voice_free'; op := 'read_message';
  ELSIF _kind = 'mobile' THEN
    quota := 15; src := 'mobile_free'; op := 'mobile_dialog';
  ELSE
    RAISE EXCEPTION 'unknown kind %', _kind;
  END IF;

  _remaining := LEAST(GREATEST(_remaining, 0), quota);

  DELETE FROM public.translations_log
    WHERE user_id = _target_user AND source_type = src AND operation_type = op AND created_at >= today_start;

  to_insert := quota - _remaining;
  FOR i IN 1..to_insert LOOP
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_target_user, src, op);
  END LOOP;
END; $function$;