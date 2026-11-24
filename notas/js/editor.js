'use strict';
// Editor do PC: o CodeMirror 6 (global CM, de vendor/codemirror.js) na tela toda, com o tema escuro do hub e o Markdown
// destacado. Atalhos como no VS Code: os do CodeMirror (Ctrl+D a próxima ocorrência com vários cursores, Alt+↑/↓ move a linha,
// Ctrl+Shift+K apaga a linha, Ctrl+Z/Ctrl+Y desfazem e refazem, Ctrl+F busca) e, sem seleção, Ctrl+X recorta a linha inteira
// com a quebra e Ctrl+C copia a linha (o próprio CodeMirror faz isso no recortar/copiar sem seleção; colar essa linha a põe
// acima da linha do cursor, como no VS Code).
// Só as cores da base (var(--…) de ../base/tokens.css).

let editor = null; // o EditorView, criado na 1ª nota aberta no modo editor

const temaEditor = () =>
  CM.EditorView.theme(
    {
      '&': {
        height: '100%',
        color: 'var(--fg)',
        backgroundColor: 'var(--bg)',
        fontSize: 'var(--t-md)',
      },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': {
        fontFamily:
          "ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
        lineHeight: '1.6',
      },
      '.cm-content': {
        padding: 'var(--e-4) 0 40vh',
        caretColor: 'var(--cor)',
      },
      '.cm-line': { padding: '0 var(--e-5)' },
      '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--cor)' },
      '&dark .cm-selectionBackground, &dark.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
        { backgroundColor: 'var(--fg)' },
      '.cm-content ::selection': {
        backgroundColor: 'var(--fg)',
        color: 'var(--bg)',
      },
      '.cm-activeLine': { backgroundColor: 'var(--surface)' },
      '.cm-selectionMatch': { backgroundColor: 'var(--cor-soft)' },
      '.cm-searchMatch': {
        backgroundColor: 'var(--cor-soft)',
        outline: '1px solid var(--cor)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'var(--line-strong)',
      },
      '.cm-placeholder': { color: 'var(--muted)' },
      '.cm-panels': {
        backgroundColor: 'var(--surface)',
        color: 'var(--fg)',
        fontFamily: 'var(--body)',
      },
      '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--line)' },
      '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
      '.cm-textfield': {
        backgroundColor: 'var(--bg)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-sm)',
        color: 'var(--fg)',
      },
      '.cm-button': {
        backgroundImage: 'none',
        backgroundColor: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-sm)',
        color: 'var(--fg)',
      },
    },
    { dark: true }
  );

// Markdown: títulos na cor do módulo, ênfases de verdade, marcas (#, **, `, >) e endereços em cinza, código com fundo
const destaqueMarkdown = () => {
  const t = CM.tags;

  return CM.HighlightStyle.define([
    { tag: t.heading, color: 'var(--cor)', fontWeight: '700' },
    { tag: t.strong, fontWeight: '700' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.link, textDecoration: 'underline' },
    {
      tag: [t.url, t.processingInstruction, t.contentSeparator, t.meta],
      color: 'var(--muted)',
    },
    { tag: t.quote, color: 'var(--muted)', fontStyle: 'italic' },
    { tag: t.monospace, backgroundColor: 'var(--surface-2)' },
  ]);
};

// Um estado novo do editor para o texto (desfazer começa do zero a cada nota); aoMudar(texto) a cada mudança no texto
function estadoDoEditor(texto, aoMudar) {
  return CM.EditorState.create({
    doc: texto,
    extensions: [
      CM.highlightSpecialChars(),
      CM.history(),
      CM.drawSelection(),
      CM.dropCursor(),
      CM.EditorState.allowMultipleSelections.of(true),
      CM.indentOnInput(),
      CM.bracketMatching(),
      CM.rectangularSelection(),
      CM.crosshairCursor(),
      CM.highlightActiveLine(),
      CM.highlightSelectionMatches(),
      CM.search({ top: true }),
      CM.EditorView.lineWrapping,
      new CM.LanguageSupport(CM.markdownLanguage),
      CM.syntaxHighlighting(destaqueMarkdown()),
      temaEditor(),
      CM.placeholder('Escreva em Markdown…'),
      CM.EditorView.contentAttributes.of({ 'aria-label': 'Texto da nota' }),
      CM.Prec.high(CM.keymap.of(CM.markdownKeymap)), // Enter continua a lista; Backspace tira a marca
      CM.keymap.of([
        ...CM.defaultKeymap,
        ...CM.searchKeymap,
        ...CM.historyKeymap,
        CM.indentWithTab,
      ]),
      CM.EditorView.updateListener.of((u) => {
        if (u.docChanged) aoMudar(u.state.doc.toString());
      }),
    ],
  });
}

let aoMudarEditor = () => {}; // o aoMudar da nota aberta, para o estado novo do texto que vem da nuvem

// Mostra o texto no editor (cria o editor na 1ª vez, dentro de pai)
function abrirNoEditor(pai, texto, aoMudar) {
  if (!editor) editor = new CM.EditorView({ parent: pai });
  aoMudarEditor = aoMudar;
  editor.setState(estadoDoEditor(texto, aoMudar));
}

const textoDoEditor = () => (editor ? editor.state.doc.toString() : '');

// Texto que chegou de fora (a nuvem) com a nota aberta e nada digitado: um estado novo (fora do desfazer, que começa do
// zero: Ctrl+Z nunca traz de volta o texto velho, que a gravação automática mandaria por cima do novo), com o cursor e a
// rolagem onde estavam (o que couber no texto novo). setState não avisa o updateListener: nada é gravado de volta.
function trocarTextoDoEditor(texto) {
  if (!editor || editor.state.doc.toString() === texto) return;

  const cursor = Math.min(editor.state.selection.main.head, texto.length),
    rolagem = editor.scrollDOM.scrollTop,
    focado = editor.hasFocus;

  editor.setState(estadoDoEditor(texto, aoMudarEditor));
  editor.dispatch({ selection: { anchor: cursor } });
  editor.scrollDOM.scrollTop = rolagem;

  if (focado) editor.focus();
}
