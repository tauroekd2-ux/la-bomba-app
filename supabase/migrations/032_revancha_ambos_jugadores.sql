-- Jugar de nuevo (amigos): la partida solo se reinicia cuando los DOS jugadores tocaron el botón

-- 1. Columnas para saber quién pidió revancha
ALTER TABLE public.partidas
  ADD COLUMN IF NOT EXISTS host_quiere_revancha BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_quiere_revancha BOOLEAN DEFAULT false;

-- 2. reiniciar_partida: al llamar se marca que TÚ quieres revancha; si el rival ya había pedido, se reinicia
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

  -- Marcar que este jugador quiere revancha (sin reiniciar aún)
  UPDATE partidas
  SET host_quiere_revancha = CASE WHEN host_id = v_user_id THEN true ELSE host_quiere_revancha END,
      guest_quiere_revancha = CASE WHEN guest_id = v_user_id THEN true ELSE guest_quiere_revancha END,
      updated_at = NOW()
  WHERE id = p_partida_id
  RETURNING * INTO v_partida;

  -- Si ya los dos habían pedido revancha, reiniciar ahora
  IF v_partida.host_quiere_revancha AND v_partida.guest_quiere_revancha THEN
    v_turno := CASE WHEN random() < 0.5 THEN v_partida.host_id ELSE v_partida.guest_id END;
    IF v_partida.numeros_juego IS NOT NULL AND jsonb_array_length(v_partida.numeros_juego) >= 30 THEN
      v_numero_prohibido := (v_partida.numeros_juego->>(floor(random() * 29)::integer))::integer;
    ELSE
      v_numero_prohibido := 20 + floor(random() * 30)::integer;
    END IF;

    UPDATE partidas
    SET estado = 'jugando',
        ganador_id = NULL,
        turno_actual = v_turno,
        numeros_usados = '[]'::jsonb,
        numero_prohibido = v_numero_prohibido,
        host_quiere_revancha = false,
        guest_quiere_revancha = false,
        updated_at = NOW()
    WHERE id = p_partida_id;

    RETURN jsonb_build_object('ok', true, 'reiniciado', true, 'partida_id', p_partida_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'reiniciado', false);
END;
$body$;
