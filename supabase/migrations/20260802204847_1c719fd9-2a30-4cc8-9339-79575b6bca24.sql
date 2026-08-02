
-- 1) Admin : ajuster les crédits gratuits restants du jour
CREATE OR REPLACE FUNCTION public.admin_set_free_remaining(_target_user uuid, _kind text, _remaining integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    quota := 35; src := 'mobile_free'; op := 'mobile_dialog';
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
END; $$;

-- 2) Mobile : 1 credit = 1 dialogue (2 phrases)
CREATE OR REPLACE FUNCTION public.consume_mobile_translation(_user_id uuid)
RETURNS TABLE(ok boolean, reason text, remaining integer, daily_used integer, daily_limit integer, mobile_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  mobile_daily_free CONSTANT INT := 35;
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

  -- Premiere phrase du dialogue : gratuite, le credit est preleve sur la 2eme
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
END; $$;
