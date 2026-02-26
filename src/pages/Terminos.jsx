import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { UsdcLabel } from '../utils/networkBrand'

export default function Terminos() {
  const navigate = useNavigate()
  return (
    <div className="min-h-dvh min-h-screen bg-[#050508] text-zinc-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="w-full mx-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-amber-400 hover:text-amber-300 mb-8 rounded-2xl px-4 py-2 hover:bg-zinc-900/80 border border-transparent hover:border-zinc-800 transition active:scale-[0.98]"
        >
          <ArrowLeft className="w-5 h-5" />
          Volver
        </button>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent mb-8">Términos y Condiciones</h1>

        <section className="mb-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-5">
          <h2 className="text-lg font-bold text-amber-400 mb-3">1. Responsabilidad del Usuario</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-3">
            <strong className="text-zinc-300">Direcciones de Envío:</strong> El usuario es el único responsable de proporcionar una dirección de wallet correcta. El envío de fondos a una dirección errónea o a una red no soportada resultará en la pérdida total e irreversible de los fondos.
          </p>
          <p className="text-zinc-400 text-sm leading-relaxed">
            <strong className="text-zinc-300">Redes Soportadas:</strong> Solo se aceptan depósitos y retiros a través de las redes Solana, Base y Polygon. Cualquier envío por otra red (como Ethereum Mainnet o BSC) no será reconocido por el sistema.
          </p>
        </section>

        <section className="mb-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-5">
          <h2 className="text-lg font-bold text-amber-400 mb-3">2. Comisiones y Pagos</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-3">
            <strong className="text-zinc-300">Tarifa de Retiro:</strong> Se aplicará una comisión fija de $0.50 <UsdcLabel /> por cada solicitud de retiro para cubrir costos operativos y de red (Gas Fees).
          </p>
          <p className="text-zinc-400 text-sm leading-relaxed mb-3">
            <strong className="text-zinc-300">Saldo de Juego:</strong> El dinero depositado se convierte en saldo virtual dentro de la app para participar en los duelos. Este saldo no genera intereses.
          </p>
          <p className="text-zinc-400 text-sm leading-relaxed">
            <strong className="text-zinc-300">Tiempo de Procesamiento:</strong> Aunque los depósitos son automáticos, los retiros pueden ser revisados manualmente por seguridad y procesados en un plazo de 0 a 24 horas.
          </p>
        </section>

        <section className="mb-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-5">
          <h2 className="text-lg font-bold text-amber-400 mb-3">3. Reglas del Juego</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-3">
            <strong className="text-zinc-300">Resultado Final:</strong> El sistema determina el &quot;Número Prohibido&quot; de forma aleatoria antes de iniciar la partida. Una vez que un jugador toca dicho número, el resultado es definitivo.
          </p>
          <p className="text-zinc-400 text-sm leading-relaxed">
            <strong className="text-zinc-300">Desconexiones:</strong> Si un jugador se desconecta voluntariamente durante una partida activa, el sistema podrá otorgar la victoria al oponente tras un tiempo de espera de 60 segundos.
          </p>
        </section>

        <section className="mb-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-5">
          <h2 className="text-lg font-bold text-amber-400 mb-3">4. Limitación de Responsabilidad</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-3">
            <strong className="text-zinc-300">Fallas Técnicas:</strong> &quot;LA BOMBA&quot; no se hace responsable por fallas en la red blockchain, congestión de la red, o errores en las wallets externas (Phantom, Bitget, etc.).
          </p>
          <p className="text-zinc-400 text-sm leading-relaxed">
            <strong className="text-zinc-300">Jurisdicción:</strong> El usuario declara que el uso de activos digitales y juegos de habilidad es legal en su jurisdicción de residencia.
          </p>
        </section>

        <section className="mb-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm p-5">
          <h2 className="text-lg font-bold text-amber-400 mb-3">5. Juego Responsable</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Plataforma exclusiva para mayores de 18 años. El usuario entiende que este es un juego de riesgo y solo debe participar con fondos que esté dispuesto a perder.
          </p>
        </section>
      </div>
    </div>
  )
}
