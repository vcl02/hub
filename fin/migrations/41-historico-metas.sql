-- Histórico também das metas: toda inserção, alteração e exclusão em public.fin_meta grava uma linha em
-- public.fin_historico (tabela, operação, id, quem e quando, linha antes e depois), como fin e fin_ciclo (migration 27).
-- Reaproveita a função registrar_historico da 27, então não cria função nova (nenhum corpo procedural aqui).
-- Não altera nenhuma linha de fin_meta e não muda nada no app. Aplicar no DataGrip, depois da 27 e da 36.
-- Rodar de novo não muda nada (o gatilho é recriado).
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

select 'public.fin_historico'::regclass;
select 'public.fin_meta'::regclass;
select 'public.registrar_historico()'::regprocedure;

drop trigger if exists fin_meta_historico on public.fin_meta;
create trigger fin_meta_historico
  after insert or update or delete on public.fin_meta
  for each row execute function public.registrar_historico();

commit;
