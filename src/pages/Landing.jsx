import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import { Zap, Share2, Trophy, Wallet } from 'lucide-react'
import { UsdcLabel, RedLabel } from '../utils/networkBrand'

const DISPLAY_FONT = 'Montserrat, system-ui, sans-serif'

export default function Landing() {
  const navigate = useNavigate()
  const stepsRef = useRef(null)
  const stepsInView = useInView(stepsRef, { once: true, margin: '-80px' })
  const mockupRef = useRef(null)
  const mockupInView = useInView(mockupRef, { once: true, margin: '-60px' })
  const footerRef = useRef(null)
  const footerInView = useInView(footerRef, { once: true })

  const [stats, setStats] = useState({
    jugadores: 142,
    repartido: 2450,
    partidas: 12,
  })

  useEffect(() => {
    const t = setInterval(() => {
      setStats((s) => ({
        jugadores: Math.max(80, s.jugadores + Math.floor((Math.random() - 0.5) * 20)),
        repartido: s.repartido + Math.floor(Math.random() * 80),
        partidas: Math.max(5, s.partidas + Math.floor((Math.random() - 0.4) * 4)),
      }))
    }, 4000)
    return () => clearInterval(t)
  }, [])

  const mockNumbers = Array.from({ length: 30 }, (_, i) => {
    const n = 20 + (i % 30)
    const used = i < 8 || (i >= 15 && i < 18)
    return { num: n, used }
  })

  return (
    <div className="min-h-dvh min-h-screen bg-[#050508] text-zinc-100 overflow-x-hidden" style={{ fontFamily: DISPLAY_FONT }}>
      {/* Hero */}
      <section
        className="relative min-h-[100dvh] flex flex-col items-center justify-center px-4 py-16 sm:py-24"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(251, 191, 36, 0.08) 0%, transparent 50%), radial-gradient(ellipse 100% 100% at 50% 100%, rgba(15, 15, 20, 0.98) 0%, #050508 70%)',
        }}
      >
        <motion.span
          className="text-7xl sm:text-8xl md:text-9xl mb-4 block select-none"
          animate={{ scale: [1, 1.15, 1], filter: ['brightness(1)', 'brightness(1.3)', 'brightness(1)'] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
        >
          💣
        </motion.span>
        <motion.h1
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-center text-white tracking-tight max-w-4xl mx-auto leading-[1.1]"
          style={{ fontFamily: DISPLAY_FONT, fontWeight: 800 }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent">
            LA BOMBA
          </span>
          <span className="block text-2xl sm:text-3xl md:text-4xl text-zinc-400 font-bold mt-2 sm:mt-3">
            El duelo 1vs1 definitivo
          </span>
        </motion.h1>
        <motion.p
          className="text-zinc-400 text-base sm:text-lg md:text-xl text-center max-w-xl mx-auto mt-4 sm:mt-6 font-medium"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          Apuesta, elige un número y no explotes. El ganador se lleva todo en <UsdcLabel /> al instante.
        </motion.p>
        <motion.div
          className="flex flex-col sm:flex-row gap-4 mt-8 sm:mt-10 w-full max-w-sm sm:max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
        >
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="relative overflow-hidden py-4 px-8 rounded-2xl bg-amber-500 hover:bg-amber-400 text-amber-300 font-bold text-lg sm:text-xl transition shadow-[0_0_30px_rgba(251,191,36,0.4)] hover:shadow-[0_0_40px_rgba(251,191,36,0.5)] active:scale-[0.98] min-h-[56px] touch-manipulation"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-shine" />
            ¡JUGAR AHORA!
          </button>
          <a
            href="#como-funciona"
            className="py-4 px-8 rounded-2xl border-2 border-amber-500/80 text-amber-400 font-bold text-lg text-center hover:bg-amber-500/10 hover:border-amber-400 transition shadow-[0_0_20px_rgba(251,191,36,0.15)] min-h-[56px] flex items-center justify-center touch-manipulation"
          >
            ¿Cómo funciona?
          </a>
        </motion.div>
      </section>

      {/* Stats banner */}
      <motion.section
        className="sticky top-0 z-40 py-3 px-4 backdrop-blur-xl bg-zinc-900/70 border-b border-zinc-800/80"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.4 }}
      >
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-6 sm:gap-10 text-sm sm:text-base">
          <span className="flex items-center gap-2 text-amber-400/90 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {stats.jugadores} Jugadores en línea
          </span>
          <span className="flex items-center gap-2 text-amber-400/90 font-semibold">
            <span className="text-emerald-400">$</span>
            {stats.repartido.toLocaleString()} Repartidos hoy
          </span>
          <span className="flex items-center gap-2 text-amber-400/90 font-semibold">
            {stats.partidas} Partidas activas
          </span>
        </div>
      </motion.section>

      {/* Tres pasos */}
      <section id="como-funciona" ref={stepsRef} className="px-4 py-16 sm:py-24 bg-[#0a0a0f]">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            className="text-3xl sm:text-4xl font-extrabold text-center text-white mb-4"
            style={{ fontFamily: DISPLAY_FONT }}
            initial={{ opacity: 0, y: 20 }}
            animate={stepsInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            Tres pasos para ganar
          </motion.h2>
          <motion.p
            className="text-zinc-400 text-center text-lg mb-12"
            initial={{ opacity: 0 }}
            animate={stepsInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            Simple, rápido y en <UsdcLabel />
          </motion.p>
          <div className="grid sm:grid-cols-3 gap-8 sm:gap-6">
            {[
              {
                icon: Wallet,
                title: 'Carga',
                text: <>Deposita <UsdcLabel /> por <RedLabel red="solana" />, <RedLabel red="base" /> o <RedLabel red="polygon" />. Sin comisiones ocultas.</>,
              },
              {
                icon: Share2,
                title: 'Desafía',
                text: 'Crea una sala privada y envía el link a un amigo. O busca partida al instante.',
              },
              {
                icon: Trophy,
                title: 'Explota',
                text: 'El que toque la bomba pierde. El ganador retira su dinero con un clic.',
              },
            ].map((step, i) => (
              <motion.div
                key={step.title}
                className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6 sm:p-8 backdrop-blur-sm"
                initial={{ opacity: 0, y: 30 }}
                animate={stepsInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.15 + i * 0.1, duration: 0.5 }}
              >
                <div className="w-14 h-14 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center mb-4">
                  <step.icon className="w-7 h-7 text-amber-400" />
                </div>
                <h3 className="text-xl font-bold text-amber-400 mb-2">{step.title}</h3>
                <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">{step.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Mockup juego */}
      <section ref={mockupRef} className="px-4 py-16 sm:py-24 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#08080c] to-[#050508]" />
        <motion.div
          className="relative max-w-md mx-auto"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={mockupInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <p className="text-center text-zinc-500 text-sm mb-6">Así se ve el tablero en la app</p>
          <div className="relative rounded-3xl border border-zinc-700/80 bg-zinc-900/90 p-6 shadow-2xl shadow-black/50 backdrop-blur-md">
            <div className="absolute -inset-4 bg-gradient-to-b from-amber-500/10 to-transparent rounded-[2rem] blur-2xl -z-10" />
            <div className="flex justify-center gap-2 mb-4">
              <span className="text-lg font-bold text-amber-400">💣 LA BOMBA</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {mockNumbers.map(({ num, used }, i) => (
                <div
                  key={i}
                  className={`aspect-square min-h-[44px] rounded-xl flex items-center justify-center text-sm font-bold transition ${
                    used ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-800/80 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {used ? '✕' : num}
                </div>
              ))}
            </div>
            <p className="text-center text-zinc-500 text-xs mt-4">Elige un número. Quien toque la bomba pierde.</p>
          </div>
        </motion.div>
      </section>

      {/* CTA final */}
      <motion.section
        className="px-4 py-16 text-center"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">¿Listo para jugar?</h2>
        <p className="text-zinc-400 mb-8 max-w-md mx-auto">Regístrate en segundos y empieza a ganar en <UsdcLabel />.</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 py-4 px-8 rounded-2xl bg-amber-500 hover:bg-amber-400 text-amber-300 font-bold text-lg shadow-[0_0_25px_rgba(251,191,36,0.35)] active:scale-[0.98] touch-manipulation"
        >
          <Zap className="w-5 h-5" />
          Entrar a LA BOMBA
        </button>
      </motion.section>

      {/* Footer */}
      <footer ref={footerRef} className="border-t border-zinc-800 bg-[#050508] px-4 py-10">
        <motion.div
          className="max-w-4xl mx-auto text-center space-y-6"
          initial={{ opacity: 0, y: 15 }}
          animate={footerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4 }}
        >
          <button
            type="button"
            onClick={() => navigate('/terminos')}
            className="text-amber-400/90 hover:text-amber-300 text-sm font-medium underline underline-offset-2 bg-transparent border-0 cursor-pointer"
          >
            Términos y Condiciones
          </button>
          <div className="flex flex-wrap justify-center gap-6 items-center text-zinc-500 text-sm">
            <a href="https://phantom.app" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400/80 transition">
              Phantom
            </a>
            <a href="https://base.org" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400/80 transition">
              Base
            </a>
            <a href="https://polygon.technology" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400/80 transition">
              Polygon
            </a>
            <a href="https://solana.com" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400/80 transition">
              Solana
            </a>
          </div>
          <p className="text-zinc-600 text-xs">
            Juego responsable. Solo para mayores de 18 años. Juega con cabeza.
          </p>
        </motion.div>
      </footer>

    </div>
  )
}
