-- Metas sem âncora: a âncora (data com nome que outras metas seguiam, migration 36) saiu do
-- app a pedido do mantenedor. Saem as colunas ancora_meta_id e deslocamento, e o valor passa
-- a ser obrigatório (uma linha sem valor era uma âncora).
-- Se houver alguma âncora (valor nulo) ou meta ligada a uma, a migration aborta inteira antes
-- de remover, sem perder nada, pra revisão no DataGrip.
-- Rode depois da 36. Pode rodar de novo: checagem, remoções e o not null são idempotentes.
-- Sem bloco DO/$$ e sem ponto e vírgula em comentário (o DataGrip parte o script neles).
begin;

-- Pré-requisito: falha sozinho, sem mudar nada, se a migration 36 não estiver aplicada.
select 'public.fin_meta'::regclass;

-- Aborta (divisão por zero) se houver âncora ou meta ligada a uma. Lê a coluna por to_jsonb,
-- que dá nulo quando ela já não existe, então rodar de novo depois da remoção continua passando.
select 1 / (case when count(*) = 0 then 1 else 0 end) as sem_ancora
from public.fin_meta
where valor is null
   or to_jsonb(fin_meta) ->> 'ancora_meta_id' is not null;

-- Remover a coluna leva junto a chave estrangeira dela e a checagem fin_meta_ancora_nao_e_ela_mesma.
alter table public.fin_meta drop column if exists ancora_meta_id;
alter table public.fin_meta drop column if exists deslocamento;
alter table public.fin_meta alter column valor set not null;

comment on table public.fin_meta is
  'Metas de compra (valor total + mês). O plano é calculado pelo app.';

commit;

notify pgrst, 'reload schema';
