# Render – Opción B: Frontend como Static Site

Sigue estos pasos en [dashboard.render.com](https://dashboard.render.com).

---

## 1. Crear el Static Site (frontend)

1. **New** → **Static Site**.
2. **Connect a repository:** GitHub → **tauroekd2-ux/la-bomba-app** (conectar si no está).
3. Configuración:
   - **Name:** `la-bomba-web`
   - **Branch:** `main`
   - **Build Command:** `npm run build`
   - **Publish Directory:** `dist`
4. **Environment** – añade (sustituye valores por los tuyos):

   | Key | Value |
   |-----|--------|
   | `VITE_SUPABASE_URL` | `https://tu-proyecto.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | tu anon key de Supabase |
   | `VITE_APP_URL` | La URL que te dará Render para este sitio (ej: `https://la-bomba-web.onrender.com`). Puedes ponerla después del primer deploy. |
   | `VITE_PROXY_URL` | URL de tu proxy (ej: `https://la-bomba-proxy.onrender.com`) |
   | `VITE_MASTER_WALLET_SOLANA` | (opcional) |
   | `VITE_MASTER_WALLET_BASE` | (opcional) |
   | `VITE_MASTER_WALLET_POLYGON` | (opcional) |
   | `VITE_STRIPE_PUBLISHABLE_KEY` | (opcional, si usas Stripe) |
   | `VITE_NTFY_TOPIC` | (opcional) |
   | `VITE_TELEGRAM_BOT_TOKEN` | (opcional) |
   | `VITE_TELEGRAM_ADMIN_CHAT_ID` | (opcional) |
   | `VITE_TELEGRAM_USER_BOT_TOKEN` | (opcional) |
   | `VITE_TELEGRAM_USER_BOT_USERNAME` | (opcional) |
   | `VITE_PHANTOM_ADMIN_UID` | (opcional) |

5. **Create Static Site**. Espera al primer deploy.

---

## 2. Ajustar VITE_APP_URL tras el primer deploy

Cuando el deploy termine, Render te dará una URL (ej: `https://la-bomba-web.onrender.com`).

1. Entra en el servicio **la-bomba-web** → **Environment**.
2. Edita **VITE_APP_URL** y pon esa URL.
3. **Save Changes** → se hará un nuevo deploy (así los enlaces y redirects usan la URL correcta).

---

## 3. Apagar o eliminar el Web Service del frontend (el viejo)

Si antes tenías un **Web Service** que hacía build del frontend y `npm start`:

- Entra en ese servicio → **Settings** → **Delete Web Service**,  
  **o** déjalo y simplemente no lo uses (la URL que usarás es la del Static Site).

---

## 4. Probar

Abre la URL del **Static Site** (ej: `https://la-bomba-web.onrender.com`). Prueba login, juego y Admin Phantom (con un usuario en `admin_roles`).

---

**Resumen:** El frontend queda como **Static Site** (build + `dist`). El **proxy** sigue siendo un **Web Service** (`la-bomba-proxy`) con `node server-proxy.js`.
