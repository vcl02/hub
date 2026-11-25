// Regras das Notas sem navegador: cada função sai do arquivo publicado (tests/funcoes.mjs) e roda com dados fixos. A tela fica
// em notas.test.mjs (poucos casos); aqui estão:
//   · a conversa (js/markdown.js): parágrafos com blocos de código, acrescentar, trocar, apagar e copiar sem mexer no resto
//   · o Markdown em HTML: texto sempre escapado, links só http(s)/mailto/tel em outra aba, títulos, listas, tarefas, código
//   · o jeito de abrir (editor ou conversa), a nota no endereço e o título
//   · o banco (js/banco.js): limpeza do db, ida e volta com as linhas da tabela, base sem pendente falso, salvar texto igual não
//     grava, e o envio com uma nuvem falsa (só a nota que mudou, inteira; apagada sai; sem internet fica pendente)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregar, carregarArquivos } from '../../tests/funcoes.mjs';

const NOTAS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = (arquivo) => path.join(NOTAS, arquivo);
const json = (x) => JSON.parse(JSON.stringify(x));

const M = carregarArquivos(
  [A('js/markdown.js')],
  [
    'blocos',
    'acrescentarBloco',
    'trocarBloco',
    'apagarBlocos',
    'copiarBlocos',
    'limparParagrafo',
    'markdownHtml',
    'alternarFavorito',
    'terminaEmCodigo',
    'ehFavorito',
    'semMarca',
    'mudancasFavorito',
    'favoritarBlocos',
    'ligarFavorito',
    'blocosTocados',
    'favoritas',
    'indicesDasFavoritas',
    'indicesValidos',
    'moverBlocos',
    'indicesNoTexto',
  ]
);

// ---------- a conversa: parágrafos ----------
test('alternarFavorito: põe e tira o " ★" do fim do parágrafo i, o resto do texto byte a byte igual; bloco de código e índice que não existe não mudam', () => {
  const t = 'a\nb  \n\n\n```\nx\n```\n\nc ★\n';

  assert.equal(M.alternarFavorito(t, 0), 'a\nb ★\n\n\n```\nx\n```\n\nc ★\n');
  assert.equal(M.alternarFavorito(t, 2), 'a\nb  \n\n\n```\nx\n```\n\nc\n');
  assert.equal(M.alternarFavorito(M.alternarFavorito(t, 2), 2), t);
  assert.equal(M.alternarFavorito(t, 1), t);
  assert.equal(M.alternarFavorito(t, 9), t);
});

test('blocos: linha em branco separa parágrafos; linhas seguidas ficam juntas; o bloco de código (``` ou ~~~) fica inteiro, mesmo com linha em branco dentro', () => {
  const t = 'a\nb\n\n\nc\n\n```js\nx\n\ny\n```\n\n~~~\n1\n\n2\n~~~\nd';

  assert.deepEqual(
    json(M.blocos(t)).map((b) => b.texto),
    ['a\nb', 'c', '```js\nx\n\ny\n```', '~~~\n1\n\n2\n~~~\nd']
  );

  // as posições apontam para o próprio texto (é o que trocar e apagar usam)
  for (const b of M.blocos(t)) assert.equal(t.slice(b.ini, b.fim), b.texto);

  // ``` não fecha ~~~, nem uma cerca mais curta fecha a mais longa
  assert.equal(M.blocos('~~~\na\n```\n\nb\n~~~').length, 1);
  assert.equal(M.blocos('````\na\n```\n\nb\n````').length, 1);
  // cerca que não fecha vai até o fim; texto vazio ou só espaços não tem parágrafo
  assert.equal(M.blocos('```\nsem fim\n\nainda').length, 1);
  assert.deepEqual(json(M.blocos('')), []);
  assert.deepEqual(json(M.blocos(' \n\n\t\n')), []);
  assert.deepEqual(json(M.blocos(null)), []);
});

test('acrescentar: o parágrafo novo vai no fim depois de uma linha em branco, sem as linhas em branco do começo e os espaços do fim; vazio não muda nada', () => {
  assert.equal(M.acrescentarBloco('a', 'b'), 'a\n\nb');
  assert.equal(M.acrescentarBloco('a\n\n\n  ', '\n\n  b\r\nc  \n\n'), 'a\n\n  b\nc');
  assert.equal(M.acrescentarBloco('', 'primeiro'), 'primeiro');
  assert.equal(M.acrescentarBloco('a\n', ' \n \n'), 'a\n');
  assert.equal(M.limparParagrafo('\r\n\r\nx\r\ny \n'), 'x\ny');
});

test('trocar: só o trecho do parágrafo muda (o resto continua byte a byte); vazio apaga; índice que não existe não muda nada', () => {
  const t = '# Título\n\na  \nb\n\n\n\nc\n';

  assert.equal(
    M.trocarBloco(t, 1, 'novo\nnovo2 \n'),
    '# Título\n\nnovo\nnovo2\n\n\n\nc\n'
  );
  assert.equal(M.trocarBloco(t, 2, 'C'), '# Título\n\na  \nb\n\n\n\nC\n');
  assert.equal(M.trocarBloco(t, 1, '  \n'), '# Título\n\nc\n');
  assert.equal(M.trocarBloco(t, 9, 'x'), t);
});

test('apagar: cada parágrafo sai com a linha em branco que o separava; vários de uma vez (em qualquer ordem, repetidos); tudo apagado é texto vazio', () => {
  const t = 'a\n\nb\n\nc';

  assert.equal(M.apagarBlocos(t, [1]), 'a\n\nc');
  assert.equal(M.apagarBlocos(t, [0]), 'b\n\nc');
  assert.equal(M.apagarBlocos(t, [2]), 'a\n\nb');
  assert.equal(M.apagarBlocos(t, [2, 0, 0]), 'b');
  assert.equal(M.apagarBlocos(t, [0, 1, 2]), '');
  assert.equal(M.apagarBlocos(t, [7]), t);
  assert.equal(M.apagarBlocos('a\n\n```\nx\n\ny\n```\n\nb', [1]), 'a\n\nb');
});

test('copiar: os parágrafos escolhidos na ordem do texto, separados por uma linha em branco (repetido e inexistente não entram)', () => {
  const t = 'a\nA\n\nb\n\nc';

  assert.equal(M.copiarBlocos(t, [2, 0, 0, 5]), 'a\nA\n\nc');
  assert.equal(M.copiarBlocos(t, [1]), 'b');
  assert.equal(M.copiarBlocos(t, []), '');
});

// ---------- Markdown → HTML ----------
test('markdownHtml: todo HTML do texto é escapado (também no código e nos títulos)', () => {
  assert.equal(
    M.markdownHtml('<script>alert(1)</script> & "x" \'y\''),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot; &#39;y&#39;</p>'
  );
  assert.equal(M.markdownHtml('# <b>t</b>'), '<h1>&lt;b&gt;t&lt;/b&gt;</h1>');
  assert.equal(M.markdownHtml('`<img>`'), '<p><code>&lt;img&gt;</code></p>');
  assert.equal(
    M.markdownHtml('```\n<img src=x onerror=a()>\n```'),
    '<pre><code>&lt;img src=x onerror=a()&gt;</code></pre>'
  );
});

