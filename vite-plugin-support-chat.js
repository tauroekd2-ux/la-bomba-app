/**
 * Plugin Vite: atiende POST /api/support-chat en el servidor de desarrollo.
 * Así el chat de soporte funciona con solo "npm run dev", sin levantar el proxy.
 */
import { loadEnv } from 'vite'

const SUPPORT_SYSTEM_PROMPT = `Eres el soporte de LA BOMBA, una app de juego 1v1 con apuestas en USDC.

CONOCIMIENTO DE LA APP:
- Juego: dos jugadores eligen números del 0 al 99 (30 números por partida). Hay un "número prohibido" (bomba). Quien lo toca pierde; el otro gana la apuesta. Si solo queda un número sin elegir, es la bomba y pierde quien tendría el turno. Tiempo por turno: 25 segundos; si se acaba, pierdes.
- Partidas: puedes "Buscar partida" (matchmaking con misma apuesta) o "Jugar con amigos" (crear sala con código de 5 caracteres o unirse con código). También "Jugar gratis" contra el bot (sin dinero).
- Apuestas: entre $1 y $5 por partida. El perdedor pierde la apuesta; el ganador la recibe.
- Depósitos: en el Cajero → Depositar USDC. Debes vincular al menos una dirección de wallet (Dir. wallet: Solana, Base o Polygon). Luego envías USDC desde tu wallet a la dirección que muestra la app, y confirmas con el monto y el hash de la transacción. Los depósitos se acreditan manualmente por el equipo.
- Retiros: Cajero → Retirar USDC. Mínimo $10, máximo $50 por solicitud. Comisión fija $0.50. Debes tener una dirección vinculada en la red que elijas. Una sola solicitud pendiente a la vez; se procesan en hasta 24 horas.
- Redes: solo Solana, Base y Polygon. No usar otras redes (Ethereum mainnet, BSC, etc.) o se pierden los fondos.
- Notificaciones: puedes vincular Telegram (menú → Telegram notificaciones) para recibir avisos de depósito acreditado y retiro procesado.

INSTRUCCIONES:
- Responde en español, de forma clara y breve.
- Si el usuario pide contactar con alguien del equipo de soporte (o con un humano/admin), NO digas todavía que has avisado. Responde solo preguntando: "Para avisar al equipo, ¿tienes usuario de Telegram para que te contactemos? Escribe tu @usuario o dime si prefieres por email."
- Si no sabes algo específico de la app o es un tema técnico/legal, indica que puede pedir "Contactar con el equipo de soporte" para que alguien le ayude.`

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, data) {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = status
  res.end(JSON.stringify(data))
}

/** Groq: convierte body a mensajes y llama Chat Completions (OpenAI-compatible) */
async function groqGenerate(apiKey, model, body) {
  const systemParts = body?.systemInstruction?.parts || []
  const systemText = systemParts.map((p) => p?.text).filter(Boolean).join('\n').trim()
  const messages = []
  if (systemText) messages.push({ role: 'system', content: systemText })
  const contents = body?.contents || []
  for (const c of contents) {
    const role = c.role === 'model' || c.role === 'assistant' ? 'assistant' : 'user'
    const text = (c.parts?.[0]?.text || '').toString().trim()
    if (text) messages.push({ role, content: text })
  }
  if (!messages.length) return { ok: false, status: 400, data: { error: { message: 'Sin mensajes' } } }
  const opts = body?.generationConfig || {}
  const url = 'https://api.groq.com/openai/v1/chat/completions'
  const payload = {
    model: model || 'llama-3.1-8b-instant',
    messages,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.7,
    max_tokens: typeof opts.maxOutputTokens === 'number' ? opts.maxOutputTokens : 1024,
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    const content = data?.choices?.[0]?.message?.content
    if (res.ok && content != null) return { ok: true, data: { candidates: [{ content: { parts: [{ text: content }] } }] } }
    const errMsg = data?.error?.message || data?.error?.code || (res.status === 429 ? 'Límite de uso alcanzado' : 'Groq error')
    return { ok: false, status: res.status, data: { error: { message: errMsg } } }
  } catch (e) {
    return { ok: false, status: 500, data: { error: { message: e.message || 'Groq no disponible' } } }
  }
}

const ADMIN_CHAT_SYSTEM = `Eres el asistente del administrador de LA BOMBA (app de juego 1v1 con apuestas en USDC).
Tienes acceso a la siguiente información actualizada. Responde en español, de forma clara y breve.
Si te preguntan por nombres, correos, montos de depósitos/retiros, ganancias o cualquier dato administrativo, usa solo la información proporcionada abajo.
Si no tienes el dato, dilo. No inventes cifras ni usuarios.`

