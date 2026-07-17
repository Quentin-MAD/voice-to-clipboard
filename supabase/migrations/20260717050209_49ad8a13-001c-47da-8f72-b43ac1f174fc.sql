
CREATE OR REPLACE FUNCTION public.get_user_status(_user_id uuid)
 RETURNS TABLE(subscribed boolean, free_remaining integer, purchased_balance integer, hourly_used integer, hourly_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  free_quota CONSTANT INT := 20;
  free_used INT;
BEGIN
  SELECT COUNT(*) INTO free_used FROM public.translations_log
    WHERE user_id = _user_id AND source_type = 'free_monthly'
      AND created_at > date_trunc('month', now());
  RETURN QUERY
  SELECT
    COALESCE((SELECT s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now())
              FROM public.subscriptions s WHERE s.user_id = _user_id), false),
    GREATEST(0, free_quota - free_used),
    COALESCE((SELECT w.purchased_balance FROM public.credit_wallets w WHERE w.user_id = _user_id), 0),
    (SELECT COUNT(*)::INT FROM public.translations_log tl
       WHERE tl.user_id = _user_id AND tl.created_at > now() - INTERVAL '1 hour'),
    50;
END; $function$;
