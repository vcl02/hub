// Cardio na esteira depois do treino: ajustes, contagem regressiva, pausa, +5 min, gravação, resumo e retomada ao reabrir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, novaNuvem, sincronizado } from './helpers/app.mjs';

prepararApp();

// Uma série no 1º exercício e Finalizar: cai no resumo do treino de hoje, já sem a tela de parabéns
async function treinarEFinalizar(pg) {
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.clock.fastForward('10:00'); await pg.click('#t-feita');
  await pg.click('#e-finalizar'); await pg.click('#parabens-ok');
}
const texto = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ').trim();

test('cardio depois do treino: ajusta, conta para trás, pausa, +5 min e grava no treino do dia', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_medida.push({ user_id: 'x', data: '2026-10-19', hora: '07:00', peso: '90', cintura: null });   // pesagem do app Corpo
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-19T19:00:00'), nuvem });   // segunda: dia extra
  await treinarEFinalizar(pg);
  const bt = pg.locator('#f-cardio [data-ir="cardio"]');
  assert.equal(await bt.textContent(), 'Cardio na esteira');
  assert.match(await bt.getAttribute('class'), /primario/);                                   // segunda: em destaque
  await bt.click();
  assert.equal(await pg.textContent('#cd-relogio'), '20:00');                                 // sem cardio anterior: 20 min, 6 km/h, plano
  assert.deepEqual(await pg.locator('.cd-aj b').allTextContents(), ['20min', '6km/h', '0%']);
  await pg.click('[data-cd="min"][data-d="-1"]'); await pg.click('[data-cd="min"][data-d="-1"]');
  await pg.click('[data-cd="vel"][data-d="1"]'); await pg.click('[data-cd="incl"][data-d="1"]');
  assert.deepEqual(await pg.locator('.cd-aj b').allTextContents(), ['10min', '6,5km/h', '1%']);
  assert.equal(await pg.textContent('#cd-relogio'), '10:00');
  await pg.click('#cd-comecar');
  assert.equal(await pg.evaluate(() => db.treinos[0].fechado), true);                        // o treino para quando o cardio começa
  assert.equal(await pg.isVisible('#cd-ajustes'), false);
  await pg.clock.fastForward('04:00');
  assert.equal(await pg.textContent('#cd-relogio'), '6:00');
  assert.equal(await pg.textContent('#cd-sub'), 'de 10 min');
  assert.match(await pg.textContent('#cd-info'), /^6,5 km\/h · 1% · ~\d+ kcal$/);
  await pg.click('#cd-pausar');                                                               // pausado: o tempo não anda
  assert.equal(await pg.textContent('#cd-sub'), 'Pausado');
  assert.match(await pg.getAttribute('#cd-anel', 'class'), /pausado/);
  await pg.clock.fastForward('05:00');
  assert.equal(await pg.textContent('#cd-relogio'), '6:00');
  await pg.click('#cd-pausar'); await pg.click('#cd-mais');                                   // continua e ganha +5 min
  assert.equal(await pg.textContent('#cd-relogio'), '11:00');
  // Voltar ao resumo e à tela inicial não para o cardio (e não mostra os parabéns de novo)
  await pg.click('#v-cardio [data-voltar]');
  assert.equal(await pg.isVisible('#parabens'), false);
  assert.equal(await bt.textContent(), 'Voltar ao cardio');
  await pg.click('#v-fim [data-ir="inicio"]');
  assert.match(await texto(pg, '#i-treino'), /^Cardio na esteira ?1[01]:\d\d ?Abrir$/);
  await pg.click('#i-treino [data-ir="cardio"]');
  await pg.clock.fastForward('11:00');
  await pg.waitForSelector('#cd-resumo:not([hidden])');
  assert.equal(await pg.textContent('#cd-relogio'), '15:00');                                 // 4 + 11 min, sem a pausa
  assert.equal(await pg.textContent('#cd-sub'), 'Feito');
  assert.match(await pg.getAttribute('#cd-anel', 'class'), /feito/);
  // 6,5 km/h a 1%: MET 4,65 × basal 1.898 ÷ 24 × 0,25 h = 92
  assert.equal(await pg.textContent('#cd-info'), '15 min · 6,5 km/h · 1% · ~92 kcal');
  await pg.click('#cd-resumo');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.equal(await pg.isVisible('#parabens'), false);
  assert.match(await texto(pg, '#f-cardio'), /^Cardio ?15 min · 6,5 km\/h · 1% · ~92 kcal$/);
  assert.match(await texto(pg, '#f-tiles'), /Calorias ?~138 ?kcal, com o cardio/);              // treino de 10 min (46) + cardio (92)
  await sincronizado(pg);
  const { inicio, ...c } = nuvem.tabelas.tr_treino[0].cardio;
  assert.deepEqual(c, { ms: 15 * 60000, vel: 6.5, incl: 1 });
  assert.ok(inicio > 0);
  assert.deepEqual(erros, []); await ctx.close();
});

