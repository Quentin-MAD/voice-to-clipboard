CREATE TABLE public.app_appearance (
  app text NOT NULL,
  state text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (app, state)
);

GRANT SELECT ON public.app_appearance TO anon, authenticated;
GRANT ALL ON public.app_appearance TO service_role;
ALTER TABLE public.app_appearance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "published appearance is public"
  ON public.app_appearance FOR SELECT
  TO anon, authenticated
  USING (state = 'published');

CREATE POLICY "admins read appearance drafts"
  ON public.app_appearance FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "no client insert on app_appearance"
  ON public.app_appearance FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "no client update on app_appearance"
  ON public.app_appearance FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no client delete on app_appearance"
  ON public.app_appearance FOR DELETE TO anon, authenticated USING (false);

CREATE TABLE public.app_appearance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app text NOT NULL,
  config jsonb NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT ON public.app_appearance_history TO authenticated;
GRANT ALL ON public.app_appearance_history TO service_role;
ALTER TABLE public.app_appearance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read appearance history"
  ON public.app_appearance_history FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "no client insert on app_appearance_history"
  ON public.app_appearance_history FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "no client update on app_appearance_history"
  ON public.app_appearance_history FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no client delete on app_appearance_history"
  ON public.app_appearance_history FOR DELETE TO anon, authenticated USING (false);

CREATE INDEX idx_app_appearance_history_app ON public.app_appearance_history (app, created_at DESC);