-- Reserva e Comprometido deixam de ser texto dentro de categ e passam a ser colunas bool
-- próprias. Reversão deliberada do que a migration 16 fez na direção oposta (categorias ->
-- flags) especificamente pra estas duas marcas; Isabella, Fatura e as demais categorias de
-- texto livre continuam exatamente como estão — não mudam.
--
-- Verificado antes de escrever esta migration (consulta somente leitura): nenhuma linha
-- fica com categ vazio depois de remover os dois tokens — Reserva e Comprometido sempre
-- coexistem com pelo menos outra categoria nos dados atuais. O código (js/) é escrito pra
-- continuar correto mesmo se isso deixar de ser verdade no futuro.
begin;

alter table public.fin
  add column if not exists reserva boolean not null default false;

alter table public.fin
  add column if not exists comprometido boolean not null default false;

-- Por linha: reserva/comprometido = true se o token exato (sem espaço, sem diferenciar
-- caixa) aparecia em categ; categ é reconstruído sem esses dois tokens, preservando a ordem
-- e a vírgula+espaço dos demais. Só toca linha que realmente tinha um dos dois tokens.
update public.fin
set
  categ = coalesce((
    select string_agg(trim(token), ', ')
    from unnest(string_to_array(categ, ',')) as token
    where lower(trim(token)) not in ('reserva', 'comprometido') and trim(token) <> ''
  ), ''),
  reserva = exists (
    select 1 from unnest(string_to_array(categ, ',')) as token
    where lower(trim(token)) = 'reserva'
  ),
  comprometido = exists (
    select 1 from unnest(string_to_array(categ, ',')) as token
    where lower(trim(token)) = 'comprometido'
  )
where categ ilike '%reserva%' or categ ilike '%comprometido%'
returning id, categ, reserva, comprometido;

notify pgrst, 'reload schema';

commit;
