# Email de registro con nombre de la página (LA BOMBA)

El email que recibe el usuario al registrarse se configura en **Supabase**, no en el código.

## Pasos

1. Entra en [Supabase Dashboard](https://supabase.com/dashboard) → tu proyecto.
2. Ve a **Authentication** → **Email Templates**.
3. Elige la plantilla **"Confirm signup"** (confirmación de registro).
4. Cambia el **Subject** y el **Body** para que aparezca el nombre de la app.

### Subject (asunto)

```
Confirma tu cuenta en LA BOMBA
```

### Message (cuerpo) – ejemplo con nombre de la app

Puedes pegar algo como esto (el enlace `{{ .ConfirmationURL }}` es obligatorio):

```html
<h2>LA BOMBA</h2>
<p>Hola,</p>
<p>Gracias por registrarte. Confirma tu correo para activar tu cuenta.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar mi correo</a></p>
<p>Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
<p>— LA BOMBA</p>
```

5. Guarda los cambios.

## Nombre del remitente (quién envía el email)

El **nombre** que aparece como remitente (ej. "LA BOMBA" en lugar de solo la dirección) se configura en:

- **Authentication** → **SMTP Settings** (o **Providers** → **Email** según tu versión).

Si usas **SMTP personalizado**, en el campo **Sender email** o **From** puedes poner:

```
LA BOMBA <noreply@tudominio.com>
```

Si usas el **correo por defecto de Supabase**, las opciones de nombre son limitadas; para que salga "LA BOMBA" como remitente suele hacer falta configurar SMTP con tu propio dominio.

Resumen: **Email Templates** = texto del mensaje y asunto; **SMTP / From** = nombre y dirección del remitente.
