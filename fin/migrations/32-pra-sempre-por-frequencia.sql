-- Corrige o critério da migration 31, que só marcava pra sempre o grupo cuja última ocorrência
-- caía em dez/2029. Série Anual ou Semestral gerada até o limite antigo (31/12/2029) termina
-- antes de dezembro quando o dia dela é outro (aniversário em março, Páscoa, Contadora…) e
-- ficou de fora. Critério novo, por frequência: o grupo chegou ao limite antigo quando a
-- próxima ocorrência depois da última já cairia depois de 31/12/2029 — Mensal +1 mês,
-- Semanal +7 dias, Quinzenal +14 dias, Semestral +6 meses, Anual +1 ano, pela Frequência da
-- ocorrência mais recente que tem uma. A data é a do limite ANTIGO de propósito: é até ela
-- que o app gerou as séries que existem hoje (o limite novo, 2032, vale pra cadastro novo).
-- Mesmo grupo da 31: nome + categoria sem diferenciar caixa nem espaço nas pontas, com alguma
-- Frequência, sem Investimento, antecipação/pagamento de fatura e Ajuste. Fica de fora o que
-- vai além do limite antigo (ex.: dívida até 2031) e o que acaba antes dele.
-- Só liga a marca (nunca desliga), então rodar de novo não muda nada. O histórico
-- (migration 27) guarda o antes de cada linha. Ao final, lista os grupos marcados agora.
-- Sem bloco DO/$$ e sem ponto e vírgula em comentário (o DataGrip parte o script neles).
begin;

-- Sem a migration 27 (histórico) ou a 31 (coluna pra_sempre) estes comandos falham e nada muda.
select 'public.fin_historico'::regclass;
select pra_sempre from public.fin limit 0;

create temporary table grupos_pra_sempre on commit drop as
with g as (
  select lower(trim(coalesce(nome, ''))) n, lower(trim(coalesce(categ, ''))) c,
         min(nome) nome, min(categ) categ, max(data) ultima,
         (array_agg(freq order by data desc, id desc) filter (where freq is not null))[1] freq
  from public.fin
  where data is not null
  group by 1, 2
)
select n, c, nome, categ, freq, ultima
from g
where freq is not null
  and coalesce(categ, '') !~* '(investimento|antecipa|pagamento fatura|ajuste)'
  and ultima <= date '2029-12-31'
  and case freq
        when 'Mensal' then ultima + interval '1 month'
        when 'Semanal' then ultima + interval '7 days'
        when 'Quinzenal' then ultima + interval '14 days'
        when 'Semestral' then ultima + interval '6 months'
        when 'Anual' then ultima + interval '1 year'
      end > date '2029-12-31'
  and exists (
    select 1 from public.fin f
    where lower(trim(coalesce(f.nome, ''))) = g.n
      and lower(trim(coalesce(f.categ, ''))) = g.c
      and f.pra_sempre = false
  );

update public.fin f
set pra_sempre = true
from grupos_pra_sempre g
where lower(trim(coalesce(f.nome, ''))) = g.n
  and lower(trim(coalesce(f.categ, ''))) = g.c
  and coalesce(f.categ, '') !~* '(investimento|antecipa|pagamento fatura|ajuste)'
  and f.pra_sempre = false;

select nome, categ, freq, ultima from grupos_pra_sempre order by nome;

commit;
