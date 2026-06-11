-- Core: tenants, roles, memberships, profiles (requeridas por 001_tickets.sql)
-- Diseñado para el portal BloKKit "de cero": crea un tenant por defecto y
-- un trigger que da perfil + membresía CLIENT_USER a cada usuario nuevo.
create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into public.roles (name) values
  ('CLIENT_USER'),
  ('CLIENT_ADMIN'),
  ('SYS_ADMIN'),
  ('SYS_ADMIN_GENERAL'),
  ('INTERNAL_SUPPORT'),
  ('INTERNAL_OPERATIONS'),
  ('INTERNAL_SALES'),
  ('INTERNAL_ADMIN_ERP')
on conflict (name) do nothing;

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id)
);

-- la app lee profiles por id = auth user id (ver apps/app/src/lib/profile.ts)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  full_name text null,
  email text null,
  created_at timestamptz not null default now()
);

create index if not exists memberships_user_id_idx on public.memberships(user_id);
create index if not exists memberships_tenant_id_idx on public.memberships(tenant_id);
create index if not exists profiles_tenant_id_idx on public.profiles(tenant_id);

-- tenant por defecto: todo usuario nuevo cae aquí hasta que se gestione multi-tenant
insert into public.tenants (id, name)
values ('00000000-0000-0000-0000-000000000001', 'BloKKit')
on conflict (id) do nothing;

-- perfil + membresía automáticos al registrarse (magic link crea el usuario)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, tenant_id, full_name, email)
  values (
    new.id,
    '00000000-0000-0000-0000-000000000001',
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;

  insert into public.memberships (user_id, tenant_id, role_id, active)
  select new.id, '00000000-0000-0000-0000-000000000001', r.id, true
  from public.roles r
  where r.name = 'CLIENT_USER'
  on conflict (user_id, tenant_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS
alter table public.tenants enable row level security;
alter table public.roles enable row level security;
alter table public.memberships enable row level security;
alter table public.profiles enable row level security;

-- memberships: cada uno ve las suyas (sin auto-referencia → sin recursión)
create policy "memberships_select_own" on public.memberships
for select using (user_id = auth.uid());

-- roles: legibles por usuarios autenticados
create policy "roles_select_authenticated" on public.roles
for select using (auth.role() = 'authenticated');

-- tenants: visibles para sus miembros
create policy "tenants_select_member" on public.tenants
for select using (
  id in (
    select m.tenant_id from public.memberships m
    where m.user_id = auth.uid() and m.active
  )
);

-- profiles: el propio + los del mismo tenant (las vistas admin listan el equipo)
create policy "profiles_select_own_or_same_tenant" on public.profiles
for select using (
  id = auth.uid()
  or tenant_id in (
    select m.tenant_id from public.memberships m
    where m.user_id = auth.uid() and m.active
  )
);

create policy "profiles_update_own" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

-- Storage: bucket privado para adjuntos de tickets (apps/app/src/lib/upload.ts)
insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;

create policy "ticket_attachments_insert_auth" on storage.objects
for insert to authenticated
with check (bucket_id = 'ticket-attachments');

create policy "ticket_attachments_select_auth" on storage.objects
for select to authenticated
using (bucket_id = 'ticket-attachments');
