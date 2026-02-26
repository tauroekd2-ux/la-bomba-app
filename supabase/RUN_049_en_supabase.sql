-- Ejecuta en Supabase: SQL Editor → New query → Pegar todo → Run
-- Añade la función limpiar_admin_phantom() para borrar todas las confirmaciones y retiros desde Admin Phantom.

CREATE OR REPLACE FUNCTION public.limpiar_admin_phantom()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_del_confirmaciones INT;
  v_del_retiros INT;
  v_del_transacciones INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  DELETE FROM public.transacciones_phantom WHERE retiro_id IS NOT NULL;
  GET DIAGNOSTICS v_del_transacciones = ROW_COUNT;

  DELETE FROM public.retiros_phantom;
  GET DIAGNOSTICS v_del_retiros = ROW_COUNT;

  DELETE FROM public.confirmaciones_deposito;
  GET DIAGNOSTICS v_del_confirmaciones = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'confirmaciones_borradas', v_del_confirmaciones,
    'retiros_borrados', v_del_retiros,
    'transacciones_phantom_borradas', v_del_transacciones
  );
END;
$body$;

GRANT EXECUTE ON FUNCTION public.limpiar_admin_phantom() TO authenticated;

COMMENT ON FUNCTION public.limpiar_admin_phantom() IS 'Admin only: borra todas las confirmaciones de depósito y retiros Phantom para empezar de cero.';
