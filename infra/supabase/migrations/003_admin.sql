-- Administración del negocio (aplicada 2026-06-11 como admin_sys_role_invite_metadata):
-- rol global SYS_ADMIN(_GENERAL) de BloKKit que ve/gestiona todos los tenants,
-- + el trigger de signup respeta colegio/rol que viaja en la invitación.

-- 1) chequeo de admin global (BloKKit interno)
create or replace function public.is_sys_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from memberships m
    join roles r on r.id = m.role_id
    where m.user_id = auth.uid()
      and m.active = true
      and r.name in ('SYS_ADMIN', 'SYS_ADMIN_GENERAL')
  );
$$;

revoke execute on function public.is_sys_admin() from public, anon;
grant execute on function public.is_sys_admin() to authenticated;

-- 2) acceso a tickets: sys admin entra transversalmente (comments/attachments
--    heredan vía user_can_access_ticket)
create or replace function public.user_can_access_ticket(ticket_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from tickets t
    where t.id = ticket_id
      and (
        t.created_by = auth.uid()
        or t.assigned_to = auth.uid()
        or public.user_is_internal(t.tenant_id)
        or public.is_sys_admin()
      )
  );
$$;

-- 3) policies adicionales para administración global (se OR-ean con las existentes)
create policy "tenants_select_sys_admin" on public.tenants
for select using (public.is_sys_admin());

create policy "tenants_insert_sys_admin" on public.tenants
for insert with check (public.is_sys_admin());

create policy "tenants_update_sys_admin" on public.tenants
for update using (public.is_sys_admin()) with check (public.is_sys_admin());

create policy "profiles_select_sys_admin" on public.profiles
for select using (public.is_sys_admin());

create policy "memberships_select_sys_admin" on public.memberships
for select using (public.is_sys_admin());

create policy "memberships_update_sys_admin" on public.memberships
for update using (public.is_sys_admin()) with check (public.is_sys_admin());

create policy "tickets_select_sys_admin" on public.tickets
for select using (public.is_sys_admin());

create policy "tickets_update_sys_admin" on public.tickets
for update using (public.is_sys_admin()) with check (public.is_sys_admin());

-- 4) trigger de signup con metadata de invitación (tenant_id / role_name)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_role_id uuid;
begin
  v_tenant := coalesce(
    nullif(new.raw_user_meta_data->>'tenant_id', '')::uuid,
    '00000000-0000-0000-0000-000000000001'
  );
  if not exists (select 1 from public.tenants t where t.id = v_tenant) then
    v_tenant := '00000000-0000-0000-0000-000000000001';
  end if;

  select id into v_role_id
  from public.roles
  where name = coalesce(nullif(new.raw_user_meta_data->>'role_name', ''), 'CLIENT_USER');
  if v_role_id is null then
    select id into v_role_id from public.roles where name = 'CLIENT_USER';
  end if;

  insert into public.profiles (id, tenant_id, full_name, email)
  values (
    new.id,
    v_tenant,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;

  insert into public.memberships (user_id, tenant_id, role_id, active)
  values (new.id, v_tenant, v_role_id, true)
  on conflict (user_id, tenant_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 5) promover al fundador (id del primer usuario real del proyecto)
update public.memberships m
set role_id = (select id from public.roles where name = 'SYS_ADMIN_GENERAL')
where m.user_id = 'b20b237d-827a-4a8a-ad7c-0fdc2d551605';
