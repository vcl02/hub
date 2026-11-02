// Estrutura da Água (sem navegador): cabeçalhos, ordem de carga, service worker, PWA, migration/RLS e segredos.
// O objeto destes testes é o arquivo como texto (cabeçalho, SQL, segredos) ou a estrutura lida por leitores (HTML como
// elementos, CSS como regras, listas e funções rodadas num contexto isolado); o comportamento está em funcoes.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregar } from '../../tests/funcoes.mjs';
import { rodarSw } from '../../tests/sw-falso.mjs';
import { rodarBootstrapApp } from '../../tests/bootstrap-falso.mjs';
import {
  etiquetas,
  aninhamento,
  balanceamento,
  chavesDoCss,
} from '../../tests/leitores.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => readFileSync(path.join(RAIZ, arquivo), 'utf8');

const doApp = (arquivo, nomes, contexto, depois) =>
  carregar(path.join(RAIZ, arquivo), nomes, contexto, depois);

const listar = (pasta, ext) =>
  readdirSync(path.join(RAIZ, pasta))
    .filter((n) => n.endsWith(ext))
    .map((n) => `${pasta}/${n}`);

const html = ler('index.html');

// Os <script src> do index.html, na ordem em que carregam (o corpo dos scripts não conta)
const scripts = etiquetas(html)
  .filter((e) => e.tag === 'script' && e.attrs.src)
  .map((e) => e.attrs.src);

const jsDoHtml = scripts.filter((f) => f.startsWith('js/'));
const DONO = doApp('js/config.js', ['DONO']).DONO;
const FUNCAO = 'supabase/functions/agua-lembrete/index.ts';

test('todo arquivo de código começa com um comentário de responsabilidade', () => {
  for (const f of [...listar('js', '.js'), 'bebidas.js'])
    assert.match(ler(f), /^'use strict';\n\s*(\/\/ |\/\*)/, f);

  for (const f of listar('css', '.css')) assert.match(ler(f), /^\/\* /, f);

  for (const f of [
    'sw.js',
    FUNCAO,
    ...listar('scripts', '.mjs'),
    ...listar('tests', '.mjs'),
    ...listar('tests/helpers', '.mjs'),
  ])
    assert.match(ler(f), /^\/\/ /, f);

  for (const f of listar('migrations', '.sql')) assert.match(ler(f), /^-- /, f);
});

test('index.html: as tags de bloco fecham e o css tem chaves balanceadas', () => {
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

    assert.deepEqual([soltos, pendentes], [0, 0], `<${tag}> sem par`);
  }

  assert.deepEqual(
    aninhamento(html),
    [],
    'etiquetas fechadas fora da ordem em que abriram'
  );

  const { abertas, fechadas, nuncaNegativo } = chavesDoCss(ler('css/agua.css'));

  assert.ok(abertas > 0 && nuncaNegativo);
  assert.equal(abertas, fechadas);
});

test('ordem de carga: supabase do hub e módulo do Corpo antes dos módulos; o service worker guarda tudo', () => {
  assert.deepEqual([...jsDoHtml].sort(), listar('js', '.js').sort());
  assert.deepEqual(jsDoHtml, [
    'js/config.js',
    'js/util.js',
    'js/banco.js',
    'js/conta.js',
    'js/notificacoes.js',
    'js/telas.js',
    'js/bootstrap.js',
  ]);
  assert.deepEqual(scripts.slice(0, 4), [
    '../supabase.js',
    '../corpo/perfil.js',
    'bebidas.js',
    'js/config.js',
  ]);

  const guardados = doApp('sw.js', ['ARQUIVOS_ESTATICOS']).ARQUIVOS_ESTATICOS;

  for (const f of [
    './index.html',
    './css/agua.css',
    './manifest.webmanifest',
    '../supabase.js',
    '../corpo/perfil.js',
    './bebidas.js',
    ...jsDoHtml.map((f) => './' + f),
  ])
    assert.ok(guardados.includes(f), `sw.js não guarda ${f}`);

  for (const f of guardados)
    assert.ok(existsSync(path.join(RAIZ, f)), `sw.js guarda ${f}, que não existe`);
});

test('service worker: o install segura o evento (waitUntil) e guarda no cache agua-estatico cada arquivo da lista, e só eles', async () => {
  const instalado = rodarSw(path.join(RAIZ, 'sw.js'));

  await instalado.instalar(); // falha se o install não chamar waitUntil
  assert.deepEqual(instalado.abertos, ['agua-estatico']);
  assert.deepEqual(
    [...instalado.guardados].sort(),
    [...doApp('sw.js', ['ARQUIVOS_ESTATICOS']).ARQUIVOS_ESTATICOS].sort()
  );
});

