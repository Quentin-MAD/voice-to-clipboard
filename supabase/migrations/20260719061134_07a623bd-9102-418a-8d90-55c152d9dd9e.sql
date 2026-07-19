
REVOKE EXECUTE ON FUNCTION public.get_user_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_status(uuid) TO service_role;
