// Estrutura do repositório (sem navegador): cabeçalhos, HTML/CSS balanceados, ordem de carga, PWA e service worker (rodado como
// função), migrations/RLS e segredos. O HTML é lido como elementos (tests/leitores.mjs); regex só onde o objeto é texto: SQL,
// documentação, cabeçalho dos arquivos e ausência de segredos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  etiquetas,
  elementoPorId,
  aninhamento,
  balanceamento,
} from '../../tests/leitores.mjs';
import { carregarTr } from './helpers/js.mjs';
import { rodarBootstrapApp } from '../../tests/bootstrap-falso.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => readFileSync(path.join(RAIZ, arquivo), 'utf8');

const listar = (pasta, ext) =>
  readdirSync(path.join(RAIZ, pasta))
    .filter((n) => n.endsWith(ext))
    .map((n) => `${pasta}/${n}`);

const html = ler('index.html'),
  tags = etiquetas(html);

const folhas = tags
  .filter(
    (e) =>
      e.tag === 'link' && e.attrs.rel === 'stylesheet' && !/^https?:/.test(e.attrs.href)
  )
  .map((e) => e.attrs.href);

const scripts = tags
  .filter((e) => e.tag === 'script' && e.attrs.src)
  .map((e) => e.attrs.src);

const cssDoHtml = folhas.filter((h) => h.startsWith('css/')),
  jsDoHtml = scripts.filter((s) => s.startsWith('js/'));

