// Estrutura do al (sem navegador): cabeçalhos, ordem de carga, service worker, PWA, migrations/RLS e segredos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { etiquetas, balanceamento, chavesDoCss } from '../../tests/leitores.mjs';
import { carregar } from '../../tests/funcoes.mjs';
import { rodarServiceWorker, rodarBootstrap } from './helpers/rodar.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => readFileSync(path.join(RAIZ, arquivo), 'utf8');

const listar = (pasta, ext) =>
  readdirSync(path.join(RAIZ, pasta))
    .filter((n) => n.endsWith(ext))
    .map((n) => `${pasta}/${n}`);

const html = ler('index.html');

const tags = etiquetas(html);

// Os <script src> do index.html, na ordem em que a página os carrega
const scripts = tags
  .filter((e) => e.tag === 'script' && e.attrs.src)
  .map((e) => e.attrs.src);

const jsDoHtml = scripts.filter((src) => src.startsWith('js/'));

const { DONO, SUPABASE_KEY } = carregar(path.join(RAIZ, 'js/config.js'), [
  'DONO',
  'SUPABASE_KEY',
]);

test('todo arquivo de código começa com um comentário de responsabilidade', () => {
  for (const f of listar('js', '.js'))
    assert.match(ler(f), /^'use strict';\n\s*(\/\/ |\/\*)/, f);

  for (const f of listar('css', '.css')) assert.match(ler(f), /^\/\* /, f);

  for (const f of [
    'sw.js',
    'supabase/functions/al-estimar/index.ts',
    ...listar('scripts', '.mjs'),
    ...listar('tests', '.mjs'),
    ...listar('tests/helpers', '.mjs'),
  ])
    assert.match(ler(f), /^\/\/ /, f);

  for (const f of listar('migrations', '.sql')) assert.match(ler(f), /^-- /, f);
});

test('index.html: as tags de bloco abrem e fecham na mesma conta e o css tem chaves balanceadas', () => {
  for (const tag of [
    'div',
    'section',
    'form',
    'ul',
    'nav',
    'header',
    'fieldset',
    'button',
    'p',
  ]) {
    const { soltos, pendentes } = balanceamento(html, tag);

    assert.equal(soltos, 0, `</${tag}> sem abertura`);
    assert.equal(pendentes, 0, `<${tag}> sem fechamento`);
  }

  const { abertas, fechadas, nuncaNegativo } = chavesDoCss(ler('css/al.css'));

  assert.ok(abertas > 0 && nuncaNegativo);
  assert.equal(abertas, fechadas);
});

test('ordem de carga: supabase do hub e módulos do Corpo e da Água antes dos módulos; o service worker guarda tudo', async () => {
  assert.deepEqual([...jsDoHtml].sort(), listar('js', '.js').sort());
  assert.deepEqual(jsDoHtml, [
    'js/config.js',
    'js/util.js',
    'js/banco.js',
    'js/conta.js',
    'js/ia.js',
    'js/telas.js',
    'js/bootstrap.js',
  ]);
  assert.deepEqual(scripts.slice(0, 5), [
    '../supabase.js',
    '../corpo/perfil.js',
    '../agua/bebidas.js',
    'gasto.js',
    'js/config.js',
  ]);

  // O que o service worker guarda no install (roda o sw.js): tudo o que a página carrega, e nada que não exista
  const { guardados, abertos } = await rodarServiceWorker(path.join(RAIZ, 'sw.js'));

  for (const f of [
    './index.html',
    './css/al.css',
    './manifest.webmanifest',
    '../supabase.js',
    '../corpo/perfil.js',
    '../agua/bebidas.js',
    './gasto.js',
    ...jsDoHtml.map((f) => './' + f),
  ])
    assert.ok(guardados.includes(f), `sw.js não guarda ${f}`);

  for (const f of guardados)
    assert.ok(existsSync(path.join(RAIZ, f)), `sw.js guarda ${f}, que não existe`);
  assert.deepEqual(abertos, ['al-estatico']);
});

