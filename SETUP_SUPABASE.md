# Configuración Supabase para LA BOMBA

## Proxy
En desarrollo, Vite hace proxy directo a Supabase (`/supabase` → tu proyecto). Un solo proceso, sin servidor Express.

---


## 1. Si el proyecto está PAUSADO
- Ve a https://supabase.com/dashboard
- Abre tu proyecto
- Si dice "Project is paused" → clic en **Restore project**
- Espera 1-2 minutos

## 2. URLs de autenticación
- En tu proyecto: **Authentication** → **URL Configuration**
- **Site URL:** `http://localhost:5174`
- **Redirect URLs:** añade:
  - `http://localhost:5174/**`
  - `http://192.168.1.216:5174/**` (para móvil, cambia 192.168.1.216 por la IP de tu PC)
- Clic en **Save**

## 3. Desactivar confirmación de email (opcional, para pruebas)
- **Authentication** → **Providers** → **Email**
- Desactiva **"Confirm email"**
- Guarda

## 4. Verificar .env
En `la-bomba-app/.env`:
```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci... (tu anon key)
```

Obtén ambos en: **Project Settings** → **API**

## 5. Migraciones (SQL)
Para aplicar migraciones: **SQL Editor** → New query → pega el contenido del archivo → Run.

Archivos en `supabase/migrations/`:
- `001_la_bomba.sql` – esquema inicial
- `002_buscar_partida_matchmaking.sql` – matchmaking aleatorio
- `003_chat_y_transferencias.sql` – chat y enviar fondos entre usuarios
