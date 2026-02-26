-- El rival (guest) llama esto al cargar la partida. Hace un UPDATE en la fila para que
-- Realtime (postgres_changes) dispare y el host reciba al instante, sin depender del timing
-- de buscar_partida ni de réplicas.

CREATE OR REPLACE FUNCTION public.avisar_entrada_rival(p_partida_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE partidas
  SET updated_at = NOW()
  WHERE id = p_partida_id
    AND guest_id = v_user_id
    AND estado = 'jugando';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', (v_updated > 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.avisar_entrada_rival(UUID) TO authenticated;
