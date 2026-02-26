-- Polling del host: obtener estado actual de la partida desde el servidor (evita réplicas/RLS)
CREATE OR REPLACE FUNCTION public.obtener_partida_actual(p_partida_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_partida RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_partida
  FROM partidas
  WHERE id = p_partida_id
    AND (host_id = v_user_id OR guest_id = v_user_id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partida no encontrada');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'partida', to_jsonb(v_partida)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_partida_actual(UUID) TO authenticated;
