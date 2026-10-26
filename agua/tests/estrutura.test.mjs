// Estrutura da Água (sem navegador): cabeçalhos, ordem de carga, service worker, PWA, migration/RLS e segredos.
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
const FUNCAO = 'supabase/functions/agua-lembrete/index.ts';

test('todo arquivo de código começa com um comentário de responsabilidade', () => {
  for (const f of listar('js', '.js')) assert.match(ler(f), /^'use strict';\n(\/\/ |\/\*)/, f);
  for (const f of listar('css', '.css')) assert.match(ler(f), /^\/\* /, f);
  for (const f of ['sw.js', FUNCAO, ...listar('scripts', '.mjs'), ...listar('tests', '.mjs'), ...listar('tests/helpers', '.mjs')]) assert.match(ler(f), /^\/\/ /, f);
  for (const f of listar('migrations', '.sql')) assert.match(ler(f), /^-- /, f);
});

test('index.html: tags de bloco fecham na ordem certa e o css tem chaves balanceadas', () => {
  const pilha = [];
  for (const [, fecha, tag] of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)(div|section|form|ul|header|fieldset|button|p)\b[^>]*>/g)) {
    if (!fecha) { pilha.push(tag); continue; }
    assert.equal(pilha.pop(), tag, `</${tag}> fora de ordem`);
  }
  assert.deepEqual(pilha, [], 'tags sem fechar');
  let n = 0;
  for (const c of ler('css/agua.css').replace(/\/\*[\s\S]*?\*\//g, '')) { n += c === '{' ? 1 : c === '}' ? -1 : 0; assert.ok(n >= 0); }
  assert.equal(n, 0);
});

test('ordem de carga: supabase do hub e módulo do Corpo antes dos módulos; o service worker guarda tudo', () => {
  assert.deepEqual([...jsDoHtml].sort(), listar('js', '.js').sort());
  assert.deepEqual(jsDoHtml, ['js/config.js', 'js/util.js', 'js/banco.js', 'js/conta.js', 'js/notificacoes.js', 'js/telas.js', 'js/bootstrap.js']);
  assert.match(html, /<script src="\.\.\/supabase\.js"><\/script>\n<script src="\.\.\/corpo\/perfil\.js"><\/script>\n<script src="js\/config\.js">/);
  const sw = ler('sw.js'), guardados = [...sw.matchAll(/'(\.\.?\/[^']*)'/g)].map(m => m[1]);
  for (const f of ['./index.html', './css/agua.css', './manifest.webmanifest', '../supabase.js', '../corpo/perfil.js', ...jsDoHtml.map(f => './' + f)]) assert.ok(guardados.includes(f), `sw.js não guarda ${f}`);
  for (const f of guardados) assert.ok(existsSync(path.join(RAIZ, f)), `sw.js guarda ${f}, que não existe`);
  assert.match(sw, /k\.startsWith\('agua-'\) && k !== CACHE_ESTATICO/);
});

test('PWA: manifest válido, ícones existem e o service worker é registrado', () => {
  const m = JSON.parse(ler('manifest.webmanifest'));
  assert.equal(m.display, 'standalone'); assert.equal(m.start_url, './');
  for (const i of m.icons) assert.ok(existsSync(path.join(RAIZ, i.src)), i.src);
  assert.match(ler('js/bootstrap.js'), /serviceWorker\.register\('sw\.js', \{ updateViaCache: 'none' \}\)/);
});

test('localStorage só com prefixo agua.', () => {
  for (const f of listar('js', '.js')) for (const [, chave] of ler(f).matchAll(/K_\w+ = id => '([^']+)'/g)) assert.ok(chave.startsWith('agua.'), chave);
});

test('migration no formato do DataGrip e RLS só do Victor', () => {
  const sql = listar('migrations', '.sql').map(ler), tudo = sql.join('\n');
  for (const s of sql) {
    assert.doesNotMatch(s, /do \$\$/);
    for (const linha of s.split('\n').filter(l => l.trim().startsWith('--'))) assert.ok(!linha.includes(';'), `; em comentário: ${linha}`);
    assert.match(s, /^begin;$/m); assert.match(s, /^commit;$/m);
  }
  assert.match(tudo, /create table if not exists public\.agua_dia/);
  assert.match(tudo, /alter table public\.agua_dia enable row level security/);
  assert.match(tudo, /revoke all on public\.agua_dia from anon/);
  assert.match(tudo, /create policy agua_dia_somente_dono on public\.agua_dia for all to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(tudo, new RegExp(`create policy agua_dia_somente_victor on public\\.agua_dia as restrictive[^;]*'${DONO}'`));
});

test('migration das notificações: inscrições só do Victor, chaves sem policy e agendamento de hora em hora', () => {
  const sql = ler('migrations/01-notificacoes.sql');
  assert.match(sql, /alter table public\.push_inscricao enable row level security/);
  assert.match(sql, /revoke all on public\.push_inscricao from anon/);
  assert.match(sql, new RegExp(`create policy push_inscricao_somente_victor on public\\.push_inscricao as restrictive[^;]*'${DONO}'`));
  assert.match(sql, /alter table public\.push_chave enable row level security/);
  assert.match(sql, /revoke all on public\.push_chave from anon, authenticated/);
  assert.doesNotMatch(sql, /create policy \w+ on public\.push_chave/);   // só a chave de serviço lê
  const agendado = sql.match(/select cron\.schedule\('agua-lembrete', '1 \* \* \* \*', \$cron\$([^$]+)\$cron\$\)/)[1];
  assert.ok(!agendado.includes(';'), 'ponto e vírgula dentro do comando agendado quebra no DataGrip');
  assert.match(agendado, /functions\/v1\/agua-lembrete'/);
  assert.match(agendado, /'x-agua-token', coalesce\(\(select token from public\.push_chave where id = 1\)/);
});

test('app e função falam a mesma língua: mesmo dono, mesmo nome e horários', () => {
  const funcao = ler(FUNCAO), config = ler('js/config.js');
  assert.equal(funcao.match(/const DONO = "([0-9a-f-]+)"/)[1], DONO);
  assert.match(ler('js/notificacoes.js'), /const FUNCAO_PUSH = 'agua-lembrete'/);
  assert.match(funcao, new RegExp(`const INICIO = ${config.match(/LEMBRETE_INICIO = (\d+)/)[1]}, FIM = ${config.match(/LEMBRETE_FIM = (\d+)/)[1]};`));
});

test('nenhum segredo', () => {
  for (const f of ['index.html', 'sw.js', 'AGENTS.md', 'README.md', ...listar('js', '.js'), ...listar('docs', '.md'), ...listar('migrations', '.sql')]) assert.doesNotMatch(ler(f), /service_role|sb_secret_/, f);
  assert.doesNotMatch(ler(FUNCAO), /service_role|sb_secret_|BEGIN PRIVATE/);
  assert.match(ler('js/config.js'), /const SUPABASE_KEY = 'sb_publishable_/);
});
