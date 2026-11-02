// Estrutura da página inicial do hub (sem navegador): hábitos e atalhos, PWA, service workers e workflows da raiz.
// O HTML é lido como elementos e o CSS como regras (tests/leitores.mjs); o hub.js e os service workers rodam num contexto
// simulado (tests/hub-falso.mjs e tests/sw-falso.mjs). Texto só onde o objeto é texto (workflows, SQL, segredos, cabeçalhos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregar, carregarArquivos } from './funcoes.mjs';
import { etiquetas, elementoPorId, declaracoes, regras } from './leitores.mjs';
import { iniciarHub } from './hub-falso.mjs';
import { rodarSw } from './sw-falso.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => readFileSync(path.join(RAIZ, arquivo), 'utf8');
const existe = (arquivo) => existsSync(path.join(RAIZ, arquivo));

const doApp = (arquivo, nomes, contexto, depois) =>
  carregar(path.join(RAIZ, arquivo), nomes, contexto, depois);

const json = (x) => JSON.parse(JSON.stringify(x));

const html = ler('index.html');
const tags = etiquetas(html);
const classes = (e) => (e.attrs.class || '').split(/\s+/).filter(Boolean);

const scriptsDe = (conteudo) =>
  etiquetas(conteudo)
    .filter((e) => e.tag === 'script' && e.attrs.src)
    .map((e) => e.attrs.src);

// Cada hábito/atalho é um <a class="app ..."> seguido do <img class="app-icone"> dele
const links = (filtro) =>
  tags.flatMap((e, i) => {
    if (e.tag !== 'a' || !classes(e).includes('app') || !filtro(classes(e))) return [];

    const icone = tags
      .slice(i + 1)
      .find((x) => x.tag === 'img' && classes(x).includes('app-icone'));

    return [
      {
        href: e.attrs.href,
        id: e.attrs['data-habito'],
        cor: e.attrs.style,
        icone: icone?.attrs.src,
      },
    ];
  });

const habitos = links((c) => c.includes('habito'));
const atalhos = links((c) => c.includes('atalho') && !c.includes('externo'));

test('um hábito por linha (os de habitos.js, o Fin pela Besteira); cada um aponta para uma pasta com index.html e um ícone que existe', () => {
  assert.deepEqual(
    habitos.map((h) => [h.id, h.href]),
    [
      ['treino', 'tr/'],
      ['deficit', 'al/'],
      ['corpo', 'corpo/'],
      ['agua', 'agua/'],
      ['besteira', 'fin/'],
    ]
  );

  const { HABITOS } = carregarArquivos([path.join(RAIZ, 'habitos.js')], ['HABITOS'], {
    Object,
    Math,
    Date,
  });

  assert.deepEqual(
    json(HABITOS).map((h) => [h.id, h.pasta]),
    habitos.map((h) => [h.id, h.href])
  ); // mesma lista e ordem do habitos.js
  assert.deepEqual(
    atalhos.map((a) => a.href),
    []
  ); // o Fin virou o hábito Besteira; os externos (class externo) à parte

  for (const { href, icone, cor } of [...habitos, ...atalhos]) {
    assert.ok(existe(`${href}index.html`), href);
    assert.ok(existe(icone), icone);
    assert.ok(cor.includes('--cor:'), href); // cada um traz a cor do módulo
  }

  const posicao = (classe) => tags.findIndex((e) => classes(e).includes(classe));

  assert.ok(
    posicao('habitos') >= 0 && posicao('habitos') < posicao('doca'),
    'atalhos depois dos hábitos'
  );
});

// O botão que volta ao hub: <a href="../" id="i-hub"> com a marca em traço (nó central ligado a quatro pontas)
const marcaDoHub = (conteudo) => {
  const E = etiquetas(conteudo),
    botao = E.find((e) => e.attrs.id === 'i-hub');

  if (!botao) return null;

  const formas = E.slice(E.indexOf(botao) + 1)
    .filter((e) => e.tag === 'circle' || e.tag === 'path')
    .slice(0, 6);

  const [centro, ligacoes, ...pontas] = formas;

  return {
    botao,
    ok:
      formas.length === 6 &&
      centro.tag === 'circle' &&
      [centro.attrs.cx, centro.attrs.cy, centro.attrs.r].join() === '12,12,3' &&
      ligacoes.tag === 'path' &&
      ligacoes.attrs.d.startsWith('M9.9 9.9 6.6 6.6') &&
      pontas.every(
        (c) =>
          c.tag === 'circle' &&
          c.attrs.r === '2' &&
          ['5', '19'].includes(c.attrs.cx) &&
          ['5', '19'].includes(c.attrs.cy)
      ),
  };
};

test('cada app volta para o hub (../) pelo botão com a mesma marca em traço', () => {
  for (const app of ['fin', 'tr', 'al', 'corpo', 'agua']) {
    const marca = marcaDoHub(ler(`${app}/index.html`));

    assert.equal(marca.botao.tag, 'a', app);
    assert.equal(marca.botao.attrs.href, '../', app);
    assert.ok(
      ['icon-btn', 'bt-ic'].some((c) => classes(marca.botao).includes(c)),
      app
    ); // bt-ic: o botão da base comum
    assert.ok(marca.ok, `${app}: marca do hub`);
  }
});

