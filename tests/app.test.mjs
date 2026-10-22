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

// Supabase falso (auth + PostgREST em memória): o teste não depende de internet nem do banco real.
const CHAVES = { tr_exercicio: ['id'], tr_variacao: ['id'], tr_registro: ['variacao_id', 'data'], tr_treino: ['inicio'], tr_medida: ['data'] };
const novaNuvem = () => ({ online: true, tabelas: Object.fromEntries(Object.keys(CHAVES).map(t => [t, []])) });
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
async function fakeSupabase(ctx, nuvem, id = '2f9bc201-9966-4f37-9963-2f4b9ddab849') {
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'eu@teste.com', app_metadata: {}, user_metadata: {} };
  await ctx.route(/supabase\.co\//, async route => {
    const req = route.request(), u = new URL(req.url()), json = (corpo, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) });
    if (!nuvem.online) return route.abort('internetdisconnected');
    if (u.pathname === '/auth/v1/token') {
      const corpo = req.postDataJSON() || {};
      if (u.searchParams.get('grant_type') === 'password' && corpo.password !== 'senha123') return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      const exp = Math.floor(Date.now() / 1000) + 3600;
      return json({ access_token: b64u({ alg: 'HS256' }) + '.' + b64u({ sub: user.id, exp, role: 'authenticated' }) + '.x', token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user });
    }
    if (u.pathname === '/auth/v1/user') return json(user);
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    const t = u.pathname.replace('/rest/v1/', ''), linhas = nuvem.tabelas[t];
    if (!linhas) return json({ message: 'tabela?' }, 404);
    const filtros = [...u.searchParams].filter(([, v]) => v.startsWith('eq.')).map(([k, v]) => [k, v.slice(3)]);
    const chave = l => CHAVES[t].map(k => l[k]).join('|');
    if (req.method() === 'GET') { const off = +(u.searchParams.get('offset') || 0), lim = +(u.searchParams.get('limit') || 1e9); return json(linhas.slice(off, off + lim)); }
    if (req.method() === 'POST') {
      for (const l of [].concat(req.postDataJSON())) { const i = linhas.findIndex(x => chave(x) === chave(l)); if (i >= 0) linhas[i] = l; else linhas.push(l); }
      return route.fulfill({ status: 201 });
    }
    if (req.method() === 'DELETE') { nuvem.tabelas[t] = linhas.filter(l => !filtros.every(([k, v]) => String(l[k]) === v)); return route.fulfill({ status: 204 }); }
    return json({}, 405);
  });
}
// Fontes do Google são bloqueadas para o teste não depender de internet
async function abrirApp({ relogio, nuvem = novaNuvem(), antes } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await fakeSupabase(ctx, nuvem);
  const pg = await ctx.newPage(), erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  if (relogio) await pg.clock.install({ time: relogio });
  await pg.goto(url);
  if (antes) { await pg.evaluate(antes); await pg.reload(); }
  await pg.fill('#l-email', 'eu@teste.com'); await pg.fill('#l-senha', 'senha123'); await pg.press('#l-senha', 'Enter');
  await pg.waitForSelector('#v-inicio:not([hidden])');
  return { ctx, pg, erros, nuvem };
}
const sincronizado = pg => pg.waitForFunction(() => !temPendente() && !enviando);
async function arrastar(ctx, pg, x1, x2, y = 600) {
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / 10, y }] }); await pg.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pg.waitForTimeout(450);
}
const linhas = async pg => (await pg.locator('#t-plano li').allTextContents()).map(s => s.replace(/\s+/g, ' ').replace(/[−+✎✓]/g, '').trim());

test('pirâmide usa o passo da máquina e começa com aquecimento', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.tap('.slot >> nth=0');
  await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  assert.deepEqual(await linhas(pg), ['Aquecimento20 kg × 15', 'Série 140 kg × 12', 'Série 245 kg × 10', 'Série 350 kg × 8']);
  assert.equal(await pg.textContent('#e-unidade'), 'kg');
  assert.deepEqual(erros, []); await ctx.close();
});

