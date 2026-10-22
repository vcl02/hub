-- Prioridade de elevação do Backlog pra um ciclo: número livre preenchido na mão (1 = mais
-- provável, quanto maior menos chance, ex.: 999); vazio quando a linha ainda não entrou
-- nessa fila. Só serve pra ordenar o Backlog e não afeta nenhum cálculo financeiro.
alter table public.fin
add column prio integer;

notify pgrst, 'reload schema';