test('markdownHtml: link só com http(s), mailto ou tel, sempre em outra aba com rel="noopener noreferrer"; javascript: e outros ficam como texto', () => {
  const link = (url, txt) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>`;

  assert.equal(
    M.markdownHtml('[site](https://a.com/x)'),
    `<p>${link('https://a.com/x', 'site')}</p>`
  );
  assert.equal(
    M.markdownHtml('[m](mailto:a@b.com)'),
    `<p>${link('mailto:a@b.com', 'm')}</p>`
  );
  assert.equal(M.markdownHtml('[t](tel:+5511)'), `<p>${link('tel:+5511', 't')}</p>`);
  assert.equal(
    M.markdownHtml('[x](javascript:alert(1))'),
    '<p>[x](javascript:alert(1))</p>'
  );
  assert.equal(
    M.markdownHtml('[x](JavaScript:alert(1))'),
    '<p>[x](JavaScript:alert(1))</p>'
  );
  assert.equal(M.markdownHtml('[f](ftp://a.com)'), '<p>[f](ftp://a.com)</p>');
  // aspas no endereço não saem do atributo
  assert.equal(
    M.markdownHtml('[ok](https://a.com/?q="x")'),
    `<p>${link('https://a.com/?q=&quot;x&quot;', 'ok')}</p>`
  );
  // endereço solto vira link (sem a pontuação do fim); www. ganha https://
  assert.equal(
    M.markdownHtml('veja https://a.com/b. fim'),
    `<p>veja ${link('https://a.com/b', 'https://a.com/b')}. fim</p>`
  );
  assert.equal(
    M.markdownHtml('www.x.com'),
    `<p>${link('https://www.x.com', 'www.x.com')}</p>`
  );
  // a ênfase não mexe dentro do endereço
  assert.equal(
    M.markdownHtml('https://a.com/um_dois_tres'),
    `<p>${link('https://a.com/um_dois_tres', 'https://a.com/um_dois_tres')}</p>`
  );
});

test('markdownHtml: títulos, ênfases, código, citação, linha e quebra de linha dentro do parágrafo', () => {
  assert.equal(M.markdownHtml('# Um'), '<h1>Um</h1>');
  assert.equal(M.markdownHtml('### Três ###'), '<h3>Três</h3>');
  assert.equal(M.markdownHtml('#sem espaço'), '<p>#sem espaço</p>');
  assert.equal(
    M.markdownHtml('**n** __n__ *i* _i_ ~~r~~ `**c**`'),
    '<p><strong>n</strong> <strong>n</strong> <em>i</em> <em>i</em> <del>r</del> <code>**c**</code></p>'
  );
  assert.equal(M.markdownHtml('nome_de_arquivo'), '<p>nome_de_arquivo</p>');
  assert.equal(M.markdownHtml('> a\n> b'), '<blockquote><p>a<br>b</p></blockquote>');
  assert.equal(M.markdownHtml('---'), '<hr>');
  assert.equal(M.markdownHtml('l1\nl2'), '<p>l1<br>l2</p>');
  assert.equal(M.markdownHtml(''), '');
});

test('markdownHtml: listas com marcador e numeradas (começando do número escrito), item continuado e tarefas', () => {
  assert.equal(
    M.markdownHtml('- a\n* b\n+ c'),
    '<ul><li>a</li><li>b</li><li>c</li></ul>'
  );
  assert.equal(M.markdownHtml('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(M.markdownHtml('3) a\n4) b'), '<ol start="3"><li>a</li><li>b</li></ol>');
  assert.equal(M.markdownHtml('- a\n  cont'), '<ul><li>a<br>cont</li></ul>');
  assert.equal(M.markdownHtml('- a\n1. b'), '<ul><li>a</li></ul><ol><li>b</li></ol>');
  assert.equal(
    M.markdownHtml('- [ ] fazer\n- [x] **feito**'),
    '<ul><li><span class="tarefa" aria-hidden="true">☐</span> fazer</li>' +
      '<li><span class="tarefa feita" aria-hidden="true">☑</span> <strong>feito</strong></li></ul>'
  );
});

// ---------- util.js: editor ou conversa, nota no endereço ----------
const util = (search = '') =>
  carregar(A('js/util.js'), ['notaDaUrl'], {
    location: { search },
    URLSearchParams,
  });

test('modo pelo aparelho: editor só com mouse (ponteiro fino) e tela de 900 px ou mais; o resto abre a conversa', () => {
  const { modoDoAparelho } = carregar(A('js/util.js'), [
    'LARGURA_EDITOR',
    'modoDoAparelho',
  ]);

  assert.equal(modoDoAparelho(true, 900), 'editor');
  assert.equal(modoDoAparelho(true, 1920), 'editor');
  assert.equal(modoDoAparelho(true, 899), 'conversa');
  assert.equal(modoDoAparelho(false, 1920), 'conversa');
  assert.equal(modoDoAparelho(false, 390), 'conversa');
});

test('notaDaUrl: ?nota=<id> com o formato da tabela; vazio, texto estranho ou longo demais vale como lista (null)', () => {
  assert.equal(util('?nota=ab_12-Z').notaDaUrl(), 'ab_12-Z');
  assert.equal(util('?x=1&nota=k3').notaDaUrl(), 'k3');
  assert.equal(util('').notaDaUrl(), null);
  assert.equal(util('?nota=').notaDaUrl(), null);
  assert.equal(util('?nota=a/b').notaDaUrl(), null);
  assert.equal(util('?nota=%3Cscript%3E').notaDaUrl(), null);
  assert.equal(util('?nota=' + 'a'.repeat(65)).notaDaUrl(), null);
  assert.equal(util('?nota=' + 'a'.repeat(64)).notaDaUrl(), 'a'.repeat(64));
});

// ---------- banco: formato e envio, com uma nuvem falsa ----------
// nuvem: { linhas: [linha da tabela com user_id], offline, recusar: erro do servidor na gravação, semResposta: a gravação
// chega mas a resposta se perde, pedidos: [[tipo, tabela, corpo, filtros]] }. A consulta aceita os filtros que o banco usa
// (eq, in, gte, lt; datas comparadas pelo instante, como o timestamptz) e o .select('id') depois da gravação.
function nuvemFalsa(nuvem) {
  const clonar = (x) => JSON.parse(JSON.stringify(x)),
    falha = { message: 'Failed to fetch' },
    valor = (v) =>
      typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : v;

  nuvem.pedidos ??= [];

  return {
    from: (tabela) => {
      const consulta = (tipo, corpo) => {
        const filtros = [];
        let colunas = null,
          faixa = null;

        const passa = (l) =>
          filtros.every(([op, c, v]) =>
            op === 'eq'
              ? l[c] === v
              : op === 'in'
                ? v.includes(l[c])
                : op === 'gte'
                  ? valor(l[c]) >= valor(v)
                  : valor(l[c]) < valor(v)
          );

        const rodar = () => {
          nuvem.pedidos.push([tipo, tabela, clonar(corpo ?? colunas), clonar(filtros)]);

          if (nuvem.offline) return { data: null, error: falha };

          if (tipo === 'select') {
            const R = nuvem.linhas
              .filter(passa)
              .map((l) => Object.fromEntries(colunas.split(',').map((c) => [c, l[c]])));

            const resposta = {
                data: clonar(faixa ? R.slice(faixa[0], faixa[1] + 1) : R),
                error: null,
              },
              aoBaixar = faixa && nuvem.aoBaixar;

            // aoBaixar: algo acontece aqui (um envio inteiro) enquanto a resposta da lista inteira (já lida) volta
            if (!aoBaixar) return resposta;
            nuvem.aoBaixar = null;

            return Promise.resolve(aoBaixar()).then(() => resposta);
          }

          if (nuvem.recusar) return { data: null, error: { message: nuvem.recusar } };

          // outro aparelho grava entre a leitura e a gravação deste (uma vez)
          const antes = nuvem.antesDeGravar;

          nuvem.antesDeGravar = null;
          antes?.();
          let feitas;

          if (tipo === 'insert') {
            if (
              nuvem.linhas.some((x) => x.user_id === corpo.user_id && x.id === corpo.id)
            )
              return { data: null, error: { code: '23505', message: 'duplicate key' } };
            nuvem.linhas.push(clonar(corpo));
            feitas = [corpo];
          } else if (tipo === 'update') {
            feitas = nuvem.linhas.filter(passa);

            for (const l of feitas) Object.assign(l, clonar(corpo));
          } else {
            feitas = nuvem.linhas.filter(passa);
            nuvem.linhas = nuvem.linhas.filter((l) => !passa(l));
          }

          if (nuvem.semResposta) return { data: null, error: falha };

          return { data: feitas.map((l) => ({ id: l.id })), error: null };
        };

        const q = {
          eq: (c, v) => (filtros.push(['eq', c, v]), q),
          in: (c, v) => (filtros.push(['in', c, [...v]]), q),
          gte: (c, v) => (filtros.push(['gte', c, v]), q),
          lt: (c, v) => (filtros.push(['lt', c, v]), q),
          order: () => q,
          range: (de, ate) => ((faixa = [de, ate]), q),
          select: (c) => ((colunas ??= c), q),
          then: (ok, erro) => Promise.resolve().then(rodar).then(ok, erro),
        };

        return q;
      };

      return {
        select: (c) => consulta('select').select(c),
        insert: (l) => consulta('insert', l),
        update: (campos) => consulta('update', campos),
        delete: () => consulta('delete'),
      };
    },
  };
}

function aparelho(nuvem, { local = [], base } = {}) {
  const guardado = new Map(),
    sb = nuvemFalsa(nuvem);

  const agendados = [];

  const B = carregar(
    A('js/banco.js'),
    [
      'TABELA',
      'K_LOCAL',
      'db',
      'EPOCA',
      'idOk',
      'isoOk',
      'migrarNotaAntiga',
      'ordemOk',
      'pelaEdicao',
      'pelaOrdem',
      'FOLGA_MINIMA',
      'ordemEntre',
      'preparar',
      'linhas',
      'deLinhas',
      'baseNormal',
      'diferenca',
      'temPendente',
      'notaPorId',
      'criarNota',
      'salvarNota',
      'salvarTituloNota',
      'apagarNota',
      'moverNota',
      'ID_TEMP',
      'notasDaLista',
      'criarTemp',
      'moverParagrafos',
      'CONFLITO',
      'CAMPOS',
      'conteudoMudou',
      'camposMudados',
      'decidirEnvio',
      'decidirApagar',
      'copiaDeConflito',
      'resolverConflito',
      'conflitoNaTela',
      'aplicarNuvem',
      'lerVoo',
      'marcarVoo',
      'limparVoo',
      'comVersao',
      'linhasDaNuvem',
      'guardarBase',
      'guardarDb',
      'enviar',
      'baixar',
      'carregar',
      'atualizar',
      'gravar',
    ],
    {
      sb,
      store: {
        get: (k) => guardado.get(k) ?? null,
        set: (k, v) => guardado.set(k, v) && true,
      },
      toast: () => {},
      clearTimeout: () => {},
      setTimeout: (f, ms) => agendados.push(ms),
      pintarSync: () => {},
      moverBlocos: M.moverBlocos,
      indicesNoTexto: M.indicesNoTexto,
    },
    `__saida.K_BASE = K_BASE;
    __saida.E = {
      get db() { return db; }, set db(v) { db = v; },
      get usuario() { return usuario; }, set usuario(v) { usuario = v; },
      get base() { return base; }, set base(v) { base = v; },
      get erroSync() { return erroSync; },
      get conflitos() { return conflitos; },
      get mantidas() { return mantidas; },
      set aoMudarDeFora(f) { aoMudarDeFora = f; },
    };`
  );

  B.E.usuario = { id: 'u1' };
  B.E.db = B.preparar({ notas: local });
  B.E.base = base === undefined ? B.linhas(B.E.db) : base;
  B.guardado = guardado;
  B.agendados = agendados;

  return B;
}

const N1 = {
  id: 'n1',
  titulo: 'Um',
  texto: '',
  criadaEm: '2026-11-20T10:00:00.000Z',
  editadaEm: '2026-11-20T10:00:00.000Z',
};

const N2 = {
  id: 'n2',
  titulo: 'Dois',
  texto: 'par',
  criadaEm: '2026-11-21T10:00:00.000Z',
  editadaEm: '2026-11-22T10:00:00.000Z',
};

test('preparar: valida dados e migra notas antigas separando a primeira linha em título', () => {
  const { preparar, EPOCA } = aparelho({ linhas: [] });

  const d = preparar({
    notas: [
      N1,
      null,
      { id: 'a/b', texto: 'x' },
      { id: '', texto: 'x' },
      { id: 7, texto: 'x' },
      { id: 'x'.repeat(65), texto: 'x' },
      { ...N1, texto: 'velha', editadaEm: '2026-11-19T10:00:00.000Z' },
      N2,
      {
        id: 'sem',
        titulo: '',
        texto: 'a\r\nb\rc',
        criadaEm: 'lixo',
        editadaEm: 'lixo',
      },
      { id: 'tz', titulo: '', texto: 5, criadaEm: '2026-11-23T09:00:00.123456+00:00' },
      {
        id: 'legada',
        texto: '\n\n  ## Antiga  \n\ncorpo',
        criadaEm: '2026-11-19T10:00:00.000Z',
      },
    ],
  });

  // sem ordem (formato antigo): 1, 2, 3… pela edição, a mais recente primeiro
  assert.deepEqual(json(d), {
    notas: [
      {
        id: 'tz',
        titulo: '',
        texto: '',
        ordem: 1,
        criadaEm: '2026-11-23T09:00:00.123Z',
        editadaEm: '2026-11-23T09:00:00.123Z',
      },
      { ...N2, ordem: 2 },
      { ...N1, ordem: 3 },
      {
        id: 'legada',
        titulo: 'Antiga',
        texto: 'corpo',
        ordem: 4,
        criadaEm: '2026-11-19T10:00:00.000Z',
        editadaEm: '2026-11-19T10:00:00.000Z',
      },
      {
        id: 'sem',
        titulo: '',
        texto: 'a\nb\nc',
        ordem: 5,
        criadaEm: EPOCA,
        editadaEm: EPOCA,
      },
    ],
  });
  assert.deepEqual(
    json(preparar({ notas: [{ id: 'so', texto: 'título único' }] }).notas[0]),
    {
      id: 'so',
      titulo: 'título único',
      texto: '',
      ordem: 1,
      criadaEm: EPOCA,
      editadaEm: EPOCA,
    }
  );
  assert.deepEqual(json(preparar(null)), { notas: [] });
  assert.deepEqual(json(preparar({ notas: 'x' })), { notas: [] });
  // limpar de novo não muda nada
  assert.deepEqual(json(preparar(d)), json(d));
});

test('linhas ↔ deLinhas: ida e volta pela tabela dá o mesmo db, e a data do servidor (microssegundos, +00:00) vira a do aparelho', () => {
  const { preparar, linhas, deLinhas } = aparelho({ linhas: [] });
  const d = preparar({ notas: [N1, N2] });

  assert.deepEqual(json(linhas(d)), {
    n1: {
      id: 'n1',
      titulo: 'Um', // formato antigo (sem título): a 1ª linha vira o título
      texto: '',
      ordem: 2,
      criada_em: N1.criadaEm,
      editada_em: N1.editadaEm,
    },
    n2: {
      id: 'n2',
      titulo: 'Dois',
      texto: 'par',
      ordem: 1,
      criada_em: N2.criadaEm,
      editada_em: N2.editadaEm,
    },
  });
  assert.deepEqual(json(deLinhas(Object.values(linhas(d)))), json(d));
  assert.deepEqual(
    json(
      deLinhas([
        {
          id: 'n1',
          titulo: 'Um',
          texto: '',
          criada_em: '2026-11-20T10:00:00+00:00',
          editada_em: '2026-11-20T07:00:00.000000-03:00',
        },
      ])
    ),
    { notas: [{ ...N1, ordem: 1 }] }
  );
  assert.deepEqual(json(deLinhas(null)), { notas: [] });
});

test('base guardada num formato antigo (datas do servidor, \\r\\n, linha inválida) não vira pendente falso', () => {
  const ap = aparelho(
    { linhas: [] },
    {
      local: [N1],
      base: null,
    }
  );

  ap.E.base = ap.baseNormal({
    n1: {
      id: 'n1',
      texto: '# Um',
      criada_em: '2026-11-20T10:00:00.000000+00:00',
      editada_em: '2026-11-20T07:00:00-03:00',
    },
    lixo: { id: 'a/b', texto: 'x' },
  });
  assert.equal(ap.temPendente(), false);
  assert.equal(ap.baseNormal(null), null);
  assert.equal(ap.baseNormal('x'), null);

  // sem base (nunca enviou) tudo está pendente
  ap.E.base = null;
  assert.equal(ap.temPendente(), true);
});

test('salvarNota e salvarTituloNota: valores iguais não gravam; mudanças salvam e agendam o envio em 0,8 s', () => {
  const ap = aparelho({ linhas: [] }, { local: [N1, N2] });

  assert.equal(ap.salvarNota('n1', ''), false);
  assert.equal(ap.salvarTituloNota('n1', 'Um'), false);
  assert.equal(ap.salvarNota('nada', 'x'), false);
  assert.deepEqual(ap.agendados, []);
  assert.equal(ap.guardado.size, 0);
  assert.equal(ap.temPendente(), false);

  assert.equal(ap.salvarNota('n1', 'mais\r\ntexto'), true);
  assert.equal(ap.notaPorId('n1').texto, 'mais\ntexto');
  assert.ok(ap.notaPorId('n1').editadaEm > N2.editadaEm);
  // editar não muda a posição na lista (a ordem é a que o mantenedor definiu)
  assert.deepEqual(json(ap.E.db.notas.map((n) => n.id)), ['n2', 'n1']);
  assert.deepEqual(ap.agendados, [800]);
  assert.equal(JSON.parse(ap.guardado.get('notas.db.u1')).notas[1].texto, 'mais\ntexto');
  assert.equal(ap.salvarTituloNota('n1', '  Outro título  '), true);
  assert.equal(ap.notaPorId('n1').titulo, 'Outro título');
  assert.equal(ap.notaPorId('n1').texto, 'mais\ntexto');
  assert.deepEqual(ap.agendados, [800, 800]);
  assert.equal(ap.temPendente(), true);
});

// ---------- ordem da lista (definida arrastando; migration 02) ----------
const nt = (id, ordem, extra = {}) => ({
  id,
  titulo: id,
  texto: '',
  ordem,
  criadaEm: '2026-11-20T10:00:00.000Z',
  editadaEm: '2026-11-20T10:00:00.000Z',
  ...extra,
});

const ids = (ap) => json(ap.E.db.notas.map((n) => n.id));

test('ordemEntre: lista vazia 0; no topo a primeira − 1; no fim a última + 1; no meio a média; sem folga (< 1e-6 ou empate) devolve null para renumerar', () => {
  const { ordemEntre, FOLGA_MINIMA } = aparelho({ linhas: [] });

  assert.equal(FOLGA_MINIMA, 1e-6);
  assert.equal(ordemEntre(null, null), 0);
  assert.equal(ordemEntre(null, 5), 4);
  assert.equal(ordemEntre(null, -2.5), -3.5);
  assert.equal(ordemEntre(7, null), 8);
  assert.equal(ordemEntre(1, 2), 1.5);
  assert.equal(ordemEntre(1, 4), 2.5);
  assert.equal(ordemEntre(-1, 1), 0);
  // vizinha que não é número vale como "não há vizinha daquele lado"
  assert.equal(ordemEntre(NaN, 3), 2);
  assert.equal(ordemEntre('x', undefined), 0);
  // folga: exatamente 1e-6 ainda cabe; menos, empate ou invertida pedem renumerar
  assert.equal(ordemEntre(0, 1e-6), 5e-7);
  assert.equal(ordemEntre(0, 1e-7), null);
  assert.equal(ordemEntre(1, 1), null);
  assert.equal(ordemEntre(2, 1), null);
});

test('preparar com ordem: ordena por ordem (empate: editada mais recente, depois id); sem ordem ou inválida vai depois das válidas pela edição, sempre igual para a mesma entrada', () => {
  const { preparar } = aparelho({ linhas: [] }),
    antiga = '2026-11-01T10:00:00.000Z',
    nova = '2026-11-02T10:00:00.000Z';

  const entrada = [
    nt('c', 2),
    nt('a', 2),
    nt('b', -3),
    nt('e', undefined, { editadaEm: antiga }),
    nt('f', 'x', { editadaEm: nova }),
    nt('g', NaN, { editadaEm: nova }),
    nt('h', Infinity, { editadaEm: antiga }),
  ];

  const r = preparar({ notas: entrada });

  // b (-3), a e c empatadas (mesma edição: pelo id), depois sem ordem: f e g (edição mais nova, pelo id), e e h
  assert.deepEqual(json(r.notas.map((n) => [n.id, n.ordem])), [
    ['b', -3],
    ['a', 2],
    ['c', 2],
    ['f', 3],
    ['g', 4],
    ['e', 5],
    ['h', 6],
  ]);

  // a mesma entrada em qualquer ordem dá o mesmo resultado
  assert.deepEqual(json(preparar({ notas: [...entrada].reverse() })), json(r));
  assert.deepEqual(
    json(
      preparar({
        notas: [entrada[3], entrada[0], ...entrada.slice(4), entrada[1], entrada[2]],
      })
    ),
    json(r)
  );

  // só ordens negativas: as sem ordem continuam em max(maior, 0) + 1
  assert.deepEqual(
    json(
      preparar({ notas: [nt('x', -5), nt('y', undefined)] }).notas.map((n) => n.ordem)
    ),
    [-5, 1]
  );
  // limpar de novo não muda nada
  assert.deepEqual(json(preparar(r)), json(r));
});

test('criarNota: a nota nova entra no topo (menor ordem − 1; lista vazia, 0) e as outras não mudam', () => {
  const ap = aparelho({ linhas: [] }, { local: [nt('a', 3), nt('b', 7)], base: null });

  const n = ap.criarNota('Nova');

  assert.equal(n.ordem, 2);
  assert.deepEqual(ids(ap), [n.id, 'a', 'b']);
  assert.deepEqual(json(ap.E.db.notas.slice(1).map((x) => x.ordem)), [3, 7]);
  assert.equal(ap.criarNota('Outra').ordem, 1);

  const vazio = aparelho({ linhas: [] });

  assert.equal(vazio.criarNota('Primeira').ordem, 0);
});

test('moverNota: sobe só a linha movida (ordem entre as vizinhas, editadaEm igual); mesma posição, nota que não existe e posição inválida não gravam', async () => {
  const nuvem = { linhas: [] },
    ap = aparelho(nuvem, {
      local: [nt('a', 1), nt('b', 2), nt('c', 3), nt('d', 4)],
      base: null,
    });

  await ap.enviar();
  assert.equal(nuvem.linhas.length, 4);
  nuvem.pedidos = [];
  ap.agendados.length = 0;

  // d para a posição 1 (entre a e b): 1,5
  assert.equal(ap.moverNota('d', 1), true);
  assert.deepEqual(ids(ap), ['a', 'd', 'b', 'c']);
  assert.equal(ap.notaPorId('d').ordem, 1.5);
  assert.equal(ap.notaPorId('d').editadaEm, '2026-11-20T10:00:00.000Z');
  assert.deepEqual(ap.agendados, [800]);

  await ap.enviar();
  const up = nuvem.pedidos.filter((p) => p[0] !== 'select');

  // só a ordem da movida, sem condição de versão (mudar a posição não sobrescreve texto de ninguém)
  assert.deepEqual(json(up), [
    [
      'update',
      'notas_nota',
      { ordem: 1.5 },
      [
        ['eq', 'user_id', 'u1'],
        ['eq', 'id', 'd'],
      ],
    ],
  ]);
  assert.deepEqual(json(nuvem.linhas.map((l) => [l.id, l.ordem])), [
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 1.5],
  ]);

  // topo e fim
  assert.equal(ap.moverNota('c', 0), true);
  assert.equal(ap.notaPorId('c').ordem, 0);
  assert.equal(ap.moverNota('c', 99), true);
  assert.deepEqual(ids(ap), ['a', 'd', 'b', 'c']);
  assert.equal(ap.notaPorId('c').ordem, 3);
  assert.equal(ap.moverNota('a', -5), false); // já é a primeira

  // sem mudança: nada grava
  ap.agendados.length = 0;
  assert.equal(ap.moverNota('b', 2), false);
  assert.equal(ap.moverNota('nada', 0), false);
  assert.equal(ap.moverNota('b', NaN), false);
  assert.deepEqual(ap.agendados, []);
});

test('moverNota sem folga entre as vizinhas renumera 1, 2, 3… na ordem nova (várias linhas sobem); com folga só a movida', async () => {
  const ap = aparelho(
      { linhas: [] },
      { local: [nt('a', 1), nt('b', 1.0000001), nt('c', 5)], base: null }
    ),
    antes = json(ap.E.db.notas.map((n) => [n.id, n.ordem]));

  assert.deepEqual(antes, [
    ['a', 1],
    ['b', 1.0000001],
    ['c', 5],
  ]);
  // c entre a e b: sem folga
  assert.equal(ap.moverNota('c', 1), true);
  assert.deepEqual(ids(ap), ['a', 'c', 'b']);
  assert.deepEqual(json(ap.E.db.notas.map((n) => n.ordem)), [1, 2, 3]);
  assert.ok(ap.E.db.notas.every((n) => n.editadaEm === '2026-11-20T10:00:00.000Z'));

  // empate exato de ordem: também renumera e a nota fica onde foi posta
  const emp = aparelho({ linhas: [] }, { local: [nt('a', 1), nt('b', 1), nt('c', 2)] });

  assert.deepEqual(ids(emp), ['a', 'b', 'c']);
  assert.equal(emp.moverNota('c', 1), true);
  assert.deepEqual(ids(emp), ['a', 'c', 'b']);
  assert.deepEqual(json(emp.E.db.notas.map((n) => n.ordem)), [1, 2, 3]);
});

test('editar (texto ou título) não muda a posição, nem a ordem, nem a ordem que sobe no envio', async () => {
  const nuvem = { linhas: [] },
    ap = aparelho(nuvem, { local: [nt('a', 1), nt('b', 2), nt('c', 3)], base: null });

  await ap.enviar();
  assert.equal(ap.salvarNota('c', 'mudou'), true);
  assert.equal(ap.salvarTituloNota('c', 'Novo'), true);
  assert.deepEqual(ids(ap), ['a', 'b', 'c']);
  assert.deepEqual(json(ap.E.db.notas.map((n) => n.ordem)), [1, 2, 3]);
  assert.ok(ap.notaPorId('c').editadaEm > '2026-11-21');
  await ap.enviar();
  assert.equal(nuvem.linhas.find((l) => l.id === 'c').ordem, 3);
});

test('linhas ↔ deLinhas levam a ordem; linha da nuvem sem ordem (formato antigo) recebe uma pela edição', () => {
  const { linhas, deLinhas } = aparelho({ linhas: [] }),
    d = { notas: [nt('a', -1.5), nt('b', 4)] };

  const l = linhas(d);

  assert.equal(l.a.ordem, -1.5);
  assert.equal(l.b.ordem, 4);
  assert.deepEqual(json(deLinhas(Object.values(l))), json(d));
  assert.deepEqual(
    json(
      deLinhas([
        { id: 'x', titulo: 'x', texto: '', editada_em: '2026-11-01T10:00:00.000Z' },
        { id: 'y', titulo: 'y', texto: '', editada_em: '2026-11-02T10:00:00.000Z' },
      ]).notas.map((n) => [n.id, n.ordem])
    ),
    [
      ['y', 1],
      ['x', 2],
    ]
  );
});

test('formato antigo: cópia e base sem ordem (antes da migration 02) não viram pendência; só a ordem nova sobe quando alguém arrasta', () => {
  const velha = [N1, N2].map(({ id, titulo, texto, criadaEm, editadaEm }) => ({
    id,
    titulo,
    texto,
    criadaEm,
    editadaEm,
  }));

  const ap = aparelho({ linhas: [] }, { local: velha, base: null });

  // a base guardada do formato antigo: linhas da tabela sem a coluna ordem
  ap.E.base = ap.baseNormal({
    n1: {
      id: 'n1',
      titulo: 'Um',
      texto: '',
      criada_em: N1.criadaEm,
      editada_em: N1.editadaEm,
    },
    n2: {
      id: 'n2',
      titulo: 'Dois',
      texto: 'par',
      criada_em: N2.criadaEm,
      editada_em: N2.editadaEm,
    },
  });
  assert.equal(ap.temPendente(), false);
  assert.deepEqual(ids(ap), ['n2', 'n1']);
  assert.deepEqual(json(ap.E.db.notas.map((n) => n.ordem)), [1, 2]);

  // arrastar muda só a ordem da movida: um pendente
  assert.equal(ap.moverNota('n1', 0), true);
  assert.equal(ap.temPendente(), true);
});

test('envio: lê a nota na nuvem e grava só as colunas que mudaram, condicional à versão conhecida (editada_em da base, intervalo de 1 ms); a apagada sai também condicional; depois a base é a nuvem e não há pendente', async () => {
  const nuvem = {
    linhas: [N1, N2].map((n, i) => ({
      user_id: 'u1',
      id: n.id,
      titulo: n.titulo,
      texto: n.texto,
      ordem: i + 1,
      criada_em: n.criadaEm,
      // a nuvem guarda microssegundos; o aparelho, milissegundos: a versão continua a mesma
      editada_em: n.editadaEm.replace('.000Z', '.000456+00:00'),
    })),
  };

  const ap = aparelho(nuvem, { local: [N1, N2] });

  ap.salvarNota('n2', 'par\n\nnovo');
  const editada = ap.notaPorId('n2').editadaEm;

  await ap.enviar();
  assert.deepEqual(json(nuvem.pedidos), [
    [
      'select',
      'notas_nota',
      'id,titulo,texto,ordem,criada_em,editada_em',
      [
        ['eq', 'user_id', 'u1'],
        ['in', 'id', ['n2']],
      ],
    ],
    [
      'update',
      'notas_nota',
      { texto: 'par\n\nnovo', editada_em: editada },
      [
        ['eq', 'user_id', 'u1'],
        ['eq', 'id', 'n2'],
        ['gte', 'editada_em', N2.editadaEm],
        ['lt', 'editada_em', '2026-11-22T10:00:00.001Z'],
      ],
    ],
  ]);
  assert.equal(nuvem.linhas[1].texto, 'par\n\nnovo');
  assert.equal(ap.temPendente(), false);
  assert.deepEqual(
    JSON.parse(ap.guardado.get('notas.base.u1')),
    json(ap.linhas(ap.E.db))
  );
  // a versão confirmada sai do voo
  assert.deepEqual(JSON.parse(ap.guardado.get('notas.voo.u1')), {});

  // nada mudou: nenhum pedido
  nuvem.pedidos = [];
  await ap.enviar();
  assert.deepEqual(nuvem.pedidos, []);

  // apagar: só o delete daquela nota, desta conta, na versão conhecida
  ap.apagarNota('n1');
  await ap.enviar();
  assert.deepEqual(json(nuvem.pedidos.filter((p) => p[0] === 'delete')), [
    [
      'delete',
      'notas_nota',
      'id',
      [
        ['eq', 'user_id', 'u1'],
        ['eq', 'id', 'n1'],
        ['gte', 'editada_em', N1.editadaEm],
        ['lt', 'editada_em', '2026-11-20T10:00:00.001Z'],
      ],
    ],
  ]);
  assert.deepEqual(
    nuvem.linhas.map((l) => l.id),
    ['n2']
  );
  assert.equal(ap.temPendente(), false);
});

test('envio sem internet: fica pendente (a base não muda); ao voltar, sobe; repetir o envio da nota inteira não duplica', async () => {
  const nuvem = { linhas: [], offline: true };
  const ap = aparelho(nuvem, { local: [] });
  const n = ap.criarNota('Nova');

  await ap.enviar();
  assert.equal(ap.temPendente(), true);
  assert.match(ap.E.erroSync, /fetch/);
  assert.equal(nuvem.linhas.length, 0);

  nuvem.offline = false;
  await ap.enviar();
  await ap.enviar();
  assert.equal(ap.temPendente(), false);
  assert.equal(ap.E.erroSync, '');
  assert.deepEqual(
    nuvem.linhas.map((l) => [l.user_id, l.id, l.titulo, l.texto]),
    [['u1', n.id, 'Nova', '']]
  );

  // o envio "perdido" (chegou, mas a resposta não voltou) é repetido: a nuvem continua com uma linha só
  ap.E.base = null;
  await ap.enviar();
  assert.equal(nuvem.linhas.length, 1);
});

test('carregar: com pendente no aparelho, envia antes e não troca pela nuvem (nem se o envio falhou); sem pendente, a nuvem vale (outro aparelho salvou por último)', async () => {
  const nuvem = {
    linhas: [
      {
        user_id: 'u1',
        id: 'n1',
        titulo: 'Um, do outro aparelho',
        texto: '',
        criada_em: N1.criadaEm,
        editada_em: '2026-11-23T10:00:00+00:00',
      },
    ],
  };

  const ap = aparelho(nuvem);

  // sem nada no aparelho: abre com a nuvem
  ap.E.usuario = null;
  await ap.carregar({ id: 'u1' }, () => {});
  assert.equal(ap.notaPorId('n1').titulo, 'Um, do outro aparelho');
  assert.equal(ap.temPendente(), false);

  // aparelho com uma edição pendente (sem internet antes): ao abrir, sobe primeiro e continua com o texto daqui
  ap.guardado.set(
    'notas.db.u1',
    JSON.stringify({
      notas: [{ ...N1, texto: 'daqui', editadaEm: '2026-11-24T10:00:00.000Z' }],
    })
  );
  nuvem.pedidos = [];
  await ap.carregar({ id: 'u1' }, () => {});
  assert.equal(ap.notaPorId('n1').texto, 'daqui');
  assert.deepEqual(
    nuvem.pedidos.map((p) => p[0]),
    ['select', 'update', 'select']
  );
  assert.equal(nuvem.linhas[0].texto, 'daqui');

  // a gravação falhou (erro do servidor) mas a leitura deu certo: o texto daqui continua pendente, não é trocado pela nuvem
  nuvem.linhas[0].texto = 'do outro de novo';
  ap.guardado.set(
    'notas.db.u1',
    JSON.stringify({
      notas: [{ ...N1, texto: 'daqui 2', editadaEm: '2026-11-24T11:00:00.000Z' }],
    })
  );
  nuvem.recusar = 'permission denied';
  await ap.carregar({ id: 'u1' }, () => {});
  assert.equal(ap.notaPorId('n1').texto, 'daqui 2');
  assert.equal(ap.temPendente(), true);
  assert.equal(ap.E.erroSync, 'permission denied');
});

// ---------- aba parada: outro aparelho mudou a nuvem enquanto esta cópia estava velha ----------
// linha da nuvem (com user_id) a partir de uma nota do db
const naNuvem = (n, extra = {}) => ({
  user_id: 'u1',
  id: n.id,
  titulo: n.titulo,
  texto: n.texto,
  ordem: n.ordem,
  criada_em: n.criadaEm,
  editada_em: n.editadaEm,
  ...extra,
});

const A1 = { ...N1, texto: 'v0', ordem: 1 },
  A2 = { ...N2, ordem: 2 },
  OUTRO = '2026-11-23T08:00:00.000Z';

test('aba parada: a nota mudou na nuvem e aqui (base velha) → nada se perde: a original fica com o texto da nuvem e o daqui vira uma nota nova "(conflito)" logo abaixo, que sobe', async () => {
  const nuvem = {
      linhas: [naNuvem(A1, { texto: 'do outro', editada_em: OUTRO }), naNuvem(A2)],
    },
    ap = aparelho(nuvem, { local: [A1, A2] });

  let redesenhos = 0;

  ap.E.aoMudarDeFora = () => redesenhos++;

  ap.salvarNota('n1', 'daqui');
  await ap.enviar();

  // a nuvem da original não foi sobrescrita
  const n1 = nuvem.linhas.find((l) => l.id === 'n1');

  assert.equal(n1.texto, 'do outro');
  assert.equal(n1.editada_em, OUTRO);
  assert.equal(
    nuvem.pedidos.some((p) => p[0] === 'update' && p[3].some((f) => f[2] === 'n1')),
    false
  );

  // aqui: a original com o da nuvem, a cópia logo abaixo com o texto daqui
  assert.equal(ap.notaPorId('n1').texto, 'do outro');
  const copia = ap.E.db.notas[1];

  assert.deepEqual(ids(ap), ['n1', copia.id, 'n2']);
  assert.equal(copia.titulo, 'Um (conflito)');
  assert.equal(copia.texto, 'daqui');
  assert.ok(copia.ordem > 1 && copia.ordem < 2);
  assert.notEqual(copia.id, 'n1');

  // a cópia subiu (inserida) e não sobra pendente
  const naCopia = nuvem.linhas.find((l) => l.id === copia.id);

  assert.equal(naCopia.texto, 'daqui');
  assert.equal(naCopia.titulo, 'Um (conflito)');
  assert.equal(ap.temPendente(), false);
  assert.deepEqual(json(ap.E.conflitos), [
    { original: 'n1', copia: copia.id, titulo: 'Um' },
  ]);
  assert.ok(redesenhos >= 1);
  // a cópia local também foi guardada
  assert.equal(JSON.parse(ap.guardado.get('notas.db.u1')).notas.length, 3);
});

test('aba parada: outro aparelho só mexeu na posição → o texto daqui sobe normal (sem conflito) e a posição da nuvem fica', async () => {
  const nuvem = { linhas: [naNuvem(A1, { ordem: 5 }), naNuvem(A2)] },
    ap = aparelho(nuvem, { local: [A1, A2] });

  ap.salvarNota('n1', 'daqui');
  await ap.enviar();

  const n1 = nuvem.linhas.find((l) => l.id === 'n1');

  assert.equal(n1.texto, 'daqui');
  assert.equal(n1.ordem, 5);
  assert.equal(nuvem.linhas.length, 2);
  assert.equal(ap.notaPorId('n1').ordem, 5);
  assert.deepEqual(ids(ap), ['n2', 'n1']);
  assert.equal(ap.temPendente(), false);
  assert.deepEqual(json(ap.E.conflitos), []);
});

test('aba parada: apagar aqui uma nota que mudou na nuvem não apaga; ela volta com o texto da nuvem. A que não mudou é apagada', async () => {
  const nuvem = {
      linhas: [naNuvem(A1, { texto: 'do outro', editada_em: OUTRO }), naNuvem(A2)],
    },
    ap = aparelho(nuvem, { local: [A1, A2] });

  ap.apagarNota('n1');
  ap.apagarNota('n2');
  await ap.enviar();

  assert.deepEqual(
    nuvem.linhas.map((l) => [l.id, l.texto]),
    [['n1', 'do outro']]
  );
  assert.deepEqual(ids(ap), ['n1']);
  assert.equal(ap.notaPorId('n1').texto, 'do outro');
  assert.deepEqual(json(ap.E.mantidas), [{ id: 'n1', titulo: 'Um' }]);
  assert.equal(ap.temPendente(), false);
});

test('aba parada: outro aparelho grava entre a leitura e a gravação deste → o update condicional não afeta nada e a rodada seguinte vira conflito (nada sobrescrito)', async () => {
  const nuvem = { linhas: [naNuvem(A1), naNuvem(A2)] },
    ap = aparelho(nuvem, { local: [A1, A2] });

  nuvem.antesDeGravar = () => {
    Object.assign(nuvem.linhas[0], { texto: 'do outro', editada_em: OUTRO });
  };

  ap.salvarNota('n1', 'daqui');
  await ap.enviar();

  assert.equal(nuvem.linhas.find((l) => l.id === 'n1').texto, 'do outro');
  assert.deepEqual(nuvem.linhas.map((l) => l.texto).sort(), ['daqui', 'do outro', 'par']);
  assert.equal(ap.notaPorId('n1').texto, 'do outro');
  assert.equal(ap.temPendente(), false);
});

test('aba parada: gravação que chegou sem resposta (voo) não vira conflito consigo mesma; nota apagada na nuvem com texto mudado aqui volta (inserida); só com a posição mudada, aceita a apagada', async () => {
  const nuvem = { linhas: [naNuvem(A1), naNuvem(A2)] },
    ap = aparelho(nuvem, { local: [A1, A2] });

  nuvem.semResposta = true;
  ap.salvarNota('n1', 'v1');
  await ap.enviar();
  assert.equal(nuvem.linhas[0].texto, 'v1'); // chegou
  assert.equal(ap.temPendente(), true); // mas aqui não se sabe

  nuvem.semResposta = false;
  ap.salvarTituloNota('n1', 'Um de novo');
  ap.salvarNota('n1', 'v2');
  await ap.enviar();
  assert.deepEqual(
    nuvem.linhas.map((l) => [l.id, l.titulo, l.texto]),
    [
      ['n1', 'Um de novo', 'v2'],
      ['n2', 'Dois', 'par'],
    ]
  );
  assert.deepEqual(json(ap.E.conflitos), []);
  assert.equal(ap.temPendente(), false);

  // apagada em outro aparelho: o texto mudado aqui sobe de novo; a só movida aqui sai daqui também
  nuvem.linhas = [];
  ap.salvarNota('n1', 'v3');
  ap.moverNota('n2', 0);
  await ap.enviar();
  assert.deepEqual(
    nuvem.linhas.map((l) => [l.id, l.texto]),
    [['n1', 'v3']]
  );
  assert.deepEqual(ids(ap), ['n1']);
  assert.equal(ap.temPendente(), false);
});

test('buscar ao voltar (atualizar): a nuvem entra nas notas sem pendência (mudada, nova e apagada em outro aparelho) e não mexe na nota com pendência; a tela é redesenhada', async () => {
  const A3 = { ...N1, id: 'n3', titulo: 'Três', texto: 'x', ordem: 3 };

  const nuvem = { linhas: [naNuvem(A1), naNuvem(A2), naNuvem(A3)] },
    ap = aparelho(nuvem, { local: [A1, A2, A3] });

  let redesenhos = 0;

  ap.E.aoMudarDeFora = () => redesenhos++;

  // outro aparelho: muda n1, apaga n3, cria n4
  Object.assign(nuvem.linhas[0], { texto: 'do outro', editada_em: OUTRO });
  nuvem.linhas.splice(2, 1);
  nuvem.linhas.push(
    naNuvem({ ...A3, id: 'n4', titulo: 'Quatro', texto: 'novo', ordem: 4 })
  );

  // aqui: n2 com pendência que não sobe (o servidor recusa a gravação; a leitura funciona)
  ap.salvarNota('n2', 'daqui, sem subir');
  nuvem.recusar = 'permission denied';
  await ap.atualizar();

  assert.deepEqual(ids(ap), ['n1', 'n2', 'n4']);
  assert.equal(ap.notaPorId('n1').texto, 'do outro');
  assert.equal(ap.notaPorId('n2').texto, 'daqui, sem subir');
  assert.equal(ap.notaPorId('n4').texto, 'novo');
  assert.equal(redesenhos, 1);
  // a base acompanha a nuvem nas que vieram dela; a pendente continua pendente
  assert.equal(ap.E.base.n1.texto, 'do outro');
  assert.equal(ap.E.base.n3, undefined);
  assert.equal(ap.E.base.n2.texto, 'par');
  assert.equal(ap.temPendente(), true);
  assert.equal(JSON.parse(ap.guardado.get('notas.db.u1')).notas.length, 3);

  // de novo, sem nada novo: não redesenha
  await ap.atualizar();
  assert.equal(redesenhos, 1);

  // a gravação volta a funcionar: a pendente sobe (a nuvem dela não mudou: sem conflito)
  nuvem.recusar = null;
  await ap.atualizar();
  assert.equal(nuvem.linhas.find((l) => l.id === 'n2').texto, 'daqui, sem subir');
  assert.equal(ap.temPendente(), false);
});

test('buscar ao voltar: voltar à aba, a internet voltar e o minuto à vista trazem a nuvem (o banco.js inteiro, com os gatilhos dele); escondida, o minuto só envia o pendente', async () => {
  const nuvem = { linhas: [naNuvem(A1), naNuvem(A2)] },
    guardado = new Map(),
    gatilhos = {},
    doc = { visibilityState: 'hidden', addEventListener: (ev, f) => (gatilhos[ev] = f) };

  const B = carregarArquivos([A('js/banco.js')], ['carregar', 'notaPorId'], {
    supabase: { createClient: () => nuvemFalsa(nuvem) },
    SUPABASE_URL: '',
    SUPABASE_KEY: '',
    fetchComTeto: null,
    store: {
      get: (k) => guardado.get(k) ?? null,
      set: (k, v) => guardado.set(k, v) && true,
    },
    toast: () => {},
    $: () => null,
    navigator: { onLine: true },
    document: doc,
    addEventListener: (ev, f) => (gatilhos[ev] = f),
    setInterval: (f) => (gatilhos.minuto = f),
    setTimeout: () => 0,
    clearTimeout: () => {},
  });

  const esperar = () => new Promise((r) => setImmediate(r)),
    calmo = async () => {
      for (let i = 0; i < 20; i++) await esperar();
    };

  let telas = 0;

  await B.carregar({ id: 'u1' }, () => telas++);
  assert.equal(B.notaPorId('n1').texto, 'v0');

  const mudar = (texto, versao) =>
    Object.assign(nuvem.linhas[0], { texto, editada_em: versao });

  // escondida: o minuto não busca
  mudar('outro 1', '2026-11-23T08:00:00.000Z');
  nuvem.pedidos = [];
  gatilhos.minuto();
  await calmo();
  assert.deepEqual(nuvem.pedidos, []);
  assert.equal(B.notaPorId('n1').texto, 'v0');

  // voltou à aba: busca e redesenha
  doc.visibilityState = 'visible';
  telas = 0;
  gatilhos.visibilitychange();
  await calmo();
  assert.equal(B.notaPorId('n1').texto, 'outro 1');
  assert.equal(telas, 1);

  // a internet voltou: busca
  mudar('outro 2', '2026-11-23T09:00:00.000Z');
  gatilhos.online();
  await calmo();
  assert.equal(B.notaPorId('n1').texto, 'outro 2');

  // o minuto à vista: busca
  mudar('outro 3', '2026-11-23T10:00:00.000Z');
  gatilhos.minuto();
  await calmo();
  assert.equal(B.notaPorId('n1').texto, 'outro 3');
});

test('buscar ao voltar: um envio que acontece enquanto a lista volta deixa a resposta velha de lado (a nota recém-gravada não volta ao texto de antes)', async () => {
  const nuvem = { linhas: [naNuvem(A1), naNuvem(A2)] },
    ap = aparelho(nuvem, { local: [A1, A2] });

  nuvem.aoBaixar = async () => {
    ap.salvarNota('n1', 'novo');
    await ap.enviar();
  };

  await ap.atualizar();

  assert.equal(nuvem.linhas[0].texto, 'novo');
  assert.equal(ap.notaPorId('n1').texto, 'novo');
  assert.equal(ap.temPendente(), false);

  // a busca seguinte traz a nuvem normalmente
  await ap.atualizar();
  assert.equal(ap.notaPorId('n1').texto, 'novo');
});

test('aba parada na tela: o texto (ou título) digitado sobre uma versão que a nuvem já trocou não sobrescreve; vira nota "(conflito)" logo abaixo e a original fica a da nuvem. Sem a versão vista, ou vista igual, grava normal', async () => {
  const nuvem = { linhas: [naNuvem(A1), naNuvem(A2)] },
    ap = aparelho(nuvem, { local: [A1, A2] });

  // a tela pegou o texto na versão A1.editadaEm; a busca trouxe a do outro aparelho
  const vista = ap.notaPorId('n1').editadaEm;

  Object.assign(nuvem.linhas[0], { texto: 'do outro', editada_em: OUTRO });
  await ap.atualizar();
  assert.equal(ap.notaPorId('n1').texto, 'do outro');

  const copia = ap.salvarNota('n1', 'v0 e o que digitei', vista);

  assert.equal(typeof copia, 'string');
  assert.equal(ap.notaPorId('n1').texto, 'do outro');
  assert.equal(ap.notaPorId(copia).texto, 'v0 e o que digitei');
  assert.equal(ap.notaPorId(copia).titulo, 'Um (conflito)');
  assert.deepEqual(ids(ap), ['n1', copia, 'n2']);
  assert.deepEqual(json(ap.E.conflitos), [{ original: 'n1', copia, titulo: 'Um' }]);

  // título digitado sobre versão velha: o mesmo
  const c2 = ap.salvarTituloNota('n1', 'Título da tela', vista);

  assert.equal(ap.notaPorId('n1').titulo, 'Um');
  assert.equal(ap.notaPorId(c2).titulo, 'Título da tela (conflito)');
  assert.equal(ap.notaPorId(c2).texto, 'do outro');

  await ap.enviar();
  assert.equal(nuvem.linhas.find((l) => l.id === 'n1').texto, 'do outro');
  assert.equal(nuvem.linhas.length, 4);

  // vista igual à atual (ou sem vista): grava normal
  assert.equal(ap.salvarNota('n1', 'agora sim', ap.notaPorId('n1').editadaEm), true);
  assert.equal(ap.notaPorId('n1').texto, 'agora sim');
  assert.equal(ap.salvarNota('n2', 'sem vista'), true);
  assert.equal(ap.notaPorId('n2').texto, 'sem vista');
  // texto igual: nada, nem conflito
  assert.equal(ap.salvarNota('n2', 'sem vista', 'outra versão'), false);
  assert.equal(ap.E.conflitos.length, 2);
});

test('aplicarNuvem: nota pendente (mudada, nova ou apagada aqui) fica como está mesmo com a nuvem diferente; sem pendência, vale a nuvem', () => {
  const ap = aparelho({ linhas: [] }),
    db = ap.preparar({
      notas: [A1, { ...A2, texto: 'mudada aqui' }, { ...A1, id: 'n5', ordem: 5 }],
    }),
    base = ap.linhas(ap.preparar({ notas: [A1, A2, { ...A1, id: 'n9', ordem: 9 }] }));

  const r = ap.aplicarNuvem(db, base, [
    naNuvem(A1, { texto: 'nuvem', editada_em: OUTRO }),
    naNuvem(A2, { texto: 'nuvem 2', editada_em: OUTRO }),
    naNuvem({ ...A1, id: 'n9', ordem: 9 }, { texto: 'n9 mudou' }),
  ]);

  assert.deepEqual(json(r.db.notas.map((n) => [n.id, n.texto])), [
    ['n1', 'nuvem'],
    ['n2', 'mudada aqui'],
    ['n5', 'v0'], // nova aqui, ainda não subiu
  ]);
  assert.equal(r.mudou, true);
  assert.equal(r.base.n2.texto, 'par'); // a base da pendente não muda
  assert.equal(r.base.n9.texto, 'v0'); // apagada aqui (pendente): a base fica para o envio decidir
});

// ---------- Favoritas: a marca " ★" no fim do parágrafo ----------
test('ehFavorito e semMarca: só o " ★" do FIM, com espaço ou tab antes; ★ colada, no meio, sozinha ou fecho de bloco de código não são favoritos', () => {
  for (const p of ['a ★', 'a  ★', 'a\t★', 'a\nb ★', 'a ★ ★'])
    assert.equal(M.ehFavorito(p), true, p);

  for (const p of ['a★', 'a ★ x', '★', ' ★', '', 'a', '```\nx\n``` ★', '```\nx ★'])
    assert.equal(M.ehFavorito(p), false, JSON.stringify(p));

  assert.equal(M.ehFavorito(undefined), false);
  assert.equal(M.semMarca('a ★'), 'a');
  assert.equal(M.semMarca('a  \t★'), 'a', 'tira todos os espaços antes da estrela');
  assert.equal(M.semMarca('a\nb ★'), 'a\nb');
  assert.equal(M.semMarca('a ★ ★'), 'a ★', 'só a última estrela é a marca');
  assert.equal(M.semMarca('a ★ x'), 'a ★ x');
  assert.equal(
    M.semMarca('```\nx ★'),
    '```\nx ★',
    'código aberto: o " ★" é texto do código'
  );
  assert.equal(M.semMarca(null), '');
});

