// Tela da Água no navegador: beber (ml digitado vira botão), meta, lembretes por tipo de dia, 7 dias e nuvem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, novaNuvem, sincronizado, texto, DONO } from './helpers/app.mjs';

prepararApp();

const beber = async (pg, ml) => { await pg.fill('#b-ml', String(ml)); await pg.press('#b-ml', 'Enter'); };
const etiquetas = (pg, sel) => pg.$$eval(`${sel} li`, L => L.map(x => x.textContent.trim()));

test('beber: ml digitado entra com o horário de agora e vira botão; botões pelas quantidades mais usadas; meta de 1 L', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();                     // segunda 19/10, 09:00
  assert.equal(await pg.locator('#b-botoes li').count(), 0);              // sem quantidade fixa
  await beber(pg, 300);
  assert.equal(await texto(pg, '#t-ml'), '300');
  assert.deepEqual(await pg.$$eval('#b-botoes button', B => B.map(b => b.textContent)), ['300 ml']);
  await sincronizado(pg);                                                  // já foi para a nuvem: o que vem depois precisa ir também
  await pg.clock.fastForward('01:00:00');
  await pg.click('[data-ml="300"]');
  await beber(pg, 500);
  assert.deepEqual(await pg.$$eval('#b-lista button', B => B.map(b => b.textContent)), ['09:00 · 300 ml ×', '10:00 · 300 ml ×', '10:00 · 500 ml ×']);
  assert.deepEqual(await pg.$$eval('#b-botoes button', B => B.map(b => b.textContent)), ['300 ml', '500 ml']);
  assert.equal(await texto(pg, '#t-ml'), '1.100');
  assert.equal(await pg.isVisible('#t-bateu'), true);                      // passou de 1.000 ml
  await pg.click('[data-tirar-agua="2"]'); await pg.click('[data-tirar-agua="2"]');   // toque duplo tira
  assert.equal(await texto(pg, '#t-ml'), '600');
  assert.equal(await pg.isVisible('#t-bateu'), false);
  await beber(pg, 5000);
  assert.equal(await texto(pg, '#toast'), 'De 1 a 3.000 ml');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.agua_dia.map(x => [x.user_id, x.data, x.aguas]), [[DONO, '2026-10-19', [{ hora: '09:00', ml: 300 }, { hora: '10:00', ml: 300 }]]]);
  assert.deepEqual(erros, []); await ctx.close();
});

test('lembretes: em casa de hora em hora das 10 às 16; o atrasado da vez vira "Hora de beber água" e some ao beber', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-19T11:20:00-03:00') });   // segunda (casa)
  assert.deepEqual(await etiquetas(pg, '#l-horas'), ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
  assert.equal(await texto(pg, '#l-agora'), 'Hora de beber água (11:00)');
  assert.deepEqual(await pg.$$eval('#l-horas li', L => L.map(x => x.className)), ['atrasado', 'atrasado vez', 'depois', 'depois', 'depois', 'depois', 'depois']);
  await beber(pg, 250);
  assert.equal(await pg.isVisible('#l-agora'), false);
  assert.deepEqual(await pg.$$eval('#l-horas li', L => L.map(x => x.className)), ['atrasado', 'feito', 'depois', 'depois', 'depois', 'depois', 'depois']);
  assert.equal(await texto(pg, '#l-horas li:nth-child(2)'), '11:00 ✓');
  await ctx.close();
});

test('lembretes: depois das 17h não chama mais para beber (mesmo com o das 16:00 atrasado)', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-19T16:40:00-03:00') });
  assert.equal(await texto(pg, '#l-agora'), 'Hora de beber água (16:00)');
  await pg.clock.fastForward('00:30:00');                                   // 17:10
  await pg.evaluate(() => desenhar());
  assert.equal(await pg.isVisible('#l-agora'), false);
  assert.match(await pg.getAttribute('#l-horas li:last-child', 'class'), /atrasado/);   // a etiqueta continua mostrando que passou
  await ctx.close();
});

test('lembretes: presencial (qua e qui) e fim de semana de 2 em 2 horas; antes das 10 nada atrasado', async () => {
  for (const [quando, dia] of [['2026-10-21T08:00:00-03:00', 'quarta'], ['2026-10-24T08:00:00-03:00', 'sábado']]) {
    const { ctx, pg } = await abrirApp({ relogio: new Date(quando) });
    assert.deepEqual(await etiquetas(pg, '#l-horas'), ['10:00', '12:00', '14:00', '16:00'], dia);
    assert.equal(await pg.isVisible('#l-agora'), false, dia);
    await ctx.close();
  }
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-23T09:40:00-03:00') });   // sexta (casa): bebeu 9:40, conta para as 10
  await beber(pg, 200);
  assert.equal(await texto(pg, '#l-horas li:first-child'), '10:00 ✓');
  await ctx.close();
});

test('últimos 7 dias, sem internet e tabela ainda não criada', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.agua_dia.push({ user_id: DONO, data: '2026-10-18', aguas: [{ hora: '10:00', ml: 1200 }] });
  const { ctx, pg } = await abrirApp({ nuvem });
  assert.match(await texto(pg, '#semana li:nth-child(2)'), /^Ontem 1\.200 ml$/);
  await beber(pg, 300);
  await sincronizado(pg);
  nuvem.online = false;
  await pg.reload(); await pg.waitForSelector('#v-agua:not([hidden])');
  assert.equal(await texto(pg, '#t-ml'), '300');                          // cópia do aparelho
  await beber(pg, 200);
  await pg.waitForSelector('#sync:not([hidden])');
  nuvem.online = true;
  await pg.evaluate(() => enviar()); await sincronizado(pg);
  assert.equal(nuvem.tabelas.agua_dia.find(x => x.data === '2026-10-19').aguas.length, 2);
  await ctx.close();
  const sem = novaNuvem(); delete sem.tabelas.agua_dia;                   // migration ainda não aplicada: abre vazio, sem quebrar
  const b = await abrirApp({ nuvem: sem });
  assert.equal(await texto(b.pg, '#t-ml'), '0');
  assert.deepEqual(b.erros, []);
  await b.ctx.close();
});

test('outra conta não passa do login; tema escuro; sem rolagem para o lado', async () => {
  const a = await abrirApp({ conta: 'outra-conta' });
  await a.pg.waitForFunction(() => document.getElementById('l-erro').textContent);
  assert.equal(await texto(a.pg, '#l-erro'), 'Esta conta não tem acesso.');
  await a.ctx.close();
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-19T11:20:00-03:00') });
  await pg.emulateMedia({ colorScheme: 'light' });
  assert.equal(await pg.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(27, 30, 33)');
  for (const ml of [150, 200, 250, 300, 350, 500, 750]) await beber(pg, ml);
  assert.equal(await pg.locator('#b-botoes li').count(), 6);              // no máximo 6 botões
  assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await ctx.close();
});
