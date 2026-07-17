
REVOKE EXECUTE ON FUNCTION public.add_purchased_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_purchased_credits(uuid, integer) TO service_role;