test('cardio continua com o app fechado e, se acabou nesse meio-tempo, grava ao abrir', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-21T19:00:00') });   // quarta
  await treinarEFinalizar(pg);
  assert.doesNotMatch(await pg.getAttribute('#f-cardio [data-ir="cardio"]', 'class'), /primario/);   // fora da segunda, sem destaque
  await pg.click('#f-cardio [data-ir="cardio"]'); await pg.click('#cd-comecar');            // 20 min
  await pg.clock.fastForward('05:00');
  await pg.reload(); await pg.waitForSelector('#v-inicio:not([hidden])');
  assert.match(await texto(pg, '#i-treino'), /^Cardio na esteira ?1[45]:\d\d ?Abrir$/);
  // App fechado por 30 min: a cópia do aparelho fica com a retomada de 30 min atrás (com a página aberta, o relógio falso
  // do teste roda os timers e o cardio acabaria antes de recarregar)
  await pg.evaluate(() => { const c = JSON.parse(store.get(K_CARDIO)); c.desde -= 30 * 6e4; store.set(K_CARDIO, JSON.stringify(c)); });
  await pg.reload(); await pg.waitForSelector('#v-inicio:not([hidden])');
  assert.deepEqual(await pg.evaluate(() => [db.treinos[0].cardio.ms, db.treinos[0].cardio.vel, store.get(K_CARDIO)]), [20 * 60000, 6, null]);
  assert.equal(await pg.isVisible('#i-treino'), false);
  // Tocar no dia de hoje na semana: o cardio no resumo, com lixeira (toque duplo) e Desfazer
  await pg.click('#i-semana [data-dia]');
  assert.match(await texto(pg, '#f-cardio'), /^Cardio ?20 min · 6 km\/h · 0%$/);                // sem pesagem no Corpo, sem calorias
  await pg.click('[data-apagar-cardio]'); await pg.click('[data-apagar-cardio]');
  assert.equal(await pg.evaluate(() => !!db.treinos[0].cardio), false);
  assert.equal(await pg.textContent('#f-cardio [data-ir="cardio"]'), 'Cardio na esteira');   // dá para fazer de novo
  await pg.click('#toast-desfazer');
  assert.equal(await pg.evaluate(() => db.treinos[0].cardio.ms), 20 * 60000);
  assert.deepEqual(erros, []); await ctx.close();
});

test('encerrar o cardio antes: toque duplo grava o tempo feito; menos de 1 min não grava', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-22T19:00:00') });   // quinta
  await treinarEFinalizar(pg);
  await pg.click('#f-cardio [data-ir="cardio"]'); await pg.click('#cd-comecar');
  await pg.clock.fastForward('00:30');
  await pg.click('#cd-encerrar');                                                             // 1º toque só arma
  assert.equal(await pg.isVisible('#cd-rodando'), true);
  await pg.click('#cd-encerrar');
  assert.equal(await pg.textContent('#toast-msg'), 'Cardio com menos de 1 min: não salvo');
  assert.equal(await pg.evaluate(() => !!db.treinos[0].cardio), false);
  assert.equal(await pg.isVisible('#cd-ajustes'), true);                                     // volta para os ajustes
  await pg.click('#cd-comecar');
  await pg.clock.fastForward('03:00');
  await pg.click('#cd-encerrar'); await pg.click('#cd-encerrar');
  assert.equal(await pg.evaluate(() => db.treinos[0].cardio.ms), 3 * 60000);
  assert.equal(await pg.textContent('#cd-sub'), 'Feito');
  assert.deepEqual(erros, []); await ctx.close();
});

test('sem treino hoje, o resumo de outro dia não oferece cardio', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-21T19:00:00') });
  await treinarEFinalizar(pg);
  await pg.clock.fastForward('24:00:00');                                                     // dia seguinte
  await pg.click('#v-fim [data-ir="inicio"]');
  await pg.click('#i-semana [data-dia]');                                                     // o treino de ontem
  assert.equal(await pg.isVisible('#f-cardio'), false);
  await ctx.close();
});
