-- Elevação pélvica (glúteos) entra como 7º exercício, logo depois do posterior de coxa (pedido do mantenedor em 26/10/2026).
-- Não substitui nenhum: o leg press empurra com os joelhos (quadríceps), a flexora dobra o joelho (posterior de coxa) e a
-- elevação pélvica estende o quadril com o glúteo como músculo principal, o que nenhum dos outros cobre.
-- Variações: máquina (principal), Smith (substituto) e halter, em kg. Os nomes batem com o GUIA de js/config.js.
-- Rodar no DataGrip: o user_id vai fixo (o do dono), porque ali não há auth.uid(). Idempotente: rodar de novo não muda nada.
-- Os exercícios do 3º em diante descem uma posição. O app traz a lista nova da nuvem ao abrir.
begin;

update public.tr_exercicio set ordem = ordem + 1
  where user_id = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid and ordem >= 2
    and not exists (select 1 from public.tr_exercicio where user_id = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid and id = 'elevpelv');

insert into public.tr_exercicio (user_id, id, ordem, grupo, regiao, series, reps, descanso, modo, ativo)
  select '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'elevpelv', 2, 'Glúteos', 'Pernas', 3, 12, 75, 'invertida', 0
  where not exists (select 1 from public.tr_exercicio where user_id = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid and id = 'elevpelv');

insert into public.tr_variacao (user_id, id, exercicio_id, ordem, nome, unidade, passo, lados) values
  ('32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'elevpel0', 'elevpelv', 0, 'Elevação pélvica na máquina', 'kg', 5, 1),
  ('32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'elevpel1', 'elevpelv', 1, 'Elevação pélvica no Smith', 'kg', 5, 1),
  ('32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid, 'elevpel2', 'elevpelv', 2, 'Elevação pélvica com halter', 'kg', 2, 1)
  on conflict (user_id, id) do nothing;

commit;
