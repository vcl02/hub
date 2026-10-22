-- Cria em fin_ciclo os ciclos de 2030 a 2032, pra os lançamentos gerados até 31/12/2032
-- (migration 33) caírem cada um no seu mês. Sem isso, tudo depois de 07/12/2029 cairia no
-- último ciclo, que é aberto (fim vazio), e ele somaria três anos de uma vez.
-- Rode depois da migration 33: os ciclos novos seguem o padrão dos 41 que existem, cada um
-- começando na data do Faturamento PJ daquele mês e terminando na véspera do seguinte.
-- 1. As ocorrências de Faturamento PJ depois do início do último ciclo que caem em sábado,
--    domingo ou 7 de setembro passam pro próximo dia útil (mesmo ajuste dos meses que já
--    existem, ex.: 07/04/2029, sábado, virou 09/04). Feriado que não seja 7 de setembro e
--    os dias 8 que já aparecem em alguns meses não são deduzidos: ajuste no DataGrip.
-- 2. O último ciclo (aberto) ganha fim = véspera do 1º Faturamento PJ novo.
-- 3. Um ciclo por Faturamento PJ novo, até 31/12/2032, de fim = véspera do seguinte. O
--    último continua aberto, como hoje.
-- Os cinco limites de cada ciclo novo (Besteira, Isabella, Aprovado Nubank e MP, Garantia
-- Nubank) copiam os do último ciclo de hoje, porque os tetos de Besteira/Isabella não herdam
-- (vazio volta ao padrão do código) e os ciclos atuais têm teto próprio.
-- Rodar de novo não cria nada: só entra Faturamento PJ depois do início do último ciclo,
-- e depois desta migration o último ciclo já é o de dez/2032.
-- Sem bloco DO/$$ e sem ponto e vírgula em comentário (o DataGrip parte o script neles).
begin;

lock table public.fin_ciclo in share row exclusive mode;

update public.fin f
set data = (case extract(isodow from d.util)
              when 6 then d.util + 2
              when 7 then d.util + 1
              else d.util
            end)::date
from (
  select id, case when to_char(data, 'MM-DD') = '09-07' then data + 1 else data end util
  from public.fin
  where lower(trim(nome)) = 'faturamento pj'
    and data > (select max(inicio) from public.fin_ciclo)
    and data <= date '2032-12-31'
) d
where f.id = d.id
  and f.data <> (case extract(isodow from d.util)
                   when 6 then d.util + 2
                   when 7 then d.util + 1
                   else d.util
                 end)::date;

create temporary table ciclos_novos on commit drop as
select data inicio,
       (lead(data) over (order by data) - 1) fim
from (
  select distinct data
  from public.fin
  where lower(trim(nome)) = 'faturamento pj'
    and data > (select max(inicio) from public.fin_ciclo)
    and data <= date '2032-12-31'
) pj;

update public.fin_ciclo
set fim = (select min(inicio) - 1 from ciclos_novos)
where fim is null
  and exists (select 1 from ciclos_novos)
  and inicio = (select max(inicio) from public.fin_ciclo);

insert into public.fin_ciclo (inicio, fim, limite_besteira, limite_isabella,
                              limite_aprovado_nubank, limite_aprovado_mp, limite_garantia_nubank)
select n.inicio, n.fim, u.limite_besteira, u.limite_isabella,
       u.limite_aprovado_nubank, u.limite_aprovado_mp, u.limite_garantia_nubank
from ciclos_novos n
cross join (
  select * from public.fin_ciclo
  where inicio < (select coalesce(min(inicio), date '9999-12-31') from ciclos_novos)
  order by inicio desc limit 1
) u
order by n.inicio;

select id, inicio, fim from public.fin_ciclo order by inicio desc limit 40;

commit;
