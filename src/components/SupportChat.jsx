import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Headphones } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// En dev, el plugin de Vite atiende /api/support-chat en el mismo servidor. En producción se usa VITE_PROXY_URL.
function getSupportApiBase() {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return window.location.origin
  }
  const env = (import.meta.env.VITE_PROXY_URL || '').replace(/\/$/, '')
  if (env && !env.includes('localhost')) return env
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3031'
    if (/\.onrender\.com$/.test(host)) return '' // En Render sin VITE_PROXY_URL: no adivinar URL
    if (env.includes('localhost')) return `http://${host}:3031`
  }
  return env || 'http://localhost:3031'
}
const SUPPORT_API_BASE = getSupportApiBase()
const IS_PROXY_MISSING_ON_RENDER = typeof window !== 'undefined' && /\.onrender\.com$/.test(window.location.hostname) && (!(import.meta.env.VITE_PROXY_URL || '').trim() || (import.meta.env.VITE_PROXY_URL || '').includes('localhost'))

export default function SupportChat({ onClose }) {
  const { user, profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text) {
    const trimmed = (text || '').trim()
    if (!trimmed) return
    setError('')
    if (IS_PROXY_MISSING_ON_RENDER || !SUPPORT_API_BASE) {
      setError('En Render: añade VITE_PROXY_URL en el Static Site (Environment) con la URL de tu proxy (ej. https://la-bomba-proxy.onrender.com) y vuelve a desplegar.')
      return
    }
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
    setInput('')
    setLoading(true)
    try {
      const history = messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }))
      const res = await fetch(`${SUPPORT_API_BASE}/api/support-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history,
          userId: user?.id,
          userEmail: profile?.email,
          userName: profile?.full_name,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Error de conexión')
        setMessages((prev) => prev.slice(0, -1))
        return
      }
      setMessages((prev) => [...prev, { role: 'model', text: data.reply || '' }])
    } catch (e) {
      const msg = (e && e.message) || ''
      setError(msg.includes('fetch') || msg.includes('Failed to fetch')
        ? (IS_PROXY_MISSING_ON_RENDER
          ? 'Añade VITE_PROXY_URL en el Static Site de Render (Environment) con la URL del proxy y redeploya.'
          : 'No se pudo conectar con el proxy de soporte. Comprueba que el servicio proxy esté activo en Render.')
        : (msg || 'Error de conexión'))
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col items-center justify-end sm:justify-center p-4 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 border-b-0 sm:border-b flex flex-col shadow-xl"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'tween', duration: 0.25 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2">
              <Headphones className="w-5 h-5" />
              Soporte
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-zinc-500 px-4 pb-2">
            Pregunta sobre el juego, depósitos, retiros o la app. Si quieres que te contacte el equipo, dilo en el chat y la IA te guiará.
          </p>
          <div ref={listRef} className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-zinc-500 text-sm">Escribe tu pregunta y te responderé en seguida.</p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === 'user'
                      ? 'bg-amber-500/20 text-amber-100 border border-amber-500/40'
                      : 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-2.5 text-sm text-zinc-400">
                  ...
                </div>
              </div>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
          <div className="p-4 border-t border-zinc-800">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu pregunta..."
                className="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-500 focus:border-amber-500/50 outline-none"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-50 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
