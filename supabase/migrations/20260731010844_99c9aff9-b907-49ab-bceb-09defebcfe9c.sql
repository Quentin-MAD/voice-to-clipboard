CREATE TABLE IF NOT EXISTS public.internal_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.internal_config TO service_role;

ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no client access to internal_config"
  ON public.internal_config FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

INSERT INTO public.internal_config (key, value)
VALUES ('cleanup_cron_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_cleanup_unconfirmed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  secret text;
BEGIN
  SELECT value INTO secret FROM public.internal_config WHERE key = 'cleanup_cron_secret';
  IF secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://voice-to-clipboard.lovable.app/api/public/cleanup-unconfirmed',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cleanup-secret', secret),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_cleanup_unconfirmed() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('cleanup-unconfirmed-accounts')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-unconfirmed-accounts');

SELECT cron.schedule(
  'cleanup-unconfirmed-accounts',
  '*/30 * * * *',
  $$SELECT public.trigger_cleanup_unconfirmed();$$
);