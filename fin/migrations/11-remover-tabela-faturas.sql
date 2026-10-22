-- Migration para eliminar a tabela 'faturas' e usar somente a coluna 'fatura_venc' (date) na tabela lancamentos.
-- O app passa a derivar as faturas existentes diretamente via DISTINCT da coluna fatura_venc.

-- 1. Garante a coluna fatura_venc na tabela lancamentos
alter table public.lancamentos
  add column if not exists fatura_venc date;

-- 2. Se ainda existirem dados em fatura_id e a tabela faturas existir, migra os vencimentos
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lancamentos' and column_name = 'fatura_id'
  ) and exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'faturas'
  ) then
    update public.lancamentos l
    set fatura_venc = f.vencimento
    from public.faturas f
    where l.fatura_id = f.id and l.fatura_venc is null;
  end if;
end $$;

-- 3. Remove FKs e apaga a tabela faturas
alter table public.lancamentos
  drop constraint if exists lancamentos_fatura_id_fkey;

alter table public.lancamentos
  drop constraint if exists lancamentos_fatura_venc_fkey;

drop table if exists public.faturas cascade;

-- 4. Remove a coluna legada fatura_id da tabela lancamentos (se existir)
alter table public.lancamentos
  drop column if exists fatura_id;

-- 5. Cria o indice de busca e performance para fatura_venc
drop index if exists lancamentos_fatura_id_idx;
create index if not exists lancamentos_fatura_venc_idx
  on public.lancamentos (fatura_venc);
