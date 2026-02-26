import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Join() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) {
      navigate('/dashboard')
      return
    }
    const code = (roomCode || '').trim().toUpperCase().slice(0, 5)
    if (code.length !== 5) {
      setError('Código inválido (5 caracteres)')
      setLoading(false)
      return
    }
    setError('')
    setLoading(true)
    let cancelled = false
    async function doJoin() {
      try {
        const { data, error: err } = await supabase.rpc('unirse_partida', { p_room_code: code })
        if (cancelled) return
        if (err) throw err
        if (!data?.ok) throw new Error(data?.error || 'Error al unirse')
        navigate(`/game/${data.partida_id}`)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Error al unirse')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    doJoin()
    return () => { cancelled = true }
  }, [user?.id, roomCode, navigate])

  if (!user) return null

  return (
    <div className="min-h-dvh min-h-screen flex flex-col items-center justify-center bg-[#050508] p-4 w-full pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <motion.div
        className="rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-5 max-w-md w-full text-center shadow-[0_0_30px_rgba(0,0,0,0.3)]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent mb-4">Unirse a la sala</h1>
        <p className="text-zinc-400 mb-4">Código: <span className="font-mono font-bold text-amber-400">{roomCode?.toUpperCase()}</span></p>
        {loading ? (
          <motion.div
            className="w-10 h-10 border-2 border-amber-500/80 border-t-transparent rounded-full mx-auto"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          />
        ) : error ? (
          <>
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_25px_rgba(251,191,36,0.35)] active:scale-[0.98] touch-manipulation transition"
            >
              Volver
            </button>
          </>
        ) : !error ? (
          <p className="text-zinc-400">Redirigiendo a la partida...</p>
        ) : null}
      </motion.div>
    </div>
  )
}
