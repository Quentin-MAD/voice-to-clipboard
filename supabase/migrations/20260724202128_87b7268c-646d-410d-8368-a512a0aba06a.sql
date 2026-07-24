
-- Revoke EXECUTE from anon/authenticated on SECURITY DEFINER functions that should never be user-callable.
-- Admin-only operations (server-side / service_role only)
REVOKE EXECUTE ON FUNCTION public.admin_set_subscription(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_add_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_add_voice_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_voice_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_tester(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon, authenticated;

-- Internal credit mutation helpers (only called from server functions with service_role)
REVOKE EXECUTE ON FUNCTION public.add_purchased_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_voice_credits(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Trigger function, should never be called directly
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Keep service_role able to execute all
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_voice_credits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_credits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_voice_credits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_tester(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO service_role;
GRANT EXECUTE ON FUNCTION public.add_purchased_credits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_voice_credits(uuid, integer) TO service_role;
