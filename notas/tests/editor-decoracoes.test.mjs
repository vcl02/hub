// A formatação ao vivo do editor do PC sem navegador: o editor.js e o markdown.js rodam em node:vm com o CodeMirror do vendor
// (estado e árvore do Markdown de verdade, sem tela) e decoracoesMarkdown devolve o que seria escondido, trocado ou classificado.
// O teste monta o que o usuário veria (texto sem as marcas escondidas, "•" no lugar da marca do item) a partir das decorações.
// O que depende de tela (tamanho real, Ctrl+X, desfazer, gravar) fica em editor.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NOTAS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const ler = (a) =>
  fs.readFileSync(path.join(NOTAS, a), 'utf8').replace(/^'use strict';/, '');

const ctx = vm.createContext({ navigator: { userAgent: 'node' } });

vm.runInContext(`${ler('vendor/codemirror.js')};globalThis.CM = CM;`, ctx);
vm.runInContext(
  `${ler('js/markdown.js')}\n${ler('js/editor.js')}\n;globalThis.decoracoesMarkdown = decoracoesMarkdown; globalThis.linhasAtivas = linhasAtivas; globalThis.tocaAtiva = tocaAtiva;`,
  ctx
);

const { CM, decoracoesMarkdown, linhasAtivas, tocaAtiva } = ctx;

// cursores: [[de, ate], ...] ou uma posição; o padrão é o cursor no fim do texto
function ver(doc, cursores = [[doc.length, doc.length]]) {
  const state = CM.EditorState.create({
    doc,
    selection: CM.EditorSelection.create(
      cursores.map(([a, b]) => CM.EditorSelection.range(a, b))
    ),
    extensions: [
      new CM.LanguageSupport(CM.markdownLanguage),
      CM.EditorState.allowMultipleSelections.of(true),
    ],
  });

  const set = decoracoesMarkdown({
      state,
      visibleRanges: [{ from: 0, to: doc.length }],
    }),
    escondidos = [],
    pontos = [],
    linhas = [],
    estrelas = [];

  set.between(0, doc.length, (de, ate, v) => {
    if (v.spec.widget) pontos.push([de, ate]);
    else if (v.spec.class === 'cm-n-estrela') estrelas.push([de, ate]);
    else if (v.spec.class) linhas.push([de, v.spec.class]);
    else escondidos.push([de, ate]);
  });

  // o texto visível: sem o escondido, com "•" no lugar da marca do item (o espaço depois dela fica)
  let texto = '';

  for (let i = 0; i < doc.length; i++) {
    const ponto = pontos.find(([a, b]) => i >= a && i < b);

    if (ponto) {
      if (i === ponto[0]) texto += '•';
    } else if (!escondidos.some(([a, b]) => i >= a && i < b)) texto += doc[i];
  }

  return { texto, escondidos, pontos, linhas, estrelas, state };
}

const fim = (d) => [[d.length, d.length]];
const inicio = [[0, 0]];

test('títulos: # a ###### ganham a classe da linha (#### em diante como ###) e, fora do cursor, a marca e o espaço dela somem', () => {
  const doc = [
    '# um',
    '## dois',
    '### três',
    '#### quatro',
    '##### cinco',
    '###### seis',
  ].join('\n');

  const v = ver(doc, [[doc.length, doc.length]]);

  assert.deepEqual(
    v.linhas.map(([, c]) => c),
    ['cm-n-h1', 'cm-n-h2', 'cm-n-h3', 'cm-n-h3', 'cm-n-h3', 'cm-n-h3']
  );
  assert.deepEqual(
    v.linhas.map(([de]) => doc.slice(de, de + 1)),
    ['#', '#', '#', '#', '#', '#'],
    'a classe fica no começo da linha'
  );
  // o cursor está na última linha: ela mostra a marca, as outras não
  assert.equal(v.texto, 'um\ndois\ntrês\nquatro\ncinco\n###### seis');
});

