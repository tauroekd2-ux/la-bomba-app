import express from 'express'
import cors from 'cors'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '.env')
dotenv.config({ path: envPath })

let SUPABASE_URL = ''
try {
  const cfg = createRequire(import.meta.url)(join(__dirname, 'supabase-config.cjs'))
  if (cfg?.url) SUPABASE_URL = cfg.url
} catch (_) {}
SUPABASE_URL = (SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim()

/** Si la petición lleva Authorization: Bearer <jwt>, verifica que el usuario sea admin (admin_roles). Así el cliente no necesita enviar el secret. */
async function isAdminRequest(req) {
  const auth = (req.headers?.authorization || '').trim()
  if (!auth.startsWith('Bearer ')) return false
  const token = auth.slice(7)
  const userRes = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  })
  if (!userRes.ok) return false
  const user = await userRes.json().catch(() => null)
  const userId = user?.id
  if (!userId) return false
  const roleRes = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/admin_roles?user_id=eq.${encodeURIComponent(userId)}&select=user_id`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
  })
  const roles = await roleRes.json().catch(() => [])
  return Array.isArray(roles) && roles.length > 0
}
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim()
const RESEND_FROM = (process.env.RESEND_FROM || 'LA BOMBA <onboarding@resend.dev>').trim()
const DEPOSIT_EMAIL_SECRET = (process.env.DEPOSIT_EMAIL_SECRET || '').trim()
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim()
const TELEGRAM_ADMIN_CHAT_ID = (process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim()
const TELEGRAM_USER_BOT_TOKEN = (process.env.TELEGRAM_USER_BOT_TOKEN || '').trim()
const TELEGRAM_NOTIFY_SECRET = (process.env.TELEGRAM_NOTIFY_SECRET || '').trim()
const NTFY_TOPIC = (process.env.VITE_NTFY_TOPIC || process.env.NTFY_TOPIC || '').trim().replace(/-/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
// Groq: IA en línea gratis (soporte y asistente admin). API key en https://console.groq.com
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim()
const GROQ_MODEL = (process.env.GROQ_MODEL || 'llama-3.1-8b-instant').trim()

/** Convierte body (systemInstruction, contents) a mensajes y llama a Groq Chat Completions (OpenAI-compatible) */
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
    model: model || GROQ_MODEL,
    messages,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.7,
    max_tokens: typeof opts.maxOutputTokens === 'number' ? opts.maxOutputTokens : 1024,
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
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
const TELEGRAM_WEBHOOK_SECRET = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim()
// URL base de los enlaces Aprobar/Rechazar en Telegram. Debe ser accesible desde el móvil (no localhost si abres Telegram en el teléfono). Ej: http://192.168.1.x:3031 o https://tu-dominio.com
const ADMIN_LINKS_BASE = (process.env.ADMIN_LINKS_BASE || process.env.VITE_PROXY_URL || `http://localhost:${3031}`).replace(/\/$/, '')
const PORT = Number(process.env.PORT) || 3031
const MASTER_BASE = (process.env.VITE_MASTER_WALLET_BASE || process.env.MASTER_WALLET_BASE || '').trim()
const MASTER_POLYGON = (process.env.VITE_MASTER_WALLET_POLYGON || process.env.MASTER_WALLET_POLYGON || '').trim()
const MASTER_SOLANA = (process.env.VITE_MASTER_WALLET_SOLANA || process.env.MASTER_WALLET_SOLANA || '').trim()
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

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

if (!SUPABASE_URL.startsWith('https://')) {
  console.error('Falta VITE_SUPABASE_URL en .env')
  process.exit(1)
}

const app = express()
const allowedOrigin = (process.env.VITE_APP_URL || process.env.APP_URL || '').replace(/\/$/, '')
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // p.ej. Postman o mismo origen
    if (/^http:\/\/localhost:51\d{2}$/.test(origin)) return cb(null, true)
    if (/^http:\/\/127\.0\.0\.1:51\d{2}$/.test(origin)) return cb(null, true)
    if (/^http:\/\/192\.168\.\d+\.\d+:51\d{2}$/.test(origin)) return cb(null, true)
    if (allowedOrigin && origin === allowedOrigin) return cb(null, true)
    if (/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin)) return cb(null, true)
    cb(null, false)
  },
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.text())

// Raíz: para confirmar que es este proxy
app.get('/', (req, res) => {
  res.type('text').send('Proxy LA BOMBA. Prueba ntfy: http://localhost:3031/api/ntfy-test')
})

// GET /api
app.get('/api', (req, res) => {
  res.json({ proxy: true, ntfy_test: 'GET http://localhost:3031/api/ntfy-test' })
})

// Comprobar que este es el proxy con la ruta de email (GET devuelve 405)
app.get('/api/send-deposit-email', (req, res) => {
  res.status(405).json({ error: 'Use POST', ok: true })
})

// Envío de email al acreditar depósito (sin Supabase Edge/Webhooks). Resend + Supabase solo para leer perfil.
app.post('/api/send-deposit-email', async (req, res) => {
  try {
    const { user_id, monto, red, secret } = req.body || {}
    const secretOk = DEPOSIT_EMAIL_SECRET && secret === DEPOSIT_EMAIL_SECRET
    const adminOk = await isAdminRequest(req)
    if (!secretOk && !adminOk) {
      console.log('[send-deposit-email] 403 invalid secret or not admin')
      return res.status(403).json({ error: 'Invalid secret or not admin' })
    }
    if (!user_id || !Number(monto) || Number(monto) <= 0) {
      console.log('[send-deposit-email] 400 missing user_id or monto')
      return res.status(400).json({ error: 'Missing user_id or monto' })
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.log('[send-deposit-email] 500 SUPABASE_SERVICE_ROLE_KEY not set')
      return res.status(500).json({ error: 'Server: SUPABASE_SERVICE_ROLE_KEY not set' })
    }
    const base = SUPABASE_URL.replace(/\/$/, '')
    const profileRes = await fetch(
      `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(user_id)}&select=email,full_name`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )
    const profiles = await profileRes.json()
    const profile = Array.isArray(profiles) ? profiles[0] : null
    if (!profile?.email) {
      console.log('[send-deposit-email] skipped: no email for user', user_id)
      return res.status(200).json({ ok: true, skipped: 'no_email' })
    }
    if (!RESEND_API_KEY) {
      console.log('[send-deposit-email] skipped: RESEND_API_KEY not set in .env')
      return res.status(200).json({ ok: true, skipped: 'no_resend_key' })
    }
    const nombre = profile.full_name || 'Usuario'
    const redLabel = red ? ` (${red})` : ''
    const montoNum = Number(monto)
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [profile.email],
        subject: 'Depósito acreditado en LA BOMBA',
        html: `<p>Hola ${nombre},</p><p>Tu depósito ha sido acreditado.</p><p><strong>+$${montoNum.toFixed(2)}</strong>${redLabel} ya están en tu saldo.</p><p>Puedes usarlos para jugar en la app.</p><p>— LA BOMBA</p>`,
      }),
    })
    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.error('[send-deposit-email] Resend error:', resendRes.status, errText)
      return res.status(502).json({ error: 'Email send failed', details: errText })
    }
    const data = await resendRes.json()
    console.log('[send-deposit-email] ok sent to', profile.email, 'id', data.id)
    res.status(200).json({ ok: true, id: data.id })
  } catch (e) {
    console.error('send-deposit-email error:', e.message)
    res.status(500).json({ error: e.message || 'Server error' })
  }
})

