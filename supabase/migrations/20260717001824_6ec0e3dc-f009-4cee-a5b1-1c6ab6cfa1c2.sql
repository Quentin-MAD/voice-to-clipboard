
-- Profils utilisateurs
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Abonnements (via Stripe)
CREATE TABLE public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'inactive', -- 'active' | 'inactive' | 'canceled' | 'past_due'
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sub read" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Solde de crédits (achats de packs cumulables)
CREATE TABLE public.credit_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  purchased_balance INT NOT NULL DEFAULT 0, -- crédits achetés restants
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_wallets TO authenticated;
GRANT ALL ON public.credit_wallets TO service_role;
ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wallet read" ON public.credit_wallets FOR SELECT USING (auth.uid() = user_id);

-- Journal des traductions (source de vérité pour quota mensuel + rate limit horaire)
CREATE TABLE public.translations_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL, -- 'free_monthly' | 'purchased_credit' | 'subscription'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX translations_log_user_time_idx ON public.translations_log (user_id, created_at DESC);
GRANT SELECT ON public.translations_log TO authenticated;
GRANT ALL ON public.translations_log TO service_role;
ALTER TABLE public.translations_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own log read" ON public.translations_log FOR SELECT USING (auth.uid() = user_id);

-- Trigger auto-création profil + wallet à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email) ON CONFLICT DO NOTHING;
  INSERT INTO public.credit_wallets (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.subscriptions (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Fonction atomique de consommation d'une traduction
-- Renvoie: (ok BOOLEAN, reason TEXT, remaining_free INT, remaining_purchased INT, subscribed BOOLEAN)
CREATE OR REPLACE FUNCTION public.consume_translation(_user_id UUID)
RETURNS TABLE (ok BOOLEAN, reason TEXT, remaining_free INT, remaining_purchased INT, subscribed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hourly_count INT;
  monthly_free_used INT;
  free_quota CONSTANT INT := 20;
  hourly_limit CONSTANT INT := 50;
  sub_active BOOLEAN;
  purchased INT;
  source TEXT;
BEGIN
  -- Rate limit anti-spam : 50/heure quoi qu'il arrive
  SELECT COUNT(*) INTO hourly_count
  FROM public.translations_log
  WHERE user_id = _user_id AND created_at > now() - INTERVAL '1 hour';
  IF hourly_count >= hourly_limit THEN
    RETURN QUERY SELECT false, 'hourly_limit', 0, 0, false;
    RETURN;
  END IF;

  -- Abonnement actif ?
  SELECT (status = 'active' AND (current_period_end IS NULL OR current_period_end > now()))
    INTO sub_active FROM public.subscriptions WHERE user_id = _user_id;
  sub_active := COALESCE(sub_active, false);

  IF sub_active THEN
    INSERT INTO public.translations_log (user_id, source_type) VALUES (_user_id, 'subscription');
    RETURN QUERY SELECT true, 'subscription', 0, 0, true;
    RETURN;
  END IF;

  -- Sinon : quota gratuit mensuel d'abord
  SELECT COUNT(*) INTO monthly_free_used
  FROM public.translations_log
  WHERE user_id = _user_id
    AND source_type = 'free_monthly'
    AND created_at > date_trunc('month', now());

  IF monthly_free_used < free_quota THEN
    INSERT INTO public.translations_log (user_id, source_type) VALUES (_user_id, 'free_monthly');
    RETURN QUERY SELECT true, 'free_monthly', (free_quota - monthly_free_used - 1), 0, false;
    RETURN;
  END IF;

  -- Sinon : crédits achetés
  SELECT purchased_balance INTO purchased FROM public.credit_wallets WHERE user_id = _user_id FOR UPDATE;
  purchased := COALESCE(purchased, 0);
  IF purchased > 0 THEN
    UPDATE public.credit_wallets SET purchased_balance = purchased - 1, updated_at = now() WHERE user_id = _user_id;
    INSERT INTO public.translations_log (user_id, source_type) VALUES (_user_id, 'purchased_credit');
    RETURN QUERY SELECT true, 'purchased_credit', 0, (purchased - 1), false;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, 'no_credits', 0, 0, false;
END; $$;

GRANT EXECUTE ON FUNCTION public.consume_translation(UUID) TO authenticated, service_role;

-- Fonction lecture statut utilisateur
CREATE OR REPLACE FUNCTION public.get_user_status(_user_id UUID)
RETURNS TABLE (
  subscribed BOOLEAN,
  free_remaining INT,
  purchased_balance INT,
  hourly_used INT,
  hourly_limit INT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  free_quota CONSTANT INT := 20;
  free_used INT;
BEGIN
  SELECT COUNT(*) INTO free_used FROM public.translations_log
    WHERE user_id = _user_id AND source_type = 'free_monthly'
      AND created_at > date_trunc('month', now());
  RETURN QUERY
  SELECT
    COALESCE((SELECT status = 'active' AND (current_period_end IS NULL OR current_period_end > now())
              FROM public.subscriptions WHERE user_id = _user_id), false),
    GREATEST(0, free_quota - free_used),
    COALESCE((SELECT purchased_balance FROM public.credit_wallets WHERE user_id = _user_id), 0),
    (SELECT COUNT(*)::INT FROM public.translations_log
       WHERE user_id = _user_id AND created_at > now() - INTERVAL '1 hour'),
    50;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_user_status(UUID) TO authenticated, service_role;
