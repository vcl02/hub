// Testes de ponta a ponta no Chromium (Playwright). Rodar: npm install && npx playwright install chromium && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
let servidor, url, navegador, novaVersao = false;   // novaVersao: simula um deploy alterando o app.js

before(async () => {
  servidor = http.createServer((req, res) => {
    let p = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
    if (p.endsWith(path.sep)) p += 'index.html';
    fs.readFile(p, (e, d) => {
      if (e) { res.writeHead(404); res.end(); return; }
      if (novaVersao && p.endsWith('app.js')) d = Buffer.concat([d, Buffer.from('\n// deploy novo')]);
      res.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream' }); res.end(d);
    });
  });
  await new Promise(r => servidor.listen(0, r));
  url = `http://localhost:${servidor.address().port}/`;
  navegador = await chromium.launch();
});
after(async () => { await navegador?.close(); servidor?.close(); });

// Fontes do Google são bloqueadas para o teste não depender de internet
async function abrirApp({ relogio } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const pg = await ctx.newPage(), erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  if (relogio) await pg.clock.install({ time: relogio });
  await pg.goto(url);
  await pg.fill('#l-senha', '1234'); await pg.fill('#l-rep', '1234'); await pg.click('#l-btn');
  await pg.waitForSelector('#v-inicio:not([hidden])');
  return { ctx, pg, erros };
}
async function arrastar(ctx, pg, x1, x2, y = 600) {
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / 10, y }] }); await pg.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pg.waitForTimeout(450);
}
const linhas = async pg => (await pg.locator('#t-plano li').allTextContents()).map(s => s.replace(/\s+/g, ' ').replace(/[−+]/g, '').trim());

test('pirâmide usa o passo da máquina e começa com aquecimento', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.tap('.slot >> nth=0');
  await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  assert.deepEqual(await linhas(pg), ['Aquecimento20 kg × 15', 'Série 140 kg × 12', 'Série 245 kg × 10', 'Série 350 kg × 8']);
  assert.match(await pg.textContent('#e-passo'), /passo de 5 kg/);
  assert.deepEqual(erros, []); await ctx.close();
});

test('salva sozinho a cada série, ajusta reps e desfaz a última série', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.tap('.slot >> nth=0');
  await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita');                                                                // aquecimento: ainda nada salvo
  assert.match(await pg.textContent('#e-historico'), /Nenhum registro/);
  await pg.click('#t-feita'); await pg.click('#t-feita');                                    // séries 1 e 2, sem esperar o descanso
  assert.match(await pg.textContent('#e-historico'), /40 kg\s*12\/10/);
  await pg.click('[data-rep="1"][data-d="-1"]');                                            // série 2: fez 9
  await pg.click('#t-feita');                                                                // série 3
  assert.match(await pg.textContent('#e-salvo'), /Salvo: 40 kg · 12\/9\/8/);
  await pg.click('#toast-desfazer');                                                         // toque duplo sem querer na série 3
  assert.match(await pg.textContent('#e-historico'), /40 kg\s*12\/9(?!\/)/);
  assert.equal(await pg.locator('#t-plano li.ok').count(), 3);
  assert.deepEqual(erros, []); await ctx.close();
});

test('peso trocado depois das séries atualiza o registro; trocar de variação não duplica', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita');
  await pg.fill('#e-carga', '42,5'); await pg.dispatchEvent('#e-carga', 'input');
  assert.match(await pg.textContent('#e-salvo'), /42,5 kg/);
  await pg.click('[data-var="1"]');                                                          // trocou para o substituto
  const hoje = await pg.evaluate(() => db.registros.filter(r => r.data === hoje()).length);
  assert.equal(hoje, 1);
  await ctx.close();
});

test('aquecimento só no 1º exercício de cada região', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-pular');
  await arrastar(ctx, pg, 330, 60);                                                          // 2º de pernas
  assert.equal((await linhas(pg)).length, 3);
  await arrastar(ctx, pg, 330, 60);                                                          // 1º da parte de cima
  assert.equal((await linhas(pg))[0].startsWith('Aquecimento'), true);
  await ctx.close();
});