// Email al usuario cuando el admin marca su retiro como procesado
app.post('/api/send-retiro-procesado-email', async (req, res) => {
  try {
    const { user_id, monto, red, secret } = req.body || {}
    const secretOk = DEPOSIT_EMAIL_SECRET && secret === DEPOSIT_EMAIL_SECRET
    const adminOk = await isAdminRequest(req)
    if (!secretOk && !adminOk) {
      return res.status(403).json({ error: 'Invalid secret or not admin' })
    }
    if (!user_id || !Number(monto) || Number(monto) <= 0) {
      return res.status(400).json({ error: 'Missing user_id or monto' })
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Server: SUPABASE_SERVICE_ROLE_KEY not set' })
    }
    const base = SUPABASE_URL.replace(/\/$/, '')
    const profileRes = await fetch(
      `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(user_id)}&select=email,full_name`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )
    const profiles = await profileRes.json()
    const profile = Array.isArray(profiles) ? profiles[0] : null
    if (!profile?.email) {
      return res.status(200).json({ ok: true, skipped: 'no_email' })
    }
    if (!RESEND_API_KEY) {
      return res.status(200).json({ ok: true, skipped: 'no_resend_key' })
    }
    const nombre = profile.full_name || 'Usuario'
    const redLabel = red ? ` (${red})` : ''
    const montoNum = Number(monto)
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [profile.email],
        subject: 'Tu retiro ha sido procesado – LA BOMBA',
        html: `<p>Hola ${nombre},</p><p>Tu retiro de <strong>$${montoNum.toFixed(2)}</strong>${redLabel} ha sido procesado.</p><p>Los fondos han sido enviados a la dirección indicada.</p><p>— LA BOMBA</p>`,
      }),
    })
    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.error('[send-retiro-procesado-email] Resend error:', resendRes.status, errText)
      return res.status(502).json({ error: 'Email send failed', details: errText })
    }
    const data = await resendRes.json()
    console.log('[send-retiro-procesado-email] ok sent to', profile.email)
    res.status(200).json({ ok: true, id: data.id })
  } catch (e) {
    console.error('send-retiro-procesado-email error:', e.message)
    res.status(500).json({ error: e.message || 'Server error' })
  }
})

// Telegram al usuario (depósito acreditado, retiro procesado). Solo admin con JWT. Token del bot de usuarios en el proxy.
app.post('/api/send-telegram-to-user', async (req, res) => {
  try {
    const adminOk = await isAdminRequest(req)
    if (!adminOk) {
      return res.status(403).json({ ok: false, error: 'No autorizado' })
    }
    const { chat_id, text } = req.body || {}
    const cid = (chat_id ?? '').toString().trim()
    const msg = typeof text === 'string' ? text.trim() : ''
    if (!cid || !msg) {
      return res.status(400).json({ ok: false, error: 'Faltan chat_id o text' })
    }
    if (!TELEGRAM_USER_BOT_TOKEN) {
      console.log('[send-telegram-to-user] skipped: TELEGRAM_USER_BOT_TOKEN not set')
      return res.status(200).json({ ok: true, skipped: 'telegram_user_bot_not_configured' })
    }
    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_USER_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cid, text: msg }),
    })
    const body = await tgRes.json().catch(() => ({}))
    if (!tgRes.ok) {
      const errMsg = body.description || body.error_description || `HTTP ${tgRes.status}`
      console.error('[send-telegram-to-user] Telegram API', tgRes.status, errMsg)
      return res.status(200).json({ ok: false, error: errMsg })
    }
    console.log('[send-telegram-to-user] ok chat_id', cid)
    res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[send-telegram-to-user]', e.message)
    res.status(500).json({ ok: false, error: e.message || 'Server error' })
  }
})

