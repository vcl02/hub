-- fin.pra_sempre: marca de recorrência SEM data pra acabar (assinatura, conta de consumo,
-- data comemorativa), diferente da que tem fim (parcelas, financiamento, dívida). O app
-- gera séries de Frequência até 31/12/2029 (DATA_LIMITE_RECORRENCIA em js/domain.js), então
-- até agora "sem fim" e "termina em dez/2029" ficavam iguais no banco. Mesmo padrão de
-- reserva/comprometido (migration 22): bool, não nulo, falso por padrão, por linha.
-- Preenchimento inicial: todo grupo de mesmo nome + categoria (sem diferenciar caixa nem
-- espaço nas pontas) que tem Frequência e cuja última ocorrência cai em dez/2029 — o
-- limite de geração. Ficam de fora o que vai além (ex.: dívida até 2031), o que acaba
-- antes, grupo sem Frequência e Investimento, antecipação/pagamento de fatura e Ajuste.
-- Rodar de novo não muda nada além do que já está marcado. O histórico (migration 27)
-- guarda o antes de cada linha. Ao final, lista os grupos marcados.
-- Sem bloco DO/$$ e sem ponto e vírgula em comentário (o DataGrip parte o script neles).
begin;

alter table public.fin add column if not exists pra_sempre boolean not null default false;

update public.fin f
set pra_sempre = true
from (
  select lower(trim(coalesce(nome, ''))) n, lower(trim(coalesce(categ, ''))) c
  from public.fin
  where data is not null
  group by 1, 2
  having max(data) between date '2029-12-01' and date '2029-12-31'
     and count(freq) > 0
) g
where lower(trim(coalesce(f.nome, ''))) = g.n
  and lower(trim(coalesce(f.categ, ''))) = g.c
  and coalesce(f.categ, '') !~* '(investimento|antecipa|pagamento fatura|ajuste)'
  and f.pra_sempre = false;

select min(nome) nome, min(categ) categ, count(*) linhas, min(data) primeira, max(data) ultima
from public.fin where pra_sempre
group by lower(trim(coalesce(nome, ''))), lower(trim(coalesce(categ, '')))
order by 1;

commit;

notify pgrst, 'reload schema';
