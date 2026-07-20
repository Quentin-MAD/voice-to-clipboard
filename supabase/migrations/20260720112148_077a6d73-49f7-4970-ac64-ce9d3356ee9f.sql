
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS TABLE(user_id uuid, email text, created_at timestamp with time zone, subscribed boolean, sub_status text, current_period_end timestamp with time zone, purchased_balance integer, voice_balance integer, translations_total bigint, translations_30d bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.created_at,
    COALESCE(s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now()), false),
    s.status,
    s.current_period_end,
    COALESCE(w.purchased_balance, 0),
    COALESCE(w.voice_balance, 0),
    COALESCE((SELECT COUNT(*) FROM public.translations_log tl WHERE tl.user_id = p.id), 0),
    COALESCE((SELECT COUNT(*) FROM public.translations_log tl WHERE tl.user_id = p.id AND tl.created_at > now() - interval '30 days'), 0)
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  LEFT JOIN public.credit_wallets w ON w.user_id = p.id
  ORDER BY p.created_at DESC;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_credits(_target_user uuid, _amount integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.credit_wallets(user_id, purchased_balance)
    VALUES (_target_user, GREATEST(_amount, 0))
  ON CONFLICT (user_id) DO UPDATE
    SET purchased_balance = GREATEST(_amount, 0), updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_voice_credits(_target_user uuid, _amount integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.credit_wallets(user_id, voice_balance)
    VALUES (_target_user, GREATEST(_amount, 0))
  ON CONFLICT (user_id) DO UPDATE
    SET voice_balance = GREATEST(_amount, 0), updated_at = now();
END; $$;