test('tema escuro único: hub, fin e os módulos na base com o mesmo fundo', () => {
  const tema = (conteudo, nome) =>
    etiquetas(conteudo).find((e) => e.tag === 'meta' && e.attrs.name === nome)?.attrs
      .content;

  for (const app of ['fin', 'tr', 'al', 'corpo', 'agua'])
    assert.ok(
      etiquetas(ler(`${app}/index.html`)).some(
        (e) =>
          e.tag === 'link' &&
          e.attrs.rel === 'stylesheet' &&
          e.attrs.href === '../base/tokens.css'
      ),
      app
    ); // na base comum
  assert.ok(
    tags.some(
      (e) =>
        e.tag === 'link' &&
        e.attrs.rel === 'stylesheet' &&
        e.attrs.href === 'base/tokens.css'
    )
  ); // a página inicial também
  assert.ok(
    declaracoes(ler('base/tokens.css'), ':root', '').some(
      (d) => d.toLowerCase() === '--bg: #1b1e21'
    )
  ); // módulo na base comum: o fundo vem de lá

  for (const arquivo of [
    'index.html',
    'fin/index.html',
    'tr/index.html',
    'al/index.html',
    'corpo/index.html',
    'agua/index.html',
  ])
    assert.equal(tema(ler(arquivo), 'theme-color').toLowerCase(), '#1b1e21', arquivo);
  assert.equal(tema(html, 'color-scheme'), 'dark');
});

test('PWA do hub: manifest válido, ícones existem, service worker registrado sem cache de HTTP', () => {
  const manifest = JSON.parse(ler('manifest.webmanifest'));

  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');

  for (const icone of manifest.icons) assert.ok(existe(icone.src), icone.src);
  assert.deepEqual(json(iniciarHub().registros), [['sw.js', { updateViaCache: 'none' }]]);
});

test('service workers dividem a origem sem apagar o cache um do outro: cada app só apaga os caches antigos do próprio prefixo; o da raiz não apaga nenhum', async () => {
  const todos = [
    'hub-estatico',
    'carga-estatico',
    'al-estatico',
    'corpo-estatico',
    'agua-estatico',
    'fin-estatico',
  ];

  for (const [arquivo, prefixo] of [
    ['tr/sw.js', 'carga-'],
    ['al/sw.js', 'al-'],
    ['corpo/sw.js', 'corpo-'],
    ['agua/sw.js', 'agua-'],
  ]) {
    const sw = rodarSw(path.join(RAIZ, arquivo), {
      existentes: [...todos, prefixo + 'velho', prefixo + 'outro'],
    });

    await sw.ativar();
    assert.deepEqual(sw.apagados, [prefixo + 'velho', prefixo + 'outro'], arquivo);
  }

  for (const arquivo of ['sw.js', 'fin/service-worker.js']) {
    const sw = rodarSw(path.join(RAIZ, arquivo), {
      existentes: [...todos, 'hub-velho', 'fin-velho'],
    });

    await sw.ativar();
    assert.deepEqual(sw.apagados, [], arquivo); // fin e tr dividem a mesma origem e os mesmos caches
  }
});

test('service worker da raiz: guarda só os arquivos da página inicial (e os módulos que ela carrega) e atende só eles, nunca fin/ nem tr/', async () => {
  const { ARQUIVOS_ESTATICOS: arquivos } = doApp('sw.js', ['ARQUIVOS_ESTATICOS']);

  for (const arquivo of arquivos)
    if (arquivo !== './') assert.ok(existe(arquivo), arquivo);

  for (const f of [
    './habitos.js',
    './base/nucleo.js',
    './corpo/perfil.js',
    './agua/bebidas.js',
    './al/gasto.js',
    './icons/agenda.svg',
  ])
    assert.ok(arquivos.includes(f), f); // a página inicial abre sem internet

  const sw = rodarSw(path.join(RAIZ, 'sw.js')),
    hub = 'https://vcl02.github.io/hub/';

  for (const f of arquivos)
    assert.equal((await sw.atende(new URL(f, hub).href)).atendeu, true, f);
  assert.equal((await sw.atende(hub + 'hub.js?v=2')).atendeu, true); // a busca não conta
  assert.equal((await sw.atende(hub + 'fin/index.html')).atendeu, false);
  assert.equal((await sw.atende(hub + 'tr/js/banco.js')).atendeu, false);
  assert.equal((await sw.atende(hub + 'agua/')).atendeu, false);
  assert.equal((await sw.atende(hub + 'hub.js', { metodo: 'POST' })).atendeu, false);
});

