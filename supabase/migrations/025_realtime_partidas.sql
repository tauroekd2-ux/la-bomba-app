-- Habilitar Realtime para la tabla partidas: el host recibe al instante
-- cuando entra el rival (UPDATE con guest_id y estado = 'jugando')
-- sin depender solo del polling.

-- Añadir partidas a la publicación de Realtime (no elimina otras tablas ya incluidas)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'partidas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.partidas;
  END IF;
END
$$;
