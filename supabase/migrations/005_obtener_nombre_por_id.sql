-- Migración 005: Obtener nombre de usuario por ID (para chat/notificaciones)
-- Ejecutar en Supabase: SQL Editor → pegar → Run

CREATE OR REPLACE FUNCTION public.obtener_nombre_por_id(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $body$
DECLARE
  v_nombre TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  IF p_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT full_name INTO v_nombre FROM profiles WHERE id = p_id;
  IF v_nombre IS NULL OR v_nombre = '' THEN
    RETURN jsonb_build_object('ok', true, 'full_name', 'Usuario');
  END IF;
  RETURN jsonb_build_object('ok', true, 'full_name', v_nombre);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.obtener_nombre_por_id(UUID) TO authenticated;
