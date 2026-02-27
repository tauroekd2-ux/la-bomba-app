-- Borrar usuario Maromas (id: 33a43bce-61f0-40c2-986c-a83b51c47578)
-- Ejecutar en Supabase → SQL Editor.
-- Si falla "permission denied" en auth.users, borra desde Dashboard: Authentication → Users → Maromas → ⋮ → Delete user.

DO $$
DECLARE
  v_id UUID := '33a43bce-61f0-40c2-986c-a83b51c47578';
BEGIN
  DELETE FROM public.telegram_link_tokens WHERE user_id = v_id;
  DELETE FROM public.deposit_notifications WHERE user_id = v_id;
  DELETE FROM public.transacciones WHERE user_id = v_id;
  DELETE FROM public.retiros_phantom WHERE user_id = v_id;
  DELETE FROM public.confirmaciones_deposito WHERE user_id = v_id;
  DELETE FROM public.chat_mensajes WHERE sender_id = v_id OR receiver_id = v_id;
  DELETE FROM public.matchmaking_queue WHERE user_id = v_id;
  DELETE FROM public.transacciones_phantom WHERE user_id = v_id;
  DELETE FROM public.partidas WHERE host_id = v_id OR guest_id = v_id;
  DELETE FROM public.admin_roles WHERE user_id = v_id;
  DELETE FROM public.profiles WHERE id = v_id;
  DELETE FROM auth.users WHERE id = v_id;
  RAISE NOTICE 'Usuario Maromas borrado.';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error: %. Si es permission denied en auth.users, borra desde Dashboard → Authentication → Users → Maromas → Delete.', SQLERRM;
END $$;
