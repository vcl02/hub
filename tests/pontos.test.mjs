// Pontos e conquistas, inclusive as de longo prazo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp } from './helpers/app.mjs';

prepararApp();

test('peso corporal, pontos e conquistas', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.click('#i-corpo');
  await pg.fill('#c-peso', '90,4'); await pg.click('#c-form button[type=submit]');
  assert.match(await pg.textContent('#c-historico'), /90,4 kg/);
  await pg.goBack();
  assert.match(await pg.textContent('#i-corpo'), /90,4 kg/);
  await pg.tap('.slot >> nth=2'); await pg.fill('#e-carga', '30'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita');
  await pg.goBack();
  assert.match(await pg.textContent('#g-pts'), /^70 pts$/);                                 // 50 treino + 10 exercício + 10 pesagem
  await pg.click('.game');
  assert.match(await pg.textContent('#q-lista li.on'), /Primeiro treino/);
  assert.deepEqual(erros, []); await ctx.close();
});

test('conquistas de longo prazo, ano a ano', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-21T20:00:00') });
  await pg.evaluate(() => {                                                                   // 81 treinos em ~1 ano, 2 por semana
    const v = db.exercicios[0].variacoes[0].id;
    for (let i = 0; i < 81; i++) db.registros.push({ variacao: v, data: somaDias('2025-10-15', Math.floor(i / 2) * 7 + (i % 2) * 2), series: [{ kg: 40, reps: 12 }] });
  });
  await pg.click('.game');
  assert.equal(await pg.locator('#q-lista li.q-ano').count(), 5);
  assert.equal(await pg.locator('#q-lista li:not(.q-ano)').count(), 36);
  const on = (await pg.locator('#q-lista li.on b').allTextContents()).filter(t => /ano|semanas batidas/.test(t));
  assert.deepEqual(on, ['1 ano de treino', '40 semanas batidas']);
  assert.deepEqual(erros, []); await ctx.close();
});