test('terminaEmCodigo: a última linha é a cerca, está dentro de bloco aberto, ou o bloco já fechou antes (~~~ e ``` , cerca mais curta não fecha a longa)', () => {
  assert.equal(M.terminaEmCodigo('x\n```\ny\n```'), true);
  assert.equal(M.terminaEmCodigo('```\ny'), true);
  assert.equal(M.terminaEmCodigo('z\n```js\ny'), true);
  assert.equal(M.terminaEmCodigo('~~~\ny\n~~~'), true);
  assert.equal(M.terminaEmCodigo('```\ny\n```\nz'), false, 'depois do fecho é texto');
  assert.equal(M.terminaEmCodigo('````\n```\nz'), true, '``` não fecha ````');
  assert.equal(M.terminaEmCodigo('~~~\n```\nz'), true, '``` não fecha ~~~');
  assert.equal(M.terminaEmCodigo('texto\nmais'), false);
});

test('favoritarBlocos: liga e tira só no fim de cada parágrafo; espaços do fim viram a marca; o resto byte a byte igual; índices repetidos, fora da faixa e código não mudam', () => {
  const t = 'a\n\n\nb  \t\n\n```\nx\n```\n\nc ★  \n';
  const ligado = M.favoritarBlocos(t, [0, 1, 2, 3], true);

  // "c ★  ": espaço digitado depois da estrela não tira o favorito (e favoritar de novo não dobra a estrela)
  assert.equal(ligado, 'a ★\n\n\nb ★\n\n```\nx\n```\n\nc ★  \n');
  assert.equal(M.ehFavorito('c ★  '), true);
  assert.equal(M.semMarca('c ★ \t'), 'c');
  assert.equal(
    M.favoritarBlocos('a\n\nb', [1, 1, 1], true),
    'a\n\nb ★',
    'repetido liga uma vez'
  );
  assert.equal(M.favoritarBlocos('a\n\nb', [-1, 7], true), 'a\n\nb');
  assert.equal(M.favoritarBlocos('a ★\n\nb  ★\n', [0, 1], false), 'a\n\nb\n');
  assert.equal(M.favoritarBlocos('a ★ ★', [0], false), 'a ★', 'tira só a marca do fim');
  assert.equal(
    M.favoritarBlocos('a ★\n\nb', [0], true),
    'a ★\n\nb',
    'já favorito: igual'
  );
  assert.equal(M.favoritarBlocos('a\n\nb', [0], false), 'a\n\nb', 'não favorito: igual');
  assert.equal(M.favoritarBlocos(undefined, [0], true), '');
  // texto em volta intacto: tirar o que pôs devolve o original (menos os espaços do fim, que a marca absorveu)
  assert.equal(
    M.favoritarBlocos(M.favoritarBlocos('a\n\nb', [0, 1], true), [0, 1], false),
    'a\n\nb'
  );
});

