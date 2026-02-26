-- Migración 013: Base y Polygon con wallet propia cada uno
-- Cada usuario puede vincular una dirección para Base y otra para Polygon.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wallet_address_base TEXT,
  ADD COLUMN IF NOT EXISTS wallet_address_polygon TEXT;

COMMENT ON COLUMN public.profiles.wallet_address_base IS 'Dirección 0x para depósitos/retiros USDC en Base';
COMMENT ON COLUMN public.profiles.wallet_address_polygon IS 'Dirección 0x para depósitos/retiros USDC en Polygon';

-- Actualizar solicitar_retiro_phantom: comprobar la wallet según la red
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
  v_wallet_linked TEXT;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  IF p_monto <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido'); END IF;
  IF p_red NOT IN ('solana','base','polygon') THEN RETURN jsonb_build_object('ok', false, 'error', 'Red no válida'); END IF;
  IF p_wallet_destino IS NULL OR trim(p_wallet_destino) = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'Indica tu wallet'); END IF;

  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_monto THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;

  IF p_red = 'solana' THEN
    SELECT wallet_address INTO v_wallet_linked FROM profiles WHERE id = v_user_id;
  ELSIF p_red = 'base' THEN
    SELECT COALESCE(wallet_address_base, wallet_address_evm) INTO v_wallet_linked FROM profiles WHERE id = v_user_id;
  ELSE
    SELECT COALESCE(wallet_address_polygon, wallet_address_evm) INTO v_wallet_linked FROM profiles WHERE id = v_user_id;
  END IF;

  IF v_wallet_linked IS NULL OR trim(v_wallet_linked) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Vincula tu wallet para ' || p_red || ' en el Cajero');
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
