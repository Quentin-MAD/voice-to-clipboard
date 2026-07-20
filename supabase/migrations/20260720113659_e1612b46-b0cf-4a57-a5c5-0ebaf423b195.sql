
REVOKE ALL ON FUNCTION public.admin_set_tester(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_tester(uuid, boolean) TO service_role;