// Prueba: abre http://localhost:3031/api/ntfy-test y deberías recibir una notificación en ntfy (tema labomba_admin)
app.get('/api/ntfy-test', async (req, res) => {
  try {
    if (!NTFY_TOPIC) {
      return res.status(200).json({ ok: false, error: 'VITE_NTFY_TOPIC no está en .env' })
    }
    const ntfyRes = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: 'POST',
      headers: { Title: 'LA BOMBA – Prueba' },
      body: 'Si ves esto, ntfy y el proxy funcionan.',
    })
    if (!ntfyRes.ok) {
      const errText = await ntfyRes.text()
      console.error('[ntfy-test] error:', ntfyRes.status, errText)
      return res.status(502).json({ ok: false, error: errText })
    }
    console.log('[ntfy-test] enviado')
    res.status(200).json({ ok: true, message: 'Notificación enviada. Revisa ntfy (tema ' + NTFY_TOPIC + ').' })
  } catch (e) {
    console.error('[ntfy-test]', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Notificación al admin por ntfy.sh (el proxy envía). Body: { title, message }
app.post('/api/ntfy-notify', async (req, res) => {
  try {
    const { title, message } = req.body || {}
    console.log('[ntfy-notify] request', { title, message: message ? message.slice(0, 50) + '...' : null, topic: NTFY_TOPIC || '(vacío)' })
    if (!NTFY_TOPIC) {
      return res.status(200).json({ ok: true, skipped: 'no_ntfy_topic' })
    }
    if (!message) {
      return res.status(400).json({ error: 'message required' })
    }
    const ntfyRes = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: 'POST',
      headers: title ? { Title: title } : {},
      body: message,
    })
    if (!ntfyRes.ok) {
      const errText = await ntfyRes.text()
      console.error('[ntfy-notify] ntfy error:', ntfyRes.status, errText)
      return res.status(502).json({ error: 'ntfy failed', details: errText })
    }
    console.log('[ntfy-notify] ok', title || '')
    res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[ntfy-notify] error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Notificación al admin por Telegram (retiros/depósitos pendientes). Todo desde la página → proxy, sin Supabase.
app.post('/api/telegram-admin-notify', async (req, res) => {
  try {
    const { type, monto, red, userName, userEmail, wallet_destino, secret } = req.body || {}
    console.log('[telegram-admin-notify] request', { type, monto, red, hasSecret: !!secret, secretOk: !TELEGRAM_NOTIFY_SECRET || secret === TELEGRAM_NOTIFY_SECRET })
    if (TELEGRAM_NOTIFY_SECRET && secret !== TELEGRAM_NOTIFY_SECRET) {
      console.log('[telegram-admin-notify] 403 invalid secret')
      return res.status(403).json({ error: 'Invalid secret' })
    }
    if (!type || !['retiro', 'deposito'].includes(type)) {
      return res.status(400).json({ error: 'type must be "retiro" or "deposito"' })
    }
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) {
      console.log('[telegram-admin-notify] skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID not set')
      return res.status(200).json({ ok: true, skipped: 'telegram_not_configured' })
    }
    const montoNum = Number(monto)
    const redLabel = red ? ` (${red})` : ''
    const userInfo = [userName, userEmail].filter(Boolean).join(' · ') || 'Usuario'
    const masterWallet = red === 'base' ? MASTER_BASE : red === 'polygon' ? MASTER_POLYGON : red === 'solana' ? MASTER_SOLANA : ''
    const masterLine = masterWallet ? `\nWallet maestra (${red}): ${masterWallet}` : ''
    // Sin parse_mode para evitar fallos con caracteres raros en nombre/email
    let text
    if (type === 'retiro') {
      text = `🔔 Nuevo retiro pendiente\n\n$${montoNum.toFixed(2)}${redLabel}\nUsuario: ${userInfo}${wallet_destino ? `\nDestino: ${String(wallet_destino).slice(0, 24)}...` : ''}${masterLine}`
    } else {
      text = `🔔 Nueva confirmación de depósito pendiente\n\n$${montoNum.toFixed(2)}${redLabel}\nUsuario: ${userInfo}${masterLine}`
    }
    const tgRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_ADMIN_CHAT_ID,
          text,
        }),
      }
    )
    const errText = await tgRes.text()
    if (!tgRes.ok) {
      console.error('[telegram-admin-notify] Telegram API error:', tgRes.status, errText)
      return res.status(502).json({ error: 'Telegram send failed', details: errText })
    }
    console.log('[telegram-admin-notify] ok', type, montoNum)
    res.status(200).json({ ok: true })
  } catch (e) {
    console.error('telegram-admin-notify error:', e.message)
    res.status(500).json({ error: e.message || 'Server error' })
  }
})

