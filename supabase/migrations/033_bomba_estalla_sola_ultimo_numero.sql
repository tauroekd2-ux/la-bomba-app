-- Si solo queda un número por elegir, es la bomba: estalla sola y pierde quien tendría el turno

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

  v_validos := COALESCE(v_partida.numeros_juego, to_jsonb(ARRAY(SELECT generate_series(20, 49))));
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
    -- Quien tocó la bomba pierde; el rival gana
    v_perdedor := auth.uid();
    v_ganador := CASE WHEN v_partida.host_id = auth.uid() THEN v_partida.guest_id ELSE v_partida.host_id END;
    PERFORM procesar_victoria(p_partida_id, v_ganador);
    UPDATE partidas SET numeros_usados = v_numeros, estado = 'finalizada', ganador_id = v_ganador, updated_at = NOW() WHERE id = p_partida_id;
    RETURN jsonb_build_object('ok', true, 'bomba', true, 'ganador_id', v_ganador);
  ELSIF v_solo_queda_bomba THEN
    -- Solo quedaba este número (el que acabas de elegir no es bomba) → el otro es la bomba; el rival tiene que elegirla y pierde → tú ganas
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
