-- RPC ligero para que el host haga polling: solo indica si la partida ya tiene rival (guest_id).
-- Lectura en primary, sin depender de Realtime.

CREATE OR REPLACE FUNCTION public.partida_tiene_rival(p_partida_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_guest_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'tiene_rival', false);
  END IF;

  SELECT guest_id INTO v_guest_id
  FROM partidas
  WHERE id = p_partida_id
    AND host_id = v_user_id
    AND estado = 'esperando';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'tiene_rival', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'tiene_rival', (v_guest_id IS NOT NULL));
END;
$$;

GRANT EXECUTE ON FUNCTION public.partida_tiene_rival(UUID) TO authenticated;
