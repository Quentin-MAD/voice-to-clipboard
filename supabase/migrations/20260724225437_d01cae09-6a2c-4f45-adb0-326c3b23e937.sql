
CREATE OR REPLACE FUNCTION public.consume_mobile_translation(_user_id uuid)
 RETURNS TABLE(ok boolean, reason text, remaining integer, daily_used integer, daily_limit integer, mobile_balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  mobile_daily_free CONSTANT INT := 35;
  sub_monthly_cap CONSTANT INT := 500;
  used INT;
  monthly_used INT;
  mbal INT;
  sub_active BOOLEAN;
  is_tester BOOLEAN;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
  month_start TIMESTAMPTZ := date_trunc('month', now());
BEGIN
  SELECT (status = 'active' AND (current_period_end IS NULL OR current_period_end > now()))
    INTO sub_active FROM public.subscriptions WHERE user_id = _user_id;
  sub_active := COALESCE(sub_active, false);
  is_tester := public.has_role(_user_id, 'tester'::app_role);

  SELECT COALESCE(cw.mobile_balance, 0) INTO mbal FROM public.credit_wallets cw WHERE cw.user_id = _user_id;
  mbal := COALESCE(mbal, 0);

  SELECT COUNT(*) INTO used FROM public.translations_log
    WHERE user_id = _user_id
      AND operation_type = 'mobile_dialog'
      AND created_at >= today_start;

  IF sub_active OR is_tester THEN
    IF NOT is_tester THEN
      SELECT COUNT(*) INTO monthly_used FROM public.translations_log
        WHERE user_id = _user_id
          AND operation_type = 'mobile_dialog'
          AND created_at >= month_start;
      IF monthly_used >= sub_monthly_cap THEN
        RETURN QUERY SELECT false, 'mobile_monthly_limit', 0, used, sub_monthly_cap, mbal;
        RETURN;
      END IF;
    END IF;
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_user_id, CASE WHEN is_tester AND NOT sub_active THEN 'tester' ELSE 'subscription' END, 'mobile_dialog');
    RETURN QUERY SELECT true, 'subscription', GREATEST(0, sub_monthly_cap - COALESCE(monthly_used,0) - 1), used + 1, sub_monthly_cap, mbal;
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
  free_daily_quota CONSTANT INT := 30;
  daily_cap CONSTANT INT := 150;
  voice_free_cap CONSTANT INT := 15;
  voice_paid_cap CONSTANT INT := 50;
  mobile_daily_free CONSTANT INT := 35;
  mobile_sub_monthly CONSTANT INT := 500;
  free_used_today INT; d_used INT;
  sub_active BOOLEAN; tester BOOLEAN; purchased BOOLEAN;
  vbal INT; v_used INT; v_cap INT;
  mbal INT; m_used INT; m_monthly INT; m_cap INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
  next_reset TIMESTAMPTZ := today_start + interval '1 day';
BEGIN
  SELECT COUNT(*) INTO free_used_today FROM public.translations_log
    WHERE user_id = _user_id AND source_type = 'free_daily'
      AND created_at >= today_start;

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

  IF sub_active OR tester THEN
    SELECT COUNT(*) INTO m_monthly FROM public.translations_log
      WHERE user_id = _user_id AND operation_type = 'mobile_dialog'
        AND created_at >= date_trunc('month', now());
    m_cap := mobile_sub_monthly;
    m_used := m_monthly;
  ELSE
    m_cap := mobile_daily_free;
  END IF;

  RETURN QUERY
  SELECT sub_active, tester, purchased,
    GREATEST(0, free_daily_quota - free_used_today),
    COALESCE((SELECT w.purchased_balance FROM public.credit_wallets w WHERE w.user_id = _user_id), 0),
    d_used, daily_cap, d_used, daily_cap, next_reset,
    vbal, v_used, v_cap, next_reset,
    mbal, m_used, m_cap;
END; $function$;