test('todo arquivo de código começa com um comentário de responsabilidade', () => {
  for (const f of listar('js', '.js'))
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

test('index.html: as tags de bloco abrem e fecham na mesma conta', () => {
  for (const tag of [
    'div',
    'section',
    'form',
    'ul',
    'ol',
    'details',
    'label',
    'button',
    'p',
  ]) {
    const { soltos, pendentes } = balanceamento(html, tag);

    assert.deepEqual([soltos, pendentes], [0, 0], `<${tag}> sem par`);
  }

  assert.deepEqual(
    aninhamento(html),
    [],
    'etiquetas fechadas fora da ordem em que abriram'
  );
});

test('cada stylesheet tem chaves balanceadas', () => {
  for (const f of cssDoHtml) {
    let n = 0;

    for (const c of ler(f).replace(/\/\*[\s\S]*?\*\//g, '')) {
      n += c === '{' ? 1 : c === '}' ? -1 : 0;
      assert.ok(n >= 0, `${f}: } a mais`);
    }

    assert.equal(n, 0, `${f}: { sem fechar`);
  }
});

test('index.html carrega todos os css/ e js/ na ordem certa e o que não pertence ao Treino não está na tela', () => {
  assert.deepEqual([...cssDoHtml].sort(), listar('css', '.css').sort());
  assert.deepEqual([...jsDoHtml].sort(), listar('js', '.js').sort());
  assert.equal(jsDoHtml[0], 'js/config.js');
  assert.equal(jsDoHtml.at(-1), 'js/bootstrap.js');
  // supabase.js, o núcleo comum (../base/nucleo.js) e o módulo do app Corpo (../corpo/perfil.js) antes dos módulos do Treino
  assert.deepEqual(scripts.slice(0, 3), [
    'supabase.js',
    '../base/nucleo.js',
    '../corpo/perfil.js',
  ]);

  // pesagem é do app Corpo; sem backup manual, senha mestra, sair ou trocar senha; sem histórico de treinos em lista
  for (const id of [
    'i-corpo',
    'v-corpo',
    'v-backup',
    'm-form',
    'v-senha',
    'a-sair',
    'sair',
    'v-ajustes',
    'i-treinos',
    'v-treinos',
  ])
    assert.equal(elementoPorId(html, id), undefined, `#${id} não pertence ao Treino`);

  for (const dest of ['backup', 'senha'])
    assert.equal(
      tags.filter((e) => e.attrs['data-ir'] === dest).length,
      0,
      `data-ir=${dest}`
    );
  assert.deepEqual(
    tags
      .filter((e) => e.tag === 'input' && e.attrs.type === 'password')
      .map((e) => e.attrs.id),
    ['l-senha'] // a única senha é a do login
  );
});

test('login: campos com o nome dentro (placeholder) e a marca do hub na tela inicial volta para ../', () => {
  assert.equal(
    elementoPorId(html, 'l-email', { obrigatorio: true }).attrs.placeholder,
    'Usuário'
  );
  assert.equal(
    elementoPorId(html, 'l-senha', { obrigatorio: true }).attrs.placeholder,
    'Senha'
  );

  const hub = elementoPorId(html, 'i-hub', { obrigatorio: true });

  assert.deepEqual(hub, {
    tag: 'a',
    attrs: {
      class: 'bt-ic',
      href: '../',
      id: 'i-hub',
      title: 'Hub',
      'aria-label': 'Hub',
    },
  });
  // fica antes da engrenagem, no topo
  const ids = tags.map((e) => e.attrs.id || e.attrs['data-ir']);

  assert.ok(ids.indexOf('i-hub') < ids.indexOf('editar'));
});

// O service worker rodado de verdade num contexto isolado, com caches e rede falsos
async function rodarSw(chaves = []) {
  const ouvintes = {},
    guardados = [],
    apagados = [],
    estado = { claims: 0, skips: 0 };

  vm.runInNewContext(ler('sw.js'), {
    self: {
      addEventListener: (tipo, fn) => (ouvintes[tipo] = fn),
      skipWaiting: () => estado.skips++,
      clients: { claim: () => estado.claims++ },
      location: { origin: 'http://localhost' },
    },
    caches: {
      open: async () => ({ put: async (arquivo) => guardados.push(arquivo) }),
      keys: async () => chaves,
      delete: async (k) => apagados.push(k),
    },
    fetch: async () => ({ ok: true }),
    URL,
  });

  const disparar = async (tipo) => {
    let espera;

    ouvintes[tipo]({ waitUntil: (p) => (espera = p) });
    // install e activate têm de segurar o evento (waitUntil); sem isso o navegador o encerraria antes do fim
    assert.ok(espera, `service worker: o evento ${tipo} não chamou waitUntil`);
    await espera;
  };

  return { disparar, guardados, apagados, estado, tipos: Object.keys(ouvintes) };
}

test('service worker: instala guardando todo css/js/index/manifest/ícones que existem, e o que a página carrega', async () => {
  const sw = await rodarSw();

  assert.deepEqual(sw.tipos.sort(), ['activate', 'fetch', 'install']);
  await sw.disparar('install');
  assert.equal(sw.estado.skips, 1);

  const norm = (p) => path.posix.normalize(p);
  const guardados = new Set(sw.guardados.map(norm));

  for (const f of [...folhas, ...scripts, 'index.html', 'manifest.webmanifest'])
    assert.ok(guardados.has(norm(f)), `sw.js não guarda ${f}`);
  assert.ok(guardados.has('../corpo/perfil.js')); // módulo do app Corpo, para abrir offline
  assert.ok(guardados.has('../base/nucleo.js')); // núcleo comum (fetchComTeto), para abrir offline

  for (const f of sw.guardados)
    assert.ok(existsSync(path.join(RAIZ, f)), `sw.js guarda ${f}, que não existe`);
});

test('service worker: ao ativar só apaga os caches "carga-" antigos (fin e a página inicial dividem a origem)', async () => {
  const sw = await rodarSw([
    'carga-estatico',
    'carga-v21',
    'carga-outro',
    'fin-cache',
    'hub-estatico',
    'al-x',
  ]);

  await sw.disparar('activate');
  assert.deepEqual(sw.apagados, ['carga-v21', 'carga-outro']);
  assert.equal(sw.estado.claims, 1);
});

test('bootstrap: sem sessão, dentro do hub vai ao login dele (sem telaLogin); fora do hub usa o login próprio; com sessão carrega o app', async () => {
  const arquivo = path.join(RAIZ, 'js/bootstrap.js');

  const noHub = await rodarBootstrapApp(arquivo, {
    pathname: '/hub/tr/',
    search: '?dia=2026-10-21',
  });

  assert.deepEqual(noHub.destinos, ['../?volta=tr%2F%3Fdia%3D2026-10-21']);
  assert.deepEqual(noHub.chamadas, []);
  assert.deepEqual(noHub.registros, [['sw.js', { updateViaCache: 'none' }]]);

  const fora = await rodarBootstrapApp(arquivo, { pathname: '/' });

  assert.deepEqual(fora.destinos, []);
  assert.deepEqual(fora.chamadas, [['telaLogin']]);

  const usuario = { id: 'u1' };

  const logado = await rodarBootstrapApp(arquivo, {
    pathname: '/hub/tr/',
    sessao: { user: usuario },
  });

  assert.deepEqual(logado.chamadas, [['carregar', usuario]]);
  assert.deepEqual(logado.destinos, []);
});

test('PWA: manifest válido, ícones existem e a página aponta para o manifest', () => {
  const m = JSON.parse(ler('manifest.webmanifest'));

  assert.equal(m.display, 'standalone');
  assert.ok(m.name && m.start_url);

  for (const i of m.icons) assert.ok(existsSync(path.join(RAIZ, i.src)), i.src);
  assert.ok(
    tags.some(
      (e) =>
        e.tag === 'link' &&
        e.attrs.rel === 'manifest' &&
        e.attrs.href === 'manifest.webmanifest'
    )
  );
});

test('migrations no formato do DataGrip e RLS só do dono em todas as tabelas tr_', () => {
  const sql = listar('migrations', '.sql').map(ler),
    tudo = sql.join('\n');

  for (const s of sql) {
    assert.doesNotMatch(s, /do \$\$/, 'sem bloco do $$');

    for (const linha of s.split('\n').filter((l) => l.trim().startsWith('--')))
      assert.ok(!linha.includes(';'), `; em comentário: ${linha}`);
    assert.match(s, /^begin;$/m);
    assert.match(s, /^commit;$/m);
  }

  const { DONO: dono } = carregarTr();

  for (const [, t] of tudo.matchAll(/create table public\.(tr_\w+)/g)) {
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
        `create policy ${t}_somente_victor on public\\.${t} as restrictive[^;]*'${dono}'`
      ),
      t
    );
  }
});

test('exercício incluído por migration tem a descrição e a posição no GUIA (js/config.js)', () => {
  const { GUIA } = carregarTr();

  // linhas de tr_variacao nas migrations: (user_id, id, exercicio_id, ordem, nome, unidade, …)
  const nomes = listar('migrations', '.sql')
    .flatMap((f) =>
      [
        ...ler(f).matchAll(
          /'[\w]+', '[\w]+', [0-2], '([^']*)', '(?:kg|lb|nível|corpo|s)'/g
        ),
      ].map((m) => m[1])
    )
    .filter(Boolean);

  assert.deepEqual(nomes, [
    'Elevação pélvica na máquina',
    'Elevação pélvica no Smith',
    'Elevação pélvica com halter',
    'Flexão com joelhos apoiados',
    'Flexão completa',
    'Pendurar na barra',
    'Negativa na barra',
    'Barra fixa',
    'Rosca de punho com halteres',
    'Rosca de punho invertida com halteres',
  ]);

  for (const nome of nomes) assert.ok(GUIA[nome.toLowerCase()], `${nome} sem GUIA`);
});

test('nenhum segredo no repositório; a chave do Supabase é a publicável', () => {
  const textos = [
    'index.html',
    'sw.js',
    'AGENTS.md',
    ...listar('js', '.js'),
    ...listar('docs', '.md'),
    ...listar('migrations', '.sql'),
  ];

  for (const f of textos) assert.doesNotMatch(ler(f), /service_role|sb_secret_/, f);
  assert.ok(carregarTr().SUPABASE_KEY.startsWith('sb_publishable_'));
});

test('higiene textual do .editorconfig (scripts/check-style.mjs)', () => {
  const r = spawnSync(process.execPath, ['scripts/check-style.mjs'], {
    cwd: RAIZ,
    encoding: 'utf8',
  });

  assert.equal(r.status, 0, r.stderr);
});

test('documentação: Sair só no hub e a marca do hub (volta ao hub, ../), login e voltar do hub', () => {
  const regras = ler('docs/REGRAS.md');

  assert.match(regras, /o login e o Sair ficam só na página inicial do hub/);
  assert.match(regras, /marca do hub \(volta ao hub, `\.\.\/`\)/);
  assert.match(regras, /sem sessão, o tr vai direto para `\.\.\/\?volta=tr\/`/);
});
