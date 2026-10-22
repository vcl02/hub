// Ajustes: editor de exercícios, migração de formatos antigos e atualização automática.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, app, abrirApp } from './helpers/app.mjs';

prepararApp();

test('reordenar exercícios no editor', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.click('[data-ir="ajustes"]'); await pg.click('[data-ir="editar"]');
  await pg.click('fieldset >> nth=1 >> .ed-mover[data-mv="-1"]');
  await pg.click('#ed-form button[type=submit]');
  await pg.waitForSelector('#v-ajustes:not([hidden])'); await pg.goBack();
  assert.match(await pg.textContent('.slot >> nth=0'), /Cadeira flexora/);
  await ctx.close();
});

test('migra dados de versões antigas', async () => {
  const { ctx, pg } = await abrirApp();
  const r = await pg.evaluate(() => preparar({
    slots: [{ id: 'a', g: 'Pernas · empurrar', sets: 3, reps: '10–12', rest: 90, a: 0, vs: [{ id: 'v1', pt: 'Leg press', u: 'kg' }] }],
    logs: [{ v: 'v1', d: '2026-10-20', w: 40, r: 12 }]
  }));
  assert.equal(r.exercicios[0].regiao, 'Pernas');
  assert.equal(r.exercicios[0].variacoes[0].passo, 5);
  assert.deepEqual(r.registros[0].series, [{ kg: 40, reps: 12 }, { kg: 45, reps: 12 }, { kg: 50, reps: 12 }]);
  assert.equal(r.exercicios[0].reps, 12);                                                   // "10–12" vira 12
  assert.deepEqual(r.medidas, []);
  await ctx.close();
});

test('recarrega sozinho quando sai uma versão nova (fora do treino)', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.waitForFunction(() => versaoAtual);                                               // versão rodando registrada
  app.novaVersao = true;
  try {
    const recarregou = pg.waitForEvent('load');
    await pg.evaluate(() => checarAtualizacao(true));
    await recarregou;
  } finally { app.novaVersao = false; }
  await pg.waitForSelector('#v-inicio:not([hidden])');                                       // entra direto, sem senha
  await ctx.close();
});

test('não recarrega no meio do treino', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.waitForFunction(() => versaoAtual);
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  app.novaVersao = true;
  try { await pg.evaluate(() => checarAtualizacao(true)); await pg.waitForTimeout(1500); } finally { app.novaVersao = false; }
  assert.equal(await pg.isVisible('#v-exercicio'), true);
  assert.equal(await pg.evaluate(() => atualizacaoPendente), true);                          // aplica quando o treino acabar
  await ctx.close();
});

test('não recarrega no meio de um formulário', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.waitForFunction(() => versaoAtual);
  await pg.click('#i-corpo'); await pg.fill('#c-peso', '88');
  app.novaVersao = true;
  try { await pg.evaluate(() => checarAtualizacao(true)); await pg.waitForTimeout(1500); } finally { app.novaVersao = false; }
  assert.equal(await pg.inputValue('#c-peso'), '88');                                        // continua na tela, nada perdido
  assert.equal(await pg.evaluate(() => atualizacaoPendente), true);                          // atualiza ao sair dela
  await ctx.close();
});

test('sem backup manual e sem senha mestra em Ajustes', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.click('[data-ir="ajustes"]');
  assert.equal(await pg.locator('[data-ir="backup"], #v-backup, #m-form').count(), 0);
  assert.equal(await pg.locator('#v-ajustes input[type=password]').count(), 0);
  await ctx.close();
});

test('canto superior direito: engrenagem leva a Ajustes e sair é só ícone; sem trocar senha', async () => {
  const { ctx, pg } = await abrirApp();
  for (const sel of ['#v-inicio .top [data-ir="ajustes"]', '#v-inicio .top #sair']) {
    assert.ok(await pg.getAttribute(sel, 'title')); assert.ok(await pg.getAttribute(sel, 'aria-label'));
    assert.equal((await pg.textContent(sel)).trim(), '');                                   // só ícone
  }
  await pg.click('[data-ir="ajustes"]');
  assert.match(await pg.textContent('#v-ajustes .menu'), /Editar exercícios/);
  assert.equal(await pg.locator('[data-ir="senha"], #v-senha, #a-sair').count(), 0);
  await ctx.close();
});
