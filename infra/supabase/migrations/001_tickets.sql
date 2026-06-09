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
