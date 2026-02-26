import { useState, useEffect, useRef, Fragment } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Wallet, LogOut, CreditCard, Bot, MessageCircle, Users, ShieldCheck, Bell, X, MessageSquare, DollarSign, Send, Headphones } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { useNotifications } from '../context/NotificationsContext'
import { supabase } from '../lib/supabase'
import Cajero from '../components/Cajero'
import SupportChat from '../components/SupportChat'

export default function Dashboard() {
  const { user, profile, signOut, refreshBalance } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searching, setSearching] = useState(false)
  const [cajeroOpen, setCajeroOpen] = useState(false)
  const { openChat, openChatWith } = useChat()
  const { list: notificationsList, clearList } = useNotifications()
  const [notificacionesPanelOpen, setNotificacionesPanelOpen] = useState(false)
  const [apuesta, setApuesta] = useState(1)
  const [error, setError] = useState('')
  const [amigosMode, setAmigosMode] = useState('crear') // 'crear' | 'unirse'
  const [roomCode, setRoomCode] = useState('')
  const [creandoSala, setCreandoSala] = useState(false)
  const [unirseError, setUnirseError] = useState('')
  const [esperandoRival, setEsperandoRival] = useState(false)
  const [telegramLinking, setTelegramLinking] = useState(false)
  const [telegramModalOpen, setTelegramModalOpen] = useState(false)
  const [telegramLinkToken, setTelegramLinkToken] = useState(null)
  const [telegramPolling, setTelegramPolling] = useState(false)
  const [telegramError, setTelegramError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (location.state?.esperandoRival) {
      setEsperandoRival(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state?.esperandoRival, location.pathname, navigate])

  useEffect(() => {
    if (location.state?.openCajero) {
      setCajeroOpen(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state?.openCajero, location.pathname, navigate])

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [menuOpen])

  async function handleBuscarPartida() {
    setError('')
    setSearching(true)
    setEsperandoRival(false)
    try {
      const { data, error: err } = await supabase.rpc('buscar_partida', { p_apuesta: Number(apuesta) })
      if (err) throw err
      if (!data?.ok) throw new Error(data?.error || 'Error al buscar partida')
      if (data.esperando) {
        setEsperandoRival(true)
        setSearching(false)
        return
      }
      navigate(`/game/${data.partida_id}`)
    } catch (e) {
      setError(e.message || 'Error al buscar partida')
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    if (!esperandoRival) return
    let cancelled = false
    const interval = setInterval(async () => {
      if (cancelled) return
      const { data } = await supabase.rpc('obtener_partida_emparejada')
      if (cancelled) return
      if (data?.ok && data?.partida_id) {
        setEsperandoRival(false)
        navigate(`/game/${data.partida_id}`)
      }
    }, 300)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [esperandoRival, navigate])

  async function handleCancelarEspera() {
    if (!esperandoRival) return
    try {
      await supabase.rpc('cancelar_matchmaking')
    } catch (_) {}
    setEsperandoRival(false)
  }

  async function handleCrearSala() {
    setUnirseError('')
    setCreandoSala(true)
    try {
      const { data, err } = await supabase.rpc('crear_partida', { p_apuesta: apuesta })
      if (err) throw err
      if (!data?.ok) throw new Error(data?.error || 'Error al crear sala')
      navigate(`/game/${data.partida_id}`)
    } catch (e) {
      setUnirseError(e.message || 'Error al crear sala')
    } finally {
      setCreandoSala(false)
    }
  }

  function handleUnirse() {
    setUnirseError('')
    const code = roomCode.trim().toUpperCase()
    if (code.length !== 5) {
      setUnirseError('El código tiene 5 caracteres (letras o números)')
      return
    }
    navigate(`/join/${code}`)
  }

  async function handleTelegramNotificaciones() {
    const botUsername = (import.meta.env.VITE_TELEGRAM_USER_BOT_USERNAME || '').trim().replace(/^@/, '')
    const botToken = (import.meta.env.VITE_TELEGRAM_USER_BOT_TOKEN || '').trim()
    if (!botUsername) {
      alert('Telegram notificaciones no está configurado (falta VITE_TELEGRAM_USER_BOT_USERNAME).')
      return
    }
    if (!botToken) {
      alert('Falta VITE_TELEGRAM_USER_BOT_TOKEN en .env')
      return
    }
    setTelegramLinking(true)
    setTelegramError('')
    try {
      const { data: token, error } = await supabase.rpc('create_telegram_link_token')
      if (error) throw error
      if (!token) throw new Error('No se pudo generar el enlace')
      const url = `https://t.me/${botUsername}?start=${token}`
      window.open(url, '_blank', 'noopener,noreferrer')
      setTelegramLinkToken(token)
      setTelegramModalOpen(true)
    } catch (e) {
      console.error(e)
      alert(e.message || 'Error al abrir Telegram')
    } finally {
      setTelegramLinking(false)
    }
  }

  async function handleTelegramYaLoHice() {
    const token = telegramLinkToken
    const botToken = (import.meta.env.VITE_TELEGRAM_USER_BOT_TOKEN || '').trim()
    if (!token || !botToken) return
    setTelegramPolling(true)
    setTelegramError('')
    const maxAttempts = 60
    let attempt = 0
    let offset = 0
    const interval = setInterval(async () => {
      attempt++
      if (attempt > maxAttempts) {
        clearInterval(interval)
        setTelegramPolling(false)
        setTelegramError('Tiempo agotado. Abre Telegram, envía /start al bot e inténtalo de nuevo.')
        return
      }
      try {
        const r = await fetch(
          `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=2`
        )
        const data = await r.json().catch(() => ({}))
        if (!data?.ok || !Array.isArray(data.result)) return
        for (const u of data.result) {
          if (u.update_id >= offset) offset = u.update_id + 1
          const text = (u.message?.text || '').trim()
          const chatId = u.message?.chat?.id
          if (chatId && text.startsWith('/start')) {
            const payload = text.slice(6).trim()
            if (payload === token) {
              clearInterval(interval)
              const { data: linkData, error } = await supabase.rpc('link_telegram_by_token', {
                p_token: token,
                p_chat_id: String(chatId),
              })
              setTelegramPolling(false)
              if (error || !linkData?.ok) {
                setTelegramError(linkData?.error || error?.message || 'Error al vincular')
                return
              }
              // Enviar mensaje de bienvenida al usuario en Telegram (sin webhook el bot no responde solo)
              fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: String(chatId),
                  text: '✅ Aquí recibirás las notificaciones de tus depósitos y retiros en LA BOMBA. ¡Listo!',
                }),
              }).catch(() => {})
              setTelegramModalOpen(false)
              setTelegramLinkToken(null)
              refreshBalance?.()
              return
            }
          }
        }
      } catch (_) {}
    }, 2500)
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-[#050508] w-full pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]" style={{ minHeight: '100dvh' }}>
        <motion.span
          className="text-8xl sm:text-9xl mb-2 block inline-block drop-shadow-lg"
          animate={{ scale: [1, 1.3, 1], filter: ['brightness(1)', 'brightness(1.4)', 'brightness(1)'] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
        >
          💣
        </motion.span>
        <motion.h1
          className="text-4xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          LA BOMBA
        </motion.h1>
        <p className="text-zinc-400 mt-2">Inicia sesión para jugar</p>
        <AuthForm />
      </div>
    )
  }

  const balance = profile?.balance ?? 0
  const isPhantomAdmin = (import.meta.env.VITE_PHANTOM_ADMIN_UID || '').trim() === user?.id

  return (
    <div className="min-h-dvh min-h-screen bg-[#050508] text-zinc-100 px-3 py-4 flex flex-col items-center pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex flex-col items-center gap-3 w-full mb-4">
        <motion.span
          className="text-6xl inline-block drop-shadow-lg"
          animate={{ scale: [1, 1.3, 1], filter: ['brightness(1)', 'brightness(1.4)', 'brightness(1)'] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
        >
          💣
        </motion.span>
        <h1 className="text-xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent text-center">
          LA BOMBA
        </h1>
        <div className="flex items-center justify-center w-full">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm min-w-0">
            <Wallet className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="font-mono font-bold text-amber-400 truncate">${Number(balance).toFixed(2)}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 w-full gap-2 [&_button]:min-h-[48px] [&_button]:min-w-0 [&_button]:touch-manipulation">
          <button
            onClick={() => setCajeroOpen(true)}
            className="flex items-center justify-center gap-2 px-2 py-3 rounded-2xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition border border-amber-500/50 active:scale-[0.98]"
            title="Depósitos y retiros"
          >
            <CreditCard className="w-5 h-5 shrink-0" />
            <span className="text-sm truncate hidden sm:inline">Cajero</span>
          </button>
          <button
            onClick={openChat}
            className="flex items-center justify-center gap-2 px-2 py-3 rounded-2xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition border border-amber-500/50 active:scale-[0.98]"
            title="Chat"
          >
            <MessageCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm truncate hidden sm:inline">Chat</span>
          </button>
          <div className="relative flex min-w-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="relative flex items-center justify-center gap-2 w-full min-h-[48px] px-2 py-3 rounded-2xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition border border-amber-500/50 active:scale-[0.98]"
              title="Notificaciones y más"
              aria-expanded={menuOpen}
            >
              <Bell className="w-5 h-5 shrink-0" />
              <span className="text-sm truncate hidden sm:inline">Notificaciones</span>
              {notificationsList.length > 0 && (
                <span className="absolute top-1 right-1 sm:-top-0.5 sm:-right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">
                  {notificationsList.length > 99 ? '99+' : notificationsList.length}
                </span>
              )}
            </button>
            <AnimatePresence>
              {menuOpen && (
                <Fragment key="notif-menu">
                  <motion.div
                    className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <motion.div
                    className="fixed left-4 right-4 bottom-0 sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-[320px] z-50 rounded-t-2xl sm:rounded-2xl bg-zinc-900/95 border border-zinc-800 border-b-0 sm:border-b backdrop-blur-sm p-5 shadow-xl space-y-1"
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    transition={{ type: 'tween', duration: 0.25 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => { setNotificacionesPanelOpen(true); setMenuOpen(false) }}
                      className="relative flex items-center gap-2 w-full px-4 py-3 rounded-xl text-left text-sm text-zinc-200 hover:bg-zinc-800/80 hover:text-amber-400 transition"
                    >
                      <Bell className="w-4 h-4 shrink-0" />
                      Ver notificaciones
                      {notificationsList.length > 0 && (
                        <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">
                          {notificationsList.length > 99 ? '99+' : notificationsList.length}
                        </span>
                      )}
                    </button>
                    {!(profile?.telegram_chat_id || '').trim() && (
                      <button
                        type="button"
                        onClick={() => { handleTelegramNotificaciones(); setMenuOpen(false) }}
                        disabled={telegramLinking}
                        className="flex items-center gap-2 w-full px-4 py-3 rounded-xl text-left text-sm text-zinc-200 hover:bg-zinc-800/80 hover:text-amber-400 transition disabled:opacity-50"
                      >
                        <Send className="w-4 h-4 shrink-0" />
                        Telegram notificaciones
                      </button>
                    )}
                    {isPhantomAdmin && (
                      <button
                        type="button"
                        onClick={() => { navigate('/admin-phantom'); setMenuOpen(false) }}
                        className="flex items-center gap-2 w-full px-4 py-3 rounded-xl text-left text-sm text-zinc-200 hover:bg-zinc-800/80 hover:text-amber-400 transition"
                      >
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        Admin Phantom
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setSupportOpen(true); setMenuOpen(false) }}
                      className="flex items-center gap-2 w-full px-4 py-3 rounded-xl text-left text-sm text-zinc-200 hover:bg-zinc-800/80 hover:text-amber-400 transition"
                    >
                      <Headphones className="w-4 h-4 shrink-0" />
                      Soporte
                    </button>
                    <hr className="border-zinc-800 my-2" />
                    <button
                      type="button"
                      onClick={() => { signOut(); setMenuOpen(false) }}
                      className="flex items-center gap-2 w-full px-4 py-3 rounded-xl text-left text-sm text-zinc-400 hover:bg-zinc-800/80 hover:text-white transition"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      Cerrar sesión
                    </button>
                  </motion.div>
                </Fragment>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {notificacionesPanelOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-end sm:justify-center p-4 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setNotificacionesPanelOpen(false)}
        >
          <motion.div
            className="w-full max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 border-b-0 sm:border-b flex flex-col shadow-xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notificaciones recibidas
              </h2>
              <button
                type="button"
                onClick={() => setNotificacionesPanelOpen(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-2">
              {notificationsList.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">No tienes notificaciones aún.</p>
              ) : (
                <ul className="space-y-2 pb-4">
                  {notificationsList.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (n.type === 'transfer' || n.type === 'deposit' || n.type === 'retiro_procesado') {
                            setNotificacionesPanelOpen(false)
                          } else {
                            if (n.senderId) openChatWith(n.senderId, n.senderName)
                            else openChat()
                            setNotificacionesPanelOpen(false)
                          }
                        }}
                        className="w-full text-left rounded-xl p-3 bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/80 flex items-start gap-3 transition"
                      >
                        <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                          {n.type === 'transfer' || n.type === 'deposit' || n.type === 'retiro_procesado' ? (
                            <DollarSign className="w-5 h-5 text-amber-400" />
                          ) : (
                            <MessageSquare className="w-5 h-5 text-amber-400" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-amber-200">
                            {n.type === 'deposit' ? 'Depósito acreditado' : n.type === 'transfer' ? `Fondos de ${n.senderName}` : n.type === 'retiro_procesado' ? 'Retiro procesado' : n.senderName}
                          </p>
                          <p className="text-sm text-zinc-400">
                            {n.type === 'deposit' || n.type === 'transfer'
                              ? `+$${Number(n.monto || 0).toFixed(2)}`
                              : n.type === 'retiro_procesado'
                                ? `$${Number(n.monto || 0).toFixed(2)} USDC enviados a tu wallet${n.red ? ` (${n.red === 'base' ? 'Base' : n.red === 'polygon' ? 'Polygon' : n.red === 'solana' ? 'Solana' : n.red})` : ''}`
                                : (n.preview || 'Nuevo mensaje')}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {notificationsList.length > 0 && (
              <div className="p-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => { clearList(); setNotificacionesPanelOpen(false) }}
                  className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-300 transition"
                >
                  Borrar todas
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}

      {telegramModalOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => {
            if (!telegramPolling) {
              setTelegramModalOpen(false)
              setTelegramLinkToken(null)
              setTelegramError('')
            }
          }}
        >
          <motion.div
            className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-xl"
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2 mb-3">
              <Send className="w-5 h-5" />
              Vincular Telegram
            </h3>
            <p className="text-zinc-300 text-sm mb-4">
              Abre Telegram, entra al bot y envía <strong>/start</strong>. Luego pulsa aquí &quot;Ya lo hice&quot;.
            </p>
            {telegramError && (
              <p className="text-red-400 text-sm mb-3">{telegramError}</p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleTelegramYaLoHice}
                disabled={telegramPolling}
                className="w-full py-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 font-medium disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {telegramPolling ? (
                  <>
                    <span className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    Buscando…
                  </>
                ) : (
                  'Ya lo hice'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTelegramModalOpen(false)
                  setTelegramLinkToken(null)
                  setTelegramError('')
                }}
                disabled={telegramPolling}
                className="w-full py-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      <main className="w-full px-2 space-y-4">
        {esperandoRival && (
          <motion.div
            className="rounded-2xl bg-amber-500/10 border-2 border-amber-500/50 backdrop-blur-sm p-8 text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="text-amber-400 font-semibold mb-2">Buscando rival...</p>
            <p className="text-zinc-400 text-sm mb-4">En cuanto alguien juegue con la misma apuesta, empezará la partida.</p>
            <div className="w-10 h-10 mx-auto mb-4 border-2 border-amber-500/80 border-t-transparent rounded-full animate-spin" />
            <button
              type="button"
              onClick={handleCancelarEspera}
              className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition text-sm"
            >
              Cancelar
            </button>
          </motion.div>
        )}

        <motion.div
          className="rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-5 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-lg font-bold text-amber-400 mb-4">Buscar partida</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-4">Te emparejaremos con un jugador aleatorio con la misma apuesta.</p>
          <div className="flex flex-wrap gap-2 items-center justify-center">
            <label className="text-sm text-zinc-400 w-full text-center sm:w-auto">Apuesta:</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setApuesta(n)}
                  className={`min-w-[44px] min-h-[44px] rounded-xl font-mono font-semibold transition touch-manipulation select-none active:scale-[0.98] ${
                    apuesta === n ? 'bg-amber-500 text-black shadow-[0_0_20px_rgba(251,191,36,0.35)]' : 'bg-zinc-800 text-amber-400 border border-zinc-700 hover:bg-zinc-700 focus:border-amber-500/50'
                  }`}
                >
                  ${n}
                </button>
              ))}
            </div>
            <button
              onClick={handleBuscarPartida}
              disabled={searching || balance < apuesta || esperandoRival}
              className="flex items-center gap-2 px-6 py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_25px_rgba(251,191,36,0.35)] active:scale-[0.98] transition touch-manipulation"
            >
              <Search className="w-5 h-5" />
              {searching ? 'Buscando...' : esperandoRival ? 'Buscando rival...' : 'Jugar'}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          {balance < apuesta && (
            <p className="text-amber-400/80 text-sm mt-2">Saldo insuficiente. Recarga en el Cajero.</p>
          )}
        </motion.div>

        <motion.div
          className="rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-5 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h2 className="text-lg font-bold text-amber-400 mb-4">Jugar con amigos</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-4">Crea una sala y comparte el código, o únete con el código que te enviaron.</p>
          <div className="flex gap-2 mb-3 justify-center">
            <button
              onClick={() => { setAmigosMode('crear'); setUnirseError('') }}
              className={`flex-1 py-2 rounded-2xl font-semibold transition active:scale-[0.98] ${amigosMode === 'crear' ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/80' : 'bg-zinc-800/80 text-zinc-400 border-2 border-zinc-700'}`}
            >
              Crear sala
            </button>
            <button
              onClick={() => { setAmigosMode('unirse'); setUnirseError('') }}
              className={`flex-1 py-2 rounded-2xl font-semibold transition active:scale-[0.98] ${amigosMode === 'unirse' ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/80' : 'bg-zinc-800/80 text-zinc-400 border-2 border-zinc-700'}`}
            >
              Unirse con código
            </button>
          </div>
          {amigosMode === 'crear' ? (
            <div className="flex flex-wrap gap-2 items-center justify-center">
              <label className="text-sm text-zinc-400 w-full text-center">Apuesta:</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setApuesta(n)}
                    className={`min-w-[44px] min-h-[44px] rounded-xl font-mono font-semibold transition touch-manipulation select-none active:scale-[0.98] ${
                      apuesta === n ? 'bg-amber-500 text-black shadow-[0_0_20px_rgba(251,191,36,0.35)]' : 'bg-zinc-800 text-amber-400 border border-zinc-700 hover:bg-zinc-700 focus:border-amber-500/50'
                    }`}
                  >
                    ${n}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCrearSala}
                disabled={creandoSala || balance < apuesta}
                className="flex items-center gap-2 px-6 py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_25px_rgba(251,191,36,0.35)] active:scale-[0.98] transition touch-manipulation"
              >
                <Users className="w-5 h-5" />
                {creandoSala ? 'Creando...' : 'Crear sala'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2 justify-center flex-wrap">
              <input
                type="text"
                maxLength={5}
                placeholder="Código 5 caracteres"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.replace(/\s/g, '').toUpperCase().slice(0, 5))}
                className="w-32 px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-mono text-center uppercase focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
              />
              <button
                onClick={handleUnirse}
                disabled={roomCode.trim().length !== 5}
                className="px-6 py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_25px_rgba(251,191,36,0.35)] active:scale-[0.98] transition touch-manipulation"
              >
                Unirse
              </button>
            </div>
          )}
          {unirseError && <p className="text-red-400 text-sm mt-2">{unirseError}</p>}
          {amigosMode === 'crear' && balance < apuesta && (
            <p className="text-amber-400/80 text-sm mt-2">Saldo insuficiente. Recarga en el Cajero.</p>
          )}
        </motion.div>

        <motion.div
          className="rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-5 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-lg font-bold text-amber-400 mb-4">Jugar gratis</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-4">Juega contra el bot sin riesgo.</p>
          <button
            onClick={() => navigate('/play-free')}
            className="flex items-center gap-2 px-6 py-3 min-h-[44px] rounded-2xl border-2 border-amber-500/80 text-amber-400 font-bold hover:bg-amber-500/20 active:scale-[0.98] transition mx-auto touch-manipulation"
          >
            <Bot className="w-5 h-5" />
            Jugar gratis
          </button>
        </motion.div>
      </main>

      {cajeroOpen && <Cajero onClose={() => setCajeroOpen(false)} onSuccess={() => setCajeroOpen(false)} />}
      {supportOpen && <SupportChat onClose={() => setSupportOpen(false)} />}
    </div>
  )
}

function AuthForm() {
  const auth = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg('')
    setLoading(true)
    try {
      if (mode === 'signin') {
        const { error } = await auth.signIn(email, password)
        if (error) throw error
      } else {
        const { data, error } = await auth.signUp(email, password, fullName)
        if (error) throw error
        if (data?.user && !data?.session) {
          setMsg('Revisa tu email para confirmar la cuenta.')
        } else if (data?.session) {
          setMsg('¡Registrado! Redirigiendo...')
        }
      }
    } catch (err) {
      const errText = err?.message || 'Error al registrar'
      if (errText.toLowerCase().includes('fetch') || errText.toLowerCase().includes('network') || errText.toLowerCase().includes('failed')) {
        setMsg(`Sin conexión a Supabase. Abre SETUP_SUPABASE.md o supabase.com → tu proyecto → Restore si pausado. Luego Auth → URL Config → añade http://localhost:5174 y http://192.168.1.216:5174`)
      } else {
        setMsg(errText)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 w-full max-w-sm space-y-4 px-4 sm:px-0">
      {mode === 'signup' && (
        <input
          type="text"
          placeholder="Nombre"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800 text-white focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
        />
      )}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800 text-white focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
      />
      <input
        type="password"
        placeholder="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800 text-white focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_25px_rgba(251,191,36,0.35)] disabled:opacity-50 active:scale-[0.98] touch-manipulation transition"
      >
        {mode === 'signin' ? 'Iniciar sesión' : 'Registrarse'}
      </button>
      <p className="text-sm text-zinc-500 text-center">
        {mode === 'signin' ? '¿Sin cuenta?' : '¿Ya tienes cuenta?'}{' '}
        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="text-amber-400 hover:underline py-2 touch-manipulation"
        >
          {mode === 'signin' ? 'Registrarse' : 'Iniciar sesión'}
        </button>
      </p>
      {msg && <p className="text-sm text-center text-amber-400">{msg}</p>}
    </form>
  )
}
