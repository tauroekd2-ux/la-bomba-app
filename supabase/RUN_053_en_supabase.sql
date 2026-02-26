-- Ejecutar en Supabase → SQL Editor.
-- Migración 053: un mismo telegram_chat_id solo en un usuario (evita duplicados y que no se mande el mensaje).

CREATE OR REPLACE FUNCTION public.consume_telegram_link_token(p_token TEXT, p_chat_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID;
  v_chat_id TEXT;
BEGIN
  IF NULLIF(TRIM(p_token), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token vacío');
  END IF;
  v_chat_id := normalizar_telegram_chat_id(p_chat_id);
  IF v_chat_id IS NULL OR v_chat_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'chat_id vacío o inválido');
  END IF;
  SELECT user_id INTO v_user_id
  FROM telegram_link_tokens
  WHERE token = p_token AND expires_at > NOW();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token no válido o expirado');
  END IF;
  -- Quitar este chat_id de cualquier otro usuario (un chat_id = un solo usuario)
  UPDATE profiles SET telegram_chat_id = NULL, updated_at = NOW()
  WHERE telegram_chat_id = v_chat_id AND id <> v_user_id;
  -- Asignar al usuario que está vinculando
  UPDATE profiles SET telegram_chat_id = v_chat_id, updated_at = NOW() WHERE id = v_user_id;
  DELETE FROM telegram_link_tokens WHERE token = p_token;
  RETURN jsonb_build_object('ok', true, 'user_id', v_user_id);
END;
$body$;

CREATE OR REPLACE FUNCTION public.link_telegram_by_token(p_token TEXT, p_chat_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_chat_id TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF NULLIF(TRIM(p_token), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token vacío');
  END IF;
  v_chat_id := normalizar_telegram_chat_id(p_chat_id);
  IF v_chat_id IS NULL OR v_chat_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'chat_id vacío o inválido');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM telegram_link_tokens
    WHERE token = p_token AND user_id = v_user_id AND expires_at > NOW()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token no válido o expirado');
  END IF;
  -- Quitar este chat_id de cualquier otro usuario
  UPDATE profiles SET telegram_chat_id = NULL, updated_at = NOW()
  WHERE telegram_chat_id = v_chat_id AND id <> v_user_id;
  -- Asignar al usuario actual
  UPDATE profiles SET telegram_chat_id = v_chat_id, updated_at = NOW() WHERE id = v_user_id;
  DELETE FROM telegram_link_tokens WHERE token = p_token;
  RETURN jsonb_build_object('ok', true);
END;
$body$;

-- Si ya hay duplicados: dejar el chat_id solo en un usuario por valor (el de id menor)
UPDATE public.profiles p
SET telegram_chat_id = NULL, updated_at = NOW()
WHERE p.telegram_chat_id IS NOT NULL
  AND p.telegram_chat_id <> ''
  AND EXISTS (
    SELECT 1 FROM public.profiles q
    WHERE q.telegram_chat_id = p.telegram_chat_id AND q.id < p.id
  );

-- Índice único: no puede haber dos perfiles con el mismo telegram_chat_id (no nulo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_telegram_chat_id_unique
ON public.profiles (telegram_chat_id)
WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id <> '';

COMMENT ON INDEX public.idx_profiles_telegram_chat_id_unique IS 'Un chat_id de Telegram solo puede estar vinculado a un usuario.';
