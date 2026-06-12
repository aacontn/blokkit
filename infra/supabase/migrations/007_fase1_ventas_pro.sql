-- ═══════════ FASE 1: VENTAS PRO (aplicada 2026-06-12) ═══════════
-- Catálogo, contactos, actividades, historial de etapas, cotizador BK
-- con snapshot/descuento/IVA, y cadena automática aceptada→orden→ganado.
-- (espejo de referencia; el original vive en el historial del proyecto)

create or replace function public.is_crm_user()
returns boolean language sql security definer set search_path = public as $$
  select public.is_sys_admin()
    or exists (
      select 1 from memberships m join roles r on r.id = m.role_id
      where m.user_id = auth.uid() and m.active = true
        and r.name in ('INTERNAL_SALES', 'INTERNAL_ADMIN_ERP'));
$$;
revoke execute on function public.is_crm_user() from public, anon;
grant execute on function public.is_crm_user() to authenticated;

create policy "deals_all_crm" on public.deals
for all using (public.is_crm_user()) with check (public.is_crm_user());
create policy "quotes_all_crm" on public.quotes
for all using (public.is_crm_user()) with check (public.is_crm_user());

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text null,
  unit text not null default 'unidad',
  unit_price numeric not null default 0,
  footnote text null,
  sort int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint products_price_integer_check check (unit_price = trunc(unit_price))
);
alter table public.products enable row level security;
create policy "products_select_crm" on public.products
for select using (public.is_crm_user());
create policy "products_write_sys_admin" on public.products
for all using (public.is_sys_admin()) with check (public.is_sys_admin());

insert into public.products (name, description, unit, unit_price, footnote, sort) values
  ('Funda BloKKit con bloqueo de señal', 'Funda con cierre magnético y QR de trazabilidad', 'unidad', 14990, 'Personalización con logo institucional (estampado DTF) incluida.', 10),
  ('Unidad de Desbloqueo Manual con soporte de muro', 'Dock de apertura magnética para instalación fija', 'unidad', 38000, null, 20),
  ('Unidad de Desbloqueo Smart con registro QR', 'Dock con registro de uso por persona', 'unidad', 35000, null, 30),
  ('Capacitación Apoderados y/o Cuerpo Docente', 'Sesión de capacitación presencial u online', 'sesión', 100000, null, 40),
  ('Acceso a Software de Gestión', 'Portal BloKKit: asignación QR, registro y soporte', 'licencia', 0, 'Incluido con la implementación.', 50)
on conflict (name) do nothing;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  role_title text null,
  email text null,
  phone text null,
  is_primary boolean not null default false,
  notes text null,
  created_at timestamptz not null default now()
);
create index if not exists contacts_tenant_idx on public.contacts(tenant_id);
alter table public.contacts enable row level security;
create policy "contacts_all_crm" on public.contacts
for all using (public.is_crm_user()) with check (public.is_crm_user());

create table if not exists public.deal_activities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  kind text not null default 'nota',
  body text not null,
  next_step text null,
  next_step_date date null,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint deal_activities_kind_check check (kind in ('llamada','reunion','correo','whatsapp','nota'))
);
create index if not exists deal_activities_deal_idx on public.deal_activities(deal_id);
alter table public.deal_activities enable row level security;
create policy "deal_activities_all_crm" on public.deal_activities
for all using (public.is_crm_user()) with check (public.is_crm_user());

create table if not exists public.deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  from_stage text null,
  to_stage text not null,
  changed_by uuid null,
  changed_at timestamptz not null default now()
);
create index if not exists deal_stage_history_deal_idx on public.deal_stage_history(deal_id);
alter table public.deal_stage_history enable row level security;
create policy "deal_stage_history_select_crm" on public.deal_stage_history
for select using (public.is_crm_user());

create or replace function public.log_deal_stage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    insert into deal_stage_history (deal_id, from_stage, to_stage, changed_by)
    values (new.id, old.stage, new.stage, auth.uid());
  end if;
  return new;
end;
$$;
revoke execute on function public.log_deal_stage() from public, anon, authenticated;
drop trigger if exists deals_stage_history on public.deals;
create trigger deals_stage_history
after update of stage on public.deals
for each row execute function public.log_deal_stage();

alter table public.quotes add column if not exists discount_type text not null default 'none';
alter table public.quotes add column if not exists discount_value numeric not null default 0;
alter table public.quotes add column if not exists include_iva boolean not null default true;
alter table public.quotes add column if not exists client_snapshot jsonb not null default '{}'::jsonb;
alter table public.quotes add column if not exists conditions text null;
alter table public.quotes add column if not exists sent_at timestamptz null;
alter table public.quotes add column if not exists sent_to text null;
alter table public.quotes drop constraint if exists quotes_discount_type_check;
alter table public.quotes add constraint quotes_discount_type_check
  check (discount_type in ('none','percent','amount'));

-- numeración BK continua: la última cotización real emitida fue BK1242
select setval('public.quote_number_seq', 1242, true);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid null references public.quotes(id) unique,
  deal_id uuid null references public.deals(id),
  tenant_id uuid null references public.tenants(id),
  customer_snapshot jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  net_total numeric not null default 0,
  iva_total numeric not null default 0,
  grand_total numeric not null default 0,
  status text not null default 'confirmada',
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint orders_status_check check (status in ('confirmada','despachada','completada','anulada')),
  constraint orders_totals_integer_check check (
    net_total = trunc(net_total) and iva_total = trunc(iva_total) and grand_total = trunc(grand_total))
);
alter table public.orders enable row level security;
create policy "orders_all_crm" on public.orders
for all using (public.is_crm_user()) with check (public.is_crm_user());

create or replace function public.on_quote_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_deal deals%rowtype;
  v_iva numeric;
begin
  if new.status = 'aceptada' and old.status is distinct from new.status then
    select * into v_deal from deals where id = new.deal_id;
    v_iva := case when new.include_iva then round(new.net_total * 0.19) else 0 end;
    insert into orders (quote_id, deal_id, tenant_id, customer_snapshot, items, net_total, iva_total, grand_total, created_by)
    values (new.id, new.deal_id, v_deal.tenant_id, new.client_snapshot, new.items, new.net_total, v_iva, new.net_total + v_iva, auth.uid())
    on conflict (quote_id) do nothing;
    update deals set stage = 'ganado' where id = new.deal_id and stage <> 'ganado';
    if v_deal.tenant_id is not null then
      update tenants set is_customer = true where id = v_deal.tenant_id and is_customer = false;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.on_quote_accepted() from public, anon, authenticated;
drop trigger if exists quotes_accepted_chain on public.quotes;
create trigger quotes_accepted_chain
after update of status on public.quotes
for each row execute function public.on_quote_accepted();
