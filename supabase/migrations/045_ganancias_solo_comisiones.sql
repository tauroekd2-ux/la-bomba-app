-- Migración 045: Ganancias en estadísticas = solo comisiones de retiros ($0.50 por retiro procesado)
CREATE OR REPLACE FUNCTION public.admin_estadisticas_dinero()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_total_dep DECIMAL(12,2);
  v_total_ret DECIMAL(12,2);
  v_num_retiros BIGINT;
  v_comision_retiro DECIMAL(12,2) := 0.50;
  v_ganancias_comisiones DECIMAL(12,2);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_total_dep FROM confirmaciones_deposito WHERE estado = 'acreditado';
  SELECT COALESCE(SUM(monto), 0) INTO v_total_ret FROM retiros_phantom WHERE estado = 'procesado';
  SELECT COUNT(*) INTO v_num_retiros FROM retiros_phantom WHERE estado = 'procesado';
  v_ganancias_comisiones := v_num_retiros * v_comision_retiro;

  RETURN jsonb_build_object(
    'ok', true,
    'total_depositos_usdc', v_total_dep,
    'total_retiros_usdc', v_total_ret,
    'ganancias_usdc', v_ganancias_comisiones
  );
END;
$body$;

COMMENT ON FUNCTION public.admin_estadisticas_dinero IS 'Totales depósitos acreditados, retiros procesados y ganancias (solo comisiones por retiro). Solo admin.';
