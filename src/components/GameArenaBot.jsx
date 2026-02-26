import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'

let tickAudioContext = null
function playTick(urgente = false) {
  try {
    if (!tickAudioContext) tickAudioContext = new (window.AudioContext || window.webkitAudioContext)()
    const ctx = tickAudioContext
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    const dur = 0.1
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

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickBotMove(available) {
  return available[getRandomInt(0, available.length - 1)]
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function generar30Numeros() {
  return shuffle(Array.from({ length: 100 }, (_, i) => i)).slice(0, 30)
}

export default function GameArenaBot({ onBack, onPlayAgain }) {
  const { numeros, numeroProhibido } = useMemo(() => {
    const nums = generar30Numeros()
    const bomb = nums[getRandomInt(0, 29)]
    return { numeros: nums, numeroProhibido: bomb }
  }, [])
  const [numerosUsados, setNumerosUsados] = useState([])
  const [isUserTurn, setIsUserTurn] = useState(true)
  const [explosionNum, setExplosionNum] = useState(null)
  const [gameOver, setGameOver] = useState(null) // 'user' | 'bot'
  const [botThinking, setBotThinking] = useState(false)
  const [segundero, setSegundero] = useState(25)
  const [bombaExplotando, setBombaExplotando] = useState(false)
  const numerosMiosRef = useRef([])
  const perdioPorTiempoRef = useRef(false)

  const available = numeros.filter((n) => !numerosUsados.includes(n))
  const isFinished = gameOver !== null

  // Segundero: se reinicia a 25 cuando cambia el turno (user <-> bot)
  useEffect(() => {
    if (isFinished) return
    perdioPorTiempoRef.current = false
    setBombaExplotando(false)
    setSegundero(25)
    const interval = setInterval(() => {
      setSegundero((s) => (s <= 0 ? 25 : s - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [isFinished, isUserTurn])

  // Tick sonido cada segundo (siempre, como en la arena real)
  useEffect(() => {
    if (isFinished) return
    if (segundero >= 1) {
      playTick(segundero <= 5)
    }
  }, [segundero, isFinished])

  // Perder por tiempo cuando segundero llega a 0 (turno del usuario)
  useEffect(() => {
    if (isFinished || !isUserTurn || segundero !== 0) return
    if (perdioPorTiempoRef.current) return
    perdioPorTiempoRef.current = true
    setBombaExplotando(true)
    playExplosionSound()
    setGameOver('user')
    setTimeout(() => setBombaExplotando(false), 2000)
  }, [segundero, isUserTurn, isFinished])

  const botPlay = useCallback(() => {
    if (available.length === 0 || isFinished) return
    setBotThinking(true)
    const delay = 400 + getRandomInt(0, 600)
    setTimeout(() => {
      const pick = pickBotMove(available)
      setNumerosUsados((prev) => {
        const next = [...prev, pick]
        if (pick === numeroProhibido) {
          setExplosionNum(pick)
          setTimeout(() => setExplosionNum(null), 1500)
          setGameOver('bot')
          playWinSound()
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
          return next
        }
        if (next.length === 29) {
          setExplosionNum(numeroProhibido)
          setBombaExplotando(true)
          setTimeout(() => { setExplosionNum(null); setBombaExplotando(false) }, 1500)
          setGameOver('user')
          playExplosionSound()
          return next
        }
        setIsUserTurn(true)
        return next
      })
      setBotThinking(false)
    }, delay)
  }, [available, isFinished, numeroProhibido])

  useEffect(() => {
    if (!isUserTurn && !isFinished && !botThinking && available.length > 0) {
      botPlay()
    }
  }, [isUserTurn, isFinished, botThinking, available.length, botPlay])

  function handlePick(num) {
    if (!isUserTurn || isFinished || numerosUsados.includes(num) || botThinking) return
    numerosMiosRef.current = [...numerosMiosRef.current, num]
    setNumerosUsados((prev) => {
      const next = [...prev, num]
      if (num === numeroProhibido) {
        setExplosionNum(num)
        setTimeout(() => setExplosionNum(null), 1500)
        setGameOver('user')
        playExplosionSound()
        return next
      }
      if (next.length === 29) {
        setExplosionNum(numeroProhibido)
        setBombaExplotando(true)
        setTimeout(() => { setExplosionNum(null); setBombaExplotando(false) }, 1500)
        setGameOver('bot')
        playWinSound()
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
        return next
      }
      setIsUserTurn(false)
      return next
    })
  }

  const iWon = gameOver === 'bot'

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
          <span className="text-green-500">Tú</span>
          <span className="text-zinc-500">vs</span>
          <span className="text-red-500">Bot</span>
        </p>
      </div>
      <div className="flex justify-between items-center">
        <div
          className={`px-4 py-2 rounded-xl font-semibold ${isFinished ? (iWon ? 'bg-zinc-800 text-green-500' : 'bg-zinc-800 text-red-500') : isUserTurn && !botThinking ? 'bg-zinc-800 text-green-500 ring-2 ring-green-500/50 border border-green-500/50' : 'bg-zinc-800 text-red-500'}`}
        >
          {isFinished ? (iWon ? '¡Ganaste!' : 'Perdiste') : botThinking ? 'Bot pensando...' : isUserTurn ? 'Tu turno' : 'Turno del bot'}
        </div>
        <p className="text-zinc-500 text-sm">Gratis</p>
      </div>

      <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 sm:gap-3">
        {numeros.map((num) => {
          const used = numerosUsados.includes(num)
          const usadoPorRival = used && !numerosMiosRef.current.includes(num)
          const isExploding = explosionNum === num
          return (
            <motion.button
              key={num}
              onClick={() => handlePick(num)}
              disabled={used || !isUserTurn || isFinished || botThinking}
              className={`
                relative aspect-square min-h-[44px] min-w-[44px] rounded-xl font-bold text-base sm:text-lg transition touch-manipulation
                ${used ? (usadoPorRival ? 'bg-zinc-800 text-red-500 cursor-not-allowed' : 'bg-zinc-800 text-green-500 cursor-not-allowed') : isUserTurn && !isFinished && !botThinking ? 'bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-amber-400 cursor-pointer ring-2 ring-amber-500/50 border border-amber-500/50' : 'bg-zinc-800 text-white'}
                ${isExploding ? 'bg-red-600 scale-110' : ''}
              `}
              whileHover={!used && isUserTurn && !isFinished && !botThinking ? { scale: 1.05 } : {}}
              whileTap={!used && isUserTurn && !isFinished && !botThinking ? { scale: 0.98 } : {}}
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

      {isFinished && (
        <motion.div
          className="fixed inset-0 z-10 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-8 text-center max-w-sm w-full shadow-xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <p className="text-2xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent">
              {iWon ? '¡Ganaste!' : 'Perdiste'}
            </p>
            <p className="text-zinc-400 mt-2">Gratis · Sin apuesta</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => (onPlayAgain ? onPlayAgain() : window.location.reload())}
                className="px-6 py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_25px_rgba(251,191,36,0.35)] active:scale-[0.98] transition touch-manipulation"
              >
                Revancha
              </button>
              <button
                onClick={onBack}
                className="px-6 py-3 min-h-[44px] rounded-2xl border-2 border-amber-500/80 text-amber-400 font-bold hover:bg-amber-500/20 active:scale-[0.98] transition touch-manipulation"
              >
                Volver al inicio
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
