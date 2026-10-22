-- recorrencia_id é SEMPRE o próximo número da sequência fin_recorrencia_seq (migration 15),
-- nunca o id de um lançamento. O app gravava o id da 1ª parcela (ex.: 5297), fora da
-- numeração 1, 2, 3… que o banco usa, e a sequência ficou atrás do maior recorrencia_id já
-- gravado (nextval devolveria um número já em uso).
--   1. Alinha a sequência ao maior recorrencia_id existente (nunca volta atrás).
--   2. Cria public.proxima_recorrencia(): a única forma de o app obter um número novo.
--      Só o mantenedor recebe número (mesma conta que grava em fin, migration 20): outra
--      conta logada recebe vazio e não consome a sequência. Anônimo nem executa.
-- Não altera nenhuma linha de fin.
-- Escrita sem ponto e vírgula dentro de bloco $$ (função em SQL puro): o DataGrip parte o
-- script nos ponto e vírgula e quebrava a versão em plpgsql no meio da função.
begin;

select setval('public.fin_recorrencia_seq', greatest(
  (select coalesce(max(recorrencia_id), 0) from public.fin),
  (select last_value from public.fin_recorrencia_seq),
  1
));

-- SECURITY DEFINER pra conta logada não precisar de grant na sequência, e search_path vazio
-- pra nada resolver por objeto homônimo em outro schema. O CASE só avalia o nextval quando
-- é o mantenedor, então outra conta não gasta número.
create or replace function public.proxima_recorrencia() returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid
              then nextval('public.fin_recorrencia_seq')::integer
         end
$$;

revoke all on function public.proxima_recorrencia() from public, anon;
grant execute on function public.proxima_recorrencia() to authenticated;

commit;

notify pgrst, 'reload schema';
