-- Explicitly deny all client-side writes on support_messages.
-- Inserts are performed exclusively server-side (service role) after the
-- caller's identity is verified, so user_id/email cannot be spoofed.

DROP POLICY IF EXISTS "no client insert on support_messages" ON public.support_messages;
CREATE POLICY "no client insert on support_messages"
  ON public.support_messages FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "no client update on support_messages" ON public.support_messages;
CREATE POLICY "no client update on support_messages"
  ON public.support_messages FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "no client delete on support_messages" ON public.support_messages;
CREATE POLICY "no client delete on support_messages"
  ON public.support_messages FOR DELETE TO anon, authenticated
  USING (false);

REVOKE INSERT, UPDATE, DELETE ON public.support_messages FROM anon, authenticated;
GRANT SELECT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;