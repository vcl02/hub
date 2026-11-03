// Funções repetidas entre os apps (sem navegador): cada cópia é tirada do próprio arquivo do app (tests/funcoes.mjs) e passa
// pelos mesmos casos. Garante que as cópias se comportam igual até irem para a base comum (base/nucleo.js, passo 4 de
// docs/DIRETRIZES.md, seção 8): mescla das listas do dia entre aparelhos, diferença para enviar e o dia no endereço. O que já
// foi para o núcleo (fetchComTeto, repetido, confirmar e o armado) é testado lá (tests/nucleo.test.mjs); aqui só se prova que
// cada app usa a cópia única.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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

// O núcleo inteiro, como a página o carrega, com uma página vazia (o observador do toque duplo roda ao carregar)
const doNucleo = (nomes) =>
  carregarArquivos(['base/nucleo.js'], nomes, {
    document: { documentElement: {}, querySelectorAll: () => [] },
    MutationObserver: class {
      observe() {}
    },
  });

// Chave de item sem id (trecho, copo, horário): o conteúdo e a vez entre iguais, não a posição. A ordem muda (a nuvem traz um
// item antes): a chave armada continua no mesmo item.
const CHAVES = {
  al: {
    f: carregar('al/js/telas.js', ['chavesTrechos'], {
      chavesDosItens: doNucleo(['chavesDosItens']).chavesDosItens,
    }).chavesTrechos,
    x: (h) => ({ hora: h, minutos: 20 }),
  },
  agua: {
    f: carregar('agua/js/telas.js', ['chavesAguas'], {
      chavesDosItens: doNucleo(['chavesDosItens']).chavesDosItens,
    }).chavesAguas,
    x: (h) => ({ hora: h, ml: 300 }),
  },
  corpo: {
    f: (dia, L) =>
      carregar('corpo/js/telas.js', ['chavesHoras'], {
        chavesDosItens: doNucleo(['chavesDosItens']).chavesDosItens,
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

// Nomes declarados num código-fonte, em dois sentidos que não se misturam:
//  - topo: o que o arquivo declara no NÍVEL DE SCRIPT (function, class, const/let no topo, var mesmo dentro de bloco do topo,
//    inclusive por desestruturação). Num script clássico isso é global: repetir um nome do núcleo dá SyntaxError (let/const/
//    class) ou sobrescreve o do núcleo (function/var). SEMPRE reprova.
//  - locais: o que se declara DENTRO de uma função (parâmetro, variável, desestruturação, função aninhada). Só esconde o nome
//    naquela função e não afeta os outros scripts. DECISÃO: sombra local é ACEITA (parâmetro ou variável chamada `repetido`
//    num handler não colide com nada; reprovar seria falso positivo). O que importa de verdade, que cada chamada vá ao núcleo,
//    o USOS (abaixo) já trava pela contagem de chamadas por arquivo.
const nomesDe = (p) => {
  if (!p) return [];

  if (p.type === 'Identifier') return [p.name];

  if (p.type === 'ObjectPattern')
    return p.properties.flatMap((x) => nomesDe(x.type === 'Property' ? x.value : x));

  if (p.type === 'ArrayPattern') return p.elements.flatMap(nomesDe);

  if (p.type === 'AssignmentPattern') return nomesDe(p.left);

  if (p.type === 'RestElement') return nomesDe(p.argument);

  return [];
};

const EH_FUNCAO = [
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
];

function declaracoes(fonte, { locais: querLocais = true } = {}) {
  const topo = new Set(),
    locais = new Set(),
    programa = parse(fonte, { ecmaVersion: 'latest', sourceType: 'script' });

  // nível de script: não entra em função nem classe
  const noTopo = (no, direto) => {
    if (Array.isArray(no)) return no.forEach((n) => noTopo(n, direto));

    if (!no || typeof no.type !== 'string') return;

    if (no.type === 'FunctionDeclaration') return no.id && topo.add(no.id.name);

    if (no.type === 'ClassDeclaration') return direto && topo.add(no.id.name);

    if (EH_FUNCAO.includes(no.type) || no.type === 'ClassExpression') return;

    if (no.type === 'VariableDeclaration' && (direto || no.kind === 'var'))
      for (const d of no.declarations) nomesDe(d.id).forEach((n) => topo.add(n));

    for (const [k, v] of Object.entries(no))
      if (k !== 'parent' && v && typeof v === 'object') noTopo(v, false);
  };

  // dentro de funções: parâmetros, variáveis e funções aninhadas
  const dentro = (no, emFuncao) => {
    if (Array.isArray(no)) return no.forEach((n) => dentro(n, emFuncao));

    if (!no || typeof no.type !== 'string') return;

    if (EH_FUNCAO.includes(no.type)) {
      if (emFuncao && no.id) locais.add(no.id.name);

      no.params.flatMap(nomesDe).forEach((n) => locais.add(n));
      emFuncao = true;
    }

    if (emFuncao && no.type === 'VariableDeclarator')
      nomesDe(no.id).forEach((n) => locais.add(n));

    if (emFuncao && no.type === 'CatchClause')
      nomesDe(no.param).forEach((n) => locais.add(n));

    for (const [k, v] of Object.entries(no))
      if (k !== 'parent' && v && typeof v === 'object') dentro(v, emFuncao);
  };

  for (const instrucao of programa.body) noTopo(instrucao, true);

  if (querLocais) dentro(programa, false);

  return { topo, locais };
}

// o que o arquivo declara no nível de script (a colisão que importa)
const declarados = (arquivo) =>
  declaracoes(readFileSync(arquivo, 'utf8'), { locais: false }).topo;

test('declaracoes: separa colisão de nível de script de sombra local (fixtures sintéticos)', () => {
  const ordem = (s) => [...s].sort();

  // nível de script: sempre colisão, de qualquer jeito de declarar
  const t = declaracoes(`
    function repetido() {}
    class ARMADO_MS {}
    const { confirmar } = x;
    let [armar, ...resto] = y;
    var { a: { desarmar }, b = 1 } = z;
    if (x) { var armados = 1; let dentroDoBloco = 2; }
    for (var i = 0; i < 1; i++) {}
    const f = () => { const local = 1; };
  `);

  assert.deepEqual(
    ordem(t.topo),
    [
      'ARMADO_MS',
      'armados',
      'armar',
      'confirmar',
      'desarmar',
      'b',
      'f',
      'i',
      'repetido',
      'resto',
    ].sort()
  );
  assert.equal(t.topo.has('dentroDoBloco'), false); // let de bloco não é global
  assert.equal(t.topo.has('local'), false);

  // sombra local: parâmetro, variável, desestruturação e função aninhada, nada no topo
  const l = declaracoes(`
    function f(repetido, { confirmar }, [armar], desarmar = 1, ...armados) {
      const estaArmado = 1;
      const { pintarArmados } = x;
      function g(chavesDosItens) {}
      try {} catch (ultimaAcao) {}
    }
    const h = (REPETIDO_MS) => {};
  `);

  assert.deepEqual(ordem(l.topo), ['f', 'h']);
  assert.deepEqual(
    ordem(l.locais),
    [
      'repetido',
      'confirmar',
      'armar',
      'desarmar',
      'armados',
      'estaArmado',
      'pintarArmados',
      'g',
      'chavesDosItens',
      'ultimaAcao',
      'REPETIDO_MS',
    ].sort()
  );
});

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
    const { fetchComTeto } = doNucleo(['fetchComTeto']);

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

// ---------- toque repetido e toque duplo: uma cópia só, em base/nucleo.js (testados em tests/nucleo.test.mjs) ----------
// repetido (a mesma ação de novo em menos de 0,5 s é ignorada) e o toque duplo para confirmar (confirmar, o armado pela chave
// do item, o MutationObserver que repinta o armado e chavesDosItens) eram iguais byte a byte em js/util.js da Água, do al, do
// Corpo e do Treino (o Treino sem repetido e sem chavesDosItens, que não usa). Agora nenhum app declara o seu (lido pela árvore
// do código, com espree, em todo script da página), quem chama usa o do núcleo e a página carrega o núcleo antes de quem chama.
const DO_TOQUE = [
  'ARMADO_MS',
  'armados',
  'estaArmado',
  'armar',
  'desarmar',
  'pintarArmados',
  'confirmar',
  'chavesDosItens',
  'REPETIDO_MS',
  'ultimaAcao',
  'repetido',
];

// Chamadas a uma função pelo nome (f(...)), em qualquer profundidade
function chamadas(arquivo, nome) {
  let n = 0;

  const andar = (no) => {
    if (Array.isArray(no)) return no.forEach(andar);

    if (!no || typeof no.type !== 'string') return;

    if (
      no.type === 'CallExpression' &&
      no.callee.type === 'Identifier' &&
      no.callee.name === nome
    )
      n++;

    for (const [k, v] of Object.entries(no))
      if (k !== 'parent' && v && typeof v === 'object') andar(v);
  };

  andar(
    parse(readFileSync(arquivo, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' })
  );

  return n;
}

test('núcleo: base/nucleo.js declara o toque repetido e o toque duplo (o leitor da árvore acha o que existe)', () => {
  const nomes = declarados('base/nucleo.js');

  for (const nome of DO_TOQUE) assert.ok(nomes.has(nome), nome);

  // e o observador de nível de arquivo que repinta o armado está no núcleo, uma vez
  const observadores = parse(readFileSync('base/nucleo.js', 'utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  }).body.filter(
    (n) =>
      n.type === 'ExpressionStatement' &&
      n.expression.callee?.object?.callee?.name === 'MutationObserver'
  );

  assert.equal(observadores.length, 1);
});

// Quantas vezes cada app chama cada função, por arquivo (cada botão que acrescenta à lista chama o repetido; cada × ou
// lixeira, o confirmar): um handler que deixa de chamar, ou um arquivo novo que passa a chamar, derruba o teste até a lista
// ser atualizada aqui. Quem chama vem depois do núcleo na página e não declara (nem recebe como parâmetro) o próprio.
const USOS = {
  agua: {
    'js/telas.js': { repetido: 1, confirmar: 1, chavesDosItens: 1 },
  },
  al: {
    'js/telas.js': { repetido: 1, confirmar: 3, chavesDosItens: 1 },
  },
  corpo: {
    'js/telas.js': { repetido: 2, confirmar: 3, chavesDosItens: 1 },
  },
  tr: {
    'js/ajustes.js': { confirmar: 1 },
    'js/cardio.js': { confirmar: 2 },
    'js/interacoes.js': { confirmar: 2 },
  },
};

for (const [app, usos] of Object.entries(USOS)) {
  test(`${app}: toque repetido e toque duplo vêm do núcleo (nenhum script da página declara o seu, e quem chama vem depois do núcleo)`, () => {
    const scripts = scriptsDe(`${app}/index.html`),
      nucleo = scripts.indexOf('../base/nucleo.js');

    assert.ok(nucleo >= 0, `${app}/index.html carrega o núcleo`);

    for (const src of scripts) {
      if (src === '../base/nucleo.js' || src.endsWith('supabase.js')) continue;

      const arquivo = path.posix.normalize(`${app}/${src}`),
        nomes = declarados(arquivo);

      for (const nome of DO_TOQUE)
        assert.ok(!nomes.has(nome), `${arquivo} declara ${nome}`);

      // os arquivos do próprio app: cada chamada conferida (e quem chama vem depois do núcleo)
      if (src.startsWith('..')) continue;

      for (const nome of ['repetido', 'confirmar', 'chavesDosItens']) {
        const n = chamadas(arquivo, nome);

        assert.equal(
          n,
          usos[src]?.[nome] ?? 0,
          `${arquivo} chama ${nome} ${n} vez(es): atualize USOS`
        );

        if (n)
          assert.ok(
            scripts.indexOf(src) > nucleo,
            `${app}/index.html: núcleo antes de ${src}`
          );
      }
    }

    for (const src of Object.keys(usos))
      assert.ok(scripts.includes(src), `${app}/index.html carrega ${src}`);
  });
}

// Os scripts compartilhados e a página inicial também carregam depois (ou junto) do núcleo e do supabase.js: nenhum declara,
// no nível de script, um nome do núcleo (fatia 1 e fatia 2). O supabase.js é um UMD de uma linha só: o topo dele é uma
// expressão única (a função que embrulha tudo), então a busca no nível de script não entra nela e é instantânea.
for (const arquivo of [
  'hub.js',
  'habitos.js',
  'corpo/perfil.js',
  'agua/bebidas.js',
  'al/gasto.js',
  'supabase.js',
]) {
  test(`${arquivo}: não declara nenhum nome do núcleo no nível de script`, () => {
    const nomes = declarados(arquivo);

    for (const nome of [...DO_NUCLEO, ...DO_TOQUE])
      assert.ok(!nomes.has(nome), `${arquivo} declara ${nome}`);
  });
}
