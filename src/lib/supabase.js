import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

/** Columnas de partidas que el cliente puede leer (sin numero_prohibido para no revelar la bomba) */
export const PARTIDAS_SELECT_COLUMNS = 'id,room_code,host_id,guest_id,apuesta,estado,turno_actual,ganador_id,numeros_usados,numeros_juego,created_at,updated_at,matchmaking'
const key = supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.e30'

// En desarrollo: usar proxy (vía Vite) para evitar Failed to fetch y funcionar en móvil
const proxyBase = import.meta.env.VITE_SUPABASE_PROXY || (typeof window !== 'undefined' ? window.location.origin + '/supabase' : 'http://localhost:3031/supabase')
const useProxy = import.meta.env.DEV && supabaseUrl.startsWith('https://')

const customFetch = useProxy
  ? (input, init = {}) => {
      const reqUrl = typeof input === 'string' ? input : (input?.url || '')
      if (reqUrl && reqUrl.startsWith(supabaseUrl)) {
        const path = reqUrl.slice(supabaseUrl.length) || '/'
        const newUrl = proxyBase + (path.startsWith('/') ? path : '/' + path)
        const isRequest = input && typeof input === 'object' && 'method' in input
        return isRequest ? fetch(new Request(newUrl, input)) : fetch(newUrl, init)
      }
      return fetch(input, init)
    }
  : undefined

let supabase
try {
  const finalUrl = supabaseUrl.startsWith('https://') ? supabaseUrl : 'https://example.supabase.co'
  supabase = createClient(finalUrl, key, customFetch ? { global: { fetch: customFetch } } : {})
} catch (e) {
  console.error('Supabase init:', e)
  supabase = createClient('https://example.supabase.co', key)
}

export { supabase }
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('https://'))
