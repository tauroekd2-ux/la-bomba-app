-- Matchmaking desde cero: cola. No se crea partida hasta que hay 2 jugadores.
-- Quien espera no tiene partida_id; cuando llega el rival se crea la partida y ambos van a /game.

-- 1. Cola de matchmaking (un registro por usuario esperando)
CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  apuesta DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_apuesta_created
  ON public.matchmaking_queue(apuesta, created_at);

-- 2. Buscar partida: si hay alguien en la cola con la misma apuesta, crear partida y emparejar; si no, entrar en la cola
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

  -- Quitar de la cola a quien lleve más de 2 minutos
  DELETE FROM matchmaking_queue WHERE created_at < NOW() - INTERVAL '2 minutes';

  -- Buscar alguien en la cola con la misma apuesta (y no sea yo)
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
    v_numero_prohibido := 20 + floor(random() * 30)::integer;
    v_turno := CASE WHEN random() < 0.5 THEN v_otro.user_id ELSE v_user_id END;

    INSERT INTO partidas (room_code, host_id, guest_id, apuesta, numero_prohibido, estado, turno_actual, matchmaking)
    VALUES (v_room_code, v_otro.user_id, v_user_id, v_apuesta_norm, v_numero_prohibido, 'jugando', v_turno, true)
    RETURNING id INTO v_partida_id;

    RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id, 'esperando', false, 'tu_turno', v_turno = v_user_id);
  END IF;

  -- Nadie en la cola: entrar a esperar (insert or replace)
  INSERT INTO matchmaking_queue (user_id, apuesta)
  VALUES (v_user_id, v_apuesta_norm)
  ON CONFLICT (user_id) DO UPDATE SET apuesta = EXCLUDED.apuesta, created_at = NOW();

  RETURN jsonb_build_object('ok', true, 'esperando', true);
END;
$body$;

-- 3. Quien está en la cola hace polling: ¿ya me emparejaron? (soy host de una partida jugando reciente)
CREATE OR REPLACE FUNCTION public.obtener_partida_emparejada()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_partida_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'partida_id', null);
  END IF;

  SELECT id INTO v_partida_id
  FROM partidas
  WHERE host_id = v_user_id AND estado = 'jugando'
    AND created_at > NOW() - INTERVAL '2 minutes'
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id);
END;
$body$;

-- 4. Cancelar espera en la cola
CREATE OR REPLACE FUNCTION public.cancelar_matchmaking()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  DELETE FROM matchmaking_queue WHERE user_id = auth.uid();
  RETURN jsonb_build_object('ok', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.obtener_partida_emparejada() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_matchmaking() TO authenticated;
