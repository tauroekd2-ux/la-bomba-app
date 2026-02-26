# Configuración Phantom (depósitos automáticos + admin retiros)

## 1. Migración y admin

- Ejecuta la migración `012_phantom_wallet_deposits_admin.sql` en Supabase (SQL Editor).
- Añade tu usuario como admin (sustituye `TU_UUID` por tu `auth.users.id`):

```sql
INSERT INTO public.admin_roles (user_id) VALUES ('TU_UUID') ON CONFLICT (user_id) DO NOTHING;
```

## 2. Edge Function y variables

- Despliega la Edge Function:

```bash
cd la-bomba-app
supabase functions deploy phantom-webhook-handler
```

- En Supabase: Project Settings → Edge Functions → `phantom-webhook-handler` → añade estos **secrets**:

| Nombre | Descripción |
|--------|-------------|
| `PHANTOM_MASTER_WALLET_SOLANA` | Tu dirección Phantom en Solana (recibe USDC) |
| `PHANTOM_MASTER_WALLET_BASE` | Tu dirección 0x en **Base** (recibe USDC) |
| `PHANTOM_MASTER_WALLET_POLYGON` | Tu dirección 0x en **Polygon** (recibe USDC) |

(Opcional: si usas la misma dirección en Base y Polygon, puedes poner solo `PHANTOM_MASTER_WALLET_EVM` y se usará para ambas.)

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya se inyectan en el proyecto.

## 3. Webhooks externos

- **Helius (Solana):** Crea un webhook que apunte a  
  `https://<TU_PROJECT_REF>.supabase.co/functions/v1/phantom-webhook-handler`  
  Red: Solana. Dirección a vigilar: tu `PHANTOM_MASTER_WALLET_SOLANA`. Filtra transferencias USDC (SPL).

- **Alchemy (Base y Polygon):** Crea webhooks (Address Activity) para la misma URL con tu `PHANTOM_MASTER_WALLET_EVM` en Base y en Polygon.

## 4. App (env)

En tu `.env` o en Supabase (Dashboard → Settings → API) usa:

- `VITE_PHANTOM_ADMIN_UID`: tu UUID (mismo que en `admin_roles`) para que solo tú puedas abrir `/admin-phantom`.

## Flujo

- **Depósitos:** El usuario vincula su Phantom en Cajero → Phantom. Cuando envía USDC a tu dirección maestra, Helius/Alchemy notifican la Edge Function → se identifica al usuario por `wallet_address` / `wallet_address_evm` → se acredita el saldo y se inserta en `deposit_notifications` → el dashboard se actualiza en tiempo real y suena el efecto de moneda.
- **Retiros:** El usuario pide retiro a Phantom (Cajero → Retiro → Solicitar retiro Phantom). En `/admin-phantom` ves los pendientes, abres Phantom con el deep link (Solana o EIP-681 Base/Polygon), pagas y marcas como «Marcar procesado» (opcionalmente pegas el hash).

## Si no se acredita el depósito

1. **Redespliega la Edge Function** tras cambios: `npx supabase functions deploy phantom-webhook-handler`.
2. **Helius:** Usa webhook tipo **Enhanced Transactions** (o el que envíe `tokenTransfers`). La URL debe ser exactamente la de la función. La dirección a vigilar es tu **maestra** (la que recibe USDC). La respuesta del webhook incluye `{ ok: true, source: "helius", credited: N }`; si `credited` es 0, revisa logs.
3. **Logs:** En Supabase → Edge Functions → `phantom-webhook-handler` → Logs. Busca:
   - `"no profile for wallet"` → el usuario no tiene esa dirección en Cajero (Solana: `wallet_address`; Base: `wallet_address_base`; Polygon: `wallet_address_polygon` o `wallet_address_evm`). Debe vincular la misma wallet desde la que envía.
   - `"acreditar error"` o `"RPC no ok"` → fallo en BD (ej. tx_hash duplicado, usuario no encontrado).
4. **Dirección Solana:** Debe coincidir **exactamente** (mayúsculas/minúsculas) con la que guarda el usuario y con la que envía Helius. En Cajero se guarda tal cual; en secrets, la maestra igual que en el dashboard de Helius.
5. **Mientras tanto:** El usuario puede usar «Confirmar depósito» en Cajero y tú acreditar manualmente en Admin Phantom (Confirmaciones de depósito → Acreditar).

## Email cuando se acredita un depósito

Para enviar un email al usuario cuando se le acredita un depósito (sin usar Database Webhook):

1. Despliega las funciones:  
   `supabase functions deploy send-deposit-email`  
   `supabase functions deploy trigger-deposit-email`  
   (Y redeploy de `phantom-webhook-handler` si ya lo tenías, para que llame al email tras acreditar.)
2. Configura **Secrets** en Edge Functions: `RESEND_API_KEY` (y opcionalmente `RESEND_FROM`). Ver `supabase/functions/send-deposit-email/README.md`

El email se dispara solo: en depósitos por Phantom lo llama el webhook handler; en acreditación manual lo llama el panel Admin vía `trigger-deposit-email`.
