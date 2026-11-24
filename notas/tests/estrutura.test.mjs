// Estrutura das Notas (sem navegador): ordem de carga dos scripts e o service worker com tudo que a página carrega.
// O comportamento (lista, editor, conversa, Markdown) fica nos testes de função e de navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregar } from '../../tests/funcoes.mjs';
import { etiquetas } from '../../tests/leitores.mjs';
import { rodarSw } from '../../tests/sw-falso.mjs';
import { rodarBootstrapApp } from '../../tests/bootstrap-falso.mjs';
import { DONO } from './helpers/app.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => readFileSync(path.join(RAIZ, arquivo), 'utf8');

const scripts = etiquetas(ler('index.html'))
  .filter((e) => e.tag === 'script' && e.attrs.src)
  .map((e) => e.attrs.src);

test('ordem de carga: supabase, núcleo, CodeMirror, config, util, banco e depois as telas', () => {
  assert.deepEqual(scripts, [
    '../supabase.js',
    '../base/nucleo.js',
    'vendor/codemirror.js',
    'js/config.js',
    'js/util.js',
    'js/banco.js',
    'js/markdown.js',
    'js/editor.js',
    'js/telas.js',
    'js/bootstrap.js',
  ]);
});

test('o service worker guarda tudo que a página carrega (abre sem internet), e tudo existe', () => {
  const { ARQUIVOS_ESTATICOS: guardados } = carregar(
    path.join(RAIZ, 'sw.js'),
    ['ARQUIVOS_ESTATICOS'],
    { self: { addEventListener() {} } }
  );

  const links = etiquetas(ler('index.html'))
    .filter((e) => e.tag === 'link' && !/^https?:/.test(e.attrs.href))
    .map((e) => e.attrs.href);

  for (const f of [...scripts, ...links]) {
    const p = f.startsWith('../') ? f : './' + f;

    assert.ok(guardados.includes(p), `sw.js não guarda ${p}`);
  }

  for (const f of guardados)
    if (f !== './') assert.ok(existsSync(path.join(RAIZ, f)), `${f} não existe`);
});

test('migration no formato do DataGrip (sem bloco anônimo, sem ; em comentário, entre begin e commit) e RLS só do Victor, anon sem acesso', () => {
  const sql = ler('migrations/00-notas-nota.sql');

  assert.match(sql, /^-- /);
  assert.doesNotMatch(sql, /do \$\$/);

  for (const linha of sql.split('\n').filter((l) => l.trim().startsWith('--')))
    assert.ok(!linha.includes(';'), `; em comentário: ${linha}`);
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;\n$/m);
  assert.match(sql, /create table if not exists public\.notas_nota \(/);
  assert.match(sql, /primary key \(user_id, id\)/);
  assert.match(sql, /alter table public\.notas_nota enable row level security;/);
  assert.match(sql, /revoke all on public\.notas_nota from anon;/);
  assert.doesNotMatch(sql, /grant [^;]* to anon/);
  assert.match(
    sql,
    /create policy notas_nota_somente_dono on public\.notas_nota for all to authenticated using \(user_id = \(select auth\.uid\(\)\)\) with check \(user_id = \(select auth\.uid\(\)\)\);/
  );
  assert.match(
    sql,
    new RegExp(
      `create policy notas_nota_somente_victor on public\\.notas_nota as restrictive for all to authenticated\\s+using \\(\\(select auth\\.uid\\(\\)\\) = '${DONO}'::uuid\\)\\s+with check \\(\\(select auth\\.uid\\(\\)\\) = '${DONO}'::uuid\\);`
    )
  );

  // idempotente: cada policy é apagada antes de ser criada
  for (const p of ['notas_nota_somente_dono', 'notas_nota_somente_victor'])
    assert.match(sql, new RegExp(`drop policy if exists ${p} on public\\.notas_nota;`));
});

test('migration do título separa a primeira linha antiga e pode ser repetida', () => {
  const sql = ler('migrations/01-notas-titulo.sql');

  assert.match(sql, /^-- /);
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;\n$/m);
  assert.match(sql, /add column if not exists titulo text/);
  assert.match(sql, /where n\.titulo is null/);
  assert.match(sql, /alter column titulo set default ''/);
  assert.match(sql, /alter column titulo set not null/);
});

