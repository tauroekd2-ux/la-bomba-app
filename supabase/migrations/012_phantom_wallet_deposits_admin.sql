-- Migración 012: Phantom Wallet - depósitos automáticos, retiros y panel admin
-- Requiere: direcciones maestras en Edge Function (Solana + EVM 0x)

-- 1. Perfil: wallets vinculadas (Solana y EVM para Base/Polygon)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS wallet_address_evm TEXT;

COMMENT ON COLUMN public.profiles.wallet_address IS 'Solana address (Phantom) para depósitos/retiros USDC';
COMMENT ON COLUMN public.profiles.wallet_address_evm IS 'EVM address 0x (Phantom Base/Polygon) para USDC';

-- 2. Tabla de retiros solicitados por usuarios (admin paga con Phantom)
CREATE TABLE IF NOT EXISTS public.retiros_phantom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  monto DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','procesado','rechazado')),
  wallet_destino TEXT NOT NULL,
  red TEXT NOT NULL CHECK (red IN ('solana','base','polygon')),
  tx_hash TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retiros_phantom_estado ON public.retiros_phantom(estado);
CREATE INDEX IF NOT EXISTS idx_retiros_phantom_user ON public.retiros_phantom(user_id);

-- 3. Log estricto: depósitos (webhook) y retiros (firmados por admin) + protección replay
CREATE TABLE IF NOT EXISTS public.transacciones_phantom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('deposito','retiro')),
  tx_hash TEXT NOT NULL UNIQUE,
  red TEXT NOT NULL CHECK (red IN ('solana','base','polygon')),
  wallet_from TEXT,
  wallet_to TEXT,
  monto DECIMAL(12,2) NOT NULL,
  token TEXT NOT NULL DEFAULT 'USDC',
  user_id UUID REFERENCES public.profiles(id),
  retiro_id UUID REFERENCES public.retiros_phantom(id),
  detalles JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transacciones_phantom_tx_hash ON public.transacciones_phantom(tx_hash);
CREATE INDEX IF NOT EXISTS idx_transacciones_phantom_user ON public.transacciones_phantom(user_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_phantom_retiro ON public.transacciones_phantom(retiro_id);

-- 4. Tipos de transacción para balance: añadir deposito_phantom
ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS transacciones_tipo_check;
ALTER TABLE public.transacciones ADD CONSTRAINT transacciones_tipo_check
  CHECK (tipo IN ('deposito','apuesta','premio','retiro','comision_retiro','transferencia_envio','transferencia_recibo','deposito_phantom'));

-- 5. RLS retiros_phantom: usuarios ven solo los suyos; admin puede ver todos y actualizar estado
ALTER TABLE public.retiros_phantom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own retiros" ON public.retiros_phantom;
CREATE POLICY "Users read own retiros" ON public.retiros_phantom FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users insert own retiro" ON public.retiros_phantom;
CREATE POLICY "Users insert own retiro" ON public.retiros_phantom FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Admin: solo el usuario con id en app_config (phantom_admin_id) puede SELECT todos y UPDATE
-- Usamos una tabla admin_roles para no hardcodear UUID en SQL
CREATE TABLE IF NOT EXISTS public.admin_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own admin_role" ON public.admin_roles;
CREATE POLICY "Users read own admin_role" ON public.admin_roles FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admin read all retiros" ON public.retiros_phantom;
CREATE POLICY "Admin read all retiros" ON public.retiros_phantom FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid()));
DROP POLICY IF EXISTS "Admin update retiros" ON public.retiros_phantom;
CREATE POLICY "Admin update retiros" ON public.retiros_phantom FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid()));

-- 6. RLS transacciones_phantom: usuarios ven solo las suyas (depósitos y retiros propios)
ALTER TABLE public.transacciones_phantom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own transacciones_phantom" ON public.transacciones_phantom;
CREATE POLICY "Users read own transacciones_phantom" ON public.transacciones_phantom FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admin read all transacciones_phantom" ON public.transacciones_phantom;
CREATE POLICY "Admin read all transacciones_phantom" ON public.transacciones_phantom FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid()));
-- Inserts solo desde Edge Function (service role; bypass RLS) o función acreditar_deposito_phantom

-- 7. Notificaciones de depósito para Realtime (frontend suscrito a INSERT por user_id)
CREATE TABLE IF NOT EXISTS public.deposit_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  monto DECIMAL(12,2) NOT NULL,
  red TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.deposit_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own deposit_notifications" ON public.deposit_notifications;
CREATE POLICY "Users read own deposit_notifications" ON public.deposit_notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_deposit_notifications_user ON public.deposit_notifications(user_id);

