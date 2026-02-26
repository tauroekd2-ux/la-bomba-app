import { Copy, Share2 } from 'lucide-react'
import { motion } from 'framer-motion'

const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin

export default function InviteWidget({ roomCode, onCopy, onShare }) {
  const url = `${APP_URL}/join/${roomCode}`
  const whatsappText = encodeURIComponent(`¡Únete a mi partida en LA BOMBA! Código: ${roomCode}\n${url}`)
  const whatsappUrl = `https://wa.me/?text=${whatsappText}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      onCopy?.()
    } catch {
      try {
        await navigator.clipboard.writeText(roomCode)
        onCopy?.()
      } catch {
        onCopy?.()
      }
    }
  }

  return (
    <motion.div
      className="rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-4 sm:p-5"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <p className="text-sm font-semibold text-amber-400 mb-2">Invita a tu rival</p>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          readOnly
          value={url}
          className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 truncate"
        />
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold shadow-[0_0_20px_rgba(251,191,36,0.3)] active:scale-[0.98] transition"
        >
          <Copy className="w-4 h-4" />
          Copiar enlace
        </button>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-amber-500/80 text-amber-400 text-sm font-bold hover:bg-amber-500/20 active:scale-[0.98] transition"
        >
          <Share2 className="w-4 h-4" />
          WhatsApp
        </a>
      </div>
      <p className="text-xs text-zinc-500 mt-2">Código: <span className="font-mono font-bold text-amber-400">{roomCode}</span></p>
    </motion.div>
  )
}
