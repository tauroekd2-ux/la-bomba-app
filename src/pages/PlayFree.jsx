import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import GameArenaBot from '../components/GameArenaBot'
import ConfirmSalirModal from '../components/ConfirmSalirModal'
import { usePreventBackDuringGame, mensajeSalirPartida } from '../hooks/usePreventBackDuringGame'

export default function PlayFree() {
  const navigate = useNavigate()
  const [gameKey, setGameKey] = useState(0)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const leaveResolveRef = useRef(null)
  const getConfirmLeave = useCallback(() => {
    return new Promise((resolve) => {
      leaveResolveRef.current = resolve
      setShowLeaveModal(true)
    })
  }, [])
  usePreventBackDuringGame(true, null, getConfirmLeave)

  async function handleSalir() {
    const ok = await getConfirmLeave()
    if (ok) navigate('/dashboard')
  }

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

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
      <header className="flex justify-start items-center w-full mb-2 px-2">
        <button
          onClick={handleSalir}
          className="flex items-center gap-2 text-zinc-400 hover:text-amber-400 transition min-h-[44px] min-w-[44px] touch-manipulation justify-center rounded-2xl hover:bg-zinc-900/80 active:scale-[0.98]"
          type="button"
          aria-label="Salir"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </header>

      <main className="w-full px-2 flex-1">
        <GameArenaBot key={gameKey} onBack={() => navigate('/dashboard')} onPlayAgain={() => setGameKey((k) => k + 1)} />
      </main>
    </div>
  )
}
