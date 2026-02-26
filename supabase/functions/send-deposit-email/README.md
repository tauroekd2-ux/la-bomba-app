# Envío de email cuando se acredita un depósito

Esta función envía un email al usuario cuando se le acredita un depósito.

**No hace falta configurar Database Webhook.** La función se invoca desde:
- **Depósitos automáticos (Phantom):** el webhook `phantom-webhook-handler` llama a esta función tras acreditar.
- **Acreditación manual (Admin):** el panel Admin llama a `trigger-deposit-email`, que verifica que seas admin y luego llama a esta función.

## Configuración

### 1. Variables de entorno (Secrets)

En **Supabase** → **Project Settings** → **Edge Functions** → **Secrets** añade:

| Variable | Obligatorio | Descripción |
|----------|-------------|-------------|
| `RESEND_API_KEY` | Sí (para enviar) | API key de [Resend](https://resend.com/api-keys). Sin ella la función no envía email (responde 200 y hace skip). |
| `RESEND_FROM` | No | Remitente del email. Por defecto: `LA BOMBA <onboarding@resend.dev>`. En producción usa un dominio verificado en Resend (ej. `noreply@tudominio.com`). |

**trigger-deposit-email** no necesita secrets extra (lee el user id del JWT del admin).

### 2. Desplegar ambas funciones

```bash
supabase functions deploy send-deposit-email
supabase functions deploy trigger-deposit-email
```

(El webhook Phantom ya está desplegado; solo necesita tener `phantom-webhook-handler` actualizado para que llame a `send-deposit-email`.)

### 3. Resend

- Crea cuenta en [resend.com](https://resend.com).
- Crea una API Key y ponla en `RESEND_API_KEY`.
- Para pruebas puedes usar `onboarding@resend.dev` como remitente (límites de Resend).
- Para producción verifica tu dominio en Resend y usa `RESEND_FROM` con ese dominio.
