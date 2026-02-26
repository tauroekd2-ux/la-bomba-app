-- LA BOMBA - Copia TODO este contenido y pégalo en Supabase SQL Editor
-- NO copies la ruta del archivo, solo este SQL

-- 1. Profiles (extiende auth.users con balance)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  balance DECIMAL(12,2) DEFAULT 0 CHECK (balance >= 0),
  paypal_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Partidas (salas de juego)
CREATE TABLE IF NOT EXISTS public.partidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL,
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  apuesta DECIMAL(12,2) NOT NULL DEFAULT 1 CHECK (apuesta > 0),
  numero_prohibido INTEGER NOT NULL CHECK (numero_prohibido >= 20 AND numero_prohibido <= 50),
  estado TEXT NOT NULL DEFAULT 'esperando' CHECK (estado IN ('esperando','jugando','finalizada')),
  turno_actual UUID REFERENCES public.profiles(id),
  ganador_id UUID REFERENCES public.profiles(id),
  numeros_usados JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Transacciones (auditoría)
CREATE TABLE IF NOT EXISTS public.transacciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('deposito','apuesta','premio','retiro','comision_retiro')),
  monto DECIMAL(12,2) NOT NULL,
  saldo_despues DECIMAL(12,2),
  partida_id UUID REFERENCES public.partidas(id),
  stripe_payment_id TEXT,
  paypal_payout_id TEXT,
  detalles JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_partidas_room_code ON public.partidas(room_code);
CREATE INDEX IF NOT EXISTS idx_partidas_host ON public.partidas(host_id);
CREATE INDEX IF NOT EXISTS idx_partidas_guest ON public.partidas(guest_id);
CREATE INDEX IF NOT EXISTS idx_partidas_estado ON public.partidas(estado);
CREATE INDEX IF NOT EXISTS idx_transacciones_user ON public.transacciones(user_id);

-- 5. RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users read own partidas" ON public.partidas FOR SELECT
  USING (host_id = auth.uid() OR guest_id = auth.uid());
CREATE POLICY "Users insert partida as host" ON public.partidas FOR INSERT WITH CHECK (host_id = auth.uid());
CREATE POLICY "Users update partida if participant" ON public.partidas FOR UPDATE
  USING (host_id = auth.uid() OR guest_id = auth.uid());

CREATE POLICY "Users read own transacciones" ON public.transacciones FOR SELECT
  USING (user_id = auth.uid());

