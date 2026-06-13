-- Costos y márgenes + atribución UTM (aplicada 2026-06-12, espejo)

alter table public.products add column if not exists unit_cost numeric not null default 0;
alter table public.products drop constraint if exists products_cost_integer_check;
alter table public.products add constraint products_cost_integer_check
  check (unit_cost = trunc(unit_cost) and unit_cost >= 0);

update public.products set unit_cost = 6500 where name like 'Funda BloKKit%' and unit_cost = 0;
update public.products set unit_cost = 18000 where name like 'Unidad de Desbloqueo Manual%' and unit_cost = 0;
update public.products set unit_cost = 15000 where name like 'Unidad de Desbloqueo Smart%' and unit_cost = 0;

alter table public.deals add column if not exists utm jsonb null;
