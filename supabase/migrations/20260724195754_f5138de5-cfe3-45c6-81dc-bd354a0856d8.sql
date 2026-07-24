
REVOKE EXECUTE ON FUNCTION public.consume_mobile_translation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_mobile_translation(uuid) TO authenticated, service_role;
