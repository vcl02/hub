-- Marca como série os lançamentos que se repetem mas foram cadastrados sem Frequência e sem
-- recorrencia_id (antes do lote existir, ou um a um): cada série ganha freq e um
-- recorrencia_id novo, tirado da sequência na ordem da 1ª ocorrência (exige a migration 28).
-- Série = mesmo nome + categoria (sem diferenciar caixa nem espaço nas pontas) + mesmo
-- cred, só entre linhas com data, sem freq e sem recorrencia_id:
--   Mensal: 3 ou mais, exatamente uma por mês, em meses seguidos (o dia pode variar: conta
--           paga antes ou com vencimento móvel continua sendo a mesma série),
--   Anual:  2 ou mais, uma por ano, sempre no mesmo mês, em anos seguidos.
-- No Crédito o valor precisa ser sempre igual (parcela/assinatura): compras avulsas no
-- cartão que caíram uma vez por mês por acaso (ex.: estacionamento) ficam de fora. No
-- Débito o valor pode variar (água, evolução de obra).
-- Nunca entram: Investimento (Aporte/Resgate são ajustes do app), antecipação/pagamento de
-- fatura e Ajuste. Linhas que já têm freq ou recorrencia_id não são tocadas, então rodar de
-- novo não muda nada. Só altera freq e recorrencia_id, e o histórico (migration 27) guarda o
-- antes de cada linha. Ao final, lista as séries marcadas.
-- Sem bloco DO/$$: o DataGrip parte o script nos ponto e vírgula, então tudo aqui é comando
-- simples. Os números saem em sequência a partir do maior já usado, e a sequência é
-- alinhada no fim, como se cada série tivesse chamado nextval.
begin;

-- Sem a migration 28 (função proxima_recorrencia) este comando falha e nada é alterado.
select 'public.proxima_recorrencia()'::regprocedure;

create temporary table series_marcadas on commit drop as
with base as (
  select id, nome, categ, cred, data, valor,
         lower(trim(coalesce(nome, ''))) n, lower(trim(coalesce(categ, ''))) c
  from public.fin
  where freq is null and recorrencia_id is null and data is not null
    and coalesce(categ, '') !~* '(investimento|antecipa|pagamento fatura|ajuste)'
),
grupos as (
  select n, c, cred, count(*) qtd, min(data) primeira, max(data) ultima,
         count(distinct date_trunc('month', data)) meses,
         (extract(year from age(date_trunc('month', max(data)), date_trunc('month', min(data)))) * 12
          + extract(month from age(date_trunc('month', max(data)), date_trunc('month', min(data)))))::int + 1 meses_corridos,
         count(distinct extract(year from data)) anos,
         (extract(year from max(data)) - extract(year from min(data)))::int + 1 anos_corridos,
         count(distinct extract(month from data)) meses_do_ano,
         count(distinct valor) valores,
         min(nome) nome, min(categ) categ
  from base group by n, c, cred
),
series as (
  select n, c, cred, nome, categ, qtd, primeira, ultima,
         case when qtd >= 3 and meses = qtd and meses_corridos = qtd then 'Mensal' else 'Anual' end freq
  from grupos
  where (cred is not true or valores = 1)
    and ((qtd >= 3 and meses = qtd and meses_corridos = qtd)
         or (qtd >= 2 and anos = qtd and anos_corridos = qtd and meses_do_ano = 1))
)
-- Um número por série, na ordem da 1ª ocorrência (determinístico), logo depois do maior já
-- usado (no banco ou na sequência).
select s.*,
       (select greatest(coalesce(max(recorrencia_id), 0), (select last_value from public.fin_recorrencia_seq)) from public.fin)
         + row_number() over (order by primeira, n, c, cred) recorrencia_id
from series s;

update public.fin f
set freq = s.freq, recorrencia_id = s.recorrencia_id
from series_marcadas s
where f.freq is null and f.recorrencia_id is null and f.data is not null
  and lower(trim(coalesce(f.nome, ''))) = s.n
  and lower(trim(coalesce(f.categ, ''))) = s.c
  and f.cred is not distinct from s.cred
  and coalesce(f.categ, '') !~* '(investimento|antecipa|pagamento fatura|ajuste)';

-- A sequência continua de onde as séries pararam: o próximo lote do app pega o número seguinte.
select setval('public.fin_recorrencia_seq', greatest(
  (select coalesce(max(recorrencia_id), 0) from public.fin),
  (select last_value from public.fin_recorrencia_seq),
  1
));

select recorrencia_id, nome, categ, cred, freq, qtd, primeira, ultima
from series_marcadas order by recorrencia_id;

commit;
