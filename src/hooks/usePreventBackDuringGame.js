import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const MENSAJE_SALIR = 'Si sales ahora, perderás la partida. ¿Quieres salir?'

/**
 * Al usar el botón/gesto "atrás" durante la partida, muestra un aviso:
 * si confirma, ejecuta onConfirmLeave y sale; si cancela, se queda.
 * onConfirmLeave: opcional, async () => {} para descontar pérdida / notificar rival.
 * getConfirmLeave: opcional, () => Promise<boolean> para usar modal bonito en lugar de window.confirm.
 */
export function usePreventBackDuringGame(enabled = true, onConfirmLeave = null, getConfirmLeave = null) {
  const location = useLocation()
  const navigate = useNavigate()
  const pathRef = useRef(null)
  const onConfirmLeaveRef = useRef(onConfirmLeave)
  const getConfirmLeaveRef = useRef(getConfirmLeave)
  onConfirmLeaveRef.current = onConfirmLeave
  getConfirmLeaveRef.current = getConfirmLeave

  useEffect(() => {
    if (!enabled) return
    const path = location.pathname + location.search
    pathRef.current = path
    const urlConMarcador = path + (path.includes('?') ? '&' : '?') + '_g=1'
    window.history.pushState({ preventBack: true }, '', urlConMarcador)
    window.history.replaceState({ preventBack: true }, '', path)

    const onPopState = async () => {
      const targetPath = pathRef.current
      if (!targetPath) return
      const getConfirm = getConfirmLeaveRef.current
      const quiereSalir = typeof getConfirm === 'function'
        ? await getConfirm()
        : window.confirm(MENSAJE_SALIR)
      if (quiereSalir) {
        try {
          const fn = onConfirmLeaveRef.current
          if (typeof fn === 'function') await fn()
        } catch (_) {}
        navigate('/dashboard', { replace: true })
        return
      }
      navigate(targetPath)
      window.history.pushState({ preventBack: true }, '', urlConMarcador)
      window.history.replaceState({ preventBack: true }, '', targetPath)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [enabled, location.pathname, location.search, navigate])
}

export const mensajeSalirPartida = MENSAJE_SALIR
