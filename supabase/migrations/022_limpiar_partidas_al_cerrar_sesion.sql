-- Al cerrar sesión, cancelar/abandonar todas las partidas del usuario para que no queden colgadas

CREATE OR REPLACE FUNCTION public.limpiar_partidas_al_cerrar_sesion()
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
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Cancelar salas en espera donde es el host
  UPDATE partidas SET estado = 'cancelada', updated_at = NOW()
  WHERE host_id = v_user_id AND estado = 'esperando';

  -- Abandonar partidas en curso (el rival gana)
  FOR v_partida IN
    SELECT id, host_id, guest_id
    FROM partidas
    WHERE estado = 'jugando'
      AND (host_id = v_user_id OR guest_id = v_user_id)
  LOOP
    v_ganador_id := CASE WHEN v_partida.host_id = v_user_id THEN v_partida.guest_id ELSE v_partida.host_id END;
    IF v_ganador_id IS NOT NULL THEN
      PERFORM procesar_victoria(v_partida.id, v_ganador_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.limpiar_partidas_al_cerrar_sesion() TO authenticated;