// Soporte con Gemini: chat con IA que conoce la app; si no puede ayudar, avisa al admin por Telegram
app.post('/api/support-chat', async (req, res) => {
  try {
    const { message, history = [], userId, userEmail, userName } = req.body || {}
    const proxyUrl = (process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5174').replace(/\/$/, '')
    const msgTrim = typeof message === 'string' ? message.trim() : ''

    // Escalar cuando el usuario responde a la pregunta "¿tienes usuario de Telegram?" (la IA lo pide antes)
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
        const text = `🆘 Soporte — Usuario pide contactar con el equipo de soporte\n\n${userInfo}${tgLine}\n\nÚltimos mensajes:\n${lastMessages || '(sin historial)'}\n\nMensaje actual: ${msgTrim.slice(0, 300)}\n\nResponde por email o por Telegram al usuario. App: ${proxyUrl}`
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
      return res.status(200).json({
        reply: 'He avisado al equipo de soporte. Te contactarán pronto por email o por Telegram si nos dejaste tu usuario.',
        escalated: true,
      })
    }

    if (!message || typeof message !== 'string' || !msgTrim) {
      return res.status(400).json({ error: 'message required' })
    }
    if (!GROQ_API_KEY) {
      return res.status(503).json({ error: 'Soporte no configurado (falta GROQ_API_KEY). Crea una en https://console.groq.com' })
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

    const body = {
      systemInstruction: { parts: [{ text: SUPPORT_SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    }
    const gen = await groqGenerate(GROQ_API_KEY, GROQ_MODEL, body)
    if (!gen.ok) {
      const errMsg = gen.data?.error?.message || gen.data?.error?.code || `API ${gen.status}` || 'Groq no disponible'
      const reply = `El soporte no pudo responder ahora (${errMsg}). Prueba en un momento o pide contactar con el equipo de soporte.`
      return res.status(200).json({ reply })
    }
    const candidate = gen.data?.candidates?.[0]
    const textPart = candidate?.content?.parts?.[0]?.text
    const reply = textPart ? String(textPart).trim() : 'No pude generar una respuesta. Prueba de nuevo o pide contactar con el equipo de soporte.'

    res.status(200).json({ reply })
  } catch (e) {
    console.error('[support-chat] error:', e.message)
    res.status(500).json({ error: e.message || 'Error en el soporte' })
  }
})

// --- Admin: chat asistente con contexto de la app (usuarios, depósitos, retiros, estadísticas) ---
const ADMIN_CHAT_SYSTEM = `Eres el asistente del administrador de LA BOMBA (app de juego 1v1 con apuestas en USDC).
Tienes acceso a la siguiente información actualizada. Responde en español, de forma clara y breve.
Si te preguntan por nombres, correos, montos de depósitos/retiros, ganancias o cualquier dato administrativo, usa solo la información proporcionada abajo.
Si no tienes el dato, dilo. No inventes cifras ni usuarios.`

app.post('/api/admin/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body || {}
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message required' })
    }
    if (!GROQ_API_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({ error: 'Falta GROQ_API_KEY (https://console.groq.com) o SUPABASE_SERVICE_ROLE_KEY en el proxy' })
    }
    const base = SUPABASE_URL.replace(/\/$/, '')
    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    }
    const [depRes, retRes, profRes, confRes, retListRes] = await Promise.all([
      fetch(`${base}/rest/v1/confirmaciones_deposito?estado=eq.acreditado&select=monto`, { headers }),
      fetch(`${base}/rest/v1/retiros_phantom?estado=eq.procesado&select=monto`, { headers }),
      fetch(`${base}/rest/v1/profiles?select=id,full_name,email,balance&order=updated_at.desc&limit=50`, { headers }),
      fetch(`${base}/rest/v1/confirmaciones_deposito?select=id,user_id,red,monto,estado,created_at&order=created_at.desc&limit=15`, { headers }),
      fetch(`${base}/rest/v1/retiros_phantom?select=id,user_id,red,monto,estado,wallet_destino,created_at&order=created_at.desc&limit=15`, { headers }),
    ])
    const depósitos = await depRes.json().catch(() => [])
    const retiros = await retRes.json().catch(() => [])
    const perfiles = await profRes.json().catch(() => [])
    const confirmaciones = await confRes.json().catch(() => [])
    const retirosLista = await retListRes.json().catch(() => [])
    const totalDep = (Array.isArray(depósitos) ? depósitos : []).reduce((s, d) => s + Number(d.monto || 0), 0)
    const totalRet = (Array.isArray(retiros) ? retiros : []).reduce((s, r) => s + Number(r.monto || 0), 0)
    const numRetiros = (Array.isArray(retiros) ? retiros : []).length
    const gananciasComisiones = numRetiros * COMISION_RETIRO
    let context = `ESTADÍSTICAS:\n- Total USDC ingresado (depósitos acreditados): $${totalDep.toFixed(2)}\n- Total USDC retirado (procesados): $${totalRet.toFixed(2)}\n- Ganancias (solo comisiones de retiros, $${COMISION_RETIRO} por retiro): $${gananciasComisiones.toFixed(2)}\n\n`
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
    const gen = await groqGenerate(GROQ_API_KEY, GROQ_MODEL, {
      systemInstruction: { parts: [{ text: systemWithContext }] },
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    })
    if (!gen.ok) {
      const errMsg = gen.data?.error?.message || gen.data?.error?.code || 'Groq no disponible'
      return res.status(200).json({ reply: errMsg || 'No se pudo generar respuesta.' })
    }
    const data = gen.data
    const candidate = data?.candidates?.[0]
    const textPart = candidate?.content?.parts?.[0]?.text
    const reply = textPart ? String(textPart).trim() : 'No se pudo generar respuesta.'
    res.status(200).json({ reply })
  } catch (e) {
    console.error('[admin-chat]', e.message)
    res.status(500).json({ error: e.message || 'Error' })
  }
})

// --- Admin: verificar depósito por hash y enviar a Telegram con botones Aprobar/Rechazar ---
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
}
// ERC20 Transfer(address,address,uint256) topic0
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

function parseReceiptTransferTo(contractAddress, receipt) {
  const logs = receipt?.logs || []
  const wantTopic = TRANSFER_TOPIC.toLowerCase()
  const usdcLogs = logs.filter((l) => {
    const addr = (l.address ?? l.contractAddress ?? l.Address ?? '').toString().toLowerCase()
    const topics = l.topics ?? l.Topics ?? []
    const t0 = (topics[0] ?? '').toString().toLowerCase()
    return addr === contractAddress.toLowerCase() && t0 === wantTopic
  })
  const results = []
  for (const masterLog of usdcLogs) {
    const topics = masterLog.topics ?? masterLog.Topics ?? []
    if (!topics[2]) continue
    const toHex = String(topics[2]).replace(/^0x/, '')
    const toAddress = ('0x' + toHex.slice(-40)).toLowerCase()
    const valueHex = masterLog.data || '0x0'
    const value = BigInt(valueHex)
    results.push({ to: toAddress, value })
  }
  return results
}

function normalizeEvmAddress(addr) {
  const s = String(addr || '').toLowerCase().replace(/^0x/, '').replace(/[^0-9a-f]/g, '')
  return s.length >= 40 ? '0x' + s.slice(-40) : ''
}

