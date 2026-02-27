import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 5000)
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null)
        if (session?.user) fetchProfile(session.user.id)
      })
      .catch((e) => {
        console.warn('Supabase getSession:', e?.message)
      })
      .finally(() => {
        clearTimeout(t)
        setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setProfile(null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
  }

  const refreshBalance = useCallback(async () => {
    if (!user) return
    await fetchProfile(user.id)
  }, [user?.id])

  // Realtime: notificaciones de depósito Phantom → actualizar saldo (el sonido lo hace la notificación in-app)
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`deposit:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deposit_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchProfile(user.id)
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user?.id])

  const value = {
    user,
    profile,
    loading,
    refreshBalance,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, fullName) =>
      supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/`,
        },
      }),
    signOut: async () => {
      try {
        await Promise.race([
          supabase.rpc('limpiar_partidas_al_cerrar_sesion'),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ])
      } catch (_) {}
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
