-- Migration para transformar o campo 'vencimento' (date) na Primary Key da tabela faturas
-- e remover a coluna 'id', atualizando a FK em lancamentos para 'fatura_venc' (date).

-- 1. Remove a FK existente de lancamentos -> faturas
alter table public.lancamentos
  drop constraint if exists lancamentos_fatura_id_fkey;

-- 2. Adiciona a nova coluna fatura_venc (date) na tabela lancamentos
alter table public.lancamentos
  add column if not exists fatura_venc date;

-- 3. Se houver lancamentos com fatura_id antigo, migra o vencimento da tabela faturas
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lancamentos' and column_name = 'fatura_id'
  ) then
    update public.lancamentos l
    set fatura_venc = f.vencimento
    from public.faturas f
    where l.fatura_id = f.id and l.fatura_venc is null;

    alter table public.lancamentos drop column fatura_id;
  end if;
end $$;

-- 4. Altera a chave primaria da tabela faturas para 'vencimento' e remove o 'id'
alter table public.faturas
  drop constraint if exists faturas_pkey cascade;

alter table public.faturas
  drop column if exists id cascade;

alter table public.faturas
  add primary key (vencimento);

-- 5. Recria a Foreign Key apontando de lancamentos(fatura_venc) para faturas(vencimento)
alter table public.lancamentos
  add constraint lancamentos_fatura_venc_fkey
  foreign key (fatura_venc)
  references public.faturas (vencimento)
  on update cascade
  on delete restrict;

-- 6. Recria o indice de performance
drop index if exists lancamentos_fatura_id_idx;
create index if not exists lancamentos_fatura_venc_idx
  on public.lancamentos (fatura_venc);
