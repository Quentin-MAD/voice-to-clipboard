
-- Add operation_type to translations_log to distinguish translate vs read_message
ALTER TABLE public.translations_log
  ADD COLUMN IF NOT EXISTS operation_type text NOT NULL DEFAULT 'translate';

CREATE INDEX IF NOT EXISTS idx_translations_log_operation_type
  ON public.translations_log(operation_type);

-- New RPC: consume N credits atomically (for read_message = 2 credits)
CREATE OR REPLACE FUNCTION public.consume_translation_v2(
  _user_id uuid,
  _amount int DEFAULT 1,
  _operation text DEFAULT 'translate'
)
RETURNS TABLE(ok boolean, reason text, remaining_free int, remaining_purchased int, subscribed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  daily_count INT;
  monthly_free_used INT;
  free_quota CONSTANT INT := 20;
  daily_limit CONSTANT INT := 150;
  sub_active BOOLEAN;
  purchased INT;
  i INT;
BEGIN
  IF _amount < 1 THEN _amount := 1; END IF;

  -- Rate limit anti-spam : chaque lecture compte pour 1 dans le compteur 150/24h
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
    INSERT INTO public.translations_log (user_id, source_type, operation_type)
      VALUES (_user_id, 'subscription', _operation);
    RETURN QUERY SELECT true, 'subscription', 0, 0, true;
    RETURN;
  END IF;

  -- Non-abonné : on doit débiter _amount crédits (free d'abord, puis purchased)
  SELECT COUNT(*) INTO monthly_free_used
  FROM public.translations_log
  WHERE user_id = _user_id
    AND source_type = 'free_monthly'
    AND created_at > date_trunc('month', now());

  SELECT purchased_balance INTO purchased FROM public.credit_wallets WHERE user_id = _user_id FOR UPDATE;
  purchased := COALESCE(purchased, 0);

  -- Vérifier qu'on a assez au total
  IF (free_quota - monthly_free_used) + purchased < _amount THEN
    RETURN QUERY SELECT false, 'no_credits', GREATEST(0, free_quota - monthly_free_used), purchased, false;
    RETURN;
  END IF;

  -- Débiter un par un : free d'abord, puis purchased
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
END; $$;

REVOKE EXECUTE ON FUNCTION public.consume_translation_v2(uuid, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_translation_v2(uuid, int, text) TO service_role;