-- Acreditar depósito también inserta notificación (para Realtime)
CREATE OR REPLACE FUNCTION public.acreditar_deposito_phantom(
  p_tx_hash TEXT,
  p_red TEXT,
  p_wallet_from TEXT,
  p_wallet_to TEXT,
  p_monto DECIMAL,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_balance DECIMAL(12,2);
BEGIN
  IF p_tx_hash IS NULL OR trim(p_tx_hash) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tx_hash requerido');
  END IF;
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no identificado por wallet');
  END IF;

  IF EXISTS (SELECT 1 FROM transacciones_phantom WHERE tx_hash = p_tx_hash) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Replay: tx_hash ya procesado');
  END IF;

  UPDATE profiles SET balance = balance + p_monto, updated_at = NOW() WHERE id = p_user_id
  RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no encontrado');
  END IF;

  INSERT INTO transacciones (user_id, tipo, monto, saldo_despues, detalles)
  VALUES (p_user_id, 'deposito_phantom', p_monto, v_balance,
    jsonb_build_object('tx_hash', p_tx_hash, 'red', p_red, 'wallet_from', p_wallet_from));

  INSERT INTO transacciones_phantom (tipo, tx_hash, red, wallet_from, wallet_to, monto, user_id, detalles)
  VALUES ('deposito', p_tx_hash, p_red, p_wallet_from, p_wallet_to, p_monto, p_user_id,
    jsonb_build_object('saldo_despues', v_balance));

  INSERT INTO deposit_notifications (user_id, monto, red) VALUES (p_user_id, p_monto, p_red);

  RETURN jsonb_build_object('ok', true, 'balance', v_balance, 'user_id', p_user_id);
END;
$body$;

-- La Edge Function usará service role; no exponer a authenticated

-- 8. Función: marcar retiro como procesado (admin, desde app)
CREATE OR REPLACE FUNCTION public.marcar_retiro_phantom_procesado(
  p_retiro_id UUID,
  p_tx_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_retiro RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  SELECT * INTO v_retiro FROM retiros_phantom WHERE id = p_retiro_id AND estado = 'pendiente';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Retiro no encontrado o ya procesado');
  END IF;

  IF p_tx_hash IS NOT NULL AND trim(p_tx_hash) <> '' AND EXISTS (SELECT 1 FROM transacciones_phantom WHERE tx_hash = p_tx_hash) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Replay: tx_hash ya registrado');
  END IF;

  UPDATE retiros_phantom SET estado = 'procesado', tx_hash = nullif(trim(p_tx_hash), ''), processed_at = NOW() WHERE id = p_retiro_id;

  IF p_tx_hash IS NOT NULL AND trim(p_tx_hash) <> '' THEN
    INSERT INTO transacciones_phantom (tipo, tx_hash, red, wallet_to, monto, retiro_id, user_id, detalles)
    VALUES ('retiro', trim(p_tx_hash), v_retiro.red, v_retiro.wallet_destino, v_retiro.monto, p_retiro_id, v_retiro.user_id,
      jsonb_build_object('processed_by', auth.uid()));
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.marcar_retiro_phantom_procesado TO authenticated;

-- 9. Crear solicitud de retiro Phantom (usuario)
CREATE OR REPLACE FUNCTION public.solicitar_retiro_phantom(
  p_monto DECIMAL,
  p_red TEXT,
  p_wallet_destino TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance DECIMAL(12,2);
  v_retiro_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  IF p_monto <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido'); END IF;
  IF p_red NOT IN ('solana','base','polygon') THEN RETURN jsonb_build_object('ok', false, 'error', 'Red no válida'); END IF;
  IF p_wallet_destino IS NULL OR trim(p_wallet_destino) = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'Indica tu wallet'); END IF;

  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_monto THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;

  IF (p_red = 'solana' AND (SELECT wallet_address FROM profiles WHERE id = v_user_id) IS NULL) OR
     (p_red <> 'solana' AND (SELECT wallet_address_evm FROM profiles WHERE id = v_user_id) IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Vincula tu wallet Phantom en el Cajero');
  END IF;

  UPDATE profiles SET balance = balance - p_monto, updated_at = NOW() WHERE id = v_user_id;

  INSERT INTO transacciones (user_id, tipo, monto, saldo_despues, detalles)
  VALUES (v_user_id, 'retiro', -p_monto, v_balance - p_monto, jsonb_build_object('retiro_phantom', true, 'red', p_red));

  INSERT INTO retiros_phantom (user_id, monto, wallet_destino, red)
  VALUES (v_user_id, p_monto, trim(p_wallet_destino), p_red)
  RETURNING id INTO v_retiro_id;

  RETURN jsonb_build_object('ok', true, 'retiro_id', v_retiro_id);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.solicitar_retiro_phantom TO authenticated;

-- Para dar acceso admin a tu usuario, ejecuta una vez (sustituye TU_UUID por tu auth.users.id):
-- INSERT INTO public.admin_roles (user_id) VALUES ('TU_UUID') ON CONFLICT (user_id) DO NOTHING;
