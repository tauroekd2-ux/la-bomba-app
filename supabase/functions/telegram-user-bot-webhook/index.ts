// Edge Function: webhook del bot de Telegram para usuarios (notificaciones depósito/retiro).
// Telegram envía aquí las actualizaciones. Al /start TOKEN vinculamos chat_id al usuario.
// Configurar webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://PROYECTO.supabase.co/functions/v1/telegram-user-bot-webhook
// Secretos: TELEGRAM_USER_BOT_TOKEN (token del bot de usuarios)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getEnv(key: string): string | undefined {
  return Deno.env.get(key);
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "POST") {
    try {
      const update = (await req.json()) as {
        message?: { chat?: { id?: number }; text?: string };
      };
      const msg = update?.message;
      const chatId = msg?.chat?.id;
      const text = (msg?.text || "").trim();

      if (!chatId) {
        return new Response(null, { status: 200 });
      }

      const botToken = getEnv("TELEGRAM_USER_BOT_TOKEN");
      const sendReply = async (replyText: string) => {
        if (!botToken) return;
        await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: String(chatId),
              text: replyText,
            }),
          }
        );
      };

      if (text.startsWith("/start")) {
        const token = text.slice(6).trim();
        if (token) {
          const supabaseUrl = getEnv("SUPABASE_URL");
          const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
          if (!supabaseUrl || !serviceKey) {
            await sendReply(
              "Error de configuración del servidor. Intenta más tarde."
            );
            return new Response(null, { status: 200 });
          }
          const supabase = createClient(supabaseUrl, serviceKey);
          const { data: result } = await supabase.rpc("consume_telegram_link_token", {
            p_token: token,
            p_chat_id: String(chatId),
          });
          const res = Array.isArray(result) ? result[0] : result;
          if (res?.ok) {
            await sendReply(
              "✅ Aquí recibirás las notificaciones de tus depósitos y retiros en LA BOMBA. ¡Listo!"
            );
          } else {
            await sendReply(
              "Este enlace ya no es válido o ha expirado. Abre la app y pulsa de nuevo \"Telegram notificaciones\"."
            );
          }
        } else {
          await sendReply(
            "Abre la app LA BOMBA y en el menú principal pulsa \"Telegram notificaciones\" para vincular esta cuenta y recibir avisos de depósitos y retiros."
          );
        }
      }

      return new Response(null, { status: 200 });
    } catch {
      return new Response(null, { status: 200 });
    }
  }

  return new Response(null, { status: 200 });
}
