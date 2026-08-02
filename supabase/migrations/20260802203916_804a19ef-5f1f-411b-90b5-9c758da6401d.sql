CREATE OR REPLACE FUNCTION public.consume_translation_v2(_user_id uuid, _amount integer DEFAULT 1, _operation text DEFAULT 'translate'::text)
 RETURNS TABLE(ok boolean, reason text, remaining_free integer, remaining_purchased integer, subscribed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  free_used_today INT;
  free_daily_quota CONSTANT INT := 20;
  sub_active BOOLEAN;
  is_tester BOOLEAN;
  purchased INT;
  i INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
BEGIN
  IF _amount < 1 THEN _amount := 1; END IF;
  is_tester := public.has_role(_user_id, 'tester'::app_role);
  sub_active := public.is_subscription_active(_user_id);

  -- Abonnes et testeurs : aucune limite
  IF sub_active OR is_tester THEN
    FOR i IN 1.._amount LOOP
      INSERT INTO public.translations_log (user_id, source_type, operation_type)
        VALUES (_user_id, CASE WHEN is_tester AND NOT sub_active THEN 'tester' ELSE 'subscription' END, _operation);
    END LOOP;
    RETURN QUERY SELECT true, CASE WHEN is_tester AND NOT sub_active THEN 'tester' ELSE 'subscription' END, 0, 0, true;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO free_used_today FROM public.translations_log
    WHERE user_id = _user_id AND source_type = 'free_daily' AND created_at >= today_start;

  SELECT purchased_balance INTO purchased FROM public.credit_wallets WHERE user_id = _user_id FOR UPDATE;
  purchased := COALESCE(purchased, 0);

  IF GREATEST(0, free_daily_quota - free_used_today) + purchased < _amount THEN
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
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  voice_daily_count INT;
  voice_free_used INT;
  free_cap CONSTANT INT := 10;
  sub_active BOOLEAN;
  is_tester BOOLEAN;
  vbal INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
BEGIN
  is_tester := public.has_role(_user_id, 'tester'::app_role);
  sub_active := public.is_subscription_active(_user_id);

  SELECT voice_balance INTO vbal FROM public.credit_wallets WHERE user_id = _user_id;
  vbal := COALESCE(vbal, 0);

  SELECT COUNT(*) INTO voice_daily_count FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'read_message' AND created_at >= today_start;

  -- Abonnes et testeurs : aucune limite
  IF sub_active OR is_tester THEN
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_user_id, CASE WHEN is_tester AND NOT sub_active THEN 'tester' ELSE 'subscription' END, 'read_message');
    RETURN QUERY SELECT true, CASE WHEN is_tester AND NOT sub_active THEN 'tester' ELSE 'subscription' END, vbal, true, voice_daily_count + 1, 0;
    RETURN;
  END IF;

  -- Lectures vocales gratuites du jour (ne consomment aucun credit achete)
  SELECT COUNT(*) INTO voice_free_used FROM public.translations_log
    WHERE user_id = _user_id AND operation_type = 'read_message'
      AND source_type = 'voice_free' AND created_at >= today_start;

  IF voice_free_used < free_cap THEN
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_user_id, 'voice_free', 'read_message');
    RETURN QUERY SELECT true, 'voice_free', vbal, false, voice_daily_count + 1, free_cap;
    RETURN;
  END IF;

  SELECT voice_balance INTO vbal FROM public.credit_wallets WHERE user_id = _user_id FOR UPDATE;
  vbal := COALESCE(vbal, 0);
  IF vbal < 1 THEN
    RETURN QUERY SELECT false, 'no_voice_credits', 0, false, voice_daily_count, free_cap;
    RETURN;
  END IF;

  UPDATE public.credit_wallets SET voice_balance = vbal - 1, updated_at = now() WHERE user_id = _user_id;
  INSERT INTO public.translations_log (user_id, source_type, operation_type)
    VALUES (_user_id, 'voice_purchased', 'read_message');
  RETURN QUERY SELECT true, 'voice_purchased', vbal - 1, false, voice_daily_count + 1, free_cap;
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
  mobile_daily_free CONSTANT INT := 35;
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