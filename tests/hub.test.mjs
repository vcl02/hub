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
  assert.deepEqual(cards.map(c => c.href), ['fin/', 'tr/']);   // os do hub; atalhos externos (class externo) à parte
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
  assert.match(ler('hub.js'), /navigator\.serviceWorker\.register\('sw\.js', \{ updateViaCache: 'none' \}\)/);
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

test('login do hub antes dos apps: mesma conta e mesmo supabase-js do tr', () => {
  assert.ok(html.indexOf('id="v-login"') < html.indexOf('id="v-apps"'));
  assert.match(html, /<main class="entrar" id="v-login" hidden>/);
  assert.match(html, /<main class="hub" id="v-apps" hidden>/);   // nada aparece antes de hub.js decidir
  const hub = ler('hub.js');
  assert.match(hub, /^'use strict';\n\/\/ /);
  const dono = codigo => codigo.match(/const DONO = '([0-9a-f-]+)'/)[1];
  assert.equal(dono(hub), dono(ler('tr/js/config.js')));
  assert.match(hub, /const SUPABASE_KEY = 'sb_publishable_/);
  assert.doesNotMatch(hub, /service_role|sb_secret_/);
  assert.ok(readFileSync(path.join(RAIZ, 'supabase.js')).equals(readFileSync(path.join(RAIZ, 'tr/supabase.js'))), 'supabase.js igual ao do tr');
  assert.match(html, /<script src="supabase\.js"><\/script>\n<script src="hub\.js"><\/script>/);
});

test('marca do hub em todo lugar: favicon, celular, login e o botão de volta nos apps', () => {
  assert.match(html, /<link rel="icon" href="icons\/hub\.svg" type="image\/svg\+xml">/);
  assert.match(html, /<link rel="icon" href="icons\/hub-32\.png" sizes="32x32" type="image\/png">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/hub-180\.png">/);
  assert.equal([...html.matchAll(/<h1><img class="marca" src="icons\/hub\.svg" alt=""/g)].length, 1);   // só no login; nos cards o título é só o texto
  assert.equal([...html.matchAll(/class="app-icone" src="icons\/hub\.svg"/g)].length, 0);   // nenhum card usa a marca
  assert.match(html, /href="https:\/\/wa\.me\/\d+"[\s\S]*?src="icons\/anotacoes\.svg"[\s\S]*?<span class="app-nome">Anotações<\/span>/);
  for (const arquivo of ['icons/hub.svg', 'icons/hub-32.png', 'icons/hub-180.png', 'icons/hub-192.png', 'icons/hub-512.png']) assert.ok(existe(arquivo), arquivo);
  const png = arquivo => { const b = readFileSync(path.join(RAIZ, arquivo)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  for (const [arquivo, lado] of [['icons/hub-32.png', 32], ['icons/hub-180.png', 180], ['icons/hub-192.png', 192], ['icons/hub-512.png', 512]]) assert.deepEqual(png(arquivo), [lado, lado], arquivo);
  // Mesmo desenho em traço no botão que volta ao hub, nos dois apps.
  const marca = codigo => codigo.match(/<circle cx="12" cy="12" r="3" ?\/><path d="M9\.9 9\.9 6\.6 6\.6[^"]*" ?\/>(<circle cx="(5|19)" cy="(5|19)" r="2" ?\/>){4}/);
  assert.ok(marca(ler('fin/index.html').slice(ler('fin/index.html').indexOf('id=voltarHub'))), 'fin');
  assert.ok(marca(ler('tr/index.html').slice(ler('tr/index.html').indexOf('id="i-hub"'))), 'tr');
});

test('atalho externo do Google Agenda: abre em outra aba; no Android, o app (intent) com a web de reserva', () => {
  assert.match(html, /<a class="app externo" id="agenda" href="https:\/\/calendar\.google\.com\/calendar\/r" target="_blank" rel="noopener"/);
  assert.ok(existe('icons/agenda.svg'));
  const hub = ler('hub.js');
  assert.match(hub, /intent:\/\/calendar\.google\.com\/calendar\/r#Intent;scheme=https;package=com\.google\.android\.calendar;S\.browser_fallback_url=\$\{encodeURIComponent\(web\)\};end/);
  assert.match(hub, /querySelectorAll\('\.app:not\(\.externo\)'\)/);   // ?volta nunca vai para o atalho externo
  assert.match(ler('sw.js'), /'\.\/icons\/agenda\.svg'/);
  assert.doesNotMatch(html, /chat\.whatsapp\.com|play\.google\.com/);   // cards Hub (grupo) e Água saíram
});