export default function supportChatPlugin() {
  return {
    name: 'support-chat',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const root = server.config.root || process.cwd()
        const env = { ...process.env, ...loadEnv(server.config.mode, root, '') }

        // Admin chat: Asistente en Admin Phantom (funciona sin proxy)
        if (req.url === '/api/admin/chat' && req.method === 'POST') {
          try {
            const body = await readBody(req)
            const { message, history = [] } = body || {}
            if (!message || typeof message !== 'string' || !message.trim()) {
              return sendJson(res, 400, { error: 'message required' })
            }
            const SUPABASE_URL = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '')
            const SUPABASE_SERVICE_ROLE_KEY = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
            const GROQ_API_KEY = (env.GROQ_API_KEY || '').trim()
            const GROQ_MODEL = (env.GROQ_MODEL || 'llama-3.1-8b-instant').trim()
            if (!GROQ_API_KEY || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL.startsWith('https://')) {
              return sendJson(res, 503, { reply: 'Falta GROQ_API_KEY (https://console.groq.com) o SUPABASE_SERVICE_ROLE_KEY en .env' })
            }
            const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
            const [depRes, retRes, profRes, confRes, retListRes] = await Promise.all([
              fetch(`${SUPABASE_URL}/rest/v1/confirmaciones_deposito?estado=eq.acreditado&select=monto`, { headers }),
              fetch(`${SUPABASE_URL}/rest/v1/retiros_phantom?estado=eq.procesado&select=monto`, { headers }),
              fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,full_name,email,balance&order=updated_at.desc&limit=50`, { headers }),
              fetch(`${SUPABASE_URL}/rest/v1/confirmaciones_deposito?select=id,user_id,red,monto,estado,created_at&order=created_at.desc&limit=15`, { headers }),
              fetch(`${SUPABASE_URL}/rest/v1/retiros_phantom?select=id,user_id,red,monto,estado,wallet_destino,created_at&order=created_at.desc&limit=15`, { headers }),
            ])
            const depósitos = await depRes.json().catch(() => [])
            const retiros = await retRes.json().catch(() => [])
            const perfiles = await profRes.json().catch(() => [])
            const confirmaciones = await confRes.json().catch(() => [])
            const retirosLista = await retListRes.json().catch(() => [])
            const totalDep = (Array.isArray(depósitos) ? depósitos : []).reduce((s, d) => s + Number(d.monto || 0), 0)
            const totalRet = (Array.isArray(retiros) ? retiros : []).reduce((s, r) => s + Number(r.monto || 0), 0)
            const numRetiros = (Array.isArray(retiros) ? retiros : []).length
            const gananciasComisiones = numRetiros * 0.5
            let context = `ESTADÍSTICAS:\n- Total USDC ingresado (depósitos acreditados): $${totalDep.toFixed(2)}\n- Total USDC retirado (procesados): $${totalRet.toFixed(2)}\n- Ganancias (solo comisiones de retiros, $0.50 por retiro): $${gananciasComisiones.toFixed(2)}\n\n`
            context += `PERFILES (últimos 50):\n${(Array.isArray(perfiles) ? perfiles : []).map((p) => `  ${p.id} | ${p.full_name || '-'} | ${p.email || '-'} | balance: $${Number(p.balance || 0).toFixed(2)}`).join('\n')}\n\n`
            context += `ÚLTIMAS CONFIRMACIONES DE DEPÓSITO:\n${(Array.isArray(confirmaciones) ? confirmaciones : []).map((c) => `  ${c.id} | user ${c.user_id} | ${c.red} | $${Number(c.monto || 0).toFixed(2)} | ${c.estado} | ${c.created_at}`).join('\n')}\n\n`
            context += `ÚLTIMOS RETIROS:\n${(Array.isArray(retirosLista) ? retirosLista : []).map((r) => `  ${r.id} | user ${r.user_id} | ${r.red} | $${Number(r.monto || 0).toFixed(2)} | ${r.estado} | ${r.wallet_destino} | ${r.created_at}`).join('\n')}`
            const systemWithContext = ADMIN_CHAT_SYSTEM + '\n\nDatos actuales:\n' + context
            const contents = []
            if (Array.isArray(history) && history.length) {
              for (const m of history) {
                const role = m.role === 'model' || m.role === 'assistant' ? 'model' : 'user'
                const text = (m.text || m.content || '').toString().trim()
                if (text) contents.push({ role, parts: [{ text }] })
              }
            }
            contents.push({ role: 'user', parts: [{ text: message.trim() }] })
            const gen = await groqGenerate(GROQ_API_KEY, GROQ_MODEL, { systemInstruction: { parts: [{ text: systemWithContext }] }, contents, generationConfig: { temperature: 0.3, maxOutputTokens: 1024 } })
            const candidate = gen.ok ? gen.data?.candidates?.[0] : null
            const textPart = candidate?.content?.parts?.[0]?.text
            const reply = textPart ? String(textPart).trim() : (gen.data?.error?.message || 'No se pudo generar respuesta.')
            return sendJson(res, 200, { reply })
          } catch (e) {
            console.error('[admin-chat]', e.message)
            return sendJson(res, 500, { error: e.message || 'Error' })
          }
        }

        if (req.url !== '/api/support-chat' || req.method !== 'POST') {
          return next()
        }
        const GROQ_API_KEY = (env.GROQ_API_KEY || '').trim()
        const GROQ_MODEL = (env.GROQ_MODEL || 'llama-3.1-8b-instant').trim()
        const TELEGRAM_BOT_TOKEN = (env.TELEGRAM_BOT_TOKEN || env.VITE_TELEGRAM_BOT_TOKEN || '').trim()
        const TELEGRAM_ADMIN_CHAT_ID = (env.TELEGRAM_ADMIN_CHAT_ID || env.VITE_TELEGRAM_ADMIN_CHAT_ID || '').trim()
        const APP_URL = (env.VITE_APP_URL || env.APP_URL || 'http://localhost:5175').replace(/\/$/, '')

        try {
          const body = await readBody(req)
          const { message, history = [], userId, userEmail, userName } = body

          const msgTrim = typeof message === 'string' ? message.trim() : ''

          const lastMsg = Array.isArray(history) && history.length > 0 ? history[history.length - 1] : null
          const lastIsModel = lastMsg && (lastMsg.role === 'model' || lastMsg.role === 'assistant')
          const lastText = (lastMsg?.text || '').toString()
          const lastAskedTelegram = lastIsModel && (/telegram|avisar al equipo|contactemos|escribe tu @|prefieres por email|usuario de telegram/i.test(lastText))
          if (lastAskedTelegram && msgTrim) {
            const telegramFromMessage = (msgTrim.match(/@([a-zA-Z0-9_]{4,32})/) || [])[1] || (msgTrim.startsWith('@') ? msgTrim.replace(/^@/, '').trim().slice(0, 32) : null)
            const preferEmail = /por email|prefiero email|por correo|sin telegram/i.test(msgTrim) && !telegramFromMessage
            const telegramUsername = preferEmail ? '' : (telegramFromMessage || '').trim()
            if (TELEGRAM_BOT_TOKEN && TELEGRAM_ADMIN_CHAT_ID) {
              const userInfo = [userName, userEmail].filter(Boolean).join(' · ') || (userId ? `Usuario ${userId}` : 'Usuario')
              const tgLine = telegramUsername ? `\nTelegram para contactarle: @${telegramUsername}` : '\nPreferencia: contactar por email'
              const lastMessages = Array.isArray(history) && history.length
                ? history.slice(-4).map((m) => `${m.role === 'user' ? 'Usuario' : 'Soporte'}: ${(m.text || '').slice(0, 200)}`).join('\n')
                : ''
              const text = `🆘 Soporte — Usuario pide contactar con el equipo de soporte\n\n${userInfo}${tgLine}\n\nÚltimos mensajes:\n${lastMessages || '(sin historial)'}\n\nMensaje actual: ${msgTrim.slice(0, 300)}\n\nResponde por email o por Telegram al usuario. App: ${APP_URL}`
              try {
                const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: TELEGRAM_ADMIN_CHAT_ID, text }),
                })
                if (tgRes.ok) {
                  console.log('[support-chat] Telegram enviado: usuario pidió contacto con equipo')
                } else {
                  console.error('[support-chat] Telegram falló:', tgRes.status, await tgRes.text())
                }
              } catch (e) {
                console.error('[support-chat] Telegram error:', e.message)
              }
            } else {
              console.warn('[support-chat] Escalado sin Telegram: faltan TELEGRAM_BOT_TOKEN o TELEGRAM_ADMIN_CHAT_ID')
            }
            return sendJson(res, 200, {
              reply: 'He avisado al equipo de soporte. Te contactarán pronto por email o por Telegram si nos dejaste tu usuario.',
              escalated: true,
            })
          }

          if (!message || typeof message !== 'string' || !msgTrim) {
            return sendJson(res, 400, { error: 'message required' })
          }
          if (!GROQ_API_KEY) {
            return sendJson(res, 503, { error: 'Soporte no configurado (falta GROQ_API_KEY en .env). Crea una en https://console.groq.com' })
          }

          const contents = []
          if (Array.isArray(history) && history.length) {
            for (const m of history) {
              const role = m.role === 'model' || m.role === 'assistant' ? 'model' : 'user'
              const text = (m.text || m.content || '').toString().trim()
              if (text) contents.push({ role, parts: [{ text }] })
            }
          }
          contents.push({ role: 'user', parts: [{ text: message.trim() }] })

          const genBody = {
            systemInstruction: { parts: [{ text: SUPPORT_SYSTEM_PROMPT }] },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
          }
          const gen = await groqGenerate(GROQ_API_KEY, GROQ_MODEL, genBody)
          if (!gen.ok) {
            const errMsg = gen.data?.error?.message || gen.data?.error?.code || `API ${gen.status}` || 'Groq no disponible'
            console.error('[support-chat] Groq error:', errMsg)
            const reply = `El soporte no pudo responder ahora (${errMsg}). Prueba en un momento o pide contactar con el equipo de soporte.`
            return sendJson(res, 200, { reply })
          }
          const candidate = gen.data?.candidates?.[0]
          const textPart = candidate?.content?.parts?.[0]?.text
          const reply = textPart ? String(textPart).trim() : 'No pude generar una respuesta. Prueba de nuevo o pide contactar con el equipo de soporte.'
          return sendJson(res, 200, { reply })
        } catch (e) {
          console.error('[support-chat]', e.message)
          return sendJson(res, 500, { error: e.message || 'Error en el soporte' })
        }
      })
    },
  }
}
