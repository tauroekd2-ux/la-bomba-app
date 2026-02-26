-- Habilitar Realtime para chat_mensajes y transacciones:
-- así las notificaciones de mensaje y de dinero recibido funcionan sin refrescar.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_mensajes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensajes;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'transacciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transacciones;
  END IF;
END
$$;
