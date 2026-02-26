import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Suscripción a deposit_notifications. Cuando al usuario le acreditan un depósito,
 * llama a onDeposit(monto, red) para mostrar notificación in-app.
 */
export function useDepositNotifications(userId, onDeposit, refreshBalance) {
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return

    const channel = supabase
      .channel('deposit-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deposit_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new
          const monto = Number(row?.monto) ?? 0
          const red = row?.red ?? null
          onDeposit?.(monto, red)
          refreshBalance?.()
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [userId, onDeposit, refreshBalance])
}
