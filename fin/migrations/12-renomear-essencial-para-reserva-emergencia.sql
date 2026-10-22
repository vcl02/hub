-- Preserva todos os valores existentes ao trocar o nome da classificação.
-- É idempotente: só renomeia quando a origem existe e o destino ainda não foi criado.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lancamentos' and column_name = 'essencial'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lancamentos' and column_name = 'reserva_emergencia'
  ) then
    alter table public.lancamentos rename column essencial to reserva_emergencia;
  end if;
end $$;
