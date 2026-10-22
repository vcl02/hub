-- Limite aprovado de cada cartão e quanto do guardado vira garantia do Nubank, por ciclo.
-- Como os limites de Besteira/Isabella (migration 23), ficam na linha âncora "Faturamento PJ"
-- que abre o ciclo: sem tabela, policy ou grant novos (o RLS da migration 20 já cobre).
-- Nulo = herda o valor do ciclo anterior mais próximo que tiver um; sem nenhum, usa o padrão
-- (Aprovado: LIMITE_CARTAO / LIMITE_CARTAO_MP em js/domain.js; garantia: todo o guardado).
-- A garantia usada nunca passa do guardado real do ciclo. Editáveis no título do Crédito ou
-- direto no DataGrip.
begin;

alter table public.fin
  add column if not exists limite_aprovado_nubank numeric(12, 2);

alter table public.fin
  add column if not exists limite_aprovado_mp numeric(12, 2);

alter table public.fin
  add column if not exists limite_garantia_nubank numeric(12, 2);

alter table public.fin
  add constraint fin_limite_aprovado_nubank_nao_negativo check (limite_aprovado_nubank is null or limite_aprovado_nubank >= 0);

alter table public.fin
  add constraint fin_limite_aprovado_mp_nao_negativo check (limite_aprovado_mp is null or limite_aprovado_mp >= 0);

alter table public.fin
  add constraint fin_limite_garantia_nubank_nao_negativo check (limite_garantia_nubank is null or limite_garantia_nubank >= 0);

commit;

notify pgrst, 'reload schema';
