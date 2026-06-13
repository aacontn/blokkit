-- ═══════════ FASE 2: OPERACIONES (aplicada 2026-06-12) ═══════════
-- Bodega central (pouches con tenant null), despachos ligados a órdenes,
-- e implementaciones por colegio con hitos. (espejo de referencia)

create or replace function public.is_internal_user()
returns boolean language sql security definer set search_path = public as $$
  select public.is_sys_admin()
    or exists (
      select 1 from memberships m join roles r on r.id = m.role_id
      where m.user_id = auth.uid() and m.active = true
        and r.name like 'INTERNAL\_%');
$$;
revoke execute on function public.is_internal_user() from public, anon;
grant execute on function public.is_internal_user() to authenticated;

create policy "orders_all_internal" on public.orders
for all using (public.is_internal_user()) with check (public.is_internal_user());

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid null references public.orders(id),
  tenant_id uuid not null references public.tenants(id),
  status text not null default 'preparacion',
  items jsonb not null default '[]'::jsonb,
  carrier text null,
  tracking text null,
  shipped_at timestamptz null,
  received_at timestamptz null,
  received_by text null,
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint shipments_status_check check (status in ('preparacion','despachado','recibido','anulado'))
);
create index if not exists shipments_tenant_idx on public.shipments(tenant_id);
create index if not exists shipments_order_idx on public.shipments(order_id);
alter table public.shipments enable row level security;
create policy "shipments_all_internal" on public.shipments
for all using (public.is_internal_user()) with check (public.is_internal_user());

create table if not exists public.implementations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid null references public.orders(id),
  status text not null default 'kickoff',
  start_date date null,
  golive_date date null,
  owner_id uuid null references auth.users(id),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint implementations_status_check
    check (status in ('kickoff','piloto','capacitacion','golive','operando','pausado'))
);
create index if not exists implementations_tenant_idx on public.implementations(tenant_id);
create trigger set_implementations_updated_at
before update on public.implementations
for each row execute function public.set_updated_at();
alter table public.implementations enable row level security;
create policy "implementations_all_internal" on public.implementations
for all using (public.is_internal_user()) with check (public.is_internal_user());

create table if not exists public.implementation_milestones (
  id uuid primary key default gen_random_uuid(),
  implementation_id uuid not null references public.implementations(id) on delete cascade,
  title text not null,
  due_date date null,
  done boolean not null default false,
  done_at timestamptz null,
  sort int not null default 100,
  created_at timestamptz not null default now()
);
create index if not exists impl_milestones_impl_idx on public.implementation_milestones(implementation_id);
alter table public.implementation_milestones enable row level security;
create policy "impl_milestones_all_internal" on public.implementation_milestones
for all using (public.is_internal_user()) with check (public.is_internal_user());
