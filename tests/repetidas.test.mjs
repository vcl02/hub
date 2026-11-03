// Funções repetidas entre os apps (sem navegador): cada cópia é tirada do próprio arquivo do app (tests/funcoes.mjs) e passa
// pelos mesmos casos. Garante que as cópias se comportam igual até irem para a base comum (base/nucleo.js, passo 4 de
// docs/DIRETRIZES.md, seção 8): mescla das listas do dia entre aparelhos, diferença para enviar, o dia no endereço e o toque
// repetido. O que já foi para o núcleo (fetchComTeto) é testado lá (tests/nucleo.test.mjs); aqui só se prova que cada app usa
// a cópia única.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'espree';
import { carregar, carregarArquivos } from './funcoes.mjs';
import { etiquetas } from './leitores.mjs';

const json = (x) => JSON.parse(JSON.stringify(x));

// ---------- mesclar(nuvem, base, local): a lista da nuvem + o que entrou aqui desde a base − o que saiu daqui ----------
// Água e al mesclam objetos (copos, trechos de caminhada); o Corpo, horários ("10:00")
const MESCLAS = {
  agua: {
    f: carregar('agua/js/banco.js', ['mesclar']).mesclar,
    x: (h) => ({ hora: h, ml: 150 }),
  },
  al: {
    f: carregar('al/js/banco.js', ['mesclar']).mesclar,
    x: (h) => ({ hora: h, minutos: 10 }),
  },
  corpo: { f: carregar('corpo/js/banco.js', ['mesclar']).mesclar, x: (h) => h },
};

for (const [app, { f, x }] of Object.entries(MESCLAS)) {
  test(`${app}: mesclar não perde o que outro aparelho lançou e aplica só o que mudou aqui`, () => {
    const [a, b, c, d] = ['08:00', '09:00', '10:00', '11:00'].map(x);

    assert.deepEqual(json(f([a, b], [a], [a, c])), json([a, b, c])); // outro aparelho pôs b, este pôs c: os dois ficam
    assert.deepEqual(json(f([a, b], [a, b], [a])), json([a])); // este tirou b: sai da nuvem
    assert.deepEqual(json(f([a, b, d], [a], [a])), json([a, b, d])); // cópia velha (nada mudou aqui): a nuvem fica como está
    assert.deepEqual(json(f([], [], [a, a])), json([a, a])); // dois iguais (dois copos no mesmo minuto) são dois
    assert.deepEqual(json(f([a, a, b], [a, a], [a])), json([a, b])); // tirou um dos dois iguais: sai um só
    assert.deepEqual(json(f([b], [a], [])), json([b])); // tirou aqui o que outro aparelho já tinha tirado: nada quebra
  });
}

// ---------- diferenca(base, agora): o que enviar; null = nada ----------
test('água: diferenca por dia (sobe o que mudou, sai o que não existe mais; nada = null)', () => {
  const { diferenca } = carregar('agua/js/banco.js', ['diferenca']);

  const A = {
    '2026-10-01': { data: '2026-10-01', aguas: [1] },
    '2026-10-02': { data: '2026-10-02', aguas: [2] },
  };

  assert.equal(diferenca(A, json(A)), null);
  assert.deepEqual(
    json(diferenca(A, { '2026-10-01': { data: '2026-10-01', aguas: [1, 3] } })),
    { up: [{ data: '2026-10-01', aguas: [1, 3] }], del: ['2026-10-02'] }
  );
  assert.deepEqual(json(diferenca(null, { x: 1 })), { up: [1], del: [] }); // sem base (1º envio): sobe tudo
});

// Corpo, al e tr: a mesma diferença, por tabela (o Corpo devolve a chave do que sai; al e tr, a linha inteira)
const DIF = {
  corpo: {
    f: carregar('corpo/js/banco.js', ['diferenca'], {
      TABELAS: { t1: 'data', t2: 'data' },
    }).diferenca,
    sai: (k) => k,
  },
  al: {
    f: carregar('al/js/banco.js', ['diferenca'], { ORDEM: ['t1', 't2'] }).diferenca,
    sai: (k, l) => l,
  },
  tr: {
    f: carregar('tr/js/banco.js', ['diferenca'], { ORDEM: ['t1', 't2'] }).diferenca,
    sai: (k, l) => l,
  },
};

