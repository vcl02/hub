-- Lembrete de escovar os dentes: 20 min depois de lançar comida no Alimentação, uma notificação de verdade (o mesmo push
-- da Água, função agua-lembrete). Aplicar no DataGrip, depois da 01.
-- push_agendado = o próximo lembrete de cada tipo (1 por tipo). Comida nova de hoje em al_registro (só inserção, nunca a
-- mudança de porções nem um dia passado) marca o de "dentes" para 20 min depois. Outra comida antes disso empurra para 20
-- min depois da última: uma notificação por refeição.
-- push_ultimo = o último lembrete mandado. O push vai sem conteúdo, então o service worker pergunta à função qual foi para
-- mostrar o texto certo (água ou dentes).
-- Agendamento: pg_cron de minuto em minuto. Lembrete vencido sai da fila e chama a função com o token de push_chave.
-- Sem policy nas duas tabelas: só o banco e a função (chave de serviço) leem e gravam.
-- Rodar de novo não muda nada (o agendamento com o mesmo nome é substituído).
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário nem dentro do comando agendado, tudo entre begin e commit.
begin;

create table if not exists public.push_agendado (
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('dentes')),
  enviar_em timestamptz not null,
  primary key (user_id, tipo)
);
comment on table public.push_agendado is 'Notificações: o próximo lembrete agendado de cada tipo (dentes: 20 min depois da última comida lançada).';
alter table public.push_agendado enable row level security;
revoke all on public.push_agendado from anon, authenticated;

create table if not exists public.push_ultimo (
  id int primary key check (id = 1),
  tipo text not null,
  em timestamptz not null default now()
);
comment on table public.push_ultimo is 'Notificações: o último lembrete mandado (o service worker pergunta à função para mostrar o texto certo).';
alter table public.push_ultimo enable row level security;
revoke all on public.push_ultimo from anon, authenticated;

-- Comida nova de hoje (pelo dia de São Paulo) agenda o lembrete dos dentes para 20 min depois
create or replace function public.agendar_dentes() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.data = (now() at time zone 'America/Sao_Paulo')::date then
    insert into public.push_agendado (user_id, tipo, enviar_em) values (new.user_id, 'dentes', now() + interval '20 minutes')
    on conflict (user_id, tipo) do update set enviar_em = excluded.enviar_em;
  end if;
  return null;
end;
$$;
revoke execute on function public.agendar_dentes() from public, anon, authenticated;
drop trigger if exists agendar_dentes on public.al_registro;
create trigger agendar_dentes after insert on public.al_registro for each row execute function public.agendar_dentes();

select cron.schedule('dentes-lembrete', '* * * * *', $cron$with vencido as (delete from public.push_agendado where tipo = 'dentes' and enviar_em <= now() returning 1) select net.http_post(url := 'https://yzmyncxoskvqzdczaill.supabase.co/functions/v1/agua-lembrete', headers := jsonb_build_object('Content-Type', 'application/json', 'x-agua-token', coalesce((select token from public.push_chave where id = 1), '')), body := '{"tipo":"dentes"}'::jsonb) from (select 1 from vencido limit 1) v$cron$);

commit;