test('salva sozinho a cada série, ajusta reps e desfaz a última série', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.tap('.slot >> nth=0');
  await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita');                                                                // aquecimento: ainda nada salvo
  assert.match(await pg.textContent('#e-historico'), /Nenhum registro/);
  await pg.click('#t-feita'); await pg.click('#t-feita');                                    // séries 1 e 2, sem esperar o descanso
  assert.match(await pg.textContent('#e-historico'), /40\/45 kg\s*× 12\/10/);
  await pg.click('[data-linha="1"]'); await pg.click('[data-aj="reps"][data-d="-1"]');     // série 2: fez 9
  await pg.click('#t-feita');                                                                // série 3
  assert.match(await pg.textContent('#e-salvo'), /Salvo: 40\/45\/50 kg × 12\/9\/8/);
  await pg.click('#toast-desfazer');                                                         // toque duplo sem querer na série 3
  assert.match(await pg.textContent('#e-historico'), /40\/45 kg\s*× 12\/9(?!\/)/);
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
  await pg.reload();                                                                         // sessão do Supabase fica salva
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
  assert.deepEqual(r.registros[0].series, [{ kg: 40, reps: 12 }, { kg: 45, reps: 12 }, { kg: 50, reps: 12 }]);
  assert.equal(r.exercicios[0].reps, 12);                                                   // "10–12" vira 12
  assert.deepEqual(r.medidas, []);
  await ctx.close();
});

test('pesagem guarda o horário e avisa quando foge do habitual', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.click('#i-corpo');
  assert.equal(await pg.textContent('#c-aviso'), '');
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

test('por lado mostra o total; lb mostra o equivalente em kg', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#e-lados');
  assert.match(await pg.textContent('#e-conv'), /80 kg no total/);
  assert.match(await pg.textContent('#t-plano'), /40 kg\/lado × 12/);
  await pg.click('#e-lados'); await pg.click('#e-unidade');                                  // kg → lb
  assert.match(await pg.textContent('#e-conv'), /≈ 18,1 kg/);
  await ctx.close();
});

test('modos de pirâmide e edição do peso de uma série futura', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=1'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('[data-modo="invertida"]');
  assert.deepEqual((await linhas(pg)).slice(1), ['Série 140 kg × 8', 'Série 235 kg × 10', 'Série 330 kg × 12']);
  await pg.click('[data-modo="reta"]');
  assert.deepEqual((await linhas(pg)).slice(1), ['Série 140 kg × 12', 'Série 240 kg × 12', 'Série 340 kg × 12']);
  await pg.click('[data-linha="2"]'); await pg.fill('[data-aj-in="kg"]', '37'); await pg.dispatchEvent('[data-aj-in="kg"]', 'change');
  assert.match((await linhas(pg))[3], /^Série 337 kg × 12/);
  await ctx.close();
});

test('depois do último descanso vai para o próximo; no fim mostra o resumo', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.evaluate(() => { db.exercicios.forEach(e => { e.series = 1; }); });               // treino curto para o teste
  await pg.tap('.slot >> nth=4'); await pg.fill('#e-carga', '30'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita'); await pg.click('#t-pular');        // aquecimento + série + pula o descanso
  assert.equal(await pg.textContent('#e-nome'), 'Desenvolvimento máquina');                  // próximo que falta
  for (const nome of ['Leg press 45°', 'Cadeira flexora', 'Supino máquina', 'Puxada alta']) {
    await pg.fill('#e-carga', '20'); await pg.dispatchEvent('#e-carga', 'input');
    while (await pg.isVisible('#t-parado')) await pg.click('#t-feita');
    await pg.click('#t-pular');
    if (nome !== 'Puxada alta') assert.equal(await pg.textContent('#e-nome'), nome);
  }
  await pg.fill('#e-carga', '20'); await pg.dispatchEvent('#e-carga', 'input');
  while (await pg.isVisible('#t-parado')) await pg.click('#t-feita');
  await pg.click('#t-pular');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-tiles'), /6\/6/);
  await pg.click('#v-fim [data-ir="inicio"]');
  assert.match(await pg.textContent('#i-treino'), /Último treino/);                           // treino fechado
  assert.deepEqual(erros, []); await ctx.close();
});

