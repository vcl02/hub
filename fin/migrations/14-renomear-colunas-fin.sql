-- Renomeia colunas de `fin` para nomes curtos sem copiar ou alterar os valores financeiros existentes.
-- O bloco tolera reaplicação, mas interrompe se encontrar um schema ambíguo ou inesperado.
do $$
begin
  if to_regclass('public.fin') is null then
    raise exception 'Tabela esperada public.fin não encontrada';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fin' and column_name = 'fatura_venc'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fin' and column_name = 'fatura'
  ) then
    alter table public.fin rename column fatura_venc to fatura;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fin' and column_name = 'fatura_venc'
  ) then
    raise exception 'As colunas public.fin.fatura_venc e public.fin.fatura existem; revise antes de renomear';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fin' and column_name = 'reserva_emergencia'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fin' and column_name = 'reserva'
  ) then
    alter table public.fin rename column reserva_emergencia to reserva;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fin' and column_name = 'reserva_emergencia'
  ) then
    raise exception 'As colunas public.fin.reserva_emergencia e public.fin.reserva existem; revise antes de renomear';
  end if;

  if to_regclass('public.fin_fatura_venc_idx') is not null and to_regclass('public.fin_fatura_idx') is null then
    alter index public.fin_fatura_venc_idx rename to fin_fatura_idx;
  end if;
end $$;

-- Faz o PostgREST enxergar os novos nomes imediatamente após a migration.
notify pgrst, 'reload schema';