for (const [app, { f, sai }] of Object.entries(DIF)) {
  test(`${app}: diferenca por tabela (sobe o que mudou, sai o que não existe mais; nada = null)`, () => {
    const l1 = { id: 1, v: 'a' },
      l2 = { id: 2, v: 'b' },
      base = { t1: { 1: l1, 2: l2 }, t2: {} };

    assert.equal(f(base, json(base)), null);
    const r = json(f(base, { t1: { 1: { id: 1, v: 'A' } }, t2: { 9: { id: 9 } } }));

    assert.deepEqual(r.up, { t1: [{ id: 1, v: 'A' }], t2: [{ id: 9 }] });
    assert.deepEqual(r.del, { t1: [sai('2', l2)], t2: [] });
  });
}

// ---------- diaDaUrl(): ?dia=AAAA-MM-DD só se for um dia anterior a hoje; hoje, futuro ou texto inválido = null ----------
for (const app of ['agua', 'al', 'corpo', 'tr']) {
  test(`${app}: diaDaUrl aceita só um dia anterior a hoje`, () => {
    const dia = (busca) =>
      carregar(`${app}/js/util.js`, ['diaDaUrl'], {
        URLSearchParams,
        location: { search: busca },
        hoje: () => '2026-10-30',
      }).diaDaUrl();

    assert.equal(dia('?dia=2026-10-29'), '2026-10-29');
    assert.equal(dia('?dia=2026-10-30'), null); // hoje: sem ?dia
    assert.equal(dia('?dia=2026-11-02'), null); // futuro

    for (const ruim of [
      '?dia=29/10/2026',
      '?dia=2026-10-29x',
      '?dia=',
      '',
      '?ciclo=2026-10',
    ])
      assert.equal(dia(ruim), null, ruim);
  });
}

// ---------- repetido(acao): a mesma ação em menos de 0,5 s é ignorada (toque repetido sem querer) ----------
for (const app of ['agua', 'al', 'corpo']) {
  test(`${app}: repetido ignora a mesma ação em menos de 0,5 s`, () => {
    let agora = 1000;

    const { repetido } = carregar(
      `${app}/js/util.js`,
      ['REPETIDO_MS', 'ultimaAcao', 'repetido'],
      { Date: { now: () => agora } }
    );

    assert.equal(repetido('+150'), false);
    agora += 300;
    assert.equal(repetido('+150'), true); // 0,3 s depois: repetido
    agora += 10;
    assert.equal(repetido('+300'), false); // outra ação: vale
    agora += 600;
    assert.equal(repetido('+300'), false); // 0,6 s depois: vale de novo
  });
}

