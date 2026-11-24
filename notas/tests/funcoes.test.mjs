// Regras das Notas sem navegador: cada função sai do arquivo publicado (tests/funcoes.mjs) e roda com dados fixos. A tela fica
// em notas.test.mjs (poucos casos); aqui estão:
//   · a conversa (js/markdown.js): parágrafos com blocos de código, acrescentar, trocar, apagar e copiar sem mexer no resto
//   · o Markdown em HTML: texto sempre escapado, links só http(s)/mailto/tel em outra aba, títulos, listas, tarefas, código
//   · o jeito de abrir (editor ou conversa), a data da lista, a nota no endereço, título e prévia
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
  ]
);

// ---------- a conversa: parágrafos ----------
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

// ---------- util.js: editor ou conversa, data da lista, nota no endereço ----------
const util = (search = '') =>
  carregar(A('js/util.js'), ['pad', 'notaDaUrl', 'quandoFoi'], {
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

test('quandoFoi: hoje a hora, ontem "ontem", neste ano dia/mês, antes com o ano; data que não se lê fica vazia', () => {
  const { quandoFoi } = util(),
    agora = new Date(2026, 10, 24, 15, 0); // 24/11/2026 15:00, hora local

  assert.equal(quandoFoi(new Date(2026, 10, 24, 0, 5).toISOString(), agora), '00:05');
  assert.equal(quandoFoi(new Date(2026, 10, 24, 14, 7).toISOString(), agora), '14:07');
  assert.equal(quandoFoi(new Date(2026, 10, 23, 23, 59).toISOString(), agora), 'ontem');
  assert.equal(quandoFoi(new Date(2026, 10, 22, 12, 0).toISOString(), agora), '22/11');
  assert.equal(quandoFoi(new Date(2026, 0, 3, 12, 0).toISOString(), agora), '03/01');
  assert.equal(quandoFoi(new Date(2025, 11, 31, 12, 0).toISOString(), agora), '31/12/25');
  assert.equal(quandoFoi('lixo', agora), '');
  assert.equal(quandoFoi(undefined, agora), '');
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

// ---------- prévia da lista ----------
test('prévia: a 1ª linha não vazia do corpo, sem as marcas do começo', () => {
  const { previaDe } = carregar(A('js/telas.js'), ['previaDe']);

  assert.equal(previaDe('\n\n- leite\n\n> pão'), 'leite');
  assert.equal(previaDe('> citação\nmais'), 'citação');
  assert.equal(previaDe('1. primeiro'), '1. primeiro');
  assert.equal(previaDe(''), '');
});

// ---------- banco: formato e envio, com uma nuvem falsa ----------
// nuvem: { linhas: [linha da tabela com user_id], offline, recusar: erro do servidor na gravação, pedidos: [[tipo, …]] }
function aparelho(nuvem, { local = [], base } = {}) {
  const guardado = new Map(),
    clonar = (x) => JSON.parse(JSON.stringify(x)),
    falha = { message: 'Failed to fetch' };

  nuvem.pedidos ??= [];

  const sb = {
    from: (tabela) => ({
      upsert: async (L, opcoes) => {
        nuvem.pedidos.push(['upsert', tabela, clonar(L), opcoes]);

        if (nuvem.offline) return { error: falha };

        if (nuvem.recusar) return { error: { message: nuvem.recusar } };

        for (const l of L) {
          const i = nuvem.linhas.findIndex(
            (x) => x.user_id === l.user_id && x.id === l.id
          );

          if (i >= 0) nuvem.linhas[i] = clonar(l);
          else nuvem.linhas.push(clonar(l));
        }

        return { error: null };
      },
      delete: () => ({
        eq: (coluna, valor) => ({
          in: async (coluna2, ids) => {
            nuvem.pedidos.push(['delete', tabela, valor, [...ids]]);

            if (nuvem.offline) return { error: falha };
            nuvem.linhas = nuvem.linhas.filter(
              (l) => !(l[coluna] === valor && ids.includes(l[coluna2]))
            );

            return { error: null };
          },
        }),
      }),
      select: (colunas) => ({
        order: () => ({
          range: async (de, ate) => {
            nuvem.pedidos.push(['select', tabela, colunas]);

            if (nuvem.offline) return { data: null, error: falha };

            return {
              data: clonar(nuvem.linhas.slice(de, ate + 1)).map(
                ({ id, titulo, texto, ordem, criada_em, editada_em }) => ({
                  id,
                  titulo,
                  texto,
                  ordem,
                  criada_em,
                  editada_em,
                })
              ),
              error: null,
            };
          },
        }),
      }),
    }),
  };

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
      'enviar',
      'baixar',
      'carregar',
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
    },
    `__saida.K_BASE = K_BASE;
    __saida.E = {
      get db() { return db; }, set db(v) { db = v; },
      get usuario() { return usuario; }, set usuario(v) { usuario = v; },
      get base() { return base; }, set base(v) { base = v; },
      get erroSync() { return erroSync; },
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

test('envio: só a nota que mudou sobe, inteira (upsert com onConflict user_id,id); a apagada sai; depois a base é a nuvem e não há pendente', async () => {
  const nuvem = {
    linhas: [N1, N2].map((n) => ({
      user_id: 'u1',
      id: n.id,
      titulo: n.titulo,
      texto: n.texto,
      criada_em: n.criadaEm,
      editada_em: n.editadaEm,
    })),
  };

  const ap = aparelho(nuvem, { local: [N1, N2] });

  ap.salvarNota('n2', 'par\n\nnovo');
  await ap.enviar();
  assert.deepEqual(json(nuvem.pedidos), [
    [
      'upsert',
      'notas_nota',
      [
        {
          user_id: 'u1',
          id: 'n2',
          titulo: 'Dois',
          texto: 'par\n\nnovo',
          ordem: 1,
          criada_em: N2.criadaEm,
          editada_em: ap.notaPorId('n2').editadaEm,
        },
      ],
      { onConflict: 'user_id,id' },
    ],
  ]);
  assert.equal(ap.temPendente(), false);
  assert.deepEqual(
    JSON.parse(ap.guardado.get('notas.base.u1')),
    json(ap.linhas(ap.E.db))
  );

  // nada mudou: nenhum pedido
  nuvem.pedidos = [];
  await ap.enviar();
  assert.deepEqual(nuvem.pedidos, []);

  // apagar: só o delete daquela nota, desta conta
  ap.apagarNota('n1');
  await ap.enviar();
  assert.deepEqual(json(nuvem.pedidos), [['delete', 'notas_nota', 'u1', ['n1']]]);
  assert.deepEqual(
    nuvem.linhas.map((l) => l.id),
    ['n2']
  );
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
    ['upsert', 'select']
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
