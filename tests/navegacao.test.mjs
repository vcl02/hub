// No navegador: serve a raiz do hub em /hub/, faz login na página inicial e abre o fin e o tr com a mesma sessão.
// Usa o Playwright e o Supabase falso do tr (tr/tests/helpers); nada sai pra rede.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeSupabase, novaNuvem } from '../tr/tests/helpers/app.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(RAIZ, 'tr', 'package.json'))('playwright');
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
let servidor, navegador, base;

before(async () => {
  servidor = createServer(async (req, res) => {
    let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/hub/, '');
    if (caminho.endsWith('/')) caminho += 'index.html';
    const arquivo = path.join(RAIZ, path.normalize(caminho));
    if (!arquivo.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
    try { res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' }).end(await readFile(arquivo)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}/hub/`;   // mesmo caminho do GitHub Pages
  navegador = await chromium.launch();
});
after(async () => { await navegador?.close(); servidor?.close(); });

// Tudo fora do servidor local é abortado, menos o Supabase falso (registrado depois, tem prioridade).
async function abrir(url, { conta, nuvem = novaNuvem() } = {}) {
  const ctx = await navegador.newContext({ serviceWorkers: 'block' });
  await ctx.route(u => !u.href.startsWith(base), r => r.abort());
  await fakeSupabase(ctx, nuvem, conta);
  // O fin carrega o supabase-js do CDN com integrity (SRI); sem rede no teste, vai a cópia local
  // (a do tr, 2.118.0) e o HTML do fin chega sem o atributo integrity, só nesta cópia de teste.
  const supabaseLocal = await readFile(path.join(RAIZ, 'supabase.js'));
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@/, r => r.fulfill({ contentType: 'text/javascript', body: supabaseLocal }));
  await ctx.route(u => u.href.startsWith(base) && /\/hub\/fin\/(index\.html)?$/.test(u.pathname), async r => {
    const html = await readFile(path.join(RAIZ, 'fin', 'index.html'), 'utf8');
    await r.fulfill({ contentType: 'text/html', body: html.replace(/\s+integrity="[^"]*"/g, '') });
  });
  const pg = await ctx.newPage();
  const faltando = [], erros = [];
  pg.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) faltando.push(`${r.status()} ${r.url()}`); });
  pg.on('pageerror', e => erros.push(e.message));
  await pg.goto(url);
  return { ctx, pg, faltando, erros };
}
const entrar = async (pg, usuario, senha) => {
  await pg.fill('#l-usuario', usuario); await pg.fill('#l-senha', senha); await pg.press('#l-senha', 'Enter');
};

test('login antes de tudo: sem sessão só aparece o login; senha errada e usuário desconhecido dão a mesma mensagem', async () => {
  const { ctx, pg, erros } = await abrir(base);
  await pg.waitForSelector('#v-login:not([hidden])');
  assert.equal(await pg.isVisible('#v-apps'), false);
  assert.equal(await pg.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(27, 30, 33)');
  await entrar(pg, 'eu@teste.com', 'errada');
  await pg.waitForFunction(() => document.getElementById('l-erro').textContent);
  assert.equal(await pg.textContent('#l-erro'), 'Usuário ou senha inválidos.');
  await entrar(pg, 'fulano', 'senha123');   // nem chega ao Supabase
  assert.equal(await pg.textContent('#l-erro'), 'Usuário ou senha inválidos.');
  assert.equal(await pg.isVisible('#v-apps'), false);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('sem internet no login: avisa que é a conexão, não a senha', async () => {
  const nuvem = novaNuvem(); nuvem.online = false;
  const { ctx, pg } = await abrir(base, { nuvem });
  await entrar(pg, 'eu@teste.com', 'senha123');
  await pg.waitForFunction(() => document.getElementById('l-erro').textContent);
  assert.equal(await pg.textContent('#l-erro'), 'Sem conexão. Tente de novo.');
  assert.equal(await pg.isEnabled('#l-usuario'), true);               // destrava pra tentar de novo
  assert.equal(await pg.textContent('#l-botao'), 'Entrar');
  await ctx.close();
});

test('outra conta entra no Supabase mas não passa do login', async () => {
  const { ctx, pg } = await abrir(base, { conta: 'outra-conta' });
  await entrar(pg, 'eu@teste.com', 'senha123');
  await pg.waitForFunction(() => document.getElementById('l-erro').textContent);
  assert.equal(await pg.textContent('#l-erro'), 'Esta conta não tem acesso.');
  assert.equal(await pg.isVisible('#v-apps'), false);
  await ctx.close();
});

test('entrou no hub: os apps abrem direto com a mesma sessão, sem login próprio', async () => {
  const { ctx, pg, faltando, erros } = await abrir(base);
  await entrar(pg, 'eu@teste.com', 'senha123');
  await pg.waitForSelector('#v-apps:not([hidden])');
  assert.deepEqual(await pg.$$eval('.app-nome', s => s.map(x => x.textContent)), ['fin', 'Diário de Carga', 'Agenda', 'Hub']);
  await pg.reload();                                                   // sessão salva: entra direto
  await pg.waitForSelector('#v-apps:not([hidden])');
  assert.equal(await pg.isVisible('#v-login'), false);
  await pg.click('a[href="tr/"]');
  await pg.waitForURL(`${base}tr/`);
  await pg.waitForSelector('#v-inicio:not([hidden])');                 // tela inicial do tr, não o login dele
  assert.equal(await pg.isVisible('#v-bloqueio'), false);
  await pg.goBack();
  await pg.click('a[href="fin/"]');
  await pg.waitForURL(`${base}fin/`);
  await pg.waitForFunction(() => getComputedStyle(document.getElementById('app')).display === 'block');
  assert.equal(await pg.evaluate(() => getComputedStyle(document.getElementById('login')).display), 'none');
  assert.equal(await pg.getAttribute('#voltarHub', 'href'), '../');
  assert.deepEqual(faltando, []);
  assert.deepEqual(erros.filter(e => !/tabela\?|404|Falh|carreg/i.test(e)), []);   // o falso não tem as tabelas do fin
  await ctx.close();
});

test('Sair no hub pede toque duplo e encerra a sessão dos apps também', async () => {
  const { ctx, pg } = await abrir(base);
  await entrar(pg, 'eu@teste.com', 'senha123');
  await pg.waitForSelector('#v-apps:not([hidden])');
  await pg.click('#sair');
  assert.match(await pg.getAttribute('#sair', 'class'), /armado/);    // 1º toque: só arma
  assert.equal(await pg.isVisible('#v-apps'), true);
  await pg.click('#sair');
  await pg.waitForSelector('#v-login:not([hidden])');
  await pg.goto(`${base}tr/`);                                         // sem sessão, o tr manda pro login do hub
  await pg.waitForURL(`${base}?volta=tr%2F`);
  await pg.waitForSelector('#v-login:not([hidden])');
  await entrar(pg, 'eu@teste.com', 'senha123');
  await pg.waitForURL(`${base}tr/`);                                   // e volta pro tr depois de entrar
  await pg.waitForSelector('#v-inicio:not([hidden])');
  await ctx.close();
});

test('link do fin sem sessão: login no hub e volta pro mesmo ciclo', async () => {
  const { ctx, pg } = await abrir(`${base}fin/?ciclo=2026-10`);
  await pg.waitForURL(`${base}?volta=fin%2F%3Fciclo%3D2026-10`);
  await pg.waitForSelector('#v-login:not([hidden])');
  await entrar(pg, 'eu@teste.com', 'senha123');
  await pg.waitForURL(url => url.href.startsWith(`${base}fin/`));
  await pg.waitForFunction(() => getComputedStyle(document.getElementById('app')).display === 'block');
  await ctx.close();
});

test('?volta só leva para a pasta de um app do hub, nunca para fora', async () => {
  for (const volta of ['https://exemplo.test/', '//exemplo.test/', 'fin/../../x', 'javascript:alert(1)', 'outro/']) {
    const { ctx, pg } = await abrir(`${base}?volta=${encodeURIComponent(volta)}`);
    await entrar(pg, 'eu@teste.com', 'senha123');
    await pg.waitForSelector('#v-apps:not([hidden])');                 // fica nos cards
    assert.ok(pg.url().startsWith(base), volta);
    await ctx.close();
  }
});

test('fin e tr carregam todos os próprios arquivos em subpasta (caminhos relativos)', async () => {
  for (const app of ['fin/', 'tr/']) {
    const { ctx, faltando } = await abrir(base + app);
    assert.deepEqual(faltando, [], app);
    await ctx.close();
  }
});
