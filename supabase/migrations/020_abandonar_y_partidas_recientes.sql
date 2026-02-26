-- Migración 020: Abandonar partida (el rival gana), cancelar sala en espera, y solo emparejar con partidas recientes
-- Así el sistema no piensa que siguen jugando cuando alguien se salió

-- 1. Permitir estado 'cancelada' en partidas (salas en espera que el host cerró)
ALTER TABLE public.partidas DROP CONSTRAINT IF EXISTS partidas_estado_check;
ALTER TABLE public.partidas ADD CONSTRAINT partidas_estado_check
  CHECK (estado IN ('esperando','jugando','finalizada','cancelada'));

-- 2. Abandonar partida en curso: quien sale pierde, el rival gana
CREATE OR REPLACE FUNCTION public.abandonar_partida(p_partida_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_partida RECORD;
  v_ganador_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_partida FROM partidas WHERE id = p_partida_id AND estado = 'jugando';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partida no en curso o ya terminada');
  END IF;

  IF v_user_id != v_partida.host_id AND v_user_id != v_partida.guest_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No eres participante');
  END IF;

  -- El que abandona pierde; el otro gana
  v_ganador_id := CASE WHEN v_partida.host_id = v_user_id THEN v_partida.guest_id ELSE v_partida.host_id END;
  IF v_ganador_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay rival en la partida');
  END IF;

  PERFORM procesar_victoria(p_partida_id, v_ganador_id);
  RETURN jsonb_build_object('ok', true, 'ganador_id', v_ganador_id);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.abandonar_partida(UUID) TO authenticated;

-- 3. Cancelar sala en espera (solo el host puede; la sala deja de estar disponible para matchmaking)
CREATE OR REPLACE FUNCTION public.cancelar_partida_espera(p_partida_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_partida RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_partida FROM partidas WHERE id = p_partida_id AND estado = 'esperando';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partida no está esperando rival');
  END IF;

  IF v_partida.host_id != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el creador puede cancelar la sala');
  END IF;

  UPDATE partidas SET estado = 'cancelada', updated_at = NOW() WHERE id = p_partida_id;
  RETURN jsonb_build_object('ok', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.cancelar_partida_espera(UUID) TO authenticated;

-- 4. buscar_partida: solo emparejar con partidas creadas en los últimos 10 minutos (evita salas fantasmas)
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

  v_apuesta_norm := ROUND(p_apuesta::numeric, 2);

  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_apuesta_norm THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;

  -- Solo partidas esperando, matchmaking, misma apuesta, creadas en los últimos 10 minutos
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
