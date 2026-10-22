-- Metas parceladas com duas datas: a da entrada (o mês da meta) e a da 1ª parcela. A 1ª
-- parcela fica guardada como meses depois da entrada (meses_ate_parcela), e não como data
-- solta, pra andar junto quando a meta segue uma âncora (ex.: Chaves do AP mudou de mês).
-- Nulo = 1 mês depois da entrada. Zero = no mesmo mês da entrada.
-- Saem duas colunas que o app não usa mais: juros_mensal (os juros saíram do plano) e
-- custo_mensal (o custo depois da compra saiu da meta). Se alguma linha tiver valor nelas, a
-- migration aborta inteira antes de remover, sem perder nada, pra revisão no DataGrip.
-- Rode depois da 36. Pode rodar de novo: coluna nova, checagem e remoções são idempotentes.
-- Sem bloco DO/$$ e sem ponto e vírgula em comentário (o DataGrip parte o script neles).
begin;

-- Pré-requisito: falha sozinho, sem mudar nada, se a migration 36 não estiver aplicada.
select 'public.fin_meta'::regclass;

alter table public.fin_meta
  add column if not exists meses_ate_parcela integer
  check (meses_ate_parcela is null or meses_ate_parcela between 0 and 120);

-- Aborta (divisão por zero) se juros_mensal ou custo_mensal tiverem algum valor: nada é
-- removido sem revisão. Lê as colunas por to_jsonb, que dá nulo quando elas já não existem,
-- então rodar de novo depois das remoções continua passando.
select 1 / (case when count(*) = 0 then 1 else 0 end) as sem_valor_em_juros_nem_custo
from public.fin_meta
where to_jsonb(fin_meta) ->> 'juros_mensal' is not null
   or to_jsonb(fin_meta) ->> 'custo_mensal' is not null;

alter table public.fin_meta drop column if exists juros_mensal;
alter table public.fin_meta drop column if exists custo_mensal;

commit;

notify pgrst, 'reload schema';
