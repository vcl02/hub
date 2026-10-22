-- Renomeia a tabela técnica para acompanhar o nome atual do projeto sem copiar ou alterar registros.
-- Dependências por OID, como grants, RLS e chaves estrangeiras, permanecem ligadas ao mesmo objeto.
do $$
begin
  if to_regclass('public.lancamentos') is not null and to_regclass('public.fin') is null then
    alter table public.lancamentos rename to fin;
  elsif to_regclass('public.lancamentos') is null and to_regclass('public.fin') is null then
    raise exception 'Tabela esperada public.lancamentos não encontrada';
  elsif to_regclass('public.lancamentos') is not null then
    raise exception 'As tabelas public.lancamentos e public.fin existem; revise antes de renomear';
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.fin'::regclass and conname = 'lancamentos_2_pkey'
  ) then
    alter table public.fin rename constraint lancamentos_2_pkey to fin_pkey;
  end if;

  if to_regclass('public.lancamentos_id_seq') is not null and to_regclass('public.fin_id_seq') is null then
    alter sequence public.lancamentos_id_seq rename to fin_id_seq;
  end if;

  if to_regclass('public.lancamentos_fatura_venc_idx') is not null and to_regclass('public.fin_fatura_venc_idx') is null then
    alter index public.lancamentos_fatura_venc_idx rename to fin_fatura_venc_idx;
  end if;
end $$;

-- Atualiza o cache de schema da API após a alteração de nome da tabela.
notify pgrst, 'reload schema';
