-- Leva as séries pra sempre até o novo limite de geração, 31/12/2032 (DATA_LIMITE_RECORRENCIA
-- em js/domain.js). Antes o app gerava séries só até 31/12/2029, então tudo que se repete sem
-- data pra acabar parava ali. Rode depois da migration 32, que marca as séries anuais que a
-- 31 tinha deixado de fora.
-- Grupo = mesmo nome + categoria (sem diferenciar caixa nem espaço nas pontas) com
-- pra_sempre. Modelo = a ocorrência mais recente do grupo (maior data e, no empate, maior
-- id): ela é a intenção mais nova (valor, dia, cartão, marcas). As novas ocorrências saem
-- dela, como no cadastro: Mensal a cada mês, Semestral a cada 6, Anual a cada 12 meses,
-- sempre contados a partir da data do modelo (dia 31 cai no último dia do mês curto e volta
-- ao 31 no mês seguinte, sem ir encurtando), Semanal a cada 7 dias e Quinzenal a cada 14.
-- Frequência = a da ocorrência mais recente do grupo que tem uma. Grupo sem Frequência
-- conhecida fica como está.
-- Cada nova linha copia do modelo nome, categoria, valor, Crédito, Frequência, lote
-- (recorrencia_id), canal, prio, Reserva, Comprometido e pra_sempre, nasce em aberto
-- (pago = false) e sem obs (observação é de uma ocorrência só). No Crédito, a fatura anda
-- junto com a data, pela mesma regra do cadastro (faturaDaOcorrencia): a do modelo mais os
-- meses de calendário entre a data do modelo e a nova, mesmo dia de vencimento e cartão.
-- Modelo sem lote ganha um número novo da sequência (migration 28), igual a uma série nova.
-- Só cria datas depois da última de cada grupo e até 31/12/2032, então rodar de novo não
-- cria nada. O histórico (migration 27) guarda cada linha criada. Ao final, lista quantas
-- linhas cada grupo ganhou e as datas da primeira e da última.
-- Sem bloco DO/$$ e sem ponto e vírgula em comentário (o DataGrip parte o script neles).
begin;

-- Sem a migration 27 (histórico), a 28 (sequência) ou a 31 (pra_sempre) nada é alterado.
select 'public.fin_historico'::regclass;
select 'public.fin_recorrencia_seq'::regclass;
select pra_sempre from public.fin limit 0;

create temporary table modelos_pra_sempre on commit drop as
with grupos as (
  select lower(trim(coalesce(nome, ''))) n, lower(trim(coalesce(categ, ''))) c,
         max(data) ultima,
         (array_agg(id order by data desc, id desc))[1] modelo_id,
         (array_agg(freq order by data desc, id desc) filter (where freq is not null))[1] freq
  from public.fin
  where pra_sempre and data is not null
  group by 1, 2
)
select f.id modelo_id, f.nome, f.categ, f.data, f.valor, f.cred, f.fatura, f.canal, f.prio,
       f.reserva, f.comprometido, g.freq,
       coalesce(f.recorrencia_id, nextval('public.fin_recorrencia_seq')::int) recorrencia_id
from grupos g
join public.fin f on f.id = g.modelo_id
where g.freq in ('Mensal', 'Semanal', 'Quinzenal', 'Semestral', 'Anual')
  and g.ultima < date '2032-12-31'
order by f.data, f.id;

create temporary table novas_pra_sempre on commit drop as
select m.modelo_id, o.data, m.nome, m.categ, m.valor, m.cred, m.freq, m.recorrencia_id,
       m.canal, m.prio, m.reserva, m.comprometido,
       case when m.cred then (m.fatura + make_interval(months =>
         ((extract(year from o.data) - extract(year from m.data)) * 12
          + extract(month from o.data) - extract(month from m.data))::int))::date end fatura
from modelos_pra_sempre m
cross join lateral (
  select (case m.freq
            when 'Mensal' then m.data + make_interval(months => p)
            when 'Semestral' then m.data + make_interval(months => 6 * p)
            when 'Anual' then m.data + make_interval(months => 12 * p)
            when 'Semanal' then m.data + make_interval(days => 7 * p)
            when 'Quinzenal' then m.data + make_interval(days => 14 * p)
          end)::date data
  from generate_series(1, 200) p
) o
where o.data <= date '2032-12-31';

insert into public.fin (data, valor, nome, categ, freq, cred, pago, fatura, recorrencia_id,
                        obs, canal, prio, reserva, comprometido, pra_sempre)
select data, valor, nome, categ, freq, cred, false, fatura, recorrencia_id,
       null, canal, prio, reserva, comprometido, true
from novas_pra_sempre
order by data, modelo_id;

-- O modelo sem lote entra no lote novo junto com as ocorrências que acabou de gerar.
update public.fin f
set recorrencia_id = m.recorrencia_id
from modelos_pra_sempre m
where f.id = m.modelo_id and f.recorrencia_id is null;

select m.nome, m.categ, m.freq, m.recorrencia_id lote, count(n.data) novas, min(n.data) primeira, max(n.data) ultima
from modelos_pra_sempre m
left join novas_pra_sempre n on n.modelo_id = m.modelo_id
group by m.modelo_id, m.nome, m.categ, m.freq, m.recorrencia_id
order by m.nome;

commit;
