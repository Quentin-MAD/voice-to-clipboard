
CREATE OR REPLACE FUNCTION public.consume_mobile_translation(_user_id uuid)
RETURNS TABLE(ok boolean, reason text, remaining integer, daily_used integer, daily_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mobile_limit CONSTANT INT := 50;
  used INT;
  today_start TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris';
BEGIN
  SELECT COUNT(*) INTO used FROM public.translations_log
    WHERE user_id = _user_id
      AND operation_type = 'mobile_dialog'
      AND created_at >= today_start;

  IF used >= mobile_limit THEN
    RETURN QUERY SELECT false, 'mobile_daily_limit', 0, used, mobile_limit;
    RETURN;
  END IF;

  INSERT INTO public.translations_log (user_id, source_type, operation_type)
    VALUES (_user_id, 'mobile_free', 'mobile_dialog');

  RETURN QUERY SELECT true, 'mobile_free', GREATEST(0, mobile_limit - used - 1), used + 1, mobile_limit;
END; $function$;