-- 6. Trigger para crear perfil al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 7. RPC: procesar victoria
CREATE OR REPLACE FUNCTION public.procesar_victoria(p_partida_id UUID, p_ganador_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partida RECORD;
  v_apuesta DECIMAL(12,2);
  v_premio DECIMAL(12,2);
  v_perdedor_id UUID;
  v_balance_ganador DECIMAL(12,2);
BEGIN
  SELECT * INTO v_partida FROM partidas WHERE id = p_partida_id AND estado = 'jugando';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Partida no válida'); END IF;
  IF p_ganador_id NOT IN (v_partida.host_id, v_partida.guest_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No participante');
  END IF;
  v_apuesta := v_partida.apuesta;
  v_premio := v_apuesta * 2;
  v_perdedor_id := CASE WHEN p_ganador_id = v_partida.host_id THEN v_partida.guest_id ELSE v_partida.host_id END;
  UPDATE profiles SET balance = balance + v_premio, updated_at = NOW() WHERE id = p_ganador_id
  RETURNING balance INTO v_balance_ganador;
  INSERT INTO transacciones (user_id, tipo, monto, saldo_despues, partida_id, detalles)
  VALUES (p_ganador_id, 'premio', v_premio, v_balance_ganador, p_partida_id, '{"tipo":"victoria"}'::jsonb);
  INSERT INTO transacciones (user_id, tipo, monto, partida_id, detalles)
  SELECT id, 'apuesta', -v_apuesta, p_partida_id, '{"tipo":"perdida"}'::jsonb FROM profiles WHERE id = v_perdedor_id;
  UPDATE partidas SET estado = 'finalizada', ganador_id = p_ganador_id, updated_at = NOW() WHERE id = p_partida_id;
  RETURN jsonb_build_object('ok', true, 'premio', v_premio, 'balance', v_balance_ganador);
END;
$$;

-- 8. RPC: crear partida
CREATE OR REPLACE FUNCTION public.crear_partida(p_apuesta DECIMAL DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance DECIMAL(12,2);
  v_room_code TEXT;
  v_numero_prohibido INTEGER;
  v_partida_id UUID;
  v_existing INT;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_apuesta THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;
  LOOP
    v_room_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 5));
    SELECT COUNT(*) INTO v_existing FROM partidas WHERE room_code = v_room_code AND estado = 'esperando';
    EXIT WHEN v_existing = 0;
  END LOOP;
  v_numero_prohibido := 20 + floor(random() * 31)::integer;
  INSERT INTO partidas (room_code, host_id, apuesta, numero_prohibido)
  VALUES (v_room_code, v_user_id, p_apuesta, v_numero_prohibido)
  RETURNING id INTO v_partida_id;
  UPDATE profiles SET balance = balance - p_apuesta, updated_at = NOW() WHERE id = v_user_id;
  INSERT INTO transacciones (user_id, tipo, monto, partida_id, detalles)
  VALUES (v_user_id, 'apuesta', -p_apuesta, v_partida_id, '{"rol":"host"}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id, 'room_code', v_room_code);
END;
$$;

-- 9. RPC: unirse a partida
CREATE OR REPLACE FUNCTION public.unirse_partida(p_room_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_partida RECORD;
  v_balance DECIMAL(12,2);
  v_turno UUID;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  SELECT * INTO v_partida FROM partidas WHERE room_code = upper(p_room_code) AND estado = 'esperando';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Sala no encontrada o ya iniciada'); END IF;
  IF v_partida.host_id = v_user_id THEN RETURN jsonb_build_object('ok', false, 'error', 'No puedes unirte a tu propia sala'); END IF;
  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_partida.apuesta THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;
  v_turno := CASE WHEN random() < 0.5 THEN v_partida.host_id ELSE v_user_id END;
  UPDATE partidas SET guest_id = v_user_id, estado = 'jugando', turno_actual = v_turno, updated_at = NOW() WHERE id = v_partida.id;
  UPDATE profiles SET balance = balance - v_partida.apuesta, updated_at = NOW() WHERE id = v_user_id;
  INSERT INTO transacciones (user_id, tipo, monto, partida_id, detalles)
  VALUES (v_user_id, 'apuesta', -v_partida.apuesta, v_partida.id, '{"rol":"guest"}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida.id, 'tu_turno', v_turno = v_user_id);
END;
$$;

-- 9b. RPC: buscar partida (matchmaking aleatorio, sin sala/código)
CREATE OR REPLACE FUNCTION public.buscar_partida(p_apuesta DECIMAL DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance DECIMAL(12,2);
  v_partida RECORD;
  v_room_code TEXT;
  v_numero_prohibido INTEGER;
  v_partida_id UUID;
  v_existing INT;
  v_turno UUID;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_apuesta THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;
  SELECT * INTO v_partida FROM partidas
  WHERE estado = 'esperando' AND apuesta = p_apuesta AND host_id != v_user_id
  ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF FOUND THEN
    v_turno := CASE WHEN random() < 0.5 THEN v_partida.host_id ELSE v_user_id END;
    UPDATE partidas SET guest_id = v_user_id, estado = 'jugando', turno_actual = v_turno, updated_at = NOW() WHERE id = v_partida.id;
    UPDATE profiles SET balance = balance - p_apuesta, updated_at = NOW() WHERE id = v_user_id;
    INSERT INTO transacciones (user_id, tipo, monto, partida_id, detalles)
    VALUES (v_user_id, 'apuesta', -p_apuesta, v_partida.id, '{"rol":"guest","matchmaking":true}'::jsonb);
    RETURN jsonb_build_object('ok', true, 'partida_id', v_partida.id, 'esperando', false, 'tu_turno', v_turno = v_user_id);
  END IF;
  LOOP
    v_room_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 5));
    SELECT COUNT(*) INTO v_existing FROM partidas WHERE room_code = v_room_code AND estado = 'esperando';
    EXIT WHEN v_existing = 0;
  END LOOP;
  v_numero_prohibido := 20 + floor(random() * 31)::integer;
  INSERT INTO partidas (room_code, host_id, apuesta, numero_prohibido)
  VALUES (v_room_code, v_user_id, p_apuesta, v_numero_prohibido)
  RETURNING id INTO v_partida_id;
  UPDATE profiles SET balance = balance - p_apuesta, updated_at = NOW() WHERE id = v_user_id;
  INSERT INTO transacciones (user_id, tipo, monto, partida_id, detalles)
  VALUES (v_user_id, 'apuesta', -p_apuesta, v_partida_id, '{"rol":"host","matchmaking":true}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'partida_id', v_partida_id, 'esperando', true);
END;
$$;

-- 10. RPC: elegir número
CREATE OR REPLACE FUNCTION public.elegir_numero(p_partida_id UUID, p_numero INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partida RECORD;
  v_numeros JSONB;
  v_ganador UUID;
  v_perdedor UUID;
BEGIN
  SELECT * INTO v_partida FROM partidas WHERE id = p_partida_id AND estado = 'jugando';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Partida no válida'); END IF;
  IF auth.uid() != v_partida.turno_actual THEN RETURN jsonb_build_object('ok', false, 'error', 'No es tu turno'); END IF;
  IF p_numero < 20 OR p_numero > 50 THEN RETURN jsonb_build_object('ok', false, 'error', 'Número inválido'); END IF;
  v_numeros := COALESCE(v_partida.numeros_usados, '[]'::jsonb);
  IF v_numeros @> to_jsonb(array[p_numero]) THEN RETURN jsonb_build_object('ok', false, 'error', 'Número ya usado'); END IF;
  v_numeros := v_numeros || to_jsonb(array[p_numero]);
  IF p_numero = v_partida.numero_prohibido THEN
    v_perdedor := auth.uid();
    v_ganador := CASE WHEN v_partida.host_id = auth.uid() THEN v_partida.guest_id ELSE v_partida.host_id END;
    PERFORM procesar_victoria(p_partida_id, v_ganador);
    UPDATE partidas SET numeros_usados = v_numeros, estado = 'finalizada', ganador_id = v_ganador, updated_at = NOW() WHERE id = p_partida_id;
    RETURN jsonb_build_object('ok', true, 'bomba', true, 'ganador_id', v_ganador);
  ELSE
    UPDATE partidas SET numeros_usados = v_numeros, turno_actual = CASE WHEN v_partida.host_id = auth.uid() THEN v_partida.guest_id ELSE v_partida.host_id END, updated_at = NOW() WHERE id = p_partida_id;
    RETURN jsonb_build_object('ok', true, 'bomba', false);
  END IF;
END;
$$;

-- 11. Permisos
GRANT EXECUTE ON FUNCTION public.crear_partida TO authenticated;
GRANT EXECUTE ON FUNCTION public.unirse_partida TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_partida TO authenticated;
GRANT EXECUTE ON FUNCTION public.elegir_numero TO authenticated;
