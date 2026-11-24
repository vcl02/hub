'use strict';
// Editor do PC: o CodeMirror 6 (global CM, de vendor/codemirror.js) na tela toda, com o tema escuro do hub e o Markdown
// destacado. Atalhos como no VS Code: os do CodeMirror (Ctrl+D a próxima ocorrência com vários cursores, Alt+↑/↓ move a linha,
// Ctrl+Shift+K apaga a linha, Ctrl+Z/Ctrl+Y desfazem e refazem, Ctrl+F busca) e, sem seleção, Ctrl+X recorta a linha inteira
// com a quebra e Ctrl+C copia a linha (o próprio CodeMirror faz isso no recortar/copiar sem seleção; colar essa linha a põe
// acima da linha do cursor, como no VS Code).
// Formatação ao vivo, como no Obsidian: títulos maiores, "•" no item de lista e as marcas (#, **, *, _, ~~, - * +) escondidas
// fora das linhas do cursor e da seleção; o texto salvo continua o Markdown, byte a byte (só decorações, nada muda o doc).
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
      // "&dark" só existe no tema base (EditorView.baseTheme); aqui ele derruba a criação do editor
      // ("Unsupported selector: &dark") e a nota abre vazia. O tema do hub já é o escuro.
      '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
        { backgroundColor: 'var(--fg)' },
      '.cm-content ::selection': {
        backgroundColor: 'var(--fg)',
        color: 'var(--bg)',
      },
      // Linha do cursor translúcida: ela fica por cima da camada da seleção, e com fundo opaco a parte selecionada dela
      // sumia (texto escuro da seleção sobre o fundo escuro da linha, ao selecionar de baixo para cima).
      '.cm-activeLine': {
        backgroundColor: 'color-mix(in srgb, var(--fg) 6%, transparent)',
      },
      '.cm-selectionMatch': { backgroundColor: 'var(--cor-soft)' },
      '.cm-searchMatch': {
        backgroundColor: 'var(--cor-soft)',
        outline: '1px solid var(--cor)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'var(--line-strong)',
      },
      '.cm-placeholder': { color: 'var(--muted)' },
      // Títulos # / ## / ### (#### a ###### como o ###); a cor e o negrito vêm do destaque (t.heading)
      '.cm-n-h1': { fontSize: '1.6em' },
      '.cm-n-h2': { fontSize: '1.35em' },
      '.cm-n-h3': { fontSize: '1.15em' },
      '.cm-n-item': { color: 'var(--muted)' },
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

// O "•" no lugar da marca do item (-, * ou +) de lista sem número; o espaço depois dela fica
class MarcaDoItem extends CM.WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const marca = document.createElement('span');

    marca.className = 'cm-n-item';
    marca.textContent = '•';

    return marca;
  }
}

// Os trechos [início da 1ª linha, fim da última] que o cursor ou a seleção tocam, um por faixa (vários cursores)
const linhasAtivas = (estado) =>
  estado.selection.ranges.map((r) => [
    estado.doc.lineAt(r.from).from,
    estado.doc.lineAt(r.to).to,
  ]);

const tocaAtiva = (ativas, de, ate) => ativas.some(([a, b]) => de <= b && ate >= a);

// Ênfases cujas marcas somem juntas: o elemento inteiro (que pode ocupar mais de uma linha) decide pelas linhas dele
const ENFASES = new Set(['Emphasis', 'StrongEmphasis', 'Strikethrough']);
const MARCAS_DA_ENFASE = new Set(['EmphasisMark', 'StrikethroughMark']);

// As decorações da parte visível: classe do tamanho na linha do título, marcas escondidas e o "•" fora das linhas ativas
function decoracoesMarkdown(view) {
  const { state } = view,
    ativas = linhasAtivas(state),
    marcas = [],
    vistos = new Set(); // a mesma posição duas vezes (nó que passa de uma faixa visível para a outra)

  const esconder = (de, ate) => {
    if (de < ate && !vistos.has(de)) {
      vistos.add(de);
      marcas.push(CM.Decoration.replace({}).range(de, ate));
    }
  };

  for (const { from, to } of view.visibleRanges)
    CM.syntaxTree(state).iterate({
      from,
      to,
      enter: (no) => {
        if (no.name.startsWith('ATXHeading')) {
          const linha = state.doc.lineAt(no.from),
            classe = 'cm-n-h' + Math.min(Number(no.name.slice('ATXHeading'.length)), 3);

          if (!vistos.has('h' + linha.from)) {
            vistos.add('h' + linha.from);
            marcas.push(CM.Decoration.line({ class: classe }).range(linha.from));
          }

          if (tocaAtiva(ativas, linha.from, linha.to)) return false;

          // O # do começo leva o espaço depois dele; o # de fecho (# Título #) leva o espaço antes
          for (let m = no.node.firstChild; m; m = m.nextSibling) {
            if (m.name !== 'HeaderMark') continue;

            const inicio =
              m.from === linha.from || state.sliceDoc(linha.from, m.from).trim() === '';

            if (inicio)
              esconder(m.from, state.sliceDoc(m.to, m.to + 1) === ' ' ? m.to + 1 : m.to);
            else
              esconder(
                state.sliceDoc(m.from - 1, m.from) === ' ' ? m.from - 1 : m.from,
                m.to
              );
          }

          return;
        }

        if (ENFASES.has(no.name)) {
          if (tocaAtiva(ativas, no.from, no.to)) return;

          // Só as marcas das pontas (a abertura e o fecho); as de ênfases de dentro decidem quando o iterate entrar nelas
          for (let m = no.node.firstChild; m; m = m.nextSibling)
            if (MARCAS_DA_ENFASE.has(m.name) && (m.from === no.from || m.to === no.to))
              esconder(m.from, m.to);

          return;
        }

        if (no.name === 'ListMark' && no.node.parent?.parent?.name === 'BulletList') {
          if (vistos.has(no.from)) return;
          vistos.add(no.from);
          const linha = state.doc.lineAt(no.from);

          if (!tocaAtiva(ativas, linha.from, linha.to))
            marcas.push(
              CM.Decoration.replace({ widget: new MarcaDoItem() }).range(no.from, no.to)
            );
        }
      },
    });

  return CM.Decoration.set(marcas, true);
}

// Refaz as decorações quando muda o texto, a parte visível, a seleção ou a árvore (o parser termina depois, em textos longos)
const formatacaoAoVivo = () =>
  CM.ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = decoracoesMarkdown(view);
      }

      update(u) {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          CM.syntaxTree(u.startState) !== CM.syntaxTree(u.state)
        )
          this.decorations = decoracoesMarkdown(u.view);
      }
    },
    { decorations: (p) => p.decorations }
  );

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
      formatacaoAoVivo(),
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
  aoMudarEditor = aoMudar;
  const estado = estadoDoEditor(texto, aoMudar);

  if (!editor) editor = new CM.EditorView({ parent: pai, state: estado });
  else editor.setState(estado);
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
