-- Unirse con amigos: que el invitado pueda encontrar la sala por código (RLS) y código normalizado
-- Ejecutar en Supabase: SQL Editor → pegar → Run

-- 1. RLS: permitir leer partidas en 'esperando' para que unirse_partida encuentre la sala por room_code
--    (el invitado aún no es host_id ni guest_id, por eso la política actual bloqueaba el SELECT)
DROP POLICY IF EXISTS "Users read partidas esperando to join" ON public.partidas;
CREATE POLICY "Users read partidas esperando to join" ON public.partidas
  FOR SELECT
  TO authenticated
  USING (estado = 'esperando');

-- 2. unirse_partida: normalizar código (trim) y buscar por código recortado
CREATE OR REPLACE FUNCTION public.unirse_partida(p_room_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_partida RECORD;
  v_balance DECIMAL(12,2);
  v_turno UUID;
  v_code TEXT;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;

  v_code := upper(trim(coalesce(p_room_code, '')));
  IF length(v_code) <> 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Código inválido (debe tener 5 caracteres)');
  END IF;

  SELECT * INTO v_partida FROM partidas
  WHERE room_code = v_code AND estado = 'esperando' AND COALESCE(matchmaking, false) = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sala no encontrada. Comprueba el código de 5 caracteres.');
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

-- 3. crear_partida (sala amigos): asegurar matchmaking = false
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

  INSERT INTO partidas (room_code, host_id, apuesta, numero_prohibido, numeros_juego, matchmaking)
  VALUES (v_room_code, v_user_id, p_apuesta, v_numero_prohibido, v_numeros_juego, false)
  RETURNING id INTO v_partida_id;

  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id, 'room_code', v_room_code);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.unirse_partida(TEXT) TO authenticated;
