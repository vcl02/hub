// Estrutura do Corpo (sem navegador): cabeçalhos, ordem de carga, service worker, PWA, migration/RLS, segredos e o módulo compartilhado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  etiquetas,
  aninhamento,
  balanceamento,
  chavesDoCss,
} from '../../tests/leitores.mjs';
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
  for (const f of ['perfil.js', ...listar('js', '.js')])
    assert.match(ler(f), /^'use strict';\n\s*(\/\/ |\/\*)/, f);

  for (const f of listar('css', '.css')) assert.match(ler(f), /^\/\* /, f);

  for (const f of [
    'sw.js',
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
    'header',
    'fieldset',
    'button',
    'p',
  ]) {
    const { soltos, pendentes } = balanceamento(html, tag);

    assert.equal(soltos, 0, `</${tag}> sem abertura`);
    assert.equal(pendentes, 0, `<${tag}> sem fechamento`);
  }

  assert.deepEqual(
    aninhamento(html),
    [],
    'etiquetas fechadas fora da ordem em que abriram'
  );

  const { abertas, fechadas, nuncaNegativo } = chavesDoCss(ler('css/corpo.css'));

  assert.ok(abertas > 0 && nuncaNegativo);
  assert.equal(abertas, fechadas);
});

test('ordem de carga: supabase do hub e perfil antes dos módulos; o service worker guarda tudo', async () => {
  assert.deepEqual([...jsDoHtml].sort(), listar('js', '.js').sort());
  assert.deepEqual(jsDoHtml, [
    'js/config.js',
    'js/util.js',
    'js/banco.js',
    'js/telas.js',
    'js/bootstrap.js',
  ]);
  assert.deepEqual(scripts.slice(0, 4), [
    '../supabase.js',
    '../base/nucleo.js',
    'perfil.js',
    'js/config.js',
  ]);

  // O que o service worker guarda no install (roda o sw.js): tudo o que a página carrega, e nada que não exista
  const { guardados, abertos } = await rodarServiceWorker(path.join(RAIZ, 'sw.js'));

  for (const f of [
    './index.html',
    './perfil.js',
    './css/corpo.css',
    './manifest.webmanifest',
    '../supabase.js',
    '../base/nucleo.js',
    ...jsDoHtml.map((f) => './' + f),
  ])
    assert.ok(guardados.includes(f), `sw.js não guarda ${f}`);

  for (const f of guardados)
    assert.ok(existsSync(path.join(RAIZ, f)), `sw.js guarda ${f}, que não existe`);
  assert.deepEqual(abertos, ['corpo-estatico']);
});

test('service worker: ao ativar, apaga só os caches antigos do Corpo (fin, tr, al, Água e a página inicial dividem a origem)', async () => {
  const { apagados } = await rodarServiceWorker(path.join(RAIZ, 'sw.js'), [
    'corpo-estatico',
    'corpo-v1',
    'carga-estatico',
    'al-estatico',
    'agua-estatico',
    'fin-estatico',
    'hub-estatico',
  ]);

  assert.deepEqual(apagados, ['corpo-v1']);
});

test('PWA: manifest válido, ícones existem e o app registra o service worker; dentro do hub, sem sessão, vai para o login dele e volta', async () => {
  const m = JSON.parse(ler('manifest.webmanifest'));

  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');

  for (const i of m.icons) assert.ok(existsSync(path.join(RAIZ, i.src)), i.src);

  const noHub = await rodarBootstrap(path.join(RAIZ, 'js/bootstrap.js'), {
    pathname: '/hub/corpo/',
    search: '?dia=2026-10-20',
  });

  assert.deepEqual(noHub.registros, [['sw.js', { updateViaCache: 'none' }]]);
  assert.deepEqual(noHub.destinos, ['../?volta=corpo%2F%3Fdia%3D2026-10-20']);

  const fora = await rodarBootstrap(path.join(RAIZ, 'js/bootstrap.js'), {
    pathname: '/',
  });

  assert.deepEqual(fora.destinos, []); // servido fora do hub (testes): login próprio
});

test('migration no formato do DataGrip, RLS só do Victor e cópia do que estava no Treino', () => {
  const sql = listar('migrations', '.sql').map(ler),
    tudo = sql.join('\n');

  for (const s of sql) {
    assert.doesNotMatch(s, /do \$\$/);

    for (const linha of s.split('\n').filter((l) => l.trim().startsWith('--')))
      assert.ok(!linha.includes(';'), `; em comentário: ${linha}`);
    assert.match(s, /^begin;$/m);
    assert.match(s, /^commit;$/m);
  }

  assert.match(tudo, /create table if not exists public\.corpo_medida/);
  assert.match(tudo, /alter table public\.corpo_medida enable row level security/);
  assert.match(tudo, /revoke all on public\.corpo_medida from anon/);
  assert.match(
    tudo,
    /create policy corpo_medida_somente_dono on public\.corpo_medida for all to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/
  );
  assert.match(
    tudo,
    new RegExp(
      `create policy corpo_medida_somente_victor on public\\.corpo_medida as restrictive[^;]*'${DONO}'`
    )
  );
  assert.match(
    tudo,
    /insert into public\.corpo_medida \(user_id, data, hora, peso, cintura\)\n\s+select user_id, data, hora, peso, cintura from public\.tr_medida\n\s+on conflict \(user_id, data\) do nothing;/
  );
  assert.doesNotMatch(tudo, /drop table|delete from|truncate/i, 'não apaga tr_medida');
  // corpo_dia (evacuou): mesma proteção
  assert.match(tudo, /create table if not exists public\.corpo_dia/);
  assert.match(tudo, /alter table public\.corpo_dia enable row level security/);
  assert.match(tudo, /revoke all on public\.corpo_dia from anon/);
  assert.match(tudo, /add column if not exists evacuacoes jsonb/);
  assert.match(tudo, /add column if not exists sono numeric/);
  assert.match(
    tudo,
    new RegExp(
      `create policy corpo_dia_somente_victor on public\\.corpo_dia as restrictive[^;]*'${DONO}'`
    )
  );
});

test('nenhum segredo; só este app grava corpo_medida (perfil.js só lê)', () => {
  for (const f of [
    'index.html',
    'sw.js',
    'perfil.js',
    'AGENTS.md',
    'README.md',
    ...listar('js', '.js'),
    ...listar('docs', '.md'),
    ...listar('migrations', '.sql'),
  ])
    assert.doesNotMatch(ler(f), /service_role|sb_secret_/, f);
  assert.ok(SUPABASE_KEY.startsWith('sb_publishable_')); // perfil.js só lê: regras.test.mjs roda o lerMedidas
});
