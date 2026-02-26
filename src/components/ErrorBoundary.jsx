import { Component } from 'react'

export class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#050508] text-zinc-100 p-6" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent mb-4">LA BOMBA</h1>
          <p className="text-zinc-400 mb-2">Algo falló. Recarga la página.</p>
          <p className="text-zinc-500 text-sm mb-6 max-w-md text-center">{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_25px_rgba(251,191,36,0.35)] active:scale-[0.98] transition"
          >
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
