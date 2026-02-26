-- Migración 016: Acreditación manual de depósitos (admin)
-- Permite al admin acreditar el saldo cuando el usuario confirmó depósito y el webhook no detectó la tx.

CREATE OR REPLACE FUNCTION public.acreditar_deposito_manual(
  p_confirmacion_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_admin_ok BOOLEAN;
  v_user_id UUID;
  v_red TEXT;
  v_monto DECIMAL(12,2);
  v_balance DECIMAL(12,2);
  v_tx_hash TEXT;
BEGIN
  -- Solo admin puede acreditar manualmente
  SELECT EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid()) INTO v_admin_ok;
  IF NOT v_admin_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  SELECT user_id, red, monto INTO v_user_id, v_red, v_monto
  FROM confirmaciones_deposito
  WHERE id = p_confirmacion_id AND estado = 'pendiente';

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Confirmación no encontrada o ya procesada');
  END IF;

  v_tx_hash := 'manual-' || p_confirmacion_id::text;

  UPDATE profiles SET balance = balance + v_monto, updated_at = NOW() WHERE id = v_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO transacciones (user_id, tipo, monto, saldo_despues, detalles)
  VALUES (v_user_id, 'deposito_phantom', v_monto, v_balance,
    jsonb_build_object('red', v_red, 'manual', true, 'confirmacion_id', p_confirmacion_id));

  INSERT INTO transacciones_phantom (tipo, tx_hash, red, wallet_from, wallet_to, monto, user_id, detalles)
  VALUES ('deposito', v_tx_hash, v_red, NULL, NULL, v_monto, v_user_id,
    jsonb_build_object('saldo_despues', v_balance, 'manual', true));

  UPDATE confirmaciones_deposito SET estado = 'acreditado' WHERE id = p_confirmacion_id;

  INSERT INTO deposit_notifications (user_id, monto, red) VALUES (v_user_id, v_monto, v_red);

  RETURN jsonb_build_object('ok', true, 'balance', v_balance, 'user_id', v_user_id);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.acreditar_deposito_manual TO authenticated;
