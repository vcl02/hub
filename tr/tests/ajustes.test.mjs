// Ajustes: editor de exercícios, migração de formatos antigos e atualização automática.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, app, abrirApp } from './helpers/app.mjs';

prepararApp();

test('reordenar exercícios no editor', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.click('[data-ir="editar"]');
  await pg.click('#ed-lista fieldset >> nth=1 >> .ed-mover[data-mv="-1"]');
  await pg.click('#ed-form button[type=submit]');
  await pg.waitForSelector('#v-inicio:not([hidden])');
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
  assert.equal(r.medidas, undefined);                                                       // pesagens agora são do app Corpo
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
  await pg.click('[data-ir="editar"]'); await pg.fill('.ed-grupo >> nth=0', 'Peito novo');
  app.novaVersao = true;
  try { await pg.evaluate(() => checarAtualizacao(true)); await pg.waitForTimeout(1500); } finally { app.novaVersao = false; }
  assert.equal(await pg.inputValue('.ed-grupo >> nth=0'), 'Peito novo');                     // continua na tela, nada perdido
  assert.equal(await pg.evaluate(() => atualizacaoPendente), true);                          // atualiza ao sair dela
  await ctx.close();
});

test('sem backup manual e sem senha mestra', async () => {
  const { ctx, pg } = await abrirApp();
  assert.equal(await pg.locator('[data-ir="backup"], #v-backup, #m-form').count(), 0);
  assert.equal(await pg.locator('#v-editar input[type=password]').count(), 0);
  await ctx.close();
});

test('canto superior direito: engrenagem vai direto para editar exercícios, botões só ícone; sem sair nem trocar senha', async () => {
  const { ctx, pg } = await abrirApp();
  assert.equal(await pg.locator('#i-corpo, #v-corpo').count(), 0);                            // pesagem é do app Corpo
  for (const sel of ['#v-inicio .top #i-hub', '#v-inicio .top [data-ir="editar"]']) {
    assert.ok(await pg.getAttribute(sel, 'title')); assert.ok(await pg.getAttribute(sel, 'aria-label'));
    assert.equal((await pg.textContent(sel)).trim(), '');                                   // só ícone
  }
  await pg.click('[data-ir="editar"]');
  await pg.waitForSelector('#v-editar:not([hidden])');
  assert.equal(await pg.locator('[data-ir="senha"], #v-senha, #a-sair, #v-ajustes').count(), 0);
  await ctx.close();
});

test('voltar é só a seta azul, sem texto', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0');
  const b = '#v-exercicio .back';
  assert.equal((await pg.textContent(b)).trim(), ''); assert.equal(await pg.getAttribute(b, 'aria-label'), 'Voltar');
  await pg.click(b);
  await pg.waitForSelector('#v-inicio:not([hidden])');
  await ctx.close();
});

test('Esc fecha tela cheia, cancela edição e volta', async () => {
  const { ctx, pg } = await abrirApp({ agua: true });
  await pg.tap('.slot >> nth=0');
  assert.equal(await pg.isVisible('#agua'), true);
  await pg.keyboard.press('Escape');
  assert.equal(await pg.isVisible('#agua'), false);
  assert.equal(await pg.isVisible('#v-exercicio'), true);                                    // fechou só a tela cheia
  await pg.keyboard.press('Escape');
  await pg.waitForSelector('#v-inicio:not([hidden])');                                         // voltou
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#e-finalizar');
  await pg.waitForSelector('#parabens:not([hidden])'); await pg.keyboard.press('Escape');      // parabéns: Esc é "Ver resumo"
  await pg.click('[data-editar-treino]');
  assert.equal(await pg.locator('#f-treino [data-cancelar]').count(), 1);
  await pg.keyboard.press('Escape');
  assert.equal(await pg.locator('#f-treino [data-cancelar]').count(), 0);                      // cancelou a edição
  assert.equal(await pg.isVisible('#v-fim'), true);
  await ctx.close();
});
