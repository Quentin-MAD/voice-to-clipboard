
-- Explicit deny policies for writes on server-managed tables.
-- Writes are performed only by SECURITY DEFINER functions or service_role (which bypasses RLS).
-- These explicit policies document intent and satisfy security scanners.

-- credit_wallets: no direct writes from clients
CREATE POLICY "no client insert on credit_wallets" ON public.credit_wallets FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "no client update on credit_wallets" ON public.credit_wallets FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "no client delete on credit_wallets" ON public.credit_wallets FOR DELETE TO authenticated, anon USING (false);

-- subscriptions: no direct writes from clients
CREATE POLICY "no client insert on subscriptions" ON public.subscriptions FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "no client update on subscriptions" ON public.subscriptions FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "no client delete on subscriptions" ON public.subscriptions FOR DELETE TO authenticated, anon USING (false);

-- translations_log: no direct insert/delete from clients
CREATE POLICY "no client insert on translations_log" ON public.translations_log FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "no client delete on translations_log" ON public.translations_log FOR DELETE TO authenticated, anon USING (false);
