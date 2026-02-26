-- Migración 004: Buscar usuario por nombre (no por email)
-- Ejecutar en Supabase: SQL Editor → pegar → Run

-- 0. Eliminar versión anterior de enviar_fondos (por email)
DROP FUNCTION IF EXISTS public.enviar_fondos(TEXT, DECIMAL);

-- 1. RPC buscar usuario(s) por nombre (parcial, ILIKE)
CREATE OR REPLACE FUNCTION public.obtener_usuario_por_nombre(p_nombre TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $body$
DECLARE
  v_usuarios JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF trim(p_nombre) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Indica un nombre');
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name))
  INTO v_usuarios
  FROM (
    SELECT id, full_name FROM profiles
    WHERE id != auth.uid()
      AND full_name IS NOT NULL AND full_name != ''
      AND full_name ILIKE '%' || trim(p_nombre) || '%'
    ORDER BY full_name
    LIMIT 10
  ) p;

  IF v_usuarios IS NULL OR jsonb_array_length(v_usuarios) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no encontrado');
  END IF;
  RETURN jsonb_build_object('ok', true, 'usuarios', v_usuarios);
END;
$body$;

-- 2. RPC enviar fondos por ID (destinatario ya seleccionado)
CREATE OR REPLACE FUNCTION public.enviar_fondos(p_destinatario_id UUID, p_monto DECIMAL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $body$
DECLARE
  v_remitente_id UUID := auth.uid();
  v_balance_remitente DECIMAL(12,2);
  v_balance_destinatario DECIMAL(12,2);
BEGIN
  IF v_remitente_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF p_monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_destinatario_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no encontrado');
  END IF;
  IF p_destinatario_id = v_remitente_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes enviarte a ti mismo');
  END IF;

  SELECT balance INTO v_balance_remitente FROM profiles WHERE id = v_remitente_id;
  IF v_balance_remitente IS NULL OR v_balance_remitente < p_monto THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;

  UPDATE profiles SET balance = balance - p_monto, updated_at = NOW() WHERE id = v_remitente_id;
  UPDATE profiles SET balance = balance + p_monto, updated_at = NOW() WHERE id = p_destinatario_id;

  SELECT balance INTO v_balance_remitente FROM profiles WHERE id = v_remitente_id;
  SELECT balance INTO v_balance_destinatario FROM profiles WHERE id = p_destinatario_id;

  INSERT INTO transacciones (user_id, tipo, monto, saldo_despues, detalles)
  VALUES (v_remitente_id, 'transferencia_envio', -p_monto, v_balance_remitente,
    jsonb_build_object('destinatario_id', p_destinatario_id));
  INSERT INTO transacciones (user_id, tipo, monto, saldo_despues, detalles)
  VALUES (p_destinatario_id, 'transferencia_recibo', p_monto, v_balance_destinatario,
    jsonb_build_object('remitente_id', v_remitente_id));

  RETURN jsonb_build_object('ok', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.obtener_usuario_por_nombre TO authenticated;
-- enviar_fondos ya tiene GRANT; la nueva firma reemplaza la anterior
GRANT EXECUTE ON FUNCTION public.enviar_fondos(UUID, DECIMAL) TO authenticated;
