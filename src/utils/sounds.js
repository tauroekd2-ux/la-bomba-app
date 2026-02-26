/** Sonido de moneda (notificaciones: depósito, transfer, chat). */
export function playCoinSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
    osc.start(now)
    osc.stop(now + 0.25)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.frequency.value = 1320
    osc2.type = 'sine'
    gain2.gain.setValueAtTime(0.1, now + 0.1)
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
    osc2.start(now + 0.1)
    osc2.stop(now + 0.35)
  } catch (_) {}
}
