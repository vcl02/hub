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
  assert.deepEqual(cards.map(c => c.href), ['fin/', 'tr/', 'al/', 'corpo/', 'agua/']);   // os do hub; atalhos externos (class externo) à parte
  for (const { href, icone } of cards) {
    assert.ok(existe(`${href}index.html`), href);
    assert.ok(existe(icone), icone);
  }
});

test('cada app volta para o hub (../)', () => {
  assert.match(ler('fin/index.html'), /<a id=voltarHub class=btIcone href="\.\.\/"/);
  assert.match(ler('tr/index.html'), /<a class="icon-btn" href="\.\.\/" id="i-hub"/);
  assert.match(ler('al/index.html'), /<a class="icon-btn" href="\.\.\/" id="i-hub"/);
  assert.match(ler('corpo/index.html'), /<a class="icon-btn" href="\.\.\/" id="i-hub"/);
  assert.match(ler('agua/index.html'), /<a class="icon-btn" href="\.\.\/" id="i-hub"/);
});

test('tema escuro único: hub, fin e tr com o mesmo fundo', () => {
  assert.match(ler('hub.css'), /--bg: #1B1E21;/);
  assert.match(ler('fin/css/base.css'), /--bg: #1B1E21;/);
  assert.match(ler('tr/css/base.css'), /--bg:#1B1E21;/);
  assert.match(ler('al/css/al.css'), /--bg:#1B1E21;/);
  assert.match(ler('corpo/css/corpo.css'), /--bg:#1B1E21;/);
  assert.match(ler('agua/css/agua.css'), /--bg:#1B1E21;/);
  for (const arquivo of ['index.html', 'fin/index.html', 'tr/index.html', 'al/index.html', 'corpo/index.html', 'agua/index.html']) assert.match(ler(arquivo), /<meta name=("theme-color"|theme-color) content="#1B1E21">/, arquivo);
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
  assert.match(ler('al/sw.js'), /k\.startsWith\('al-'\) && k !== CACHE_ESTATICO/);
  assert.match(ler('corpo/sw.js'), /k\.startsWith\('corpo-'\) && k !== CACHE_ESTATICO/);
  assert.match(ler('agua/sw.js'), /k\.startsWith\('agua-'\) && k !== CACHE_ESTATICO/);
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
  assert.ok(marca(ler('al/index.html').slice(ler('al/index.html').indexOf('id="i-hub"'))), 'al');
  assert.ok(marca(ler('corpo/index.html').slice(ler('corpo/index.html').indexOf('id="i-hub"'))), 'corpo');
  assert.ok(marca(ler('agua/index.html').slice(ler('agua/index.html').indexOf('id="i-hub"'))), 'agua');
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

test('card não fica selecionado ao voltar de um app: hover só com mouse, toque com efeito que some e foco solto ao voltar', () => {
  assert.match(ler('hub.css'), /@media \(hover: hover\) \{\s*\.app:hover \{/);
  assert.doesNotMatch(ler('hub.css').replace(/@media \(hover: hover\) \{[\s\S]*?\n\}/, ''), /\.app:hover/);
  const hub = ler('hub.js');
  for (const ev of ['pageshow', 'visibilitychange']) assert.match(hub, new RegExp(`'${ev}', voltou`));
  assert.match(hub, /'pagehide', soltarCard/);
  assert.match(ler('hub.css'), /\.app\.tocado \{/);                                  // o toque ainda dá a crescidinha
  assert.match(hub, /classList\.add\('tocado'\); toque = setTimeout\(soltarCard, ms\)/);   // e ela some sozinha
});

test('dados sobre mim num lugar só: corpo/perfil.js, carregado pelo tr, pelo al e pelo próprio Corpo', () => {
  const perfil = ler('corpo/perfil.js');
  assert.ok(!existe('perfil.js'), 'o perfil saiu da raiz');
  assert.match(perfil, /^'use strict';\n\/\/ /);
  const ctx = {};
  new Function('ctx', perfil.replace(/^'use strict';/, '') + '\nObject.assign(ctx, { PERFIL, ROTINA, idadeEm, tmb, kcalTreino, kcalEsteira, pesoNoDia, ordenarMedidas });')(ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.ROTINA)), { treino: [3, 4], treinoExtra: [1], presencial: [3, 4] });   // qua e qui · seg · qua e qui
  assert.match(ler('tr/js/config.js'), /const DIAS_FIXOS = ROTINA\.treino;/);
  assert.deepEqual({ ...ctx.PERFIL }, { altura: 1.78, nascimento: '2002-09-14', sexo: 'M' });
  assert.ok(Object.isFrozen(ctx.PERFIL));
  assert.equal(ctx.idadeEm('2026-09-13'), 23);   // véspera do aniversário
  assert.equal(ctx.idadeEm('2026-09-14'), 24);
  assert.equal(ctx.tmb(100, '2026-09-14'), 1998);   // 10×100 + 6,25×178 − 5×24 + 5
  assert.equal(ctx.kcalTreino(100, '2026-09-14', 36e5), 291);   // 3,5 MET × 1998 ÷ 24 × 1 h
  // Esteira (ACSM): 6 km/h no plano = caminhada, MET (3,5 + 0,1 × 100) ÷ 3,5 = 3,86 · 10 km/h a 2% = corrida,
  // MET (3,5 + 0,2 × 166,7 + 0,9 × 166,7 × 0,02) ÷ 3,5 = 11,38 · × 1998 ÷ 24 × 1 h
  assert.deepEqual([ctx.kcalEsteira(100, '2026-09-14', 36e5, 6, 0), ctx.kcalEsteira(100, '2026-09-14', 36e5, 10, 2)], [321, 947]);
  const M = ctx.ordenarMedidas([{ data: '2026-10-20', peso: '91' }, { data: '2026-10-10', peso: 93, hora: 'x' }, { data: '2026-10-22', cintura: 100 }, { data: 'ruim', peso: 1 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(M)), [{ data: '2026-10-10', hora: '', peso: 93 }, { data: '2026-10-20', hora: '', peso: 91 }, { data: '2026-10-22', hora: '', cintura: 100 }]);
  assert.deepEqual([ctx.pesoNoDia(M, '2026-10-01'), ctx.pesoNoDia(M, '2026-10-15'), ctx.pesoNoDia(M, '2026-10-30'), ctx.pesoNoDia([], '2026-10-30')], [93, 93, 91, null]);
  for (const app of ['tr', 'al', 'agua']) {
    assert.match(ler(`${app}/index.html`), /<script src="\.\.\/corpo\/perfil\.js"><\/script>/, app);
    assert.match(ler(`${app}/sw.js`), /'\.\.\/corpo\/perfil\.js'/, app);
    assert.doesNotMatch(ler(`${app}/index.html`), /src="\.\.\/perfil\.js"/, app);
  }
  assert.match(ler('corpo/index.html'), /<script src="perfil\.js"><\/script>/);
  assert.doesNotMatch(ler('tr/js/config.js'), /const (ALTURA|NASCIMENTO|SEXO|MET)\b/, 'perfil e conta do treino não se repetem no tr');
  assert.doesNotMatch(ler('al/js/config.js'), /const (ALTURA|NASCIMENTO|SEXO|MET_MUSCULACAO)\b/, 'nem no al');
  // Só o Corpo grava as pesagens: tr e al não escrevem em corpo_medida nem em tr_medida
  for (const f of ['tr/js/banco.js', 'al/js/banco.js']) assert.doesNotMatch(ler(f), /tr_medida|corpo_medida'?\s*[:\]]/, f);
});