test('favoritarBlocos: parágrafo só com ★ (ou só espaço) não é favorito e não ganha marca; "★" sozinho é um parágrafo comum e ganha " ★"', () => {
  assert.equal(M.favoritarBlocos(' ★\n\nb', [0], false), ' ★\n\nb');
  assert.equal(M.favoritarBlocos(' ★', [0], true), ' ★');
  assert.equal(M.alternarFavorito('★', 0), '★ ★');
  assert.equal(M.alternarFavorito(' ★', 0), ' ★');
  assert.equal(M.ehFavorito(' ★'), false);
});

test('mudancasFavorito: as trocas {from,to,insert} em ordem crescente, uma por parágrafo que muda, com as posições do texto (o editor do PC as aplica como estão)', () => {
  const t = 'a\n\nb ★\n\nc  ';

  assert.deepEqual(json(M.mudancasFavorito(t, [2, 0, 1], true)), [
    { from: 1, to: 1, insert: ' ★' },
    { from: 9, to: 11, insert: ' ★' },
  ]);
  assert.deepEqual(json(M.mudancasFavorito(t, [1, 0], false)), [
    { from: 4, to: 6, insert: '' },
  ]);
  assert.deepEqual(json(M.mudancasFavorito(t, [], true)), []);
  assert.deepEqual(json(M.mudancasFavorito('```\nx\n```', [0], true)), []);

  // aplicar as mudanças de trás para a frente dá o mesmo que favoritarBlocos
  let r = t;

  for (const m of json(M.mudancasFavorito(t, [0, 1, 2], true)).reverse())
    r = r.slice(0, m.from) + m.insert + r.slice(m.to);
  assert.equal(r, M.favoritarBlocos(t, [0, 1, 2], true));
});

