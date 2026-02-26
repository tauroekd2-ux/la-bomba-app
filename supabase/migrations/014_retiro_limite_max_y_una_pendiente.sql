-- Migración 014: Límite máximo por retiro ($50 USDC) y una sola solicitud pendiente
-- Comisión fija de $0.50 se aplica en frontend (netWithdraw = monto - 0.50); el monto enviado a la RPC es el bruto a descontar.

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
  IF p_monto > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Por seguridad, el límite máximo por transacción es de $50 USDC. Puedes realizar otra solicitud en cuanto esta sea procesada.');
  END IF;
  IF p_red NOT IN ('solana','base','polygon') THEN RETURN jsonb_build_object('ok', false, 'error', 'Red no válida'); END IF;
  IF p_wallet_destino IS NULL OR trim(p_wallet_destino) = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'Indica tu wallet'); END IF;

  IF EXISTS (SELECT 1 FROM retiros_phantom WHERE user_id = v_user_id AND estado = 'pendiente') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes una solicitud de retiro pendiente. Cuando sea procesada podrás crear otra.');
  END IF;

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
