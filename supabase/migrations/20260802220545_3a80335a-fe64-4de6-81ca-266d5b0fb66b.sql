CREATE OR REPLACE FUNCTION public.is_subscription_active(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT
      (s.status IN ('active','trialing') AND (s.current_period_end IS NULL OR s.current_period_end > now()))
      OR (s.status IN ('canceled','past_due') AND s.current_period_end IS NOT NULL AND s.current_period_end > now())
    FROM public.subscriptions s
    WHERE s.user_id = _user_id
  ), false);
$function$;