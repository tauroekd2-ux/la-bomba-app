-- Solo admin puede ver el número prohibido (bomba) de una partida en curso.
CREATE OR REPLACE FUNCTION public.admin_ver_numero_prohibido(p_partida_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_numero INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  SELECT numero_prohibido INTO v_numero
  FROM partidas
  WHERE id = p_partida_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partida no encontrada');
  END IF;

  RETURN jsonb_build_object('ok', true, 'numero_prohibido', v_numero);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ver_numero_prohibido(UUID) TO authenticated;
COMMENT ON FUNCTION public.admin_ver_numero_prohibido(UUID) IS 'Admin only: devuelve el número prohibido (bomba) de una partida.';
