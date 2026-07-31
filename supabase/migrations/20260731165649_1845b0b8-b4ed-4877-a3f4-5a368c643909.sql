DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS TABLE(user_id uuid, email text, created_at timestamp with time zone, subscribed boolean, is_tester boolean, sub_status text, sub_environment text, access_origin text, is_paid_subscriber boolean, current_period_end timestamp with time zone, purchased_balance integer, voice_balance integer, mobile_balance integer, translations_total bigint, translations_30d bigint, ops_today bigint, cost_usd_7d numeric, cost_usd_30d numeric, cost_usd_total numeric, revenue_eur_total numeric, revenue_eur_test numeric, profit_eur_total numeric)
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
    public.is_subscription_active(p.id),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'tester'::app_role),
    s.status,
    s.environment,
    CASE
      WHEN NOT public.is_subscription_active(p.id) THEN 'none'
      WHEN EXISTS (
        SELECT 1 FROM public.payment_transactions t
        WHERE t.user_id = p.id AND t.environment = 'live' AND t.kind = 'subscription'
      ) THEN 'paid'
      ELSE 'granted'
    END,
    (
      public.is_subscription_active(p.id)
      AND EXISTS (
        SELECT 1 FROM public.payment_transactions t
        WHERE t.user_id = p.id AND t.environment = 'live' AND t.kind = 'subscription'
      )
    ),
    s.current_period_end,
    COALESCE(w.purchased_balance, 0),
    COALESCE(w.voice_balance, 0),
    COALESCE(w.mobile_balance, 0),
    COALESCE((SELECT COUNT(*) FROM public.translations_log tl WHERE tl.user_id = p.id), 0),
    COALESCE((SELECT COUNT(*) FROM public.translations_log tl WHERE tl.user_id = p.id AND tl.created_at > now() - interval '30 days'), 0),
    COALESCE((SELECT COUNT(*) FROM public.translations_log tl WHERE tl.user_id = p.id AND tl.created_at >= today_start), 0),
    COALESCE((SELECT SUM(a.cost_credits) FROM public.ai_usage_log a WHERE a.user_id = p.id AND a.created_at > now() - interval '7 days'), 0),
    COALESCE((SELECT SUM(a.cost_credits) FROM public.ai_usage_log a WHERE a.user_id = p.id AND a.created_at > now() - interval '30 days'), 0),
    COALESCE((SELECT SUM(a.cost_credits) FROM public.ai_usage_log a WHERE a.user_id = p.id), 0),
    COALESCE((SELECT SUM(t.amount_eur) FROM public.payment_transactions t WHERE t.user_id = p.id AND t.environment = 'live'), 0),
    COALESCE((SELECT SUM(t.amount_eur) FROM public.payment_transactions t WHERE t.user_id = p.id AND t.environment <> 'live'), 0),
    COALESCE((SELECT SUM(t.amount_eur) FROM public.payment_transactions t WHERE t.user_id = p.id AND t.environment = 'live'), 0)
      - COALESCE((SELECT SUM(a.cost_credits) FROM public.ai_usage_log a WHERE a.user_id = p.id), 0) * USD_TO_EUR
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  LEFT JOIN public.credit_wallets w ON w.user_id = p.id
  ORDER BY p.created_at DESC;
END; $function$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO service_role;