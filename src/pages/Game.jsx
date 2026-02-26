import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Copy, Eye, Share2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase, PARTIDAS_SELECT_COLUMNS } from '../lib/supabase'
import GameArena from '../components/GameArena'
import { usePreventBackDuringGame, mensajeSalirPartida } from '../hooks/usePreventBackDuringGame'
import ConfirmSalirModal from '../components/ConfirmSalirModal'

function copyToClipboard(text) {
  if (typeof navigator?.clipboard?.writeText === 'function') {
    return navigator.clipboard.writeText(text)
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.cssText = 'position:fixed;left:0;top:0;width:2em;height:2em;padding:0;border:none;outline:none;opacity:0;pointer-events:none;'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  if (typeof textarea.setSelectionRange === 'function') {
    textarea.setSelectionRange(0, text.length)
  }
  try {
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok ? Promise.resolve() : Promise.reject(new Error('execCommand failed'))
  } catch (e) {
    document.body.removeChild(textarea)
    return Promise.reject(e)
  }
}

const ADMIN_UID = (import.meta.env.VITE_PHANTOM_ADMIN_UID || '').trim()

export default function Game() {
  const { partidaId } = useParams()
  const navigate = useNavigate()
  const { user, profile, refreshBalance } = useAuth()
  const [partida, setPartida] = useState(null)
  const [loading, setLoading] = useState(true)
  const [jugandoDeNuevo, setJugandoDeNuevo] = useState(false)
  const [jugandoDeNuevoError, setJugandoDeNuevoError] = useState('')
  const [copyToast, setCopyToast] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const [rivalAbandonoSala, setRivalAbandonoSala] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [numeroSecreto, setNumeroSecreto] = useState(null)
  const [loadingSecreto, setLoadingSecreto] = useState(false)
  const isPhantomAdmin = !!(user && ADMIN_UID && user.id === ADMIN_UID)
  const leaveResolveRef = useRef(null)
  const avisoEntradaEnviadoRef = useRef(false)
  const partidaParaBroadcastRef = useRef(null)
  const presenceCountRef = useRef(0)
  const partidaRef = useRef(null)
  const balanceRefreshedForPartidaRef = useRef(null)
  partidaRef.current = partida
  const enPartidaActiva = partida && (partida.estado === 'jugando' || partida.estado === 'esperando')
  const getConfirmLeave = useCallback(() => {
    return new Promise((resolve) => {
      leaveResolveRef.current = resolve
      setShowLeaveModal(true)
    })
  }, [])
  const onBackConfirmLeave = useCallback(async () => {
    const p = partidaRef.current
    if (!p || !partidaId) return
    if (p.estado === 'jugando') {
      await supabase.rpc('abandonar_partida', { p_partida_id: partidaId })
      try {
        channelRef.current?.send({ type: 'broadcast', event: 'rival_abandono', payload: {} })
      } catch (_) {}
      await refreshBalance()
    } else if (p.estado === 'esperando' && p.host_id === user?.id) {
      await supabase.rpc('cancelar_partida_espera', { p_partida_id: partidaId })
    }
  }, [partidaId, user?.id, refreshBalance])
  usePreventBackDuringGame(!!enPartidaActiva, onBackConfirmLeave, getConfirmLeave)

  useEffect(() => {
    avisoEntradaEnviadoRef.current = false
    partidaParaBroadcastRef.current = null
    balanceRefreshedForPartidaRef.current = null
  }, [partidaId])

  useEffect(() => {
    if (!user || !partidaId) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load(retries = 2) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (cancelled) return
        const { data, error } = await supabase
          .from('partidas')
          .select(PARTIDAS_SELECT_COLUMNS)
          .eq('id', partidaId)
          .single()
        if (cancelled) return
        if (!error && data) {
          if (data.host_id !== user.id && data.guest_id !== user.id) {
            setLoading(false)
            navigate('/dashboard')
            return
          }
          setPartida(data)
          setLoading(false)
          return
        }
        if (attempt < retries) await new Promise((r) => setTimeout(r, 400))
      }
      setLoading(false)
      navigate('/dashboard')
    }
    load()
    return () => { cancelled = true }
  }, [user, partidaId, navigate])

  useEffect(() => {
    const enPartida = partida && (partida.estado === 'jugando' || partida.estado === 'esperando')
    if (!enPartida) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [partida])

  // Refetch partida. IMPORTANTE: no sobrescribir 'jugando' con 'esperando' (réplica atrasada).
  const refetchPartida = useCallback(async () => {
    if (!partidaId) return
    let p = null
    try {
      const { data: rpcData } = await supabase.rpc('obtener_partida_actual', { p_partida_id: partidaId })
      p = rpcData?.ok && rpcData?.partida && typeof rpcData.partida === 'object' ? rpcData.partida : null
    } catch (_) {}
    if (!p) {
      const { data } = await supabase.from('partidas').select(PARTIDAS_SELECT_COLUMNS).eq('id', partidaId).single()
      p = data
    }
    if (!p) return
    setPartida((prev) => {
      if (prev?.estado === 'jugando' && p.estado === 'esperando') return prev
      return p
    })
  }, [partidaId])

  const channelRef = useRef(null)
  // Realtime: postgres_changes + Presence + Broadcast (rival envía la partida para evitar réplica)
  useEffect(() => {
    if (!partidaId || !user?.id) return
    const channel = supabase
      .channel(`game:${partidaId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'partidas', filter: `id=eq.${partidaId}` }, (payload) => {
        const raw = payload?.new
        if (raw) {
          const { numero_prohibido: _, ...next } = raw
          setPartida(next)
          if (next.estado === 'jugando' && next.guest_id) refetchPartida()
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const count = Object.keys(state).length
        if (count >= 2) refetchPartida()
        const p = partidaRef.current
        if (p?.estado === 'finalizada' && p?.room_code && p?.guest_id) {
          if (presenceCountRef.current >= 2 && count === 1) setRivalAbandonoSala(true)
          presenceCountRef.current = count
        }
      })
      .on('broadcast', { event: 'partida_rival' }, (msg) => {
        const p = (msg && (msg.payload !== undefined ? msg.payload : msg))
        if (p && typeof p === 'object' && p.estado === 'jugando' && p.guest_id) setPartida(p)
      })
      .on('broadcast', { event: 'rival_abandono' }, () => {
        setRivalAbandonoSala(true)
        refetchPartida()
      })
    channelRef.current = channel
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({ user_id: user.id })
        const p = partidaParaBroadcastRef.current
        if (p) {
          try { channel.send({ type: 'broadcast', event: 'partida_rival', payload: p }) } catch (_) {}
        }
      }
    })
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [partidaId, user?.id, refetchPartida])

  // Rival al cargar: guardar partida en ref y enviar por Broadcast (varios intentos hasta que canal esté listo)
  useEffect(() => {
    if (!partidaId || !partida || partida.estado !== 'jugando' || partida.guest_id !== user?.id) return
    if (avisoEntradaEnviadoRef.current) return
    avisoEntradaEnviadoRef.current = true
    partidaParaBroadcastRef.current = partida
    const sendPartida = () => {
      try { channelRef.current?.send({ type: 'broadcast', event: 'partida_rival', payload: partida }) } catch (_) {}
    }
    sendPartida()
    const timers = [100, 250, 500, 800, 1200, 2000].map((ms) => setTimeout(sendPartida, ms))
    supabase.rpc('avisar_entrada_rival', { p_partida_id: partidaId }).then(() => {})
    return () => timers.forEach(clearTimeout)
  }, [partidaId, partida?.estado, partida?.guest_id, user?.id])

  // Host esperando rival: refetch cada 100ms + partida_tiene_rival cada 80ms
  useEffect(() => {
    if (!partidaId || !partida || partida.estado !== 'esperando' || partida.host_id !== user?.id) return
    refetchPartida()
    const t1 = setTimeout(refetchPartida, 40)
    const intervalRefetch = setInterval(refetchPartida, 100)
    async function checkRival() {
      const { data } = await supabase.rpc('partida_tiene_rival', { p_partida_id: partidaId })
      if (data?.ok && data?.tiene_rival) refetchPartida()
    }
    const t2 = setTimeout(checkRival, 30)
    const intervalRival = setInterval(checkRival, 80)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearInterval(intervalRefetch)
      clearInterval(intervalRival)
    }
  }, [partidaId, partida?.estado, partida?.host_id, user?.id, refetchPartida])

  useEffect(() => {
    if (!partidaId || !partida || partida.estado !== 'esperando') return
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refetchPartida()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [partidaId, partida?.estado, refetchPartida])

  // Mientras se juega: polling cada 3s para detectar si el rival cerró sesión (partida pasa a finalizada)
  useEffect(() => {
    if (!partidaId || !partida || partida.estado !== 'jugando') return
    const interval = setInterval(refetchPartida, 3000)
    return () => clearInterval(interval)
  }, [partidaId, partida?.estado, refetchPartida])

  useEffect(() => {
    if (partida?.estado !== 'finalizada') setRivalAbandonoSala(false)
  }, [partida?.estado])

  // Ocultar número secreto cuando se sale de la partida o termina
  useEffect(() => {
    if (partida?.estado !== 'jugando') setNumeroSecreto(null)
  }, [partida?.estado])

  // Actualizar saldo en pantalla cuando la partida termina (gane o pierda)
  useEffect(() => {
    if (!partidaId || !partida || partida.estado !== 'finalizada') return
    if (balanceRefreshedForPartidaRef.current === partidaId) return
    balanceRefreshedForPartidaRef.current = partidaId
    refreshBalance()
  }, [partidaId, partida?.estado, partida?.id, refreshBalance])

  async function handleVictory() {
    await refreshBalance()
  }

  async function handleSalir() {
    if (saliendo || !partidaId || !partida) {
      navigate('/dashboard')
      return
    }
    const enJuego = partida.estado === 'jugando' || partida.estado === 'esperando'
    if (enJuego) {
      const ok = await getConfirmLeave()
      if (!ok) return
    }
    setSaliendo(true)
    try {
      if (partida.estado === 'jugando') {
        await supabase.rpc('abandonar_partida', { p_partida_id: partidaId })
        await refreshBalance()
      } else if (partida.estado === 'esperando' && partida.host_id === user?.id) {
        await supabase.rpc('cancelar_partida_espera', { p_partida_id: partidaId })
      } else if (partida.estado === 'finalizada' && partida.room_code && partida.guest_id) {
        try { channelRef.current?.send({ type: 'broadcast', event: 'rival_abandono', payload: {} }) } catch (_) {}
      }
    } catch (_) {}
    setSaliendo(false)
    navigate('/dashboard')
  }

  function handleVolverAlInicio() {
    if (partida?.estado === 'finalizada' && partida?.room_code && partida?.guest_id) {
      try { channelRef.current?.send({ type: 'broadcast', event: 'rival_abandono', payload: {} }) } catch (_) {}
    }
    navigate('/dashboard')
  }

  async function handleJugarDeNuevo() {
    setJugandoDeNuevoError('')
    setJugandoDeNuevo(true)
    try {
      const apuesta = Number(partida?.apuesta) || 1
      const balance = profile?.balance ?? 0
      if (balance < apuesta) {
        setJugandoDeNuevoError('Saldo insuficiente. Recarga en el Cajero.')
        return
      }
      const esPartidaAmigos = !!partida?.room_code && !!partida?.guest_id
      if (esPartidaAmigos) {
        // Marcar que quieres revancha; si el rival ya tocó, se reinicia la partida
        const { data, error: err } = await supabase.rpc('reiniciar_partida', { p_partida_id: partidaId })
        if (err) throw err
        if (!data?.ok) throw new Error(data?.error || 'Error al reiniciar')
        const { data: p } = await supabase.from('partidas').select(PARTIDAS_SELECT_COLUMNS).eq('id', partidaId).single()
        if (p) setPartida(p)
      } else {
        // Matchmaking: buscar nueva partida (cola: si esperando, ir al dashboard a esperar)
        const { data, error: err } = await supabase.rpc('buscar_partida', { p_apuesta: apuesta })
        if (err) throw err
        if (!data?.ok) throw new Error(data?.error || 'Error al buscar partida')
        if (data.esperando) {
          navigate('/dashboard', { state: { esperandoRival: true } })
          return
        }
        navigate(`/game/${data.partida_id}`)
      }
    } catch (e) {
      setJugandoDeNuevoError(e.message || 'Error')
    } finally {
      setJugandoDeNuevo(false)
    }
  }

  if (!user) {
    navigate('/dashboard')
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050508]">
        <motion.div
          className="w-12 h-12 border-2 border-amber-500/80 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        />
      </div>
    )
  }

  if (!partida) return null

  if (partida.estado === 'cancelada') {
    return (
      <div className="min-h-dvh min-h-screen bg-[#050508] text-zinc-100 p-4 flex flex-col items-center justify-center pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-zinc-400 mb-4">Esta sala fue cancelada.</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_25px_rgba(251,191,36,0.35)] active:scale-[0.98]"
        >
          Volver al inicio
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh min-h-screen bg-[#050508] text-zinc-100 p-4 flex flex-col items-center pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <ConfirmSalirModal
        open={showLeaveModal}
        message={mensajeSalirPartida}
        onConfirm={() => {
          leaveResolveRef.current?.(true)
          setShowLeaveModal(false)
        }}
        onCancel={() => {
          leaveResolveRef.current?.(false)
          setShowLeaveModal(false)
        }}
      />
      <header className="flex justify-between items-center w-full mb-4 px-2">
        <div className="w-24 flex-shrink-0" aria-hidden="true" />
        <button
          onClick={handleSalir}
          disabled={saliendo}
          className="flex items-center gap-2 text-zinc-400 hover:text-amber-400 transition min-h-[44px] min-w-[44px] touch-manipulation justify-center rounded-2xl hover:bg-zinc-900/80 active:scale-[0.98] disabled:opacity-60"
        >
          <ArrowLeft className="w-5 h-5" />
          {saliendo ? '...' : 'Salir'}
        </button>
        <div className="flex flex-col items-center flex-1">
          {partida.estado !== 'jugando' && (
            <>
              <motion.span
                className="text-6xl sm:text-7xl inline-block drop-shadow-lg"
                animate={{ scale: [1, 1.3, 1], filter: ['brightness(1)', 'brightness(1.4)', 'brightness(1)'] }}
                transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
              >
                💣
              </motion.span>
              <h1 className="text-xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent text-center">
                LA BOMBA
              </h1>
            </>
          )}
        </div>
        <div className="w-24 flex justify-end items-center gap-2 flex-shrink-0">
          {partida?.estado === 'jugando' && isPhantomAdmin && (
            <>
              <button
                type="button"
                onClick={async () => {
                  if (!partidaId) return
                  setLoadingSecreto(true)
                  setNumeroSecreto(null)
                  const { data } = await supabase.rpc('admin_ver_numero_prohibido', { p_partida_id: partidaId })
                  setLoadingSecreto(false)
                  if (data?.ok && typeof data.numero_prohibido === 'number') setNumeroSecreto(data.numero_prohibido)
                  else setNumeroSecreto(-1)
                }}
                disabled={loadingSecreto}
                className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 text-sm font-medium hover:bg-amber-500/30 active:scale-[0.98] touch-manipulation disabled:opacity-60"
                title="Ver número secreto (bomba)"
              >
                <Eye className="w-4 h-4" />
                {loadingSecreto ? '...' : numeroSecreto !== null && numeroSecreto >= 0 ? `Bomba: ${numeroSecreto}` : 'Nº secreto'}
              </button>
              {numeroSecreto === -1 && <span className="text-xs text-red-400">Error</span>}
            </>
          )}
        </div>
      </header>

      <main className="w-full max-w-2xl px-2 sm:px-0 space-y-6">
        {partida.estado === 'esperando' && (
          <motion.div
            className="rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-8 text-center space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="text-zinc-400">Esperando rival...</p>
            {partida.host_id === user.id && (
              <button
                type="button"
                onClick={() => refetchPartida()}
                className="text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2 touch-manipulation"
              >
                Comprobar si ya llegó el rival
              </button>
            )}
            {partida.host_id === user.id && partida.room_code && !partida.matchmaking && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-500">Comparte el código con tu amigo para que se una:</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <span className="px-5 py-3 rounded-2xl bg-zinc-800/80 border border-zinc-700 font-mono text-2xl font-bold text-amber-400 tracking-widest">
                    {partida.room_code}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        copyToClipboard(partida.room_code).then(() => {
                          setCopyToast(true)
                          setTimeout(() => setCopyToast(false), 2000)
                        }).catch(() => {})
                      }}
                      className="flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-2xl bg-amber-500/20 text-amber-400 font-bold border-2 border-amber-500/80 hover:bg-amber-500/30 active:scale-[0.98] touch-manipulation transition"
                    >
                      <Copy className="w-5 h-5" />
                      Copiar
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Únete a mi partida de La Bomba. Código: ${partida.room_code}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-2xl bg-amber-500/20 text-amber-400 font-bold border-2 border-amber-500/80 hover:bg-amber-500/30 active:scale-[0.98] touch-manipulation justify-center transition"
                    >
                      <Share2 className="w-5 h-5" />
                      Compartir por WhatsApp
                    </a>
                  </div>
                </div>
                {copyToast && (
                  <p className="text-sm text-green-400">Código copiado</p>
                )}
              </div>
            )}
            <motion.div
              className="w-10 h-10 mx-auto border-2 border-amber-500/80 border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            />
          </motion.div>
        )}

        {partida.estado === 'jugando' && partida.guest_id && (
          <GameArena partidaId={partidaId} userId={user.id} userName={profile?.full_name || user?.email?.split('@')[0] || 'Tú'} onVictory={handleVictory} />
        )}
        {partida.estado === 'jugando' && !partida.guest_id && (
          <motion.div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-8 text-center">
            <p className="text-zinc-400">Preparando partida...</p>
            <motion.div className="w-10 h-10 mx-auto mt-4 border-2 border-amber-500/80 border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} />
          </motion.div>
        )}

        {partida.estado === 'finalizada' && (
          <motion.div
            className="rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-8 text-center"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <p className="text-2xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent">
              {partida.ganador_id === user.id
                ? (rivalAbandonoSala ? '¡Ganaste! El rival abandonó.' : '¡Ganaste!')
                : 'Perdiste'}
            </p>
            <p className="text-zinc-400 mt-2">
              {partida.ganador_id === user.id
                ? `+$${Number(partida.apuesta).toFixed(2)} acreditados`
                : `-$${Number(partida.apuesta).toFixed(2)} descontados`}
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              {(() => {
                const esPartidaAmigos = !!(partida?.room_code && partida?.guest_id)
                const yoQuiereRevancha = esPartidaAmigos && (
                  (partida.host_id === user?.id && partida.host_quiere_revancha) ||
                  (partida.guest_id === user?.id && partida.guest_quiere_revancha)
                )
                const textoBoton = !esPartidaAmigos
                  ? (jugandoDeNuevo ? 'Buscando...' : 'Revancha')
                  : jugandoDeNuevo
                    ? '...'
                    : yoQuiereRevancha
                      ? 'Esperando al rival...'
                      : 'Revancha'
                return (
                  <button
                    onClick={handleJugarDeNuevo}
                    disabled={jugandoDeNuevo || yoQuiereRevancha || (profile?.balance ?? 0) < Number(partida.apuesta)}
                    className="px-6 py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_25px_rgba(251,191,36,0.35)] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] touch-manipulation transition"
                  >
                    {textoBoton}
                  </button>
                )
              })()}
              <button
                onClick={handleVolverAlInicio}
                className="px-6 py-3 min-h-[44px] rounded-2xl border-2 border-amber-500/80 text-amber-400 font-bold hover:bg-amber-500/20 active:scale-[0.98] touch-manipulation transition"
              >
                Volver al inicio
              </button>
            </div>
            {rivalAbandonoSala && partida.ganador_id !== user.id && (
              <p className="text-amber-400 font-semibold text-sm mt-3 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                El rival ha abandonado la sala
              </p>
            )}
            {jugandoDeNuevoError && (
              <p className="text-red-400 text-sm mt-3">{jugandoDeNuevoError}</p>
            )}
            {(profile?.balance ?? 0) < Number(partida.apuesta) && (
              <p className="text-amber-400/80 text-sm mt-2">Saldo insuficiente. Recarga en el Cajero.</p>
            )}
          </motion.div>
        )}
      </main>
    </div>
  )
}
