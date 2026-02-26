import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, Check, HelpCircle, Copy, Wallet, AlertTriangle } from 'lucide-react'
import confetti from 'canvas-confetti'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

import { RED_COLORS, RED_LABELS, RedLogo, RedLabel, UsdcLabel } from '../utils/networkBrand'

const DISPLAY_FONT = 'Montserrat, system-ui, sans-serif'
const WITHDRAWAL_FEE = 0.5
const MIN_WITHDRAWAL_USDC = 10
const MAX_WITHDRAWAL_USDC = 50

/** Normaliza la dirección: quita espacios y saltos de línea (al pegar a veces vienen). */
function normalizeAddress(addr) {
  if (!addr || typeof addr !== 'string') return ''
  return addr.trim().replace(/\s/g, '')
}

/** Solana: 32-44 caracteres, base58 (sin 0, O, I, l). No puede empezar por 0x. */
function isValidSolanaAddress(addr) {
  const t = normalizeAddress(addr)
  if (t.length < 32 || t.length > 44) return false
  if (/^0x/i.test(t)) return false
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(t)
}

/** EVM (Base/Polygon): 0x o 0X + exactamente 40 caracteres hexadecimales. */
function isValidEvmAddress(addr) {
  const t = normalizeAddress(addr)
  return /^0x[a-fA-F0-9]{40}$/i.test(t)
}

/** Detecta tipo de dirección para mensajes de red equivocada. */
function getAddressType(addr) {
  const t = normalizeAddress(addr)
  if (!t) return null
  if (/^0x[a-fA-F0-9]{40}$/i.test(t)) return 'evm'
  if (t.length >= 32 && t.length <= 44 && !/^0x/i.test(t) && /^[1-9A-HJ-NP-Za-km-z]+$/.test(t)) return 'solana'
  return null
}

function validateRetiroAddress(address, red) {
  const raw = (address || '').trim()
  if (!raw) return { valid: false, error: null }

  const addr = normalizeAddress(raw)
  const type = getAddressType(addr)

  const redLabel = RED_LABELS[red] || red
  const noMix = ' No mezcles direcciones de distintas redes.'

  if (red === 'solana') {
    if (type === 'evm') {
      return {
        valid: false,
        error: `⚠️ Red equivocada: tienes ${redLabel} seleccionada pero esta dirección es de Base/Polygon (0x...). Usa solo una dirección Solana.${noMix}`,
      }
    }
    if (!isValidSolanaAddress(addr)) {
      return { valid: false, error: `❌ Dirección no válida para Solana. Debe ser una dirección Solana (32-44 caracteres, sin 0x).${noMix}` }
    }
    return { valid: true, error: null }
  }

  if (red === 'base') {
    if (type === 'solana') {
      return {
        valid: false,
        error: `⚠️ Red equivocada: tienes ${redLabel} seleccionada pero esta dirección es de Solana. Usa solo una dirección Base (0x...).${noMix}`,
      }
    }
    if (!isValidEvmAddress(addr)) {
      return { valid: false, error: `❌ Dirección no válida para Base. Debe ser una dirección EVM (0x + 40 caracteres hex).${noMix}` }
    }
    return { valid: true, error: null }
  }

  if (red === 'polygon') {
    if (type === 'solana') {
      return {
        valid: false,
        error: `⚠️ Red equivocada: tienes ${redLabel} seleccionada pero esta dirección es de Solana. Usa solo una dirección Polygon (0x...).${noMix}`,
      }
    }
    if (!isValidEvmAddress(addr)) {
      return { valid: false, error: `❌ Dirección no válida para Polygon. Debe ser una dirección EVM (0x + 40 caracteres hex).${noMix}` }
    }
    return { valid: true, error: null }
  }

  return { valid: false, error: null }
}

/** Valida que el hash de transacción tenga formato real según la red. */
function validateTxHash(red, tx) {
  const t = (tx || '').trim()
  if (!t) return { valid: false, error: 'Transacción Hash es obligatorio.' }
  if (red === 'solana') {
    // Solana: base58, 87-88 caracteres (firma de tx)
    if (t.length < 80 || t.length > 92) return { valid: false, error: 'Hash Solana inválido: debe tener 87-88 caracteres (base58).' }
    if (/^0x/i.test(t)) return { valid: false, error: 'Hash Solana no lleva 0x. Cópialo del explorador (Solscan).' }
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(t)) return { valid: false, error: 'Hash Solana solo usa caracteres base58 (sin 0, O, I, l).' }
    return { valid: true, error: null }
  }
  if (red === 'base' || red === 'polygon') {
    // EVM: 0x + 64 caracteres hexadecimales
    if (!/^0x[a-fA-F0-9]{64}$/.test(t)) return { valid: false, error: 'Hash inválido: debe ser 0x seguido de 64 caracteres hexadecimales (cópialo de Basescan/Polygonscan).' }
    return { valid: true, error: null }
  }
  return { valid: false, error: 'Red no reconocida.' }
}

const ADMIN_UID = (import.meta.env.VITE_PHANTOM_ADMIN_UID || '').trim()
const TG_BOT_TOKEN = (import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '').trim()
const TG_CHAT_ID = (import.meta.env.VITE_TELEGRAM_ADMIN_CHAT_ID || '').trim()

const APP_URL = (import.meta.env.VITE_APP_URL || '').replace(/\/$/, '')
const TELEGRAM_APP_URL = (import.meta.env.VITE_TELEGRAM_APP_URL || APP_URL || '').replace(/\/$/, '')
const ADMIN_PHANTOM_URL = TELEGRAM_APP_URL ? `${TELEGRAM_APP_URL}/admin-phantom` : (APP_URL ? `${APP_URL}/admin-phantom` : '')

function escapeHtml(s) {
  if (s == null || s === '') return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Mensaje 1: contenido con hash en <code> (fácil copiar). Mensaje 2: solo URL (sale en azul). */
function notifyAdminTelegram(payload) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return
  const chatId = String(TG_CHAT_ID)
  const { type, monto, red, userName, userEmail, wallet_destino, tx_hash } = payload
  const userLines = [userName && `Usuario: ${escapeHtml(userName)}`, userEmail && `Email: ${escapeHtml(userEmail)}`].filter(Boolean).join('\n') || 'Usuario'
  const redLabel = red ? ` (${red})` : ''
  const txTrim = tx_hash ? String(tx_hash).trim() : ''
  const txLine = txTrim ? `\nTx Hash: <code>${escapeHtml(txTrim)}</code>` : ''
  const destLine = wallet_destino ? `\nDestino: <code>${escapeHtml(String(wallet_destino).trim())}</code>` : ''
  const text = (type === 'retiro'
    ? `🔔 Nuevo retiro pendiente\n\n$${Number(monto).toFixed(2)}${redLabel}\n${userLines}${destLine}`
    : `🔔 Nuevo depósito pendiente\n\n$${Number(monto).toFixed(2)}${redLabel}\n${userLines}${txLine}`)
  fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => {})
  if (ADMIN_PHANTOM_URL) {
    fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: ADMIN_PHANTOM_URL }),
    }).catch(() => {})
  }
}
const MASTER_WALLET_SOLANA = (import.meta.env.VITE_MASTER_WALLET_SOLANA || '').trim()
const MASTER_WALLET_BASE = (import.meta.env.VITE_MASTER_WALLET_BASE || '').trim()
const MASTER_WALLET_POLYGON = (import.meta.env.VITE_MASTER_WALLET_POLYGON || '').trim()

