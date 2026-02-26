-- Aprobar/marcar retiro como procesado desde enlace Telegram (mismo flujo que rechazar, con secret)
CREATE OR REPLACE FUNCTION public.procesar_retiro_por_webhook(
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

  UPDATE retiros_phantom SET estado = 'procesado', processed_at = NOW() WHERE id = p_retiro_id;

  RETURN jsonb_build_object('ok', true, 'user_id', v_retiro.user_id);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.procesar_retiro_por_webhook TO anon;
GRANT EXECUTE ON FUNCTION public.procesar_retiro_por_webhook TO authenticated;

COMMENT ON FUNCTION public.procesar_retiro_por_webhook IS 'Marca un retiro pendiente como procesado. Solo vía webhook con secret (enlace Aprobar en Telegram).';
