-- Migración 017: Auto-vincular confirmación al acreditar por webhook (evitar mismo envío dos veces) y cancelar

-- 1. acreditar_deposito_phantom: al acreditar por webhook, marcar una confirmación pendiente coincidente
--    (mismo user, red, monto, reciente) como acreditada para que el admin no acredite el mismo envío de nuevo.
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
  v_confirmacion_id UUID;
BEGIN
  IF p_tx_hash IS NULL OR trim(p_tx_hash) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tx_hash requerido');
  END IF;
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no identificado por wallet');
  END IF;

  -- Evitar mismo envío: tx_hash ya procesado = no acreditar de nuevo
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

  -- Vincular una confirmación pendiente coincidente (mismo user, red, monto, últimas 24h) para no duplicar en admin
  SELECT id INTO v_confirmacion_id
  FROM confirmaciones_deposito
  WHERE user_id = p_user_id AND red = p_red AND monto = p_monto AND estado = 'pendiente'
    AND created_at > NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_confirmacion_id IS NOT NULL THEN
    UPDATE confirmaciones_deposito SET estado = 'acreditado' WHERE id = v_confirmacion_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'balance', v_balance, 'user_id', p_user_id);
END;
$body$;

-- 2. Cancelar confirmación (solo admin): pasa pendiente -> rechazado
CREATE OR REPLACE FUNCTION public.cancelar_confirmacion_deposito(
  p_confirmacion_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_admin_ok BOOLEAN;
  v_updated INT;
BEGIN
  SELECT EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid()) INTO v_admin_ok;
  IF NOT v_admin_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  UPDATE confirmaciones_deposito
  SET estado = 'rechazado'
  WHERE id = p_confirmacion_id AND estado = 'pendiente';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Confirmación no encontrada o ya no está pendiente');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.cancelar_confirmacion_deposito TO authenticated;
