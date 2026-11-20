create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Segredos de servidor (lidos apenas pelas Edge Functions com service role; RLS sem políticas).
create table public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- Assinaturas de notificação push (Windows/Edge/Chrome) por usuário.
create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_own on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.job_runs (
  id bigserial primary key,
  job text not null,
  ran_at timestamptz not null default now(),
  detail jsonb
);
alter table public.job_runs enable row level security;
create policy job_runs_coord on public.job_runs for select to authenticated using (public.app_role() = 'coordenador');

-- ATENÇÃO: valores reais NÃO ficam no repositório. Gere as chaves VAPID com
-- `npx web-push generate-vapid-keys` e um segredo aleatório para o cron.
insert into public.app_secrets (name, value) values
  ('vapid_public', '<VAPID_PUBLIC_KEY>'),
  ('vapid_private', '<VAPID_PRIVATE_KEY>'),
  ('cron_secret', '<CRON_SECRET>');

-- Configurações padrão: lembretes 10:00 e 16:00 (seg-sex) e backup diário às 06:00 (horário de Brasília).
update public.app_settings set data = data || '{"lembretes":["10:00","16:00"],"backupEmail":"ricellesmartins@gmail.com","backupHora":"06:00"}'::jsonb where id = 1;
