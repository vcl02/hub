-- Limites por ciclo saem das colunas de public.fin (migrations 23 e 24) para uma tabela
-- própria, uma linha por ciclo: public.fin_ciclo. O ciclo continua definido pelo lançamento
-- "Faturamento PJ" que o abre (não existe tabela de ciclos); ancora_id aponta para ele e a
-- linha some junto se esse lançamento for excluído. Só guarda ESCOLHAS (tetos, aprovado,
-- garantia); uso de limite, garantia efetiva e gasto do ciclo continuam calculados pelo app.
-- Nulo mantém as regras de antes: Besteira/Isabella = padrão do código; Aprovado/Garantia =
-- herda do ciclo anterior mais próximo com valor (sem nenhum, padrão / todo o guardado).
--
-- Migração segura, para qualquer estado do banco:
--   * 23/24 não aplicadas: só cria a tabela (não há o que copiar nem remover);
--   * 23/24 aplicadas: copia os valores das linhas "Faturamento PJ" e só então remove as
--     colunas (os checks delas caem junto);
--   * se alguma linha que NÃO é "Faturamento PJ" tiver valor nessas colunas (só possível
--     por edição manual, o app nunca grava ali), a migration aborta inteira, sem perder nada,
--     pra revisão manual antes de rodar de novo.
-- Pode rodar de novo: tabela, cópia (on conflict) e remoções são idempotentes.
begin;

create table if not exists public.fin_ciclo (
  ancora_id integer primary key references public.fin(id) on delete cascade,
  limite_besteira numeric(12, 2) check (limite_besteira is null or limite_besteira >= 0),
  limite_isabella numeric(12, 2) check (limite_isabella is null or limite_isabella >= 0),
  limite_aprovado_nubank numeric(12, 2) check (limite_aprovado_nubank is null or limite_aprovado_nubank >= 0),
  limite_aprovado_mp numeric(12, 2) check (limite_aprovado_mp is null or limite_aprovado_mp >= 0),
  limite_garantia_nubank numeric(12, 2) check (limite_garantia_nubank is null or limite_garantia_nubank >= 0)
);

comment on table public.fin_ciclo is
  'Escolhas por ciclo (tetos Besteira/Isabella, aprovado dos cartões, garantia do Nubank). ancora_id = lançamento Faturamento PJ que abre o ciclo.';

do $$
declare
  colunas text[] := array['limite_besteira', 'limite_isabella', 'limite_aprovado_nubank',
                          'limite_aprovado_mp', 'limite_garantia_nubank'];
  existentes int;
  fora_da_ancora int;
begin
  select count(*) into existentes
  from information_schema.columns
  where table_schema = 'public' and table_name = 'fin' and column_name = any (colunas);

  if existentes = 0 then
    raise notice 'fin sem colunas de limite (migrations 23/24 não aplicadas): nada a copiar.';
    return;
  end if;
  if existentes <> 5 then
    raise exception 'fin tem só % das 5 colunas de limite; aplique 23 e 24 inteiras (ou nenhuma) antes desta.', existentes;
  end if;

  execute $sql$
    select count(*) from public.fin
    where trim(coalesce(nome, '')) <> 'Faturamento PJ'
      and coalesce(limite_besteira, limite_isabella, limite_aprovado_nubank,
                   limite_aprovado_mp, limite_garantia_nubank) is not null
  $sql$ into fora_da_ancora;
  if fora_da_ancora > 0 then
    raise exception '% linha(s) fora de "Faturamento PJ" com limite preenchido; revise antes (nada foi alterado).', fora_da_ancora;
  end if;

  execute $sql$
    insert into public.fin_ciclo (ancora_id, limite_besteira, limite_isabella,
                                  limite_aprovado_nubank, limite_aprovado_mp, limite_garantia_nubank)
    select id, limite_besteira, limite_isabella, limite_aprovado_nubank, limite_aprovado_mp, limite_garantia_nubank
    from public.fin
    where trim(coalesce(nome, '')) = 'Faturamento PJ'
      and coalesce(limite_besteira, limite_isabella, limite_aprovado_nubank,
                   limite_aprovado_mp, limite_garantia_nubank) is not null
    on conflict (ancora_id) do nothing
  $sql$;
end $$;

alter table public.fin drop column if exists limite_besteira;
alter table public.fin drop column if exists limite_isabella;
alter table public.fin drop column if exists limite_aprovado_nubank;
alter table public.fin drop column if exists limite_aprovado_mp;
alter table public.fin drop column if exists limite_garantia_nubank;

-- Mesmo acesso de public.fin (migration 20): só o mantenedor grava, contas logadas leem,
-- anônimo nada. O DataGrip usa o papel dono (postgres), que ignora RLS.
alter table public.fin_ciclo enable row level security;

revoke all on table public.fin_ciclo from anon;
grant select, insert, update, delete on table public.fin_ciclo to authenticated;

drop policy if exists fin_ciclo_leitura_autenticada on public.fin_ciclo;
drop policy if exists fin_ciclo_insercao_somente_dono on public.fin_ciclo;
drop policy if exists fin_ciclo_atualizacao_somente_dono on public.fin_ciclo;
drop policy if exists fin_ciclo_exclusao_somente_dono on public.fin_ciclo;

create policy fin_ciclo_leitura_autenticada on public.fin_ciclo
  for select to authenticated
  using (true);

create policy fin_ciclo_insercao_somente_dono on public.fin_ciclo
  for insert to authenticated
  with check ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

create policy fin_ciclo_atualizacao_somente_dono on public.fin_ciclo
  for update to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid)
  with check ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

create policy fin_ciclo_exclusao_somente_dono on public.fin_ciclo
  for delete to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

commit;

notify pgrst, 'reload schema';
