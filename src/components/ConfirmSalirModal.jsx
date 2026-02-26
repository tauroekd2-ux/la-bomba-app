import { motion } from 'framer-motion'

export default function ConfirmSalirModal({ open, onConfirm, onCancel, message = 'Si sales ahora, perderás la partida. ¿Quieres salir?' }) {
  if (!open) return null
  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="rounded-2xl bg-zinc-900 border border-amber-500/40 shadow-[0_0_40px_rgba(251,191,36,0.12)] p-6 sm:p-8 max-w-sm w-full text-center"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
      >
        <p className="text-zinc-100 text-base sm:text-lg leading-relaxed mb-6">
          {message}
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 min-h-[48px] rounded-2xl border-2 border-zinc-600 text-zinc-300 font-semibold hover:bg-zinc-800 hover:border-zinc-500 active:scale-[0.98] transition touch-manipulation"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-6 py-3 min-h-[48px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_20px_rgba(251,191,36,0.3)] active:scale-[0.98] transition touch-manipulation"
          >
            Salir
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
