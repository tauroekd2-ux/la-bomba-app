import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const POLL_INTERVAL_MS = 10000 // 10 segundos (notificación in-app de "retiro procesado")

/**
 * Polling: cada cierto tiempo se consultan los retiros del usuario.
 * Si algún retiro pasa a 'procesado' desde la última consulta, se llama a onRetiroProcesado.
 * No usa Supabase Realtime.
 */
export function useRetiroProcesadoNotifications(userId, onRetiroProcesado) {
  const previousEstadosRef = useRef(null) // Map id -> estado o null si es la primera vez

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return

    let cancelled = false

    async function check() {
      if (cancelled) return
      const { data: rows } = await supabase
        .from('retiros_phantom')
        .select('id, monto, red, estado')
        .eq('user_id', userId)
      if (cancelled) return

      const prev = previousEstadosRef.current
      const currentMap = new Map((rows || []).map((r) => [r.id, r.estado]))

      if (prev !== null) {
        for (const row of rows || []) {
          if (row.estado !== 'procesado') continue
          if (prev.get(row.id) === 'procesado') continue
          const monto = Number(row?.monto) ?? 0
          const red = row?.red ?? null
          onRetiroProcesado?.(monto, red)
        }
      }

      previousEstadosRef.current = currentMap
    }

    check()
    const interval = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [userId, onRetiroProcesado])
}