test('bootstrap: com sessão salva carrega o app (baixa a nuvem) em vez de ir ao login; sem sessão, dentro do hub vai ao login dele e fora usa o próprio', async () => {
  const arquivo = path.join(RAIZ, 'js/bootstrap.js');

  // A Água declara carregar e telaLogin no próprio bootstrap: o espião é o que elas chamam (baixar) e a tela de login (v-login)
  const extras = (chamadas) => ({
    DONO: 'dono',
    $: (id) => ({
      addEventListener: () => {},
      set hidden(v) {
        if (id === 'v-login' && v === false) chamadas.push(['telaLogin']);
      },
    }),
    erroSync: '',
    store: { get: () => null, set: () => {} },
    K_LOCAL: () => 'local',
    K_BASE: () => 'base',
    preparar: (d) => d,
    desenhar: () => {},
    pintarNotificacoes: () => {},
    pintarSync: () => {},
    temPendente: () => false,
    baixar: async () => {
      chamadas.push(['baixar']);
      throw new Error('sem nuvem no teste');
    },
  });

  const comSessao = await rodarBootstrapApp(arquivo, {
    pathname: '/hub/agua/',
    sessao: { user: { id: 'dono' } },
    extras,
  });

  assert.deepEqual(comSessao.chamadas, [['baixar']]);
  assert.deepEqual(comSessao.destinos, []);
  assert.deepEqual(comSessao.registros, [['sw.js', { updateViaCache: 'none' }]]);

  const noHub = await rodarBootstrapApp(arquivo, {
    pathname: '/hub/agua/',
    search: '?dia=2026-10-18',
    extras,
  });

  assert.deepEqual(noHub.destinos, ['../?volta=agua%2F%3Fdia%3D2026-10-18']);
  assert.deepEqual(noHub.chamadas, []);

  const fora = await rodarBootstrapApp(arquivo, { pathname: '/', extras });

  assert.deepEqual(fora.destinos, []);
  assert.deepEqual(fora.chamadas, [['telaLogin']]); // mostrou o login próprio, sem baixar nada
});

test('service worker: ao ativar apaga só os caches antigos da Água, nunca os dos outros apps; atende a página (também com ?dia, sem internet) e não atende outros domínios nem POST', async () => {
  const sw = path.join(RAIZ, 'sw.js');

  const vizinhos = [
    'carga-estatico',
    'al-estatico',
    'corpo-estatico',
    'fin-estatico',
    'hub-estatico',
  ];

  const ativado = rodarSw(sw, {
    existentes: ['agua-estatico', 'agua-v1', 'agua-antigo', ...vizinhos],
  });

  await ativado.ativar();
  assert.deepEqual(ativado.apagados, ['agua-v1', 'agua-antigo']);

  const rede = rodarSw(sw);
  const agua = 'https://vcl02.github.io/hub/agua/';

  assert.equal((await rede.atende(agua + 'js/util.js')).atendeu, true);
  assert.equal(
    (await rede.atende('https://yzmyncxoskvqzdczaill.supabase.co/rest/v1/x')).atendeu,
    false
  );
  assert.equal(
    (await rede.atende(agua + 'js/util.js', { metodo: 'POST' })).atendeu,
    false
  );
  assert.equal((await rede.atende(agua + 'js/util.js?v=2')).atendeu, false); // outras buscas vão direto à rede
  assert.equal(
    (await rede.atende(agua + '?dia=2026-10-18', { modo: 'navigate' })).atendeu,
    true
  );

  const semInternet = rodarSw(sw, { rede: false, cacheado: { './': 'pagina do cache' } });

  assert.equal(
    (await semInternet.atende(agua + '?dia=2026-10-18', { modo: 'navigate' })).resposta,
    'pagina do cache'
  ); // a página com ?dia abre do cache
});

test('PWA: manifest válido e ícones existem', () => {
  const m = JSON.parse(ler('manifest.webmanifest'));

  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');

  for (const i of m.icons) assert.ok(existsSync(path.join(RAIZ, i.src)), i.src);
});

test('localStorage só com prefixo agua.', () => {
  const chaves = doApp(
    'js/banco.js',
    ['K_LOCAL'],
    {},
    '__saida.todas = [K_LOCAL, K_BASE, K_VOO];'
  ).todas;

  assert.deepEqual(JSON.parse(JSON.stringify(chaves.map((chave) => chave('conta')))), [
    'agua.db.conta',
    'agua.base.conta',
    'agua.voo.conta',
  ]);
});

