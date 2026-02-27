import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ConfirmarEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('verificando') // verificando | ok | error
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type') || 'email'

    if (!tokenHash) {
      setStatus('error')
      setErrorMsg('Falta el enlace de confirmación.')
      return
    }

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type })
      .then(({ data, error }) => {
        if (error) {
          setStatus('error')
          setErrorMsg(error.message || 'Enlace inválido o expirado.')
          return
        }
        setStatus('ok')
        setTimeout(() => navigate('/', { replace: true }), 2000)
      })
      .catch((e) => {
        setStatus('error')
        setErrorMsg(e?.message || 'Error al confirmar.')
      })
  }, [searchParams, navigate])

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-[#050508]" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(251, 191, 36, 0.08) 0%, transparent 50%), #050508' }}>
      <h1 className="text-xl font-bold bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent mb-4">
        LA BOMBA
      </h1>
      {status === 'verificando' && (
        <>
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-zinc-400">Confirmando tu correo...</p>
        </>
      )}
      {status === 'ok' && (
        <>
          <p className="text-emerald-400 font-semibold mb-2">Cuenta confirmada</p>
          <p className="text-zinc-400 text-sm">Redirigiendo a la app...</p>
        </>
      )}
      {status === 'error' && (
        <>
          <p className="text-amber-400 font-semibold mb-2">No se pudo confirmar</p>
          <p className="text-zinc-500 text-sm text-center mb-6">{errorMsg}</p>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="px-6 py-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 font-medium"
          >
            Ir al inicio
          </button>
        </>
      )}
    </div>
  )
}