test('nº do aparelho e anotações ficam salvos', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=2');
  await pg.fill('#e-equip', '12'); await pg.click('#e-dicas summary'); await pg.fill('#e-nota', 'banco no furo 4');
  await pg.waitForTimeout(700);
  await pg.reload(); await pg.waitForSelector('#v-exercicio:not([hidden])');
  assert.equal(await pg.inputValue('#e-equip'), '12');
  assert.equal(await pg.inputValue('#e-nota'), 'banco no furo 4');
  assert.match(await pg.textContent('#e-guia'), /Banco na altura/);
  await ctx.close();
});

test('editar o horário do treino e ver calorias', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-21T19:00:00') });
  await pg.click('#i-corpo'); await pg.fill('#c-peso', '90'); await pg.click('#c-form button[type=submit]'); await pg.goBack();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.clock.fastForward('10:00'); await pg.click('#t-feita');
  await pg.click('#e-finalizar');
  await pg.waitForSelector('#v-fim:not([hidden])');
  await pg.click('#v-fim [data-ir="inicio"]');
  await pg.click('[data-editar-treino]');
  await pg.fill('#et-fim', '19:50'); await pg.click('[data-salvar-treino]');
  assert.match(await pg.textContent('#i-treinos'), /19:00–19:50 · ~263 kcal/);              // 3,5 × 90 kg × 50/60 h
  assert.deepEqual(erros, []); await ctx.close();
});

test('anotação digitada fica no exercício certo mesmo trocando rápido', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-equip', '7');
  await pg.evaluate(() => trocarExercicio(1));                                               // troca antes de 0,5 s
  await pg.waitForTimeout(700);
  const r = await pg.evaluate(() => db.exercicios.map(e => e.variacoes[0].equip || ''));
  assert.deepEqual(r.slice(0, 2), ['7', '']);
  await ctx.close();
});

test('um treino por dia: depois de finalizar, trava; dá para reabrir', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita');
  await pg.click('#e-finalizar'); await pg.click('#v-fim [data-ir="inicio"]');
  await pg.tap('.slot >> nth=1');
  assert.equal(await pg.isVisible('#e-travado'), true);
  const antes = await pg.evaluate(() => T.series);
  await pg.click('#t-feita', { force: true });                                               // bloqueado
  assert.deepEqual(await pg.evaluate(() => T.series), antes);
  await pg.click('#e-travado [data-reabrir]');
  assert.equal(await pg.isVisible('#e-travado'), false);
  await pg.fill('#e-carga', '30'); await pg.dispatchEvent('#e-carga', 'input'); await pg.click('#t-feita');
  assert.equal(await pg.evaluate(() => db.treinos.length), 1);                               // continua o mesmo treino
  assert.deepEqual(erros, []); await ctx.close();
});

test('abrir o app e não treinar não trava o dia', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-21T18:00:00') });
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.clock.fastForward('40:00');                                                       // esteira, sem marcar série
  await pg.click('#t-feita');
  assert.equal(await pg.isVisible('#e-travado'), false);
  const t = await pg.evaluate(() => db.treinos.map(x => new Date(x.inicio).getHours() + ':' + new Date(x.inicio).getMinutes()));
  assert.deepEqual(t, ['18:40']);                                                           // começou de novo, sem 2º treino
  await ctx.close();
});

test('excluir um treino ao editar', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita');
  await pg.click('#e-finalizar'); await pg.click('#v-fim [data-ir="inicio"]');
  await pg.click('[data-editar-treino]');
  await pg.click('[data-excluir-treino]'); await pg.click('[data-excluir-treino]');            // confirma
  assert.equal(await pg.evaluate(() => db.treinos.length + db.registros.length), 0);
  assert.equal(await pg.isVisible('#i-hist-box'), false);
  await pg.click('#toast-desfazer');
  assert.equal(await pg.evaluate(() => db.treinos.length), 1);
  await ctx.close();
});

test('salva na nuvem e abre em outro aparelho', async () => {
  const a = await abrirApp();
  await a.pg.tap('.slot >> nth=0'); await a.pg.fill('#e-carga', '40'); await a.pg.dispatchEvent('#e-carga', 'input');
  await a.pg.click('#t-feita'); await a.pg.click('#t-feita');
  await sincronizado(a.pg);
  assert.equal(a.nuvem.tabelas.tr_exercicio.length, 6);
  assert.deepEqual(a.nuvem.tabelas.tr_registro.map(r => r.series), [[{ kg: 40, reps: 12 }]]);
  const b = await abrirApp({ nuvem: a.nuvem });                                              // outro aparelho, mesma conta
  assert.match(await b.pg.textContent('.slot >> nth=0'), /40kg.*12/);
  assert.deepEqual([...a.erros, ...b.erros], []); await a.ctx.close(); await b.ctx.close();
});

