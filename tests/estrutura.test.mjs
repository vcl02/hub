// Estrutura do repositório (sem navegador): cabeçalhos, HTML/CSS balanceados, ordem de carga, PWA, migrations/RLS e segredos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = arquivo => readFileSync(path.join(RAIZ, arquivo), 'utf8');
const listar = (pasta, ext) => readdirSync(path.join(RAIZ, pasta)).filter(n => n.endsWith(ext)).map(n => `${pasta}/${n}`);
const html = ler('index.html');
const cssDoHtml = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)">/g)].map(m => m[1]);
const jsDoHtml = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);

test('todo arquivo de código começa com um comentário de responsabilidade', () => {
  for (const f of listar('js', '.js')) assert.match(ler(f), /^'use strict';\n(\/\/ |\/\*)/, f);
  for (const f of listar('css', '.css')) assert.match(ler(f), /^\/\* /, f);
  for (const f of ['sw.js', ...listar('scripts', '.mjs'), ...listar('tests', '.mjs'), ...listar('tests/helpers', '.mjs')]) assert.match(ler(f), /^\/\/ /, f);
  for (const f of listar('migrations', '.sql')) assert.match(ler(f), /^-- /, f);
});

test('index.html: tags de bloco fecham na ordem certa', () => {
  const pilha = [], semComentario = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const [, fecha, tag] of semComentario.matchAll(/<(\/?)(div|section|form|ul|ol|details|label|button|p)\b[^>]*>/g)) {
    if (!fecha) { pilha.push(tag); continue; }
    assert.equal(pilha.pop(), tag, `</${tag}> fora de ordem`);
  }
  assert.deepEqual(pilha, [], 'tags sem fechar');
});

test('cada stylesheet tem chaves balanceadas', () => {
  for (const f of cssDoHtml) {
    let n = 0;
    for (const c of ler(f).replace(/\/\*[\s\S]*?\*\//g, '')) { n += c === '{' ? 1 : c === '}' ? -1 : 0; assert.ok(n >= 0, `${f}: } a mais`); }
    assert.equal(n, 0, `${f}: { sem fechar`);
  }
});

test('index.html carrega todos os css/ e js/, e o service worker guarda os mesmos arquivos', () => {
  assert.deepEqual([...cssDoHtml].sort(), listar('css', '.css').sort());
  assert.deepEqual([...jsDoHtml].sort(), listar('js', '.js').sort());
  assert.equal(jsDoHtml[0], 'js/config.js'); assert.equal(jsDoHtml.at(-1), 'js/bootstrap.js');
  assert.ok(html.indexOf('src="supabase.js"') < html.indexOf('src="js/'), 'supabase.js antes dos módulos');
  const sw = ler('sw.js'), guardados = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]);
  for (const f of [...cssDoHtml, ...jsDoHtml, 'index.html', 'supabase.js', 'manifest.webmanifest']) assert.ok(guardados.includes(f), `sw.js não guarda ${f}`);
  for (const f of guardados.filter(Boolean)) assert.ok(existsSync(path.join(RAIZ, f)), `sw.js guarda ${f}, que não existe`);
});

test('PWA: manifest válido, ícones existem e o service worker é registrado', () => {
  const m = JSON.parse(ler('manifest.webmanifest'));
  assert.equal(m.display, 'standalone'); assert.ok(m.name && m.start_url);
  for (const i of m.icons) assert.ok(existsSync(path.join(RAIZ, i.src)), i.src);
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(ler('js/bootstrap.js'), /serviceWorker\.register\('sw\.js'/);
});

test('migrations no formato do DataGrip e RLS só do dono em todas as tabelas tr_', () => {
  const sql = listar('migrations', '.sql').map(ler), tudo = sql.join('\n');
  for (const s of sql) {
    assert.doesNotMatch(s, /do \$\$/, 'sem bloco do $$');
    for (const linha of s.split('\n').filter(l => l.trim().startsWith('--'))) assert.ok(!linha.includes(';'), `; em comentário: ${linha}`);
    assert.match(s, /^begin;$/m); assert.match(s, /^commit;$/m);
  }
  const dono = ler('js/config.js').match(/const DONO = '([0-9a-f-]{36})'/)[1];
  for (const [, t] of tudo.matchAll(/create table public\.(tr_\w+)/g)) {
    assert.match(tudo, new RegExp(`alter table public\\.${t} enable row level security`), t);
    assert.match(tudo, new RegExp(`revoke all on public\\.${t} from anon`), t);
    assert.match(tudo, new RegExp(`create policy ${t}_somente_dono on public\\.${t} for all to authenticated using \\(user_id = \\(select auth\\.uid\\(\\)\\)\\)`), t);
    assert.match(tudo, new RegExp(`create policy ${t}_somente_victor on public\\.${t} as restrictive[^;]*'${dono}'`), t);
  }
});

test('nenhum segredo no repositório; a chave do Supabase é a publicável', () => {
  const textos = ['index.html', 'sw.js', 'AGENTS.md', ...listar('js', '.js'), ...listar('docs', '.md'), ...listar('migrations', '.sql')];
  for (const f of textos) assert.doesNotMatch(ler(f), /service_role|sb_secret_/, f);
  assert.match(ler('js/config.js'), /const SUPABASE_KEY = 'sb_publishable_/);
});

test('higiene textual do .editorconfig (scripts/check-style.mjs)', () => {
  const r = spawnSync(process.execPath, ['scripts/check-style.mjs'], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
