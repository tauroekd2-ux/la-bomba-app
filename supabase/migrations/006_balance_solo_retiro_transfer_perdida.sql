-- Migración 006: Los fondos SOLO se restan al retirar, enviar a otro usuario o perder la partida
-- NO se restan al crear/unirse a partida (solo al perder)
-- Ejecutar en Supabase: SQL Editor → pegar → Run

-- 1. procesar_victoria: restar balance SOLO al perdedor; ganador recibe la apuesta del perdedor
CREATE OR REPLACE FUNCTION public.procesar_victoria(
  p_partida_id UUID,
  p_ganador_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_partida RECORD;
  v_apuesta DECIMAL(12,2);
  v_perdedor_id UUID;
  v_balance_ganador DECIMAL(12,2);
  v_balance_perdedor DECIMAL(12,2);
BEGIN
  SELECT * INTO v_partida FROM partidas WHERE id = p_partida_id AND estado = 'jugando';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partida no válida');
  END IF;

  IF p_ganador_id NOT IN (v_partida.host_id, v_partida.guest_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No participante');
  END IF;

  v_apuesta := v_partida.apuesta;
  v_perdedor_id := CASE WHEN p_ganador_id = v_partida.host_id THEN v_partida.guest_id ELSE v_partida.host_id END;

  -- Perdedor: restar apuesta (única forma de perder fondos por partida)
  UPDATE profiles SET balance = balance - v_apuesta, updated_at = NOW() WHERE id = v_perdedor_id
  RETURNING balance INTO v_balance_perdedor;

  -- Ganador: sumar apuesta del perdedor
  UPDATE profiles SET balance = balance + v_apuesta, updated_at = NOW() WHERE id = p_ganador_id
  RETURNING balance INTO v_balance_ganador;

  -- Registrar transacciones
  INSERT INTO transacciones (user_id, tipo, monto, saldo_despues, partida_id, detalles)
  VALUES (v_perdedor_id, 'apuesta', -v_apuesta, v_balance_perdedor, p_partida_id, '{"tipo":"perdida"}'::jsonb);

  INSERT INTO transacciones (user_id, tipo, monto, saldo_despues, partida_id, detalles)
  VALUES (p_ganador_id, 'premio', v_apuesta, v_balance_ganador, p_partida_id, '{"tipo":"victoria"}'::jsonb);

  UPDATE partidas SET estado = 'finalizada', ganador_id = p_ganador_id, updated_at = NOW() WHERE id = p_partida_id;

  RETURN jsonb_build_object('ok', true, 'premio', v_apuesta, 'balance', v_balance_ganador);
END;
$body$;

-- 2. crear_partida: NO restar balance (solo verificar saldo)
CREATE OR REPLACE FUNCTION public.crear_partida(p_apuesta DECIMAL DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance DECIMAL(12,2);
  v_room_code TEXT;
  v_numero_prohibido INTEGER;
  v_partida_id UUID;
  v_existing INT;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;

  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_apuesta THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;

  LOOP
    v_room_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 5));
    SELECT COUNT(*) INTO v_existing FROM partidas WHERE room_code = v_room_code AND estado = 'esperando';
    EXIT WHEN v_existing = 0;
  END LOOP;

  v_numero_prohibido := 20 + floor(random() * 31)::integer;

  INSERT INTO partidas (room_code, host_id, apuesta, numero_prohibido)
  VALUES (v_room_code, v_user_id, p_apuesta, v_numero_prohibido)
  RETURNING id INTO v_partida_id;

  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id, 'room_code', v_room_code);
END;
$body$;

-- 3. unirse_partida: NO restar balance (solo verificar saldo)
CREATE OR REPLACE FUNCTION public.unirse_partida(p_room_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_partida RECORD;
  v_balance DECIMAL(12,2);
  v_turno UUID;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;

  SELECT * INTO v_partida FROM partidas WHERE room_code = upper(p_room_code) AND estado = 'esperando';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sala no encontrada o ya iniciada');
  END IF;

  IF v_partida.host_id = v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes unirte a tu propia sala');
  END IF;

  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_partida.apuesta THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;

  v_turno := CASE WHEN random() < 0.5 THEN v_partida.host_id ELSE v_user_id END;

  UPDATE partidas SET guest_id = v_user_id, estado = 'jugando', turno_actual = v_turno, updated_at = NOW() WHERE id = v_partida.id;

  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida.id, 'tu_turno', v_turno = v_user_id);
END;
$body$;

-- 4. buscar_partida: NO restar balance (solo verificar saldo)
CREATE OR REPLACE FUNCTION public.buscar_partida(p_apuesta DECIMAL DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance DECIMAL(12,2);
  v_partida RECORD;
  v_room_code TEXT;
  v_numero_prohibido INTEGER;
  v_partida_id UUID;
  v_existing INT;
  v_turno UUID;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;

  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_apuesta THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;

  SELECT * INTO v_partida FROM partidas
  WHERE estado = 'esperando' AND apuesta = p_apuesta AND host_id != v_user_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    v_turno := CASE WHEN random() < 0.5 THEN v_partida.host_id ELSE v_user_id END;
    UPDATE partidas SET guest_id = v_user_id, estado = 'jugando', turno_actual = v_turno, updated_at = NOW() WHERE id = v_partida.id;
    RETURN jsonb_build_object('ok', true, 'partida_id', v_partida.id, 'esperando', false, 'tu_turno', v_turno = v_user_id);
  END IF;

  LOOP
    v_room_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 5));
    SELECT COUNT(*) INTO v_existing FROM partidas WHERE room_code = v_room_code AND estado = 'esperando';
    EXIT WHEN v_existing = 0;
  END LOOP;
  v_numero_prohibido := 20 + floor(random() * 31)::integer;
  INSERT INTO partidas (room_code, host_id, apuesta, numero_prohibido)
  VALUES (v_room_code, v_user_id, p_apuesta, v_numero_prohibido)
  RETURNING id INTO v_partida_id;
  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id, 'esperando', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.crear_partida TO authenticated;
GRANT EXECUTE ON FUNCTION public.unirse_partida TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_partida TO authenticated;
