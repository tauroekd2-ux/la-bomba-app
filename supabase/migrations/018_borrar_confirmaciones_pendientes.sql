-- Borrar todas las confirmaciones pendientes para empezar de cero
DELETE FROM public.confirmaciones_deposito WHERE estado = 'pendiente';
