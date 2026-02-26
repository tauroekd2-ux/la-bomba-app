import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { supabase, PARTIDAS_SELECT_COLUMNS } from '../lib/supabase'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function generacion30Numeros099() {
  return shuffle(Array.from({ length: 100 }, (_, i) => i)).slice(0, 30)
}

let tickAudioContext = null
function playTick(urgente = false) {
  try {
    if (!tickAudioContext) tickAudioContext = new (window.AudioContext || window.webkitAudioContext)()
    const ctx = tickAudioContext
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    const dur = 0.1
    // Agudo (tick corto)
    const high = ctx.createOscillator()
    const highGain = ctx.createGain()
    high.connect(highGain)
    highGain.connect(ctx.destination)
    high.frequency.value = urgente ? 1500 : 1000
    high.type = 'square'
    highGain.gain.setValueAtTime(0.28, now)
    highGain.gain.exponentialRampToValueAtTime(0.01, now + dur * 0.5)
    high.start(now)
    high.stop(now + dur)
    // Bass (golpe bajo)
    const low = ctx.createOscillator()
    const lowGain = ctx.createGain()
    low.connect(lowGain)
    lowGain.connect(ctx.destination)
    low.frequency.value = urgente ? 55 : 75
    low.type = 'sine'
    lowGain.gain.setValueAtTime(0.45, now)
    lowGain.gain.exponentialRampToValueAtTime(0.01, now + dur)
    low.start(now)
    low.stop(now + dur)
  } catch (_) {}
}

function playWinSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const now = ctx.currentTime
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0, now + i * 0.25)
      gain.gain.linearRampToValueAtTime(0.2, now + i * 0.25 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.25 + 0.2)
      osc.start(now + i * 0.25)
      osc.stop(now + i * 0.25 + 0.2)
    })
  } catch (_) {}
}

function playExplosionSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const now = ctx.currentTime
    const dur = 0.6
    const noise = ctx.createBufferSource()
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < buf.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / buf.length, 2)
    noise.buffer = buf
    const noiseGain = ctx.createGain()
    noise.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noiseGain.gain.setValueAtTime(0.4, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + dur)
    noise.start(now)
    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.connect(oscGain)
    oscGain.connect(ctx.destination)
    osc.frequency.setValueAtTime(150, now)
    osc.frequency.exponentialRampToValueAtTime(30, now + dur)
    osc.type = 'sawtooth'
    oscGain.gain.setValueAtTime(0.3, now)
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + dur)
    osc.start(now)
    osc.stop(now + dur)
  } catch (_) {}
}

