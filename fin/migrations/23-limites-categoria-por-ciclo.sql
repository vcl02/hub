-- Limites de Besteira e Isabella por ciclo. Ficam na própria linha âncora "Faturamento PJ"
-- que abre o ciclo (é ela que define o ciclo), então não há tabela nova, policy nova nem
-- grant novo: o RLS da migration 20 já cobre estas colunas (só o mantenedor grava, contas
-- logadas leem, anon nada). Nulo = usa o padrão do código (LIMITE_BESTEIRA = 250 e
-- LIMITE_ISABELLA = 700 em js/domain.js). Em qualquer outra linha as colunas são ignoradas.
-- Editáveis direto no DataGrip ou no título do Débito do ciclo.
begin;

alter table public.fin
  add column if not exists limite_besteira numeric(12, 2);

alter table public.fin
  add column if not exists limite_isabella numeric(12, 2);

alter table public.fin
  add constraint fin_limite_besteira_nao_negativo check (limite_besteira is null or limite_besteira >= 0);

alter table public.fin
  add constraint fin_limite_isabella_nao_negativo check (limite_isabella is null or limite_isabella >= 0);

commit;

notify pgrst, 'reload schema';