test('migration no formato do DataGrip e RLS só do Victor', () => {
  const sql = listar('migrations', '.sql').map(ler),
    tudo = sql.join('\n');

  for (const s of sql) {
    assert.doesNotMatch(s, /do \$\$/);

    for (const linha of s.split('\n').filter((l) => l.trim().startsWith('--')))
      assert.ok(!linha.includes(';'), `; em comentário: ${linha}`);
    assert.match(s, /^begin;$/m);
    assert.match(s, /^commit;$/m);
  }

  assert.match(tudo, /create table if not exists public\.agua_dia/);
  assert.match(tudo, /alter table public\.agua_dia enable row level security/);
  assert.match(tudo, /revoke all on public\.agua_dia from anon/);
  assert.match(
    tudo,
    /create policy agua_dia_somente_dono on public\.agua_dia for all to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/
  );
  assert.match(
    tudo,
    new RegExp(
      `create policy agua_dia_somente_victor on public\\.agua_dia as restrictive[^;]*'${DONO}'`
    )
  );
});

test('migration das notificações: inscrições só do Victor, chaves sem policy e agendamento de hora em hora', () => {
  const sql = ler('migrations/01-notificacoes.sql');

  assert.match(sql, /alter table public\.push_inscricao enable row level security/);
  assert.match(sql, /revoke all on public\.push_inscricao from anon/);
  assert.match(
    sql,
    new RegExp(
      `create policy push_inscricao_somente_victor on public\\.push_inscricao as restrictive[^;]*'${DONO}'`
    )
  );
  assert.match(sql, /alter table public\.push_chave enable row level security/);
  assert.match(sql, /revoke all on public\.push_chave from anon, authenticated/);
  assert.doesNotMatch(sql, /create policy \w+ on public\.push_chave/); // só a chave de serviço lê

  const agendado = sql.match(
    /select cron\.schedule\('agua-lembrete', '1 \* \* \* \*', \$cron\$([^$]+)\$cron\$\)/
  )[1];

  assert.ok(
    !agendado.includes(';'),
    'ponto e vírgula dentro do comando agendado quebra no DataGrip'
  );
  assert.match(agendado, /functions\/v1\/agua-lembrete'/);
  assert.match(
    agendado,
    /'x-agua-token', coalesce\(\(select token from public\.push_chave where id = 1\)/
  );
});

test('migration dos dentes: agenda 20 min depois de comida nova de hoje, fila sem policy, cron de minuto em minuto sem ; dentro', () => {
  const sql = ler('migrations/02-lembrete-dentes.sql');

  assert.match(
    sql,
    /create trigger agendar_dentes after insert on public\.al_registro for each row execute function public\.agendar_dentes\(\);/
  );
  assert.match(
    sql,
    /if new\.data = \(now\(\) at time zone 'America\/Sao_Paulo'\)::date then/
  );
  assert.match(
    sql,
    /now\(\) \+ interval '20 minutes'\)\n {4}on conflict \(user_id, tipo\) do update set enviar_em = excluded\.enviar_em;/
  ); // outra comida empurra

  for (const t of ['push_agendado', 'push_ultimo']) {
    assert.match(
      sql,
      new RegExp(
        `alter table public\\.${t} enable row level security;\\nrevoke all on public\\.${t} from anon, authenticated;`
      )
    );
    assert.doesNotMatch(sql, new RegExp(`create policy \\w+ on public\\.${t}`));
  }

  const agendado = sql.match(
    /select cron\.schedule\('dentes-lembrete', '\* \* \* \* \*', \$cron\$([^$]+)\$cron\$\)/
  )[1];

  assert.ok(
    !agendado.includes(';'),
    'ponto e vírgula dentro do comando agendado quebra no DataGrip'
  );
  assert.match(
    agendado,
    /delete from public\.push_agendado where tipo = 'dentes' and enviar_em <= now\(\)/
  );
  assert.match(
    agendado,
    /body := '\{"tipo":"dentes"\}'::jsonb\) from \(select 1 from vencido limit 1\) v$/
  );
});

test('app e função falam a mesma língua: o nome da função que o app chama é a pasta da função e o da migration', () => {
  const { FUNCAO_PUSH } = doApp('js/notificacoes.js', ['FUNCAO_PUSH']);

  assert.ok(existsSync(path.join(RAIZ, 'supabase/functions', FUNCAO_PUSH, 'index.ts')));
  assert.ok(
    ler('migrations/01-notificacoes.sql').includes(`functions/v1/${FUNCAO_PUSH}'`)
  );
  // o mesmo dono, os horários e a rotina na função: conferidos pelo comportamento em funcao.test.mjs
});

test('nenhum segredo', () => {
  for (const f of [
    'index.html',
    'sw.js',
    'AGENTS.md',
    'README.md',
    ...listar('js', '.js'),
    ...listar('docs', '.md'),
    ...listar('migrations', '.sql'),
  ])
    assert.doesNotMatch(ler(f), /service_role|sb_secret_/, f);
  assert.doesNotMatch(ler(FUNCAO), /service_role|sb_secret_|BEGIN PRIVATE/);
  assert.ok(
    doApp('js/config.js', ['SUPABASE_KEY']).SUPABASE_KEY.startsWith('sb_publishable_')
  ); // só a chave publicável
});
