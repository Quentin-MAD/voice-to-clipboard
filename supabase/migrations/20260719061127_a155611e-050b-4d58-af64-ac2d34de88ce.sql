
DROP FUNCTION IF EXISTS public.get_user_status(uuid);

CREATE OR REPLACE FUNCTION public.get_user_status(_user_id uuid)
 RETURNS TABLE(subscribed boolean, free_remaining integer, purchased_balance integer, hourly_used integer, hourly_limit integer, daily_used integer, daily_limit integer, daily_reset_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  free_quota CONSTANT INT := 20;
  daily_cap CONSTANT INT := 150;
  free_used INT;
  d_used INT;
  oldest_in_window timestamptz;
BEGIN
  SELECT COUNT(*) INTO free_used FROM public.translations_log
    WHERE user_id = _user_id AND source_type = 'free_monthly'
      AND created_at > date_trunc('month', now());

  SELECT COUNT(*) INTO d_used FROM public.translations_log
    WHERE user_id = _user_id AND created_at > now() - interval '24 hours';

  SELECT MIN(created_at) INTO oldest_in_window FROM public.translations_log
    WHERE user_id = _user_id AND created_at > now() - interval '24 hours';

  RETURN QUERY
  SELECT
    COALESCE((SELECT s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now())
              FROM public.subscriptions s WHERE s.user_id = _user_id), false),
    GREATEST(0, free_quota - free_used),
    COALESCE((SELECT w.purchased_balance FROM public.credit_wallets w WHERE w.user_id = _user_id), 0),
    d_used,
    daily_cap,
    d_used,
    daily_cap,
    CASE WHEN d_used >= daily_cap AND oldest_in_window IS NOT NULL
         THEN oldest_in_window + interval '24 hours'
         ELSE NULL END;
END; $function$;
