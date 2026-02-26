import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Suscripción a transacciones. Cuando el usuario recibe fondos (transferencia_recibo),
 * llama a onTransfer con nombre del remitente, monto y remitente_id.
 * Requiere Realtime activado en tabla transacciones (Supabase → Database → Replication).
 */
export function useTransferNotifications(userId, onTransfer, refreshBalance) {
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return

    const channel = supabase
      .channel('transfer-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transacciones' },
        async (payload) => {
          const t = payload.new
          if (t.tipo !== 'transferencia_recibo') return
          if (t.user_id !== userId) return

          const remitenteId = t.detalles?.remitente_id
          let remitenteName = 'Alguien'
          if (remitenteId) {
            try {
              const { data } = await supabase.rpc('obtener_nombre_por_id', { p_id: remitenteId })
              if (data?.ok && data?.full_name) remitenteName = data.full_name
            } catch (_) {}
          }
          const monto = Number(t.monto) || 0
          onTransfer?.(remitenteName, monto, remitenteId)
          refreshBalance?.()
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [userId, onTransfer, refreshBalance])
}
