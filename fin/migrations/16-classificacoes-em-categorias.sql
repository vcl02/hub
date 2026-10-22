-- Preserva as classificações antigas como categorias e remove as três flags substituídas.
update public.fin
set categ = case
    when nullif(trim(categ), '') is null then 'Isabella'
    else trim(categ) || ', Isabella'
end
where isa is true
  and not exists (
      select 1
      from regexp_split_to_table(coalesce(categ, ''), ',') as categoria
      where lower(trim(categoria)) = lower('Isabella')
  );

update public.fin
set categ = case
    when nullif(trim(categ), '') is null then 'Reserva emergência'
    else trim(categ) || ', Reserva emergência'
end
where reserva is true
  and not exists (
      select 1
      from regexp_split_to_table(coalesce(categ, ''), ',') as categoria
      where lower(trim(categoria)) = lower('Reserva emergência')
  );

alter table public.fin
    drop column if exists ativo,
    drop column if exists isa,
    drop column if exists reserva;

notify pgrst, 'reload schema';
