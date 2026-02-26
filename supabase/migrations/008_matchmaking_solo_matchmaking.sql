-- Migración 008: Matchmaking solo empareja con otras partidas de matchmaking
-- Evita que jugadores aleatorios se unan a salas de amigos (crear_partida)
-- Ejecutar en Supabase: SQL Editor → pegar → Run

-- 1. Añadir columna para distinguir partidas de matchmaking vs amigos
ALTER TABLE public.partidas ADD COLUMN IF NOT EXISTS matchmaking BOOLEAN DEFAULT false;

-- 2. Actualizar buscar_partida: solo buscar/crear partidas de matchmaking
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

  -- Solo partidas de matchmaking (no salas de amigos)
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
  v_numero_prohibido := 20 + floor(random() * 31)::integer;
  INSERT INTO partidas (room_code, host_id, apuesta, numero_prohibido, matchmaking)
  VALUES (v_room_code, v_user_id, v_apuesta_norm, v_numero_prohibido, true)
  RETURNING id INTO v_partida_id;
  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id, 'esperando', true);
END;
$body$;

-- 3. unirse_partida: solo unirse a salas de amigos (NO matchmaking)
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

  SELECT * INTO v_partida FROM partidas
  WHERE room_code = upper(p_room_code) AND estado = 'esperando' AND COALESCE(matchmaking, false) = false;
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

-- Índice para búsqueda de matchmaking
DROP INDEX IF EXISTS public.idx_partidas_matchmaking;
CREATE INDEX IF NOT EXISTS idx_partidas_matchmaking ON public.partidas(apuesta) WHERE estado = 'esperando' AND matchmaking IS TRUE;
