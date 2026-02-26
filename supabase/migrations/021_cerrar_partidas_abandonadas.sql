-- Cerrar partidas en 'jugando' que llevan mucho sin actividad (uno se fue sin pulsar Salir)
-- Se ejecuta al inicio de buscar_partida para que el sistema no siga pensando que están jugando

CREATE OR REPLACE FUNCTION public.cerrar_partidas_abandonadas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_partida RECORD;
  v_ganador_id UUID;
BEGIN
  FOR v_partida IN
    SELECT id, host_id, guest_id, turno_actual, apuesta
    FROM partidas
    WHERE estado = 'jugando'
      AND updated_at < NOW() - INTERVAL '10 minutes'
  LOOP
    -- Quien tenía el turno se considera abandonado; el otro gana
    v_ganador_id := CASE WHEN v_partida.turno_actual = v_partida.host_id THEN v_partida.guest_id ELSE v_partida.host_id END;
    IF v_ganador_id IS NOT NULL THEN
      PERFORM procesar_victoria(v_partida.id, v_ganador_id);
    END IF;
  END LOOP;
END;
$body$;

-- Llamar al inicio de buscar_partida
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
  v_apuesta_norm DECIMAL(12,2);
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;

  PERFORM cerrar_partidas_abandonadas();

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
    AND created_at > NOW() - INTERVAL '10 minutes'
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
  v_numero_prohibido := 20 + floor(random() * 30)::integer;
  INSERT INTO partidas (room_code, host_id, apuesta, numero_prohibido, matchmaking)
  VALUES (v_room_code, v_user_id, v_apuesta_norm, v_numero_prohibido, true)
  RETURNING id INTO v_partida_id;
  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id, 'esperando', true);
END;
$body$;
