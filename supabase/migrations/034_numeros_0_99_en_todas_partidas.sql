-- Arenas: 30 números variables del 0 al 99 en todas las partidas (matchmaking, amigos, reinicio)

-- 1. buscar_partida (matchmaking): generar numeros_juego 0-99 y numero_prohibido de ese set
CREATE OR REPLACE FUNCTION public.buscar_partida(p_apuesta DECIMAL DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance DECIMAL(12,2);
  v_apuesta_norm DECIMAL(12,2);
  v_otro RECORD;
  v_room_code TEXT;
  v_numeros_juego JSONB;
  v_numero_prohibido INTEGER;
  v_partida_id UUID;
  v_existing INT;
  v_turno UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM cerrar_partidas_abandonadas();

  v_apuesta_norm := ROUND(GREATEST(1, LEAST(5, (p_apuesta::numeric))), 2);

  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_apuesta_norm THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;

  DELETE FROM matchmaking_queue WHERE created_at < NOW() - INTERVAL '2 minutes';

  SELECT * INTO v_otro FROM matchmaking_queue
  WHERE (apuesta::numeric(12,2)) = (v_apuesta_norm::numeric(12,2))
    AND user_id != v_user_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    DELETE FROM matchmaking_queue WHERE user_id = v_otro.user_id;

    LOOP
      v_room_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 5));
      SELECT COUNT(*) INTO v_existing FROM partidas WHERE room_code = v_room_code;
      EXIT WHEN v_existing = 0;
    END LOOP;
    v_numeros_juego := generar_30_numeros();
    v_numero_prohibido := (v_numeros_juego->>(floor(random() * 30)::integer))::integer;
    v_turno := CASE WHEN random() < 0.5 THEN v_otro.user_id ELSE v_user_id END;

    INSERT INTO partidas (room_code, host_id, guest_id, apuesta, numero_prohibido, numeros_juego, estado, turno_actual, matchmaking)
    VALUES (v_room_code, v_otro.user_id, v_user_id, v_apuesta_norm, v_numero_prohibido, v_numeros_juego, 'jugando', v_turno, true)
    RETURNING id INTO v_partida_id;

    RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id, 'esperando', false, 'tu_turno', v_turno = v_user_id);
  END IF;

  INSERT INTO matchmaking_queue (user_id, apuesta)
  VALUES (v_user_id, v_apuesta_norm)
  ON CONFLICT (user_id) DO UPDATE SET apuesta = EXCLUDED.apuesta, created_at = NOW();

  RETURN jsonb_build_object('ok', true, 'esperando', true);
END;
$body$;

-- 2. reiniciar_partida: usar numeros_juego 0-99 y numero_prohibido de ese set
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

  UPDATE partidas
  SET host_quiere_revancha = CASE WHEN host_id = v_user_id THEN true ELSE host_quiere_revancha END,
      guest_quiere_revancha = CASE WHEN guest_id = v_user_id THEN true ELSE guest_quiere_revancha END,
      updated_at = NOW()
  WHERE id = p_partida_id
  RETURNING * INTO v_partida;

  IF v_partida.host_quiere_revancha AND v_partida.guest_quiere_revancha THEN
    v_numeros_juego := generar_30_numeros();
    v_numero_prohibido := (v_numeros_juego->>(floor(random() * 30)::integer))::integer;
    v_turno := CASE WHEN random() < 0.5 THEN v_partida.host_id ELSE v_partida.guest_id END;

    UPDATE partidas
    SET estado = 'jugando',
        ganador_id = NULL,
        turno_actual = v_turno,
        numeros_usados = '[]'::jsonb,
        numero_prohibido = v_numero_prohibido,
        numeros_juego = v_numeros_juego,
        host_quiere_revancha = false,
        guest_quiere_revancha = false,
        updated_at = NOW()
    WHERE id = p_partida_id;

    RETURN jsonb_build_object('ok', true, 'reiniciado', true, 'partida_id', p_partida_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'reiniciado', false);
END;
$body$;

-- 3. elegir_numero: fallback cuando numeros_juego es null (partidas antiguas) aceptar 0-99
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
  v_solo_queda_bomba BOOLEAN;
BEGIN
  SELECT * INTO v_partida FROM partidas WHERE id = p_partida_id AND estado = 'jugando';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partida no válida');
  END IF;

  IF auth.uid() != v_partida.turno_actual THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No es tu turno');
  END IF;

  v_validos := COALESCE(v_partida.numeros_juego, to_jsonb(ARRAY(SELECT generate_series(0, 99))));
  IF p_numero < 0 OR p_numero > 99 OR NOT (v_validos @> to_jsonb(array[p_numero])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Número inválido');
  END IF;

  v_numeros := COALESCE(v_partida.numeros_usados, '[]'::jsonb);
  IF v_numeros @> to_jsonb(array[p_numero]) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Número ya usado');
  END IF;

  v_numeros := v_numeros || to_jsonb(array[p_numero]);
  v_solo_queda_bomba := (jsonb_array_length(v_numeros) >= 29);

  IF p_numero = v_partida.numero_prohibido THEN
    v_perdedor := auth.uid();
    v_ganador := CASE WHEN v_partida.host_id = auth.uid() THEN v_partida.guest_id ELSE v_partida.host_id END;
    PERFORM procesar_victoria(p_partida_id, v_ganador);
    UPDATE partidas SET numeros_usados = v_numeros, estado = 'finalizada', ganador_id = v_ganador, updated_at = NOW() WHERE id = p_partida_id;
    RETURN jsonb_build_object('ok', true, 'bomba', true, 'ganador_id', v_ganador);
  ELSIF v_solo_queda_bomba THEN
    v_ganador := auth.uid();
    v_perdedor := CASE WHEN v_partida.host_id = auth.uid() THEN v_partida.guest_id ELSE v_partida.host_id END;
    PERFORM procesar_victoria(p_partida_id, v_ganador);
    UPDATE partidas SET numeros_usados = v_numeros, estado = 'finalizada', ganador_id = v_ganador, updated_at = NOW() WHERE id = p_partida_id;
    RETURN jsonb_build_object('ok', true, 'bomba', true, 'ultimo_numero', true, 'ganador_id', v_ganador, 'numero_prohibido', v_partida.numero_prohibido);
  ELSE
    UPDATE partidas SET numeros_usados = v_numeros, turno_actual = CASE WHEN v_partida.host_id = auth.uid() THEN v_partida.guest_id ELSE v_partida.host_id END, updated_at = NOW() WHERE id = p_partida_id;
    RETURN jsonb_build_object('ok', true, 'bomba', false);
  END IF;
END;
$$;