test('sem internet guarda no aparelho e envia ao reconectar', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();
  await sincronizado(pg);
  nuvem.online = false;
  await pg.click('#i-corpo'); await pg.fill('#c-peso', '91'); await pg.click('#c-form button[type=submit]');
  await pg.waitForFunction(() => erroSync);
  await pg.goBack();
  assert.match(await pg.textContent('#i-sync'), /Sem internet/);
  await pg.reload(); await pg.waitForSelector('#v-inicio:not([hidden])');                     // abre offline com a cópia local
  assert.match(await pg.textContent('#i-corpo'), /91 kg/);
  nuvem.online = true;
  await pg.evaluate(() => dispatchEvent(new Event('online')));
  await sincronizado(pg);
  assert.equal(nuvem.tabelas.tr_medida[0].peso, 91);
  assert.equal(await pg.isVisible('#i-sync'), false);
  assert.deepEqual(erros, []); await ctx.close();
});

test('senha errada não entra', async () => {
  const ctx = await navegador.newContext();
  await fakeSupabase(ctx, novaNuvem());
  const pg = await ctx.newPage(); await pg.goto(url);
  await pg.fill('#l-email', 'eu@teste.com'); await pg.fill('#l-senha', 'errada'); await pg.press('#l-senha', 'Enter');
  await pg.waitForFunction(() => $('l-erro').textContent);
  assert.match(await pg.textContent('#l-erro'), /inválidos/);
  assert.equal(await pg.isVisible('#v-inicio'), false);
  await ctx.close();
});

test('junta à conta o banco criptografado da versão antiga', async () => {
  // Monta o cofre antigo como a versão anterior gravava (AES-GCM, chave salva por "manter desbloqueado")
  const antes = async () => {
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']), iv = crypto.getRandomValues(new Uint8Array(12));
    const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
    const velho = { exercicios: [{ id: 'e1', grupo: 'Peito', regiao: 'Superior', variacoes: [{ id: 'v1', nome: 'Supino máquina' }] }],
      registros: [{ variacao: 'v1', data: '2026-10-21', series: [{ kg: 30, reps: 12 }] }], treinos: [{ inicio: 1, fim: 2 }], medidas: [] };
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(velho)));
    localStorage.setItem('carga.vault.v1', JSON.stringify({ it: 1, salt: b64(new Uint8Array(16)), iv: b64(iv), ct: b64(ct) }));
    localStorage.setItem('carga.key.v1', b64(await crypto.subtle.exportKey('raw', k)));
  };
  const { ctx, pg, nuvem, erros } = await abrirApp({ antes });
  await pg.waitForFunction(() => db.registros.length === 1);
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.tr_registro.map(r => r.variacao_id), ['v1']);
  assert.equal(await pg.evaluate(() => localStorage.getItem('carga.vault.v1')), null);
  assert.deepEqual(erros, []); await ctx.close();
});

test('não marca série sem peso (senão o treino não seria salvo)', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0');
  await pg.click('#t-feita');
  assert.equal(await pg.locator('#t-plano li.ok').count(), 0);
  assert.match(await pg.textContent('#toast-msg'), /Coloque o peso/);
  await ctx.close();
});

test('sair da conta volta para o login', async () => {
  const { ctx, pg } = await abrirApp();
  await sincronizado(pg);
  await pg.click('[data-ir="ajustes"]');
  assert.match(await pg.textContent('#a-info'), /eu@teste\.com.*Tudo salvo na nuvem/);
  await pg.click('#a-sair');
  await pg.waitForSelector('#v-bloqueio:not([hidden])');
  assert.equal(await pg.evaluate(() => localStorage.getItem('tr.db.2f9bc201-9966-4f37-9963-2f4b9ddab849')), null);
  await ctx.close();
});

