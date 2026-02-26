# URLs de LA BOMBA

Siempre usa el puerto **5174**:

- **Local:** http://localhost:5174/
- **Móvil (red local):** http://192.168.1.216:5174/

## Supabase Auth

En **Authentication** → **URL Configuration** añade:

- Site URL: `http://localhost:5174`
- Redirect URLs:
  - `http://localhost:5174/**`
  - `http://192.168.1.216:5174/**`

## .env

```env
VITE_APP_URL=http://localhost:5174
```
