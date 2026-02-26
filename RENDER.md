# Despliegue en Render

## Empezar ahora (pasos rápidos)

1. **Sube el código** a un repo en GitHub o GitLab (si aún no está).
2. Entra en [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
3. Conecta el repositorio (autoriza Render si pide) y confirma. Render creará dos servicios desde `render.yaml`.
4. **Primero configura el proxy (la-bomba-proxy):**
   - Abre el Web Service **la-bomba-proxy** → **Environment**.
   - Añade todas las variables (las que tienen `sync: false` te pedirán el valor la primera vez).  
     Necesarias mínimo: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.  
     Para emails: `RESEND_API_KEY`, `RESEND_FROM`.  
     Para Telegram admin: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_LINKS_BASE`.  
     Para IA: `GROQ_API_KEY` (y opcional `GROQ_MODEL`).
   - **ADMIN_LINKS_BASE** ponla igual a la URL del propio servicio (ej: `https://la-bomba-proxy.onrender.com`).
   - Guarda y deja que haga **Deploy**.
5. **Luego configura el frontend (la-bomba-web):**
   - Abre el Static Site **la-bomba-web** → **Environment**.
   - Añade: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL` (URL del static site, ej: `https://la-bomba-web.onrender.com`), **VITE_PROXY_URL** = URL del proxy (ej: `https://la-bomba-proxy.onrender.com`).
   - Añade el resto de `VITE_*` que uses (wallets, Telegram, Stripe, etc.) según la tabla de abajo.
   - Guarda y haz **Deploy** (o espera al auto-deploy).
6. Prueba la app en la URL del Static Site. Para Admin Phantom, inicia sesión con un usuario que esté en `admin_roles` en Supabase.

---

La app se compone de **dos servicios** en Render:

1. **Static Site** — Frontend (Vite/React). Se sirve desde la CDN.
2. **Web Service** — Proxy Node (`server-proxy.js`). APIs de email, Telegram, verificación de depósitos, etc.

## Opción A: Blueprint (render.yaml)

1. Conecta el repo en Render y crea un **Blueprint** (New → Blueprint).
2. Render leerá `render.yaml` y creará ambos servicios.
3. En el **Static Site** (la-bomba-web), configura en Environment:
   - **VITE_PROXY_URL** = URL del Web Service del proxy (ej: `https://la-bomba-proxy.onrender.com`).
   - El resto de variables `VITE_*` y las que necesite el build (ver abajo).
4. En el **Web Service** (la-bomba-proxy), añade todas las variables de entorno del proxy (secretos con **Sync: false** y pegar en el Dashboard).

Tras el primer deploy, la URL del proxy estará en el panel del servicio; copia esa URL y pégala en `VITE_PROXY_URL` del Static Site y vuelve a desplegar el frontend.

## Opción B: Crear servicios a mano

### 1. Static Site (frontend)

- **New → Static Site**
- Repo: este repositorio
- **Build Command:** `npm run build`
- **Publish Directory:** `dist`
- **Environment (solo las que empiezan por VITE_ y las que use el build):**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_APP_URL` = URL final del sitio (ej: `https://tu-app.onrender.com` o tu dominio)
  - `VITE_PROXY_URL` = URL del servicio proxy (ej: `https://la-bomba-proxy.onrender.com`)
  - `VITE_STRIPE_PUBLISHABLE_KEY` (si usas Stripe)
  - `VITE_MASTER_WALLET_SOLANA`, `VITE_MASTER_WALLET_BASE`, `VITE_MASTER_WALLET_POLYGON` (wallets de depósito)
  - `VITE_NTFY_TOPIC`, `VITE_TELEGRAM_BOT_TOKEN`, `VITE_TELEGRAM_ADMIN_CHAT_ID`
  - `VITE_TELEGRAM_USER_BOT_TOKEN`, `VITE_TELEGRAM_USER_BOT_USERNAME`
  - `VITE_PHANTOM_ADMIN_UID` (opcional; para restringir admin Phantom)

**Importante:** No pongas en el frontend ningún secreto de backend (ni `DEPOSIT_EMAIL_SECRET`, ni `SUPABASE_SERVICE_ROLE_KEY`, etc.). El admin envía JWT y el proxy valida con Supabase.

### 2. Web Service (proxy)

- **New → Web Service**
- Repo: este repositorio
- **Runtime:** Node
- **Build Command:** `npm install` (o vacío si solo necesitas dependencias)
- **Start Command:** `node server-proxy.js`
- **Environment:** Todas las variables que usa `server-proxy.js` (no van con prefijo `VITE_`):

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_URL` o `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` o `VITE_SUPABASE_ANON_KEY` | Anon key (para validar JWT de admin) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (solo en proxy, nunca en frontend) |
| `RESEND_API_KEY`, `RESEND_FROM` | Emails (depósito/retiro) |
| `DEPOSIT_EMAIL_SECRET` | Opcional; si no, el admin debe usar sesión (JWT) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` | Bot y chat de admin |
| `TELEGRAM_WEBHOOK_SECRET` | Para enlaces Aprobar/Rechazar desde Telegram |
| `ADMIN_LINKS_BASE` | URL pública del proxy (ej: `https://la-bomba-proxy.onrender.com`) |
| `GROQ_API_KEY`, `GROQ_MODEL` | IA soporte |
| `VITE_MASTER_WALLET_*` / `MASTER_WALLET_*` | Wallets para verificación de depósitos |

En Render, el **puerto** lo asigna la plataforma vía `PORT`; `server-proxy.js` ya usa `process.env.PORT || 3031`.

## Después del deploy

1. **Migración 048:** Ejecuta en Supabase (SQL Editor) el contenido de `supabase/migrations/048_seguridad_balance_y_numero_prohibido.sql` si no lo has hecho (protege balance y consistencia).
2. **CORS:** El proxy usa `cors()`; si usas dominio propio para el frontend, en producción puedes restringir `origin` en el proxy a tu dominio.
3. **ADMIN_LINKS_BASE:** Debe ser la URL pública del proxy para que los enlaces de Telegram (Aprobar/Rechazar) funcionen.

## Resumen de seguridad

- Los usuarios no pueden modificar el saldo (trigger en Supabase).
- El número prohibido (bomba) no se expone al cliente (columnas excluidas en selects).
- Los endpoints de email del proxy aceptan JWT de admin o `DEPOSIT_EMAIL_SECRET`; el frontend ya no envía el secret, solo el JWT de la sesión de admin.
