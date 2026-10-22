-- Histórico de mudanças: toda inserção, alteração e exclusão em public.fin e
-- public.fin_ciclo grava uma linha em public.fin_historico com a linha antes e depois
-- (jsonb), quem fez (auth.uid(); vazio = DataGrip/papel dono, que não passa pelo login) e
-- quando. Serve pra achar e desfazer à mão um clique errado ou um bug que apagou ou
-- sobrescreveu valores — hoje não há trilha nenhuma no banco.
-- Só o trigger escreve (função SECURITY DEFINER): nenhuma conta insere, edita ou apaga o
-- histórico pela API. Leitura só do mantenedor (traz valores antigos; a conta restrita não
-- precisa). Anônimo não acessa nada, como em fin (migration 20).
-- Não altera nenhuma linha de fin nem de fin_ciclo e não muda nada no app.
begin;

create table if not exists public.fin_historico (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  tabela text not null,
  operacao text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  linha_id integer,
  usuario uuid,
  antes jsonb,
  depois jsonb
);

-- Consulta típica: "o que aconteceu com o lançamento 5251?", do mais recente pro mais antigo.
create index if not exists fin_historico_por_linha on public.fin_historico (tabela, linha_id, em desc);

-- search_path vazio: nada resolve por um objeto homônimo criado em outro schema.
create or replace function public.registrar_historico() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linha_antes jsonb;
  linha_depois jsonb;
begin
  if tg_op <> 'INSERT' then linha_antes := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then linha_depois := to_jsonb(new); end if;
  -- UPDATE que não muda nada (PATCH repetido com o mesmo valor) não polui o histórico.
  if tg_op = 'UPDATE' and linha_antes = linha_depois then return null; end if;
  insert into public.fin_historico (tabela, operacao, linha_id, usuario, antes, depois)
  values (tg_table_name, tg_op, (coalesce(linha_depois, linha_antes) ->> 'id')::integer,
          auth.uid(), linha_antes, linha_depois);
  return null;   -- trigger AFTER: o retorno é ignorado
end;
$$;

-- Só dispara como trigger; não fica exposta como RPC pela API.
revoke execute on function public.registrar_historico() from public, anon, authenticated;

drop trigger if exists fin_historico on public.fin;
create trigger fin_historico
  after insert or update or delete on public.fin
  for each row execute function public.registrar_historico();

drop trigger if exists fin_ciclo_historico on public.fin_ciclo;
create trigger fin_ciclo_historico
  after insert or update or delete on public.fin_ciclo
  for each row execute function public.registrar_historico();

alter table public.fin_historico enable row level security;

revoke all on table public.fin_historico from anon, authenticated;
grant select on table public.fin_historico to authenticated;

drop policy if exists fin_historico_leitura_somente_dono on public.fin_historico;
create policy fin_historico_leitura_somente_dono on public.fin_historico
  for select to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);
-- Sem policy de INSERT/UPDATE/DELETE: pela API, o histórico é só leitura (e só do dono).

commit;

notify pgrst, 'reload schema';