test('workflows só na raiz (nas pastas dos apps o GitHub não roda)', () => {
  assert.ok(!existe('fin/.github') && !existe('tr/.github'));
  const validacao = ler('.github/workflows/validacao.yml');

  assert.match(validacao, /run: npm ci && npx playwright install --with-deps chromium/);
  assert.match(validacao, /run: node scripts\/check\.mjs/);
  // O GitHub confere o mesmo que roda local: ESLint, Prettier e EditorConfig, antes da validação.
  const passos = [...validacao.matchAll(/run: (.+)/g)].map((m) => m[1]);

  assert.deepEqual(passos, [
    'npm ci && npx playwright install --with-deps chromium',
    'npm run lint',
    'npm run format:check',
    'npm run editorconfig',
    'node scripts/check.mjs',
  ]);
  const scripts = JSON.parse(ler('package.json')).scripts;

  assert.equal(scripts.lint, 'eslint .');
  assert.equal(scripts['format:check'], 'prettier --check .');
  assert.equal(scripts.editorconfig, 'node scripts/editorconfig.mjs');
  assert.match(
    ler('.github/workflows/avisar-pages-publicado.yml'),
    /Idempotency-Key': `hub-pages-\$\{commit\}`/
  );
  assert.ok(existe('.nojekyll'));
});

test('login do hub antes dos apps: mesma conta e mesmo supabase-js do tr', () => {
  const login = elementoPorId(html, 'v-login', { obrigatorio: true }),
    apps = elementoPorId(html, 'v-apps', { obrigatorio: true });

  assert.ok(
    tags.findIndex((e) => e.attrs.id === 'v-login') <
      tags.findIndex((e) => e.attrs.id === 'v-apps')
  );
  assert.deepEqual(
    [login.tag, classes(login), 'hidden' in login.attrs],
    ['main', ['entrar'], true]
  );
  assert.deepEqual(
    [apps.tag, classes(apps), 'hidden' in apps.attrs],
    ['main', ['hub'], true]
  ); // nada aparece antes de hub.js decidir
  assert.match(ler('hub.js'), /^'use strict';\n\/\/ /); // cabeçalho com a responsabilidade do arquivo

  const hub = doApp('hub.js', ['DONO', 'SUPABASE_KEY']);

  assert.equal(hub.DONO, doApp('tr/js/config.js', ['DONO']).DONO);
  assert.ok(hub.SUPABASE_KEY.startsWith('sb_publishable_'));
  assert.doesNotMatch(ler('hub.js'), /service_role|sb_secret_/);
  assert.ok(
    readFileSync(path.join(RAIZ, 'supabase.js')).equals(
      readFileSync(path.join(RAIZ, 'tr/supabase.js'))
    ),
    'supabase.js igual ao do tr'
  );
  // supabase-js, o núcleo comum, os módulos compartilhados (dados sobre mim e gasto do dia), os hábitos e só então hub.js
  assert.deepEqual(scriptsDe(html), [
    'supabase.js',
    'base/nucleo.js',
    'corpo/perfil.js',
    'agua/bebidas.js',
    'al/gasto.js',
    'habitos.js',
    'hub.js',
  ]);
});

test('login: usuário desconhecido e senha errada dão a mesma mensagem; sem internet avisa a conexão; outra conta não passa; o login destrava sempre', async () => {
  const dono = doApp('hub.js', ['DONO']).DONO;

  const tentar = async (usuario, senha, entrar) => {
    const hub = iniciarHub({ entrar });

    await hub.aberto();
    assert.equal(hub.el('v-login').hidden, false); // sem sessão: só o login
    await hub.login(usuario, senha);

    return {
      hub,
      erro: hub.el('l-erro').textContent,
      entrando: hub.el('l-botao').textContent,
      travado: hub.el('l-campos').disabled,
      apps: hub.el('v-apps').hidden,
      login: hub.el('v-login').hidden,
    };
  };

  const invalido = { data: null, error: { message: 'Invalid login credentials' } };

  const desconhecido = await tentar('fulano', 'senha123', async () => invalido);

  assert.deepEqual(desconhecido.hub.entradas, []); // nem chega ao Supabase
  assert.equal(desconhecido.erro, 'Usuário ou senha inválidos.');

  const errada = await tentar('eu@teste.com', 'errada', async () => invalido);

  assert.equal(errada.erro, 'Usuário ou senha inválidos.'); // a mesma: não revela quais usuários existem
  assert.deepEqual(json(errada.hub.entradas), [
    { email: 'eu@teste.com', password: 'errada' },
  ]);
  assert.deepEqual(
    [errada.apps, errada.login, errada.travado, errada.entrando],
    [true, false, false, 'Entrar']
  );

  const vitor = await tentar('Victor', 'senha123', async () => invalido); // o usuário vira o e-mail

  assert.equal(vitor.hub.entradas[0].email, 'victor.cabrera0209@gmail.com');

  // sem internet: o supabase-js devolve status 0 (ou lança); não pode virar "senha inválida"
  for (const sem of [
    async () => ({ data: null, error: { status: 0, message: 'Failed to fetch' } }),
    async () => ({
      data: null,
      error: { name: 'AuthRetryableFetchError', status: 500, message: 'x' },
    }),
    async () => {
      throw new TypeError('Failed to fetch');
    },
  ]) {
    const r = await tentar('eu@teste.com', 'senha123', sem);

    assert.equal(r.erro, 'Sem conexão. Tente de novo.');
    assert.deepEqual([r.travado, r.entrando, r.apps], [false, 'Entrar', true]); // destrava para tentar de novo
  }

  const servidor = await tentar('eu@teste.com', 'senha123', async () => ({
    data: null,
    error: { status: 500, message: 'database error' },
  }));

  assert.equal(servidor.erro, 'Não foi possível entrar: database error');

  // outra conta entra no Supabase mas não passa do login, e a sessão dela sai do aparelho
  const outra = await tentar('eu@teste.com', 'senha123', async () => ({
    data: { user: { id: 'outra-conta' } },
    error: null,
  }));

  assert.equal(outra.erro, 'Esta conta não tem acesso.');
  assert.deepEqual([outra.apps, outra.hub.saidas.length], [true, 1]);
  assert.deepEqual(json(outra.hub.saidas), [{ scope: 'local' }]);

  // a conta do dono, vindo de um app (?volta): volta para ele
  const volta = iniciarHub({
    search: '?volta=' + encodeURIComponent('agua/?dia=2026-10-18'),
    entrar: async () => ({ data: { user: { id: dono } }, error: null }),
  });

  await volta.aberto();
  await volta.login('eu@teste.com', 'senha123');
  assert.deepEqual(volta.location.trocados, ['agua/?dia=2026-10-18']);
  assert.equal(volta.el('l-senha').value, ''); // a senha não fica na tela
});

