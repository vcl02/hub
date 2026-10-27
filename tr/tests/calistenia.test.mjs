// Flexão, barra e antebraço: séries sem peso (corpo) e em segundos (pendurar), plano por mês e o cronômetro de segurar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, linhas, sincronizado } from './helpers/app.mjs';

prepararApp();

// Os três exercícios como a migration 07 grava (ids dos PLANOS de js/config.js)
const v = (id, nome, unidade, passo = 1) => ({ id, nome, unidade, passo });
const CALISTENIA = [
  { id: 'flexao', grupo: 'Flexão', regiao: 'Superior', series: 3, reps: 6, descanso: 60, modo: 'reta',
    variacoes: [v('flexao0', 'Flexão com joelhos apoiados', 'corpo'), v('flexao1', 'Flexão completa', 'corpo'), v('flexao2', '', 'corpo')] },
  { id: 'barrafix', grupo: 'Barra fixa', regiao: 'Superior', series: 3, reps: 15, descanso: 90, modo: 'reta',
    variacoes: [v('barrafx0', 'Pendurar na barra', 's'), v('barrafx1', 'Negativa na barra', 'corpo'), v('barrafx2', 'Barra fixa', 'corpo')] },
  { id: 'antebraco', grupo: 'Antebraço', regiao: 'Superior', series: 2, reps: 15, descanso: 45, modo: 'reta',
    variacoes: [v('antebr0', 'Rosca de punho com halteres', 'kg', 2), v('antebr1', 'Rosca de punho invertida com halteres', 'kg', 2), v('antebr2', '', 'kg', 2)] }
];
async function abrirComCalistenia(relogio) {
  const a = await abrirApp({ relogio: new Date(relogio) });
  await a.pg.evaluate(X => { db = preparar({ ...db, exercicios: [...db.exercicios, ...X] }); gravar(); ir('inicio'); }, CALISTENIA);
  return a;
}
const texto = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ').trim();

test('plano por mês: cada etapa vale 1 mês a partir do início, com o alvo de cada semana; a última continua', async () => {
  const { ctx, pg, erros } = await abrirComCalistenia('2026-10-28T19:00:00');
  const etapas = await pg.evaluate(() => ['2026-10-20', '2026-10-28', '2026-11-04', '2026-11-27', '2026-11-28', '2026-12-28', '2027-06-01']
    .map(d => { const x = etapaDoPlano(PLANOS.barrafix, d); return [x.k, x.semana, x.ate]; }));
  assert.deepEqual(etapas, [[0, 0, '2026-11-28'], [0, 0, '2026-11-28'], [0, 1, '2026-11-28'], [0, 3, '2026-11-28'], [1, 0, '2026-12-28'], [2, 0, null], [2, 3, null]]);
  assert.equal(await pg.evaluate(() => maisMeses('2027-01-31', 1)), '2027-02-28');   // fim de mês mais curto
  // O plano escolhe variação, séries e reps (mesmo alvo em todas): 2ª semana do 1º mês, 2º mês e 3º mês
  const no = d => pg.evaluate(dia => { aplicarPlanos(dia); return ['flexao', 'barrafix'].map(id => { const e = db.exercicios.find(x => x.id === id); return [e.variacoes[e.ativo].nome, e.series, e.reps, e.modo]; }); }, d);
  assert.deepEqual(await no('2026-11-05'), [['Flexão com joelhos apoiados', 3, 8, 'reta'], ['Pendurar na barra', 3, 20, 'reta']]);
  assert.deepEqual(await no('2026-12-01'), [['Flexão completa', 3, 3, 'reta'], ['Negativa na barra', 3, 3, 'reta']]);
  assert.deepEqual(await no('2027-01-20'), [['Flexão completa', 3, 12, 'reta'], ['Barra fixa', 3, 3, 'reta']]);
  assert.deepEqual(erros, []); await ctx.close();
});