test('a conta do app é o DONO do hub, e o id da nota no aparelho segue o check da tabela', () => {
  const { DONO: doApp } = carregar(path.join(RAIZ, 'js/config.js'), ['DONO']);

  assert.equal(doApp, DONO);

  const { idOk } = carregar(path.join(RAIZ, 'js/banco.js'), ['idOk']),
    check = ler('migrations/00-notas-nota.sql').match(/check \(id ~ '([^']+)'\)/)[1];

  for (const id of ['a', 'Ab_9-x', 'x'.repeat(64), '', 'a b', 'a/b', 'x'.repeat(65), 'é'])
    assert.equal(idOk(id), new RegExp(check).test(id), id);
});

test('localStorage só com prefixo notas.', () => {
  const k = carregar(
    path.join(RAIZ, 'js/banco.js'),
    ['K_LOCAL'],
    {},
    '__saida.K_BASE = K_BASE;'
  );

  const { K_MODO } = carregar(
    path.join(RAIZ, 'js/util.js'),
    ['LARGURA_EDITOR'],
    {},
    '__saida.K_MODO = K_MODO;'
  );

  assert.deepEqual(
    [k.K_LOCAL('c'), k.K_BASE('c'), K_MODO],
    ['notas.db.c', 'notas.base.c', 'notas.modo']
  );
});

test('service worker: o install guarda no cache notas-estatico cada arquivo da lista, e só eles; atende a página com ?nota= sem internet; não atende outros domínios nem POST', async () => {
  const sw = path.join(RAIZ, 'sw.js'),
    { ARQUIVOS_ESTATICOS } = carregar(sw, ['ARQUIVOS_ESTATICOS'], {
      self: { addEventListener() {} },
    });

  const instalado = rodarSw(sw);

  await instalado.instalar();
  assert.deepEqual(instalado.abertos, ['notas-estatico']);
  assert.deepEqual([...instalado.guardados].sort(), [...ARQUIVOS_ESTATICOS].sort());

  const rede = rodarSw(sw),
    notas = 'https://vcl02.github.io/hub/notas/';

  assert.equal((await rede.atende(notas + 'js/markdown.js')).atendeu, true);
  assert.equal(
    (await rede.atende('https://yzmyncxoskvqzdczaill.supabase.co/rest/v1/notas_nota'))
      .atendeu,
    false
  );
  assert.equal(
    (await rede.atende(notas + 'js/util.js', { metodo: 'POST' })).atendeu,
    false
  );
  assert.equal((await rede.atende(notas + 'js/util.js?v=2')).atendeu, false);

  const semInternet = rodarSw(sw, { rede: false, cacheado: { './': 'pagina do cache' } });

  assert.equal(
    (await semInternet.atende(notas + '?nota=abc', { modo: 'navigate' })).resposta,
    'pagina do cache'
  );
});

test('bootstrap: com sessão salva carrega (cópia local e nuvem) em vez de ir ao login; sem sessão, dentro do hub vai ao login dele com a nota do endereço, e fora usa o próprio', async () => {
  const arquivo = path.join(RAIZ, 'js/bootstrap.js');

  const extras = (chamadas) => ({
    DONO: 'dono',
    carregado: false,
    aberta: null,
    $: (id) => ({
      addEventListener: () => {},
      classList: { add() {}, remove() {} },
      set hidden(v) {
        if (id === 'v-login' && v === false) chamadas.push(['telaLogin']);
      },
    }),
    document: { body: { classList: { add() {}, remove() {} } } },
    carregar: async (u) => {
      chamadas.push(['carregar', u.id]);
    },
    mostrar: () => {},
  });

  const comSessao = await rodarBootstrapApp(arquivo, {
    pathname: '/hub/notas/',
    sessao: { user: { id: 'dono' } },
    extras,
  });

  assert.deepEqual(comSessao.chamadas, [['carregar', 'dono']]);
  assert.deepEqual(comSessao.destinos, []);
  assert.deepEqual(comSessao.registros, [['sw.js', { updateViaCache: 'none' }]]);

  const noHub = await rodarBootstrapApp(arquivo, {
    pathname: '/hub/notas/',
    search: '?nota=abc',
    extras,
  });

  assert.deepEqual(noHub.destinos, ['../?volta=notas%2F%3Fnota%3Dabc']);
  assert.deepEqual(noHub.chamadas, []);

  const fora = await rodarBootstrapApp(arquivo, { pathname: '/', extras });

  assert.deepEqual(fora.destinos, []);
  assert.deepEqual(fora.chamadas, [['telaLogin']]);
});
