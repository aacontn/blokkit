-- BASE DE LA APLICACIÓN (aplicada 2026-06-11 como app_base_fundas_cursos_crm)
-- Cara colegio: roles por institución + cursos/alumnos + fundas QR + asignación diaria.
-- Cara negocio: cuentas CRM + oportunidades + cotizaciones.
-- (espejo de referencia; el original vive en el historial de migraciones del proyecto)

insert into public.roles (name) values
  ('CLIENT_SUPERVISOR'), ('CLIENT_TEACHER'), ('CLIENT_STUDENT')
on conflict (name) do nothing;

alter table public.tenants add column if not exists kind text not null default 'colegio';
alter table public.tenants add column if not exists comuna text null;
alter table public.tenants add column if not exists contact_name text null;
alter table public.tenants add column if not exists contact_email text null;
alter table public.tenants add column if not exists contact_phone text null;
alter table public.tenants add column if not exists notes text null;
alter table public.tenants drop constraint if exists tenants_kind_check;
alter table public.tenants add constraint tenants_kind_check
  check (kind in ('colegio','universidad','empresa','gobierno','evento','otro'));

create or replace function public.user_role_in_tenant(tenant uuid)
returns text language sql security definer set search_path = public as $$
  select r.name from memberships m join roles r on r.id = m.role_id
  where m.user_id = auth.uid() and m.tenant_id = tenant and m.active = true limit 1;
$$;

create or replace function public.user_can_manage_tenant(tenant uuid)
returns boolean language sql security definer set search_path = public as $$
  select public.is_sys_admin() or public.user_is_internal(tenant)
    or public.user_role_in_tenant(tenant) in ('CLIENT_ADMIN','CLIENT_SUPERVISOR');
$$;

create or replace function public.user_can_operate_tenant(tenant uuid)
returns boolean language sql security definer set search_path = public as $$
  select public.user_can_manage_tenant(tenant)
    or public.user_role_in_tenant(tenant) = 'CLIENT_TEACHER';
$$;

create or replace function public.user_is_member(tenant uuid)
returns boolean language sql security definer set search_path = public as $$
  select public.is_sys_admin() or exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.tenant_id = tenant and m.active = true);
$$;

revoke execute on function public.user_role_in_tenant(uuid) from public, anon;
revoke execute on function public.user_can_manage_tenant(uuid) from public, anon;
revoke execute on function public.user_can_operate_tenant(uuid) from public, anon;
revoke execute on function public.user_is_member(uuid) from public, anon;
grant execute on function public.user_role_in_tenant(uuid) to authenticated;
grant execute on function public.user_can_manage_tenant(uuid) to authenticated;
grant execute on function public.user_can_operate_tenant(uuid) to authenticated;
grant execute on function public.user_is_member(uuid) to authenticated;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  year int not null default extract(year from now())::int,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name, year)
);
create index if not exists courses_tenant_idx on public.courses(tenant_id);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  course_id uuid null references public.courses(id) on delete set null,
  full_name text not null,
  identifier text null,
  active boolean not null default true,
  user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists students_tenant_idx on public.students(tenant_id);
create index if not exists students_course_idx on public.students(course_id);

create table if not exists public.pouches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint pouches_status_check check (status in ('active','lost','retired')),
  unique (tenant_id, code)
);
create index if not exists pouches_tenant_idx on public.pouches(tenant_id);

create table if not exists public.pouch_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pouch_id uuid not null references public.pouches(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  assigned_on date not null default (now() at time zone 'America/Santiago')::date,
  assigned_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (pouch_id, assigned_on),
  unique (student_id, assigned_on)
);
create index if not exists pouch_assignments_tenant_date_idx on public.pouch_assignments(tenant_id, assigned_on);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null references public.tenants(id) on delete set null,
  prospect_name text null,
  stage text not null default 'lead',
  amount numeric null,
  notes text null,
  owner_id uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_stage_check check (stage in ('lead','contactado','propuesta','negociacion','ganado','perdido')),
  constraint deals_target_check check (tenant_id is not null or prospect_name is not null)
);
create trigger set_deals_updated_at before update on public.deals
for each row execute function public.set_updated_at();

create sequence if not exists public.quote_number_seq start 1001;
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  quote_number int not null default nextval('public.quote_number_seq'),
  items jsonb not null default '[]'::jsonb,
  net_total numeric not null default 0,
  status text not null default 'borrador',
  valid_until date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_status_check check (status in ('borrador','enviada','aceptada','rechazada','vencida'))
);
create trigger set_quotes_updated_at before update on public.quotes
for each row execute function public.set_updated_at();

alter table public.courses enable row level security;
alter table public.students enable row level security;
alter table public.pouches enable row level security;
alter table public.pouch_assignments enable row level security;
alter table public.deals enable row level security;
alter table public.quotes enable row level security;

create policy "courses_select_member" on public.courses
for select using (public.user_is_member(tenant_id));
create policy "courses_write_operate" on public.courses
for all using (public.user_can_operate_tenant(tenant_id))
with check (public.user_can_operate_tenant(tenant_id));

create policy "students_select_member" on public.students
for select using (public.user_is_member(tenant_id));
create policy "students_write_operate" on public.students
for all using (public.user_can_operate_tenant(tenant_id))
with check (public.user_can_operate_tenant(tenant_id));

create policy "pouches_select_member" on public.pouches
for select using (public.user_is_member(tenant_id));
create policy "pouches_write_manage" on public.pouches
for all using (public.user_can_manage_tenant(tenant_id))
with check (public.user_can_manage_tenant(tenant_id));

create policy "assignments_select_member" on public.pouch_assignments
for select using (public.user_is_member(tenant_id));
create policy "assignments_write_operate" on public.pouch_assignments
for all using (public.user_can_operate_tenant(tenant_id))
with check (public.user_can_operate_tenant(tenant_id));

create policy "deals_all_sys_admin" on public.deals
for all using (public.is_sys_admin()) with check (public.is_sys_admin());
create policy "quotes_all_sys_admin" on public.quotes
for all using (public.is_sys_admin()) with check (public.is_sys_admin());