test('títulos: "#" sem espaço e "#" no meio da linha não são título; "# T #" esconde os dois # e os espaços; só o cursor na linha do título mostra a marca', () => {
  assert.deepEqual(ver('#tag\n\nx', fim('#tag\n\nx')).linhas, []);
  assert.equal(ver('#tag\n\nx', fim('#tag\n\nx')).texto, '#tag\n\nx');
  assert.deepEqual(ver('a # b').linhas, []);

  const fechado = '# T #\n\nx';

  assert.equal(ver(fechado, fim(fechado)).texto, 'T\n\nx');
  assert.equal(ver(fechado, inicio).texto, fechado);
  // o cursor no fim da linha do título e no começo dela (as pontas) também mostram
  assert.equal(ver(fechado, [[5, 5]]).texto, fechado);
  // a linha em branco entre o título e o parágrafo não é do título
  assert.equal(ver(fechado, [[6, 6]]).texto, 'T\n\nx');
});

test('listas: -, * e + viram "•" (o espaço fica); numeradas não; item aninhado também; a linha do cursor mostra a marca de verdade', () => {
  const doc = '- a\n* b\n+ c\n1. d\n2) e\n  - f\n\nfim';
  const v = ver(doc, fim(doc));

  assert.equal(v.pontos.length, 4);
  assert.equal(v.texto, '• a\n• b\n• c\n1. d\n2) e\n  • f\n\nfim');
  assert.deepEqual(
    v.pontos.map(([de, ate]) => doc.slice(de, ate)),
    ['-', '*', '+', '-']
  );

  // o cursor no item: a marca volta, os outros seguem com "•"
  assert.equal(ver(doc, [[5, 5]]).texto, '• a\n* b\n• c\n1. d\n2) e\n  • f\n\nfim');
  // lista dentro de numerada: o "-" de dentro vira "•", o número fica
  assert.equal(ver('1. a\n   - b\n\nx', [[13, 13]]).texto, '1. a\n   • b\n\nx');
  // "-" no meio do texto, regra horizontal e "*" de ênfase não são item
  assert.equal(ver('a - b\n\n---\n\n*x*', [[0, 0]]).pontos.length, 0);
});

test('ênfases: ** e __ (negrito), * e _ (itálico), ~~ (riscado) somem fora do cursor e voltam na linha dele; o texto dentro fica', () => {
  const doc = 'um **neg** e _ita_ e *it2* e ~~ris~~ e __neg2__\n\nfim';
  const v = ver(doc, fim(doc));

  assert.equal(v.texto, 'um neg e ita e it2 e ris e neg2\n\nfim');
  assert.equal(ver(doc, [[3, 3]]).texto, doc, 'cursor na linha: tudo à mostra');
  // cursor no fim da linha 1 (a posição logo depois do último caractere) ainda é a linha
  assert.equal(ver(doc, [[doc.indexOf('\n'), doc.indexOf('\n')]]).texto, doc);
  // ênfase aninhada: negrito com itálico dentro
  assert.equal(ver('**a *b* c**\n\nx', [[13, 13]]).texto, 'a b c\n\nx');
  // asterisco solto, que não fecha, não vira marca nenhuma
  assert.equal(ver('2 * 3 * 4\n\nx', [[11, 11]]).texto, '2 * 3 * 4\n\nx');
});

test('ênfase que passa de uma linha: o cursor em qualquer das linhas dela mostra as marcas das duas pontas; em outra linha, somem', () => {
  const doc = '**a\nb**\n\nz';

  assert.equal(ver(doc, [[0, 0]]).texto, doc);
  assert.equal(ver(doc, [[5, 5]]).texto, doc);
  assert.equal(ver(doc, [[doc.length, doc.length]]).texto, 'a\nb\n\nz');
});

test('seleção: a seleção de várias linhas mostra as marcas de todas as linhas que ela toca (do começo da 1ª ao fim da última), as de fora somem', () => {
  const doc = '# a\n**b**\n- c\n_d_\n## e';
  const sel = [[doc.indexOf('b'), doc.indexOf('c')]]; // da linha 2 à 3

  assert.equal(ver(doc, sel).texto, 'a\n**b**\n- c\nd\ne');
  // seleção só dentro de uma palavra: a linha toda conta
  assert.equal(ver(doc, [[6, 7]]).texto, 'a\n**b**\n• c\nd\ne');
  // seleção de tudo: nada some
  assert.equal(ver(doc, [[0, doc.length]]).texto, doc);
});

