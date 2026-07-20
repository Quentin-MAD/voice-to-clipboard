
-- Actions admin pour gérer le rôle tester
CREATE OR REPLACE FUNCTION public.admin_set_tester(_target_user uuid, _enable boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _enable THEN
    INSERT INTO public.user_roles(user_id, role)
      VALUES (_target_user, 'tester'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
      WHERE user_id = _target_user AND role = 'tester'::app_role;
  END IF;
END; $$;

-- Mettre à jour consume_translation_v2 pour traiter les testeurs comme abonnés
CREATE OR REPLACE FUNCTION public.consume_translation_v2(_user_id uuid, _amount integer DEFAULT 1, _operation text DEFAULT 'translate'::text)
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
  is_tester BOOLEAN;
  purchased INT;
  i INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
BEGIN
  IF _amount < 1 THEN _amount := 1; END IF;

  SELECT COUNT(*) INTO daily_count
  FROM public.translations_log
  WHERE user_id = _user_id AND created_at >= today_start;
  IF daily_count >= daily_limit THEN
    RETURN QUERY SELECT false, 'daily_limit', 0, 0, false;
    RETURN;
  END IF;

  SELECT (status = 'active' AND (current_period_end IS NULL OR current_period_end > now()))
    INTO sub_active FROM public.subscriptions WHERE user_id = _user_id;
  sub_active := COALESCE(sub_active, false);
  is_tester := public.has_role(_user_id, 'tester'::app_role);

  IF sub_active OR is_tester THEN
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_user_id, CASE WHEN is_tester AND NOT sub_active THEN 'tester' ELSE 'subscription' END, _operation);
    RETURN QUERY SELECT true, CASE WHEN is_tester AND NOT sub_active THEN 'tester' ELSE 'subscription' END, 0, 0, true;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO monthly_free_used
  FROM public.translations_log
  WHERE user_id = _user_id
    AND source_type = 'free_monthly'
    AND created_at > date_trunc('month', now());

  SELECT purchased_balance INTO purchased FROM public.credit_wallets WHERE user_id = _user_id FOR UPDATE;
  purchased := COALESCE(purchased, 0);

  IF (free_quota - monthly_free_used) + purchased < _amount THEN
    RETURN QUERY SELECT false, 'no_credits', GREATEST(0, free_quota - monthly_free_used), purchased, false;
    RETURN;
  END IF;

  FOR i IN 1.._amount LOOP
    IF monthly_free_used < free_quota THEN
      INSERT INTO public.translations_log (user_id, source_type, operation_type)
        VALUES (_user_id, 'free_monthly', _operation);
      monthly_free_used := monthly_free_used + 1;
    ELSE
      purchased := purchased - 1;
      INSERT INTO public.translations_log (user_id, source_type, operation_type)
        VALUES (_user_id, 'purchased_credit', _operation);
    END IF;
  END LOOP;

  UPDATE public.credit_wallets SET purchased_balance = purchased, updated_at = now() WHERE user_id = _user_id;

  RETURN QUERY SELECT true,
    CASE WHEN monthly_free_used >= free_quota THEN 'purchased_credit' ELSE 'free_monthly' END,
    GREATEST(0, free_quota - monthly_free_used),
    purchased,
    false;
END; $function$;

-- Mettre à jour consume_voice_read pour traiter les testeurs comme abonnés
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
  is_tester BOOLEAN;
  vbal INT;
  applied_cap INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
BEGIN
  SELECT COUNT(*) INTO global_daily_count FROM public.translations_log
    WHERE user_id = _user_id AND created_at >= today_start;
  IF global_daily_count >= global_daily_limit THEN
    RETURN QUERY SELECT false, 'daily_limit', 0, false, 0, paid_cap;
    RETURN;
  END IF;

  SELECT (status = 'active' AND (current_period_end IS NULL OR current_period_end > now()))
    INTO sub_active FROM public.subscriptions WHERE user_id = _user_id;
  sub_active := COALESCE(sub_active, false);
  is_tester := public.has_role(_user_id, 'tester'::app_role);

  SELECT voice_balance INTO vbal FROM public.credit_wallets WHERE user_id = _user_id FOR UPDATE;
  vbal := COALESCE(vbal, 0);

  applied_cap := CASE WHEN sub_active OR is_tester THEN paid_cap ELSE free_cap END;

  SELECT COUNT(*) INTO voice_daily_count FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'read_message'
      AND created_at >= today_start;

  IF voice_daily_count >= applied_cap THEN
    RETURN QUERY SELECT false,
      CASE WHEN applied_cap = free_cap THEN 'voice_daily_limit_free' ELSE 'voice_daily_limit' END,
      vbal, sub_active OR is_tester, voice_daily_count, applied_cap;
    RETURN;
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

-- Mettre à jour get_user_status pour tenir compte des testeurs
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
  sub_active BOOLEAN; is_tester BOOLEAN; vbal INT; v_used INT; v_cap INT;
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
  is_tester := public.has_role(_user_id, 'tester'::app_role);

  SELECT w.voice_balance INTO vbal FROM public.credit_wallets w WHERE w.user_id = _user_id;
  vbal := COALESCE(vbal, 0);

  v_cap := CASE WHEN sub_active OR is_tester THEN voice_paid_cap ELSE voice_free_cap END;

  SELECT COUNT(*) INTO v_used FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'read_message'
      AND created_at >= today_start;

  RETURN QUERY
  SELECT sub_active OR is_tester,
    GREATEST(0, free_quota - free_used),
    COALESCE((SELECT w.purchased_balance FROM public.credit_wallets w WHERE w.user_id = _user_id), 0),
    d_used, daily_cap, d_used, daily_cap,
    next_reset,
    vbal, v_used, v_cap,
    next_reset;
END; $function$;

-- Mettre à jour admin_list_users pour renvoyer is_tester
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS TABLE(user_id uuid, email text, created_at timestamp with time zone, subscribed boolean, is_tester boolean, sub_status text, current_period_end timestamp with time zone, purchased_balance integer, voice_balance integer, translations_total bigint, translations_30d bigint, ops_today bigint, cost_usd_7d numeric, cost_usd_30d numeric, cost_usd_total numeric, revenue_eur_total numeric, profit_eur_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  USD_TO_EUR CONSTANT numeric := 0.92;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.created_at,
    COALESCE(s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now()), false),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'tester'::app_role),
    s.status,
    s.current_period_end,
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
