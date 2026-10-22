// Peso corporal: horário, data editável, IMC e taxa basal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, sincronizado } from './helpers/app.mjs';

prepararApp();

test('pesagem guarda o horário e avisa quando foge do habitual', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.click('#i-corpo');
  assert.equal(await pg.textContent('#c-aviso'), '');
  await pg.fill('#c-hora', '07:00'); await pg.fill('#c-peso', '90'); await pg.click('#c-form button[type=submit]');
  assert.match(await pg.textContent('#c-historico'), /07:00/);
  assert.equal(await pg.inputValue('#c-hora'), '07:00');                                    // horário habitual já vem preenchido
  await pg.fill('#c-hora', '15:30'); await pg.dispatchEvent('#c-hora', 'input');
  assert.match(await pg.textContent('#c-aviso'), /Fora do seu horário de sempre \(07:00\)/);
  assert.equal(await pg.getAttribute('#c-aviso', 'class'), 'aviso');                          // só recomenda, sem cor de erro
  await pg.fill('#c-peso', '89,5'); await pg.click('#c-form button[type=submit]');            // e salva fora do horário
  assert.match(await pg.textContent('#c-historico'), /15:30.*89,5 kg/);
  assert.equal(await pg.locator('#c-historico li').count(), 1);                                // 1 por dia
  assert.deepEqual(erros, []); await ctx.close();
});

test('mudar a data de uma pesagem', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp({ relogio: new Date('2026-10-22T08:00:00') });
  await pg.click('#i-corpo');
  await pg.fill('#c-peso', '90'); await pg.click('#c-form button[type=submit]');
  await pg.evaluate(() => { db.medidas.push({ data: '2026-10-15', hora: '07:00', peso: 91 }); gravar(); telas.corpo(); });
  await pg.click('[data-editar-medida="2026-10-22"]');
  await pg.fill('#em-data', '2026-10-15'); await pg.click('[data-salvar-medida]');
  assert.match(await pg.textContent('#toast-msg'), /Já tem pesagem em 15\/10/);           // 1 por dia
  await pg.fill('#em-data', '2026-10-20'); await pg.click('[data-salvar-medida]');
  assert.match(await pg.textContent('#c-historico'), /20\/10.*90 kg/);
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.tr_medida.map(m => m.data).sort(), ['2026-10-15', '2026-10-20']);
  assert.deepEqual(erros, []); await ctx.close();
});

test('IMC com 1,78 m', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.click('#i-corpo'); await pg.fill('#c-peso', '90'); await pg.click('#c-form button[type=submit]');
  assert.match(await pg.textContent('#c-historico'), /IMC 28,4/);                           // 90 / 1,78²
  assert.match(await pg.textContent('#c-perfil'), /\d+ anos · 1,78 m · basal ~1\.\d{3} kcal\/dia/);
  assert.match(await pg.textContent('#c-resumo'), /90kg.*IMC 28,4 · sobrepeso/);
  await ctx.close();
});

test('só tema claro, mesmo com o celular no modo escuro', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await pg.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(242, 244, 247)');
  await ctx.close();
});

test('cintura: editar, ver no card e evolução em gráfico', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-22T08:00:00') });
  await pg.evaluate(() => { db.medidas.push({ data: '2026-10-15', hora: '08:00', peso: 99, cintura: 104 }); gravar(); });
  await pg.click('#i-corpo');
  assert.equal(await pg.isVisible('#c-cint-box'), false);                                    // só 1 medida de cintura
  await pg.fill('#c-peso', '98'); await pg.fill('#c-cintura', '102'); await pg.click('#c-form button[type=submit]');
  assert.equal(await pg.isVisible('#c-cint-box'), true);
  assert.equal(await pg.locator('#c-grafico-cint svg').count(), 1);
  assert.match(await pg.textContent('#c-resumo'), /Cintura 102 cm · -2 cm/);
  await pg.click('[data-editar-medida="2026-10-22"]');
  await pg.fill('#em-cint', '101,5'); await pg.click('[data-salvar-medida]');
  assert.match(await pg.textContent('#c-historico'), /cintura 101,5 cm/);
  await pg.click('[data-editar-medida="2026-10-22"]');
  await pg.fill('#em-cint', ''); await pg.click('[data-salvar-medida]');                     // apagar a cintura
  assert.equal(await pg.evaluate(() => db.medidas.find(m => m.data === '2026-10-22').cintura), undefined);
  assert.deepEqual(erros, []); await ctx.close();
});
