-- Migración 043: Webhook Telegram admin (acreditar/rechazar desde bot) + vista estadísticas dinero
-- El proxy llama a estas funciones con un secret guardado en app_config.

-- 1. Tabla app_config para secretos (webhook Telegram admin)
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
-- Solo service_role o funciones definer pueden leer; no exponer a anon/authenticated
DROP POLICY IF EXISTS "No public read app_config" ON public.app_config;
CREATE POLICY "No public read app_config" ON public.app_config FOR SELECT USING (false);

-- Insertar clave por defecto para webhook (el proxy usará TELEGRAM_WEBHOOK_SECRET en .env; aquí un placeholder)
INSERT INTO public.app_config (key, value) VALUES ('telegram_webhook_secret', 'cambiar-en-dashboard-o-env')
ON CONFLICT (key) DO NOTHING;

-- 2. Acreditar depósito desde webhook (proxy con secret)
CREATE OR REPLACE FUNCTION public.acreditar_deposito_por_webhook(
  p_confirmacion_id UUID,
  p_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_secret TEXT;
  v_user_id UUID;
  v_red TEXT;
  v_monto DECIMAL(12,2);
  v_balance DECIMAL(12,2);
  v_tx_hash TEXT;
BEGIN
  SELECT value INTO v_secret FROM app_config WHERE key = 'telegram_webhook_secret';
  IF v_secret IS NULL OR v_secret <> p_secret OR trim(p_secret) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Secret inválido');
  END IF;

  SELECT user_id, red, monto INTO v_user_id, v_red, v_monto
  FROM confirmaciones_deposito
  WHERE id = p_confirmacion_id AND estado = 'pendiente';

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Confirmación no encontrada o ya procesada');
  END IF;

  v_tx_hash := 'webhook-' || p_confirmacion_id::text;

  UPDATE profiles SET balance = balance + v_monto, updated_at = NOW() WHERE id = v_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO transacciones (user_id, tipo, monto, saldo_despues, detalles)
  VALUES (v_user_id, 'deposito_phantom', v_monto, v_balance,
    jsonb_build_object('red', v_red, 'webhook_telegram', true, 'confirmacion_id', p_confirmacion_id));

  INSERT INTO transacciones_phantom (tipo, tx_hash, red, wallet_from, wallet_to, monto, user_id, detalles)
  VALUES ('deposito', v_tx_hash, v_red, NULL, NULL, v_monto, v_user_id,
    jsonb_build_object('saldo_despues', v_balance, 'webhook_telegram', true));

  UPDATE confirmaciones_deposito SET estado = 'acreditado' WHERE id = p_confirmacion_id;

  INSERT INTO deposit_notifications (user_id, monto, red) VALUES (v_user_id, v_monto, v_red);

  RETURN jsonb_build_object('ok', true, 'balance', v_balance, 'user_id', v_user_id);
END;
$body$;

-- 3. Cancelar confirmación desde webhook
CREATE OR REPLACE FUNCTION public.cancelar_confirmacion_por_webhook(
  p_confirmacion_id UUID,
  p_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_secret TEXT;
  v_updated INT;
BEGIN
  SELECT value INTO v_secret FROM app_config WHERE key = 'telegram_webhook_secret';
  IF v_secret IS NULL OR v_secret <> p_secret OR trim(p_secret) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Secret inválido');
  END IF;

  UPDATE confirmaciones_deposito
  SET estado = 'rechazado'
  WHERE id = p_confirmacion_id AND estado = 'pendiente';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Confirmación no encontrada o ya no pendiente');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$body$;

-- 4. Función estadísticas: total USDC ingresado, retirado y ganancias (solo admin)
CREATE OR REPLACE FUNCTION public.admin_estadisticas_dinero()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_total_dep DECIMAL(12,2);
  v_total_ret DECIMAL(12,2);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_total_dep FROM confirmaciones_deposito WHERE estado = 'acreditado';
  SELECT COALESCE(SUM(monto), 0) INTO v_total_ret FROM retiros_phantom WHERE estado = 'procesado';

  RETURN jsonb_build_object(
    'ok', true,
    'total_depositos_usdc', v_total_dep,
    'total_retiros_usdc', v_total_ret,
    'ganancias_usdc', v_total_dep - v_total_ret
  );
END;
$body$;

GRANT EXECUTE ON FUNCTION public.admin_estadisticas_dinero TO authenticated;

COMMENT ON TABLE public.app_config IS 'Configuración interna (secret webhook Telegram). No exponer a clientes.';
COMMENT ON FUNCTION public.admin_estadisticas_dinero IS 'Totales depósitos acreditados, retiros procesados y ganancias. Solo admin.';
