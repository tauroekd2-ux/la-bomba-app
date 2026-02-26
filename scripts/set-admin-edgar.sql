-- Ejecuta en Supabase SQL Editor
-- Marca edgar mind como admin y pone 50000 de saldo

-- 1. Añade columna is_admin si no existe
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- 2. Actualiza el usuario (ajusta el WHERE si el nombre/email es otro)
UPDATE public.profiles
SET is_admin = true, balance = 50000, updated_at = NOW()
WHERE full_name ILIKE '%edgar mind%'
   OR full_name ILIKE '%edgarmind%'
   OR email ILIKE '%edgar%mind%';
