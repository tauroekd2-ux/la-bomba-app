-- RPCs para borrar una confirmación o un retiro individual (solo admin).

CREATE OR REPLACE FUNCTION public.borrar_confirmacion_admin(p_confirmacion_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  DELETE FROM public.confirmaciones_deposito WHERE id = p_confirmacion_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Confirmación no encontrada');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$body$;

CREATE OR REPLACE FUNCTION public.borrar_retiro_admin(p_retiro_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.retiros_phantom WHERE id = p_retiro_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Retiro no encontrado');
  END IF;

  DELETE FROM public.transacciones_phantom WHERE retiro_id = p_retiro_id;
  DELETE FROM public.retiros_phantom WHERE id = p_retiro_id;

  RETURN jsonb_build_object('ok', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.borrar_confirmacion_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_retiro_admin(UUID) TO authenticated;

COMMENT ON FUNCTION public.borrar_confirmacion_admin(UUID) IS 'Admin only: borra una confirmación de depósito por id.';
COMMENT ON FUNCTION public.borrar_retiro_admin(UUID) IS 'Admin only: borra un retiro Phantom por id (y sus filas en transacciones_phantom).';