test('ligarFavorito (a regra da estrela): null sem nenhum que possa; true se algum ainda não é; false se todos os que podem já são; o código na seleção é ignorado', () => {
  assert.equal(M.ligarFavorito('a\n\nb', [0]), true);
  assert.equal(M.ligarFavorito('a ★\n\nb', [0, 1]), true, 'misto: favorita todos');
  assert.equal(M.ligarFavorito('a ★\n\nb ★', [0, 1]), false);
  assert.equal(
    M.ligarFavorito('a ★\n\n```\nx\n```', [0, 1]),
    false,
    'o código não conta'
  );
  assert.equal(M.ligarFavorito('```\nx\n```', [0]), null);
  assert.equal(M.ligarFavorito('a', []), null);
  assert.equal(M.ligarFavorito('a', [5]), null);
  assert.equal(M.ligarFavorito('a ★\n\na ★', [0, 0, 1, 1]), false);
  assert.equal(M.ligarFavorito(' ★', [0]), null, 'só a estrela: nada a favoritar');
});

test('blocosTocados: cursor no começo, no meio e logo depois do fim tocam o parágrafo; na linha em branco entre dois, nenhum; seleção e vários cursores somam sem repetir e em ordem', () => {
  const t = 'ab\n\ncd\n\nef';

  assert.deepEqual(json(M.blocosTocados(t, [[0, 0]])), [0]);
  assert.deepEqual(json(M.blocosTocados(t, [[1, 1]])), [0]);
  assert.deepEqual(json(M.blocosTocados(t, [[2, 2]])), [0]);
  assert.deepEqual(json(M.blocosTocados(t, [[3, 3]])), []);
  assert.deepEqual(json(M.blocosTocados(t, [[1, 5]])), [0, 1]);
  assert.deepEqual(
    json(
      M.blocosTocados(t, [
        [10, 10],
        [0, 0],
      ])
    ),
    [0, 2]
  );
  assert.deepEqual(
    json(
      M.blocosTocados(t, [
        [0, 9],
        [4, 4],
      ])
    ),
    [0, 1, 2]
  );
  assert.deepEqual(json(M.blocosTocados(t, [])), []);
  assert.deepEqual(json(M.blocosTocados('', [[0, 0]])), []);
});

