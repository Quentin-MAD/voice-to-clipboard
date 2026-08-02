CREATE OR REPLACE FUNCTION public.consume_translation(_user_id uuid)
RETURNS TABLE(ok boolean, reason text, remaining_free integer, remaining_purchased integer, subscribed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT result.ok, result.reason, result.remaining_free, result.remaining_purchased, result.subscribed
  FROM public.consume_translation_v2(_user_id, 1, 'translate') AS result;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_translation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_translation(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.consume_translation(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_translation(uuid) TO service_role;