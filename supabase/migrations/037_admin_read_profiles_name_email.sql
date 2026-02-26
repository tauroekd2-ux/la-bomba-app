-- Admin puede leer full_name y email de profiles (para panel retiros Phantom y similares)
DROP POLICY IF EXISTS "Admin read profiles name email" ON public.profiles;
CREATE POLICY "Admin read profiles name email" ON public.profiles
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid()));
