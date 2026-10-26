// Estrutura do al (sem navegador): cabeçalhos, ordem de carga, service worker, PWA, migrations/RLS e segredos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = arquivo => readFileSync(path.join(RAIZ, arquivo), 'utf8');
const listar = (pasta, ext) => readdirSync(path.join(RAIZ, pasta)).filter(n => n.endsWith(ext)).map(n => `${pasta}/${n}`);
const html = ler('index.html');
const jsDoHtml = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
const DONO = ler('js/config.js').match(/const DONO = '([0-9a-f-]{36})'/)[1];

test('todo arquivo de código começa com um comentário de responsabilidade', () => {
  for (const f of listar('js', '.js')) assert.match(ler(f), /^'use strict';\n(\/\/ |\/\*)/, f);
  for (const f of listar('css', '.css')) assert.match(ler(f), /^\/\* /, f);
  for (const f of ['sw.js', 'supabase/functions/al-estimar/index.ts', ...listar('scripts', '.mjs'), ...listar('tests', '.mjs'), ...listar('tests/helpers', '.mjs')]) assert.match(ler(f), /^\/\/ /, f);
  for (const f of listar('migrations', '.sql')) assert.match(ler(f), /^-- /, f);
});

test('index.html: tags de bloco fecham na ordem certa e o css tem chaves balanceadas', () => {
  const pilha = [];
  for (const [, fecha, tag] of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)(div|section|form|ul|nav|header|fieldset|button|p)\b[^>]*>/g)) {
    if (!fecha) { pilha.push(tag); continue; }
    assert.equal(pilha.pop(), tag, `</${tag}> fora de ordem`);
  }
  assert.deepEqual(pilha, [], 'tags sem fechar');
  let n = 0;
  for (const c of ler('css/al.css').replace(/\/\*[\s\S]*?\*\//g, '')) { n += c === '{' ? 1 : c === '}' ? -1 : 0; assert.ok(n >= 0); }
  assert.equal(n, 0);
});

test('ordem de carga: supabase e perfil do hub antes dos módulos; o service worker guarda tudo', () => {
  assert.deepEqual([...jsDoHtml].sort(), listar('js', '.js').sort());
  assert.deepEqual(jsDoHtml, ['js/config.js', 'js/util.js', 'js/banco.js', 'js/conta.js', 'js/ia.js', 'js/telas.js', 'js/bootstrap.js']);
  assert.match(html, /<script src="\.\.\/supabase\.js"><\/script>\n<script src="\.\.\/perfil\.js"><\/script>\n<script src="js\/config\.js">/);
  const sw = ler('sw.js'), guardados = [...sw.matchAll(/'(\.\.?\/[^']*)'/g)].map(m => m[1]);
  for (const f of ['./index.html', './css/al.css', './manifest.webmanifest', '../supabase.js', '../perfil.js', ...jsDoHtml.map(f => './' + f)]) assert.ok(guardados.includes(f), `sw.js não guarda ${f}`);
  for (const f of guardados) assert.ok(existsSync(path.join(RAIZ, f)), `sw.js guarda ${f}, que não existe`);
  assert.match(sw, /const CACHE_ESTATICO = 'al-estatico';/);
});

test('PWA: manifest válido, ícones existem e o service worker é registrado', () => {
  const m = JSON.parse(ler('manifest.webmanifest'));
  assert.equal(m.display, 'standalone'); assert.equal(m.start_url, './');
  for (const i of m.icons) assert.ok(existsSync(path.join(RAIZ, i.src)), i.src);
  assert.match(ler('js/bootstrap.js'), /serviceWorker\.register\('sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
});

test('localStorage só com prefixo al.', () => {
  for (const f of listar('js', '.js')) for (const [, chave] of ler(f).matchAll(/K_\w+ = id => '([^']+)'/g)) assert.ok(chave.startsWith('al.'), chave);
});

test('migrations no formato do DataGrip e RLS só do Victor em todas as tabelas al_', () => {
  const sql = listar('migrations', '.sql').map(ler), tudo = sql.join('\n');
  for (const s of sql) {
    assert.doesNotMatch(s, /do \$\$/);
    for (const linha of s.split('\n').filter(l => l.trim().startsWith('--'))) assert.ok(!linha.includes(';'), `; em comentário: ${linha}`);
    assert.match(s, /^begin;$/m); assert.match(s, /^commit;$/m);
  }
  const tabelas = [...tudo.matchAll(/create table public\.(al_\w+)/g)].map(m => m[1]);
  assert.deepEqual(tabelas, ['al_item', 'al_registro', 'al_dia', 'al_uso']);
  for (const t of tabelas) {
    assert.match(tudo, new RegExp(`alter table public\\.${t} enable row level security`), t);
    assert.match(tudo, new RegExp(`revoke all on public\\.${t} from anon`), t);
    assert.match(tudo, new RegExp(`create policy ${t}_somente_dono on public\\.${t} for all to authenticated using \\(user_id = \\(select auth\\.uid\\(\\)\\)\\)`), t);
    assert.match(tudo, new RegExp(`create policy ${t}_somente_victor on public\\.${t} as restrictive[^;]*'${DONO}'`), t);
  }
  // As tabelas e chaves que o app sincroniza existem na migration
  const TABELAS = ler('js/banco.js').match(/const TABELAS = (\{[^}]*\});/)[1];
  for (const t of Object.keys(JSON.parse(TABELAS.replace(/'/g, '"').replace(/(\w+):/g, '"$1":')))) assert.ok(tabelas.includes(t), t);
});

test('nenhum segredo no repositório; o app só fala com a IA pela Edge Function', () => {
  const textos = ['index.html', 'sw.js', 'AGENTS.md', 'README.md', ...listar('js', '.js'), ...listar('docs', '.md'), ...listar('migrations', '.sql'), 'supabase/functions/al-estimar/index.ts'];
  for (const f of textos) assert.doesNotMatch(ler(f), /service_role|sb_secret_|sk-ant-/, f);
  assert.match(ler('js/config.js'), /const SUPABASE_KEY = 'sb_publishable_/);
  for (const f of listar('js', '.js')) assert.doesNotMatch(ler(f), /api\.anthropic\.com/, f);
  assert.match(ler('js/ia.js'), /sb\.functions\.invoke\(FUNCAO_IA/);
  const funcao = ler('supabase/functions/al-estimar/index.ts');
  assert.equal(funcao.match(/const DONO = "([0-9a-f-]+)"/)[1], DONO);
  assert.equal(funcao.match(/const SUPABASE_KEY = "([^"]+)"/)[1], ler('js/config.js').match(/const SUPABASE_KEY = '([^']+)'/)[1]);
});
