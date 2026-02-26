-- Tokens de un solo uso para vincular Telegram al usuario (bot de notificaciones)
CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE public.telegram_link_tokens IS 'Tokens para vincular chat_id de Telegram al usuario al abrir el bot con /start?start=TOKEN';

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expires ON public.telegram_link_tokens(expires_at);

-- El usuario autenticado crea un token y lo devuelve (válido 15 min)
CREATE OR REPLACE FUNCTION public.create_telegram_link_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
  v_token TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_token := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO telegram_link_tokens (token, user_id, expires_at)
  VALUES (v_token, v_user_id, NOW() + interval '15 minutes');
  RETURN v_token;
END;
$body$;

GRANT EXECUTE ON FUNCTION public.create_telegram_link_token() TO authenticated;

-- El proxy (service_role) consume el token: actualiza profiles.telegram_chat_id y borra el token
CREATE OR REPLACE FUNCTION public.consume_telegram_link_token(p_token TEXT, p_chat_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID;
BEGIN
  IF NULLIF(TRIM(p_token), '') IS NULL OR NULLIF(TRIM(p_chat_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token o chat_id vacío');
  END IF;
  SELECT user_id INTO v_user_id
  FROM telegram_link_tokens
  WHERE token = p_token AND expires_at > NOW();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token no válido o expirado');
  END IF;
  UPDATE profiles SET telegram_chat_id = TRIM(p_chat_id), updated_at = NOW() WHERE id = v_user_id;
  DELETE FROM telegram_link_tokens WHERE token = p_token;
  RETURN jsonb_build_object('ok', true, 'user_id', v_user_id);
END;
$body$;

-- Solo service_role (proxy) puede llamar esta función
REVOKE EXECUTE ON FUNCTION public.consume_telegram_link_token(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_telegram_link_token(TEXT, TEXT) TO service_role;
