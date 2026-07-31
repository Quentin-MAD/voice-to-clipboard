REVOKE ALL ON FUNCTION public.is_subscription_active(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.extend_subscription_year(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_for_refund(uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_subscription_active(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.extend_subscription_year(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_for_refund(uuid, boolean, boolean) TO service_role;