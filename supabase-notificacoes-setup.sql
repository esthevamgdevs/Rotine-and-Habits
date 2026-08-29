-- 1) Tabela que já existia para o app funcionar (pule se já criou):
create table if not exists app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table app_state enable row level security;
drop policy if exists "allow all" on app_state;
create policy "allow all" on app_state for all using (true) with check (true);

-- 2) Inscrições de push (uma por aparelho que ativar notificações)
create table if not exists push_subscriptions (
  endpoint text primary key,
  room text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists "allow all" on push_subscriptions;
create policy "allow all" on push_subscriptions for all using (true) with check (true);

-- 3) Controle do que já foi notificado, pra não repetir aviso do mesmo item toda hora
create table if not exists notified_items (
  room text not null,
  item_key text not null,
  notified_on date not null default current_date,
  primary key (room, item_key, notified_on)
);
alter table notified_items enable row level security;
drop policy if exists "allow all" on notified_items;
create policy "allow all" on notified_items for all using (true) with check (true);

-- 4) Extensões necessárias para rodar a checagem periódica
-- No Supabase: Database → Extensions → habilite "pg_cron" e "pg_net"
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 5) Agendamento: roda a cada 15 minutos, chamando a Edge Function "check-pendencias"
-- Troque <PROJECT_REF> pela referência do seu projeto (aparece na Project URL)
-- e <SERVICE_ROLE_KEY> pela Service Role Key (Project Settings → API).
select cron.schedule(
  'check-pendencias-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/check-pendencias',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Para conferir os agendamentos ativos:
-- select * from cron.job;
-- Para remover, se precisar recriar:
-- select cron.unschedule('check-pendencias-15min');
