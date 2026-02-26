# telegram-user-bot-webhook

Webhook del bot de Telegram para **usuarios** (notificaciones de depósito acreditado y retiro procesado). Sin proxy: Telegram llama a esta Edge Function.

## Configuración

1. **Secretos** (Supabase Dashboard → Edge Functions → Secrets):
   - `TELEGRAM_USER_BOT_TOKEN`: token del bot de usuarios (creado con @BotFather).

2. **Webhook de Telegram** (una vez, con la URL pública de la función):
   ```
   https://api.telegram.org/bot<TU_TOKEN>/setWebhook?url=https://<PROYECTO>.supabase.co/functions/v1/telegram-user-bot-webhook
   ```
   Sustituye `<TU_TOKEN>` por el token del bot de usuarios y `<PROYECTO>` por el ref de tu proyecto Supabase (ej. `cdwvmtdvpwzjbdoywzyw`).

3. La app ya usa esta función: el usuario pulsa "Telegram notificaciones" en el menú, se abre el bot con un token en la URL; al enviar /start, Telegram envía la actualización aquí y se vincula el `chat_id` al usuario.
