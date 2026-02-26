-- Migración 002: matchmaking aleatorio
-- Ejecutar en Supabase: SQL Editor → New query → pegar este archivo → Run
-- Matchmaking aleatorio: buscar_partida une o crea partida por apuesta
CREATE INDEX IF NOT EXISTS idx_partidas_matchmaking ON public.partidas(estado, apuesta) WHERE estado = 'esperando';
-- Reemplaza flujo de sala + código por emparejamiento automático

CREATE OR REPLACE FUNCTION public.buscar_partida(p_apuesta DECIMAL DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Buscar partida esperando con misma apuesta (otro jugador, no yo)
  SELECT * INTO v_partida FROM partidas
  WHERE estado = 'esperando' AND apuesta = p_apuesta AND host_id != v_user_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    -- Unirse a partida existente
    v_turno := CASE WHEN random() < 0.5 THEN v_partida.host_id ELSE v_user_id END;
    UPDATE partidas SET guest_id = v_user_id, estado = 'jugando', turno_actual = v_turno, updated_at = NOW() WHERE id = v_partida.id;
    UPDATE profiles SET balance = balance - p_apuesta, updated_at = NOW() WHERE id = v_user_id;
    INSERT INTO transacciones (user_id, tipo, monto, partida_id, detalles)
    VALUES (v_user_id, 'apuesta', -p_apuesta, v_partida.id, '{"rol":"guest","matchmaking":true}'::jsonb);
    RETURN jsonb_build_object('ok', true, 'partida_id', v_partida.id, 'esperando', false, 'tu_turno', v_turno = v_user_id);
  END IF;

  -- No hay rival: crear nueva partida y esperar
  LOOP
    v_room_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 5));
    SELECT COUNT(*) INTO v_existing FROM partidas WHERE room_code = v_room_code AND estado = 'esperando';
    EXIT WHEN v_existing = 0;
  END LOOP;
  v_numero_prohibido := 20 + floor(random() * 31)::integer;
  INSERT INTO partidas (room_code, host_id, apuesta, numero_prohibido)
  VALUES (v_room_code, v_user_id, p_apuesta, v_numero_prohibido)
  RETURNING id INTO v_partida_id;
  UPDATE profiles SET balance = balance - p_apuesta, updated_at = NOW() WHERE id = v_user_id;
  INSERT INTO transacciones (user_id, tipo, monto, partida_id, detalles)
  VALUES (v_user_id, 'apuesta', -p_apuesta, v_partida_id, '{"rol":"host","matchmaking":true}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id, 'esperando', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_partida TO authenticated;
