-- Revoke EXECUTE on SECURITY DEFINER functions from PUBLIC/anon/authenticated.
-- These RPCs are now called exclusively server-side via service_role (server functions).
-- has_role is invoked internally by other SECURITY DEFINER functions, which run as
-- the definer role, so it does not need a grant to authenticated.

REVOKE EXECUTE ON FUNCTION public.consume_translation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_translation_v2(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_mobile_translation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_voice_read(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

-- Ensure service_role retains access (it should already, but be explicit).
GRANT EXECUTE ON FUNCTION public.consume_translation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_translation_v2(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_mobile_translation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_voice_read(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;