async function verifyDepositTx(red, txHash, masterAddress) {
  const hash = (txHash || '').trim()
  if (!hash || !masterAddress) return { ok: false, confirmado: false, monto_detectado: null, wallet_incorrecta: false, error: 'Hash o dirección maestra faltante' }

  if (red === 'base') {
    const receiptUrl = `https://api.basescan.org/api?module=proxy&action=eth_getTransactionReceipt&txhash=${encodeURIComponent(hash)}`
    const receiptRes = await fetch(receiptUrl).then((r) => r.json()).catch(() => ({}))
    const receipt = receiptRes?.result
    if (!receipt || receipt.status !== '0x1') return { ok: true, confirmado: false, monto_detectado: null, wallet_incorrecta: false, error: 'Tx no confirmada o no encontrada' }
    const transfers = parseReceiptTransferTo(USDC_BASE, receipt)
    if (!transfers.length) return { ok: true, confirmado: false, monto_detectado: null, wallet_incorrecta: true, destino_tx: null, error: 'No se detectó transferencia USDC. Revisa en el explorador que el destino sea la wallet maestra.' }
    const masterNorm = normalizeEvmAddress(masterAddress)
    const wrongDest = transfers.find((t) => normalizeEvmAddress(t.to) !== masterNorm)
    if (wrongDest) return { ok: true, confirmado: false, monto_detectado: null, wallet_incorrecta: true, destino_tx: wrongDest.to, error: 'El depósito NO fue a la wallet maestra de Base' }
    const toMaster = transfers.find((t) => normalizeEvmAddress(t.to) === masterNorm)
    if (toMaster) return { ok: true, confirmado: true, monto_detectado: Number(toMaster.value) / 1e6, wallet_incorrecta: false }
    return { ok: true, confirmado: false, monto_detectado: null, wallet_incorrecta: true, destino_tx: transfers[0].to, error: 'El depósito NO fue a la wallet maestra de Base' }
  }

  if (red === 'polygon') {
    const receiptUrl = `https://api.polygonscan.com/api?module=proxy&action=eth_getTransactionReceipt&txhash=${encodeURIComponent(hash)}`
    const receiptRes = await fetch(receiptUrl).then((r) => r.json()).catch(() => ({}))
    const receipt = receiptRes?.result
    if (!receipt || receipt.status !== '0x1') return { ok: true, confirmado: false, monto_detectado: null, wallet_incorrecta: false, error: 'Tx no confirmada o no encontrada' }
    const transfers = parseReceiptTransferTo(USDC_POLYGON, receipt)
    if (!transfers.length) return { ok: true, confirmado: false, monto_detectado: null, wallet_incorrecta: true, destino_tx: null, error: 'No se detectó transferencia USDC. Revisa en el explorador que el destino sea la wallet maestra.' }
    const masterNorm = normalizeEvmAddress(masterAddress)
    const wrongDest = transfers.find((t) => normalizeEvmAddress(t.to) !== masterNorm)
    if (wrongDest) return { ok: true, confirmado: false, monto_detectado: null, wallet_incorrecta: true, destino_tx: wrongDest.to, error: 'El depósito NO fue a la wallet maestra de Polygon' }
    const toMaster = transfers.find((t) => normalizeEvmAddress(t.to) === masterNorm)
    if (toMaster) return { ok: true, confirmado: true, monto_detectado: Number(toMaster.value) / 1e6, wallet_incorrecta: false }
    return { ok: true, confirmado: false, monto_detectado: null, wallet_incorrecta: true, destino_tx: transfers[0].to, error: 'El depósito NO fue a la wallet maestra de Polygon' }
  }

  if (red === 'solana') {
    try {
      const solanaRpc = 'https://api.mainnet-beta.solana.com'
      const parsedRes = await fetch(solanaRpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getParsedTransaction',
          params: [hash, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
        }),
      }).then((r) => r.json()).catch(() => ({}))
      const tx = parsedRes?.result
      if (!tx || tx.meta?.err) return { ok: true, confirmado: false, monto_detectado: null, wallet_incorrecta: false, error: 'Tx no confirmada o no encontrada' }
      const instructions = tx.transaction?.message?.instructions || []
      const inner = tx.meta?.innerInstructions || []
      const allInners = inner.flatMap((ii) => ii.instructions || [])
      const SPL_TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
      const accountKeys = (tx.transaction?.message?.accountKeys || []).map((k) => (typeof k === 'string' ? k : (k && k.pubkey) || ''))
      function getTransferFromInstruction(inst) {
        const programId = (inst.programIdIndex != null ? accountKeys[inst.programIdIndex] : null) || inst.programId
        if (programId !== SPL_TOKEN) return null
        const p = inst.parsed?.info
        const dest = p?.destination || p?.dest
        if (!dest) return null
        const amount = p?.tokenAmount?.uiAmount ?? (p?.amount != null ? Number(p.amount) / 1e6 : null)
        return { dest, amount }
      }
      const transfers = []
      for (const inst of instructions) {
        const t = getTransferFromInstruction(inst)
        if (t) transfers.push(t)
      }
      for (const inst of allInners) {
        const t = getTransferFromInstruction(inst)
        if (t) transfers.push(t)
      }
      if (transfers.length === 0) return { ok: true, confirmado: false, monto_detectado: null, wallet_incorrecta: false, error: 'No se detectó transferencia SPL en esta tx' }
      const masterSol = (masterAddress || '').trim()
      let monto_detectado = null
      for (const { dest: tokenAccount, amount: instAmount } of transfers) {
        const accRes = await fetch(solanaRpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAccountInfo',
            params: [tokenAccount, { encoding: 'jsonParsed' }],
          }),
        }).then((r) => r.json()).catch(() => ({}))
        const owner = accRes?.result?.value?.data?.parsed?.info?.owner
        if (!owner) continue
        if (owner !== masterSol) return { ok: true, confirmado: false, monto_detectado: null, wallet_incorrecta: true, destino_tx: owner, error: 'El depósito NO fue a la wallet maestra de Solana' }
        if (instAmount != null && monto_detectado == null) monto_detectado = instAmount
        else if (monto_detectado == null) monto_detectado = accRes?.result?.value?.data?.parsed?.info?.tokenAmount?.uiAmount ?? null
      }
      return { ok: true, confirmado: true, monto_detectado, wallet_incorrecta: false }
    } catch (_) {
      return { ok: false, confirmado: false, monto_detectado: null, wallet_incorrecta: false, error: 'No se pudo verificar en Solana RPC' }
    }
  }
  return { ok: false, confirmado: false, monto_detectado: null, wallet_incorrecta: false, error: 'Red no soportada' }
}