test('service worker: ao ativar, apaga só os caches antigos do al (fin, tr, Corpo, Água e a página inicial dividem a origem)', async () => {
  const { apagados } = await rodarServiceWorker(path.join(RAIZ, 'sw.js'), [
    'al-estatico',
    'al-v1',
    'carga-estatico',
    'corpo-estatico',
    'agua-estatico',
    'fin-estatico',
    'hub-estatico',
  ]);

  assert.deepEqual(apagados, ['al-v1']);
});

test('PWA: manifest válido, ícones existem e o app registra o service worker; dentro do hub, sem sessão, vai para o login dele e volta', async () => {
  const m = JSON.parse(ler('manifest.webmanifest'));

  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');

  for (const i of m.icons) assert.ok(existsSync(path.join(RAIZ, i.src)), i.src);
  const manifesto = tags.find((e) => e.tag === 'link' && e.attrs.rel === 'manifest');

  assert.equal(manifesto?.attrs.href, 'manifest.webmanifest');

  const noHub = await rodarBootstrap(path.join(RAIZ, 'js/bootstrap.js'), {
    pathname: '/hub/al/',
    search: '?dia=2026-09-10',
  });

  assert.deepEqual(noHub.registros, [['sw.js', { updateViaCache: 'none' }]]);
  assert.deepEqual(noHub.destinos, ['../?volta=al%2F%3Fdia%3D2026-09-10']);

  const fora = await rodarBootstrap(path.join(RAIZ, 'js/bootstrap.js'), {
    pathname: '/',
  });

  assert.deepEqual(fora.destinos, []); // servido fora do hub (testes): login próprio
});

test('migrations no formato do DataGrip e RLS só do Victor em todas as tabelas al_', () => {
  const sql = listar('migrations', '.sql').map(ler),
    tudo = sql.join('\n');

  for (const s of sql) {
    assert.doesNotMatch(s, /do \$\$/);

    for (const linha of s.split('\n').filter((l) => l.trim().startsWith('--')))
      assert.ok(!linha.includes(';'), `; em comentário: ${linha}`);
    assert.match(s, /^begin;$/m);
    assert.match(s, /^commit;$/m);
  }

  const tabelas = [
    ...tudo.matchAll(/create table (?:if not exists )?public\.(al_\w+)/g),
  ].map((m) => m[1]);

  assert.deepEqual(tabelas, ['al_item', 'al_registro', 'al_dia', 'al_uso', 'al_marmita']);

  for (const t of tabelas) {
    assert.match(
      tudo,
      new RegExp(`alter table public\\.${t} enable row level security`),
      t
    );
    assert.match(tudo, new RegExp(`revoke all on public\\.${t} from anon`), t);
    assert.match(
      tudo,
      new RegExp(
        `create policy ${t}_somente_dono on public\\.${t} for all to authenticated using \\(user_id = \\(select auth\\.uid\\(\\)\\)\\)`
      ),
      t
    );
    assert.match(
      tudo,
      new RegExp(
        `create policy ${t}_somente_victor on public\\.${t} as restrictive[^;]*'${DONO}'`
      ),
      t
    );
  }

  // As tabelas e chaves que o app sincroniza existem na migration
  const { TABELAS } = carregar(path.join(RAIZ, 'js/banco.js'), ['TABELAS']);

  for (const t of Object.keys(TABELAS)) assert.ok(tabelas.includes(t), t);
});

test('nenhum segredo no repositório; o app só fala com a IA pela Edge Function', () => {
  const textos = [
    'index.html',
    'sw.js',
    'AGENTS.md',
    'README.md',
    ...listar('js', '.js'),
    ...listar('docs', '.md'),
    ...listar('migrations', '.sql'),
    'supabase/functions/al-estimar/index.ts',
  ];

  for (const f of textos)
    assert.doesNotMatch(ler(f), /service_role|sb_secret_|sk-ant-/, f);
  assert.ok(SUPABASE_KEY.startsWith('sb_publishable_'));

  for (const f of listar('js', '.js'))
    assert.doesNotMatch(ler(f), /api\.anthropic\.com/, f);
  const funcao = ler('supabase/functions/al-estimar/index.ts');

  assert.equal(funcao.match(/const DONO = ['"]([0-9a-f-]+)['"]/)[1], DONO);
  assert.equal(funcao.match(/const SUPABASE_KEY = ['"]([^'"]+)['"]/)[1], SUPABASE_KEY);
});
