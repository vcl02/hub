// Fumaça no navegador: serve a raiz do hub e abre a página inicial, o fin e o tr pelas próprias URLs.
// Usa o Playwright instalado em tr/ (npm ci dentro de tr/); nada sai pra rede (Supabase e CDN abortados).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function abrir(url) {
  const ctx = await navegador.newContext({ serviceWorkers: 'block' });
  await ctx.route(url => !url.href.startsWith(base), r => r.abort());
  const pg = await ctx.newPage();
  const faltando = [];
  pg.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) faltando.push(`${r.status()} ${r.url()}`); });
  await pg.goto(url);
  return { ctx, pg, faltando };
}

test('página inicial mostra os apps e cada card abre o app dentro de /hub/', async () => {
  const { ctx, pg, faltando } = await abrir(base);
  assert.deepEqual(await pg.$$eval('.app span', s => s.map(x => x.textContent)), ['fin', 'Diário de Carga']);
  assert.equal(await pg.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(27, 30, 33)');
  await pg.click('a[href="fin/"]');
  await pg.waitForURL(`${base}fin/`);
  // O atalho do fin (#voltarHub) fica no cabeçalho, que só aparece depois do login.
  assert.equal(await pg.getAttribute('#voltarHub', 'href'), '../');
  await pg.goBack();
  await pg.waitForURL(base);
  await pg.click('a[href="tr/"]');
  await pg.waitForURL(`${base}tr/`);
  assert.deepEqual(faltando, []);
  await ctx.close();
});

test('fin e tr carregam todos os próprios arquivos em subpasta (caminhos relativos)', async () => {
  for (const app of ['fin/', 'tr/']) {
    const { ctx, faltando } = await abrir(base + app);
    assert.deepEqual(faltando, [], app);
    await ctx.close();
  }
});