test('?volta só leva para a pasta de um app da página (hábito ou atalho do hub), nunca para fora, para o atalho externo nem com ..', () => {
  const volta = (busca, linksExtras) => {
    const hub = iniciarHub({ search: busca, linksExtras });

    return hub.contexto.destinoDaVolta();
  };

  for (const ok of [
    'tr/',
    'fin/?ciclo=2026-10',
    'agua/?dia=2026-10-18',
    'al/#x',
    'corpo/',
    'agua/?dia=2026-10-18#y',
  ])
    assert.equal(volta('?volta=' + encodeURIComponent(ok)), ok, ok);

  for (const ruim of [
    'https://evil.example/',
    '//evil.example/',
    '../x',
    'tr/../fin/',
    'tr/\\x',
    'trx/',
    'javascript:alert(1)',
    'outro/',
    'fin/../../x',
    'tr/js/banco.js', // só a pasta do app, com ?busca ou #, não um arquivo dentro dela
    'agua',
    'https://calendar.google.com/calendar/r',
    '',
  ])
    assert.equal(volta('?volta=' + encodeURIComponent(ruim)), null, ruim);
  assert.equal(volta(''), null);

  // Cada defesa sozinha, com o formato que a outra deixaria passar:
  // o filtro de "..", "//" e barra invertida (a pasta e o ? estão certos, o resto é que tem o truque)
  for (const ruim of ['tr/?x=../..', 'tr/?a=//evil', 'tr/?a=\\x', 'tr/#../x'])
    assert.equal(volta('?volta=' + encodeURIComponent(ruim)), null, ruim);

  // o seletor .app:not(.externo): um atalho externo cuja "pasta" casaria com o formato não vale como app da página
  const externo = [{ class: 'app atalho externo', href: 'externo/' }];

  assert.equal(volta('?volta=externo%2F', externo), null);
  assert.equal(volta('?volta=externo%2F%3Fa%3D1', externo), null);
  // sem a classe externo o mesmo link valeria (prova que quem barrou foi o seletor)
  assert.equal(
    volta('?volta=externo%2F', [{ class: 'app atalho', href: 'externo/' }]),
    'externo/'
  );
});

test('marca do hub em todo lugar: favicon, celular, login e o botão de volta nos apps', () => {
  const link = (rel, href) =>
    tags.find((e) => e.tag === 'link' && e.attrs.rel === rel && e.attrs.href === href);

  assert.equal(link('icon', 'icons/hub.svg').attrs.type, 'image/svg+xml');
  assert.deepEqual(
    [
      link('icon', 'icons/hub-32.png').attrs.sizes,
      link('icon', 'icons/hub-32.png').attrs.type,
    ],
    ['32x32', 'image/png']
  );
  assert.ok(link('apple-touch-icon', 'icons/hub-180.png'));
  assert.equal(
    tags.filter(
      (e) =>
        e.tag === 'img' && classes(e).includes('marca') && e.attrs.src === 'icons/hub.svg'
    ).length,
    1
  ); // só no login; nos hábitos o título é só o texto
  assert.equal(
    tags.filter(
      (e) =>
        e.tag === 'img' &&
        classes(e).includes('app-icone') &&
        e.attrs.src === 'icons/hub.svg'
    ).length,
    0
  ); // nenhum hábito ou atalho usa a marca

  const anotacoes = tags.findIndex(
    (e) => e.tag === 'a' && /^https:\/\/wa\.me\/\d+$/.test(e.attrs.href)
  );

  assert.ok(anotacoes >= 0);
  assert.equal(
    tags.slice(anotacoes).find((e) => e.tag === 'img').attrs.src,
    'icons/anotacoes.svg'
  );

  for (const arquivo of [
    'icons/hub.svg',
    'icons/hub-32.png',
    'icons/hub-180.png',
    'icons/hub-192.png',
    'icons/hub-512.png',
  ])
    assert.ok(existe(arquivo), arquivo);

  const png = (arquivo) => {
    const b = readFileSync(path.join(RAIZ, arquivo));

    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };

  for (const [arquivo, lado] of [
    ['icons/hub-32.png', 32],
    ['icons/hub-180.png', 180],
    ['icons/hub-192.png', 192],
    ['icons/hub-512.png', 512],
  ])
    assert.deepEqual(png(arquivo), [lado, lado], arquivo);
});