test('outra conta do Supabase não entra', async () => {
  const ctx = await navegador.newContext();
  await fakeSupabase(ctx, novaNuvem(), 'outra-conta');
  const pg = await ctx.newPage(); await pg.goto(url);
  await pg.fill('#l-email', 'eu@teste.com'); await pg.fill('#l-senha', 'senha123'); await pg.press('#l-senha', 'Enter');
  await pg.waitForFunction(() => $('l-erro').textContent);
  assert.match(await pg.textContent('#l-erro'), /não tem acesso/);
  assert.equal(await pg.isVisible('#v-inicio'), false);
  await ctx.close();
});

test('treino finalizado sem séries salvas conta como feito e não é apagado ao abrir um exercício', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-21T20:00:00') });
  await pg.evaluate(() => { db.treinos.push({ inicio: new Date('2026-10-21T17:43').getTime(), fim: new Date('2026-10-21T18:37').getTime(), fechado: true }); gravar(); mostrar('inicio'); });
  assert.match(await pg.textContent('#i-cont'), /Treino feito/);
  assert.match(await pg.textContent('#i-semana .today'), /✓/);
  await pg.tap('.slot >> nth=0');
  assert.equal(await pg.isVisible('#e-travado'), true);
  await pg.goBack();
  assert.match(await pg.textContent('#i-treino'), /17:43–18:37/);                            // não recomeçou a contagem
  assert.equal(await pg.evaluate(() => db.treinos.length), 1);
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

test('lembrete da garrafinha nos dias de treino', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-21T17:00:00') });          // quarta
  assert.equal(await pg.isVisible('#i-agua'), true);
  await pg.click('#i-agua-ok');
  assert.equal(await pg.isVisible('#i-agua'), false);
  await pg.reload(); await pg.waitForSelector('#v-inicio:not([hidden])');
  assert.equal(await pg.isVisible('#i-agua'), false);                                        // não volta no mesmo dia
  await ctx.close();
  const sexta = await abrirApp({ relogio: new Date('2026-10-23T17:00:00') });
  assert.equal(await sexta.pg.isVisible('#i-agua'), false);                                   // dia de descanso
  await sexta.ctx.close();
});

test('ver o resumo de um treino antigo', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-22T19:00:00') });
  await pg.evaluate(() => {
    db.registros.push({ variacao: db.exercicios[0].variacoes[0].id, data: '2026-10-21', series: [{ kg: 40, reps: 12 }, { kg: 45, reps: 10 }] });
    db.treinos.push({ inicio: new Date('2026-10-21T17:43').getTime(), fim: new Date('2026-10-21T18:37').getTime(), fechado: true });
    gravar(); mostrar('inicio');
  });
  await pg.click('#i-treinos li[data-dia="2026-10-21"]');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-titulo'), /Resumo do treino/);
  assert.match(await pg.textContent('#f-data'), /21 de outubro/);
  assert.match(await pg.textContent('#f-lista'), /Leg press 45°.*40\/45 kg.*12\/10/);
  assert.match(await pg.textContent('#f-tiles'), /54 min/);
  await pg.goBack();
  await pg.click('[data-ir="treinos"]');
  assert.match(await pg.textContent('#t-dias'), /Qua 21\/10.*1 exercício.*54 min/);
  await pg.goBack();
  await pg.click('#i-semana [data-dia="2026-10-21"]');                                       // dia feito na semana também abre
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.deepEqual(erros, []); await ctx.close();
});

test('login aceita o usuário no lugar do e-mail; usuário desconhecido nem chega ao Supabase', async () => {
  const ctx = await navegador.newContext(), nuvem = novaNuvem(), emails = [];
  await fakeSupabase(ctx, nuvem);
  ctx.on('request', r => { if (r.url().includes('/auth/v1/token')) emails.push(r.postDataJSON()?.email); });
  const pg = await ctx.newPage(); await pg.goto(url);
  await pg.fill('#l-email', 'fulano'); await pg.fill('#l-senha', 'x'); await pg.press('#l-senha', 'Enter');
  assert.match(await pg.textContent('#l-erro'), /Usuário ou senha inválidos/);
  await pg.fill('#l-email', 'Victor'); await pg.fill('#l-senha', 'senha123'); await pg.press('#l-senha', 'Enter');
  await pg.waitForSelector('#v-inicio:not([hidden])');
  assert.deepEqual(emails, ['victor.cabrera0209@gmail.com']);
  await ctx.close();
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
