-- Ejecuta en Supabase: SQL Editor → New query → Pegar → Run
-- Añade telegram_chat_id en profiles para avisos al usuario (bot distinto)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

COMMENT ON COLUMN public.profiles.telegram_chat_id IS 'Chat ID de Telegram del usuario para recibir avisos (depósito acreditado, retiro procesado) desde el bot de usuarios.';
