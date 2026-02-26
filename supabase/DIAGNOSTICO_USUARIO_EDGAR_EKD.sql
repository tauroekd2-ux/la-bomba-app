-- Diagnóstico usuario Edgar EKD: notificaciones y Telegram.
-- Ejecutar en Supabase → SQL Editor. Ejecuta cada bloque por separado.

-- ========== Por telegram_chat_id 7645073296: quién tiene ese chat_id ==========
-- Si sale más de una fila = duplicado (dos usuarios recibiendo en el mismo Telegram). Ejecuta RUN_053.
SELECT id, full_name, email, telegram_chat_id, balance, updated_at
FROM public.profiles
WHERE TRIM(COALESCE(telegram_chat_id, '')) = '7645073296'
   OR regexp_replace(COALESCE(telegram_chat_id, ''), '[^0-9-]', '', 'g') = '7645073296';

-- ========== 0) SI "No rows returned": el nombre/email no contiene edgar/ekd ==========
-- Prueba (A) buscar solo por "edgar" o (B) listar últimos perfiles y localizar a Edgar por vista.

-- (A) Búsqueda más amplia (quita el comentario de la que quieras):
-- SELECT id, full_name, email, telegram_chat_id, balance, updated_at
-- FROM public.profiles
-- WHERE full_name ILIKE '%edgar%' OR email ILIKE '%edgar%';
-- SELECT id, full_name, email, telegram_chat_id, balance, updated_at
-- FROM public.profiles
-- WHERE full_name ILIKE '%ekd%' OR email ILIKE '%ekd%';

-- (B) Últimos 30 perfiles (actualizados o creados). Localiza a Edgar por nombre/email:
SELECT id, full_name, email, telegram_chat_id, balance, updated_at
FROM public.profiles
ORDER BY updated_at DESC NULLS LAST
LIMIT 30;

-- ========== 0b) RESUMEN: perfil de Edgar + si su chat_id está duplicado ==========
-- Cuando tengas el id de Edgar, pégalo abajo en 'ID_DE_EDGAR' y ejecuta este bloque.
/*
SELECT
  p.id,
  p.full_name,
  p.email,
  p.telegram_chat_id,
  CASE
    WHEN p.telegram_chat_id IS NULL OR TRIM(p.telegram_chat_id) = '' THEN 'Sin vincular (no recibe Telegram)'
    WHEN dup.cuantos > 1 THEN 'Duplicado: otro usuario tiene el mismo chat_id → ejecuta RUN_053'
    ELSE 'OK (solo este usuario tiene este chat_id)'
  END AS estado_telegram,
  dup.cuantos AS cuantos_con_mismo_chat_id,
  p.balance,
  p.updated_at
FROM public.profiles p
LEFT JOIN (
  SELECT telegram_chat_id, COUNT(*) AS cuantos
  FROM public.profiles
  WHERE telegram_chat_id IS NOT NULL AND TRIM(telegram_chat_id) <> ''
  GROUP BY telegram_chat_id
) dup ON dup.telegram_chat_id = p.telegram_chat_id
WHERE p.id = 'ID_DE_EDGAR';
*/

-- ========== 1) PERFIL (nombre/email que contengan edgar o ekd) ==========
-- Revisa: telegram_chat_id NULL = no recibe Telegram hasta que vincule en la app (menú → Telegram notificaciones).
-- Si tiene valor, debe ser solo dígitos o "-" + dígitos (ej: 7645073296 o -100123456).
SELECT id, full_name, email, telegram_chat_id, balance, updated_at
FROM public.profiles
WHERE full_name ILIKE '%edgar%' OR full_name ILIKE '%ekd%'
   OR email ILIKE '%edgar%' OR email ILIKE '%ekd%'
ORDER BY updated_at DESC;

-- ========== 2) DUPLICADOS DE telegram_chat_id ==========
-- Si el chat_id de Edgar aparece en varios perfiles, solo uno recibe los mensajes (y RUN_053 deja solo uno).
-- Tras ejecutar RUN_053 no debería haber filas aquí.
SELECT telegram_chat_id, COUNT(*) AS cuantos, array_agg(full_name ORDER BY full_name) AS nombres
FROM public.profiles
WHERE telegram_chat_id IS NOT NULL AND TRIM(telegram_chat_id) <> ''
GROUP BY telegram_chat_id
HAVING COUNT(*) > 1;

-- ========== 3) RETIROS DE EDGAR (para ver si debería haber recibido "retiro procesado") ==========
-- Sustituye 'ID_DE_EDGAR' por el id que salió en (1). Ejemplo: WHERE user_id = 'a1b2c3d4-...'
/*
SELECT id, user_id, monto, red, estado, created_at, updated_at
FROM public.retiros_phantom
WHERE user_id = 'ID_DE_EDGAR'
ORDER BY created_at DESC
LIMIT 20;
*/

-- ========== 4) CONFIRMACIONES DE DEPÓSITO DE EDGAR ==========
/*
SELECT id, user_id, monto, red, estado, created_at
FROM public.confirmaciones_deposito
WHERE user_id = 'ID_DE_EDGAR'
ORDER BY created_at DESC
LIMIT 20;
*/

-- ========== 5) TOKENS DE VINCULACIÓN TELEGRAM PENDIENTES (para ese usuario) ==========
-- Si hay tokens y no tiene telegram_chat_id, puede volver a abrir el enlace de la app para vincular.
/*
SELECT token, user_id, created_at, expires_at
FROM public.telegram_link_tokens
WHERE user_id = 'ID_DE_EDGAR' AND expires_at > NOW();
*/

-- ========== 6) NOTIFICACIONES IN-APP DE DEPÓSITO (si existen) ==========
/*
SELECT id, user_id, monto, red, created_at
FROM public.deposit_notifications
WHERE user_id = 'ID_DE_EDGAR'
ORDER BY created_at DESC
LIMIT 20;
*/

-- ========== POSIBLES CAUSAS Y QUÉ HACER ==========
-- • telegram_chat_id NULL → Que Edgar abra la app, menú "Telegram notificaciones", abra el enlace en Telegram y pulse Start.
-- • Duplicados en (2) → Ejecutar RUN_053_en_supabase.sql (deja un solo usuario por chat_id).
-- • chat_id con espacios o caracteres raros → Ejecutar RUN_052_en_supabase.sql (normaliza valores).
-- • El proxy ahora envía por user_id (lee telegram_chat_id de la BD); si el perfil tiene chat_id correcto, debe recibir.
