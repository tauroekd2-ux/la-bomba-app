-- Telegram para notificaciones al usuario (bot distinto al del admin)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

COMMENT ON COLUMN public.profiles.telegram_chat_id IS 'Chat ID de Telegram del usuario para recibir avisos (depósito acreditado, retiro procesado) desde el bot de usuarios.';
