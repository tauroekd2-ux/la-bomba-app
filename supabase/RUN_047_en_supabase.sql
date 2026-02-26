-- Ejecuta en Supabase: SQL Editor → New query → Pegar todo → Run
-- Para que al confirmar depósito se devuelva confirmacion_id y el front pueda enviar a Telegram automáticamente.

CREATE OR REPLACE FUNCTION public.confirmar_deposito_usuario(
  p_red TEXT,
  p_monto DECIMAL,
  p_tx_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_tx TEXT := NULLIF(TRIM(p_tx_hash), '');
  v_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  IF p_red NOT IN ('solana','base','polygon') THEN RETURN jsonb_build_object('ok', false, 'error', 'Red no válida'); END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido'); END IF;
  IF v_tx IS NULL OR length(v_tx) < 10 THEN RETURN jsonb_build_object('ok', false, 'error', 'Transacción Hash obligatorio'); END IF;

  INSERT INTO confirmaciones_deposito (user_id, red, monto, tx_hash)
  VALUES (v_user_id, p_red, p_monto, v_tx)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'confirmacion_id', v_id);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.confirmar_deposito_usuario(TEXT, DECIMAL, TEXT) TO authenticated;
