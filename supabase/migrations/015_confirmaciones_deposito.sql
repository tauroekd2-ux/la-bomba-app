-- Migración 015: Confirmaciones de depósito por el usuario (monto enviado por red)
-- El usuario indica cuánto envió; el admin puede cruzar con el webhook o acreditar manualmente.

CREATE TABLE IF NOT EXISTS public.confirmaciones_deposito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  red TEXT NOT NULL CHECK (red IN ('solana','base','polygon')),
  monto DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','acreditado','rechazado')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_confirmaciones_deposito_user ON public.confirmaciones_deposito(user_id);
CREATE INDEX IF NOT EXISTS idx_confirmaciones_deposito_estado ON public.confirmaciones_deposito(estado);

ALTER TABLE public.confirmaciones_deposito ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own confirmaciones_deposito" ON public.confirmaciones_deposito;
CREATE POLICY "Users read own confirmaciones_deposito" ON public.confirmaciones_deposito FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users insert own confirmaciones_deposito" ON public.confirmaciones_deposito;
CREATE POLICY "Users insert own confirmaciones_deposito" ON public.confirmaciones_deposito FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Admin puede ver todas (para cruzar con depósitos entrantes)
DROP POLICY IF EXISTS "Admin read all confirmaciones_deposito" ON public.confirmaciones_deposito;
CREATE POLICY "Admin read all confirmaciones_deposito" ON public.confirmaciones_deposito FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.confirmar_deposito_usuario(
  p_red TEXT,
  p_monto DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  IF p_red NOT IN ('solana','base','polygon') THEN RETURN jsonb_build_object('ok', false, 'error', 'Red no válida'); END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido'); END IF;

  INSERT INTO confirmaciones_deposito (user_id, red, monto)
  VALUES (v_user_id, p_red, p_monto);

  RETURN jsonb_build_object('ok', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.confirmar_deposito_usuario TO authenticated;
