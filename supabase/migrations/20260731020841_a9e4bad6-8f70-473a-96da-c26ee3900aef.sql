-- 1) Single source of truth for paid access
CREATE OR REPLACE FUNCTION public.is_subscription_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT
      (s.status IN ('active','trialing') AND (s.current_period_end IS NULL OR s.current_period_end > now()))
      OR (s.status = 'canceled' AND s.current_period_end IS NOT NULL AND s.current_period_end > now())
    FROM public.subscriptions s
    WHERE s.user_id = _user_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.is_subscription_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_subscription_active(uuid) TO service_role, authenticated;

-- 2) Extend an existing subscription by N years (one-time "extra year" purchase)
CREATE OR REPLACE FUNCTION public.extend_subscription_year(_user_id uuid, _years integer DEFAULT 1)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_end TIMESTAMPTZ;
  new_end TIMESTAMPTZ;
BEGIN
  IF _years < 1 THEN _years := 1; END IF;

  SELECT s.current_period_end INTO current_end
    FROM public.subscriptions s WHERE s.user_id = _user_id FOR UPDATE;

  IF current_end IS NULL OR current_end < now() THEN
    current_end := now();
  END IF;

  new_end := current_end + (_years || ' years')::interval;

  INSERT INTO public.subscriptions (user_id, status, current_period_start, current_period_end)
    VALUES (_user_id, 'active', now(), new_end)
  ON CONFLICT (user_id) DO UPDATE
    SET status = 'active',
        current_period_end = new_end,
        cancel_at_period_end = false,
        updated_at = now();

  RETURN new_end;
END; $$;

