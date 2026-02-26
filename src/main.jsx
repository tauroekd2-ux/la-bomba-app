import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary'

const rootEl = document.getElementById('root')
if (rootEl) {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch (e) {
    rootEl.innerHTML = `<div style="padding:24px;color:#fbbf24;text-align:center"><h1>LA BOMBA</h1><p>Error al cargar: ${e?.message || 'desconocido'}</p></div>`
    rootEl.style.display = 'block'
  }
}