test('vários cursores: cada um mostra a própria linha e só ele; cursor duplo na mesma linha não duplica nada', () => {
  const doc = '# a\n**b**\n- c\n_d_';

  assert.equal(
    ver(doc, [
      [0, 0],
      [doc.indexOf('_d_'), doc.indexOf('_d_')],
    ]).texto,
    '# a\nb\n• c\n_d_'
  );
  assert.equal(
    ver(doc, [
      [1, 1],
      [2, 2],
    ]).texto,
    '# a\nb\n• c\nd'
  );
  assert.equal(
    ver(doc, [
      [0, 0],
      [5, 5],
      [11, 11],
    ]).texto,
    '# a\n**b**\n- c\nd'
  );
  // as decorações não repetem a mesma posição (o editor recusaria duas trocas iguais)
  const v = ver(doc, fim(doc));
  const chaves = v.escondidos.map(([a]) => a);

  assert.equal(new Set(chaves).size, chaves.length);
});

test('linhasAtivas e tocaAtiva: um trecho [início da 1ª linha, fim da última] por cursor; tocar é interseção com as pontas incluídas', () => {
  const state = CM.EditorState.create({
    doc: 'ab\ncd\nef',
    selection: CM.EditorSelection.create(
      [CM.EditorSelection.range(1, 4), CM.EditorSelection.cursor(8)],
      0
    ),
    extensions: [CM.EditorState.allowMultipleSelections.of(true)],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(linhasAtivas(state))), [
    [0, 5],
    [6, 8],
  ]);
  assert.equal(tocaAtiva([[0, 5]], 5, 9), true);
  assert.equal(tocaAtiva([[0, 5]], 6, 9), false);
  assert.equal(tocaAtiva([[6, 8]], 0, 5), false);
  assert.equal(tocaAtiva([], 0, 5), false);
});

test('estrela do favorito: a última linha do parágrafo com " ★" ganha a cor só no ★ quando o cursor está fora; no meio do parágrafo, em código e com o cursor nela, não', () => {
  const doc = 'a ★\n\nb\nc ★\n\nd ★ x\n\n```\ne ★\n```\n\nf ★\ng';

  const v = ver(doc, inicio),
    marcas = v.estrelas.map(([de, ate]) => [
      doc.slice(de, ate),
      doc.slice(0, de).split('\n').length,
    ]);

  // o cursor está na linha 1 ("a ★"): sem cor; "c ★" (última do parágrafo) sim; "d ★ x" não termina em ★; código não; "f ★" tem "g" colada embaixo
  assert.deepEqual(marcas, [['★', 4]]);
  // com o cursor longe de tudo, a "a ★" também
  const longe = ver(doc, [[doc.length, doc.length]]);

  assert.deepEqual(
    longe.estrelas.map(([de]) => doc.slice(0, de).split('\n').length),
    [1, 4]
  );
  // a decoração não esconde nem troca nada: o ★ continua no texto
  assert.equal(longe.texto.includes('a ★'), true);
  // cursor na linha de "c ★": só a de "a ★"
  assert.deepEqual(
    ver(doc, [[doc.indexOf('c ★'), doc.indexOf('c ★')]]).estrelas.map(
      ([de]) => doc.slice(0, de).split('\n').length
    ),
    [1]
  );
});

test('estrela do favorito: dentro de bloco de código, mesmo na última linha antes de uma linha em branco do próprio bloco, não ganha cor', () => {
  const doc = 'x\n\n```\ne ★\n\ny\n```\n\n~~~\nf ★\n\n~~~\n\nz ★';
  const v = ver(doc, inicio);

  assert.deepEqual(
    v.estrelas.map(([de]) => doc.slice(0, de).split('\n').length),
    [14],
    'só o "z ★" fora dos blocos'
  );
});

test('o texto do doc nunca muda: as decorações são só classes, trocas visuais e "•" de widget; nenhuma insere texto', () => {
  const doc = '# t\n\n- **a** _b_ ~~c~~\n1. d\n\nx ★\n';

  const state = CM.EditorState.create({
    doc,
    extensions: [new CM.LanguageSupport(CM.markdownLanguage)],
  });

  const set = decoracoesMarkdown({ state, visibleRanges: [{ from: 0, to: doc.length }] });

  set.between(0, doc.length, (de, ate, v) => {
    if (v.spec.widget) assert.equal(doc.slice(de, ate).length, 1);
    assert.ok(de <= ate && ate <= doc.length);
  });
  assert.equal(state.doc.toString(), doc);
});
