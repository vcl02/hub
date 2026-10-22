-- Índice da FK tr_variacao → tr_exercicio (apontado pelo advisor de performance). JÁ APLICADA em 2026-10-21.
begin;

select 'public.tr_variacao'::regclass;
create index tr_variacao_exercicio_idx on public.tr_variacao (user_id, exercicio_id);

commit;
