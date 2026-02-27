import { useCallback, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { playCoinSound } from './utils/sounds'
import { ChatProvider, useChat } from './context/ChatContext'
import { NotificationsProvider, useNotifications } from './context/NotificationsContext'
import { useChatNotifications } from './hooks/useChatNotifications'
import { useTransferNotifications } from './hooks/useTransferNotifications'
import { useDepositNotifications } from './hooks/useDepositNotifications'
import { useRetiroProcesadoNotifications } from './hooks/useRetiroProcesadoNotifications'
import CajaChat from './components/CajaChat'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Game from './pages/Game'
import Join from './pages/Join'
import PlayFree from './pages/PlayFree'
import AdminPhantom from './pages/AdminPhantom'
import Terminos from './pages/Terminos'
import ConfirmarEmail from './pages/ConfirmarEmail'

function ChatNotifications() {
  const { user, refreshBalance } = useAuth()
  const { openChatWith } = useChat()
  const { notification, setPendingNotification, clearNotification } = useNotifications()
  const navigate = useNavigate()

  const onNotifyChat = useCallback((senderName, preview, senderId) => {
    setPendingNotification({ type: 'chat', senderName, preview, senderId })
  }, [setPendingNotification])

  const onNotifyTransfer = useCallback((remitenteName, monto, remitenteId) => {
    setPendingNotification({ type: 'transfer', senderName: remitenteName, monto, senderId: remitenteId })
  }, [setPendingNotification])

  const onNotifyDeposit = useCallback((monto, red) => {
    setPendingNotification({ type: 'deposit', monto, red, senderName: 'Depósito acreditado' })
  }, [setPendingNotification])

  const onNotifyRetiroProcesado = useCallback((monto, red) => {
    setPendingNotification({ type: 'retiro_procesado', monto, red })
  }, [setPendingNotification])

  const prevNotificationRef = useRef(null)
  useEffect(() => {
    if (!notification) return
    if (prevNotificationRef.current !== notification) {
      playCoinSound()
      prevNotificationRef.current = notification
    }
    const t = setTimeout(clearNotification, 6000)
    return () => clearTimeout(t)
  }, [notification, clearNotification])

  useChatNotifications(user?.id, onNotifyChat)
  useTransferNotifications(user?.id, onNotifyTransfer, refreshBalance)
  useDepositNotifications(user?.id, onNotifyDeposit, refreshBalance)
  useRetiroProcesadoNotifications(user?.id, onNotifyRetiroProcesado)

  function handleNotificationClick() {
    const isTransfer = notification?.type === 'transfer'
    const isDeposit = notification?.type === 'deposit'
    const isRetiroProcesado = notification?.type === 'retiro_procesado'
    if (isTransfer || isDeposit || isRetiroProcesado) {
      clearNotification()
      return
    }
    if (notification?.senderId) openChatWith(notification.senderId, notification.senderName)
    else openChatWith(null)
    clearNotification()
  }

  if (!notification) return null
  const isTransfer = notification.type === 'transfer'
  const isDeposit = notification.type === 'deposit'
  const isRetiroProcesado = notification.type === 'retiro_procesado'
  const redLabel = notification.red === 'base' ? 'Base' : notification.red === 'polygon' ? 'Polygon' : notification.red === 'solana' ? 'Solana' : notification.red || ''
  return (
    <button
      type="button"
      onClick={handleNotificationClick}
      className="fixed z-[100] max-w-[calc(100vw-2rem)] rounded-2xl bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 border-amber-500/40 p-4 shadow-[0_0_25px_rgba(251,191,36,0.15)] text-amber-100 text-left hover:bg-zinc-800/95 active:scale-[0.98] cursor-pointer transition touch-manipulation"
      style={{ top: 'max(1rem, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)' }}
    >
      <p className="font-semibold text-amber-300">
        {isDeposit ? 'Depósito acreditado' : isTransfer ? 'Fondos recibidos' : isRetiroProcesado ? 'Retiro procesado' : 'Nuevo mensaje'}
      </p>
      <p className="text-sm mt-1">
        {isDeposit
          ? `+$${Number(notification.monto || 0).toFixed(2)} acreditados a tu saldo`
          : isTransfer
            ? `Has recibido $${notification.monto?.toFixed(2) || '0'} de ${notification.senderName}`
            : isRetiroProcesado
              ? `$${Number(notification.monto || 0).toFixed(2)} USDC enviados a tu wallet${redLabel ? ` (${redLabel})` : ''}`
              : notification.senderName}
      </p>
      {notification.preview && !isTransfer && !isDeposit && !isRetiroProcesado && (
        <p className="text-xs text-zinc-400 mt-1 truncate">{notification.preview}</p>
      )}
      <p className="text-xs text-amber-400 mt-2">
        {isDeposit || isTransfer || isRetiroProcesado ? 'Toca para cerrar' : 'Toca para abrir mensajes'}
      </p>
    </button>
  )
}

function AppContent() {
  const { loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#050508]" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(251, 191, 36, 0.08) 0%, transparent 50%), #050508' }}>
        <div className="text-center">
          <p className="text-lg font-semibold bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent mb-4">Cargando LA BOMBA...</p>
          <div className="w-10 h-10 border-2 border-amber-500/80 border-t-transparent rounded-full mx-auto animate-spin" />
        </div>
      </div>
    )
  }
  return (
    <NotificationsProvider>
      <ChatProvider>
        <ChatNotifications />
        <ChatOrRoutes />
      </ChatProvider>
    </NotificationsProvider>
  )
}

function ChatOrRoutes() {
  const { chatOpen, closeChat } = useChat()
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/game/:partidaId" element={<Game />} />
        <Route path="/join/:roomCode" element={<Join />} />
        <Route path="/play-free" element={<PlayFree />} />
        <Route path="/admin-phantom" element={<AdminPhantom />} />
        <Route path="/terminos" element={<Terminos />} />
        <Route path="/confirmar" element={<ConfirmarEmail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {chatOpen && <CajaChat onClose={closeChat} />}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-dvh w-full bg-[#050508]">
          <div className="mx-auto w-full max-w-[430px] min-h-dvh bg-[#050508] relative">
            <AppContent />
          </div>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}
