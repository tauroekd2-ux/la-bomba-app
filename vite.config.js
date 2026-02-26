import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import supportChatPlugin from './vite-plugin-support-chat.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = (env.VITE_SUPABASE_URL || 'https://cdwvmtdvpwzjbdoywzyw.supabase.co').replace(/\/$/, '')

  return {
    plugins: [supportChatPlugin(), react(), tailwindcss()],
    server: {
      host: true,
      port: 5175,
      strictPort: false,
      // Proxy directo a Supabase: sin Express, un solo proceso
      proxy: {
        '/supabase': {
          target: supabaseUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/supabase/, ''),
          secure: true,
        },
        // Otras APIs del server-proxy (email, Telegram admin). /api/support-chat lo atiende el plugin en este proceso.
        '/api/send-deposit-email': { target: 'http://localhost:3031', changeOrigin: true },
        '/api/send-retiro-procesado-email': { target: 'http://localhost:3031', changeOrigin: true },
        '/api/telegram-admin-notify': { target: 'http://localhost:3031', changeOrigin: true },
        '/api/admin/verify-and-notify-deposit': { target: 'http://localhost:3031', changeOrigin: true },
        '/api/admin/notify-retiro': { target: 'http://localhost:3031', changeOrigin: true },
        // /api/admin/chat lo atiende vite-plugin-support-chat.js en dev (sin proxy)
      },
    },
  }
})
