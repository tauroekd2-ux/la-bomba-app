-- Migración 011: Perder por tiempo (no elegir número en 10 segundos)
-- El jugador cuyo turno es pierde si no elige a tiempo
-- Ejecutar en Supabase: SQL Editor → pegar → Run

CREATE OR REPLACE FUNCTION public.perder_por_tiempo(p_partida_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_partida RECORD;
  v_perdedor_id UUID;
  v_ganador_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_partida FROM partidas WHERE id = p_partida_id AND estado = 'jugando';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partida no válida o ya terminada');
  END IF;

  IF v_partida.turno_actual IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin turno asignado');
  END IF;

  v_perdedor_id := v_partida.turno_actual;
  v_ganador_id := CASE WHEN v_partida.host_id = v_perdedor_id THEN v_partida.guest_id ELSE v_partida.host_id END;

  IF v_ganador_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Rival no definido');
  END IF;

  PERFORM procesar_victoria(p_partida_id, v_ganador_id);

  RETURN jsonb_build_object('ok', true, 'perdedor_id', v_perdedor_id, 'ganador_id', v_ganador_id);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.perder_por_tiempo TO authenticated;