test('favoritas: todas as notas na ordem da lista (db.notas), dentro da nota na ordem do texto, sem a marca, com o índice do parágrafo; título vazio fica "" (a tela mostra "Sem título"); código com " ★" e notas sem favorito não entram', () => {
  const notas = [
    { id: 'x', titulo: '', texto: 'a ★\n\nb\n\nc  ★' },
    { id: 'w', titulo: 'Sem nada', texto: 'nada\n\naqui' },
    { id: 'y', titulo: 'Y', texto: '```\n ★\n```\n\nd ★ \n\ne\nlinha ★' },
    { id: 'z', titulo: 'Z', texto: 'f ★' },
  ];

  assert.deepEqual(json(M.favoritas(notas)), [
    { notaId: 'x', titulo: '', i: 0, texto: 'a' },
    { notaId: 'x', titulo: '', i: 2, texto: 'c' },
    { notaId: 'y', titulo: 'Y', i: 1, texto: 'd' }, // espaço depois da estrela ainda é favorito
    { notaId: 'y', titulo: 'Y', i: 2, texto: 'e\nlinha' },
    { notaId: 'z', titulo: 'Z', i: 0, texto: 'f' },
  ]);
  assert.deepEqual(json(M.favoritas([])), []);
  assert.deepEqual(json(M.favoritas(null)), []);
  assert.deepEqual(json(M.favoritas([{ id: 'q', texto: 'p ★' }])), [
    { notaId: 'q', titulo: '', i: 0, texto: 'p' },
  ]);

  // a ordem é a de db.notas, não a do id: inverter a lista inverte as notas
  assert.deepEqual(
    json(M.favoritas([...notas].reverse())).map((f) => f.notaId),
    ['z', 'y', 'y', 'x', 'x']
  );
  // o índice devolvido tira o favorito de volta no texto de origem
  const f = M.favoritas(notas)[1];

  assert.equal(M.favoritarBlocos(notas[0].texto, [f.i], false), 'a ★\n\nb\n\nc');
});

