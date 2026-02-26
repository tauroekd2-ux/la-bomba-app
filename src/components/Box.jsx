/**
 * Caja estándar de LA BOMBA.
 * Usar para todas las secciones/cards nuevas.
 * Estilo: bg-amber-900/20, border-amber-600/50, títulos text-amber-300, texto text-zinc-400.
 */
export default function Box({ children, className = '', ...props }) {
  return (
    <div
      className={`rounded-2xl bg-amber-900/20 border border-amber-600/50 ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  )
}
