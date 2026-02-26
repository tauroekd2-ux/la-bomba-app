-- Habilitar Realtime para deposit_notifications:
-- así el usuario recibe notificación in-app cuando se le acredita un depósito.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'deposit_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deposit_notifications;
  END IF;
END
$$;
