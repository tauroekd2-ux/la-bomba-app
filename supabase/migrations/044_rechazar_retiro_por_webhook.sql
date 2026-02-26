-- Rechazar retiro desde webhook Telegram (devuelve saldo al usuario)
CREATE OR REPLACE FUNCTION public.rechazar_retiro_por_webhook(
  p_retiro_id UUID,
  p_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_secret TEXT;
  v_retiro RECORD;
  v_balance DECIMAL(12,2);
BEGIN
  SELECT value INTO v_secret FROM app_config WHERE key = 'telegram_webhook_secret';
  IF v_secret IS NULL OR v_secret <> p_secret OR trim(p_secret) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Secret inválido');
  END IF;

  SELECT id, user_id, monto, red, estado INTO v_retiro
  FROM retiros_phantom
  WHERE id = p_retiro_id AND estado = 'pendiente';

  IF v_retiro.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Retiro no encontrado o ya procesado/rechazado');
  END IF;

  UPDATE profiles SET balance = balance + v_retiro.monto, updated_at = NOW() WHERE id = v_retiro.user_id
  RETURNING balance INTO v_balance;

  INSERT INTO transacciones (user_id, tipo, monto, saldo_despues, detalles)
  VALUES (v_retiro.user_id, 'premio', v_retiro.monto, v_balance,
    jsonb_build_object('retiro_rechazado', true, 'retiro_id', p_retiro_id, 'red', v_retiro.red));

  UPDATE retiros_phantom SET estado = 'rechazado' WHERE id = p_retiro_id;

  RETURN jsonb_build_object('ok', true, 'user_id', v_retiro.user_id, 'balance', v_balance);
END;
$body$;

COMMENT ON FUNCTION public.rechazar_retiro_por_webhook IS 'Rechaza un retiro pendiente y devuelve el monto al saldo del usuario. Solo vía webhook con secret.';