app.post('/api/admin/verify-and-notify-deposit', async (req, res) => {
  try {
    const { confirmacion_id, secret } = req.body || {}
    const cid = (confirmacion_id || '').trim()
    if (!cid || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) {
      return res.status(400).json({ error: 'Faltan confirmacion_id o configuración (proxy/Telegram)' })
    }
    const base = SUPABASE_URL.replace(/\/$/, '')
    const confRes = await fetch(
      `${base}/rest/v1/confirmaciones_deposito?id=eq.${encodeURIComponent(cid)}&select=id,user_id,red,monto,tx_hash,estado,profiles(full_name,email)`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )
    const confs = await confRes.json().catch(() => [])
    const conf = Array.isArray(confs) ? confs[0] : null
    if (!conf || conf.estado !== 'pendiente') {
      return res.status(404).json({ error: 'Confirmación no encontrada o ya procesada' })
    }
    const red = conf.red || ''
    const master = red === 'base' ? MASTER_BASE : red === 'polygon' ? MASTER_POLYGON : MASTER_SOLANA
    const txHash = (conf.tx_hash || '').trim()
    if (!txHash) return res.status(400).json({ error: 'La confirmación no tiene tx_hash' })
    const verify = await verifyDepositTx(red, txHash, master)
    if (verify.wallet_incorrecta) console.log('[verify-and-notify] WALLET INCORRECTA detectada', { red, destino_tx: verify.destino_tx, confirmacion_id: cid })
    const userName = conf.profiles?.full_name || conf.profiles?.email || conf.user_id || 'Usuario'
    const montoConf = Number(conf.monto) || 0
    const montoDet = verify.monto_detectado != null ? verify.monto_detectado.toFixed(2) : '?'
    const explorer = red === 'base' ? `https://basescan.org/tx/${txHash}` : red === 'polygon' ? `https://polygonscan.com/tx/${txHash}` : `https://solscan.io/tx/${txHash}`
    const linkSecret = encodeURIComponent(TELEGRAM_WEBHOOK_SECRET || '')
    const linkAprob = linkSecret ? `${ADMIN_LINKS_BASE}/api/admin/approve-deposit?secret=${linkSecret}&id=${encodeURIComponent(cid)}` : ''
    const linkRech = linkSecret ? `${ADMIN_LINKS_BASE}/api/admin/reject-deposit?secret=${linkSecret}&id=${encodeURIComponent(cid)}` : ''
    const destinoIncorrecto = verify.destino_tx ? `\nDirección a la que envió (incorrecta): <code>${escapeHtml(verify.destino_tx)}</code>` : ''
    const avisoWalletIncorrecta = verify.wallet_incorrecta
      ? `\n\n⚠️ ADVERTENCIA: LA WALLET DE DESTINO ES INCORRECTA. EL USUARIO ENVIÓ LOS FONDOS A UNA DIRECCIÓN QUE NO ES LA WALLET MAESTRA DE LA APP. NO APROBAR ESTE DEPÓSITO.${destinoIncorrecto}\n\n`
      : ''
    const linkAprobEsc = escapeHtml(linkAprob)
    const linkRechEscDep = escapeHtml(linkRech)
    const linksPart = linkAprob
      ? `\n\n✅ <a href="${linkAprobEsc}">Aprobar</a>\n❌ <a href="${linkRechEscDep}">Rechazar</a>`
      : '\n\n(Configura TELEGRAM_WEBHOOK_SECRET y ADMIN_LINKS_BASE para enlaces.)'
    const masterWalletLine = master ? `\n\nWallet maestra (${red}): <code>${escapeHtml(master)}</code>` : ''
    const beforeHash = `${avisoWalletIncorrecta}📥 DEPÓSITO\nRed: ${red}\nHash: `
    const afterHash = `\nMonto declarado: $${montoConf.toFixed(2)} USDC\nMonto detectado: $${montoDet} USDC\nUsuario: ${escapeHtml(userName)}\n${escapeHtml(explorer)}${linksPart}${masterWalletLine}`
    const text = escapeHtml(beforeHash) + '<code>' + escapeHtml(txHash) + '</code>' + afterHash
    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    }).catch((e) => {
      console.error('[verify-and-notify] Telegram error', e.message)
      return null
    })
    if (!tgRes || !tgRes.ok) {
      const errBody = tgRes ? await tgRes.text().catch(() => '') : ''
      let errMsg = 'Sin conexión con Telegram'
      if (tgRes) {
        try {
          const j = JSON.parse(errBody || '{}')
          errMsg = j.description || errBody || `HTTP ${tgRes.status}`
        } catch (_) {
          errMsg = errBody || `HTTP ${tgRes.status}`
        }
      }
      console.error('[verify-and-notify] Telegram API', tgRes?.status, errMsg)
      return res.status(200).json({ ok: false, error: `Telegram: ${errMsg}` })
    }
    res.status(200).json({ ok: true, telegram_sent: true, verified: verify })
  } catch (e) {
    console.error('[verify-and-notify]', e.message)
    res.status(500).json({ error: e.message || 'Error' })
  }
})

const COMISION_RETIRO = 0.5

app.post('/api/admin/notify-retiro', async (req, res) => {
  try {
    const { retiro_id } = req.body || {}
    const rid = (retiro_id || '').trim()
    if (!rid || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) {
      return res.status(400).json({ error: 'Faltan retiro_id o configuración' })
    }
    const base = SUPABASE_URL.replace(/\/$/, '')
    const retRes = await fetch(
      `${base}/rest/v1/retiros_phantom?id=eq.${encodeURIComponent(rid)}&select=id,user_id,red,monto,wallet_destino,estado,profiles(full_name,email)`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )
    const rets = await retRes.json().catch(() => [])
    const ret = Array.isArray(rets) ? rets[0] : null
    if (!ret || ret.estado !== 'pendiente') {
      return res.status(404).json({ error: 'Retiro no encontrado o ya procesado' })
    }
    const userName = ret.profiles?.full_name || ret.profiles?.email || ret.user_id || 'Usuario'
    const montoSolicitado = Number(ret.monto) || 0
    const montoAEnviar = Math.max(0, montoSolicitado - COMISION_RETIRO)
    const linkSecret = encodeURIComponent(TELEGRAM_WEBHOOK_SECRET || '')
    const linkAprobRet = linkSecret ? `${ADMIN_LINKS_BASE}/api/admin/approve-retiro?secret=${linkSecret}&id=${encodeURIComponent(rid)}` : ''
    const linkRech = linkSecret ? `${ADMIN_LINKS_BASE}/api/admin/reject-retiro?secret=${linkSecret}&id=${encodeURIComponent(rid)}` : ''
    const linkAprobRetEsc = escapeHtml(linkAprobRet)
    const linkRechEsc = escapeHtml(linkRech)
    const walletDest = (ret.wallet_destino || '').trim()
    const walletPart = walletDest ? `Dirección: <code>${escapeHtml(walletDest)}</code>\n` : ''
    const masterRet = ret.red === 'base' ? MASTER_BASE : ret.red === 'polygon' ? MASTER_POLYGON : ret.red === 'solana' ? MASTER_SOLANA : ''
    const masterRetLine = masterRet ? `\nWallet maestra (${ret.red}): <code>${escapeHtml(masterRet)}</code>` : ''
    const linkRechazarPart = linkRech ? `\n✅ <a href="${linkAprobRetEsc}">Aprobar</a> (marca como procesado)\n❌ <a href="${linkRechEsc}">Rechazar</a> (devuelve saldo)` : '\n(Configura TELEGRAM_WEBHOOK_SECRET y ADMIN_LINKS_BASE para enlaces.)'
    const textRetiro = `📤 RETIRO\nRed: ${ret.red}\nMonto a enviar: $${montoAEnviar.toFixed(2)} USDC (solicitado $${montoSolicitado.toFixed(2)} − comisión $${COMISION_RETIRO.toFixed(2)})\nUsuario: ${escapeHtml(userName)}\n${walletPart}${masterRetLine}${linkRechazarPart}`
    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_CHAT_ID,
        text: textRetiro,
        parse_mode: 'HTML',
      }),
    }).catch((e) => {
      console.error('[notify-retiro] Telegram error', e.message)
      return null
    })
    if (!tgRes || !tgRes.ok) {
      const errBody = tgRes ? await tgRes.text().catch(() => '') : ''
      let errMsg = 'Sin conexión con Telegram'
      if (tgRes) {
        try {
          const j = JSON.parse(errBody || '{}')
          errMsg = j.description || errBody || `HTTP ${tgRes.status}`
        } catch (_) {
          errMsg = errBody || `HTTP ${tgRes.status}`
        }
      }
      console.error('[notify-retiro] Telegram API', tgRes?.status, errMsg)
      return res.status(200).json({ ok: false, error: `Telegram: ${errMsg}` })
    }
    res.status(200).json({ ok: true, telegram_sent: true })
  } catch (e) {
    console.error('[notify-retiro]', e.message)
    res.status(500).json({ error: e.message || 'Error' })
  }
})

