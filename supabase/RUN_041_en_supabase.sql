-- Ejecuta en Supabase: SQL Editor → New query → Pegar → Run
-- RPC para vincular Telegram sin webhook (el cliente usa getUpdates y llama esta función)

CREATE OR REPLACE FUNCTION public.link_telegram_by_token(p_token TEXT, p_chat_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF NULLIF(TRIM(p_token), '') IS NULL OR NULLIF(TRIM(p_chat_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token o chat_id vacío');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM telegram_link_tokens
    WHERE token = p_token AND user_id = v_user_id AND expires_at > NOW()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token no válido o expirado');
  END IF;
  UPDATE profiles SET telegram_chat_id = TRIM(p_chat_id), updated_at = NOW() WHERE id = v_user_id;
  DELETE FROM telegram_link_tokens WHERE token = p_token;
  RETURN jsonb_build_object('ok', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.link_telegram_by_token(TEXT, TEXT) TO authenticated;