export default function GameArena({ partidaId, userId, userName, onVictory }) {
  const [partida, setPartida] = useState(null)
  const [numerosUsados, setNumerosUsados] = useState([])
  const [loading, setLoading] = useState(true)
  const [explosionNum, setExplosionNum] = useState(null)
  const [copyToast, setCopyToast] = useState(false)
  const [hostName, setHostName] = useState('')
  const [guestName, setGuestName] = useState('')
  const [segundero, setSegundero] = useState(25)
  const [bombaExplotando, setBombaExplotando] = useState(false)
  const perdioPorTiempoRef = useRef(false)
  const numerosMiosRef = useRef([])
  const sonidoFinRef = useRef(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('partidas')
        .select(PARTIDAS_SELECT_COLUMNS)
        .eq('id', partidaId)
        .single()
      if (error) {
        setLoading(false)
        return
      }
      setPartida(data)
      sonidoFinRef.current = null
      const nums = Array.isArray(data.numeros_usados) ? data.numeros_usados : []
      setNumerosUsados(nums)
      numerosMiosRef.current = []
      setLoading(false)
    }
    load()
  }, [partidaId])

  useEffect(() => {
    if (!partida?.host_id || !partida?.guest_id) return
    async function fetchNames() {
      const miNombre = userName || 'Tú'
      let h = ''
      let g = ''
      if (partida.host_id === userId) {
        h = miNombre
        const { data } = await supabase.rpc('obtener_nombre_por_id', { p_id: partida.guest_id })
        g = data?.full_name || 'Rival'
      } else {
        const { data } = await supabase.rpc('obtener_nombre_por_id', { p_id: partida.host_id })
        h = data?.full_name || 'Rival'
        g = miNombre
      }
      setHostName(h)
      setGuestName(g)
    }
    fetchNames()
  }, [partida?.host_id, partida?.guest_id, userId, userName])

  // Refetch partida (turno_actual, numeros_usados) para no depender solo de Realtime
  const refetchPartida = useCallback(async () => {
    if (!partidaId) return
    const { data, error } = await supabase.from('partidas').select(PARTIDAS_SELECT_COLUMNS).eq('id', partidaId).single()
    if (error || !data) return
    setPartida((prev) => {
      if (prev?.estado === 'jugando' && data.estado === 'esperando') return prev
      return data
    })
    setNumerosUsados(Array.isArray(data.numeros_usados) ? data.numeros_usados : [])
    if (data.estado === 'finalizada' && sonidoFinRef.current !== data.id) {
      sonidoFinRef.current = data.id
      if (data.ganador_id === userId) {
        playWinSound()
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
        onVictory?.()
      } else {
        playExplosionSound()
      }
    }
  }, [partidaId, userId, onVictory])

  useEffect(() => {
    if (!partidaId) return
    const channel = supabase
      .channel(`partida:${partidaId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'partidas', filter: `id=eq.${partidaId}` }, (payload) => {
        const newData = payload.new
        setPartida(newData)
        setNumerosUsados(Array.isArray(newData.numeros_usados) ? newData.numeros_usados : [])
        if (newData.estado === 'finalizada') {
          if (sonidoFinRef.current !== newData.id) {
            sonidoFinRef.current = newData.id
            if (newData.ganador_id === userId) {
              playWinSound()
              confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
            } else {
              playExplosionSound()
            }
          }
          if (newData.ganador_id === userId) onVictory?.()
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [partidaId, userId, onVictory])

  // Polling mientras se juega: asegura que ambos vean turno_actual aunque Realtime falle
  useEffect(() => {
    if (!partidaId || !partida || partida.estado !== 'jugando') return
    refetchPartida()
    const interval = setInterval(refetchPartida, 1500)
    return () => clearInterval(interval)
  }, [partidaId, partida?.estado, refetchPartida])

  // Segundero: se reinicia a 25 cuando cambia el turno
  useEffect(() => {
    if (!partida || partida.estado !== 'jugando') return
    perdioPorTiempoRef.current = false
    setBombaExplotando(false)
    setSegundero(25)
    const interval = setInterval(() => {
      setSegundero((s) => (s <= 0 ? 25 : s - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [partida?.estado, partida?.turno_actual])

  useEffect(() => {
    if (!partida || partida.estado !== 'jugando') return
    if (segundero >= 1) {
      playTick(segundero <= 5)
    }
  }, [segundero, partida?.estado])

  useEffect(() => {
    if (!partida || partida.estado !== 'jugando' || segundero !== 0) return
    if (partida.turno_actual !== userId) return
    if (perdioPorTiempoRef.current) return
    perdioPorTiempoRef.current = true
    setBombaExplotando(true)
    playExplosionSound()
    supabase.rpc('perder_por_tiempo', { p_partida_id: partidaId }).then(() => {
      setTimeout(() => setBombaExplotando(false), 2000)
    })
  }, [segundero, partida, partidaId, userId])

  async function handlePick(num) {
    if (!partida || partida.estado !== 'jugando') return
    if (partida.turno_actual !== userId) return
    if (numerosUsados.includes(num)) return

    const { data: rpcData, error: rpcErr } = await supabase.rpc('elegir_numero', {
      p_partida_id: partidaId,
      p_numero: num,
    })

    if (rpcErr) {
      setExplosionNum(num)
      setTimeout(() => setExplosionNum(null), 1500)
      return
    }

    if (rpcData?.bomba) {
      const explosionNumero = rpcData.ultimo_numero ? rpcData.numero_prohibido : num
      setExplosionNum(explosionNumero ?? num)
      setBombaExplotando(true)
      setTimeout(() => { setExplosionNum(null); setBombaExplotando(false) }, 1500)
      numerosMiosRef.current = [...numerosMiosRef.current, num]
      setNumerosUsados((prev) => [...prev, num])
      if (rpcData.ganador_id === userId) {
        playWinSound()
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
        onVictory?.()
      } else {
        playExplosionSound()
      }
    } else {
      numerosMiosRef.current = [...numerosMiosRef.current, num]
      setNumerosUsados((prev) => [...prev, num])
      refetchPartida()
    }
  }

  const NUMBERS = useMemo(() => {
    if (!partida) return generacion30Numeros099()
    let nums
    if (Array.isArray(partida.numeros_juego)) {
      nums = partida.numeros_juego.map(Number)
    } else if (partida.numeros_juego && typeof partida.numeros_juego === 'object') {
      nums = Object.values(partida.numeros_juego).map(Number)
    } else {
      nums = generacion30Numeros099()
    }
    return nums
  }, [partida?.numeros_juego])

  if (loading || !partida) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <motion.div
          className="w-12 h-12 border-2 border-amber-500 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        />
      </div>
    )
  }

  const isMyTurn = partida.turno_actual === userId
  const isFinished = partida.estado === 'finalizada'
  const iWon = partida.ganador_id === userId

  const nombreHost = hostName || '...'
  const nombreGuest = guestName || '...'

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-2">
        <div className="relative inline-block">
          <motion.span
            className={`text-7xl sm:text-8xl inline-block drop-shadow-lg ${bombaExplotando ? 'scale-150' : ''}`}
            animate={bombaExplotando ? { scale: [1, 1.5, 2], opacity: [1, 0.8, 0] } : { scale: [1, 1.2, 1], filter: ['brightness(1)', 'brightness(1.4)', 'brightness(1)'] }}
            transition={{ duration: bombaExplotando ? 0.8 : 1.2, repeat: bombaExplotando ? 0 : Infinity, ease: 'easeInOut' }}
          >
            {bombaExplotando ? '💥' : '💣'}
          </motion.span>
          {!isFinished && !bombaExplotando && (
            <span className={`absolute inset-0 flex items-center justify-center text-2xl sm:text-3xl font-bold drop-shadow-[0_0_2px_rgba(0,0,0,1)] [text-shadow:0_0_4px_#000] pointer-events-none translate-y-[12%] -translate-x-[6%] ${segundero <= 5 ? 'text-red-500' : 'text-white'}`}>
              {segundero}
            </span>
          )}
        </div>
        <p className="text-center font-semibold flex items-center justify-center gap-2 flex-wrap">
          <span className={partida.host_id === userId ? 'text-green-500' : 'text-red-500'}>{nombreHost}</span>
          <span className="text-zinc-500">vs</span>
          <span className={partida.guest_id === userId ? 'text-green-500' : 'text-red-500'}>{nombreGuest}</span>
        </p>
      </div>
      <div className="flex justify-between items-center">
        <div className={`px-4 py-2 rounded-xl font-semibold ${isMyTurn && !isFinished ? 'bg-zinc-800 text-green-500 ring-2 ring-green-500/50 border border-green-500/50' : 'bg-zinc-800 text-red-500'}`}>
          {isFinished ? (iWon ? '¡Ganaste!' : 'Perdiste') : isMyTurn ? 'Tu turno' : 'Turno del rival'}
        </div>
        <p className="text-zinc-500 text-sm">Apuesta: ${Number(partida.apuesta).toFixed(2)}</p>
      </div>

      <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 sm:gap-3">
        {NUMBERS.map((num) => {
          const used = numerosUsados.includes(num)
          const usadoPorRival = used && !numerosMiosRef.current.includes(num)
          const isExploding = explosionNum === num
          return (
            <motion.button
              key={num}
              onClick={() => !used && isMyTurn && !isFinished && handlePick(num)}
              disabled={used || !isMyTurn || isFinished}
              className={`
                relative aspect-square min-h-[44px] min-w-[44px] rounded-xl font-bold text-base sm:text-lg transition touch-manipulation
                ${used ? (usadoPorRival ? 'bg-zinc-800 text-red-500 cursor-not-allowed' : 'bg-zinc-800 text-green-500 cursor-not-allowed') : isMyTurn && !isFinished ? 'bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-amber-400 cursor-pointer ring-2 ring-amber-500/50 border border-amber-500/50' : 'bg-zinc-800 text-white'}
                ${isExploding ? 'bg-red-600 scale-110' : ''}
              `}
              whileHover={!used && isMyTurn && !isFinished ? { scale: 1.05 } : {}}
              whileTap={!used && isMyTurn && !isFinished ? { scale: 0.98 } : {}}
            >
              <AnimatePresence>
                {isExploding && (
                  <motion.span
                    className="absolute inset-0 flex items-center justify-center text-2xl"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1.5 }}
                    exit={{ opacity: 0 }}
                  >
                    💥
                  </motion.span>
                )}
              </AnimatePresence>
              {used ? '✕' : num}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
