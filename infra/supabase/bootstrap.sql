-- BOOTSTRAP BLOKKIT APP — pegar completo en el SQL Editor del proyecto
-- (equivale a migrations/000_core.sql + migrations/001_tickets.sql)

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

-- ═══════════════ 001_tickets ═══════════════
-- Requires core tables: tenants, roles, memberships, profiles.
create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  node_id uuid null,
  created_by uuid not null references auth.users(id),
  assigned_to uuid null references auth.users(id),
  category text null,
  priority text not null default 'medium',
  status text not null default 'new',
  subject text not null,
  description text null,
  source_channel text not null default 'portal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tickets_status_check check (status in ('new', 'open', 'pending', 'resolved', 'closed')),
  constraint tickets_priority_check check (priority in ('low', 'medium', 'high', 'urgent'))
);

create trigger set_tickets_updated_at
before update on public.tickets
for each row
execute function public.set_updated_at();

create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_user_id uuid not null references auth.users(id),
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  file_url text not null,
  file_name text not null,
  mime_type text null,
  size_bytes bigint null,
  created_at timestamptz not null default now()
);

create index if not exists tickets_tenant_id_idx on public.tickets(tenant_id);
create index if not exists tickets_created_by_idx on public.tickets(created_by);
create index if not exists tickets_assigned_to_idx on public.tickets(assigned_to);
create index if not exists ticket_comments_ticket_id_idx on public.ticket_comments(ticket_id);
create index if not exists attachments_ticket_id_idx on public.attachments(ticket_id);

alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.attachments enable row level security;

create or replace function public.user_is_internal(tenant uuid)
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
      and m.tenant_id = tenant
      and m.active = true
      and r.name in (
        'CLIENT_ADMIN',
        'SYS_ADMIN',
        'SYS_ADMIN_GENERAL',
        'INTERNAL_SUPPORT',
        'INTERNAL_OPERATIONS',
        'INTERNAL_SALES',
        'INTERNAL_ADMIN_ERP'
      )
  );
$$;

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
      )
  );
$$;

create policy "tickets_select_access" on public.tickets
for select
using (
  created_by = auth.uid()
  or assigned_to = auth.uid()
  or public.user_is_internal(tenant_id)
);

create policy "tickets_insert_own" on public.tickets
for insert
with check (
  created_by = auth.uid()
);

create policy "tickets_update_assigned_or_internal" on public.tickets
for update
using (
  assigned_to = auth.uid()
  or public.user_is_internal(tenant_id)
)
with check (
  assigned_to = auth.uid()
  or public.user_is_internal(tenant_id)
);

create policy "ticket_comments_select" on public.ticket_comments
for select
using (
  public.user_can_access_ticket(ticket_id)
  and (is_internal = false or public.user_is_internal(tenant_id))
);

create policy "ticket_comments_insert" on public.ticket_comments
for insert
with check (
  author_user_id = auth.uid()
  and public.user_can_access_ticket(ticket_id)
  and (is_internal = false or public.user_is_internal(tenant_id))
);

create policy "attachments_select" on public.attachments
for select
using (
  public.user_can_access_ticket(ticket_id)
);

create policy "attachments_insert" on public.attachments
for insert
with check (
  owner_user_id = auth.uid()
  and public.user_can_access_ticket(ticket_id)
);
