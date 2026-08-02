
REVOKE EXECUTE ON FUNCTION public.admin_set_free_remaining(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_free_remaining(uuid, text, integer) TO service_role;
