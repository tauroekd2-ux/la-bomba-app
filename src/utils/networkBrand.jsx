import React from 'react'

/** Colores de marca: Solana #9945FF/#14F195, Base #0052FF, Polygon #8247E5, USDC (Circle) #2775CA */
export const RED_COLORS = { solana: '#9945FF', base: '#0052FF', polygon: '#8247E5' }
export const RED_LABELS = { solana: 'Solana', base: 'Base', polygon: 'Polygon' }
export const USDC_COLOR = '#2775CA'

/** Logo pequeño de la red (SVG inline). */
export function RedLogo({ red, className = 'w-5 h-5 shrink-0' }) {
  const color = RED_COLORS[red]
  if (!color) return null
  if (red === 'solana') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <defs><linearGradient id="solana-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#9945FF" /><stop offset="100%" stopColor="#14F195" /></linearGradient></defs>
        <circle cx="12" cy="12" r="10" fill="url(#solana-grad)" />
      </svg>
    )
  }
  if (red === 'base') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="3" />
      </svg>
    )
  }
  if (red === 'polygon') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden>
        <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" />
      </svg>
    )
  }
  return null
}

/** Nombre de la red con color de marca y opcional logo. */
export function RedLabel({ red, showLogo = true, className = '', asStrong }) {
  const label = RED_LABELS[red] || red
  const color = RED_COLORS[red] || '#fff'
  const Wrapper = asStrong ? 'strong' : 'span'
  return (
    <Wrapper className={`inline-flex items-center gap-1.5 ${className}`} style={{ color }}>
      {showLogo && <RedLogo red={red} className="w-4 h-4 shrink-0" />}
      {label}
    </Wrapper>
  )
}

/** Logo pequeño USDC (Circle – círculo azul con símbolo $). */
export function UsdcLogo({ className = 'w-5 h-5 shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill={USDC_COLOR} />
      <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">$</text>
    </svg>
  )
}

/** Texto "USDC" con color de marca y opcional logo. */
export function UsdcLabel({ showLogo = true, className = '', asStrong }) {
  const Wrapper = asStrong ? 'strong' : 'span'
  return (
    <Wrapper className={`inline-flex items-center gap-1.5 ${className}`} style={{ color: USDC_COLOR }}>
      {showLogo && <UsdcLogo className="w-4 h-4 shrink-0" />}
      USDC
    </Wrapper>
  )
}