export default function Cajero({ onClose, onSuccess }) {
  const { user, profile, refreshBalance } = useAuth()

  const isAdmin = user?.id && ADMIN_UID === user.id
  const [tab, setTab] = useState(isAdmin ? 'deposito' : 'depositar-usdc')
  const [amount, setAmount] = useState('')
  const [copyFeedback, setCopyFeedback] = useState(null)
  const [linkNetworkToShow, setLinkNetworkToShow] = useState(null)
  const [depositConfirmSolana, setDepositConfirmSolana] = useState('')
  const [depositConfirmBase, setDepositConfirmBase] = useState('')
  const [depositConfirmPolygon, setDepositConfirmPolygon] = useState('')
  const [depositConfirmTxSolana, setDepositConfirmTxSolana] = useState('')
  const [depositConfirmTxBase, setDepositConfirmTxBase] = useState('')
  const [depositConfirmTxPolygon, setDepositConfirmTxPolygon] = useState('')
  const [confirmDepositLoading, setConfirmDepositLoading] = useState(false)
  const [paypalEmail, setPaypalEmail] = useState(profile?.paypal_email || '')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [linkingWallet, setLinkingWallet] = useState(false)
  const [phantomRetiroRed, setPhantomRetiroRed] = useState('solana')
  const [pasteSolana, setPasteSolana] = useState('')
  const [pasteBase, setPasteBase] = useState('')
  const [pastePolygon, setPastePolygon] = useState('')
  const [retiroDestinoAddress, setRetiroDestinoAddress] = useState('')
  const [confirmRetiroOpen, setConfirmRetiroOpen] = useState(false)
  const [confirmLegalAccepted, setConfirmLegalAccepted] = useState(false)
  const [confirmEvmRedCorrecta, setConfirmEvmRedCorrecta] = useState(false)
  const [helpPanelOpen, setHelpPanelOpen] = useState(false)
  const [retiroSuccess, setRetiroSuccess] = useState(false)
  const [historialRetiros, setHistorialRetiros] = useState([])
  const addressInputRef = useRef(null)

  const balance = Number(profile?.balance ?? 0)
  const withdrawAmount = Number(amount) || 0
  const netWithdraw = Math.max(0, withdrawAmount - WITHDRAWAL_FEE)
  const hasSolana = !!(profile?.wallet_address || '').trim()
  const hasBase = !!(profile?.wallet_address_base || profile?.wallet_address_evm || '').trim()
  const hasPolygon = !!(profile?.wallet_address_polygon || profile?.wallet_address_evm || '').trim()
  useEffect(() => {
    if (profile?.paypal_email !== undefined) setPaypalEmail(profile.paypal_email || '')
  }, [profile?.paypal_email])

  // Sincronizar red seleccionada con las wallets vinculadas: Solana, Base y Polygon por separado.
  // Si la red actual no está disponible (ej. tienes solo Polygon y estaba "Solana"), se elige la primera disponible.
  useEffect(() => {
    const disponible = []
    if (hasSolana) disponible.push('solana')
    if (hasBase) disponible.push('base')
    if (hasPolygon) disponible.push('polygon')
    if (disponible.length === 0) return
    if (!disponible.includes(phantomRetiroRed)) {
      setPhantomRetiroRed(disponible[0])
    }
  }, [hasSolana, hasBase, hasPolygon, phantomRetiroRed])

  useEffect(() => {
    if (tab !== 'retiro' && tab !== 'retiro-usdc') return
    const def = phantomRetiroRed === 'solana' ? (profile?.wallet_address || '') : phantomRetiroRed === 'base' ? (profile?.wallet_address_base || profile?.wallet_address_evm || '') : (profile?.wallet_address_polygon || profile?.wallet_address_evm || '')
    setRetiroDestinoAddress(def)
  }, [tab, phantomRetiroRed, profile?.wallet_address, profile?.wallet_address_base, profile?.wallet_address_polygon, profile?.wallet_address_evm])

  // Al cambiar la red de retiro, exige volver a confirmar (Base/Polygon)
  useEffect(() => {
    setConfirmEvmRedCorrecta(false)
  }, [phantomRetiroRed])

  const retiroValidation = validateRetiroAddress(retiroDestinoAddress, phantomRetiroRed)
  const retiroAddressValid = retiroValidation.valid
  const hasPendingRetiro = historialRetiros.some((r) => r.estado === 'pendiente')
  const retiroOverLimit = withdrawAmount > MAX_WITHDRAWAL_USDC
  const requiereConfirmacionRed = retiroAddressValid && retiroDestinoAddress.trim()
  const evmConfirmado = !requiereConfirmacionRed || confirmEvmRedCorrecta

  async function handleConfirmarDeposito(red, montoStr, txHash) {
    const monto = Number(montoStr)
    if (!monto || monto <= 0) {
      setMsg('Indica la cantidad enviada (mayor que 0).')
      return
    }
    const txValidation = validateTxHash(red, txHash)
    if (!txValidation.valid) {
      setMsg(txValidation.error)
      return
    }
    const tx = (txHash || '').trim()
    setConfirmDepositLoading(true)
    setMsg('')
    try {
      const { data, error } = await supabase.rpc('confirmar_deposito_usuario', { p_red: red, p_monto: monto, p_tx_hash: tx })
      if (error) throw error
      if (data?.ok) {
        setMsg('Confirmación enviada. Revisaremos el depósito y acreditaremos tu saldo.')
        if (red === 'solana') { setDepositConfirmSolana(''); setDepositConfirmTxSolana('') }
        if (red === 'base') { setDepositConfirmBase(''); setDepositConfirmTxBase('') }
        if (red === 'polygon') { setDepositConfirmPolygon(''); setDepositConfirmTxPolygon('') }
        notifyAdminTelegram({ type: 'deposito', monto, red, userName: profile?.full_name, userEmail: profile?.email, tx_hash: tx })
        if (data.confirmacion_id) {
          const proxyBase = import.meta.env.DEV && typeof window !== 'undefined' ? '' : (import.meta.env.VITE_PROXY_URL || 'http://localhost:3031').replace(/\/$/, '')
          fetch(`${proxyBase}/api/admin/verify-and-notify-deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmacion_id: data.confirmacion_id }),
          }).catch(() => {})
        }
      } else throw new Error(data?.error || 'Error')
    } catch (e) {
      setMsg(e.message || 'Error al confirmar depósito')
    } finally {
      setConfirmDepositLoading(false)
    }
  }

  function copyDepositAddress(red, address) {
    if (!address) return
    setMsg('')
    const onSuccess = () => {
      setCopyFeedback(red)
      setTimeout(() => setCopyFeedback(null), 2000)
    }
    const fallbackCopy = () => {
      const el = document.createElement('textarea')
      el.value = address
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      el.style.top = '0'
      document.body.appendChild(el)
      el.select()
      try {
        const ok = document.execCommand('copy')
        if (ok) onSuccess()
        else setMsg('No se pudo copiar; mantén pulsado sobre la dirección para seleccionarla.')
      } finally {
        document.body.removeChild(el)
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(address).then(onSuccess).catch(fallbackCopy)
    } else {
      fallbackCopy()
    }
  }

  useEffect(() => {
    if (!user?.id || (tab !== 'retiro' && tab !== 'retiro-usdc')) return
    supabase
      .from('retiros_phantom')
      .select('id, monto, red, estado, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setHistorialRetiros(data || []))
  }, [user?.id, tab])

  async function handleDeposit() {
    setMsg('')
    if (!amount || Number(amount) < 1) {
      setMsg('Mínimo $1 USD')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(import.meta.env.VITE_API_URL || '/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount) * 100, userId: profile?.id }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else throw new Error(data.error || 'Error')
    } catch (e) {
      setMsg(e.message || 'Stripe no configurado. Añade backend para depósitos.')
    } finally {
      setLoading(false)
    }
  }

  async function handleWithdraw() {
    setMsg('')
    if (!amount || withdrawAmount < MIN_WITHDRAWAL_USDC) {
      setMsg(`Mínimo $${MIN_WITHDRAWAL_USDC} USD`)
      return
    }
    if (withdrawAmount > balance) {
      setMsg('Saldo insuficiente')
      return
    }
    if (!paypalEmail) {
      setMsg('Indica tu email de PayPal')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(import.meta.env.VITE_API_URL || '/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile?.id,
          amount: withdrawAmount,
          paypalEmail,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        await refreshBalance()
        setMsg('Solicitud enviada. Comisión: $0.50')
        onSuccess?.()
      } else throw new Error(data.error || 'Error')
    } catch (e) {
      setMsg(e.message || 'PayPal no configurado. Añade backend para retiros.')
    } finally {
      setLoading(false)
    }
  }

  async function savePastedSolana() {
    setMsg('')
    const addr = (pasteSolana || '').trim()
    if (!addr || addr.length < 32) {
      setMsg('Indica una dirección Solana válida (32-44 caracteres).')
      return
    }
    setLinkingWallet(true)
    try {
      const { error } = await supabase.from('profiles').update({ wallet_address: addr }).eq('id', user.id)
      if (error) throw error
      setPasteSolana('')
      await refreshBalance()
      setMsg('Dirección Solana vinculada. Envía USDC desde esa wallet.')
      onSuccess?.()
    } catch (e) {
      setMsg(e.message || 'Error al guardar')
    } finally {
      setLinkingWallet(false)
    }
  }

  async function savePastedBase() {
    setMsg('')
    const addr = (pasteBase || '').trim().toLowerCase()
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setMsg('Indica una dirección válida (0x + 40 caracteres hex).')
      return
    }
    setLinkingWallet(true)
    try {
      const { error } = await supabase.from('profiles').update({ wallet_address_base: addr }).eq('id', user.id)
      if (error) throw error
      setPasteBase('')
      await refreshBalance()
      setMsg('Dirección Base vinculada.')
      onSuccess?.()
    } catch (e) {
      setMsg(e.message || 'Error al guardar')
    } finally {
      setLinkingWallet(false)
    }
  }

  async function savePastedPolygon() {
    setMsg('')
    const addr = (pastePolygon || '').trim().toLowerCase()
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setMsg('Indica una dirección válida (0x + 40 caracteres hex).')
      return
    }
    setLinkingWallet(true)
    try {
      const { error } = await supabase.from('profiles').update({ wallet_address_polygon: addr }).eq('id', user.id)
      if (error) throw error
      setPastePolygon('')
      await refreshBalance()
      setMsg('Dirección Polygon vinculada.')
      onSuccess?.()
    } catch (e) {
      setMsg(e.message || 'Error al guardar')
    } finally {
      setLinkingWallet(false)
    }
  }

  function getDefaultWalletForRed(red) {
    return red === 'solana' ? (profile?.wallet_address || '') : red === 'base' ? (profile?.wallet_address_base || profile?.wallet_address_evm || '') : (profile?.wallet_address_polygon || profile?.wallet_address_evm || '')
  }

  function openConfirmRetiro(redForCard, addressForCard) {
    const red = redForCard || phantomRetiroRed
    const dest = addressForCard != null ? addressForCard : (redForCard ? getDefaultWalletForRed(redForCard) : retiroDestinoAddress)
    if (redForCard) {
      setPhantomRetiroRed(redForCard)
      setRetiroDestinoAddress(dest)
    }
    const validation = validateRetiroAddress(dest, red)
    if (!validation.valid || withdrawAmount < MIN_WITHDRAWAL_USDC || withdrawAmount > balance) return
    if (retiroOverLimit) {
      setMsg('Por seguridad, el límite máximo por transacción es de $50 USDC. Puedes realizar otra solicitud en cuanto esta sea procesada.')
      return
    }
    if (hasPendingRetiro) {
      setMsg('Ya tienes una solicitud de retiro pendiente. Cuando sea procesada podrás crear otra.')
      return
    }
    setConfirmLegalAccepted(false)
    setConfirmRetiroOpen(true)
  }

  function fireDiscreteConfetti() {
    const count = 60
    const defaults = { origin: { y: 0.7 }, zIndex: 9999 }
    function fire(particleRatio, opts) {
      confetti({ ...defaults, ...opts, particleCount: Math.floor(count * particleRatio) })
    }
    fire(0.25, { spread: 26, startVelocity: 55 })
    fire(0.2, { spread: 60 })
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 })
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 })
    fire(0.1, { spread: 120, startVelocity: 45 })
  }

  async function handleRetiroPhantom() {
    setConfirmRetiroOpen(false)
    setMsg('')
    const wallet = (retiroDestinoAddress || '').trim()
    if (!wallet) {
      setMsg('Indica la dirección de destino.')
      return
    }
    if (!amount || withdrawAmount < MIN_WITHDRAWAL_USDC) {
      setMsg(`Mínimo $${MIN_WITHDRAWAL_USDC} USD`)
      return
    }
    if (withdrawAmount > MAX_WITHDRAWAL_USDC) {
      setMsg('Por seguridad, el límite máximo por transacción es de $50 USDC. Puedes realizar otra solicitud en cuanto esta sea procesada.')
      return
    }
    if (withdrawAmount > balance) {
      setMsg('Saldo insuficiente')
      return
    }
    if (hasPendingRetiro) {
      setMsg('Ya tienes una solicitud de retiro pendiente. Cuando sea procesada podrás crear otra.')
      return
    }
    if (!retiroValidation.valid) {
      setMsg(retiroValidation.error || 'Dirección no válida para esta red.')
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('solicitar_retiro_phantom', {
        p_monto: withdrawAmount,
        p_red: phantomRetiroRed,
        p_wallet_destino: wallet,
      })
      if (error) throw error
      if (data?.ok) {
        setConfirmRetiroOpen(false)
        setConfirmLegalAccepted(false)
        await refreshBalance()
        setRetiroDestinoAddress(phantomRetiroRed === 'solana' ? (profile?.wallet_address || '') : phantomRetiroRed === 'base' ? (profile?.wallet_address_base || profile?.wallet_address_evm || '') : (profile?.wallet_address_polygon || profile?.wallet_address_evm || ''))
        const { data: list } = await supabase.from('retiros_phantom').select('id, monto, red, estado, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
        if (list) setHistorialRetiros(list)
        setRetiroSuccess(true)
        fireDiscreteConfetti()
        onSuccess?.()
        notifyAdminTelegram({ type: 'retiro', monto: withdrawAmount, red: phantomRetiroRed, wallet_destino: wallet, userName: profile?.full_name, userEmail: profile?.email })
        const retiroId = list?.[0]?.id
        if (retiroId) {
          const proxyBase = import.meta.env.DEV && typeof window !== 'undefined' ? '' : (import.meta.env.VITE_PROXY_URL || 'http://localhost:3031').replace(/\/$/, '')
          fetch(`${proxyBase}/api/admin/notify-retiro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ retiro_id: retiroId }),
          }).catch(() => {})
        }
      } else throw new Error(data?.error || 'Error')
    } catch (e) {
      setMsg(e.message || 'Error al solicitar retiro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ fontFamily: DISPLAY_FONT }}
    >
      <motion.div
        className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-900/95 shadow-2xl shadow-black/50 backdrop-blur-md p-5 pb-8"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -inset-4 bg-gradient-to-b from-amber-500/8 to-transparent rounded-[2rem] blur-2xl -z-10 pointer-events-none" />
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent">Cajero</span>
          </h2>
          <button onClick={onClose} className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-zinc-500 mb-3">Elige qué quieres hacer:</p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {isAdmin && (
            <button
              onClick={() => setTab('deposito')}
              className={`min-h-[52px] py-3 px-3 rounded-2xl font-semibold text-sm transition touch-manipulation flex flex-col items-center justify-center gap-0.5 ${tab === 'deposito' ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/60 shadow-[0_0_20px_rgba(251,191,36,0.15)]' : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700 hover:text-zinc-300'}`}
            >
              <span>Depósito</span>
              <span className="text-[10px] font-normal opacity-90">Tarjeta</span>
            </button>
          )}
          <button
            onClick={() => setTab('depositar-usdc')}
            className={`min-h-[52px] py-3 px-3 rounded-2xl font-semibold text-sm transition touch-manipulation flex flex-col items-center justify-center gap-0.5 ${tab === 'depositar-usdc' ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/60 shadow-[0_0_20px_rgba(251,191,36,0.15)]' : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700 hover:text-zinc-300'}`}
          >
            <span className="inline-flex items-center gap-1">Depositar <UsdcLabel showLogo={false} /></span>
            <span className="text-[10px] font-normal opacity-90">Enviar a la app</span>
          </button>
          <button
            onClick={() => setTab('retiro-usdc')}
            className={`min-h-[52px] py-3 px-3 rounded-2xl font-semibold text-sm transition touch-manipulation flex flex-col items-center justify-center gap-0.5 ${tab === 'retiro-usdc' ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/60 shadow-[0_0_20px_rgba(251,191,36,0.15)]' : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700 hover:text-zinc-300'}`}
          >
            <span className="inline-flex items-center gap-1">Retirar <UsdcLabel showLogo={false} /></span>
            <span className="text-[10px] font-normal opacity-90">Recibir en wallet</span>
          </button>
          {isAdmin && (
            <button
              onClick={() => setTab('retiro')}
              className={`min-h-[52px] py-3 px-3 rounded-2xl font-semibold text-sm transition touch-manipulation flex flex-col items-center justify-center gap-0.5 ${tab === 'retiro' ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/60 shadow-[0_0_20px_rgba(251,191,36,0.15)]' : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700 hover:text-zinc-300'}`}
            >
              <span>Retiro</span>
              <span className="text-[10px] font-normal opacity-90">Admin</span>
            </button>
          )}
          <button
            onClick={() => setTab('vincular-wallet')}
            className={`min-h-[52px] py-3 px-3 rounded-2xl font-semibold text-sm transition touch-manipulation flex flex-col items-center justify-center gap-0.5 col-span-2 ${tab === 'vincular-wallet' ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/60 shadow-[0_0_20px_rgba(251,191,36,0.15)]' : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700 hover:text-zinc-300'}`}
          >
            <Wallet className="w-4 h-4" />
            <span className="text-[10px] font-normal opacity-90">Dir. wallet</span>
          </button>
        </div>

        {tab === 'deposito' && isAdmin && (
          <div className="space-y-5">
            <p className="text-sm text-zinc-400 leading-relaxed">Depósitos con tarjeta vía Stripe.</p>
            <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-4">
              <label className="block text-sm font-medium text-amber-400">Monto (USD)</label>
              <input
                type="number"
                min="1"
                step="0.5"
                placeholder="Ej: 10"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 outline-none transition"
              />
              <button
                onClick={handleDeposit}
                disabled={loading}
                className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-amber-300 font-bold text-base shadow-[0_0_25px_rgba(251,191,36,0.35)] disabled:opacity-50 disabled:shadow-none active:scale-[0.98] transition touch-manipulation"
              >
                {loading ? 'Procesando...' : 'Depositar'}
              </button>
            </div>
          </div>
        )}

        {tab === 'vincular-wallet' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Agregar dirección wallet</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Dirección que tienes vinculada para recibir depósitos y retirar.
              </p>
            </div>
            <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-3">
              {hasSolana && (
                <div className="flex items-center justify-between gap-2 py-2">
                  <RedLabel red="solana" className="text-sm font-medium" />
                  <span className="font-mono text-xs text-zinc-400 truncate max-w-[60%]" title={profile?.wallet_address}>{profile?.wallet_address?.slice(0, 10)}...{profile?.wallet_address?.slice(-8)}</span>
                </div>
              )}
              {hasBase && (
                <div className="flex items-center justify-between gap-2 py-2">
                  <RedLabel red="base" className="text-sm font-medium" />
                  <span className="font-mono text-xs text-zinc-400 truncate max-w-[60%]" title={profile?.wallet_address_base || profile?.wallet_address_evm}>{(profile?.wallet_address_base || profile?.wallet_address_evm)?.slice(0, 10)}...{(profile?.wallet_address_base || profile?.wallet_address_evm)?.slice(-8)}</span>
                </div>
              )}
              {hasPolygon && (
                <div className="flex items-center justify-between gap-2 py-2">
                  <RedLabel red="polygon" className="text-sm font-medium" />
                  <span className="font-mono text-xs text-zinc-400 truncate max-w-[60%]" title={profile?.wallet_address_polygon || profile?.wallet_address_evm}>{(profile?.wallet_address_polygon || profile?.wallet_address_evm)?.slice(0, 10)}...{(profile?.wallet_address_polygon || profile?.wallet_address_evm)?.slice(-8)}</span>
                </div>
              )}
              {!hasSolana && !hasBase && !hasPolygon && (
                <>
                  <p className="text-sm text-zinc-500 text-center py-2">No tienes dirección vinculada.</p>
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-amber-400/90 mb-2">Agregar dirección</p>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <RedLabel red="solana" className="text-sm shrink-0 w-16" />
                        <input type="text" placeholder="Ej: 7xKXtg2CW..." value={pasteSolana} onChange={(e) => setPasteSolana(e.target.value)} className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono placeholder-zinc-500 focus:border-amber-500/40 outline-none" />
                        <button type="button" onClick={savePastedSolana} disabled={linkingWallet || !pasteSolana.trim()} className="py-2.5 px-4 rounded-xl bg-amber-500/20 text-amber-400 text-sm font-semibold border border-amber-500/50 disabled:opacity-50 transition shrink-0">Vincular</button>
                      </div>
                      <div className="flex gap-2">
                        <RedLabel red="base" className="text-sm shrink-0 w-16" />
                        <input type="text" placeholder="0x..." value={pasteBase} onChange={(e) => setPasteBase(e.target.value)} className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono placeholder-zinc-500 focus:border-amber-500/40 outline-none" />
                        <button type="button" onClick={savePastedBase} disabled={linkingWallet || !pasteBase.trim()} className="py-2.5 px-4 rounded-xl bg-amber-500/20 text-amber-400 text-sm font-semibold border border-amber-500/50 disabled:opacity-50 transition shrink-0">Vincular</button>
                      </div>
                      <div className="flex gap-2">
                        <RedLabel red="polygon" className="text-sm shrink-0 w-16" />
                        <input type="text" placeholder="0x..." value={pastePolygon} onChange={(e) => setPastePolygon(e.target.value)} className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono placeholder-zinc-500 focus:border-amber-500/40 outline-none" />
                        <button type="button" onClick={savePastedPolygon} disabled={linkingWallet || !pastePolygon.trim()} className="py-2.5 px-4 rounded-xl bg-amber-500/20 text-amber-400 text-sm font-semibold border border-amber-500/50 disabled:opacity-50 transition shrink-0">Vincular</button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'depositar-usdc' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Depositar <UsdcLabel /></h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Envía desde tu wallet a la app, copia la dirección, envía, luego confirma el monto y el hash.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {!hasSolana && !hasBase && !hasPolygon && (
                <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-5 text-center">
                  <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                    Para depositar, agrega una dirección en la pestaña <button type="button" onClick={() => setTab('vincular-wallet')} className="text-amber-400 font-semibold underline underline-offset-2 hover:text-amber-300">Dir. wallet</button>.
                  </p>
                </div>
              )}

              {/* Redes ya vinculadas */}
              {hasSolana && (
                <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${RED_COLORS.solana}20`, borderWidth: '1px', borderColor: `${RED_COLORS.solana}60` }}>
                      <RedLogo red="solana" className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Red vinculada</p>
                      <RedLabel red="solana" className="text-base font-bold" />
                    </div>
                    <span className="ml-auto text-xs px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 font-medium">Vinculada</span>
                  </div>
                  {MASTER_WALLET_SOLANA && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-amber-400/90">Paso 2 — Envía a esta dirección</p>
                      <p className="text-xs text-zinc-500">Copia la dirección y envía desde tu wallet (red <RedLabel red="solana" className="text-xs" />).</p>
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="flex-1 min-w-0 font-mono text-xs text-amber-300/90 break-all" title={MASTER_WALLET_SOLANA}>{MASTER_WALLET_SOLANA.slice(0, 12)}...{MASTER_WALLET_SOLANA.slice(-8)}</span>
                        <button type="button" onClick={() => copyDepositAddress('solana', MASTER_WALLET_SOLANA)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 text-sm font-semibold min-h-[44px] touch-manipulation transition">
                          {copyFeedback === 'solana' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {copyFeedback === 'solana' ? '¡Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="pt-4 border-t border-zinc-800 space-y-2">
                    <p className="text-xs font-semibold text-amber-400/90">Paso 3 — Confirmar depósito</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">Cuando hayas enviado, indica la cantidad en $ y el hash de la transacción (obligatorio).</p>
                    <input type="number" min="0.01" step="0.01" placeholder="Monto (Ej: 10)" value={depositConfirmSolana} onChange={(e) => setDepositConfirmSolana(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-500 focus:border-amber-500/40 outline-none" />
                    <input type="text" placeholder="Transacción Hash (obligatorio)" value={depositConfirmTxSolana} onChange={(e) => setDepositConfirmTxSolana(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono placeholder-zinc-500 focus:border-amber-500/40 outline-none" />
                    <button type="button" onClick={() => handleConfirmarDeposito('solana', depositConfirmSolana, depositConfirmTxSolana)} disabled={confirmDepositLoading || !depositConfirmSolana.trim() || !depositConfirmTxSolana.trim()} className="w-full py-2.5 px-4 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 text-sm font-semibold disabled:opacity-50 min-h-[44px] touch-manipulation transition">
                      {confirmDepositLoading ? '...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}
              {hasBase && (
                <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${RED_COLORS.base}20`, borderWidth: '1px', borderColor: `${RED_COLORS.base}60` }}>
                      <RedLogo red="base" className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Red vinculada</p>
                      <RedLabel red="base" className="text-base font-bold" />
                    </div>
                    <span className="ml-auto text-xs px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 font-medium">Vinculada</span>
                  </div>
                  {MASTER_WALLET_BASE && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-amber-400/90">Paso 2 — Envía a esta dirección</p>
                      <p className="text-xs text-zinc-500">Copia la dirección y envía desde tu wallet (red <RedLabel red="base" className="text-xs" />).</p>
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="flex-1 min-w-0 font-mono text-xs text-amber-300/90 break-all" title={MASTER_WALLET_BASE}>{MASTER_WALLET_BASE.slice(0, 10)}...{MASTER_WALLET_BASE.slice(-8)}</span>
                        <button type="button" onClick={() => copyDepositAddress('base', MASTER_WALLET_BASE)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 text-sm font-semibold min-h-[44px] touch-manipulation transition">
                          {copyFeedback === 'base' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {copyFeedback === 'base' ? '¡Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="pt-4 border-t border-zinc-800 space-y-2">
                    <p className="text-xs font-semibold text-amber-400/90">Paso 3 — Confirmar depósito</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">Cuando hayas enviado, indica la cantidad en $ y el hash de la transacción (obligatorio).</p>
                    <input type="number" min="0.01" step="0.01" placeholder="Monto (Ej: 10)" value={depositConfirmBase} onChange={(e) => setDepositConfirmBase(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-500 focus:border-amber-500/40 outline-none" />
                    <input type="text" placeholder="Transacción Hash (obligatorio)" value={depositConfirmTxBase} onChange={(e) => setDepositConfirmTxBase(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono placeholder-zinc-500 focus:border-amber-500/40 outline-none" />
                    <button type="button" onClick={() => handleConfirmarDeposito('base', depositConfirmBase, depositConfirmTxBase)} disabled={confirmDepositLoading || !depositConfirmBase.trim() || !depositConfirmTxBase.trim()} className="w-full py-2.5 px-4 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 text-sm font-semibold disabled:opacity-50 min-h-[44px] touch-manipulation transition">
                      {confirmDepositLoading ? '...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}
              {hasPolygon && (
                <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${RED_COLORS.polygon}20`, borderWidth: '1px', borderColor: `${RED_COLORS.polygon}60` }}>
                      <RedLogo red="polygon" className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Red vinculada</p>
                      <RedLabel red="polygon" className="text-base font-bold" />
                    </div>
                    <span className="ml-auto text-xs px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 font-medium">Vinculada</span>
                  </div>
                  {MASTER_WALLET_POLYGON && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-amber-400/90">Paso 2 — Envía a esta dirección</p>
                      <p className="text-xs text-zinc-500">Copia la dirección y envía desde tu wallet (red <RedLabel red="polygon" className="text-xs" />).</p>
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="flex-1 min-w-0 font-mono text-xs text-amber-300/90 break-all" title={MASTER_WALLET_POLYGON}>{MASTER_WALLET_POLYGON.slice(0, 10)}...{MASTER_WALLET_POLYGON.slice(-8)}</span>
                        <button type="button" onClick={() => copyDepositAddress('polygon', MASTER_WALLET_POLYGON)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 text-sm font-semibold min-h-[44px] touch-manipulation transition">
                          {copyFeedback === 'polygon' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {copyFeedback === 'polygon' ? '¡Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="pt-4 border-t border-zinc-800 space-y-2">
                    <p className="text-xs font-semibold text-amber-400/90">Paso 3 — Confirmar depósito</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">Cuando hayas enviado, indica la cantidad en $ y el hash de la transacción (obligatorio).</p>
                    <input type="number" min="0.01" step="0.01" placeholder="Monto (Ej: 10)" value={depositConfirmPolygon} onChange={(e) => setDepositConfirmPolygon(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-500 focus:border-amber-500/40 outline-none" />
                    <input type="text" placeholder="Transacción Hash (obligatorio)" value={depositConfirmTxPolygon} onChange={(e) => setDepositConfirmTxPolygon(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono placeholder-zinc-500 focus:border-amber-500/40 outline-none" />
                    <button type="button" onClick={() => handleConfirmarDeposito('polygon', depositConfirmPolygon, depositConfirmTxPolygon)} disabled={confirmDepositLoading || !depositConfirmPolygon.trim() || !depositConfirmTxPolygon.trim()} className="w-full py-2.5 px-4 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/50 text-sm font-semibold disabled:opacity-50 min-h-[44px] touch-manipulation transition">
                      {confirmDepositLoading ? '...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'retiro-usdc' && (
          <div className="space-y-6 pb-2">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Retirar <UsdcLabel /></h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Recibe en tu wallet. Mín. $10, máx. $50 por solicitud; comisión $0.50. Sigue los pasos en orden.
              </p>
            </div>
            {(hasSolana || hasBase || hasPolygon) ? (
              <>
                <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-amber-400/90">Paso 1 — ¿Cuánto retiras? <span className="text-zinc-500 font-normal">(mín. ${MIN_WITHDRAWAL_USDC}, máx. ${MAX_WITHDRAWAL_USDC})</span></p>
                    <button type="button" onClick={() => setHelpPanelOpen(true)} className="p-2.5 rounded-lg text-amber-400 hover:bg-zinc-700 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation" title="Ayuda" aria-label="Ayuda"><HelpCircle className="w-5 h-5" /></button>
                  </div>
                  <input
                    type="number"
                    min={MIN_WITHDRAWAL_USDC}
                    max={MAX_WITHDRAWAL_USDC}
                    step="0.5"
                    placeholder={`Monto USDC (mín. ${MIN_WITHDRAWAL_USDC}, máx. ${MAX_WITHDRAWAL_USDC})`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-4 py-3.5 min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base sm:text-sm placeholder-zinc-500 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 outline-none transition touch-manipulation"
                  />
                  {withdrawAmount > 0 && (
                    <p className="text-xs text-zinc-500">Recibirás: ${netWithdraw.toFixed(2)} <UsdcLabel /> (comisión -$0.50)</p>
                  )}
                </div>
                {[hasSolana && 'solana', hasBase && 'base', hasPolygon && 'polygon'].filter(Boolean).map((red) => (
                  <div key={red} className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <RedLogo red={red} className="w-10 h-10 shrink-0" />
                      <RedLabel red={red} className="text-base font-bold" />
                    </div>
                    <button
                      type="button"
                      onClick={() => openConfirmRetiro(red, getDefaultWalletForRed(red))}
                      disabled={loading || withdrawAmount < MIN_WITHDRAWAL_USDC || withdrawAmount > balance || retiroOverLimit || hasPendingRetiro}
                      className="shrink-0 py-3.5 px-5 min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-amber-300 font-bold text-sm shadow-[0_0_20px_rgba(251,191,36,0.25)] disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-400 transition touch-manipulation"
                    >
                      {loading ? '...' : `Solicitar retiro a ${RED_LABELS[red]}`}
                    </button>
                  </div>
                ))}
                {(retiroOverLimit || hasPendingRetiro) && (
                  <p className="text-sm text-amber-400 leading-relaxed">
                    {retiroOverLimit ? 'Máx. $50 por transacción.' : 'Tienes una solicitud pendiente.'}
                  </p>
                )}
                {historialRetiros.length > 0 && (
                  <div className="pt-4 border-t border-zinc-800">
                    <p className="text-sm font-medium text-zinc-400 mb-2">Historial de retiros</p>
                    <ul className="space-y-1.5 max-h-28 overflow-y-auto">
                      {historialRetiros.map((r) => (
                        <li key={r.id} className="flex items-center justify-between text-sm">
                          <span className="text-white">${Number(r.monto).toFixed(2)}</span>
                          <span className="px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1" style={{ backgroundColor: `${RED_COLORS[r.red] || '#fff'}30`, color: RED_COLORS[r.red] || '#fff' }}><RedLogo red={r.red} className="w-3.5 h-3.5" />{RED_LABELS[r.red] || r.red}</span>
                          <span className="text-zinc-500">{r.estado}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-5 text-center">
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Vincula una wallet en la pestaña{' '}
                  <button type="button" onClick={() => setTab('vincular-wallet')} className="text-amber-400 font-semibold underline underline-offset-2 hover:text-amber-300">
                    Dir. wallet
                  </button>{' '}
                  para poder retirar.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === 'retiro' && isAdmin && (
          <div className="space-y-5">
            <p className="text-sm text-zinc-400 leading-relaxed">Retiros a PayPal (comisión $0.50) o a tu wallet <UsdcLabel />.</p>
            <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-4">
            <label className="block text-sm font-medium text-amber-400">Email PayPal</label>
            <input
              type="email"
              placeholder="tu@email.com"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-amber-500/50 outline-none transition"
            />
            <label className="block text-sm font-medium text-amber-400">Monto (USD)</label>
            <input
              type="number"
              min="1"
              step="0.5"
              placeholder="Ej: 10"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-amber-500/50 outline-none transition"
            />
            {withdrawAmount > 0 && (
              <p className="text-sm text-zinc-400">
                Recibirás: <span className="text-amber-400 font-semibold">${netWithdraw.toFixed(2)}</span> (comisión -$0.50)
              </p>
            )}
            <button
              onClick={handleWithdraw}
              disabled={loading || withdrawAmount > balance}
              className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-amber-300 font-bold shadow-[0_0_25px_rgba(251,191,36,0.35)] disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-400 active:scale-[0.98] transition touch-manipulation"
            >
              {loading ? 'Procesando...' : 'Solicitar retiro PayPal'}
            </button>
            </div>
            {(hasSolana || hasBase || hasPolygon) && (
              <>
                <p className="text-sm text-zinc-400 pt-2 border-t border-zinc-800 leading-relaxed">Retiro a tu wallet (<UsdcLabel />) — Máx. $50. Comisión $0.50.</p>
                <div className="flex items-center gap-2">
                  <select
                    value={phantomRetiroRed}
                    onChange={(e) => setPhantomRetiroRed(e.target.value)}
                    className="flex-1 px-4 py-3.5 min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base sm:text-sm focus:border-amber-500/50 outline-none transition touch-manipulation"
                  >
                    {hasSolana && <option value="solana">Solana</option>}
                    {hasBase && <option value="base">Base</option>}
                    {hasPolygon && <option value="polygon">Polygon</option>}
                  </select>
                  <button
                    type="button"
                    onClick={() => setHelpPanelOpen(true)}
                    className="p-3 min-h-[48px] min-w-[48px] rounded-xl bg-zinc-800 border border-zinc-700 text-amber-400 hover:bg-zinc-700 transition shrink-0 flex items-center justify-center touch-manipulation"
                    title="Ayuda"
                    aria-label="Ayuda"
                  >
                    <HelpCircle className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-2 relative group/tooltip">
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="text-xs text-amber-200/95">Solo direcciones de la red</span>
                    <span className="inline-flex items-center"><RedLabel red={phantomRetiroRed} className="text-xs font-semibold" /></span>
                    <span className="text-xs text-amber-200/95">. No mezcles con otras redes.</span>
                  </div>
                  <label className="text-sm text-zinc-400 flex items-center gap-1.5">
                    Dirección de destino
                    <span
                      className="text-zinc-500 cursor-help"
                      title="Consejo: No escribas la dirección a mano, siempre usa Copiar y Pegar para evitar errores."
                    >
                      (?) 
                    </span>
                  </label>
                  <p className="absolute left-0 bottom-full mb-1 px-2 py-1.5 text-xs text-zinc-300 bg-zinc-800 border border-zinc-600 rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 max-w-[min(280px,90vw)] shadow-xl">
                    Consejo: No escribas la dirección a mano, siempre usa Copiar y Pegar para evitar errores.
                  </p>
                  <input
                    ref={addressInputRef}
                    type="text"
                    value={retiroDestinoAddress}
                    onChange={(e) => setRetiroDestinoAddress(e.target.value)}
                    placeholder={phantomRetiroRed === 'solana' ? 'Ej: 7xKX...' : '0x...'}
                    className={`w-full px-4 py-3.5 min-h-[48px] rounded-xl bg-zinc-800 border text-white placeholder-zinc-500 text-base sm:text-sm font-mono touch-manipulation ${
                      retiroDestinoAddress.trim()
                        ? retiroAddressValid
                          ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                          : 'border-red-500/70'
                        : 'border-zinc-700'
                    }`}
                  />
                  {retiroValidation.error && (
                    <div className="rounded-xl border p-4 bg-red-500/10 border-red-500/50">
                      <p className="text-sm font-medium flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
                        <span className="text-red-300">
                          {retiroValidation.error.replace(/^[⚠️❌]\s*/, '')}
                        </span>
                      </p>
                    </div>
                  )}
                  {retiroAddressValid && retiroDestinoAddress.trim() && (
                    <>
                      <p className="text-sm text-emerald-400 flex items-center gap-1.5">
                        <Check className="w-4 h-4 shrink-0" />
                        {phantomRetiroRed === 'solana' ? <>Dirección válida para <RedLabel red={phantomRetiroRed} /></> : <>Formato correcto para <RedLabel red={phantomRetiroRed} />.</>}
                      </p>
                      <div className="pt-2">
                        <label className="flex items-start gap-3 p-4 rounded-xl bg-zinc-800/80 border border-zinc-600 cursor-pointer hover:border-amber-500/30 active:bg-zinc-800 transition touch-manipulation select-none">
                          <input
                            type="checkbox"
                            checked={confirmEvmRedCorrecta}
                            onChange={(e) => setConfirmEvmRedCorrecta(e.target.checked)}
                            className="w-5 h-5 min-w-[20px] min-h-[20px] mt-0.5 rounded border-amber-500/50 bg-zinc-800 text-amber-500 focus:ring-amber-500 touch-manipulation"
                          />
                          <span className="text-sm leading-relaxed text-zinc-200 pt-0.5">
                            Confirmo que esta dirección es de mi wallet en <RedLabel red={phantomRetiroRed} asStrong className="font-semibold" />.
                          </span>
                        </label>
                      </div>
                    </>
                  )}
                </div>
                {retiroOverLimit && (
                  <p className="text-sm text-amber-400">
                    Por seguridad, el límite máximo por transacción es de $50 <UsdcLabel />. Puedes realizar otra solicitud en cuanto esta sea procesada.
                  </p>
                )}
                {hasPendingRetiro && !retiroOverLimit && (
                  <p className="text-sm text-amber-400">
                    Tienes una solicitud pendiente. Cuando sea procesada podrás crear otra.
                  </p>
                )}
                <button
                  onClick={openConfirmRetiro}
                  disabled={loading || withdrawAmount < MIN_WITHDRAWAL_USDC || withdrawAmount > balance || !retiroAddressValid || !evmConfirmado || retiroOverLimit || hasPendingRetiro}
                  className="w-full py-4 min-h-[52px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-amber-300 font-bold shadow-[0_0_25px_rgba(251,191,36,0.35)] disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-400 disabled:shadow-none active:scale-[0.98] transition touch-manipulation"
                >
                  {loading ? 'Procesando...' : 'Solicitar retiro a wallet'}
                </button>
                {historialRetiros.length > 0 && (
                  <div className="pt-2 border-t border-zinc-700">
                    <p className="text-sm text-zinc-400 mb-2">Historial de retiros</p>
                    <ul className="space-y-1.5 max-h-32 overflow-y-auto">
                      {historialRetiros.map((r) => (
                        <li key={r.id} className="flex items-center justify-between text-sm">
                          <span className="text-white">${Number(r.monto).toFixed(2)}</span>
                          <span className="px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1" style={{ backgroundColor: `${RED_COLORS[r.red] || '#fff'}30`, color: RED_COLORS[r.red] || '#fff' }}>
                            <RedLogo red={r.red} className="w-3.5 h-3.5" />{RED_LABELS[r.red] || r.red}
                          </span>
                          <span className="text-zinc-500">{r.estado}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {helpPanelOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex justify-end bg-black/60 backdrop-blur-sm"
            onClick={() => setHelpPanelOpen(false)}
          >
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-l-2xl bg-zinc-900/95 border border-zinc-800 border-r-0 shadow-2xl shadow-black/50 flex flex-col max-h-full backdrop-blur-md"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              <div className="p-5 border-b border-zinc-800 flex justify-between items-center">
                <h3 className="text-lg font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent">Ayuda rápida</h3>
                <button type="button" onClick={() => setHelpPanelOpen(false)} className="p-2.5 rounded-xl text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto space-y-6">
                <div className="rounded-2xl bg-zinc-800/50 border border-zinc-700 p-4">
                  <h4 className="text-sm font-bold text-amber-400 mb-2">¿Cómo retiro a Binance/Coinbase?</h4>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    En tu exchange (Binance, Coinbase, etc.) entra a tu billetera de <UsdcLabel /> y elige <strong>Recibir</strong> o <strong>Depositar</strong>. 
                    Copia la dirección que te den y asegúrate de elegir la <strong>red correcta</strong>: <RedLabel red="solana" />, <RedLabel red="base" /> o <RedLabel red="polygon" />. 
                    La red que selecciones aquí debe coincidir exactamente con la que muestra el exchange para ese depósito.
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-800/50 border border-zinc-700 p-4">
                  <h4 className="text-sm font-bold text-amber-400 mb-2">¿Por qué mi retiro sigue pendiente?</h4>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Los retiros se revisan manualmente para garantizar la seguridad del pozo y que la dirección y la red sean correctas. 
                    Se procesan en un máximo de 24 horas y normalmente en minutos. Si llevas más tiempo, contacta soporte.
                  </p>
                </div>
              </div>
            </motion.aside>
          </motion.div>
        )}

        {retiroSuccess && (tab === 'retiro' || tab === 'retiro-usdc') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative rounded-3xl border border-zinc-800 bg-zinc-900/95 backdrop-blur-md p-8 max-w-sm w-full text-center shadow-2xl shadow-black/50 overflow-hidden"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              <div className="absolute -inset-4 bg-gradient-to-b from-amber-500/8 to-transparent rounded-[2rem] blur-2xl -z-10 pointer-events-none" />
              <p className="text-4xl mb-3">🎉</p>
              <h3 className="text-xl font-bold bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent mb-3">¡Solicitud enviada!</h3>
              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                Estamos preparando tu envío. Te avisaremos cuando se complete.
              </p>
              <button
                type="button"
                onClick={() => setRetiroSuccess(false)}
                className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-amber-300 font-bold shadow-[0_0_25px_rgba(251,191,36,0.35)] active:scale-[0.98] transition"
              >
                Entendido
              </button>
            </motion.div>
          </motion.div>
        )}

        {msg && <p className="mt-4 text-sm text-amber-400 font-medium rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3">{msg}</p>}

        {confirmRetiroOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setConfirmRetiroOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="relative rounded-3xl border border-zinc-800 bg-zinc-900/95 backdrop-blur-md p-5 max-w-sm w-full shadow-2xl shadow-black/50 max-h-[90vh] overflow-y-auto overflow-x-hidden"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              <div className="absolute -inset-4 bg-gradient-to-b from-amber-500/8 to-transparent rounded-[2rem] blur-2xl -z-10 pointer-events-none" />
              <h3 className="text-lg font-bold text-amber-400 mb-2">Información importante sobre tu retiro</h3>
              <p className="text-zinc-400 text-sm mb-3">Al solicitar este retiro, confirmas que:</p>
              <ul className="text-zinc-300 text-sm space-y-2 mb-4 list-disc list-inside pl-1">
                <li>La dirección de destino es de la red <RedLabel red={phantomRetiroRed} className="font-medium" />.</li>
                <li>Aceptas el descuento de $0.50 por costos operativos y de red.</li>
                <li>Los retiros se procesan en un máximo de 24 horas (usualmente en minutos).</li>
              </ul>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 mb-4">
                <p className="text-zinc-200 text-sm">
                  Vas a recibir <span className="text-amber-400 font-bold">${netWithdraw.toFixed(2)}</span> en la red <RedLabel red={phantomRetiroRed} className="font-medium" />.
                </p>
                <p className="text-zinc-500 text-xs mt-1">Esta operación no se puede deshacer.</p>
              </div>
              <label className="flex items-center gap-2 mb-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmLegalAccepted}
                  onChange={(e) => setConfirmLegalAccepted(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm text-zinc-300">Entiendo y asumo la responsabilidad</span>
              </label>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setConfirmRetiroOpen(false)}
                  className="flex-1 py-3.5 rounded-2xl border-2 border-zinc-600 text-zinc-300 hover:bg-zinc-800 font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleRetiroPhantom}
                  disabled={!confirmLegalAccepted || loading}
                  className="flex-1 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-amber-300 font-bold shadow-[0_0_25px_rgba(251,191,36,0.35)] disabled:opacity-50 disabled:shadow-none active:scale-[0.98] transition"
                >
                  {loading ? 'Procesando...' : 'Confirmar retiro'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}
