-- Renumera recorrencia_id de 1 em diante, sem buracos, mantendo a ordem atual: o menor
-- número vira 1, o seguinte 2, e assim por diante (ex.: 2, 3, 4, 9 → 1, 2, 3, 4). Todas as
-- linhas de um mesmo lote continuam juntas (mesmo número novo). Depois a sequência
-- fin_recorrencia_seq passa a apontar pro último número, e o próximo lote do app pega o
-- seguinte (migration 28).
-- O recorrencia_id é só uma marca de lote (nenhuma tabela aponta pra ele), então trocar o
-- número não muda saldo nem tela. Rodar de novo não muda nada (já está de 1 em diante).
-- O histórico (migration 27) guarda o número antigo de cada linha.
-- Rode com o app fechado. O lock abaixo segura gravações em fin até o fim da transação.
-- Sem bloco DO/$$ e sem ponto e vírgula em comentário (o DataGrip parte o script neles).
begin;

lock table public.fin in share row exclusive mode;

update public.fin f
set recorrencia_id = n.novo
from (
  select recorrencia_id antigo, row_number() over (order by recorrencia_id) novo
  from (select distinct recorrencia_id from public.fin where recorrencia_id is not null) d
) n
where f.recorrencia_id = n.antigo
  and f.recorrencia_id <> n.novo;

-- Volta a sequência pro último número (aqui pode voltar atrás de propósito).
select setval('public.fin_recorrencia_seq',
  greatest((select coalesce(max(recorrencia_id), 0) from public.fin), 1),
  (select count(*) > 0 from public.fin where recorrencia_id is not null));

-- Conferência: lotes, menor, maior (lotes = maior quando não há buraco) e a sequência.
select count(distinct recorrencia_id) lotes, min(recorrencia_id) menor, max(recorrencia_id) maior,
       (select last_value from public.fin_recorrencia_seq) sequencia
from public.fin;

commit;
