-- Flexão, barra fixa e antebraço no fim do treino de quarta e quinta (pedido do mantenedor em 27/10/2026).
-- Unidades novas nas variações: corpo (peso do corpo, só reps) e s (segundos, como pendurar na barra), as duas com kg 0.
-- Flexão e barra seguem o plano por mês de js/config.js (PLANOS, ids flexao e barrafix): o app escolhe a variação, as
-- séries e as reps de cada semana. Flexão: joelhos apoiados, depois completa. Barra: pendurar, negativa, barra completa.
-- Antebraço: rosca de punho com halteres (normal e invertida), em kg, sem plano.
-- Rodar no DataGrip: o user_id vai fixo (o do dono), porque ali não há auth.uid(). Idempotente: rodar de novo não muda nada.
begin;

alter table public.tr_variacao drop constraint if exists tr_variacao_unidade_check;
alter table public.tr_variacao add constraint tr_variacao_unidade_check check (unidade in ('kg', 'lb', 'nível', 'corpo', 's'));

insert into public.tr_exercicio (user_id, id, ordem, grupo, regiao, series, reps, descanso, modo, ativo)
  select '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, x.id, (select coalesce(max(ordem), -1) from public.tr_exercicio where user_id = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid) + x.n, x.grupo, 'Superior', x.series, x.reps, x.descanso, 'reta', 0
  from (values ('flexao', 1, 'Flexão', 3, 6, 60), ('barrafix', 2, 'Barra fixa', 3, 15, 90), ('antebraco', 3, 'Antebraço', 2, 15, 45)) as x(id, n, grupo, series, reps, descanso)
  where not exists (select 1 from public.tr_exercicio where user_id = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid and id in ('flexao', 'barrafix', 'antebraco'));

insert into public.tr_variacao (user_id, id, exercicio_id, ordem, nome, unidade, passo, lados) values
  ('32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'flexao0', 'flexao', 0, 'Flexão com joelhos apoiados', 'corpo', 1, 1),
  ('32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'flexao1', 'flexao', 1, 'Flexão completa', 'corpo', 1, 1),
  ('32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'flexao2', 'flexao', 2, '', 'corpo', 1, 1),
  ('32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'barrafx0', 'barrafix', 0, 'Pendurar na barra', 's', 1, 1),
  ('32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'barrafx1', 'barrafix', 1, 'Negativa na barra', 'corpo', 1, 1),
  ('32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'barrafx2', 'barrafix', 2, 'Barra fixa', 'corpo', 1, 1),
  ('32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'antebr0', 'antebraco', 0, 'Rosca de punho com halteres', 'kg', 2, 1),
  ('32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'antebr1', 'antebraco', 1, 'Rosca de punho invertida com halteres', 'kg', 2, 1),
  ('32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'antebr2', 'antebraco', 2, '', 'kg', 2, 1)
  on conflict (user_id, id) do nothing;

commit;