test('indicesDasFavoritas: as favoritas escolhidas na tela, no texto atual da nota (que mudou depois do desenho): mesmo índice e texto; senão, a 1ª ainda não usada com o mesmo texto; a que sumiu ou deixou de ser favorita fica de fora', () => {
  const antes = 'a ★\n\nb ★\n\nc ★',
    tela = M.favoritas([{ id: 'x', texto: antes }]);

  // nada mudou: os índices da tela
  assert.deepEqual(json(M.indicesDasFavoritas(antes, [tela[0], tela[2]])), [0, 2]);
  // entrou um parágrafo no começo (outro aparelho): os mesmos parágrafos, uma posição abaixo
  assert.deepEqual(
    json(M.indicesDasFavoritas('novo\n\n' + antes, [tela[0], tela[2]])),
    [1, 3]
  );
  // o "b" saiu e o "c" deixou de ser favorito: só o "a"
  assert.deepEqual(
    json(M.indicesDasFavoritas('a ★\n\nc', [tela[0], tela[1], tela[2]])),
    [0]
  );
  // textos repetidos: cada escolhida pega uma diferente
  const rep = 'x ★\n\nx ★';

  assert.deepEqual(
    json(M.indicesDasFavoritas('y\n\n' + rep, M.favoritas([{ id: 'r', texto: rep }]))),
    [1, 2]
  );
  // tirar das favoritas com os índices de hoje tira a marca dos parágrafos certos
  const agora = 'novo\n\n' + antes;

  assert.equal(
    M.favoritarBlocos(agora, M.indicesDasFavoritas(agora, [tela[0]]), false),
    'novo\n\na\n\nb ★\n\nc ★'
  );
});

