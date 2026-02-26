# LA BOMBA

Juego 1vs1 en tiempo real. Elige números del 20 al 50, pierde quien toque la bomba.

## Stack

- **Frontend:** React + Vite + Tailwind CSS
- **Backend/DB:** Supabase (Auth, Database, Realtime)
- **Pagos:** Stripe (depósitos), PayPal (retiros)

## Configuración

1. Crea un proyecto en [Supabase](https://supabase.com)
2. En SQL Editor, ejecuta el contenido de `supabase/migrations/001_la_bomba.sql`
3. Habilita Realtime para la tabla `partidas`: Database → Replication → partidas
4. Copia `.env.example` a `.env` y rellena:

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
VITE_APP_URL=http://localhost:5174
```

5. Instala y ejecuta:

```bash
npm install
npm run dev
```

## Stripe y PayPal (opcional)

Para depósitos (Stripe) y retiros (PayPal) necesitas un backend que implemente:

- `POST /api/create-checkout` – crear sesión Stripe Checkout
- `POST /api/webhooks/stripe` – webhook para confirmar depósitos
- `POST /api/withdraw` – solicitar retiro a PayPal

El Cajero muestra la UI; sin backend mostrará el mensaje correspondiente.

## Reglas

- 30 números (20–50), uno es la bomba (secreto)
- Turnos alternados
- Si tocas la bomba, pierdes y el rival gana el pozo ($2 por apuesta de $1)
- Comisión retiro: $0.50 USD fijos
