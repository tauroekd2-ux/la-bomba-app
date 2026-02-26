# Bot de usuarios (Telegram) — LA BOMBA

Bot de Telegram **solo para notificaciones al usuario** (depósito acreditado, retiro procesado). Es un bot distinto del que avisa al admin.

## Variable única en el proxy

En el **Web Service (proxy)** de Render usa **una sola variable**:

| Variable | Uso |
|----------|-----|
| `TELEGRAM_USER_BOT_TOKEN` | Token del bot de usuarios (ej. @Tel_Bomba_bot). Con este token el proxy envía los mensajes al usuario. |

- No hace falta `VITE_TELEGRAM_USER_BOT_TOKEN` en el proxy: el envío lo hace siempre el servidor con `TELEGRAM_USER_BOT_TOKEN`.
- En el **Static Site** solo necesitas `VITE_PROXY_URL` (URL del proxy) para que Admin Phantom pueda llamar al endpoint.

## Cómo se vincula el usuario

1. El usuario en la app va a **Notificaciones → Telegram notificaciones**.
2. La app genera un enlace tipo `https://t.me/TuBotUsuario_bot?start=TOKEN` (usa `VITE_TELEGRAM_USER_BOT_USERNAME` y un token en BD).
3. El usuario abre Telegram y pulsa **Start** con ese enlace → envía `/start TOKEN` al bot.
4. **Webhook** (Edge Function `telegram-user-bot-webhook`): recibe la actualización, llama a `consume_telegram_link_token(p_token, p_chat_id)` y guarda `telegram_chat_id` en `profiles`. Si ese mismo chat_id estaba en otro usuario, se le quita (un chat_id = un solo usuario).
5. A partir de ahí, ese usuario recibe las notificaciones de depósito y retiro por Telegram.

## Cómo se envían los mensajes al usuario

- **Solo vía proxy.** El cliente (Admin Phantom) no tiene el token del bot y **no envía chat_id**: envía `user_id` para que el destinatario salga siempre de la base de datos (así no se cruzan notificaciones entre usuarios).
- Flujo:
  1. Admin acredita depósito o marca retiro como procesado en Admin Phantom.
  2. La app hace `POST /api/send-telegram-to-user` al proxy con `Authorization: Bearer <JWT>` y body `{ user_id, text }`.
  3. El proxy comprueba que el JWT sea de un admin (`admin_roles`), busca `profiles.telegram_chat_id` para ese `user_id` en Supabase, normaliza el valor y llama a `https://api.telegram.org/bot<TELEGRAM_USER_BOT_TOKEN>/sendMessage`.
  4. Responde `{ ok: true }` o `{ ok: false, error: "..." }`.

## Checklist

### Render

- **Web Service (proxy)**  
  - `TELEGRAM_USER_BOT_TOKEN` = token real del bot de usuarios (el mismo que en Supabase para el webhook).  
  - Sin esta variable, el proxy devuelve un mensaje claro y no envía al usuario.

- **Static Site**  
  - `VITE_PROXY_URL` = URL del proxy (ej. `https://tu-proxy.onrender.com`).  
  - `VITE_TELEGRAM_USER_BOT_USERNAME` = nombre del bot sin @ (para el enlace de vinculación).  
  - Opcional: `VITE_TELEGRAM_USER_BOT_TOKEN` en el Static solo si necesitas algo en cliente (el envío no lo usa).

### Supabase

- **Edge Function `telegram-user-bot-webhook`**  
  - Secreto: `TELEGRAM_USER_BOT_TOKEN` (mismo valor que en Render).  
  - Puedes usar el script: `node set-telegram-user-bot-secret.cjs` (lee `VITE_TELEGRAM_USER_BOT_TOKEN` del `.env` y ejecuta `supabase secrets set`).

- **Webhook de Telegram**  
  - URL: `https://<PROYECTO>.supabase.co/functions/v1/telegram-user-bot-webhook`  
  - Configurar: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<esa URL>`.

### Local (.env)

- Para el enlace de vinculación y el script de secretos:  
  - `VITE_TELEGRAM_USER_BOT_USERNAME`  
  - `VITE_TELEGRAM_USER_BOT_TOKEN` (opcional en proxy; necesario para `set-telegram-user-bot-secret.cjs`).

## Resumen

- **Un solo token** del bot de usuarios: en proxy se usa como `TELEGRAM_USER_BOT_TOKEN`; en Supabase como secreto de la Edge Function.
- **Vinculación:** usuario desde la app → enlace a Telegram → `/start TOKEN` → webhook guarda `telegram_chat_id`.
- **Mensajes al usuario:** siempre desde el proxy con `POST /api/send-telegram-to-user` (admin con JWT); el cliente no envía nada directo a Telegram.
