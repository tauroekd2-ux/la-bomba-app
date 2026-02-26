import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { MessageCircle, Send, DollarSign } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { supabase } from '../lib/supabase'

export default function CajaChat({ onClose }) {
  const { user, profile, refreshBalance } = useAuth()
  const { openWithUser, clearOpenWithUser } = useChat()
  const [tab, setTab] = useState('chat')
  const [destNombre, setDestNombre] = useState('')
  const [destUser, setDestUser] = useState(null)
  const [usuariosEncontrados, setUsuariosEncontrados] = useState([])
  const [mensajes, setMensajes] = useState([])
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [monto, setMonto] = useState('')
  const [msg, setMsg] = useState('')
  const listRef = useRef(null)

  const balance = Number(profile?.balance ?? 0)
  const destId = destUser?.id

  // Buscar usuario por nombre
  async function buscarUsuario() {
    if (!destNombre.trim()) return
    setMsg('')
    setEnviando(true)
    setUsuariosEncontrados([])
    setDestUser(null)
    try {
      const { data } = await supabase.rpc('obtener_usuario_por_nombre', { p_nombre: destNombre.trim() })
      if (data?.ok && data?.usuarios?.length) {
        if (data.usuarios.length === 1) {
          setDestUser({ id: data.usuarios[0].id, full_name: data.usuarios[0].full_name })
          setUsuariosEncontrados([])
        } else {
          setUsuariosEncontrados(data.usuarios)
          setDestUser(null)
        }
      } else {
        setDestUser(null)
        setMsg(data?.error || 'Usuario no encontrado')
      }
    } catch (e) {
      setDestUser(null)
      setMsg('Error al buscar')
    } finally {
      setEnviando(false)
    }
  }

  function seleccionarUsuario(u) {
    setDestUser({ id: u.id, full_name: u.full_name })
    setUsuariosEncontrados([])
  }

  // Abrir conversación con usuario (ej. al hacer clic en notificación)
  useEffect(() => {
    if (openWithUser?.id) {
      setDestUser({ id: openWithUser.id, full_name: openWithUser.full_name })
      setTab('chat')
      clearOpenWithUser()
    }
  }, [openWithUser?.id])

  // Obtener nombre real por ID (evita "Alguien" cuando viene de notificación)
  useEffect(() => {
    if (!destId || (destUser?.full_name && destUser.full_name !== 'Usuario' && destUser.full_name !== 'Alguien')) return
    supabase.rpc('obtener_nombre_por_id', { p_id: destId }).then(({ data }) => {
      if (data?.ok && data?.full_name) {
        setDestUser((prev) => (prev ? { ...prev, full_name: data.full_name } : prev))
      }
    })
  }, [destId, destUser?.full_name])

  // Cargar mensajes de la conversación
  useEffect(() => {
    if (!user?.id || !destId) {
      setMensajes([])
      return
    }
    async function load() {
      const { data, error } = await supabase
        .from('chat_mensajes')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${destId}),and(sender_id.eq.${destId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
      if (error) {
        setMsg('Error al cargar mensajes')
        setMensajes([])
        return
      }
      setMensajes(data || [])
    }
    load()
  }, [user?.id, destId])

  // Realtime mensajes (evitar duplicados al enviar nosotros)
  useEffect(() => {
    if (!user?.id || !destId) return
    const channel = supabase
      .channel(`chat:${user.id}:${destId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_mensajes' },
        (payload) => {
          const m = payload.new
          if ((m.sender_id === user.id && m.receiver_id === destId) ||
              (m.sender_id === destId && m.receiver_id === user.id)) {
            setMensajes((prev) => {
              if (prev.some((x) => x.id === m.id)) return prev
              return [...prev, m]
            })
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user?.id, destId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [mensajes])

  async function enviarMensaje(e) {
    e.preventDefault()
    if (!nuevoMensaje.trim() || !destId) return
    setEnviando(true)
    setMsg('')
    try {
      const { data: inserted, error } = await supabase
        .from('chat_mensajes')
        .insert({
          sender_id: user.id,
          receiver_id: destId,
          contenido: nuevoMensaje.trim(),
        })
        .select()
        .single()
      if (error) throw error
      setNuevoMensaje('')
      if (inserted) {
        setMensajes((prev) => {
          if (prev.some((x) => x.id === inserted.id)) return prev
          return [...prev, inserted]
        })
      }
    } catch (err) {
      setMsg('Error al enviar mensaje')
    } finally {
      setEnviando(false)
    }
  }

  async function enviarFondos(e) {
    e.preventDefault()
    setMsg('')
    const amount = Number(monto)
    if (!destUser?.id || !amount || amount <= 0) {
      setMsg('Busca un usuario y indica un monto válido')
      return
    }
    if (amount > balance) {
      setMsg('Saldo insuficiente')
      return
    }
    setEnviando(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('enviar_fondos', {
        p_destinatario_id: destUser.id,
        p_monto: amount,
      })
      if (rpcError) {
        setMsg(rpcError.message || 'Error al enviar')
        return
      }
      if (data?.ok) {
        await refreshBalance()
        setMonto('')
        setMsg('Transferencia enviada')
      } else {
        setMsg(data?.error || 'Error')
      }
    } catch (e) {
      setMsg(e?.message || 'Error al enviar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
    >
      <motion.div
        className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/95 shadow-2xl shadow-black/50 backdrop-blur-md p-4 max-h-[min(85vh,calc(100dvh-2rem))] flex flex-col m-4 overflow-hidden"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -inset-4 bg-gradient-to-b from-amber-500/8 to-transparent rounded-[2rem] blur-2xl -z-10 pointer-events-none" />
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent">Chat y transferencias</span>
          </h2>
          <button
            onClick={onClose}
            className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 touch-manipulation flex items-center justify-center transition active:scale-[0.98]"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setTab('chat'); setMsg('') }}
            className={`flex-1 py-3 min-h-[44px] rounded-2xl font-semibold flex items-center justify-center gap-2 touch-manipulation transition active:scale-[0.98] ${
              tab === 'chat' ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/80' : 'bg-zinc-800/80 text-zinc-400 border-2 border-zinc-700'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            Chat
          </button>
          <button
            onClick={() => { setTab('fondos'); setMsg('') }}
            className={`flex-1 py-3 min-h-[44px] rounded-2xl font-semibold flex items-center justify-center gap-2 touch-manipulation transition active:scale-[0.98] ${
              tab === 'fondos' ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/80' : 'bg-zinc-800/80 text-zinc-400 border-2 border-zinc-700'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Enviar fondos
          </button>
        </div>

        {tab === 'chat' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Nombre del usuario"
                value={destNombre}
                onChange={(e) => setDestNombre(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarUsuario()}
                className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
              />
              <button
                onClick={buscarUsuario}
                disabled={enviando}
                className="px-4 min-h-[44px] py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_20px_rgba(251,191,36,0.3)] disabled:opacity-50 touch-manipulation active:scale-[0.98] transition"
              >
                Buscar
              </button>
            </div>
            {usuariosEncontrados.length > 1 && (
              <div className="mb-2 space-y-1">
                <p className="text-xs text-zinc-500">Varios resultados. Elige uno:</p>
                {usuariosEncontrados.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => seleccionarUsuario(u)}
                    className="block w-full text-left px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm transition"
                  >
                    {u.full_name || 'Sin nombre'}
                  </button>
                ))}
              </div>
            )}

            {destUser && (
              <>
                <p className="text-sm text-zinc-400 mb-2">Chat con: <span className="text-amber-400 font-medium">{destUser.full_name}</span></p>
                <div
                  ref={listRef}
                  className="flex-1 overflow-y-auto space-y-2 mb-3 p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 min-h-[120px] max-h-[200px]"
                >
                  {mensajes.map((m) => (
                    <div
                      key={m.id}
                      className={`text-sm p-2.5 rounded-xl max-w-[85%] ${
                        m.sender_id === user.id
                          ? 'ml-auto bg-amber-500/20 border border-amber-500/50'
                          : 'mr-auto bg-zinc-800 border border-zinc-700'
                      }`}
                    >
                      {m.contenido}
                    </div>
                  ))}
                </div>
                <form onSubmit={enviarMensaje} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Escribe un mensaje..."
                    value={nuevoMensaje}
                    onChange={(e) => setNuevoMensaje(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
                  />
                  <button
                    type="submit"
                    disabled={enviando || !nuevoMensaje.trim()}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_20px_rgba(251,191,36,0.3)] disabled:opacity-50 active:scale-[0.98]"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {tab === 'fondos' && (
          <form onSubmit={enviarFondos} className="space-y-4">
            <p className="text-sm text-zinc-400">Busca por nombre y envía fondos</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre del destinatario"
                value={destNombre}
                onChange={(e) => setDestNombre(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), buscarUsuario())}
                className="flex-1 px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
              />
              <button
                type="button"
                onClick={buscarUsuario}
                disabled={enviando}
                className="px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_20px_rgba(251,191,36,0.3)] disabled:opacity-50 active:scale-[0.98]"
              >
                Buscar
              </button>
            </div>
            {usuariosEncontrados.length > 1 && (
              <div className="space-y-1">
                <p className="text-xs text-zinc-500">Varios resultados. Elige uno:</p>
                {usuariosEncontrados.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => seleccionarUsuario(u)}
                    className="block w-full text-left px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm transition"
                  >
                    {u.full_name || 'Sin nombre'}
                  </button>
                ))}
              </div>
            )}
            {destUser && (
              <p className="text-sm text-amber-400 font-medium">Enviar a: {destUser.full_name}</p>
            )}
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Monto USD"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
              required
            />
            <p className="text-xs text-zinc-500">Tu saldo: <span className="text-amber-400 font-medium">${balance.toFixed(2)}</span></p>
            <button
              type="submit"
              disabled={enviando || !destUser?.id || !monto || Number(monto) <= 0 || Number(monto) > balance}
              className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_25px_rgba(251,191,36,0.35)] disabled:opacity-50 active:scale-[0.98] transition"
            >
              {enviando ? 'Enviando...' : 'Enviar fondos'}
            </button>
          </form>
        )}

        {msg && <p className="mt-3 text-sm text-amber-400">{msg}</p>}
      </motion.div>
    </motion.div>
  )
}