test('flexão: sem campo de peso nem aquecimento, marca as séries só com reps e salva (kg 0) até na nuvem', async () => {
  const { ctx, pg, erros, nuvem } = await abrirComCalistenia('2026-10-28T19:00:00');   // quarta, 1º dia do plano
  assert.match(await texto(pg, '[data-ex="flexao"]'), /^Flexão · mês 1 ?Flexão com joelhos apoiados ?3 × 6 reps · 60 s/);
  await pg.click('[data-ex="flexao"]');
  assert.equal(await pg.isVisible('#e-carga'), false);
  assert.equal(await pg.isVisible('#e-variacoes'), false);                                   // o plano escolhe a variação
  assert.equal(await pg.isVisible('#t-modos'), false);
  assert.match(await texto(pg, '#e-presc'), /^3 × 6 reps · descanso 60 s$/);
  assert.equal(await texto(pg, '#e-plano'), 'Mês 1 de 3 · semana 1 · Flexão completa a partir de 28/11');
  assert.deepEqual(await linhas(pg), ['Série 16 reps', 'Série 26 reps', 'Série 36 reps']);   // sem aquecimento
  await pg.click('#t-feita'); await pg.click('#t-feita');
  await pg.click('[data-linha="1"]'); await pg.click('[data-aj="reps"][data-d="-1"]');      // 2ª série: deu 5
  assert.equal(await pg.locator('.linha-ed [data-aj="kg"]').count(), 0);                     // sem peso no editor da série
  await pg.click('#t-feita');
  assert.equal(await pg.textContent('#e-nome'), 'Pendurar na barra');                       // última série: já foi para o próximo
  await pg.click('[data-voltar]'); await pg.click('[data-ex="flexao"]');
  assert.equal(await texto(pg, '#e-salvo'), '✓ Salvo: 6/5/6 reps');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.tr_registro.map(r => [r.variacao_id, r.series]), [['flexao0', [{ kg: 0, reps: 6 }, { kg: 0, reps: 5 }, { kg: 0, reps: 6 }]]]);
  await pg.reload(); await pg.waitForSelector('#v-exercicio:not([hidden])');                 // reabre o exercício aberto, como sempre
  assert.equal(await pg.evaluate(() => db.registros.filter(r => r.variacao === 'flexao0').length), 1);   // a cópia do aparelho guarda o registro sem peso
  await pg.click('[data-voltar]');
  assert.match(await texto(pg, '[data-ex="flexao"]'), /✓ Feito hoje.*6reps ?6\/5\/6 · hoje/);
  assert.deepEqual(erros, []); await ctx.close();
});

test('pendurar: o botão conta a série, "Soltei" marca os segundos que deu e no alvo marca sozinho', async () => {
  const { ctx, pg, erros } = await abrirComCalistenia('2026-10-28T19:00:00');
  await pg.click('[data-ex="barrafix"]');
  assert.equal(await pg.textContent('#e-nome'), 'Pendurar na barra');
  assert.match(await texto(pg, '#e-presc'), /^3 × 15 s · descanso 90 s$/);
  assert.equal(await pg.textContent('#t-feita'), 'Pendurar · 15 s');
  await pg.click('#t-feita');                                                                // começa a segurar
  await pg.clock.fastForward('00:10');
  assert.equal(await pg.textContent('#t-feita'), 'Soltei · 10 s');
  assert.equal(await pg.textContent('#t-relogio'), '0:05');
  await pg.click('#t-feita');                                                                // soltou antes: 10 s
  assert.equal(await pg.evaluate(() => T.feitas.barrafix.map(s => s.reps)).then(x => x.join()), '10');
  assert.equal(await pg.isVisible('#t-rodando'), true);                                     // e o descanso começou
  await pg.click('#t-feita');                                                                // 2ª série: começar encerra o descanso
  await pg.clock.fastForward('00:16');                                                       // passou do alvo: marca 15 sozinho
  assert.deepEqual(await pg.evaluate(() => T.feitas.barrafix.map(s => s.reps)), [10, 15]);
  assert.equal(await texto(pg, '#e-salvo'), '✓ Salvo: 10/15 s');
  assert.deepEqual(erros, []); await ctx.close();
});

test('no 2º mês a barra vira negativa e a flexão vira completa, com poucas reps', async () => {
  const { ctx, pg, erros } = await abrirComCalistenia('2026-12-02T19:00:00');
  assert.match(await texto(pg, '[data-ex="barrafix"]'), /^Barra fixa · mês 2 ?Negativa na barra ?3 × 3 reps · 90 s/);
  await pg.click('[data-ex="flexao"]');
  assert.equal(await pg.textContent('#e-nome'), 'Flexão completa');
  assert.equal(await texto(pg, '#e-plano'), 'Mês 2 de 3 · semana 1 · mais reps a partir de 28/12');
  assert.deepEqual(erros, []); await ctx.close();
});
