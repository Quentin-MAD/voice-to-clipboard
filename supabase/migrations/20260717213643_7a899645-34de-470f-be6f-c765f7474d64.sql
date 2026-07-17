
-- =========== ROLES ===========
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own roles read" ON public.user_roles;
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- =========== PAGE VIEWS ===========
CREATE TABLE IF NOT EXISTS public.page_views (
  id bigserial PRIMARY KEY,
  path text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.page_views TO service_role;
GRANT SELECT ON public.page_views TO authenticated;
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin read page_views" ON public.page_views;
CREATE POLICY "admin read page_views" ON public.page_views FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_page_views_created ON public.page_views(created_at DESC);

-- =========== AI USAGE LOG ===========
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  model text NOT NULL,
  operation text NOT NULL,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  cost_credits numeric(12,6) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_usage_log TO service_role;
GRANT SELECT ON public.ai_usage_log TO authenticated;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin read ai_usage" ON public.ai_usage_log;
CREATE POLICY "admin read ai_usage" ON public.ai_usage_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON public.ai_usage_log(created_at DESC);

-- =========== ADMIN RPCs ===========
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  user_id uuid,
  email text,
  created_at timestamptz,
  subscribed boolean,
  sub_status text,
  current_period_end timestamptz,
  purchased_balance integer,
  translations_total bigint,
  translations_30d bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
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

CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  _target_user uuid,
  _action text  -- 'grant_lifetime' | 'grant_year' | 'cancel'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
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

CREATE OR REPLACE FUNCTION public.admin_add_credits(_target_user uuid, _amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.credit_wallets(user_id, purchased_balance)
    VALUES (_target_user, GREATEST(_amount,0))
  ON CONFLICT (user_id) DO UPDATE
    SET purchased_balance = GREATEST(public.credit_wallets.purchased_balance + _amount, 0),
        updated_at = now();
END; $$;

-- Ensure single-row per user for subscriptions upsert above (already true in schema, but be safe)
DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- =========== Grant admin to Quentin ===========
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE email = 'rossetquentin26@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
