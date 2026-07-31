DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_appearance'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_appearance;
  END IF;
END
$$;