-- Hardening según security advisors de Supabase (aplicado 2026-06-11):
-- 1) search_path fijo en set_updated_at (solo usa now(), no necesita schemas)
alter function public.set_updated_at() set search_path = '';

-- 2) funciones SECURITY DEFINER fuera del alcance RPC de clientes.
--    handle_new_user: solo la dispara el trigger de auth — ningún cliente debe llamarla.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

--    rls_auto_enable: helper interno preexistente del proyecto, no es API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

--    user_is_internal / user_can_access_ticket: las policies RLS las evalúan
--    con el rol del usuario → authenticated DEBE conservar execute;
--    anon no (auth.uid() es null para anon, no tiene uso legítimo).
--    Los 2 WARN que el advisor sigue mostrando para authenticated en estas
--    dos funciones son intencionales: devuelven booleanos derivados de auth.uid().
revoke execute on function public.user_is_internal(uuid) from public, anon;
grant execute on function public.user_is_internal(uuid) to authenticated;

revoke execute on function public.user_can_access_ticket(uuid) from public, anon;
grant execute on function public.user_can_access_ticket(uuid) to authenticated;
