GRANT SELECT ON public.app_appearance TO anon, authenticated;
GRANT ALL ON public.app_appearance TO service_role;
GRANT SELECT ON public.app_appearance_history TO authenticated;
GRANT ALL ON public.app_appearance_history TO service_role;