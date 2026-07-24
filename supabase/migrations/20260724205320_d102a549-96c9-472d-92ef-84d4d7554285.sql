
REVOKE ALL ON FUNCTION public.get_user_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_mobile_translation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_mobile_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_add_mobile_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_mobile_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_mobile_translation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_mobile_credits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_mobile_credits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_mobile_credits(uuid, integer) TO service_role;