// ---------- confirmar(botão): toque duplo, armado pela chave do item (data-armavel), fora do botão ----------
// O 1º toque arma por 3 s, o 2º confirma. A lista redesenhada no meio (botões novos) continua armada no mesmo item; o
// MutationObserver de cada util.js chama pintarArmados a cada redesenho (aqui com um observador falso que guarda o callback;
// no navegador: al/tests/dia.test.mjs, agua/tests/agua.test.mjs, corpo/tests/corpo.test.mjs e tr/tests/treino.test.mjs). Botão sem chave (dataset vazio) nunca arma nem confirma.
const botao = (chave) => {
  const classes = new Set();

  return {
    dataset: chave === undefined ? {} : { armavel: chave },
    classList: {
      toggle: (c, sim) => (sim ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
  };
};

// O `new MutationObserver(...).observe(...)` de nível de arquivo do util.js, como está no código (não é declaração: o
// carregar o roda depois das funções, no mesmo contexto)
function observadorDe(arquivo) {
  const src = readFileSync(arquivo, 'utf8');

  const st = parse(src, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    range: true,
  }).body.filter(
    (n) =>
      n.type === 'ExpressionStatement' &&
      n.expression.callee?.object?.callee?.name === 'MutationObserver'
  );

  assert.equal(st.length, 1, `${arquivo}: um MutationObserver de nível de arquivo`);

  return src.slice(...st[0].range);
}

function toqueDuplo(app) {
  let agora = 1000,
    botoes = [],
    pinturas = 0, // quantas vezes o pintarArmados percorreu a tela (document.querySelectorAll)
    aoMudar = null; // o callback que o util.js deu ao MutationObserver

  const timers = [],
    errosConsole = [];

  const U = carregar(
    `${app}/js/util.js`,
    [
      'ARMADO_MS',
      'armados',
      'estaArmado',
      'armar',
      'desarmar',
      'pintarArmados',
      'confirmar',
    ],
    {
      Date: { now: () => agora },
      setTimeout: (f, ms) => timers.push({ f, em: agora + ms }),
      console: { error: (...a) => errosConsole.push(a) },
      document: {
        documentElement: {},
        querySelectorAll: () => {
          pinturas++;

          return botoes;
        },
      },
      MutationObserver: class {
        constructor(f) {
          aoMudar = f;
        }

        observe(alvo, o) {
          assert.deepEqual(json(o), { childList: true, subtree: true }); // a tela inteira, qualquer desenho
        }
      },
    },
    observadorDe(`${app}/js/util.js`)
  );

  return {
    ...U,
    errosConsole,
    pinturas: () => pinturas,
    // o DOM mudou: o callback do observador do util.js, como o navegador chama
    mudou: () => aoMudar([]),
    // a lista desenhada de novo: botões novos (sem a classe) e o observador do util.js, que vê a mudança
    desenhar: (chaves) => {
      botoes = chaves.map(botao);
      aoMudar([]);

      return botoes;
    },
    // o relógio anda e os timers vencidos rodam
    andar: (ms) => {
      agora += ms;

      for (const t of timers.splice(0)) {
        if (t.em <= agora) t.f();
        else timers.push(t);
      }
    },
  };
}

for (const app of ['agua', 'al', 'corpo', 'tr']) {
  test(`${app}: confirmar arma por 3 s e o 2º toque no mesmo item confirma`, () => {
    const u = toqueDuplo(app);
    let [a, b] = u.desenhar(['a', 'b']);

    assert.equal(u.ARMADO_MS, 3000);
    assert.equal(u.confirmar(a), false); // 1º toque: só arma
    assert.equal(a.classList.contains('armado'), true);
    assert.equal(b.classList.contains('armado'), false); // o vizinho não
    assert.equal(u.confirmar(b), false); // outro item arma o dele, sem confirmar o 1º
    u.andar(2999);
    assert.equal(u.confirmar(a), true); // 2º toque dentro dos 3 s: confirma
    assert.equal(a.classList.contains('armado'), false); // e desarma (um item igual que fique no lugar não sai junto)
    assert.equal(u.estaArmado('a'), false);
    u.andar(1);
    assert.equal(b.classList.contains('armado'), false); // os 3 s do b acabaram: o vermelho sai sozinho
    assert.equal(u.confirmar(b), false); // e o toque seguinte só arma de novo
    [a] = u.desenhar(['a', 'b']);
    assert.equal(u.confirmar(a), false);
    u.andar(3000);
    assert.equal(u.confirmar(a), false); // 3 s depois do 1º: vencido, arma de novo
  });

  test(`${app}: o armado sobrevive ao redesenho da lista (botão novo do mesmo item) e some com o item`, () => {
    const u = toqueDuplo(app);
    const [a] = u.desenhar(['a', 'b']);

    u.confirmar(a);
    u.andar(1000);
    const [n, a2, b] = u.desenhar(['x', 'a', 'b']); // a nuvem chegou: lista nova, outro item antes

    assert.equal(n.classList.contains('armado'), false); // quem ficou na posição do armado não herda
    assert.equal(b.classList.contains('armado'), false);
    assert.equal(a2.classList.contains('armado'), true); // o botão novo do mesmo item volta vermelho
    assert.equal(u.confirmar(a2), true); // e o 2º toque confirma (uma vez)
    assert.equal(u.confirmar(a2), false);

    const [c] = u.desenhar(['c']);

    u.confirmar(c);
    const [d] = u.desenhar(['d']); // a nuvem trouxe outra lista, sem o item armado: nada armado na tela

    assert.equal(d.classList.contains('armado'), false);
    assert.equal(u.confirmar(d), false); // o toque no item novo só arma o dele
    u.andar(3000);
    assert.equal(Object.keys(u.armados).length, 0); // vencidos saem da lista
  });

  test(`${app}: botão sem data-armavel nunca arma nem confirma (nem o 2º toque, nem tocando outro sem chave)`, () => {
    const u = toqueDuplo(app);
    const [a, b] = u.desenhar([undefined, undefined]);

    assert.equal(u.confirmar(a), false);
    assert.equal(a.classList.contains('armado'), false); // nem fica vermelho
    assert.equal(u.confirmar(b), false); // outro sem chave: não confirma o 1º (antes, os dois dividiam a chave "undefined")
    assert.equal(u.confirmar(a), false); // nem o 2º toque no mesmo
    assert.deepEqual(Object.keys(u.armados), []);
    assert.equal(u.errosConsole.length, 3); // cada toque avisa no console, sem quebrar
  });

  test(`${app}: o observador da tela repinta só quando há item armado`, () => {
    const u = toqueDuplo(app);
    const [a] = u.desenhar(['a', 'b']);
    const antes = u.pinturas();

    u.mudou(); // nada armado: o redesenho não percorre a tela
    assert.equal(u.pinturas(), antes);
    u.confirmar(a);
    const armado = u.pinturas();

    u.mudou(); // com armado: repinta
    assert.equal(u.pinturas(), armado + 1);
    u.andar(3000); // venceu: sai da lista e o observador volta a não repintar
    const vencido = u.pinturas();

    u.mudou();
    assert.equal(u.pinturas(), vencido);
  });
}

// Chave de item sem id (trecho, copo, horário): o conteúdo e a vez entre iguais, não a posição. A ordem muda (a nuvem traz um
// item antes): a chave armada continua no mesmo item.
const CHAVES = {
  al: {
    f: carregar('al/js/telas.js', ['chavesTrechos'], {
      chavesDosItens: carregar('al/js/util.js', ['chavesDosItens']).chavesDosItens,
    }).chavesTrechos,
    x: (h) => ({ hora: h, minutos: 20 }),
  },
  agua: {
    f: carregar('agua/js/telas.js', ['chavesAguas'], {
      chavesDosItens: carregar('agua/js/util.js', ['chavesDosItens']).chavesDosItens,
    }).chavesAguas,
    x: (h) => ({ hora: h, ml: 300 }),
  },
  corpo: {
    f: (dia, L) =>
      carregar('corpo/js/telas.js', ['chavesHoras'], {
        chavesDosItens: carregar('corpo/js/util.js', ['chavesDosItens']).chavesDosItens,
      }).chavesHoras('xixi', dia, L),
    x: (h) => h,
  },
};

for (const [app, { f, x }] of Object.entries(CHAVES)) {
  test(`${app}: a chave do item da lista não é a posição (outro item antes não muda o armado de lugar)`, () => {
    const dia = '2026-11-03',
      antes = [x('12:10'), x('15:30')],
      depois = [x('08:00'), x('12:10'), x('15:30')];

    const armada = f(dia, antes)[0]; // armou o 12:10

    assert.equal(f(dia, depois).indexOf(armada), 1); // depois da nuvem, ainda o 12:10 (não o 08:00, que ficou na posição 0)
    assert.notEqual(f('2026-11-02', antes)[0], armada); // outro dia, outra chave
    const iguais = f(dia, [x('09:00'), x('09:00')]);

    assert.notEqual(iguais[0], iguais[1]); // dois iguais no mesmo minuto: chaves diferentes (o 2º toque tira um só)
  });
}

// ---------- fetchComTeto: uma cópia só, em base/nucleo.js (a função é testada em tests/nucleo.test.mjs) ----------
// Pedido ao Supabase que perde o sinal no meio (metrô) vira falha de rede em 15 s (a função, 40 s). Antes cada app tinha a
// própria cópia, igual byte a byte; agora a página inicial e os quatro apps usam a do núcleo: nenhum declara a sua (lido pela
// árvore do código, com espree), cada um passa a do núcleo ao cliente do Supabase e a página carrega o núcleo antes do arquivo.
const DO_NUCLEO = ['TETO_REDE_MS', 'TETO_FUNCAO_MS', 'criarFetchComTeto', 'fetchComTeto'];

// Todo nome declarado no arquivo, em qualquer profundidade (variável, função, classe, função com nome)
function declarados(arquivo) {
  const nomes = new Set();

  const andar = (no) => {
    if (Array.isArray(no)) return no.forEach(andar);

    if (!no || typeof no.type !== 'string') return;

    if (no.type === 'VariableDeclarator' && no.id.type === 'Identifier')
      nomes.add(no.id.name);

    if (
      ['FunctionDeclaration', 'FunctionExpression', 'ClassDeclaration'].includes(
        no.type
      ) &&
      no.id
    )
      nomes.add(no.id.name);

    for (const [k, v] of Object.entries(no))
      if (k !== 'parent' && v && typeof v === 'object') andar(v);
  };

  andar(
    parse(readFileSync(arquivo, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' })
  );

  return nomes;
}

const scriptsDe = (pagina) =>
  etiquetas(readFileSync(pagina, 'utf8'))
    .filter((e) => e.tag === 'script' && e.attrs.src)
    .map((e) => e.attrs.src);

test('núcleo: base/nucleo.js declara o fetchComTeto e os limites (o leitor da árvore acha o que existe)', () => {
  const nomes = declarados('base/nucleo.js');

  for (const nome of DO_NUCLEO) assert.ok(nomes.has(nome), nome);
});

for (const [arquivo, pagina, supabaseJs, nucleo, src] of [
  ['hub.js', 'index.html', 'supabase.js', 'base/nucleo.js', 'hub.js'],
  [
    'agua/js/banco.js',
    'agua/index.html',
    '../supabase.js',
    '../base/nucleo.js',
    'js/banco.js',
  ],
  [
    'al/js/banco.js',
    'al/index.html',
    '../supabase.js',
    '../base/nucleo.js',
    'js/banco.js',
  ],
  [
    'corpo/js/banco.js',
    'corpo/index.html',
    '../supabase.js',
    '../base/nucleo.js',
    'js/banco.js',
  ],
  ['tr/js/banco.js', 'tr/index.html', 'supabase.js', '../base/nucleo.js', 'js/banco.js'],
]) {
  test(`${arquivo}: usa o fetchComTeto do núcleo, sem cópia própria, e a página carrega o núcleo antes`, () => {
    const nomes = declarados(arquivo);

    for (const nome of DO_NUCLEO)
      assert.ok(!nomes.has(nome), `${arquivo} declara ${nome}`);

    // o cliente do Supabase do arquivo recebe exatamente a função do núcleo
    const { fetchComTeto } = carregarArquivos(['base/nucleo.js'], ['fetchComTeto']);

    const { sb } = carregar(arquivo, ['sb'], {
      supabase: { createClient: (url, chave, opcoes) => opcoes },
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_KEY: 'sb_publishable_x',
      fetchComTeto,
    });

    assert.equal(sb.global.fetch, fetchComTeto);

    // ordem de carga: supabase-js, o núcleo e só depois o arquivo
    const scripts = scriptsDe(pagina);

    assert.equal(
      scripts.filter((s) => s === nucleo).length,
      1,
      `${pagina}: ${nucleo} uma vez`
    );
    assert.ok(scripts.indexOf(supabaseJs) < scripts.indexOf(nucleo), pagina);
    assert.ok(scripts.indexOf(nucleo) < scripts.indexOf(src), pagina);
  });
}
