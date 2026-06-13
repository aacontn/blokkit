-- ═══════════ FASE 3: FINANZAS (aplicada 2026-06-12) ═══════════
-- Facturas (folio manual del SII por ahora), pagos parciales con estado
-- automático, gastos, y vista de saldos para cuentas por cobrar.
-- (espejo de referencia)

create or replace function public.is_finance_user()
returns boolean language sql security definer set search_path = public as $$
  select public.is_sys_admin()
    or exists (
      select 1 from memberships m join roles r on r.id = m.role_id
      where m.user_id = auth.uid() and m.active = true
        and r.name = 'INTERNAL_ADMIN_ERP');
$$;
revoke execute on function public.is_finance_user() from public, anon;
grant execute on function public.is_finance_user() to authenticated;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid null references public.orders(id),
  tenant_id uuid null references public.tenants(id),
  customer_snapshot jsonb not null default '{}'::jsonb,
  folio text null,
  doc_type text not null default 'factura',
  net_total numeric not null default 0,
  iva_total numeric not null default 0,
  grand_total numeric not null default 0,
  issued_at date not null default (now() at time zone 'America/Santiago')::date,
  due_date date null,
  status text not null default 'emitida',
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_doc_type_check check (doc_type in ('factura','boleta','nota_credito','otro')),
  constraint invoices_status_check check (status in ('emitida','pagada','anulada')),
  constraint invoices_totals_integer_check check (
    net_total = trunc(net_total) and iva_total = trunc(iva_total) and grand_total = trunc(grand_total))
);
create index if not exists invoices_tenant_idx on public.invoices(tenant_id);
create index if not exists invoices_status_idx on public.invoices(status);
create trigger set_invoices_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();
alter table public.invoices enable row level security;
create policy "invoices_all_finance" on public.invoices
for all using (public.is_finance_user()) with check (public.is_finance_user());

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric not null,
  paid_at date not null default (now() at time zone 'America/Santiago')::date,
  method text not null default 'transferencia',
  reference text null,
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint payments_amount_check check (amount > 0 and amount = trunc(amount)),
  constraint payments_method_check check (method in ('transferencia','cheque','efectivo','otro'))
);
create index if not exists payments_invoice_idx on public.payments(invoice_id);
create index if not exists payments_paid_at_idx on public.payments(paid_at);
alter table public.payments enable row level security;
create policy "payments_all_finance" on public.payments
for all using (public.is_finance_user()) with check (public.is_finance_user());

create or replace function public.sync_invoice_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invoice_id uuid;
  v_total numeric;
  v_status text;
  v_paid numeric;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  select grand_total, status into v_total, v_status from invoices where id = v_invoice_id;
  if v_status is not null and v_status <> 'anulada' then
    select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = v_invoice_id;
    update invoices
    set status = case when v_paid >= v_total then 'pagada' else 'emitida' end
    where id = v_invoice_id and status <> 'anulada';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.sync_invoice_status() from public, anon, authenticated;
drop trigger if exists payments_sync_invoice on public.payments;
create trigger payments_sync_invoice
after insert or update or delete on public.payments
for each row execute function public.sync_invoice_status();

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default (now() at time zone 'America/Santiago')::date,
  category text not null default 'otros',
  description text not null,
  amount numeric not null,
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint expenses_amount_check check (amount > 0 and amount = trunc(amount)),
  constraint expenses_category_check check (category in ('produccion','logistica','marketing','software','oficina','impuestos','otros'))
);
create index if not exists expenses_date_idx on public.expenses(expense_date);
alter table public.expenses enable row level security;
create policy "expenses_all_finance" on public.expenses
for all using (public.is_finance_user()) with check (public.is_finance_user());

create or replace view public.invoice_balances
with (security_invoker = on) as
select
  i.*,
  coalesce(p.paid, 0) as paid_amount,
  i.grand_total - coalesce(p.paid, 0) as balance,
  case
    when i.status = 'emitida' and i.due_date is not null and i.due_date < current_date
      then (current_date - i.due_date)
    else 0
  end as days_overdue
from public.invoices i
left join lateral (
  select sum(amount) as paid from public.payments where invoice_id = i.id
) p on true;

revoke all on public.invoice_balances from anon, public;
grant select on public.invoice_balances to authenticated;
