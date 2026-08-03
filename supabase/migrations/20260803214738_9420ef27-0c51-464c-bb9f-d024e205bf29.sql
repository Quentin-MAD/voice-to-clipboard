-- Explicit deny-all write policies on user_roles (prevents privilege escalation)
CREATE POLICY "no client insert on user_roles"
  ON public.user_roles FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "no client update on user_roles"
  ON public.user_roles FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no client delete on user_roles"
  ON public.user_roles FOR DELETE TO anon, authenticated USING (false);

-- Explicit deny-all update policy on translations_log
CREATE POLICY "no client update on translations_log"
  ON public.translations_log FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);