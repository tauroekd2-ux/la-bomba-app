-- Migración 010: 30 números aleatorios del 0 al 99
-- Cada partida usa 30 números únicos 0-99, mostrados en orden aleatorio
-- Ejecutar en Supabase: SQL Editor → pegar → Run

-- 1. Añadir columna numeros_juego (array de 30 enteros 0-99)
ALTER TABLE public.partidas ADD COLUMN IF NOT EXISTS numeros_juego JSONB;

-- 2. Actualizar constraint numero_prohibido: 0-99
ALTER TABLE public.partidas DROP CONSTRAINT IF EXISTS partidas_numero_prohibido_check;
ALTER TABLE public.partidas ADD CONSTRAINT partidas_numero_prohibido_check
  CHECK (numero_prohibido >= 0 AND numero_prohibido <= 99);

-- 3. Función auxiliar: generar 30 números únicos 0-99 en orden aleatorio
CREATE OR REPLACE FUNCTION generar_30_numeros()
RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_agg(n::integer) FROM (
    SELECT n FROM generate_series(0, 99) AS n ORDER BY random() LIMIT 30
  ) t;
$$;

-- 4. Actualizar crear_partida
CREATE OR REPLACE FUNCTION public.crear_partida(p_apuesta DECIMAL DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance DECIMAL(12,2);
  v_room_code TEXT;
  v_numeros_juego JSONB;
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

  v_numeros_juego := generar_30_numeros();
  v_numero_prohibido := (v_numeros_juego->>(floor(random() * 29.99)::integer))::integer;

  INSERT INTO partidas (room_code, host_id, apuesta, numero_prohibido, numeros_juego)
  VALUES (v_room_code, v_user_id, p_apuesta, v_numero_prohibido, v_numeros_juego)
  RETURNING id INTO v_partida_id;

  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id, 'room_code', v_room_code);
END;
$body$;

-- 5. Actualizar buscar_partida
CREATE OR REPLACE FUNCTION public.buscar_partida(p_apuesta DECIMAL DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance DECIMAL(12,2);
  v_partida RECORD;
  v_room_code TEXT;
  v_numeros_juego JSONB;
  v_numero_prohibido INTEGER;
  v_partida_id UUID;
  v_existing INT;
  v_turno UUID;
  v_apuesta_norm DECIMAL(12,2);
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;

  v_apuesta_norm := ROUND(p_apuesta::numeric, 2);

  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_apuesta_norm THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;

  SELECT * INTO v_partida FROM partidas
  WHERE estado = 'esperando'
    AND COALESCE(matchmaking, false) = true
    AND ROUND(apuesta::numeric, 2) = v_apuesta_norm
    AND host_id != v_user_id
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
    SELECT COUNT(*) INTO v_existing FROM partidas WHERE room_code = v_room_code;
    EXIT WHEN v_existing = 0;
  END LOOP;
  v_numeros_juego := generar_30_numeros();
  v_numero_prohibido := (v_numeros_juego->>(floor(random() * 29.99)::integer))::integer;
  INSERT INTO partidas (room_code, host_id, apuesta, numero_prohibido, numeros_juego, matchmaking)
  VALUES (v_room_code, v_user_id, v_apuesta_norm, v_numero_prohibido, v_numeros_juego, true)
  RETURNING id INTO v_partida_id;
  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id, 'esperando', true);
END;
$body$;

-- 6. Actualizar reiniciar_partida
CREATE OR REPLACE FUNCTION public.reiniciar_partida(p_partida_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_partida RECORD;
  v_turno UUID;
  v_balance_host DECIMAL(12,2);
  v_balance_guest DECIMAL(12,2);
  v_numeros_juego JSONB;
  v_numero_prohibido INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_partida FROM partidas WHERE id = p_partida_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partida no encontrada');
  END IF;

  IF v_partida.guest_id IS NULL OR v_partida.room_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo en partidas con amigos');
  END IF;

  IF v_partida.estado != 'finalizada' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La partida aún no ha terminado');
  END IF;

  IF v_user_id NOT IN (v_partida.host_id, v_partida.guest_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No participante');
  END IF;

  SELECT balance INTO v_balance_host FROM profiles WHERE id = v_partida.host_id;
  SELECT balance INTO v_balance_guest FROM profiles WHERE id = v_partida.guest_id;
  IF v_balance_host IS NULL OR v_balance_host < v_partida.apuesta THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente (host)');
  END IF;
  IF v_balance_guest IS NULL OR v_balance_guest < v_partida.apuesta THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tu amigo no tiene saldo suficiente');
  END IF;

  v_numeros_juego := generar_30_numeros();
  v_numero_prohibido := (v_numeros_juego->>(floor(random() * 29.99)::integer))::integer;
  v_turno := CASE WHEN random() < 0.5 THEN v_partida.host_id ELSE v_partida.guest_id END;

  UPDATE partidas
  SET estado = 'jugando',
      ganador_id = NULL,
      turno_actual = v_turno,
      numeros_usados = '[]'::jsonb,
      numero_prohibido = v_numero_prohibido,
      numeros_juego = v_numeros_juego,
      updated_at = NOW()
  WHERE id = p_partida_id;

  RETURN jsonb_build_object('ok', true, 'partida_id', p_partida_id);
END;
$body$;

-- 7. Actualizar elegir_numero: validar usando numeros_juego
CREATE OR REPLACE FUNCTION public.elegir_numero(p_partida_id UUID, p_numero INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partida RECORD;
  v_numeros JSONB;
  v_ganador UUID;
  v_perdedor UUID;
  v_validos JSONB;
BEGIN
  SELECT * INTO v_partida FROM partidas WHERE id = p_partida_id AND estado = 'jugando';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partida no válida');
  END IF;

  IF auth.uid() != v_partida.turno_actual THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No es tu turno');
  END IF;

  v_validos := COALESCE(v_partida.numeros_juego, to_jsonb(ARRAY(SELECT generate_series(20, 49))));
  IF p_numero < 0 OR p_numero > 99 OR NOT (v_validos @> to_jsonb(array[p_numero])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Número inválido');
  END IF;

  v_numeros := COALESCE(v_partida.numeros_usados, '[]'::jsonb);
  IF v_numeros @> to_jsonb(array[p_numero]) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Número ya usado');
  END IF;

  v_numeros := v_numeros || to_jsonb(array[p_numero]);

  IF p_numero = v_partida.numero_prohibido THEN
    v_perdedor := auth.uid();
    v_ganador := CASE WHEN v_partida.host_id = auth.uid() THEN v_partida.guest_id ELSE v_partida.host_id END;
    PERFORM procesar_victoria(p_partida_id, v_ganador);
    UPDATE partidas SET numeros_usados = v_numeros, estado = 'finalizada', ganador_id = v_ganador, updated_at = NOW() WHERE id = p_partida_id;
    RETURN jsonb_build_object('ok', true, 'bomba', true, 'ganador_id', v_ganador);
  ELSE
    UPDATE partidas SET numeros_usados = v_numeros, turno_actual = CASE WHEN v_partida.host_id = auth.uid() THEN v_partida.guest_id ELSE v_partida.host_id END, updated_at = NOW() WHERE id = p_partida_id;
    RETURN jsonb_build_object('ok', true, 'bomba', false);
  END IF;
END;
$$;