// Enlaces de Telegram: GET solo muestra confirmación (evita que la vista previa de Telegram ejecute la acción).
// La acción real se ejecuta solo con POST (al enviar el formulario de confirmación).
function htmlResp(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:sans-serif;max-width:360px;margin:2rem auto;padding:1rem;text-align:center;">${body}</body></html>`
}
function confirmPage(title, message, confirmLabel, confirmPath, secret, id, rejectPath) {
  const s = escapeHtml(secret)
  const i = escapeHtml(id)
  const form = `<form method="post" action="${escapeHtml(confirmPath)}" style="margin:1rem 0;"><input type="hidden" name="secret" value="${s}"><input type="hidden" name="id" value="${i}"><button type="submit" style="padding:0.5rem 1.5rem;font-size:1rem;cursor:pointer;background:#22c55e;color:#fff;border:none;border-radius:8px;">${escapeHtml(confirmLabel)}</button></form>`
  const cancel = rejectPath ? `<p><a href="${escapeHtml(rejectPath)}?secret=${s}&id=${i}" style="color:#888;">Cancelar / Rechazar</a></p>` : ''
  return htmlResp(title, `<p>${message}</p>${form}${cancel}`)
}

app.get('/api/admin/approve-deposit', (req, res) => {
  const secret = (req.query.secret || '').trim()
  const id = (req.query.id || '').trim()
  if (!id || secret !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(400).send(htmlResp('Error', '<p>Faltan parámetros o secret inválido.</p>'))
  }
  res.type('html').send(confirmPage('Depósito', '¿Acreditar este depósito?', 'Sí, acreditar', '/api/admin/approve-deposit', secret, id, '/api/admin/reject-deposit'))
})
app.post('/api/admin/approve-deposit', express.urlencoded({ extended: true }), async (req, res) => {
  const secret = (req.body?.secret || req.query?.secret || '').trim()
  const id = (req.body?.id || req.query?.id || '').trim()
  if (!id || secret !== TELEGRAM_WEBHOOK_SECRET || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(400).send(htmlResp('Error', '<p>Faltan parámetros o secret inválido.</p>'))
  }
  const base = SUPABASE_URL.replace(/\/$/, '')
  const r = await fetch(`${base}/rest/v1/rpc/acreditar_deposito_por_webhook`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_confirmacion_id: id, p_secret: secret }),
  })
  const result = await r.json().catch(() => ({}))
  const ok = result?.ok === true
  res.type('html').send(htmlResp('Depósito', ok ? '<p>✅ Depósito acreditado.</p>' : `<p>❌ ${result?.error || 'Error'}</p>`))
})

app.get('/api/admin/reject-deposit', (req, res) => {
  const secret = (req.query.secret || '').trim()
  const id = (req.query.id || '').trim()
  if (!id || secret !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(400).send(htmlResp('Error', '<p>Faltan parámetros o secret inválido.</p>'))
  }
  res.type('html').send(confirmPage('Depósito', '¿Rechazar este depósito?', 'Sí, rechazar', '/api/admin/reject-deposit', secret, id, '/api/admin/approve-deposit'))
})
app.post('/api/admin/reject-deposit', express.urlencoded({ extended: true }), async (req, res) => {
  const secret = (req.body?.secret || req.query?.secret || '').trim()
  const id = (req.body?.id || req.query?.id || '').trim()
  if (!id || secret !== TELEGRAM_WEBHOOK_SECRET || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(400).send(htmlResp('Error', '<p>Faltan parámetros o secret inválido.</p>'))
  }
  const base = SUPABASE_URL.replace(/\/$/, '')
  const r = await fetch(`${base}/rest/v1/rpc/cancelar_confirmacion_por_webhook`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_confirmacion_id: id, p_secret: secret }),
  })
  const result = await r.json().catch(() => ({}))
  const ok = result?.ok === true
  res.type('html').send(htmlResp('Depósito', ok ? '<p>❌ Depósito rechazado.</p>' : `<p>${result?.error || 'Error'}</p>`))
})

