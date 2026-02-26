-- Migración 003: Chat y transferencias entre usuarios
-- Ejecutar en Supabase: SQL Editor → New query → pegar → Run

-- 1. Tipos de transacción para transferencias
ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS transacciones_tipo_check;
ALTER TABLE public.transacciones ADD CONSTRAINT transacciones_tipo_check
  CHECK (tipo IN ('deposito','apuesta','premio','retiro','comision_retiro','transferencia_envio','transferencia_recibo'));

-- 2. Tabla chat (DROP por si existe con estructura distinta)
DROP TABLE IF EXISTS public.chat_mensajes CASCADE;
CREATE TABLE public.chat_mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  leido BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sender ON public.chat_mensajes(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_receiver ON public.chat_mensajes(receiver_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversacion ON public.chat_mensajes(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_chat_created ON public.chat_mensajes(created_at DESC);

ALTER TABLE public.chat_mensajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own chat" ON public.chat_mensajes FOR SELECT
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "Users insert own messages" ON public.chat_mensajes FOR INSERT
  WITH CHECK (sender_id = auth.uid());
CREATE POLICY "Users update received messages" ON public.chat_mensajes FOR UPDATE
  USING (receiver_id = auth.uid());

-- 3. RPC buscar usuario por email
CREATE OR REPLACE FUNCTION public.obtener_usuario_por_email(p_email TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_rec RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  SELECT id, full_name, email INTO v_rec FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = lower(trim(p_email)) AND p.id != auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Usuario no encontrado'); END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_rec.id, 'full_name', v_rec.full_name);
END;
$$;

-- 4. RPC enviar fondos
CREATE OR REPLACE FUNCTION public.enviar_fondos(p_destinatario_email TEXT, p_monto DECIMAL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_remitente_id UUID := auth.uid();
  v_destinatario_id UUID;
  v_balance_remitente DECIMAL(12,2);
  v_balance_destinatario DECIMAL(12,2);
BEGIN
  IF v_remitente_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  IF p_monto <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido'); END IF;

  SELECT p.id INTO v_destinatario_id FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = lower(trim(p_destinatario_email));

  IF v_destinatario_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Usuario no encontrado'); END IF;
  IF v_destinatario_id = v_remitente_id THEN RETURN jsonb_build_object('ok', false, 'error', 'No puedes enviarte a ti mismo'); END IF;

  SELECT balance INTO v_balance_remitente FROM profiles WHERE id = v_remitente_id;
  IF v_balance_remitente IS NULL OR v_balance_remitente < p_monto THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;

  UPDATE profiles SET balance = balance - p_monto, updated_at = NOW() WHERE id = v_remitente_id;
  UPDATE profiles SET balance = balance + p_monto, updated_at = NOW() WHERE id = v_destinatario_id;

  SELECT balance INTO v_balance_remitente FROM profiles WHERE id = v_remitente_id;
  SELECT balance INTO v_balance_destinatario FROM profiles WHERE id = v_destinatario_id;

  INSERT INTO transacciones (user_id, tipo, monto, saldo_despues, detalles)
  VALUES (v_remitente_id, 'transferencia_envio', -p_monto, v_balance_remitente,
    jsonb_build_object('destinatario_id', v_destinatario_id));
  INSERT INTO transacciones (user_id, tipo, monto, saldo_despues, detalles)
  VALUES (v_destinatario_id, 'transferencia_recibo', p_monto, v_balance_destinatario,
    jsonb_build_object('remitente_id', v_remitente_id));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_usuario_por_email TO authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_fondos(TEXT, DECIMAL) TO authenticated;
