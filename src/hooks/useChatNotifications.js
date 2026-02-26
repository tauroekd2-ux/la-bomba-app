import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Suscripción global a chat_mensajes. Cuando el usuario recibe un mensaje,
 * llama a onNotify con el nombre del remitente y vista previa (para toast in-app).
 */
export function useChatNotifications(userId, onNotify) {
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return

    const channel = supabase
      .channel('chat-notifications-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_mensajes' },
        async (payload) => {
          const m = payload.new
          if (m.sender_id === userId) return
          if (m.receiver_id !== userId) return

          let senderName = 'Usuario'
          try {
            const { data } = await supabase.rpc('obtener_nombre_por_id', { p_id: m.sender_id })
            if (data?.ok && data?.full_name) senderName = data.full_name
          } catch (_) {}

          const preview = (m.contenido || '').substring(0, 60)
          onNotify?.(senderName, preview, m.sender_id)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [userId, onNotify])
}
