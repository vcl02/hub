// Estrutura da página inicial do hub (sem navegador): hábitos e atalhos, PWA, service workers e workflows da raiz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = arquivo => readFileSync(path.join(RAIZ, arquivo), 'utf8');
const existe = arquivo => existsSync(path.join(RAIZ, arquivo));
const html = ler('index.html');
const habitos = [...html.matchAll(/<a class="app habito" href="([^"]+)" data-habito="([a-z]+)" style="--cor:#[0-9A-F]{6}">\s*<img class="app-icone" src="([^"]+)"/g)].map(m => ({ href: m[1], id: m[2], icone: m[3] }));
const atalhos = [...html.matchAll(/<a class="app atalho" href="([^"]+)" style="--cor:#[0-9A-F]{6}">\s*<img class="app-icone" src="([^"]+)"/g)].map(m => ({ href: m[1], icone: m[2] }));

test('um hábito por linha (os de habitos.js, o Fin pela Besteira); cada um aponta para uma pasta com index.html e um ícone que existe', () => {
  assert.deepEqual(habitos.map(h => [h.id, h.href]), [['treino', 'tr/'], ['deficit', 'al/'], ['peso', 'corpo/'], ['sono', 'corpo/'], ['agua', 'agua/'], ['besteira', 'fin/']]);
  const lista = [...ler('habitos.js').matchAll(/\{ id: '([a-z]+)', nome: '[^']+', pasta: '([^']+)' \}/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(lista, habitos.map(h => [h.id, h.href]));            // mesma lista e ordem do habitos.js
  assert.deepEqual(atalhos.map(a => a.href), []);                       // o Fin virou o hábito Besteira; os externos (class externo) à parte
  for (const { href, icone } of [...habitos, ...atalhos]) {
    assert.ok(existe(`${href}index.html`), href);
    assert.ok(existe(icone), icone);
  }
  assert.ok(html.indexOf('class="habitos"') < html.indexOf('class="doca"'), 'atalhos depois dos hábitos');
});

test('cada app volta para o hub (../)', () => {
  assert.match(ler('fin/index.html'), /<a id=voltarHub class=btIcone href="\.\.\/"/);
  assert.match(ler('tr/index.html'), /<a class="(icon-btn|bt-ic)" href="\.\.\/" id="i-hub"/);   // bt-ic: o botão da base comum
  assert.match(ler('al/index.html'), /<a class="(icon-btn|bt-ic)" href="\.\.\/" id="i-hub"/);   // bt-ic: o botão da base comum
  assert.match(ler('corpo/index.html'), /<a class="(icon-btn|bt-ic)" href="\.\.\/" id="i-hub"/);   // bt-ic: o botão da base comum
  assert.match(ler('agua/index.html'), /<a class="(icon-btn|bt-ic)" href="\.\.\/" id="i-hub"/);   // bt-ic: o botão da base comum
});

test('tema escuro único: hub, fin e tr com o mesmo fundo', () => {
  assert.match(ler('hub.css'), /--bg: #1B1E21;/);
  assert.match(ler('fin/css/base.css'), /--bg: #1B1E21;/);
  assert.match(ler('tr/css/base.css'), /--bg:#1B1E21;/);
  assert.match(ler('al/css/al.css'), /--bg:#1B1E21;/);
  assert.match(ler('corpo/index.html'), /<link rel="stylesheet" href="\.\.\/base\/tokens\.css">/);   // na base comum
  assert.match(ler('base/tokens.css'), /--bg:#1B1E21;/);   // módulo na base comum: o fundo vem de lá
  assert.match(ler('agua/index.html'), /<link rel="stylesheet" href="\.\.\/base\/tokens\.css">/);
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
  for (const f of ['./habitos.js', './corpo/perfil.js', './agua/bebidas.js', './al/gasto.js']) assert.ok(arquivos.includes(f), f);   // a página inicial abre sem internet
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
  // supabase-js, os módulos compartilhados (dados sobre mim e gasto do dia), os hábitos e só então hub.js
  assert.match(html, /<script src="supabase\.js"><\/script>\n<script src="corpo\/perfil\.js"><\/script>\n<script src="agua\/bebidas\.js"><\/script>\n<script src="al\/gasto\.js"><\/script>\n<script src="habitos\.js"><\/script>\n<script src="hub\.js"><\/script>/);
});

test('marca do hub em todo lugar: favicon, celular, login e o botão de volta nos apps', () => {
  assert.match(html, /<link rel="icon" href="icons\/hub\.svg" type="image\/svg\+xml">/);
  assert.match(html, /<link rel="icon" href="icons\/hub-32\.png" sizes="32x32" type="image\/png">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/hub-180\.png">/);
  assert.equal([...html.matchAll(/<h1><img class="marca" src="icons\/hub\.svg" alt=""/g)].length, 1);   // só no login; nos hábitos o título é só o texto
  assert.equal([...html.matchAll(/class="app-icone" src="icons\/hub\.svg"/g)].length, 0);   // nenhum hábito ou atalho usa a marca
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
  assert.match(html, /<a class="app atalho externo" id="agenda" href="https:\/\/calendar\.google\.com\/calendar\/r" target="_blank" rel="noopener"/);
  assert.ok(existe('icons/agenda.svg'));
  const hub = ler('hub.js');
  assert.match(hub, /intent:\/\/calendar\.google\.com\/calendar\/r#Intent;scheme=https;package=com\.google\.android\.calendar;S\.browser_fallback_url=\$\{encodeURIComponent\(web\)\};end/);
  assert.match(hub, /querySelectorAll\('\.app:not\(\.externo\)'\)/);   // ?volta nunca vai para o atalho externo
  assert.match(ler('sw.js'), /'\.\/icons\/agenda\.svg'/);
  assert.doesNotMatch(html, /chat\.whatsapp\.com|play\.google\.com/);   // cards Hub (grupo) e Água saíram
});

test('hábito ou atalho não fica selecionado ao voltar de um app: hover só com mouse, toque com efeito que some e foco solto ao voltar', () => {
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
  // Gasto do dia num lugar só: al/gasto.js, o mesmo no al e no hábito do déficit
  assert.match(ler('al/index.html'), /<script src="\.\.\/corpo\/perfil\.js"><\/script>\n<script src="\.\.\/agua\/bebidas\.js"><\/script>\n<script src="gasto\.js"><\/script>/);
  assert.doesNotMatch(ler('al/js/config.js'), /const (FATOR_ATIVIDADE|DEFICIT_META)\b/);
  assert.doesNotMatch(ler('hub.js') + ler('habitos.js'), /const (FATOR_ATIVIDADE|DEFICIT_META|MET_MUSCULACAO)\b/);
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

test('histórico no banco: toda tabela dos apps (menos o Fin, que tem o dele) com gatilho para hub_historico, formato DataGrip', () => {
  const sql = ler('migrations/00-historico-apps.sql');
  assert.match(sql, /^begin;$/m); assert.match(sql, /^commit;$/m); assert.doesNotMatch(sql, /^do \$\$/m);
  for (const linha of sql.split('\n').filter(l => l.trim().startsWith('--'))) assert.ok(!linha.includes(';'), `; em comentário: ${linha}`);
  // As migrations da raiz juntas (00 e as que acrescentam tabela nova, como a 01 das marmitas), só reaproveitando a função da 00
  const todas = readdirSync(path.join(RAIZ, 'migrations')).sort().map(n => ler(`migrations/${n}`));
  for (const m of todas.slice(1)) { assert.match(m, /^begin;$/m); assert.match(m, /^commit;$/m); assert.doesNotMatch(m, /\$\$/, 'tabela nova não cria função'); }
  const comGatilho = todas.flatMap(m => [...m.matchAll(/create trigger hub_historico after insert or update or delete on public\.(\w+) for each row execute function public\.registrar_historico_hub\(\);/g)].map(x => x[1]));
  assert.deepEqual(comGatilho.sort(), ['agua_dia', 'al_dia', 'al_item', 'al_marmita', 'al_registro', 'corpo_dia', 'corpo_medida', 'tr_exercicio', 'tr_registro', 'tr_treino', 'tr_variacao']);
  assert.match(sql, /security definer\nset search_path = ''/);
  assert.match(sql, /revoke all on public\.hub_historico from anon, authenticated;/);
  assert.match(sql, /create policy hub_historico_so_victor on public\.hub_historico for select to authenticated\n  using \(\(select auth\.uid\(\)\) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid\);/);
});

test('base comum: tokens e componentes existem, a referência carrega os dois e mostra cada módulo com a própria cor', () => {
  const tokens = ler('base/tokens.css'), comp = ler('base/componentes.css'), ref = ler('base/referencia.html');
  for (const t of ['--bg', '--surface', '--fg', '--muted', '--ok', '--erro', '--protegido', '--cor', '--cor-soft', '--on-cor', '--r', '--t-md']) assert.match(tokens, new RegExp(`${t}:`), t);
  for (const c of ['.topo', '.dia-nav', '.semana', '.cartao', '.lista', '.chip', '.btn', '.toast']) assert.ok(comp.includes(c), c);
  assert.doesNotMatch(comp, /@view-transition\{/, 'transição só no passo 3, em todos os módulos de uma vez');
  assert.match(ref, /<link rel="stylesheet" href="tokens\.css">\n<link rel="stylesheet" href="componentes\.css">/);
  assert.deepEqual([...ref.matchAll(/<h1>([^<]+)<\/h1>/g)].map(m => m[1]), ['Alimentação', 'Água', 'Corpo', 'Treino', 'Fin']);
});

test('módulos na base comum só usam as cores da base (nada de --teal, --cyan, --green… que deixaram de existir)', () => {
  for (const app of ['agua', 'corpo']) {
    const arquivos = [`${app}/index.html`, ...readdirSync(path.join(RAIZ, app, 'js')).map(n => `${app}/js/${n}`), ...readdirSync(path.join(RAIZ, app, 'css')).map(n => `${app}/css/${n}`)];
    for (const f of arquivos) assert.doesNotMatch(ler(f), /var\(--(teal|cyan|yellow|blue|green|red|on-teal|on-cyan)[a-z-]*\)/, f);
  }
});
