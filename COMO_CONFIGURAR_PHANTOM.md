# Cómo configurar Phantom (paso a paso)

Sigue estos pasos en orden. Necesitas: tu cuenta de Supabase, tu cuenta en Helius.dev, tu cuenta en Alchemy.com, y tus dos direcciones de Phantom (Solana y la 0x para Base/Polygon).

---

## Paso 1: Obtener tu UUID (admin)

1. Entra en **Supabase** → tu proyecto.
2. Ve a **Authentication** → **Users**.
3. Abre tu usuario (el que usarás como admin).
4. Copia el **User UID** (algo como `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).  
   Ese es tu **UUID**. Lo usarás en el Paso 2 y en el Paso 5.

---

## Paso 2: Ejecutar la migración y darte de alta como admin

1. En Supabase, ve a **SQL Editor**.
2. Pulsa **New query**.
3. Abre el archivo del proyecto:  
   `la-bomba-app/supabase/migrations/012_phantom_wallet_deposits_admin.sql`  
   Copia **todo** el contenido y pégalo en el editor SQL.
4. Pulsa **Run** (o Ctrl+Enter).  
   Debe terminar sin errores.
5. En otra pestaña del SQL Editor (o en la misma, debajo), ejecuta esto **sustituyendo `TU_UUID`** por el UUID que copiaste en el Paso 1:

```sql
INSERT INTO public.admin_roles (user_id) VALUES ('TU_UUID') ON CONFLICT (user_id) DO NOTHING;
```

6. Run otra vez.  
   Con esto ya tienes la base de datos lista y tú como único admin.

---

## Paso 3: Desplegar la Edge Function en Supabase

1. Abre una terminal en tu PC.
2. Entra en la carpeta del proyecto:

```bash
cd "c:\Users\EDGAR\edgar robot\la-bomba-app"
```

3. Si no lo has hecho nunca, inicia sesión en Supabase:

```bash
npx supabase login
```

4. Enlaza el proyecto (sustituye `TU_PROJECT_REF` por el ID de tu proyecto en Supabase; lo ves en Project Settings → General):

```bash
npx supabase link --project-ref TU_PROJECT_REF
```

5. Despliega la función:

```bash
npx supabase functions deploy phantom-webhook-handler
```

6. Al terminar, la URL de la función será:

```
https://TU_PROJECT_REF.supabase.co/functions/v1/phantom-webhook-handler
```

Guarda esa URL; la usarás en Helius y Alchemy.

---

## Paso 4: Poner las direcciones de Phantom en Supabase (secrets)

1. En Supabase, ve a **Project Settings** (icono de engranaje abajo a la izquierda).
2. En el menú izquierdo entra en **Edge Functions**.
3. En **Secrets** (o **Function Secrets**), añade dos variables:

| Name | Value |
|------|--------|
| `PHANTOM_MASTER_WALLET_SOLANA` | Tu dirección en **Solana** (recibe USDC). Ej: `7xKX...` |
| `PHANTOM_MASTER_WALLET_BASE` | Tu dirección **0x** en **Base** (recibe USDC). Ej: `0x1234...` |
| `PHANTOM_MASTER_WALLET_POLYGON` | Tu dirección **0x** en **Polygon** (recibe USDC). Ej: `0x5678...` |

- **Solana:** en Phantom, red Solana → copia tu dirección.
- **Base y Polygon:** pueden ser direcciones distintas. En Phantom cambia a Base → copia la 0x; cambia a Polygon → copia la 0x. Crea los dos secrets.

Si usas la **misma** dirección 0x en Base y Polygon, puedes crear solo `PHANTOM_MASTER_WALLET_EVM` con esa dirección y se usará para ambas redes.

No hace falta que añadas `SUPABASE_URL` ni `SUPABASE_SERVICE_ROLE_KEY`; Supabase las inyecta solo.

---

## Paso 5: Variable de la app para el panel admin

1. En la carpeta del proyecto, abre o crea el archivo **`.env`** (junto a `package.json`).
2. Añade esta línea con **tu mismo UUID** del Paso 1:

```env
VITE_PHANTOM_ADMIN_UID=tu-uuid-aqui
```

Ejemplo:

```env
VITE_PHANTOM_ADMIN_UID=a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

3. Guarda el archivo y **reinicia el servidor** de la app (npm run dev o similar).  
   Así solo tú podrás entrar en `/admin-phantom`.

---

## Paso 6: Webhook en Helius (Solana)

1. Entra en **https://www.helius.dev** e inicia sesión.
2. Ve a la sección de **Webhooks** (o Dashboard → Webhooks).
3. Crea un **nuevo webhook** con algo así:
   - **Webhook URL:**  
     `https://TU_PROJECT_REF.supabase.co/functions/v1/phantom-webhook-handler`  
     (el mismo TU_PROJECT_REF de Supabase).
   - **Red:** Solana (mainnet).
   - **Dirección a vigilar:** tu **PHANTOM_MASTER_WALLET_SOLANA** (la misma que pusiste en Supabase).
   - **Tipo de transacciones:** el que incluya transferencias de tokens / SPL (por ejemplo “Token transfer” o “Enhanced”, según lo que ofrezca Helius).
4. Guarda el webhook.  
   Cuando alguien envíe USDC a esa dirección Solana, Helius llamará a tu Edge Function.

---

## Paso 7: Webhooks en Alchemy (Base y Polygon)

1. Entra en **https://www.alchemy.com** e inicia sesión.
2. Crea o elige una **app** para **Base** y otra para **Polygon** (o una por red).
3. Busca la sección **Webhooks** o **Notify** / **Address Activity**.
4. Crea un webhook de tipo **Address Activity** (o similar):
   - **URL:** la misma:  
     `https://TU_PROJECT_REF.supabase.co/functions/v1/phantom-webhook-handler`
   - **Dirección:** en el webhook de Base usa tu **PHANTOM_MASTER_WALLET_BASE**; en el de Polygon usa **PHANTOM_MASTER_WALLET_POLYGON**.
   - **Red:** Base (para un webhook) y Polygon (para otro), o según permita Alchemy.
5. Guarda.  
   Así, cuando alguien envíe USDC a tu dirección 0x en Base o Polygon, Alchemy notificará a la misma Edge Function.

---

## Resumen rápido

| Paso | Dónde | Qué hacer |
|------|--------|-----------|
| 1 | Supabase → Auth → Users | Copiar tu User UID (UUID). |
| 2 | Supabase → SQL Editor | Ejecutar migración 012 y luego el `INSERT` en `admin_roles` con tu UUID. |
| 3 | Terminal | `npx supabase functions deploy phantom-webhook-handler`. |
| 4 | Supabase → Project Settings → Edge Functions → Secrets | Añadir `PHANTOM_MASTER_WALLET_SOLANA`, `PHANTOM_MASTER_WALLET_BASE` y `PHANTOM_MASTER_WALLET_POLYGON`. |
| 5 | Archivo `.env` del proyecto | Añadir `VITE_PHANTOM_ADMIN_UID=tu-uuid`. Reiniciar la app. |
| 6 | Helius.dev | Crear webhook a la URL de la función, red Solana, dirección Solana. |
| 7 | Alchemy.com | Crear webhook para Base (dirección BASE) y otro para Polygon (dirección POLYGON), misma URL. |

---

## Cómo probar que funciona

1. **App:** Entra en tu app, abre **Cajero** → pestaña **Phantom** → **Conectar** (Solana y/o EVM). Debe guardarse la wallet en tu perfil.
2. **Depósito:** Envía un poco de USDC (Solana o Base) **a tu dirección maestra** (la que pusiste en los secrets). En unos segundos deberías ver el saldo actualizado en la app y oír el sonido de moneda.
3. **Admin:** Entra en `http://localhost:5174/admin-phantom` (o tu URL de la app). Solo debe poder entrar el usuario cuyo UUID está en `VITE_PHANTOM_ADMIN_UID` y en `admin_roles`. Ahí ves los retiros pendientes y puedes usar “Pagar con Phantom” y “Marcar procesado”.

Si algo falla, revisa: que la migración 012 se haya ejecutado entera, que los secrets tengan exactamente las direcciones correctas (sin espacios), que la URL del webhook sea exactamente la de tu proyecto Supabase y que Helius/Alchemy estén en la red correcta (Solana / Base / Polygon).
