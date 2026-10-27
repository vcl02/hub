-- Histórico de mudanças dos apps do hub (o Fin já tem o dele, fin_historico): toda inserção, alteração e exclusão em
-- agua_dia, corpo_dia, corpo_medida, al_dia, al_item, al_registro, tr_treino, tr_registro, tr_exercicio e tr_variacao grava
-- uma linha em public.hub_historico com a linha antes e depois (jsonb), quem fez (auth.uid()) e quando.
-- Serve pra achar e desfazer qualquer apagão ou sobrescrita (como o de 27/10/2026, quando uma cópia velha do celular
-- apagou a água do dia): a linha antiga fica guardada aqui, inteira.
-- Só o gatilho escreve (função SECURITY DEFINER): nenhuma conta insere, edita ou apaga o histórico pela API. Leitura só do
-- Victor. Não altera nenhuma linha das tabelas e não muda nada nos apps. Aplicar no DataGrip.
-- Rodar de novo não muda nada (if not exists e os gatilhos são recriados).
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

create table if not exists public.hub_historico (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  tabela text not null,
  operacao text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  chave text,
  usuario uuid,
  antes jsonb,
  depois jsonb
);
comment on table public.hub_historico is 'Hub: histórico de mudanças das tabelas dos apps (antes e depois de cada linha), gravado só por gatilho.';
create index if not exists hub_historico_por_chave on public.hub_historico (tabela, chave, em desc);

-- chave = o que identifica a linha no app: id (al_item, al_registro, tr_*) ou data (dias e medidas)
create or replace function public.registrar_historico_hub() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linha_antes jsonb;
  linha_depois jsonb;
  linha jsonb;
begin
  if tg_op <> 'INSERT' then linha_antes := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then linha_depois := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and linha_antes = linha_depois then return null; end if;
  linha := coalesce(linha_depois, linha_antes);
  insert into public.hub_historico (tabela, operacao, chave, usuario, antes, depois)
  values (tg_table_name, tg_op, coalesce(linha ->> 'id', linha ->> 'data'), auth.uid(), linha_antes, linha_depois);
  return null;
end;
$$;
revoke execute on function public.registrar_historico_hub() from public, anon, authenticated;

drop trigger if exists hub_historico on public.agua_dia;
create trigger hub_historico after insert or update or delete on public.agua_dia for each row execute function public.registrar_historico_hub();
drop trigger if exists hub_historico on public.corpo_dia;
create trigger hub_historico after insert or update or delete on public.corpo_dia for each row execute function public.registrar_historico_hub();
drop trigger if exists hub_historico on public.corpo_medida;
create trigger hub_historico after insert or update or delete on public.corpo_medida for each row execute function public.registrar_historico_hub();
drop trigger if exists hub_historico on public.al_dia;
create trigger hub_historico after insert or update or delete on public.al_dia for each row execute function public.registrar_historico_hub();
drop trigger if exists hub_historico on public.al_item;
create trigger hub_historico after insert or update or delete on public.al_item for each row execute function public.registrar_historico_hub();
drop trigger if exists hub_historico on public.al_registro;
create trigger hub_historico after insert or update or delete on public.al_registro for each row execute function public.registrar_historico_hub();
drop trigger if exists hub_historico on public.tr_treino;
create trigger hub_historico after insert or update or delete on public.tr_treino for each row execute function public.registrar_historico_hub();
drop trigger if exists hub_historico on public.tr_registro;
create trigger hub_historico after insert or update or delete on public.tr_registro for each row execute function public.registrar_historico_hub();
drop trigger if exists hub_historico on public.tr_exercicio;
create trigger hub_historico after insert or update or delete on public.tr_exercicio for each row execute function public.registrar_historico_hub();
drop trigger if exists hub_historico on public.tr_variacao;
create trigger hub_historico after insert or update or delete on public.tr_variacao for each row execute function public.registrar_historico_hub();

alter table public.hub_historico enable row level security;
revoke all on public.hub_historico from anon, authenticated;
grant select on public.hub_historico to authenticated;
drop policy if exists hub_historico_so_victor on public.hub_historico;
create policy hub_historico_so_victor on public.hub_historico for select to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

commit;
