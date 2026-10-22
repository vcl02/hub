-- Executar somente depois de todos os creditos existentes receberem fatura_id.
-- A constraint impede dois estados inválidos: crédito sem fatura e débito apontando fatura.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lancamentos'::regclass
      and conname = 'lancamentos_credito_exige_fatura'
  ) then
    alter table public.lancamentos
      add constraint lancamentos_credito_exige_fatura
      check (
        (coalesce(cred, false) and fatura_id is not null)
        or
        (not coalesce(cred, false) and fatura_id is null)
      );
  end if;
end $$;