test('atalho externo do Google Agenda: abre em outra aba; no Android, o app (intent) com a web de reserva', () => {
  const agenda = elementoPorId(html, 'agenda', { obrigatorio: true });

  assert.deepEqual(
    [
      agenda.tag,
      classes(agenda),
      agenda.attrs.href,
      agenda.attrs.target,
      agenda.attrs.rel,
    ],
    [
      'a',
      ['app', 'atalho', 'externo'],
      'https://calendar.google.com/calendar/r',
      '_blank',
      'noopener',
    ]
  );
  assert.ok(existe('icons/agenda.svg'));

  const web = 'https://calendar.google.com/calendar/r';

  assert.equal(iniciarHub().el('agenda').href, web); // fora do Android fica o link web
  assert.equal(
    iniciarHub({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' }).el('agenda')
      .href,
    `intent://calendar.google.com/calendar/r#Intent;scheme=https;package=com.google.android.calendar;S.browser_fallback_url=${encodeURIComponent(web)};end`
  );
  assert.equal(
    tags.some(
      (e) =>
        e.tag === 'a' && /chat\.whatsapp\.com|play\.google\.com/.test(e.attrs.href || '')
    ),
    false
  ); // cards Hub (grupo) e Água saíram
});

test('hábito ou atalho não fica selecionado ao voltar de um app: hover só com mouse, toque com efeito que some e foco solto ao voltar', () => {
  const css = ler('hub.css');

  assert.ok(declaracoes(css, '.app:hover', '@media (hover: hover)').length > 0); // hover só com mouse de verdade
  assert.deepEqual(declaracoes(css, '.app:hover', ''), []); // e nunca no toque
  assert.ok(declaracoes(css, '.app.tocado', '').length > 0); // o toque ainda dá a crescidinha

  const hub = iniciarHub(),
    agua = hub.link('agua/'),
    clique = {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault() {
        this.prevenido = true;
      },
    };

  // toque: a crescidinha aparece já no toque e some sozinha
  agua.ouvintes.pointerdown[0]();
  assert.equal(hub.ligado(agua), true);
  hub.passarTempo();
  assert.equal(hub.ligado(agua), false);

  // clique num app do hub: a troca de página espera um instante para a crescidinha ser vista
  const c1 = { ...clique };

  agua.ouvintes.click[0](c1);
  assert.equal(c1.prevenido, true);
  assert.equal(hub.location.href, 'https://vcl02.github.io/hub/');
  hub.passarTempo();
  assert.equal(hub.location.href, 'agua/');

  // voltou de um app (pageshow ou a aba visível de novo): o tocado cresce de novo e some; ao sair, solta o foco
  for (const [alvo, tipo] of [
    [hub.janela, 'pageshow'],
    [hub.documento, 'visibilitychange'],
  ]) {
    hub.passarTempo();
    assert.equal(hub.ligado(agua), false);
    alvo[tipo].at(-1)();
    assert.equal(hub.ligado(agua), true, tipo);
  }

  hub.contexto.document.activeElement = agua;
  hub.janela.pagehide[0]();
  assert.equal(hub.ligado(agua), false);
  assert.equal(agua.foiBlur, true);

  // Ctrl, Cmd ou Shift abrem em outra aba: o link segue o caminho dele; o atalho externo também
  const agenda = hub.anchors.find((a) => a.attrs.id === 'agenda');

  for (const [a, ev] of [
    [hub.link('tr/'), { ...clique, ctrlKey: true }],
    [hub.link('tr/'), { ...clique, metaKey: true }],
    [hub.link('tr/'), { ...clique, shiftKey: true }],
    [agenda, { ...clique }],
  ]) {
    a.ouvintes.click[0](ev);
    assert.ok(!ev.prevenido);
  }
});

test('dados sobre mim num lugar só: corpo/perfil.js, carregado pelo tr, pelo al e pelo próprio Corpo', () => {
  const perfil = ler('corpo/perfil.js');

  assert.ok(!existe('perfil.js'), 'o perfil saiu da raiz');
  assert.match(perfil, /^'use strict';\n\/\/ /); // cabeçalho com a responsabilidade do arquivo

  const ctx = carregarArquivos(
    [path.join(RAIZ, 'corpo/perfil.js')],
    [
      'PERFIL',
      'ROTINA',
      'idadeEm',
      'tmb',
      'kcalTreino',
      'kcalEsteira',
      'pesoNoDia',
      'ordenarMedidas',
    ]
  );

  assert.deepEqual(JSON.parse(JSON.stringify(ctx.ROTINA)), {
    treino: [3, 4],
    treinoExtra: [1],
    presencial: [3, 4],
  }); // qua e qui · seg · qua e qui
  assert.equal(
    doApp('tr/js/config.js', ['DIAS_FIXOS'], { ROTINA: ctx.ROTINA }).DIAS_FIXOS,
    ctx.ROTINA.treino
  ); // o tr usa a rotina daqui
  assert.deepEqual(
    { ...ctx.PERFIL },
    { altura: 1.78, nascimento: '2002-09-14', sexo: 'M' }
  );
  assert.ok(Object.isFrozen(ctx.PERFIL));
  assert.equal(ctx.idadeEm('2026-09-13'), 23); // véspera do aniversário
  assert.equal(ctx.idadeEm('2026-09-14'), 24);
  assert.equal(ctx.tmb(100, '2026-09-14'), 1998); // 10×100 + 6,25×178 − 5×24 + 5
  assert.equal(ctx.kcalTreino(100, '2026-09-14', 36e5), 291); // 3,5 MET × 1998 ÷ 24 × 1 h
  // Esteira (ACSM): 6 km/h no plano = caminhada, MET (3,5 + 0,1 × 100) ÷ 3,5 = 3,86 · 10 km/h a 2% = corrida,
  // MET (3,5 + 0,2 × 166,7 + 0,9 × 166,7 × 0,02) ÷ 3,5 = 11,38 · × 1998 ÷ 24 × 1 h
  assert.deepEqual(
    [
      ctx.kcalEsteira(100, '2026-09-14', 36e5, 6, 0),
      ctx.kcalEsteira(100, '2026-09-14', 36e5, 10, 2),
    ],
    [321, 947]
  );

  const M = ctx.ordenarMedidas([
    { data: '2026-10-20', peso: '91' },
    { data: '2026-10-10', peso: 93, hora: 'x' },
    { data: '2026-10-22', cintura: 100 },
    { data: 'ruim', peso: 1 },
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(M)), [
    { data: '2026-10-10', hora: '', peso: 93 },
    { data: '2026-10-20', hora: '', peso: 91 },
    { data: '2026-10-22', hora: '', cintura: 100 },
  ]);
  assert.deepEqual(
    [
      ctx.pesoNoDia(M, '2026-10-01'),
      ctx.pesoNoDia(M, '2026-10-15'),
      ctx.pesoNoDia(M, '2026-10-30'),
      ctx.pesoNoDia([], '2026-10-30'),
    ],
    [93, 93, 91, null]
  );
  // Gasto do dia num lugar só: al/gasto.js, o mesmo no al e no hábito do déficit
  const scriptsAl = scriptsDe(ler('al/index.html'));
  const inicio = scriptsAl.indexOf('../corpo/perfil.js');

  assert.deepEqual(scriptsAl.slice(inicio, inicio + 3), [
    '../corpo/perfil.js',
    '../agua/bebidas.js',
    'gasto.js',
  ]);

  // O que está em corpo/perfil.js e em al/gasto.js não se declara de novo nos outros arquivos (a declaração não existe lá)
  const naoDeclara = (arquivo, nomes) => {
    for (const nome of nomes)
      assert.throws(
        () => doApp(arquivo, [nome]),
        /não encontrada/,
        `${arquivo} declara ${nome}`
      );
  };

  naoDeclara('al/js/config.js', ['FATOR_ATIVIDADE', 'DEFICIT_META']);
  naoDeclara('hub.js', ['FATOR_ATIVIDADE', 'DEFICIT_META', 'MET_MUSCULACAO']);
  naoDeclara('habitos.js', ['FATOR_ATIVIDADE', 'DEFICIT_META', 'MET_MUSCULACAO']);
  naoDeclara('tr/js/config.js', ['ALTURA', 'NASCIMENTO', 'SEXO', 'MET']); // perfil e conta do treino não se repetem no tr
  naoDeclara('al/js/config.js', ['ALTURA', 'NASCIMENTO', 'SEXO', 'MET_MUSCULACAO']); // nem no al

  for (const app of ['tr', 'al', 'agua']) {
    assert.ok(scriptsDe(ler(`${app}/index.html`)).includes('../corpo/perfil.js'), app);
    assert.ok(
      doApp(`${app}/sw.js`, ['ARQUIVOS_ESTATICOS']).ARQUIVOS_ESTATICOS.includes(
        '../corpo/perfil.js'
      ),
      app
    );
    assert.ok(!scriptsDe(ler(`${app}/index.html`)).includes('../perfil.js'), app);
  }

  assert.ok(scriptsDe(ler('corpo/index.html')).includes('perfil.js'));

  // Só o Corpo grava as pesagens: tr e al não escrevem em corpo_medida nem em tr_medida
  for (const f of ['tr/js/banco.js', 'al/js/banco.js']) {
    const { TABELAS } = doApp(f, ['TABELAS']);

    assert.deepEqual(
      Object.keys(TABELAS).filter((t) => ['tr_medida', 'corpo_medida'].includes(t)),
      [],
      f
    );
  }
});

test('histórico no banco: toda tabela dos apps (menos o Fin, que tem o dele) com gatilho para hub_historico, formato DataGrip', () => {
  const sql = ler('migrations/00-historico-apps.sql');

  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;$/m);
  assert.doesNotMatch(sql, /^do \$\$/m);

  for (const linha of sql.split('\n').filter((l) => l.trim().startsWith('--')))
    assert.ok(!linha.includes(';'), `; em comentário: ${linha}`);

  // As migrations da raiz juntas (00 e as que acrescentam tabela nova, como a 01 das marmitas), só reaproveitando a função da 00
  const todas = readdirSync(path.join(RAIZ, 'migrations'))
    .sort()
    .map((n) => ler(`migrations/${n}`));

  for (const m of todas.slice(1)) {
    assert.match(m, /^begin;$/m);
    assert.match(m, /^commit;$/m);
    assert.doesNotMatch(m, /\$\$/, 'tabela nova não cria função');
  }

  const comGatilho = todas.flatMap((m) =>
    [
      ...m.matchAll(
        /create trigger hub_historico after insert or update or delete on public\.(\w+) for each row execute function public\.registrar_historico_hub\(\);/g
      ),
    ].map((x) => x[1])
  );

  assert.deepEqual(comGatilho.sort(), [
    'agua_dia',
    'al_dia',
    'al_item',
    'al_marmita',
    'al_registro',
    'corpo_dia',
    'corpo_medida',
    'tr_exercicio',
    'tr_registro',
    'tr_treino',
    'tr_variacao',
  ]);
  assert.match(sql, /security definer\nset search_path = ''/);
  assert.match(sql, /revoke all on public\.hub_historico from anon, authenticated;/);
  assert.match(
    sql,
    /create policy hub_historico_so_victor on public\.hub_historico for select to authenticated\n {2}using \(\(select auth\.uid\(\)\) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid\);/
  );
});

test('núcleo comum (base/nucleo.js): com cabeçalho, carregado uma vez pela página inicial e pelos apps (o Fin ainda não) e guardado no service worker de cada um', () => {
  assert.match(ler('base/nucleo.js'), /^'use strict';\n\/\/ /); // cabeçalho com a responsabilidade do arquivo

  for (const [pagina, sw, src] of [
    ['index.html', 'sw.js', 'base/nucleo.js'],
    ['tr/index.html', 'tr/sw.js', '../base/nucleo.js'],
    ['al/index.html', 'al/sw.js', '../base/nucleo.js'],
    ['corpo/index.html', 'corpo/sw.js', '../base/nucleo.js'],
    ['agua/index.html', 'agua/sw.js', '../base/nucleo.js'],
  ]) {
    assert.equal(scriptsDe(ler(pagina)).filter((s) => s === src).length, 1, pagina);

    const guardados = doApp(sw, ['ARQUIVOS_ESTATICOS']).ARQUIVOS_ESTATICOS;

    assert.ok(
      guardados.includes(src.startsWith('../') ? src : './' + src),
      `${sw} não guarda o núcleo`
    );
  }

  // O Fin tem o próprio fetchComLimite (12 s) e migra numa fatia à parte
  assert.ok(!scriptsDe(ler('fin/index.html')).some((s) => s.includes('nucleo')));
});

test('base comum: tokens e componentes existem, a referência carrega os dois e mostra cada módulo com a própria cor', () => {
  const tokens = ler('base/tokens.css'),
    comp = ler('base/componentes.css'),
    ref = ler('base/referencia.html');

  const definidos = declaracoes(tokens, ':root', '').map((d) => d.split(':')[0]);

  for (const t of [
    '--bg',
    '--surface',
    '--fg',
    '--muted',
    '--ok',
    '--erro',
    '--protegido',
    '--cor',
    '--cor-soft',
    '--on-cor',
    '--r',
    '--t-md',
  ])
    assert.ok(definidos.includes(t), t);

  const seletores = regras(comp).flatMap((r) => r.seletores);

  for (const c of [
    '.topo',
    '.dia-nav',
    '.semana',
    '.cartao',
    '.lista',
    '.chip',
    '.selo',
    '.btn',
    '.campo',
    '.modal',
    '.toast',
  ])
    assert.ok(
      seletores.some(
        (s) =>
          s === c ||
          s.startsWith(c + ' ') ||
          s.startsWith(c + '.') ||
          s.startsWith(c + ':')
      ),
      c
    );
  assert.deepEqual(
    seletores.filter((s) => s.startsWith('@view-transition')),
    [],
    'transição só no passo 3, em todos os módulos de uma vez'
  );
  assert.deepEqual(
    etiquetas(ref)
      .filter((e) => e.tag === 'link' && e.attrs.rel === 'stylesheet')
      .map((e) => e.attrs.href)
      .filter((href) => !href.startsWith('https://')), // as fontes do Google ficam de fora
    ['tokens.css', 'componentes.css']
  );
  assert.deepEqual(
    [...ref.matchAll(/<h1>([^<]+)<\/h1>/g)].map((m) => m[1]),
    ['Alimentação', 'Água', 'Corpo', 'Treino', 'Fin']
  ); // o texto dos títulos da página de referência (um documento)
});

// Os `var(--x)` de um texto, lidos por varredura de caracteres (sem regex): nome até o primeiro caractere que não é de token.
const CARACTERES_DE_TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789-';

function usosDeVar(texto) {
  const nomes = [];
  let i = texto.indexOf('var(--');

  while (i >= 0) {
    let j = i + 4;

    while (j < texto.length && CARACTERES_DE_TOKEN.includes(texto[j].toLowerCase())) j++;
    nomes.push(texto.slice(i + 4, j));
    i = texto.indexOf('var(--', j);
  }

  return nomes;
}

// Propriedades personalizadas declaradas ("--x: valor") nas regras de um CSS
const definidasEm = (css) =>
  regras(css)
    .flatMap((r) => r.declaracoes)
    .filter((d) => d.startsWith('--'))
    .map((d) => d.slice(0, d.indexOf(':')).trim());

test('usosDeVar acha os var(--x) de um texto, com o fallback e sem confundir com outro nome', () => {
  assert.deepEqual(
    usosDeVar('color: var(--teal); background: var(--bg-1, #000) var(--on-teal)'),
    ['--teal', '--bg-1', '--on-teal']
  );
  assert.deepEqual(usosDeVar('margin: 0; --x: 1'), []);
});

test('módulos na base comum só usam as cores da base: todo var(--x) do CSS, dos estilos inline e dos scripts está em base/tokens.css ou é do próprio módulo (nada de --teal, --cyan… que deixaram de existir)', () => {
  const tokens = new Set(definidasEm(ler('base/tokens.css')));

  assert.ok(tokens.size > 10, 'base/tokens.css sem tokens lidos');

  const cssDe = (app) => [
    ...readdirSync(path.join(RAIZ, app, 'css')).map((n) => `${app}/css/${n}`),
  ];

  const modulos = {
    '': ['hub.css'],
    ...Object.fromEntries(['agua', 'corpo', 'al', 'tr', 'fin'].map((a) => [a, cssDe(a)])),
  };

  // O que cada módulo define (a base inteira mais os próprios arquivos) e o que usa, declaração por declaração
  const naoDefinidos = (css, aceitas) =>
    regras(css)
      .flatMap((r) => r.declaracoes)
      .flatMap((d) =>
        usosDeVar(d)
          .filter((v) => !aceitas.has(v))
          .map((v) => `${v} em "${d}"`)
      );

  const base = ['base/tokens.css', 'base/componentes.css'];

  for (const [app, arquivos] of Object.entries(modulos)) {
    const aceitas = new Set(tokens);

    for (const f of [...base, ...arquivos])
      for (const v of definidasEm(ler(f))) aceitas.add(v);

    for (const f of [...base, ...arquivos])
      assert.deepEqual(naoDefinidos(ler(f), aceitas), [], `${f} (${app || 'hub'})`);

    // Estilos inline do index.html: as etiquetas lidas como elementos, atributo style
    const pagina = ler(app ? `${app}/index.html` : 'index.html');

    for (const e of etiquetas(pagina))
      for (const v of usosDeVar(e.attrs.style || ''))
        assert.ok(
          aceitas.has(v),
          `${app || 'hub'}/index.html: ${v} em style de <${e.tag}>`
        );
  }

  // Scripts que montam HTML com style="… var(--x)": não há como rodar cada função de tela só para ler a saída (dependem de
  // dados e DOM), então a conferência é sobre o texto do código (objeto que de fato contém o CSS escrito à mão), com a mesma
  // varredura sem regex e o mesmo conjunto de tokens aceitos do módulo.
  for (const app of ['', 'agua', 'corpo', 'al', 'tr', 'fin']) {
    const aceitas = new Set(tokens);

    for (const f of [...base, ...modulos[app]])
      for (const v of definidasEm(ler(f))) aceitas.add(v);

    const scripts = app
      ? readdirSync(path.join(RAIZ, app, 'js')).map((n) => `${app}/js/${n}`)
      : ['hub.js'];

    for (const f of scripts)
      for (const v of usosDeVar(ler(f)))
        assert.ok(aceitas.has(v), `${f}: ${v} não está na base nem no módulo`);
  }
});

test('cada app abre com os próprios arquivos: todo src e href relativo do index.html aponta para um arquivo que existe no disco (subpastas, ../)', () => {
  for (const pasta of ['', 'fin/', 'tr/', 'al/', 'corpo/', 'agua/']) {
    const base = path.join(RAIZ, pasta);

    const refs = etiquetas(ler(pasta + 'index.html'))
      .flatMap((e) => [
        e.attrs.src,
        e.tag === 'a' ? null : e.attrs.href,
        e.tag === 'a' ? e.attrs.href : null,
      ])
      .filter((r) => r && !r.startsWith('#'));

    // links para fora (https:, data:, mailto:...) não são arquivos do app
    const locais = refs.filter((r) => !URL.canParse(r));

    assert.ok(locais.length > 0, `${pasta || 'raiz'}: nenhuma referência local lida`);

    for (const ref of locais) {
      const alvo = path.join(base, ref.split(/[?#]/)[0]);

      assert.ok(
        existsSync(alvo),
        `${pasta || 'raiz'}index.html referencia ${ref}, que não existe`
      );
    }
  }
});