test('arrastar para nas pontas da lista', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0');
  await arrastar(ctx, pg, 60, 330); assert.equal(await pg.textContent('#e-pos'), '1/6');
  for (let i = 0; i < 6; i++) await arrastar(ctx, pg, 330, 60);
  assert.equal(await pg.textContent('#e-pos'), '6/6');
  await ctx.close();
});

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

test('tempo de treino fecha após 30 min sem mexer', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-21T19:00:00') });
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.clock.fastForward('25:00'); await pg.click('#t-feita');                           // última interação 19:25
  await pg.goBack(); await pg.clock.fastForward('45:00');
  await pg.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  assert.match(await pg.textContent('#i-treino'), /19:00–19:25.*25 min/);
  await ctx.close();
});

test('séries do dia continuam depois de recarregar', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=1'); await pg.fill('#e-carga', '25'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita');
  await pg.reload();                                                                         // "manter desbloqueado" vem marcado
  await pg.waitForSelector('#v-exercicio:not([hidden])');
  assert.equal(await pg.inputValue('#e-carga'), '25');
  assert.equal(await pg.locator('#t-plano li.ok').count(), 1);
  assert.equal(await pg.isVisible('#t-rodando'), true);
  await ctx.close();
});

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
  assert.deepEqual(r.registros[0].reps, [12, 12, 12]);
  assert.equal(r.exercicios[0].reps, 12);                                                   // "10–12" vira 12
  assert.deepEqual(r.medidas, []);
  await ctx.close();
});

test('pesagem guarda o horário e avisa quando foge do habitual', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.click('#i-corpo');
  assert.match(await pg.textContent('#c-aviso'), /mesmo horário/i);
  await pg.fill('#c-hora', '07:00'); await pg.fill('#c-peso', '90'); await pg.click('#c-form button[type=submit]');
  assert.match(await pg.textContent('#c-historico'), /07:00/);
  assert.equal(await pg.inputValue('#c-hora'), '07:00');                                    // horário habitual já vem preenchido
  await pg.fill('#c-hora', '15:30'); await pg.dispatchEvent('#c-hora', 'input');
  assert.match(await pg.textContent('#c-aviso'), /Fora do seu horário/);
  assert.equal(await pg.getAttribute('#c-aviso', 'class'), 'aviso erro');
  assert.deepEqual(erros, []); await ctx.close();
});

test('recarrega sozinho quando sai uma versão nova (fora do treino)', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.waitForFunction(() => versaoAtual);                                               // versão rodando registrada
  novaVersao = true;
  try {
    const recarregou = pg.waitForEvent('load');
    await pg.evaluate(() => checarAtualizacao(true));
    await recarregou;
  } finally { novaVersao = false; }
  await pg.waitForSelector('#v-inicio:not([hidden])');                                       // entra direto, sem senha
  await ctx.close();
});

test('não recarrega no meio do treino', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.waitForFunction(() => versaoAtual);
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  novaVersao = true;
  try { await pg.evaluate(() => checarAtualizacao(true)); await pg.waitForTimeout(1500); } finally { novaVersao = false; }
  assert.equal(await pg.isVisible('#v-exercicio'), true);
  assert.equal(await pg.evaluate(() => atualizacaoPendente), true);                          // aplica quando o treino acabar
  await ctx.close();
});

test('não recarrega no meio de um formulário', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.waitForFunction(() => versaoAtual);
  await pg.click('#i-corpo'); await pg.fill('#c-peso', '88');
  novaVersao = true;
  try { await pg.evaluate(() => checarAtualizacao(true)); await pg.waitForTimeout(1500); } finally { novaVersao = false; }
  assert.equal(await pg.inputValue('#c-peso'), '88');                                        // continua na tela, nada perdido
  assert.equal(await pg.evaluate(() => atualizacaoPendente), true);                          // atualiza ao sair dela
  await ctx.close();
});