test('copiarBlocos: leva o parágrafo favorito sem a " ★", o que não é favorito (código com " ★") igual, e o texto original não muda', () => {
  const t = 'a ★\n\nb\n\n```\nx ★\n```\n\nc  ★';

  assert.equal(M.copiarBlocos(t, [0, 1, 2, 3]), 'a\n\nb\n\n```\nx ★\n```\n\nc');
  assert.equal(M.copiarBlocos(t, [3, 0]), 'a\n\nc', 'em ordem do texto');
  assert.equal(t, 'a ★\n\nb\n\n```\nx ★\n```\n\nc  ★');
});

test('editar um favorito mantém a marca, apagar o conteúdo não deixa parágrafo só com a estrela: trocarBloco + favoritarBlocos como a tela usa', () => {
  const t = 'a ★\n\nb';
  const trocado = M.trocarBloco(t, 0, 'novo');

  assert.equal(M.favoritarBlocos(trocado, [0], true), 'novo ★\n\nb');
  assert.equal(
    M.favoritarBlocos(M.trocarBloco(t, 0, 'novo ★'), [0], true),
    'novo ★\n\nb'
  );
});

// ---------- Mover parágrafos para outra nota (sem cópia) ----------
// Nada some e nada duplica: os parágrafos da origem depois, mais os movidos, são os de antes; os do destino depois são os de
// antes mais os movidos, no fim e na ordem do texto
const textos = (t) => json(M.blocos(t)).map((b) => b.texto);

function semPerda(antes, depois, I) {
  const movidos = I.map((i) => textos(antes.origem)[i]);

  assert.deepEqual(
    textos(depois.origem),
    textos(antes.origem).filter((_, i) => !I.includes(i))
  );
  assert.deepEqual(textos(depois.destino), [...textos(antes.destino), ...movidos]);
}

test('moverBlocos: os parágrafos saem da origem e vão para o fim do destino byte a byte (★ e espaços do fim inclusive), na ordem do texto; o resto dos dois textos fica igual', () => {
  const origem = 'a\n\nb  \n\n```\nx\n\ny\n```\n\nc ★\n',
    destino = 'd1\n\nd2\n\n\n',
    r = M.moverBlocos(origem, [3, 1], destino);

  assert.deepEqual(json(r), {
    origem: 'a\n\n```\nx\n\ny\n```\n',
    destino: 'd1\n\nd2\n\nb  \n\nc ★',
    movidos: 2,
  });
  semPerda({ origem, destino }, r, [1, 3]);

  // o bloco de código vai inteiro (com a linha em branco de dentro)
  const codigo = M.moverBlocos(origem, [2], 'd');

  assert.equal(codigo.destino, 'd\n\n```\nx\n\ny\n```');
  semPerda({ origem, destino: 'd' }, codigo, [2]);

  // destino vazio: só os movidos; mover tudo deixa a origem vazia
  const tudo = M.moverBlocos('p1\n\np2', [0, 1], '');

  assert.deepEqual(json(tudo), { origem: '', destino: 'p1\n\np2', movidos: 2 });
});

test('moverBlocos: índice repetido conta uma vez; fora da faixa, negativo, fracionário ou texto ficam de fora; sem nenhum válido nada muda (nem o fim do destino)', () => {
  const origem = 'a\n\nb\n\nc',
    destino = 'd\n\n';

  const r = M.moverBlocos(origem, [1, 1, 1, -1, 3, 9, 0.5, '2', NaN], destino);

  assert.deepEqual(json(r), { origem: 'a\n\nc', destino: 'd\n\nb', movidos: 1 });
  semPerda({ origem, destino }, r, [1]);

  assert.deepEqual(json(M.moverBlocos(origem, [7, -2], destino)), {
    origem,
    destino,
    movidos: 0,
  });
  assert.deepEqual(json(M.moverBlocos(origem, [], destino)), {
    origem,
    destino,
    movidos: 0,
  });
  assert.deepEqual(json(M.moverBlocos('', [0], destino)), {
    origem: '',
    destino,
    movidos: 0,
  });
});

test('indicesNoTexto: o parágrafo escolhido no texto que a tela via, achado no texto atual (mesmo índice e texto; senão o 1º não usado com o mesmo texto); o que sumiu fica de fora', () => {
  assert.deepEqual(json(M.indicesNoTexto('a\n\nb\n\nc', 'a\n\nb\n\nc', [2, 0])), [0, 2]);
  // a nuvem pôs um parágrafo antes: o "b" agora é o 2
  assert.deepEqual(
    json(M.indicesNoTexto('novo\n\na\n\nb\n\nc', 'a\n\nb\n\nc', [1])),
    [2]
  );
  // repetidos: cada um uma vez; sumiu um, só o que ficou
  assert.deepEqual(json(M.indicesNoTexto('x\n\nx', 'x\n\nx', [0, 1])), [0, 1]);
  assert.deepEqual(json(M.indicesNoTexto('x', 'x\n\nx', [0, 1])), [0]);
  assert.deepEqual(json(M.indicesNoTexto('y', 'x', [0])), []);
  assert.deepEqual(json(M.indicesNoTexto('x', 'x', [5, -1])), []);
});

test('moverParagrafos: origem e destino mudam numa gravação só, o envio sobe as duas (cada uma inteira) e nada some nem duplica; mesma nota, nota que não existe e nada a mover não gravam', async () => {
  const nuvem = { linhas: [] },
    ap = aparelho(nuvem, {
      local: [
        nt('n1', 1, { texto: 'p1\n\np2 ★\n\np3' }),
        nt('n2', 2, { texto: 'q' }),
        nt('n3', 3, { texto: 'r' }),
      ],
      base: null,
    });

  await ap.enviar();
  nuvem.pedidos = [];
  ap.agendados.length = 0;

  assert.equal(ap.moverParagrafos('n1', [0], 'n1'), 0);
  assert.equal(ap.moverParagrafos('n1', [0], 'nada'), 0);
  assert.equal(ap.moverParagrafos('nada', [0], 'n2'), 0);
  assert.equal(ap.moverParagrafos('n1', [9, -1], 'n2'), 0);
  assert.deepEqual(ap.agendados, []);
  assert.equal(ap.notaPorId('n1').texto, 'p1\n\np2 ★\n\np3');

  assert.equal(ap.moverParagrafos('n1', [2, 1, 1, 7], 'n2'), 2);
  assert.equal(ap.notaPorId('n1').texto, 'p1');
  assert.equal(ap.notaPorId('n2').texto, 'q\n\np2 ★\n\np3');
  assert.equal(ap.notaPorId('n3').texto, 'r');
  assert.deepEqual(ap.agendados, [800]);

  await ap.enviar();
  assert.deepEqual(json(nuvem.linhas.map((l) => [l.id, l.texto])), [
    ['n1', 'p1'],
    ['n2', 'q\n\np2 ★\n\np3'],
    ['n3', 'r'],
  ]);
  // só as duas subiram, e a n3 não
  assert.deepEqual(
    json(
      nuvem.pedidos
        .filter((p) => p[0] === 'update')
        .map((p) => p[3].find((f) => f[1] === 'id')[2])
        .sort()
    ),
    ['n1', 'n2']
  );
  assert.equal(ap.temPendente(), false);
});

test('moverParagrafos com o texto que a tela via: a nota mudou por baixo da seleção → move o parágrafo escolhido pelo texto; o que sumiu não move nada', () => {
  const ap = aparelho(
    { linhas: [] },
    { local: [nt('n1', 1, { texto: 'p0\n\np1\n\np2' }), nt('n2', 2)], base: null }
  );

  // a tela via "p1\n\np2" e escolheu o "p2" (índice 1); a nuvem pôs o "p0" antes
  assert.equal(ap.moverParagrafos('n1', [1], 'n2', 'p1\n\np2'), 1);
  assert.equal(ap.notaPorId('n1').texto, 'p0\n\np1');
  assert.equal(ap.notaPorId('n2').texto, 'p2');

  assert.equal(ap.moverParagrafos('n1', [0], 'n2', 'sumiu'), 0);
  assert.equal(ap.notaPorId('n1').texto, 'p0\n\np1');
  assert.equal(ap.notaPorId('n2').texto, 'p2');
});

test('Temp: nota de id fixo "temp" e título "Temp", criada uma vez; fora da lista e da ordem manual (moverNota a ignora, nota nova entra no topo da lista sem ela) e recebe parágrafos como qualquer nota', async () => {
  const nuvem = { linhas: [] },
    ap = aparelho(nuvem, { local: [nt('a', 1), nt('b', 2)], base: null });

  const t = ap.criarTemp();

  assert.equal(t.id, 'temp');
  assert.equal(t.titulo, 'Temp');
  assert.equal(t.texto, '');
  assert.equal(ap.criarTemp(), ap.notaPorId('temp'));
  assert.equal(ap.E.db.notas.filter((n) => n.id === 'temp').length, 1);
  assert.deepEqual(json(ap.notasDaLista().map((n) => n.id)), ['a', 'b']);

  // a ordem manual não a vê: a nota nova fica antes de "a", mover pelas posições da lista
  const nova = ap.criarNota('Nova');

  assert.deepEqual(json(ap.notasDaLista().map((n) => n.id)), [nova.id, 'a', 'b']);
  assert.equal(ap.moverNota('temp', 0), false);
  assert.equal(ap.moverNota('b', 0), true);
  assert.deepEqual(json(ap.notasDaLista().map((n) => n.id)), ['b', nova.id, 'a']);
  assert.ok(ap.notaPorId('temp'));

  ap.salvarNota('temp', 'x\n\ny');
  assert.equal(ap.moverParagrafos('temp', [0], 'a'), 1);
  assert.equal(ap.notaPorId('temp').texto, 'y');
  assert.equal(ap.notaPorId('a').texto, 'x');

  await ap.enviar();
  assert.deepEqual(
    json(nuvem.linhas.filter((l) => l.id === 'temp').map((l) => [l.titulo, l.texto])),
    [['Temp', 'y']]
  );
  assert.equal(ap.temPendente(), false);
});
