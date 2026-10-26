-- Água: notificação de verdade (Web Push) para beber água. Aplicar no DataGrip, depois da 00.
-- push_inscricao = os aparelhos inscritos (o app grava, só a conta do Victor).
-- push_chave = chaves VAPID e o token do agendamento. A função agua-lembrete gera tudo na 1ª chamada. Sem policy nenhuma:
-- só o banco e a função (chave de serviço) leem, nem a sessão do app enxerga.
-- Agendamento: pg_cron chama a função de hora em hora (no minuto 1) com o token lido da própria tabela (pg_net).
-- A função decide se é hora (10 às 16, casa de hora em hora, presencial e fim de semana de 2 em 2) e se falta água.
-- Rodar de novo não muda nada (o agendamento com o mesmo nome é substituído).
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário nem dentro do comando agendado, tudo entre begin e commit.
begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.push_inscricao (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null check (endpoint like 'https://%'),
  app text not null default 'agua',
  criado timestamptz not null default now(),
  primary key (user_id, endpoint)
);
comment on table public.push_inscricao is 'Notificações: aparelhos inscritos para receber push (endpoint do navegador), por app.';
alter table public.push_inscricao enable row level security;
revoke all on public.push_inscricao from anon;
grant select, insert, update, delete on public.push_inscricao to authenticated;
drop policy if exists push_inscricao_somente_dono on public.push_inscricao;
create policy push_inscricao_somente_dono on public.push_inscricao for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists push_inscricao_somente_victor on public.push_inscricao;
create policy push_inscricao_somente_victor on public.push_inscricao as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

create table if not exists public.push_chave (
  id int primary key check (id = 1),
  publica text not null,
  privada jsonb not null,
  token text not null
);
comment on table public.push_chave is 'Notificações: chaves VAPID e token do agendamento, geradas pela função agua-lembrete. Sem policy: só a chave de serviço lê.';
alter table public.push_chave enable row level security;
revoke all on public.push_chave from anon, authenticated;

select cron.schedule('agua-lembrete', '1 * * * *', $cron$select net.http_post(url := 'https://yzmyncxoskvqzdczaill.supabase.co/functions/v1/agua-lembrete', headers := jsonb_build_object('Content-Type', 'application/json', 'x-agua-token', coalesce((select token from public.push_chave where id = 1), '')), body := '{}'::jsonb)$cron$);

commit;
