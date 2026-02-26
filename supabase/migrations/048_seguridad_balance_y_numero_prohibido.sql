-- Seguridad: los usuarios no pueden modificar su balance por la API (solo RPCs con SECURITY DEFINER)
-- El número prohibido (bomba): el cliente debe pedir solo columnas sin numero_prohibido en SELECT de partidas.

CREATE OR REPLACE FUNCTION public.profiles_block_balance_update_by_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.balance IS DISTINCT FROM OLD.balance THEN
    IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
      NEW.balance := OLD.balance;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS profiles_block_balance_update ON public.profiles;
CREATE TRIGGER profiles_block_balance_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_block_balance_update_by_user();
