
-- 1) Restrict SECURITY DEFINER functions to service_role / postgres only
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_translation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_purchased_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_add_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_subscription(uuid, text) FROM PUBLIC, anon, authenticated;

-- 2) Recreate admin_* without has_role() internal gate: access is now enforced
--    at the GRANT level (only service_role can execute) plus server-side email
--    check in the /api/admin route handler.
CREATE OR REPLACE FUNCTION public.admin_add_credits(_target_user uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.credit_wallets(user_id, purchased_balance)
    VALUES (_target_user, GREATEST(_amount,0))
  ON CONFLICT (user_id) DO UPDATE
    SET purchased_balance = GREATEST(public.credit_wallets.purchased_balance + _amount, 0),
        updated_at = now();
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_add_credits(uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz, subscribed boolean, sub_status text, current_period_end timestamptz, purchased_balance integer, translations_total bigint, translations_30d bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    COALESCE((SELECT COUNT(*) FROM public.translations_log tl WHERE tl.user_id = p.id), 0),
    COALESCE((SELECT COUNT(*) FROM public.translations_log tl WHERE tl.user_id = p.id AND tl.created_at > now() - interval '30 days'), 0)
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  LEFT JOIN public.credit_wallets w ON w.user_id = p.id
  ORDER BY p.created_at DESC;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_subscription(_target_user uuid, _action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _action = 'grant_lifetime' THEN
    INSERT INTO public.subscriptions(user_id, status, current_period_end, environment)
      VALUES (_target_user, 'active', now() + interval '100 years', 'admin')
    ON CONFLICT (user_id) DO UPDATE
      SET status='active', current_period_end=now()+interval '100 years', updated_at=now();
  ELSIF _action = 'grant_year' THEN
    INSERT INTO public.subscriptions(user_id, status, current_period_end, environment)
      VALUES (_target_user, 'active', now() + interval '1 year', 'admin')
    ON CONFLICT (user_id) DO UPDATE
      SET status='active', current_period_end=now()+interval '1 year', updated_at=now();
  ELSIF _action = 'cancel' THEN
    UPDATE public.subscriptions SET status='canceled', current_period_end=now(), updated_at=now()
      WHERE user_id = _target_user;
  ELSE
    RAISE EXCEPTION 'unknown action %', _action;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_subscription(uuid, text) FROM PUBLIC, anon, authenticated;

-- 3) Replace RLS policies that referenced has_role() with an inline subquery,
--    so has_role no longer needs EXECUTE for authenticated.
DROP POLICY IF EXISTS "admin read page_views" ON public.page_views;
CREATE POLICY "admin read page_views" ON public.page_views
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

DROP POLICY IF EXISTS "admin read ai_usage" ON public.ai_usage_log;
CREATE POLICY "admin read ai_usage" ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

-- 4) page_views: allow signed-in users to read their own rows, and allow
--    anon/authenticated to insert their own page view events (self-scoped).
CREATE POLICY "users read own page_views" ON public.page_views
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "anyone insert own page_views" ON public.page_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Ensure anon can insert (RLS allows it, GRANT must too)
GRANT INSERT ON public.page_views TO anon;
GRANT SELECT, INSERT ON public.page_views TO authenticated;
