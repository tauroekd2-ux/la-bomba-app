-- Ejecutar en Supabase → SQL Editor. Normaliza telegram_chat_id al guardar y corrige los ya guardados.
-- Migración 052: normalizar_telegram_chat_id

CREATE OR REPLACE FUNCTION public.normalizar_telegram_chat_id(p_val TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(TRIM(regexp_replace(COALESCE(p_val, ''), '[^0-9-]', '', 'g')), '');
$$;

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
  UPDATE profiles SET telegram_chat_id = v_chat_id, updated_at = NOW() WHERE id = v_user_id;
  DELETE FROM telegram_link_tokens WHERE token = p_token;
  RETURN jsonb_build_object('ok', true);
END;
$body$;

UPDATE public.profiles
SET telegram_chat_id = normalizar_telegram_chat_id(telegram_chat_id)
WHERE telegram_chat_id IS NOT NULL
  AND telegram_chat_id <> ''
  AND normalizar_telegram_chat_id(telegram_chat_id) IS NOT NULL
  AND telegram_chat_id <> normalizar_telegram_chat_id(telegram_chat_id);

COMMENT ON FUNCTION public.normalizar_telegram_chat_id(TEXT) IS 'Devuelve solo dígitos y opcional signo menos, para guardar chat_id de Telegram.';
