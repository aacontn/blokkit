-- ═══════════ FASE 0: cimientos + captura de leads (aplicada 2026-06-12) ═══════════

-- 1) FKs que faltaban (tablas de tickets sin referencia a tenants)
alter table public.tickets
  add constraint tickets_tenant_fk foreign key (tenant_id) references public.tenants(id);
alter table public.ticket_comments
  add constraint ticket_comments_tenant_fk foreign key (tenant_id) references public.tenants(id);
alter table public.attachments
  add constraint attachments_tenant_fk foreign key (tenant_id) references public.tenants(id);

-- 2) separar cuenta-CRM (prospecto) de cliente operativo
alter table public.tenants add column if not exists is_customer boolean not null default true;

-- 3) inventario global desbloqueado: fundas sin tenant = bodega central BloKKit
alter table public.pouches alter column tenant_id drop not null;

-- 4) convención CLP enteros en montos comerciales
alter table public.deals add constraint deals_amount_integer_check
  check (amount is null or amount = trunc(amount));
alter table public.quotes add constraint quotes_net_total_integer_check
  check (net_total = trunc(net_total));

-- 5) deals listos para leads del sitio y forecast
alter table public.deals add column if not exists source text not null default 'manual';
alter table public.deals add column if not exists contact_name text null;
alter table public.deals add column if not exists contact_email text null;
alter table public.deals add column if not exists contact_phone text null;
alter table public.deals add column if not exists expected_close_date date null;
alter table public.deals drop constraint if exists deals_source_check;
alter table public.deals add constraint deals_source_check
  check (source in ('manual','web','whatsapp','feria','referido','otro'));

create index if not exists deals_stage_idx on public.deals(stage);
create index if not exists deals_source_idx on public.deals(source);