REVOKE ALL ON FUNCTION public.extend_subscription_year(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_subscription_year(uuid, integer) TO service_role;

-- 3) Refund revocation: kill subscription access and wipe purchased credits
CREATE OR REPLACE FUNCTION public.revoke_for_refund(_user_id uuid, _revoke_subscription boolean DEFAULT true, _revoke_credits boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _revoke_subscription THEN
    UPDATE public.subscriptions
      SET status = 'canceled',
          current_period_end = now(),
          cancel_at_period_end = true,
          updated_at = now()
    WHERE user_id = _user_id;
  END IF;

  IF _revoke_credits THEN
    UPDATE public.credit_wallets
      SET purchased_balance = 0,
          voice_balance = 0,
          mobile_balance = 0,
          updated_at = now()
    WHERE user_id = _user_id;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.revoke_for_refund(uuid, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_for_refund(uuid, boolean, boolean) TO service_role;

-- 4) Use the shared rule everywhere
CREATE OR REPLACE FUNCTION public.consume_translation_v2(_user_id uuid, _amount integer DEFAULT 1, _operation text DEFAULT 'translate'::text)
 RETURNS TABLE(ok boolean, reason text, remaining_free integer, remaining_purchased integer, subscribed boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  daily_count INT;
  free_used_today INT;
  free_daily_quota CONSTANT INT := 30;
  daily_limit CONSTANT INT := 150;
  sub_active BOOLEAN;
  is_tester BOOLEAN;
  purchased INT;
  i INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
BEGIN
  IF _amount < 1 THEN _amount := 1; END IF;
  is_tester := public.has_role(_user_id, 'tester'::app_role);

  IF NOT is_tester THEN
    SELECT COUNT(*) INTO daily_count FROM public.translations_log
      WHERE user_id = _user_id AND created_at >= today_start;
    IF daily_count >= daily_limit THEN
      RETURN QUERY SELECT false, 'daily_limit', 0, 0, false;
      RETURN;
    END IF;
  END IF;

  sub_active := public.is_subscription_active(_user_id);

  IF sub_active OR is_tester THEN
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_user_id, CASE WHEN is_tester AND NOT sub_active THEN 'tester' ELSE 'subscription' END, _operation);
    RETURN QUERY SELECT true, CASE WHEN is_tester AND NOT sub_active THEN 'tester' ELSE 'subscription' END, 0, 0, true;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO free_used_today FROM public.translations_log
    WHERE user_id = _user_id AND source_type = 'free_daily' AND created_at >= today_start;

  SELECT purchased_balance INTO purchased FROM public.credit_wallets WHERE user_id = _user_id FOR UPDATE;
  purchased := COALESCE(purchased, 0);

  IF (free_daily_quota - free_used_today) + purchased < _amount THEN
    RETURN QUERY SELECT false, 'no_credits', GREATEST(0, free_daily_quota - free_used_today), purchased, false;
    RETURN;
  END IF;

  FOR i IN 1.._amount LOOP
    IF free_used_today < free_daily_quota THEN
      INSERT INTO public.translations_log (user_id, source_type, operation_type)
        VALUES (_user_id, 'free_daily', _operation);
      free_used_today := free_used_today + 1;
    ELSE
      purchased := purchased - 1;
      INSERT INTO public.translations_log (user_id, source_type, operation_type)
        VALUES (_user_id, 'purchased_credit', _operation);
    END IF;
  END LOOP;

  UPDATE public.credit_wallets SET purchased_balance = purchased, updated_at = now() WHERE user_id = _user_id;

  RETURN QUERY SELECT true,
    CASE WHEN free_used_today >= free_daily_quota THEN 'purchased_credit' ELSE 'free_daily' END,
    GREATEST(0, free_daily_quota - free_used_today), purchased, false;
END; $function$;

CREATE OR REPLACE FUNCTION public.consume_voice_read(_user_id uuid)
 RETURNS TABLE(ok boolean, reason text, remaining_voice integer, subscribed boolean, voice_daily_used integer, voice_daily_limit integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  global_daily_count INT;
  voice_daily_count INT;
  voice_monthly_count INT;
  global_daily_limit CONSTANT INT := 150;
  free_cap CONSTANT INT := 15;
  paid_cap CONSTANT INT := 50;
  paid_monthly_cap CONSTANT INT := 350;
  sub_active BOOLEAN;
  is_tester BOOLEAN;
  vbal INT;
  applied_cap INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
  month_start TIMESTAMPTZ := date_trunc('month', now());
BEGIN
  is_tester := public.has_role(_user_id, 'tester'::app_role);

  IF NOT is_tester THEN
    SELECT COUNT(*) INTO global_daily_count FROM public.translations_log
      WHERE user_id = _user_id AND created_at >= today_start;
    IF global_daily_count >= global_daily_limit THEN
      RETURN QUERY SELECT false, 'daily_limit', 0, false, 0, paid_cap;
      RETURN;
    END IF;
  END IF;

  sub_active := public.is_subscription_active(_user_id);

  SELECT voice_balance INTO vbal FROM public.credit_wallets WHERE user_id = _user_id FOR UPDATE;
  vbal := COALESCE(vbal, 0);

  applied_cap := CASE WHEN sub_active OR is_tester THEN paid_cap ELSE free_cap END;

  SELECT COUNT(*) INTO voice_daily_count FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'read_message' AND created_at >= today_start;

  IF NOT is_tester AND voice_daily_count >= applied_cap THEN
    RETURN QUERY SELECT false,
      CASE WHEN applied_cap = free_cap THEN 'voice_daily_limit_free' ELSE 'voice_daily_limit' END,
      vbal, sub_active, voice_daily_count, applied_cap;
    RETURN;
  END IF;

  IF sub_active AND NOT is_tester THEN
    SELECT COUNT(*) INTO voice_monthly_count FROM public.translations_log
      WHERE user_id = _user_id AND operation_type = 'read_message' AND created_at >= month_start;
    IF voice_monthly_count >= paid_monthly_cap THEN
      RETURN QUERY SELECT false, 'voice_monthly_limit', vbal, true, voice_daily_count, applied_cap;
      RETURN;
    END IF;
  END IF;

  IF sub_active OR is_tester THEN
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_user_id, CASE WHEN is_tester AND NOT sub_active THEN 'tester' ELSE 'subscription' END, 'read_message');
    RETURN QUERY SELECT true, CASE WHEN is_tester AND NOT sub_active THEN 'tester' ELSE 'subscription' END, vbal, true, voice_daily_count + 1, applied_cap;
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

CREATE OR REPLACE FUNCTION public.consume_mobile_translation(_user_id uuid)
 RETURNS TABLE(ok boolean, reason text, remaining integer, daily_used integer, daily_limit integer, mobile_balance integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  sub_active := public.is_subscription_active(_user_id);
  is_tester := public.has_role(_user_id, 'tester'::app_role);

  SELECT COALESCE(cw.mobile_balance, 0) INTO mbal FROM public.credit_wallets cw WHERE cw.user_id = _user_id;
  mbal := COALESCE(mbal, 0);

  SELECT COUNT(*) INTO used FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'mobile_dialog' AND created_at >= today_start;

  IF sub_active OR is_tester THEN
    IF NOT is_tester THEN
      SELECT COUNT(*) INTO monthly_used FROM public.translations_log
        WHERE user_id = _user_id AND operation_type = 'mobile_dialog' AND created_at >= month_start;
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    WHERE user_id = _user_id AND source_type = 'free_daily' AND created_at >= today_start;

  SELECT COUNT(*) INTO d_used FROM public.translations_log
    WHERE user_id = _user_id AND created_at >= today_start;

  sub_active := public.is_subscription_active(_user_id);
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

CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS TABLE(user_id uuid, email text, created_at timestamp with time zone, subscribed boolean, is_tester boolean, sub_status text, current_period_end timestamp with time zone, purchased_balance integer, voice_balance integer, translations_total bigint, translations_30d bigint, ops_today bigint, cost_usd_7d numeric, cost_usd_30d numeric, cost_usd_total numeric, revenue_eur_total numeric, profit_eur_total numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  USD_TO_EUR CONSTANT numeric := 0.92;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.email, p.created_at,
    public.is_subscription_active(p.id),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'tester'::app_role),
    s.status, s.current_period_end,
    COALESCE(w.purchased_balance, 0),
    COALESCE(w.voice_balance, 0),
    COALESCE((SELECT COUNT(*) FROM public.translations_log tl WHERE tl.user_id = p.id), 0),
    COALESCE((SELECT COUNT(*) FROM public.translations_log tl WHERE tl.user_id = p.id AND tl.created_at > now() - interval '30 days'), 0),
    COALESCE((SELECT COUNT(*) FROM public.translations_log tl WHERE tl.user_id = p.id AND tl.created_at >= today_start), 0),
    COALESCE((SELECT SUM(a.cost_credits) FROM public.ai_usage_log a WHERE a.user_id = p.id AND a.created_at > now() - interval '7 days'), 0),
    COALESCE((SELECT SUM(a.cost_credits) FROM public.ai_usage_log a WHERE a.user_id = p.id AND a.created_at > now() - interval '30 days'), 0),
    COALESCE((SELECT SUM(a.cost_credits) FROM public.ai_usage_log a WHERE a.user_id = p.id), 0),
    COALESCE((SELECT SUM(t.amount_eur) FROM public.payment_transactions t WHERE t.user_id = p.id AND t.environment = 'live'), 0),
    COALESCE((SELECT SUM(t.amount_eur) FROM public.payment_transactions t WHERE t.user_id = p.id AND t.environment = 'live'), 0)
      - COALESCE((SELECT SUM(a.cost_credits) FROM public.ai_usage_log a WHERE a.user_id = p.id), 0) * USD_TO_EUR
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  LEFT JOIN public.credit_wallets w ON w.user_id = p.id
  ORDER BY p.created_at DESC;
END; $function$;