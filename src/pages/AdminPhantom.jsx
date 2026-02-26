import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Copy, ExternalLink, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { RedLabel, UsdcLabel } from '../utils/networkBrand'

const ADMIN_UID = (import.meta.env.VITE_PHANTOM_ADMIN_UID || '').trim()
const TG_USER_BOT = (import.meta.env.VITE_TELEGRAM_USER_BOT_TOKEN || '').trim()

// En dev, el plugin Vite atiende /api/admin/chat en el mismo servidor. En producción se usa el proxy.
function getAdminChatApiBase() {
  if (import.meta.env.DEV && typeof window !== 'undefined') return window.location.origin
  const env = (import.meta.env.VITE_PROXY_URL || 'http://localhost:3031').replace(/\/$/, '')
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host !== 'localhost' && host !== '127.0.0.1' && env.includes('localhost')) return `http://${host}:3031`
  }
  return env
}

// Base para APIs del proxy (Telegram, verify-deposit, notify-retiro). En dev usamos '' para que Vite reenvíe al proxy (3031).
function getProxyApiBase() {
  if (import.meta.env.DEV && typeof window !== 'undefined') return ''
  return (import.meta.env.VITE_PROXY_URL || 'http://localhost:3031').replace(/\/$/, '')
}

function sendTelegramToUser(chatId, text, callbacks = {}) {
  const cid = (chatId ?? '').toString().trim()
  const { proxyBase, getAuthToken, onNotConfigured, onResult } = callbacks
  if (!cid) {
    if (onResult && typeof onResult === 'function') onResult({ ok: false, error: 'Usuario sin Telegram vinculado' })
    return
  }
  const msg = (text || '').trim()
  if (!msg) return

  // Preferir proxy (mismo flujo que admin): token en servidor, no en el cliente
  if (proxyBase && typeof getAuthToken === 'function') {
    ;(async () => {
      try {
        const token = await getAuthToken()
        if (!token) {
          if (onResult) onResult({ ok: false, error: 'No autenticado' })
          return
        }
        const r = await fetch(`${proxyBase.replace(/\/$/, '')}/api/send-telegram-to-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ chat_id: cid, text: msg }),
        })
        const data = await r.json().catch(() => ({}))
        if (onResult) {
          if (data.skipped === 'telegram_user_bot_not_configured') {
            onResult({ ok: false, error: 'Proxy: configura TELEGRAM_USER_BOT_TOKEN en Render (Web Service)' })
          } else {
            onResult(r.ok && data.ok ? { ok: true } : { ok: false, error: data.error || `HTTP ${r.status}` })
          }
        }
      } catch (err) {
        const msg = err.message || 'Error de red'
        if (onResult) onResult({
          ok: false,
          error: /fetch|failed|network|cors/i.test(msg)
            ? 'No se pudo conectar al proxy. Comprueba VITE_PROXY_URL en el Static Site (ej. https://la-bomba-proxy.onrender.com).'
            : msg,
        })
      }
    })()
    return
  }

  if (!TG_USER_BOT) {
    if (onNotConfigured && typeof onNotConfigured === 'function') onNotConfigured()
    return
  }
  fetch(`https://api.telegram.org/bot${TG_USER_BOT}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cid, text: msg }),
  })
    .then(async (res) => {
      const body = await res.json().catch(() => ({}))
      if (onResult) onResult(res.ok ? { ok: true } : { ok: false, error: body.description || body.error_description || `HTTP ${res.status}` })
    })
    .catch((err) => {
      if (onResult) onResult({ ok: false, error: err.message || 'Error de red' })
    })
}

const MASTER_SOLANA = (import.meta.env.VITE_MASTER_WALLET_SOLANA || '').trim()
const MASTER_BASE = (import.meta.env.VITE_MASTER_WALLET_BASE || '').trim()
const MASTER_POLYGON = (import.meta.env.VITE_MASTER_WALLET_POLYGON || '').trim()

function masterForRed(red) {
  if (red === 'solana') return MASTER_SOLANA
  if (red === 'base') return MASTER_BASE
  if (red === 'polygon') return MASTER_POLYGON
  return ''
}

function explorerUrl(red, address) {
  if (!address) return null
  if (red === 'solana') return `https://solscan.io/account/${address}`
  if (red === 'base') return `https://basescan.org/address/${address}`
  if (red === 'polygon') return `https://polygonscan.com/address/${address}`
  return null
}

function ConfirmacionExplorerLink({ confirmacion, copiedId, onCopy }) {
  const red = confirmacion.red
  const url = explorerUrl(red, masterForRed(red))
  if (!url) return null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:underline truncate max-w-[120px] sm:max-w-[140px]" title={url}>
        Ver {red}
      </a>
      <button
        type="button"
        onClick={() => onCopy(confirmacion.id, url)}
        className="flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] min-w-[44px] rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 text-xs touch-manipulation active:scale-[0.98]"
      >
        {copiedId === confirmacion.id ? 'Copiado' : <Copy className="w-3.5 h-3.5" />}
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="p-2 min-h-[44px] min-w-[44px] rounded-xl bg-zinc-700 text-zinc-300 touch-manipulation flex items-center justify-center" title="Abrir">
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}

function looksLikeSolana(addr) {
  if (!addr || typeof addr !== 'string') return false
  const t = addr.trim()
  return t.length >= 32 && t.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(t)
}

function looksLikeEvm(addr) {
  if (!addr || typeof addr !== 'string') return false
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim())
}

/** True si la dirección no coincide con la red o es inválida (resaltar en rojo en admin). */
function isSuspiciousRetiroAddress(wallet, red) {
  const addr = (wallet || '').trim()
  if (!addr) return false
  const isSolana = looksLikeSolana(addr)
  const isEvm = looksLikeEvm(addr)
  if (red === 'solana') return isEvm || !isSolana
  if (red === 'base' || red === 'polygon') return isSolana || !isEvm
  return true
}

/** Copiar texto al portapapeles; en móvil (iOS) fallback con textarea + execCommand. */
function copyToClipboard(text) {
  const str = String(text ?? '')
  if (!str) return
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(str).catch(() => copyFallback(str))
    return
  }
  copyFallback(str)
}

function copyFallback(str) {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const textarea = document.createElement('textarea')
  textarea.value = str
  textarea.setAttribute('readonly', '')
  // En iOS el elemento debe estar en viewport para que select() funcione
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.width = '2px'
  textarea.style.height = '2px'
  textarea.style.padding = '0'
  textarea.style.border = 'none'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  if (!isIos) {
    textarea.style.left = '-9999px'
  }
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, str.length)
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

/** Texto para mostrar nombre y correo del usuario (confirmaciones/retiros). */
function userDisplayWithEmail(profiles, userId) {
  const p = Array.isArray(profiles) ? profiles?.[0] : profiles
  const name = p?.full_name?.trim()
  const email = p?.email?.trim()
  if (name && email) return `${name} (${email})`
  if (name) return name
  if (email) return email
  return `Usuario …${String(userId || '').slice(-8)}`
}

function getTelegramChatId(profiles) {
  const p = Array.isArray(profiles) ? profiles?.[0] : profiles
  const cid = p?.telegram_chat_id
  return (cid && String(cid).trim()) || null
}

export default function AdminPhantom() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [retiros, setRetiros] = useState([])
  const [confirmaciones, setConfirmaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [acreditandoId, setAcreditandoId] = useState(null)
  const [cancelandoId, setCancelandoId] = useState(null)
  const [copiedUrl, setCopiedUrl] = useState(null)
  const [emailFeedback, setEmailFeedback] = useState(null)
  const [copiedAddressId, setCopiedAddressId] = useState(null)
  const [adminTab, setAdminTab] = useState('retiros') // 'enlaces' | 'depositos' | 'retiros' | 'estadisticas' | 'asistente'
  const [estadisticas, setEstadisticas] = useState(null)
  const [adminChatMessages, setAdminChatMessages] = useState([])
  const [adminChatInput, setAdminChatInput] = useState('')
  const [adminChatLoading, setAdminChatLoading] = useState(false)
  const [enviandoTgId, setEnviandoTgId] = useState(null)
  const [enviandoRetTgId, setEnviandoRetTgId] = useState(null)
  const [limpiandoAdmin, setLimpiandoAdmin] = useState(false)
  const [borrandoConfirmacionId, setBorrandoConfirmacionId] = useState(null)
  const [borrandoRetiroId, setBorrandoRetiroId] = useState(null)

  useEffect(() => {
    if (!user) {
      navigate('/')
      return
    }
    if (ADMIN_UID && user.id !== ADMIN_UID) {
      navigate('/')
      return
    }
    load()
    loadConfirmaciones()
    loadEstadisticas()
    const channel = supabase
      .channel('admin-retiros')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'retiros_phantom' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'confirmaciones_deposito' }, () => loadConfirmaciones())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user, navigate])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('retiros_phantom')
      .select('*, profiles(full_name, email, telegram_chat_id)')
      .order('created_at', { ascending: false })
    if (!error) setRetiros(data || [])
    setLoading(false)
  }

  async function loadConfirmaciones() {
    const { data } = await supabase
      .from('confirmaciones_deposito')
      .select('id, user_id, red, monto, estado, created_at, tx_hash, profiles(full_name, email, telegram_chat_id)')
      .order('created_at', { ascending: false })
    setConfirmaciones(data || [])
  }

  async function loadEstadisticas() {
    const { data } = await supabase.rpc('admin_estadisticas_dinero')
    if (data?.ok) setEstadisticas(data)
    else setEstadisticas(null)
  }

  async function sendAsistenteMessage() {
    const text = (adminChatInput || '').trim()
    if (!text || adminChatLoading) return
    setAdminChatMessages((prev) => [...prev, { role: 'user', text }])
    setAdminChatInput('')
    setAdminChatLoading(true)
    const apiBase = getAdminChatApiBase()
    try {
      const r = await fetch(`${apiBase}/api/admin/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: adminChatMessages.map((m) => ({ role: m.role, text: m.text })),
        }),
      })
      const data = await r.json().catch(() => ({}))
      const reply = data?.reply || data?.error || 'No se pudo obtener respuesta.'
      setAdminChatMessages((prev) => [...prev, { role: 'model', text: reply }])
    } catch (e) {
      setAdminChatMessages((prev) => [...prev, { role: 'model', text: `Error: ${e.message || 'No se pudo conectar. En producción asegúrate de que el proxy esté en marcha.'}` }])
    } finally {
      setAdminChatLoading(false)
    }
  }

  async function handleEnviarRetiroATelegram(retiro) {
    setEnviandoRetTgId(retiro.id)
    const base = getProxyApiBase()
    try {
      const r = await fetch(`${base}/api/admin/notify-retiro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retiro_id: retiro.id }),
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok && data.ok) {
        setEmailFeedback({ type: 'ok', text: 'Enviado a Telegram. Usa ✅ Aprobar o ❌ Rechazar en el bot.' })
      } else {
        const err = data?.error || (r.status === 502 ? 'Proxy no responde. ¿Está en marcha? (node server-proxy.js en puerto 3031)' : (r.ok ? 'Error al enviar' : `Error ${r.status}`))
        setEmailFeedback({ type: 'warn', text: err })
      }
      setTimeout(() => setEmailFeedback(null), 6000)
    } catch (e) {
      const msg = e.message || 'Error de conexión'
      setEmailFeedback({ type: 'warn', text: msg.includes('fetch') || msg.includes('Failed') ? 'No se pudo conectar al proxy. ¿Está en marcha? (node server-proxy.js en puerto 3031)' : msg })
      setTimeout(() => setEmailFeedback(null), 8000)
    } finally {
      setEnviandoRetTgId(null)
    }
  }

  async function handleAcreditarDeposito(confirmacion) {
    const confirmacionId = confirmacion.id
    setAcreditandoId(confirmacionId)
    try {
      const { data, error } = await supabase.rpc('acreditar_deposito_manual', { p_confirmacion_id: confirmacionId })
      if (error) throw error
      if (data?.ok) {
        await loadConfirmaciones()
        const base = getProxyApiBase()
        const userChatId = getTelegramChatId(confirmacion?.profiles)
        const monto = Number(confirmacion?.monto) || 0
        const red = confirmacion?.red || ''
        sendTelegramToUser(
          userChatId,
          `✅ LA BOMBA — Depósito acreditado\n\n+$${monto.toFixed(2)} USDC (${red})\nYa está en tu saldo. Puedes jugar o retirar cuando quieras.`,
          {
            proxyBase: base,
            getAuthToken: async () => { const { data } = await supabase.auth.getSession(); return data?.session?.access_token || null },
            onNotConfigured: userChatId ? () => { setEmailFeedback({ type: 'warn', text: 'Aviso por Telegram no enviado: configura TELEGRAM_USER_BOT_TOKEN en el proxy.' }); setTimeout(() => setEmailFeedback(null), 5000) } : undefined,
            onResult: (r) => { if (!r.ok) { setEmailFeedback({ type: 'warn', text: `Telegram al usuario: ${r.error}` }); setTimeout(() => setEmailFeedback(null), 6000) } }
          }
        )
        if (confirmacion?.user_id != null && confirmacion?.monto != null) {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            const r = await fetch(`${base}/api/send-deposit-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
              },
              body: JSON.stringify({
                user_id: confirmacion.user_id,
                monto: Number(confirmacion.monto),
                red: confirmacion.red || null,
              }),
            })
            const json = await r.json().catch(() => ({}))
            if (r.ok && json.id) {
              setEmailFeedback({ type: 'ok', text: 'Depósito acreditado. Email enviado.' })
            } else if (json.skipped === 'no_resend_key') {
              setEmailFeedback({ type: 'warn', text: 'Acreditado. Email no enviado: falta RESEND_API_KEY en .env del proxy.' })
            } else if (json.skipped === 'no_email') {
              setEmailFeedback({ type: 'warn', text: 'Acreditado. Email no enviado: el usuario no tiene email en el perfil.' })
            } else if (!r.ok) {
              setEmailFeedback({ type: 'warn', text: `Acreditado. Email no enviado: ${json.error || r.status}.` })
            } else {
              setEmailFeedback({ type: 'ok', text: 'Depósito acreditado.' })
            }
            setTimeout(() => setEmailFeedback(null), 6000)
          } catch (err) {
            setEmailFeedback({ type: 'warn', text: `Acreditado. Email no enviado: ${err.message}.` })
            setTimeout(() => setEmailFeedback(null), 6000)
          }
        } else {
          setEmailFeedback({ type: 'ok', text: 'Depósito acreditado.' })
          setTimeout(() => setEmailFeedback(null), 4000)
        }
      } else throw new Error(data?.error || 'Error')
    } catch (e) {
      console.error(e)
      alert(e.message || 'Error al acreditar')
    } finally {
      setAcreditandoId(null)
    }
  }

  async function handleEnviarATelegram(confirmacion) {
    if (!confirmacion?.tx_hash) {
      alert('Esta confirmación no tiene hash de transacción.')
      return
    }
    setEnviandoTgId(confirmacion.id)
    const base = getProxyApiBase()
    try {
      const r = await fetch(`${base}/api/admin/verify-and-notify-deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmacion_id: confirmacion.id }),
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok && data.ok) {
        setEmailFeedback({ type: 'ok', text: 'Verificado y enviado a Telegram. Revisa el bot y usa ✅ Aprobar o ❌ Rechazar.' })
      } else {
        const err = data?.error || (r.status === 502 ? 'Proxy no responde. ¿Está en marcha? (node server-proxy.js en puerto 3031)' : (r.ok ? 'Error al enviar' : `Error ${r.status}`))
        setEmailFeedback({ type: 'warn', text: err })
      }
      setTimeout(() => setEmailFeedback(null), 6000)
    } catch (e) {
      const msg = e.message || 'Error de conexión'
      setEmailFeedback({ type: 'warn', text: msg.includes('fetch') || msg.includes('Failed') ? 'No se pudo conectar al proxy. ¿Está en marcha? (node server-proxy.js en puerto 3031)' : msg })
      setTimeout(() => setEmailFeedback(null), 8000)
    } finally {
      setEnviandoTgId(null)
    }
  }

  async function handleCancelarConfirmacion(confirmacionId) {
    setCancelandoId(confirmacionId)
    try {
      const { data, error } = await supabase.rpc('cancelar_confirmacion_deposito', { p_confirmacion_id: confirmacionId })
      if (error) throw error
      if (data?.ok) {
        await loadConfirmaciones()
      } else throw new Error(data?.error || 'Error')
    } catch (e) {
      console.error(e)
      alert(e.message || 'Error al cancelar')
    } finally {
      setCancelandoId(null)
    }
  }

  async function handleBorrarConfirmacion(confirmacion) {
    if (!window.confirm(`¿Borrar esta confirmación (${Number(confirmacion.monto).toFixed(2)} ${confirmacion.red})?`)) return
    setBorrandoConfirmacionId(confirmacion.id)
    try {
      const { data, error } = await supabase.rpc('borrar_confirmacion_admin', { p_confirmacion_id: confirmacion.id })
      if (error) throw error
      if (data?.ok) {
        await loadConfirmaciones()
      } else {
        alert(data?.error || 'Error al borrar')
      }
    } catch (e) {
      alert(e?.message || 'Error al borrar')
    } finally {
      setBorrandoConfirmacionId(null)
    }
  }

  async function handleBorrarRetiro(retiro) {
    if (!window.confirm(`¿Borrar este retiro (${Number(retiro.monto).toFixed(2)} ${retiro.red})?`)) return
    setBorrandoRetiroId(retiro.id)
    try {
      const { data, error } = await supabase.rpc('borrar_retiro_admin', { p_retiro_id: retiro.id })
      if (error) throw error
      if (data?.ok) {
        await load()
      } else {
        alert(data?.error || 'Error al borrar')
      }
    } catch (e) {
      alert(e?.message || 'Error al borrar')
    } finally {
      setBorrandoRetiroId(null)
    }
  }

  async function handleLimpiarAdminPhantom() {
    if (!window.confirm('¿Borrar todas las confirmaciones de depósito y todos los retiros? El panel quedará vacío. No se puede deshacer.')) return
    setLimpiandoAdmin(true)
    try {
      const { data, error } = await supabase.rpc('limpiar_admin_phantom')
      if (error) throw error
      if (data?.ok) {
        await Promise.all([load(), loadConfirmaciones(), loadEstadisticas()])
        setEmailFeedback(null)
      } else {
        alert(data?.error || 'Error al limpiar')
      }
    } catch (e) {
      alert(e?.message || 'Error al limpiar')
    } finally {
      setLimpiandoAdmin(false)
    }
  }

  async function handleMarcarProcesado(retiroId, txHash, retiro) {
    setProcessingId(retiroId)
    try {
      const { data, error } = await supabase.rpc('marcar_retiro_phantom_procesado', {
        p_retiro_id: retiroId,
        p_tx_hash: txHash || null,
      })
      if (error) throw error
      if (data?.ok) {
        await load()
        const base = getProxyApiBase()
        const userChatId = getTelegramChatId(retiro?.profiles)
        const monto = Number(retiro?.monto) || 0
        const red = retiro?.red || ''
        sendTelegramToUser(
          userChatId,
          `✅ LA BOMBA — Retiro procesado\n\n$${monto.toFixed(2)} USDC (${red})\nLos fondos han sido enviados a la dirección que indicaste.`,
          {
            proxyBase: getProxyApiBase(),
            getAuthToken: async () => { const { data } = await supabase.auth.getSession(); return data?.session?.access_token || null },
            onNotConfigured: userChatId ? () => { setEmailFeedback({ type: 'warn', text: 'Aviso por Telegram no enviado: configura TELEGRAM_USER_BOT_TOKEN en el proxy.' }); setTimeout(() => setEmailFeedback(null), 5000) } : undefined,
            onResult: (r) => { if (!r.ok) { setEmailFeedback({ type: 'warn', text: `Telegram al usuario: ${r.error}` }); setTimeout(() => setEmailFeedback(null), 6000) } }
          }
        )
        if (retiro?.user_id != null && retiro?.monto != null) {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            await fetch(`${base}/api/send-retiro-procesado-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
              },
              body: JSON.stringify({
                user_id: retiro.user_id,
                monto: Number(retiro.monto),
                red: retiro.red || null,
              }),
            })
          } catch (_) {}
        }
      } else throw new Error(data?.error || 'Error')
    } catch (e) {
      console.error(e)
      alert(e.message || 'Error al marcar')
    } finally {
      setProcessingId(null)
    }
  }

  if (!user) return null
  if (ADMIN_UID && user.id !== ADMIN_UID) return null

  const pendientes = retiros.filter((r) => r.estado === 'pendiente')

  return (
    <div className="min-h-dvh min-h-screen bg-[#050508] text-zinc-100 flex flex-col overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="sticky top-0 z-10 flex justify-between items-center w-full gap-2 py-3 px-3 mb-4 bg-[#050508]/95 backdrop-blur-sm border-b border-zinc-800/50">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-zinc-400 hover:text-amber-400 transition min-h-[44px] min-w-[44px] sm:min-w-0 sm:pl-2 pr-2 sm:pr-3 touch-manipulation justify-center rounded-2xl hover:bg-zinc-900/80 active:scale-[0.98] shrink-0"
          title="Salir"
        >
          <ArrowLeft className="w-5 h-5 shrink-0" />
          <span className="hidden sm:inline text-sm font-medium">Salir</span>
        </button>
        <h1 className="text-base sm:text-xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent truncate text-center flex-1 min-w-0 mx-1">
          Admin Phantom
        </h1>
        <div className="w-[44px] sm:w-24 shrink-0" aria-hidden />
      </header>

      <main className="w-full max-w-5xl mx-auto flex-1 flex flex-col px-3 sm:px-6 min-h-0">
        {/* Pestañas: Asistente, Depósitos, Retiros, Estadísticas, Enlaces */}
        <div className="flex gap-1 p-1 rounded-2xl bg-zinc-900/80 border border-zinc-800 mb-4 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setAdminTab('asistente')}
            className={`flex-shrink-0 py-2.5 px-3 rounded-xl text-sm font-semibold touch-manipulation min-h-[44px] transition ${adminTab === 'asistente' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/50' : 'text-zinc-400 hover:text-zinc-300'}`}
          >
            Asistente
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('depositos')}
            className={`flex-shrink-0 py-2.5 px-3 rounded-xl text-sm font-semibold touch-manipulation min-h-[44px] transition flex items-center justify-center gap-1.5 ${adminTab === 'depositos' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'text-zinc-400 hover:text-zinc-300'}`}
          >
            Depósitos
            {confirmaciones.filter((c) => c.estado === 'pendiente').length > 0 && (
              <span className="bg-amber-500 text-black text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                {confirmaciones.filter((c) => c.estado === 'pendiente').length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('retiros')}
            className={`flex-shrink-0 py-2.5 px-3 rounded-xl text-sm font-semibold touch-manipulation min-h-[44px] transition flex items-center justify-center gap-1.5 ${adminTab === 'retiros' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' : 'text-zinc-400 hover:text-zinc-300'}`}
          >
            Retiros
            {pendientes.length > 0 && (
              <span className="bg-amber-500 text-black text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                {pendientes.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => { setAdminTab('estadisticas'); loadEstadisticas() }}
            className={`flex-shrink-0 py-2.5 px-3 rounded-xl text-sm font-semibold touch-manipulation min-h-[44px] transition ${adminTab === 'estadisticas' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/50' : 'text-zinc-400 hover:text-zinc-300'}`}
          >
            Estadísticas
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('enlaces')}
            className={`flex-shrink-0 py-2.5 px-3 rounded-xl text-sm font-semibold touch-manipulation min-h-[44px] transition ${adminTab === 'enlaces' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' : 'text-zinc-400 hover:text-zinc-300'}`}
          >
            Enlaces
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
        {adminTab === 'enlaces' && (
          (MASTER_SOLANA || MASTER_BASE || MASTER_POLYGON) ? (
            <section className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-amber-400 mb-3">Revisar transacciones entrantes</h2>
              <p className="text-zinc-500 text-xs mb-3">Abre en el móvil para verificar el depósito antes de acreditar.</p>
              <ul className="space-y-3 sm:space-y-2">
                {MASTER_BASE && (
                  <li className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 p-3 sm:p-0 sm:py-0 rounded-xl sm:rounded-none bg-zinc-800/40 sm:bg-transparent">
                    <span className="text-sm w-full sm:w-20 shrink-0 inline-flex items-center gap-1.5"><RedLabel red="base" /></span>
                    <a href={explorerUrl('base', MASTER_BASE)} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-xs text-amber-300 break-all sm:truncate">{explorerUrl('base', MASTER_BASE)}</a>
                    <div className="flex gap-2 sm:ml-0">
                      <button type="button" onClick={() => { navigator.clipboard.writeText(explorerUrl('base', MASTER_BASE)); setCopiedUrl('base'); setTimeout(() => setCopiedUrl(null), 2000) }} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 text-sm min-h-[44px] touch-manipulation"> {copiedUrl === 'base' ? 'Copiado' : <><Copy className="w-4 h-4" /> Copiar</>}</button>
                      <a href={explorerUrl('base', MASTER_BASE)} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-xl bg-zinc-700 text-zinc-300 min-h-[44px] min-w-[44px] touch-manipulation flex items-center justify-center" title="Abrir"><ExternalLink className="w-4 h-4" /></a>
                    </div>
                  </li>
                )}
                {MASTER_POLYGON && (
                  <li className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 p-3 sm:p-0 sm:py-0 rounded-xl sm:rounded-none bg-zinc-800/40 sm:bg-transparent">
                    <span className="text-sm w-full sm:w-20 shrink-0 inline-flex items-center gap-1.5"><RedLabel red="polygon" /></span>
                    <a href={explorerUrl('polygon', MASTER_POLYGON)} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-xs text-amber-300 break-all sm:truncate">{explorerUrl('polygon', MASTER_POLYGON)}</a>
                    <div className="flex gap-2 sm:ml-0">
                      <button type="button" onClick={() => { navigator.clipboard.writeText(explorerUrl('polygon', MASTER_POLYGON)); setCopiedUrl('polygon'); setTimeout(() => setCopiedUrl(null), 2000) }} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 text-sm min-h-[44px] touch-manipulation">{copiedUrl === 'polygon' ? 'Copiado' : <><Copy className="w-4 h-4" /> Copiar</>}</button>
                      <a href={explorerUrl('polygon', MASTER_POLYGON)} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-xl bg-zinc-700 text-zinc-300 min-h-[44px] min-w-[44px] touch-manipulation flex items-center justify-center" title="Abrir"><ExternalLink className="w-4 h-4" /></a>
                    </div>
                  </li>
                )}
                {MASTER_SOLANA && (
                  <li className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 p-3 sm:p-0 sm:py-0 rounded-xl sm:rounded-none bg-zinc-800/40 sm:bg-transparent">
                    <span className="text-sm w-full sm:w-20 shrink-0 inline-flex items-center gap-1.5"><RedLabel red="solana" /></span>
                    <a href={explorerUrl('solana', MASTER_SOLANA)} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-xs text-amber-300 break-all sm:truncate">{explorerUrl('solana', MASTER_SOLANA)}</a>
                    <div className="flex gap-2 sm:ml-0">
                      <button type="button" onClick={() => { navigator.clipboard.writeText(explorerUrl('solana', MASTER_SOLANA)); setCopiedUrl('solana'); setTimeout(() => setCopiedUrl(null), 2000) }} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 text-sm min-h-[44px] touch-manipulation">{copiedUrl === 'solana' ? 'Copiado' : <><Copy className="w-4 h-4" /> Copiar</>}</button>
                      <a href={explorerUrl('solana', MASTER_SOLANA)} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-xl bg-zinc-700 text-zinc-300 min-h-[44px] min-w-[44px] touch-manipulation flex items-center justify-center" title="Abrir"><ExternalLink className="w-4 h-4" /></a>
                    </div>
                  </li>
                )}
              </ul>
            </section>
          ) : (
            <p className="text-zinc-500 text-sm">No hay enlaces configurados.</p>
          )
        )}

        {adminTab === 'depositos' && (
          <section>
            <h2 className="text-lg font-semibold text-emerald-400 mb-2">Confirmaciones de depósito</h2>
            <p className="text-zinc-500 text-sm mb-3">Solo se muestran las confirmaciones que hicieron los usuarios y las que se cancelaron.</p>

            {emailFeedback && (
              <p className={`text-sm mb-3 px-3 py-2 rounded-xl ${emailFeedback.type === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                {emailFeedback.text}
              </p>
            )}

            {confirmaciones.filter((c) => c.estado === 'pendiente').length > 0 && (
              <>
                <h3 className="text-sm font-medium text-amber-400 mb-2">Pendientes</h3>
                <ul className="space-y-3 mb-4">
                  {confirmaciones.filter((c) => c.estado === 'pendiente').map((c) => (
                    <li key={c.id} className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-3 sm:p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 sm:gap-2">
                      <div className="min-w-0">
                        <span className="font-mono text-amber-400">${Number(c.monto).toFixed(2)}</span>
                        <span className="text-zinc-500 text-sm ml-2">{c.red}</span>
                        <span className="text-zinc-600 text-xs ml-2">{userDisplayWithEmail(c.profiles, c.user_id)}</span>
                        <span className="text-zinc-600 text-xs block">{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <ConfirmacionExplorerLink
                          confirmacion={c}
                          copiedId={copiedUrl}
                          onCopy={(id, url) => {
                            navigator.clipboard.writeText(url)
                            setCopiedUrl(id)
                            setTimeout(() => setCopiedUrl(null), 2000)
                          }}
                        />
                        {c.tx_hash && (
                          <button
                            type="button"
                            onClick={() => handleEnviarATelegram(c)}
                            disabled={enviandoTgId === c.id}
                            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm disabled:opacity-50 touch-manipulation"
                          >
                            {enviandoTgId === c.id ? '...' : '📱 Enviar a Telegram'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAcreditarDeposito(c)}
                          disabled={acreditandoId === c.id}
                          className="px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm disabled:opacity-50 touch-manipulation"
                        >
                          {acreditandoId === c.id ? '...' : 'Acreditar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelarConfirmacion(c.id)}
                          disabled={cancelandoId === c.id}
                          className="px-4 py-2.5 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 font-medium text-sm disabled:opacity-50 touch-manipulation active:scale-[0.98]"
                        >
                          {cancelandoId === c.id ? '...' : 'Cancelar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBorrarConfirmacion(c)}
                          disabled={borrandoConfirmacionId === c.id}
                          className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 disabled:opacity-50 touch-manipulation flex items-center justify-center"
                          title="Borrar"
                        >
                          {borrandoConfirmacionId === c.id ? '...' : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {confirmaciones.filter((c) => c.estado === 'acreditado').length > 0 && (
              <>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Acreditadas</h3>
                <ul className="space-y-2 mb-4">
                  {confirmaciones.filter((c) => c.estado === 'acreditado').map((c) => (
                    <li key={c.id} className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-3 sm:p-4 flex justify-between items-center flex-wrap gap-2">
                      <div>
                        <span className="font-mono text-emerald-400">${Number(c.monto).toFixed(2)}</span>
                        <span className="text-zinc-500 text-sm ml-2">{c.red}</span>
                        <span className="text-zinc-600 text-xs ml-2">{userDisplayWithEmail(c.profiles, c.user_id)}</span>
                        <span className="text-zinc-600 text-xs block">{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ConfirmacionExplorerLink
                          confirmacion={c}
                          copiedId={copiedUrl}
                          onCopy={(id, url) => {
                            navigator.clipboard.writeText(url)
                            setCopiedUrl(id)
                            setTimeout(() => setCopiedUrl(null), 2000)
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleBorrarConfirmacion(c)}
                          disabled={borrandoConfirmacionId === c.id}
                          className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 disabled:opacity-50 touch-manipulation flex items-center justify-center"
                          title="Borrar"
                        >
                          {borrandoConfirmacionId === c.id ? '...' : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </li>
                ))}
              </ul>
            </>
          )}

            {confirmaciones.filter((c) => c.estado === 'rechazado').length > 0 && (
              <>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Canceladas</h3>
                <ul className="space-y-2">
                  {confirmaciones.filter((c) => c.estado === 'rechazado').map((c) => (
                    <li key={c.id} className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-3 sm:p-4 flex justify-between items-center flex-wrap gap-2">
                      <div>
                        <span className="font-mono text-zinc-500">${Number(c.monto).toFixed(2)}</span>
                        <span className="text-zinc-500 text-sm ml-2">{c.red}</span>
                        <span className="text-zinc-600 text-xs ml-2">{userDisplayWithEmail(c.profiles, c.user_id)}</span>
                        <span className="text-zinc-600 text-xs block">{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ConfirmacionExplorerLink
                          confirmacion={c}
                          copiedId={copiedUrl}
                          onCopy={(id, url) => {
                            navigator.clipboard.writeText(url)
                            setCopiedUrl(id)
                            setTimeout(() => setCopiedUrl(null), 2000)
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleBorrarConfirmacion(c)}
                          disabled={borrandoConfirmacionId === c.id}
                          className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 disabled:opacity-50 touch-manipulation flex items-center justify-center"
                          title="Borrar"
                        >
                          {borrandoConfirmacionId === c.id ? '...' : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </li>
                ))}
              </ul>
            </>
          )}

            {confirmaciones.length === 0 && (
              <p className="text-zinc-500 text-sm">No hay confirmaciones.</p>
            )}
          </section>
        )}

        {adminTab === 'retiros' && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-amber-400 mb-2">Retiros</h2>
            <p className="text-zinc-500 text-sm">Copia la dirección, paga el monto en Phantom y marca como procesado.</p>
            {loading ? (
              <div className="flex justify-center py-12">
                <motion.div
                  className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                />
              </div>
            ) : pendientes.length === 0 ? (
              <div className="rounded-2xl bg-amber-900/20 border border-amber-600/50 p-8 text-center text-zinc-500">
                No hay retiros pendientes
              </div>
            ) : (
              <ul className="space-y-4">
                {pendientes.map((r) => (
                  <motion.li
                    key={r.id}
                    className="rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-4 sm:p-6 space-y-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                      <p className="text-sm font-medium text-zinc-300 min-w-0">
                        {userDisplayWithEmail(r.profiles, r.user_id)}
                      </p>
                      <p className="text-zinc-500 text-xs shrink-0">{r.red}</p>
                    </div>
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
                      <p className="text-xs font-medium text-amber-400/90 mb-1">Monto a pagar</p>
                      <p className="font-mono text-xl font-bold text-amber-400">${Number(r.monto).toFixed(2)} <UsdcLabel /></p>
                      <p className="text-zinc-500 text-xs mt-1">Red: <RedLabel red={r.red} className="text-xs" /></p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-400 mb-2">Dirección</p>
                      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                        <span
                          className={`flex-1 min-w-0 font-mono text-sm break-all py-2.5 px-3 rounded-xl ${isSuspiciousRetiroAddress(r.wallet_destino, r.red) ? 'text-red-300 bg-red-500/25 border border-red-500' : 'text-zinc-300 bg-zinc-800/80'}`}
                          title={r.wallet_destino}
                        >
                          {r.wallet_destino}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            copyToClipboard(r.wallet_destino || '')
                            setCopiedAddressId(r.id)
                            setTimeout(() => setCopiedAddressId(null), 2000)
                          }}
                          className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 text-sm font-semibold min-h-[48px] touch-manipulation shrink-0"
                        >
                          {copiedAddressId === r.id ? 'Copiado' : <><Copy className="w-4 h-4" /> Copiar</>}
                        </button>
                      </div>
                      {isSuspiciousRetiroAddress(r.wallet_destino, r.red) && (
                        <p className="text-red-400 text-xs mt-2">Revisar: dirección no coincide con la red.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleEnviarRetiroATelegram(r)}
                        disabled={enviandoRetTgId === r.id}
                        className="px-4 py-2.5 min-h-[44px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm disabled:opacity-50 touch-manipulation"
                      >
                        {enviandoRetTgId === r.id ? '...' : '📱 Enviar a Telegram'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const tx = prompt('Hash de la transacción (opcional):')
                          handleMarcarProcesado(r.id, tx?.trim() || null, r)
                        }}
                        disabled={processingId === r.id}
                        className="flex-1 min-w-[140px] py-3.5 min-h-[48px] rounded-2xl border-2 border-amber-500/80 text-amber-400 font-bold hover:bg-amber-500/20 touch-manipulation disabled:opacity-50 active:scale-[0.98]"
                      >
                        {processingId === r.id ? '...' : 'Marcar procesado'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBorrarRetiro(r)}
                        disabled={borrandoRetiroId === r.id}
                        className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 disabled:opacity-50 touch-manipulation flex items-center justify-center"
                        title="Borrar"
                      >
                        {borrandoRetiroId === r.id ? '...' : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}

            {retiros.filter((r) => r.estado === 'procesado').length > 0 && (
              <>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Procesados</h3>
                <ul className="space-y-2">
                  {retiros
                    .filter((r) => r.estado === 'procesado')
                    .slice(0, 10)
                    .map((r) => (
                        <li key={r.id} className="flex justify-between items-center gap-2 py-2 border-b border-zinc-800 flex-wrap">
                          <span className="text-zinc-300 text-sm truncate min-w-0" title={userDisplayWithEmail(r.profiles, r.user_id)}>{userDisplayWithEmail(r.profiles, r.user_id)}</span>
                          <span className="text-amber-400 font-mono shrink-0">${Number(r.monto).toFixed(2)}</span>
                          <span className="text-zinc-500 text-sm shrink-0">{r.red}</span>
                          <span className="text-zinc-600 text-xs shrink-0">{r.processed_at ? new Date(r.processed_at).toLocaleDateString() : ''}</span>
                          <button
                            type="button"
                            onClick={() => handleBorrarRetiro(r)}
                            disabled={borrandoRetiroId === r.id}
                            className="p-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 disabled:opacity-50 touch-manipulation flex items-center justify-center shrink-0"
                            title="Borrar"
                          >
                            {borrandoRetiroId === r.id ? '...' : <Trash2 className="w-4 h-4" />}
                          </button>
                        </li>
                    ))}
                </ul>
              </>
            )}
          </section>
        )}

        {adminTab === 'estadisticas' && (
          <section className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold text-violet-400">Estadísticas de dinero</h2>
              <button
                type="button"
                onClick={handleLimpiarAdminPhantom}
                disabled={limpiandoAdmin}
                className="px-3 py-2 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 disabled:opacity-50 touch-manipulation"
              >
                {limpiandoAdmin ? 'Borrando…' : 'Borrar todo (empezar de cero)'}
              </button>
            </div>
            {estadisticas?.ok ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      <th className="text-left py-2 text-zinc-400 font-medium">Concepto</th>
                      <th className="text-right py-2 text-zinc-400 font-medium">USDC</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-zinc-800">
                      <td className="py-3 text-zinc-300">Total ingresado (depósitos acreditados)</td>
                      <td className="py-3 text-right font-mono text-emerald-400">${Number(estadisticas.total_depositos_usdc || 0).toFixed(2)}</td>
                    </tr>
                    <tr className="border-b border-zinc-800">
                      <td className="py-3 text-zinc-300">Total retirado (procesados)</td>
                      <td className="py-3 text-right font-mono text-amber-400">${Number(estadisticas.total_retiros_usdc || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-zinc-200 font-medium">Ganancias (comisiones retiros)</td>
                      <td className="py-3 text-right font-mono font-bold text-white">${Number(estadisticas.ganancias_usdc || 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">No se pudieron cargar las estadísticas.</p>
            )}
          </section>
        )}

        {adminTab === 'asistente' && (
          <section className="rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col min-h-[280px] flex-1">
            <h2 className="text-lg font-semibold text-sky-400 p-4 border-b border-zinc-800 shrink-0">Asistente admin</h2>
            <p className="text-zinc-500 text-xs px-4 pb-2 shrink-0">Pregunta sobre usuarios, correos, depósitos, retiros, cantidades y ganancias.</p>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[120px]">
              {adminChatMessages.length === 0 && (
                <p className="text-zinc-500 text-sm">Escribe una pregunta (ej. &quot;¿Cuánto USDC se ha depositado en total?&quot; o &quot;Dame el correo del usuario X&quot;).</p>
              )}
              {adminChatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-sky-500/20 text-sky-100 border border-sky-500/40' : 'bg-zinc-800 text-zinc-200 border border-zinc-700'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {adminChatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-4 py-2.5 text-sm bg-zinc-800 text-zinc-500">...</div>
                </div>
              )}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); sendAsistenteMessage() }} className="p-4 border-t border-zinc-800 flex gap-2">
              <input
                type="text"
                value={adminChatInput}
                onChange={(e) => setAdminChatInput(e.target.value)}
                placeholder="Pregunta..."
                className="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-500 focus:border-sky-500/50 outline-none"
                disabled={adminChatLoading}
              />
              <button type="submit" disabled={adminChatLoading || !adminChatInput.trim()} className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-medium disabled:opacity-50">
                Enviar
              </button>
            </form>
          </section>
        )}
        </div>
      </main>
    </div>
  )
}
