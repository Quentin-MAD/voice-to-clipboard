
-- These are called server-side via service_role (supabaseAdmin). Revoke from authenticated/anon.
REVOKE EXECUTE ON FUNCTION public.consume_translation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_translation_v2(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_voice_read(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_mobile_translation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_status(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_translation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_translation_v2(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_voice_read(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_mobile_translation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_status(uuid) TO service_role;

-- has_role is used inside RLS policies (evaluated as caller); keep EXECUTE for authenticated.