app.get('/api/admin/approve-retiro', (req, res) => {
  const secret = (req.query.secret || '').trim()
  const id = (req.query.id || '').trim()
  if (!id || !secret || secret !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(400).send(htmlResp('Error', '<p>Faltan parámetros o secret inválido.</p>'))
  }
  res.type('html').send(confirmPage('Retiro', '¿Marcar este retiro como procesado? (Enviarás los fondos al usuario.)', 'Sí, marcar procesado', '/api/admin/approve-retiro', secret, id, '/api/admin/reject-retiro'))
})
app.post('/api/admin/approve-retiro', express.urlencoded({ extended: true }), async (req, res) => {
  const secret = (req.body?.secret || req.query?.secret || '').trim()
  const id = (req.body?.id || req.query?.id || '').trim()
  if (!id || !secret || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(400).send(htmlResp('Error', '<p>Faltan parámetros (secret, id).</p>'))
  }
  if (secret !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(400).send(htmlResp('Error', '<p>Secret inválido.</p>'))
  }
  const base = SUPABASE_URL.replace(/\/$/, '')
  const r = await fetch(`${base}/rest/v1/rpc/procesar_retiro_por_webhook`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_retiro_id: id, p_secret: secret }),
  })
  const result = await r.json().catch(() => ({}))
  if (!r.ok) {
    const errMsg = result?.message || result?.error || result?.details || r.status
    console.error('[approve-retiro] Supabase RPC', r.status, errMsg)
    return res.type('html').send(htmlResp('Retiro', `<p>❌ Error del servidor (${r.status}).</p><p><small>${escapeHtml(String(errMsg))}</small></p>`))
  }
  if (!result?.ok) {
    return res.type('html').send(htmlResp('Retiro', `<p>❌ ${escapeHtml(result?.error || 'Error al aprobar')}</p>`))
  }
  const retRes = await fetch(`${base}/rest/v1/retiros_phantom?id=eq.${encodeURIComponent(id)}&select=user_id,monto,red`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  })
  const rets = await retRes.json().catch(() => [])
  const ret = Array.isArray(rets) ? rets[0] : null
  if (ret?.user_id != null && ret?.monto != null) {
    const proxyBase = `http://127.0.0.1:${PORT}`
    fetch(`${proxyBase}/api/send-retiro-procesado-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: ret.user_id, monto: Number(ret.monto), red: ret.red || null, ...(DEPOSIT_EMAIL_SECRET && { secret: DEPOSIT_EMAIL_SECRET }) }),
    }).catch(() => {})
  }
  res.type('html').send(htmlResp('Retiro', '<p>✅ Retiro marcado como procesado.</p>'))
})

app.get('/api/admin/reject-retiro', (req, res) => {
  const secret = (req.query.secret || '').trim()
  const id = (req.query.id || '').trim()
  if (!id || secret !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(400).send(htmlResp('Error', '<p>Faltan parámetros o secret inválido.</p>'))
  }
  res.type('html').send(confirmPage('Retiro', '¿Rechazar este retiro? (Se devuelve el saldo al usuario.)', 'Sí, rechazar', '/api/admin/reject-retiro', secret, id, '/api/admin/approve-retiro'))
})
app.post('/api/admin/reject-retiro', express.urlencoded({ extended: true }), async (req, res) => {
  const secret = (req.body?.secret || req.query?.secret || '').trim()
  const id = (req.body?.id || req.query?.id || '').trim()
  if (!id || secret !== TELEGRAM_WEBHOOK_SECRET || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(400).send(htmlResp('Error', '<p>Faltan parámetros o secret inválido.</p>'))
  }
  const base = SUPABASE_URL.replace(/\/$/, '')
  const r = await fetch(`${base}/rest/v1/rpc/rechazar_retiro_por_webhook`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_retiro_id: id, p_secret: secret }),
  })
  const result = await r.json().catch(() => ({}))
  const ok = result?.ok === true
  res.type('html').send(htmlResp('Retiro', ok ? '<p>❌ Retiro rechazado. Saldo devuelto al usuario.</p>' : `<p>${result?.error || 'Error'}</p>`))
})

// Estadísticas dinero (proxy con service role para no depender de auth en el cliente)
app.get('/api/admin/estadisticas', async (req, res) => {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'No configurado' })
    const base = SUPABASE_URL.replace(/\/$/, '')
    const [depRes, retRes] = await Promise.all([
      fetch(`${base}/rest/v1/confirmaciones_deposito?estado=eq.acreditado&select=monto`, {
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      }),
      fetch(`${base}/rest/v1/retiros_phantom?estado=eq.procesado&select=monto`, {
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      }),
    ])
    const depList = await depRes.json().catch(() => [])
    const retList = await retRes.json().catch(() => [])
    const total_depositos_usdc = (depList || []).reduce((s, r) => s + Number(r.monto || 0), 0)
    const total_retiros_usdc = (retList || []).reduce((s, r) => s + Number(r.monto || 0), 0)
    const ganancias_comisiones = (retList || []).length * COMISION_RETIRO
    res.status(200).json({
      ok: true,
      total_depositos_usdc: Math.round(total_depositos_usdc * 100) / 100,
      total_retiros_usdc: Math.round(total_retiros_usdc * 100) / 100,
      ganancias_usdc: Math.round(ganancias_comisiones * 100) / 100,
    })
  } catch (e) {
    console.error('[admin/estadisticas]', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.use('/supabase', async (req, res) => {
  const rest = req.originalUrl.replace(/^\/supabase/, '') || '/'
  const url = SUPABASE_URL.replace(/\/$/, '') + (rest.startsWith('/') ? rest : '/' + rest)
  try {
    const headers = { ...req.headers }
    delete headers.host
    delete headers.origin
    let body
    if (!['GET', 'HEAD'].includes(req.method) && req.body !== undefined) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }
    const opt = { method: req.method, headers, body }
    const r = await fetch(url, opt)
    const text = await r.text()
    r.headers.forEach((v, k) => { if (k.toLowerCase() !== 'content-encoding') res.setHeader(k, v) })
    res.status(r.status).send(text)
  } catch (e) {
    console.error('Proxy error:', e.message)
    res.status(502).json({ error: 'Proxy error: ' + e.message })
  }
})

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy Supabase en http://localhost:${PORT}/supabase`)
})
// Evitar que el proceso termine en algunos entornos (ej. concurrently en Windows)
server.on('error', (err) => {
  console.error('Proxy listen error:', err)
  process.exit(1)
})
