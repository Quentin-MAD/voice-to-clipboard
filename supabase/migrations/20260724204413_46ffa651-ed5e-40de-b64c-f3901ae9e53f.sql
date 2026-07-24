
GRANT EXECUTE ON FUNCTION public.get_user_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_translation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_translation_v2(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_voice_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_mobile_translation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
