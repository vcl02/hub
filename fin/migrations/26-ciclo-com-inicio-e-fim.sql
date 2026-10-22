-- Os ciclos deixam de ser deduzidos dos lançamentos "Faturamento PJ": cada linha de
-- public.fin_ciclo passa a ser o ciclo, com início e fim próprios. Os lançamentos
-- "Faturamento PJ" continuam em public.fin como entradas comuns; nada mais procura por esse
-- nome. Depois desta migration, criar ou ajustar um ciclo é inserir/editar uma linha de
-- fin_ciclo (DataGrip). Fim vazio = ciclo aberto (o último), até o próximo ser criado.
--
-- Migração dos dados (exige a migration 25 aplicada):
--   1. cada "Faturamento PJ" com data vira um ciclo (linhas que já existiam em fin_ciclo,
--      com os limites, são mantidas e só ganham as datas);
--   2. inicio = data do lançamento; fim = dia anterior ao próximo "Faturamento PJ"; o
--      último fica com fim vazio — exatamente os ciclos que o app calculava até agora;
--   3. só então ancora_id sai e id vira a chave.
-- Aborta inteira, sem alterar nada, se houver duas âncoras na mesma data ou uma linha de
-- fin_ciclo cuja âncora não seja um "Faturamento PJ" com data.
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'fin_ciclo' and column_name = 'ancora_id') then
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'fin_ciclo' and column_name = 'inicio') then
      raise notice 'fin_ciclo já tem inicio/fim: nada a migrar.';
      return;
    end if;
    raise exception 'public.fin_ciclo não encontrada no formato da migration 25; aplique a 25 antes desta.';
  end if;

  if exists (
    select data from public.fin
    where trim(coalesce(nome, '')) = 'Faturamento PJ' and data is not null and cred is not true
    group by data having count(*) > 1
  ) then
    raise exception 'Há dois ou mais "Faturamento PJ" na mesma data; resolva antes (nada foi alterado).';
  end if;

  if exists (
    select 1 from public.fin_ciclo c join public.fin f on f.id = c.ancora_id
    where trim(coalesce(f.nome, '')) <> 'Faturamento PJ' or f.data is null or f.cred is true
  ) then
    raise exception 'fin_ciclo tem linha ligada a lançamento que não é um "Faturamento PJ" com data; revise antes (nada foi alterado).';
  end if;
end $$;

alter table public.fin_ciclo add column if not exists inicio date;
alter table public.fin_ciclo add column if not exists fim date;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'fin_ciclo' and column_name = 'ancora_id') then
    return;   -- já migrada
  end if;

  -- 1. um ciclo por "Faturamento PJ" (mesma regra que o app usava: débito, com data).
  execute $sql$
    insert into public.fin_ciclo (ancora_id)
    select id from public.fin
    where trim(coalesce(nome, '')) = 'Faturamento PJ' and data is not null and cred is not true
    on conflict (ancora_id) do nothing
  $sql$;

  -- 2. início/fim a partir das datas, em ordem: fim = véspera do próximo início.
  execute $sql$
    with ordenados as (
      select c.ancora_id, f.data as inicio,
             lead(f.data) over (order by f.data) - 1 as fim
      from public.fin_ciclo c join public.fin f on f.id = c.ancora_id
    )
    update public.fin_ciclo c
    set inicio = o.inicio, fim = o.fim
    from ordenados o
    where o.ancora_id = c.ancora_id
  $sql$;
end $$;

-- 3. id próprio vira a chave; o vínculo com o lançamento sai (o FK cai junto com a coluna).
alter table public.fin_ciclo add column if not exists id integer generated always as identity;
alter table public.fin_ciclo drop constraint if exists fin_ciclo_pkey;
alter table public.fin_ciclo drop column if exists ancora_id;
alter table public.fin_ciclo add constraint fin_ciclo_pkey primary key (id);

alter table public.fin_ciclo alter column inicio set not null;
alter table public.fin_ciclo drop constraint if exists fin_ciclo_inicio_unico;
alter table public.fin_ciclo add constraint fin_ciclo_inicio_unico unique (inicio);
alter table public.fin_ciclo drop constraint if exists fin_ciclo_fim_depois_do_inicio;
alter table public.fin_ciclo add constraint fin_ciclo_fim_depois_do_inicio check (fim is null or fim >= inicio);
-- Dois ciclos nunca se sobrepõem (fim vazio = sem limite à frente). Usa o operador de
-- intervalo nativo do Postgres, sem extensão.
alter table public.fin_ciclo drop constraint if exists fin_ciclo_sem_sobreposicao;
alter table public.fin_ciclo add constraint fin_ciclo_sem_sobreposicao
  exclude using gist (daterange(inicio, fim, '[]') with &&);

comment on table public.fin_ciclo is
  'Ciclos (inicio/fim; fim vazio = aberto) e as escolhas de cada um: tetos Besteira/Isabella, aprovado dos cartões, garantia do Nubank.';

commit;

notify pgrst, 'reload schema';
