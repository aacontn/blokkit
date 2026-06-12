-- Registro de envíos de la edge function invite-user (aplicada 2026-06-11):
-- contador diario por proveedor (Resend hasta el umbral, luego failover Brevo).
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  provider text not null,
  kind text not null default 'invite',
  recipient text not null,
  detail text null
);

create index if not exists email_log_sent_at_idx on public.email_log(sent_at);
create index if not exists email_log_provider_idx on public.email_log(provider);

alter table public.email_log enable row level security;

-- la escribe solo la edge function (service role, bypassa RLS);
-- los sys admins pueden mirarla desde el portal a futuro
create policy "email_log_select_sys_admin" on public.email_log
for select using (public.is_sys_admin());
