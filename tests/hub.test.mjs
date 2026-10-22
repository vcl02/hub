// Estrutura da página inicial do hub (sem navegador): cards, PWA, service workers e workflows da raiz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = arquivo => readFileSync(path.join(RAIZ, arquivo), 'utf8');
const existe = arquivo => existsSync(path.join(RAIZ, arquivo));
const html = ler('index.html');
const cards = [...html.matchAll(/<a class="app" href="([^"]+)" style="--cor:#[0-9A-F]{6}">\s*<img class="app-icone" src="([^"]+)"/g)].map(m => ({ href: m[1], icone: m[2] }));

test('um card por app; cada um aponta para uma pasta com index.html e um ícone que existe', () => {
  assert.deepEqual(cards.map(c => c.href), ['fin/', 'tr/']);
  for (const { href, icone } of cards) {
    assert.ok(existe(`${href}index.html`), href);
    assert.ok(existe(icone), icone);
  }
});

test('cada app volta para o hub (../)', () => {
  assert.match(ler('fin/index.html'), /<a id=voltarHub class=btIcone href="\.\.\/"/);
  assert.match(ler('tr/index.html'), /<a class="icon-btn" href="\.\.\/" id="i-hub"/);
});

test('tema escuro único: hub, fin e tr com o mesmo fundo', () => {
  assert.match(ler('hub.css'), /--bg: #1B1E21;/);
  assert.match(ler('fin/css/base.css'), /--bg: #1B1E21;/);
  assert.match(ler('tr/css/base.css'), /--bg:#1B1E21;/);
  for (const arquivo of ['index.html', 'fin/index.html', 'tr/index.html']) assert.match(ler(arquivo), /<meta name=("theme-color"|theme-color) content="#1B1E21">/, arquivo);
  assert.match(html, /<meta name="color-scheme" content="dark">/);
});

test('PWA do hub: manifest válido, ícones existem, service worker registrado', () => {
  const manifest = JSON.parse(ler('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const icone of manifest.icons) assert.ok(existe(icone.src), icone.src);
  assert.match(html, /navigator\.serviceWorker\.register\('sw\.js', \{ updateViaCache: 'none' \}\)/);
});

test('service workers dividem a origem sem apagar o cache um do outro', () => {
  const sw = ler('sw.js');
  const arquivos = JSON.parse(sw.match(/const ARQUIVOS_ESTATICOS = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  for (const arquivo of arquivos) if (arquivo !== './') assert.ok(existe(arquivo), arquivo);
  assert.doesNotMatch(sw, /caches\.delete/);
  assert.match(sw, /if \(!ENDERECOS\.has\(url\.href\)\) return;/);   // nunca atende fin/ nem tr/
  assert.match(ler('tr/sw.js'), /k\.startsWith\('carga-'\) && k !== CACHE_ESTATICO/);
  assert.doesNotMatch(ler('fin/service-worker.js'), /caches\.delete/);
});

test('workflows só na raiz (nas pastas dos apps o GitHub não roda)', () => {
  assert.ok(!existe('fin/.github') && !existe('tr/.github'));
  const validacao = ler('.github/workflows/validacao.yml');
  assert.match(validacao, /working-directory: tr\n\s*run: npm ci && npx playwright install --with-deps chromium/);
  assert.match(validacao, /run: node scripts\/check\.mjs/);
  assert.match(ler('.github/workflows/avisar-pages-publicado.yml'), /Idempotency-Key': `hub-pages-\$\{commit\}`/);
  assert.ok(existe('.nojekyll'));
});
