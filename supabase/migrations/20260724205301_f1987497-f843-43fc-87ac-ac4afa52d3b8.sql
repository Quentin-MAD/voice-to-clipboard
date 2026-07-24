
DROP FUNCTION IF EXISTS public.consume_mobile_translation(uuid);
DROP FUNCTION IF EXISTS public.get_user_status(uuid);

ALTER TABLE public.credit_wallets ADD COLUMN IF NOT EXISTS mobile_balance integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.add_mobile_credits(_user_id uuid, _amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.credit_wallets (user_id, mobile_balance)
    VALUES (_user_id, GREATEST(_amount, 0))
  ON CONFLICT (user_id) DO UPDATE
    SET mobile_balance = GREATEST(public.credit_wallets.mobile_balance + _amount, 0),
        updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.admin_add_mobile_credits(_target_user uuid, _amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.credit_wallets(user_id, mobile_balance)
    VALUES (_target_user, GREATEST(_amount, 0))
  ON CONFLICT (user_id) DO UPDATE
    SET mobile_balance = GREATEST(public.credit_wallets.mobile_balance + _amount, 0),
        updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_mobile_credits(_target_user uuid, _amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.credit_wallets(user_id, mobile_balance)
    VALUES (_target_user, GREATEST(_amount, 0))
  ON CONFLICT (user_id) DO UPDATE
    SET mobile_balance = GREATEST(_amount, 0), updated_at = now();
END; $$;

CREATE FUNCTION public.consume_mobile_translation(_user_id uuid)
RETURNS TABLE(ok boolean, reason text, remaining integer, daily_used integer, daily_limit integer, mobile_balance integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  mobile_limit CONSTANT INT := 50;
  used INT;
  mbal INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
BEGIN
  SELECT COUNT(*) INTO used FROM public.translations_log
    WHERE user_id = _user_id
      AND operation_type = 'mobile_dialog'
      AND created_at >= today_start;

  IF used < mobile_limit THEN
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_user_id, 'mobile_free', 'mobile_dialog');
    SELECT COALESCE(cw.mobile_balance, 0) INTO mbal FROM public.credit_wallets cw WHERE cw.user_id = _user_id;
    RETURN QUERY SELECT true, 'mobile_free', GREATEST(0, mobile_limit - used - 1), used + 1, mobile_limit, COALESCE(mbal, 0);
    RETURN;
  END IF;

  SELECT cw.mobile_balance INTO mbal FROM public.credit_wallets cw WHERE cw.user_id = _user_id FOR UPDATE;
  mbal := COALESCE(mbal, 0);
  IF mbal < 1 THEN
    RETURN QUERY SELECT false, 'mobile_no_credits', 0, used, mobile_limit, 0;
    RETURN;
  END IF;

  UPDATE public.credit_wallets SET mobile_balance = mbal - 1, updated_at = now() WHERE user_id = _user_id;
  INSERT INTO public.translations_log (user_id, source_type, operation_type)
    VALUES (_user_id, 'mobile_purchased', 'mobile_dialog');
  RETURN QUERY SELECT true, 'mobile_purchased', mbal - 1, used + 1, mobile_limit, mbal - 1;
END; $$;

CREATE FUNCTION public.get_user_status(_user_id uuid)
RETURNS TABLE(subscribed boolean, is_tester boolean, has_purchased boolean, free_remaining integer, purchased_balance integer, hourly_used integer, hourly_limit integer, daily_used integer, daily_limit integer, daily_reset_at timestamp with time zone, voice_balance integer, voice_daily_used integer, voice_daily_limit integer, voice_daily_reset_at timestamp with time zone, mobile_balance integer, mobile_daily_used integer, mobile_daily_limit integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  free_quota CONSTANT INT := 20;
  daily_cap CONSTANT INT := 150;
  voice_free_cap CONSTANT INT := 5;
  voice_paid_cap CONSTANT INT := 10;
  mobile_daily_cap CONSTANT INT := 50;
  free_used INT; d_used INT;
  sub_active BOOLEAN; tester BOOLEAN; purchased BOOLEAN;
  vbal INT; v_used INT; v_cap INT;
  mbal INT; m_used INT;
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

  SELECT EXISTS (SELECT 1 FROM public.payment_transactions t WHERE t.user_id = _user_id AND t.kind = 'one_time') INTO purchased;
  purchased := COALESCE(purchased, false);

  SELECT w.voice_balance, w.mobile_balance INTO vbal, mbal
    FROM public.credit_wallets w WHERE w.user_id = _user_id;
  vbal := COALESCE(vbal, 0);
  mbal := COALESCE(mbal, 0);

  v_cap := CASE WHEN sub_active OR tester THEN voice_paid_cap ELSE voice_free_cap END;

  SELECT COUNT(*) INTO v_used FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'read_message' AND created_at >= today_start;

  SELECT COUNT(*) INTO m_used FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'mobile_dialog' AND created_at >= today_start;

  RETURN QUERY
  SELECT sub_active OR tester, tester, purchased,
    GREATEST(0, free_quota - free_used),
    COALESCE((SELECT w.purchased_balance FROM public.credit_wallets w WHERE w.user_id = _user_id), 0),
    d_used, daily_cap, d_used, daily_cap, next_reset,
    vbal, v_used, v_cap, next_reset,
    mbal, m_used, mobile_daily_cap;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_user_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_mobile_translation(uuid) TO authenticated;
