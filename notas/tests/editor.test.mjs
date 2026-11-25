// O editor do PC no navegador (o CodeMirror do vendor, de verdade): Ctrl+D faz vários cursores, Ctrl+X sem seleção recorta a
// linha inteira (com a quebra), o Esc desfaz os vários cursores antes de sair, e o texto grava sozinho e chega à nuvem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { andarAte } from '../../tests/relogio.mjs';
import { prepararApp, abrirApp, novaNuvem, sincronizado, DONO } from './helpers/app.mjs';

prepararApp();

const doc = (pg) => pg.evaluate(() => editor.state.doc.toString());

test('PC: a nota abre no editor; Ctrl+D seleciona as ocorrências com vários cursores, Ctrl+X sem seleção recorta a linha inteira (colar a põe acima) e o texto grava sozinho na nuvem', async () => {
  const { ctx, pg, erros, nuvem } = await abrirApp({ pc: true });

  await pg.click('#n-nova');
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  await pg.fill('#n-titulo', 'Teste do editor');

  // O campo do título cabe no h1 (passando dele, o ellipsis do h1 o trocava inteiro por "…")
  const [h1, campo] = await pg.$$eval('.nota-titulo, #n-titulo', (L) =>
    L.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, direita: r.right }))
  );

  assert.ok(
    campo.x >= h1.x && campo.direita <= h1.direita + 0.5,
    JSON.stringify({ h1, campo })
  );

  // Com o foco, nada de contorno (o h1 o cortava e sobrava uma barra no começo, parecendo o cursor): um sublinhado
  await pg.focus('#n-titulo');
  assert.deepEqual(
    await pg.$eval('#n-titulo', (i) => {
      const e = getComputedStyle(i);

      return [i.matches(':focus-visible'), e.outlineStyle, e.boxShadow.includes('inset')];
    }),
    [true, 'none', true]
  );
  await pg.locator('.cm-content').click();
  assert.equal(await pg.isHidden('#conversa'), true);
  assert.equal(
    await pg.evaluate(() => document.activeElement.classList.contains('cm-content')),
    true
  ); // nota nova: já pronta para escrever

  await pg.keyboard.type('foo um\nfoo dois\nfim');

  // Ctrl+D duas vezes: as duas ocorrências de "foo", um cursor em cada; digitar troca as duas
  await pg.keyboard.press('Control+Home');
  await pg.keyboard.press('Control+d');
  await pg.keyboard.press('Control+d');
  assert.equal(await pg.evaluate(() => editor.state.selection.ranges.length), 2);
  await pg.keyboard.type('bar');
  assert.equal(await doc(pg), 'bar um\nbar dois\nfim');

  // Esc: primeiro desfaz os vários cursores (a nota continua aberta)
  await pg.keyboard.press('Escape');
  assert.equal(await pg.evaluate(() => editor.state.selection.ranges.length), 1);
  assert.equal(await pg.isVisible('#v-nota'), true);

  // Ctrl+X sem seleção: sai a linha do cursor inteira, com a quebra, e ela vai para a área de transferência; colar (com o
  // cursor no meio de outra linha) a põe inteira acima dessa linha, como no VS Code
  await pg.keyboard.press('Control+Home');
  await pg.keyboard.press('ArrowDown');
  await pg.keyboard.press('Control+x');
  assert.equal(await doc(pg), 'bar um\nfim');
  assert.equal(await pg.evaluate(() => navigator.clipboard.readText()), 'bar dois');
  await pg.keyboard.press('Control+End');
  await pg.keyboard.press('ArrowLeft');
  await pg.keyboard.press('Control+v');
  assert.equal(await doc(pg), 'bar um\nbar dois\nfim');

  // grava sozinho 0,8 s depois de parar de digitar e envia
  await andarAte(pg, () => notaPorId(aberta).texto === 'bar um\nbar dois\nfim');
  assert.equal(await pg.inputValue('#n-titulo'), 'Teste do editor');
  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.notas_nota.map((l) => l.texto),
    ['bar um\nbar dois\nfim']
  );
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('PC: abrir outra nota não substitui seu texto pelo da nota anterior', async () => {
  const { ctx, pg } = await abrirApp({ pc: true });

  await pg.click('#n-nova');
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  await pg.keyboard.type('primeira nota');
  await andarAte(pg, () => notaPorId(aberta).texto === 'primeira nota');
  await pg.click('#n-voltar');
  await pg.waitForSelector('#v-lista:not([hidden])');

  await pg.click('#n-nova');
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  await pg.keyboard.type('segunda nota');
  const segunda = await pg.evaluate(() => aberta);

  await andarAte(pg, () => notaPorId(aberta).texto === 'segunda nota');
  await pg.click('#n-voltar');
  await pg.waitForSelector('#v-lista:not([hidden])');

  const primeira = await pg.evaluate(
    () => db.notas.find((n) => n.texto === 'primeira nota').id
  );

  await pg.click(`#n-lista li[data-id="${primeira}"] a.oque`);
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');

  assert.equal(await doc(pg), 'primeira nota');
  assert.equal(await pg.evaluate((id) => notaPorId(id).texto, primeira), 'primeira nota');

  await pg.click('#n-voltar');
  await pg.waitForSelector('#v-lista:not([hidden])');
  await pg.click(`#n-lista li[data-id="${segunda}"] a.oque`);
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  assert.equal(await doc(pg), 'segunda nota');

  await ctx.close();
});

test('PC: abrir uma nota preexistente mantém o texto no editor', async () => {
  const texto = 'Conteúdo original',
    nuvem = novaNuvem([
      {
        user_id: DONO,
        id: 'antiga',
        titulo: 'Nota antiga',
        texto: 'Conteúdo original',
        criada_em: '2026-11-23T10:00:00+00:00',
        editada_em: '2026-11-23T10:00:00+00:00',
      },
    ]),
    { ctx, pg, erros } = await abrirApp({ pc: true, nuvem });

  assert.equal(await pg.textContent('#n-lista li[data-id="antiga"] b'), 'Nota antiga');
  await pg.click('#n-lista li[data-id="antiga"] a.oque');
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  assert.equal(await doc(pg), texto);
  assert.equal(await pg.inputValue('#n-titulo'), 'Nota antiga');

  await pg.clock.runFor(1000);
  assert.equal(await pg.evaluate(() => notaPorId('antiga').texto), texto);

  await pg.click('#n-voltar');
  await pg.waitForSelector('#v-lista:not([hidden])');
  assert.equal(await pg.locator('#n-lista li[data-id="antiga"]').count(), 1);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('PC: nota só com título continua na lista', async () => {
  const { ctx, pg } = await abrirApp({ pc: true });

  await pg.click('#n-nova');
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  await pg.fill('#n-titulo', 'Só título');
  await pg.click('#n-voltar');
  await pg.waitForSelector('#v-lista:not([hidden])');

  assert.equal(await pg.textContent('#n-lista .oque b'), 'Só título');
  await pg.click('#n-lista .oque');
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  assert.equal(await pg.inputValue('#n-titulo'), 'Só título');
  assert.equal(await doc(pg), '');

  await ctx.close();
});

test('PC: Ctrl+S grava o Markdown aberto sem acionar salvar página', async () => {
  const { ctx, pg } = await abrirApp({ pc: true });

  await pg.click('#n-nova');
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  await pg.keyboard.type('# nota salva');
  await pg.evaluate(() => {
    document.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey && ev.key.toLowerCase() === 's')
        window.ctrlSSalvoPreventDefault = ev.defaultPrevented;
    });
  });

  await pg.keyboard.press('Control+s');

  assert.equal(await pg.evaluate(() => notaPorId(aberta).texto), '# nota salva');
  assert.equal(await pg.evaluate(() => window.ctrlSSalvoPreventDefault), true);

  await ctx.close();
});

test('PC: a seleção no editor tem fundo claro e texto escuro', async () => {
  const { ctx, pg } = await abrirApp({ pc: true });

  await pg.click('#n-nova');
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  await pg.keyboard.type('texto selecionado');
  await pg.keyboard.press('Control+Home');
  await pg.keyboard.press('Shift+End');
  await pg.clock.runFor(100); // relógio pausado: deixa o editor desenhar a camada da seleção

  assert.deepEqual(
    await pg.evaluate(() => {
      const selecao = editor.dom.querySelector('.cm-selectionBackground');

      return [
        getComputedStyle(selecao).backgroundColor,
        getComputedStyle(editor.contentDOM.querySelector('.cm-line'), '::selection')
          .color, // o texto fica nas linhas
      ];
    }),
    ['rgb(233, 236, 239)', 'rgb(27, 30, 33)']
  );

  // Selecionando de baixo para cima, o cursor fica na 1ª linha (a linha do cursor, que fica por cima da seleção): o
  // fundo dela tem de deixar o claro da seleção passar, senão o texto escuro selecionado some no fundo escuro
  await pg.keyboard.press('End');
  await pg.keyboard.type('\nsegunda linha');
  await pg.keyboard.press('Shift+Control+Home');
  await pg.clock.runFor(100);

  const linhaDoCursor = await pg.evaluate(
    () =>
      getComputedStyle(editor.contentDOM.querySelector('.cm-activeLine')).backgroundColor
  );

  // A opacidade do fundo: "color(srgb … / 0.06)" ou "rgba(…, 0.06)"; rgb() sem alfa é opaco
  const m = linhaDoCursor.match(/\/\s*([\d.]+)\)$|rgba\([^)]*,\s*([\d.]+)\)$/);
  const alfa = m ? Number(m[1] ?? m[2]) : 1;

  assert.ok(alfa < 0.1, linhaDoCursor);

  await ctx.close();
});

test('PC: a troca vinda da nuvem não agenda gravação e não entra no desfazer (Ctrl+Z não traz o texto velho)', async () => {
  const nuvem = novaNuvem([
      {
        user_id: DONO,
        id: 'n1',
        titulo: 'T',
        texto: 'velho',
        criada_em: '2026-11-23T10:00:00+00:00',
        editada_em: '2026-11-23T10:00:00+00:00',
      },
    ]),
    { ctx, pg, erros } = await abrirApp({ pc: true, busca: '?nota=n1', nuvem });

  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  nuvem.tabelas.notas_nota[0].texto = 'novo da nuvem';
  await pg.evaluate(() => carregar(usuario, mostrar));
  assert.equal(await doc(pg), 'novo da nuvem');
  assert.equal(await pg.evaluate(() => tSalvar), null); // nada agendado para gravar de volta

  await pg.locator('.cm-content').click();
  await pg.keyboard.press('Control+z');
  await pg.clock.runFor(1000);
  assert.equal(await doc(pg), 'novo da nuvem');
  assert.equal(await pg.evaluate(() => notaPorId('n1').texto), 'novo da nuvem');
  await sincronizado(pg);
  assert.equal(nuvem.tabelas.notas_nota[0].texto, 'novo da nuvem');
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('PC: Ctrl+C sem seleção copia a linha inteira e o texto não muda', async () => {
  const { ctx, pg } = await abrirApp({ pc: true });

  await pg.click('#n-nova');
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  await pg.keyboard.type('um\ndois\ntres');
  await pg.keyboard.press('ArrowUp');
  await pg.keyboard.press('Control+c');
  assert.equal(await pg.evaluate(() => navigator.clipboard.readText()), 'dois');
  assert.equal(await doc(pg), 'um\ndois\ntres');
  await ctx.close();
});

// ---------- formatação ao vivo (decorações do js/editor.js; as regras finas estão em editor-decoracoes.test.mjs) ----------
const umaNota = (texto) =>
  novaNuvem([
    {
      user_id: DONO,
      id: 'n1',
      titulo: 'T',
      texto,
      criada_em: '2026-11-23T10:00:00+00:00',
      editada_em: '2026-11-23T10:00:00+00:00',
    },
  ]);

const linhasVistas = (pg) =>
  pg.$$eval('.cm-content .cm-line', (L) => L.map((l) => l.textContent));

const TEXTO_VIVO =
  '# Grande\n## Medio\n### Pequeno\n#### Quatro\n\n- item **neg** e _ita_ e ~~ris~~\n* outro\n+ mais\n1. numerado\n\nfim';

test('PC: formatação ao vivo — títulos maiores na cor, "•" nos itens, marcas somem fora das linhas do cursor e voltam nelas, e o texto gravado é o Markdown puro byte a byte', async () => {
  const nuvem = umaNota(TEXTO_VIVO),
    { ctx, pg, erros } = await abrirApp({ pc: true, busca: '?nota=n1', nuvem });

  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  await pg.locator('.cm-content').click();
  await pg.keyboard.press('Control+End'); // cursor em "fim", longe de tudo

  assert.deepEqual(await linhasVistas(pg), [
    'Grande',
    'Medio',
    'Pequeno',
    'Quatro',
    '',
    '• item neg e ita e ris',
    '• outro',
    '• mais',
    '1. numerado',
    '',
    'fim',
  ]);

  // classes e tamanhos: h1 > h2 > h3, e #### é igual ao ###; a cor é a do módulo (var(--cor)) e o texto comum é menor
  const t = await pg.evaluate(() => {
    const L = [...document.querySelectorAll('.cm-content .cm-line')],
      textoDe = (l) => {
        const w = document.createTreeWalker(l, NodeFilter.SHOW_TEXT);

        while (w.nextNode())
          if (w.currentNode.data.trim()) return w.currentNode.parentElement;

        return l;
      },
      px = (e) => parseFloat(getComputedStyle(e).fontSize),
      sonda = document.createElement('i');

    sonda.style.color = 'var(--cor)';
    document.body.append(sonda);

    const cor = getComputedStyle(sonda).color;

    sonda.remove();

    return {
      classes: L.slice(0, 4).map((l) => l.className.match(/cm-n-h\d/)?.[0]),
      tam: L.slice(0, 4).map(px),
      base: px(L[10]),
      cores: L.slice(0, 4).map((l) => getComputedStyle(textoDe(l)).color),
      cor,
      pesos: L.slice(0, 4).map((l) => getComputedStyle(textoDe(l)).fontWeight),
      ponto: getComputedStyle(L[5].querySelector('.cm-n-item')).color,
      neg: getComputedStyle(L[5].querySelector('span[class]:not(.cm-n-item)') || L[5])
        .fontWeight,
    };
  });

  assert.deepEqual(t.classes, ['cm-n-h1', 'cm-n-h2', 'cm-n-h3', 'cm-n-h3']);
  assert.ok(
    t.tam[0] > t.tam[1] && t.tam[1] > t.tam[2] && t.tam[2] > t.base,
    JSON.stringify(t)
  );
  assert.equal(t.tam[3], t.tam[2]);
  assert.deepEqual(t.cores, [t.cor, t.cor, t.cor, t.cor]);
  assert.deepEqual(t.pesos, ['700', '700', '700', '700']);

  // ênfases de verdade: negrito, itálico e riscado no DOM
  assert.deepEqual(
    await pg.$$eval('.cm-line:nth-child(6) span', (S) =>
      S.map((s) => {
        const e = getComputedStyle(s);

        return [s.textContent, e.fontWeight, e.fontStyle, e.textDecorationLine];
      }).filter(([x]) => ['neg', 'ita', 'ris'].includes(x))
    ),
    [
      ['neg', '700', 'normal', 'none'],
      ['ita', '400', 'italic', 'none'],
      ['ris', '400', 'normal', 'line-through'],
    ]
  );

  // o cursor numa linha mostra as marcas dela (e só dela): título, e depois o item
  await pg.keyboard.press('Control+Home');
  assert.deepEqual((await linhasVistas(pg)).slice(0, 3), [
    '# Grande',
    'Medio',
    'Pequeno',
  ]);
  await pg.keyboard.press('ArrowDown');
  await pg.keyboard.press('ArrowDown');
  await pg.keyboard.press('ArrowDown');
  await pg.keyboard.press('ArrowDown');
  await pg.keyboard.press('ArrowDown');
  assert.deepEqual((await linhasVistas(pg)).slice(0, 7), [
    'Grande',
    'Medio',
    'Pequeno',
    'Quatro',
    '',
    '- item **neg** e _ita_ e ~~ris~~',
    '• outro',
  ]);

  // seleção de várias linhas: mostra todas que toca; uma seleção só dentro da linha do item também mostra a dela
  await pg.keyboard.press('Control+Home');
  await pg.keyboard.press('Shift+ArrowDown');
  await pg.keyboard.press('Shift+ArrowDown');
  assert.deepEqual((await linhasVistas(pg)).slice(0, 4), [
    '# Grande',
    '## Medio',
    '### Pequeno',
    'Quatro',
  ]);

  // dois cursores (Ctrl+D em "item" e "outro" não; usa Alt+clique do CodeMirror pelo estado): cada linha mostra a sua
  await pg.evaluate(() => {
    const d = editor.state.doc,
      a = d.line(2).from,
      b = d.line(7).from;

    editor.dispatch({
      selection: CM.EditorSelection.create([
        CM.EditorSelection.cursor(a),
        CM.EditorSelection.cursor(b),
      ]),
    });
  });
  assert.deepEqual(await linhasVistas(pg), [
    'Grande',
    '## Medio',
    'Pequeno',
    'Quatro',
    '',
    '• item neg e ita e ris',
    '* outro',
    '• mais',
    '1. numerado',
    '',
    'fim',
  ]);

  // nada disso mexeu no texto: o documento e a nota gravada são o Markdown original, byte a byte
  assert.equal(await doc(pg), TEXTO_VIVO);
  await pg.locator('.cm-content').click();
  await pg.keyboard.press('Control+End');
  await pg.keyboard.type('!');
  await andarAte(pg, () => notaPorId('n1').texto.endsWith('fim!'));
  await sincronizado(pg);
  assert.equal(nuvem.tabelas.notas_nota[0].texto, TEXTO_VIVO + '!');
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('PC: Ctrl+X na linha de um título formatado recorta o Markdown inteiro (com as marcas escondidas e a quebra) e Ctrl+Z devolve o texto byte a byte', async () => {
  const texto = '## Título **forte**\n- item\nfim',
    { ctx, pg, erros } = await abrirApp({
      pc: true,
      busca: '?nota=n1',
      nuvem: umaNota(texto),
    });

  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  await pg.locator('.cm-content').click();
  await pg.keyboard.press('Control+End'); // linhas de cima formatadas
  await pg.keyboard.press('Control+Home'); // cursor na 1ª: as marcas aparecem
  await pg.keyboard.press('ArrowDown'); // vai para o item: o título volta a ficar formatado
  assert.equal((await linhasVistas(pg))[0], 'Título forte');
  await pg.keyboard.press('ArrowUp');
  await pg.keyboard.press('ArrowDown');
  await pg.keyboard.press('ArrowUp');
  await pg.keyboard.press('Control+x');
  assert.equal(
    await pg.evaluate(() => navigator.clipboard.readText()),
    '## Título **forte**'
  );
  assert.equal(await doc(pg), '- item\nfim');
  assert.deepEqual((await linhasVistas(pg)).slice(0, 2), ['- item', 'fim']);

  await pg.keyboard.press('Control+z');
  assert.equal(await doc(pg), texto);
  await pg.keyboard.press('Control+End');
  assert.equal((await linhasVistas(pg))[0], 'Título forte');
  assert.equal(await doc(pg), texto);
  assert.deepEqual(erros, []);
  await ctx.close();
});

// ---------- favoritas no editor ----------
test('PC: Alt+S favorita o parágrafo do cursor (a ★ fica na cor fora da linha), o botão acende e tira, Ctrl+Z desfaz, e desativa no bloco de código; vários cursores favoritam todos de uma vez', async () => {
  const texto = 'um\nlinha\n\ndois\n\n```\ncodigo\n```',
    nuvem = umaNota(texto),
    { ctx, pg, erros } = await abrirApp({ pc: true, busca: '?nota=n1', nuvem });

  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  await pg.locator('.cm-content').click();
  await pg.keyboard.press('Control+Home');

  const botao = (n) =>
    pg.$eval(n, (b) => [b.disabled, b.getAttribute('aria-pressed'), b.title]);

  assert.deepEqual(await botao('#n-favorito'), [
    false,
    'false',
    'Favoritar o parágrafo (Alt+S)',
  ]);

  // Alt+S pelo código da tecla (no Mac, Alt+S digita "ß"): põe " ★" no fim do parágrafo (2 linhas), o resto igual
  await pg.keyboard.press('Alt+s');
  assert.equal(await doc(pg), 'um\nlinha ★\n\ndois\n\n```\ncodigo\n```');
  assert.deepEqual(await botao('#n-favorito'), [
    false,
    'true',
    'Tirar das favoritas (Alt+S)',
  ]);
  assert.equal(await pg.textContent('.toast, #toast').catch(() => ''), 'Nas favoritas.');

  // com o cursor em outro parágrafo, a ★ do primeiro fica na cor e o botão volta a "favoritar"
  await pg.keyboard.press('Control+End');
  await pg.keyboard.press('ArrowUp'); // dentro do bloco de código
  assert.equal((await botao('#n-favorito'))[0], true, 'bloco de código: desativado');

  await pg.keyboard.press('Control+Home');
  await pg.keyboard.press('ArrowDown');
  await pg.keyboard.press('ArrowDown');
  await pg.keyboard.press('ArrowDown'); // "dois"
  assert.equal((await botao('#n-favorito'))[1], 'false');
  assert.deepEqual(
    await pg.$$eval('.cm-n-estrela', (E) => {
      const sonda = document.createElement('i');

      sonda.style.color = 'var(--cor)';
      document.body.append(sonda);

      const cor = getComputedStyle(sonda).color;

      sonda.remove();

      return E.map((e) => [e.textContent, getComputedStyle(e).color === cor]);
    }),
    [['★', true]]
  );

  // dois cursores, um favorito e outro não: Alt+S favorita os dois; de novo, tira os dois
  await pg.evaluate(() => {
    const d = editor.state.doc;

    editor.dispatch({
      selection: CM.EditorSelection.create([
        CM.EditorSelection.cursor(d.line(1).from),
        CM.EditorSelection.cursor(d.line(4).from),
      ]),
    });
  });
  await pg.keyboard.press('Alt+s');
  assert.equal(await doc(pg), 'um\nlinha ★\n\ndois ★\n\n```\ncodigo\n```');
  await pg.keyboard.press('Alt+s');
  assert.equal(await doc(pg), texto);

  // no Mac, Alt+S digita "ß": vale o código da tecla (KeyS), não o caractere
  await pg.evaluate(() =>
    editor.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ß',
        code: 'KeyS',
        altKey: true,
        bubbles: true,
      })
    )
  );
  assert.equal(await doc(pg), 'um\nlinha ★\n\ndois ★\n\n```\ncodigo\n```');
  await pg.keyboard.press('Alt+s');
  assert.equal(await doc(pg), texto);

  // o botão faz o mesmo e devolve o foco ao editor; Ctrl+Z desfaz a marca
  await pg.click('#n-favorito');
  assert.equal(await doc(pg), 'um\nlinha ★\n\ndois ★\n\n```\ncodigo\n```');
  assert.equal(
    await pg.evaluate(() => document.activeElement.classList.contains('cm-content')),
    true
  );
  await pg.keyboard.press('Control+z');
  assert.equal(await doc(pg), texto);

  // grava como digitar: a nota na nuvem tem a marca
  await pg.keyboard.press('Alt+s');
  await andarAte(pg, () => notaPorId('n1').texto.includes('★'));
  await sincronizado(pg);
  assert.equal(
    nuvem.tabelas.notas_nota[0].texto,
    'um\nlinha ★\n\ndois ★\n\n```\ncodigo\n```'
  );
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('PC: abrir um balão da Favoritas leva ao editor com o cursor no começo do parágrafo favorito', async () => {
  const texto = 'um\n\ndois\n\ntrês ★',
    { ctx, pg, erros } = await abrirApp({
      pc: true,
      busca: '?nota=favoritas',
      nuvem: umaNota(texto),
    });

  await pg.waitForSelector('#v-fav:not([hidden]) #f-baloes li.balao');
  assert.equal(await pg.textContent('#f-baloes li.balao .de'), 'T');
  await pg.click('#f-baloes li.balao');
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  assert.equal(
    await pg.evaluate(() => editor.state.selection.main.head),
    texto.indexOf('três')
  );
  assert.equal(await doc(pg), texto);
  assert.deepEqual(erros, []);
  await ctx.close();
});

// ---------- botão do meio, Alt e Ctrl+↑/↓ ----------
const abrirComTexto = async (texto) => {
  const r = await abrirApp({ pc: true, busca: '?nota=n1', nuvem: umaNota(texto) });

  await r.pg.waitForSelector('#editor:not([hidden]) .cm-content');

  return r;
};

const centroDaLinha = (pg, n) =>
  pg.evaluate((i) => {
    const linhas = document.querySelectorAll('.cm-content .cm-line'),
      r = linhas[i].getBoundingClientRect();

    return { x: r.left + 40, y: r.top + r.height / 2 };
  }, n);

test('PC: arrastar com o botão do meio por 3 linhas faz um cursor por linha na mesma coluna e o mousedown não rola sozinho (defaultPrevented); Alt+arrastar com o esquerdo também faz coluna; o esquerdo puro não', async () => {
  const { ctx, pg, erros } = await abrirComTexto(
    'abcdefgh\nabcdefgh\nabcdefgh\nabcdefgh'
  );

  await pg.evaluate(() => {
    window.padraoEvitado = [];
    document.addEventListener('mousedown', (e) =>
      window.padraoEvitado.push([e.button, e.defaultPrevented])
    );
  });

  const a = await centroDaLinha(pg, 0),
    b = await centroDaLinha(pg, 2);

  await pg.mouse.move(a.x, a.y);
  await pg.mouse.down({ button: 'middle' });
  await pg.mouse.move(b.x, (a.y + b.y) / 2, { steps: 3 });
  await pg.mouse.move(b.x, b.y, { steps: 3 });
  await pg.mouse.up({ button: 'middle' });

  const sel = await pg.evaluate(() =>
    editor.state.selection.ranges.map((r) => [
      editor.state.doc.lineAt(r.head).number,
      r.head - editor.state.doc.lineAt(r.head).from,
    ])
  );

  assert.equal(sel.length, 3);
  assert.deepEqual(
    sel.map((s) => s[0]),
    [1, 2, 3]
  );
  assert.equal(new Set(sel.map((s) => s[1])).size, 1, 'mesma coluna');
  // o mousedown foi cancelado (sem o ícone de rolagem automática)
  assert.deepEqual(await pg.evaluate(() => window.padraoEvitado), [[1, true]]);
  assert.equal(await doc(pg), 'abcdefgh\nabcdefgh\nabcdefgh\nabcdefgh');

  // digitar vai para as 3 linhas
  await pg.keyboard.type('X');
  assert.equal((await doc(pg)).split('\n').filter((l) => l.includes('X')).length, 3);

  // Esc volta a um cursor só
  await pg.keyboard.press('Escape');
  assert.equal(await pg.evaluate(() => editor.state.selection.ranges.length), 1);

  // Alt + esquerdo continua fazendo coluna
  const c = await centroDaLinha(pg, 1);

  await pg.keyboard.down('Alt');
  await pg.mouse.move(a.x, a.y);
  await pg.mouse.down();
  await pg.mouse.move(c.x, (a.y + c.y) / 2, { steps: 3 });
  await pg.mouse.move(c.x, c.y, { steps: 3 });
  await pg.mouse.up();
  await pg.keyboard.up('Alt');
  assert.equal(await pg.evaluate(() => editor.state.selection.ranges.length), 2);

  // esquerdo sozinho: um intervalo comum, não coluna
  await pg.mouse.move(a.x, a.y);
  await pg.mouse.down();
  await pg.mouse.move(b.x, b.y, { steps: 4 });
  await pg.mouse.up();
  assert.equal(await pg.evaluate(() => editor.state.selection.ranges.length), 1);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('PC: um paste logo depois do botão do meio é ignorado (seleção primária do Linux); depois de 1 s volta a colar', async () => {
  const { ctx, pg, erros } = await abrirComTexto('um\ndois');

  await pg.locator('.cm-content').click();
  await pg.keyboard.press('Control+Home');
  await pg.evaluate(() => navigator.clipboard.writeText('COLADO'));

  const p = await centroDaLinha(pg, 1);

  await pg.mouse.move(p.x, p.y);
  await pg.mouse.down({ button: 'middle' });
  await pg.mouse.up({ button: 'middle' });
  await pg.keyboard.press('Control+v');
  assert.equal(await doc(pg), 'um\ndois', 'o paste logo após o botão do meio não cola');

  await pg.keyboard.press('Control+v'); // o ignorado zera a marca: o seguinte cola
  assert.equal((await doc(pg)).includes('COLADO'), true);

  // passado 1 s do botão do meio, colar normal
  await pg.mouse.down({ button: 'middle' });
  await pg.mouse.up({ button: 'middle' });
  await pg.clock.runFor(1500);
  await pg.keyboard.press('Control+v');
  assert.equal((await doc(pg)).split('COLADO').length - 1, 2);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('PC: segurar Alt não troca o cursor do mouse por cruz (sem crosshairCursor), nem sobre o editor nem no conteúdo', async () => {
  const { ctx, pg, erros } = await abrirComTexto('texto');

  await pg.locator('.cm-content').click();

  const cursor = () =>
    pg.evaluate(() => [
      getComputedStyle(editor.contentDOM).cursor,
      getComputedStyle(editor.dom).cursor,
      getComputedStyle(editor.scrollDOM).cursor,
      editor.contentDOM.classList.contains('cm-crosshair'),
      editor.dom.classList.contains('cm-crosshair'),
    ]);

  const antes = await cursor();

  await pg.keyboard.down('Alt');
  const com = await cursor();

  await pg.keyboard.up('Alt');
  assert.equal(
    com[0] === 'crosshair' || com[1] === 'crosshair' || com[2] === 'crosshair',
    false,
    JSON.stringify(com)
  );
  assert.deepEqual(com, antes);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('PC: Ctrl+↓ e Ctrl+↑ rolam o editor uma linha sem mexer no cursor nem criar cursores; Ctrl+→ segue andando por palavra', async () => {
  const linhas = Array.from({ length: 200 }, (_, i) => `linha ${i}`).join('\n'),
    { ctx, pg, erros } = await abrirComTexto(linhas);

  await pg.evaluate(() => {
    editor.focus();
    editor.dispatch({ selection: { anchor: 0 } });
    editor.scrollDOM.scrollTop = 0;
  });
  await pg.clock.runFor(200); // o editor termina as medidas pendentes (rAF) antes de contar a rolagem

  const estado = () =>
    pg.evaluate(() => [
      editor.scrollDOM.scrollTop,
      editor.state.selection.main.head,
      editor.state.selection.ranges.length,
      editor.defaultLineHeight,
    ]);

  const [topo, , , alt] = await estado();

  // cada toque rola uma linha (a rolagem do navegador é inteira em pixels): espera o scrollTop andar antes do seguinte
  const rolou = async (tecla, de) => {
    await pg.keyboard.press(tecla);
    await pg.waitForFunction((v) => editor.scrollDOM.scrollTop !== v, de, {
      polling: 20,
    });

    return (await estado())[0];
  };

  let t = topo;

  for (let i = 0; i < 3; i++) {
    const novo = await rolou('Control+ArrowDown', t);

    assert.ok(Math.abs(novo - t - alt) <= 1, `${novo - t} vs ${alt}`);
    t = novo;
  }

  const [, cursor, qtd] = await estado();

  assert.equal(cursor, 0);
  assert.equal(qtd, 1);

  const volta = await rolou('Control+ArrowUp', t);

  assert.ok(Math.abs(t - volta - alt) <= 1, `${t - volta} vs ${alt}`);
  assert.equal((await estado())[1], 0);
  assert.equal(await doc(pg), linhas);

  // por palavra: Ctrl+→ vai do começo ao fim de "linha"
  await pg.keyboard.press('Control+ArrowRight');
  assert.equal(await pg.evaluate(() => editor.state.selection.main.head), 5);
  assert.deepEqual(erros, []);
  await ctx.close();
});

// Aba parada no editor do PC: o que aqui se digita contra o que outro aparelho gravou por baixo. Só o próprio campo mudado
// por baixo é conflito; trocar o outro campo (aqui ou lá) nunca é.
const notaDe = (texto) => ({
  user_id: DONO,
  id: 'n1',
  titulo: 'Lista',
  texto,
  criada_em: '2026-11-23T10:00:00+00:00',
  editada_em: '2026-11-23T10:00:00+00:00',
});

const outroAparelho = (pg, nuvem, campos) => {
  Object.assign(nuvem.tabelas.notas_nota[0], campos);

  return pg.evaluate(() => carregar(usuario, mostrar));
};

test('PC, aba parada: título trocado aqui e depois o texto não dá conflito; outro aparelho trocar só o título enquanto se digita também não', async () => {
  const nuvem = novaNuvem([notaDe('um')]),
    { ctx, pg, erros } = await abrirApp({ pc: true, busca: '?nota=n1', nuvem });

  await pg.waitForSelector('#editor:not([hidden]) .cm-content');

  // título aqui, texto depois
  await pg.fill('#n-titulo', 'Compras');
  await pg.locator('.cm-content').click();
  await pg.keyboard.press('Control+End');
  await pg.keyboard.type(' dois');
  await andarAte(pg, () => notaPorId('n1').texto === 'um dois');
  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.notas_nota.map((l) => [l.titulo, l.texto]),
    [['Compras', 'um dois']]
  );

  // outro aparelho troca só o título enquanto aqui se digita o texto
  await pg.keyboard.type(' três');
  await outroAparelho(pg, nuvem, {
    titulo: 'Mercado',
    editada_em: '2026-11-23T11:00:00.000Z',
  });
  await andarAte(pg, () => notaPorId('n1').texto === 'um dois três');
  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.notas_nota.map((l) => [l.titulo, l.texto]),
    [['Mercado', 'um dois três']]
  );
  assert.equal(await pg.inputValue('#n-titulo'), 'Mercado');
  assert.equal(await pg.isHidden('#avisos'), true);
  assert.equal(await pg.evaluate(() => db.notas.length), 1);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('PC, aba parada: outro aparelho troca o texto enquanto se digita: o digitado vira a cópia "(conflito)", o editor mostra o da nuvem e nada fica para gravar', async () => {
  const nuvem = novaNuvem([notaDe('um')]),
    { ctx, pg, erros } = await abrirApp({ pc: true, busca: '?nota=n1', nuvem });

  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
  await pg.locator('.cm-content').click();
  await pg.keyboard.press('Control+End');
  await pg.keyboard.type(' meu');
  // o outro aparelho gravou o texto por baixo; a nuvem só chega aqui depois da gravação do que foi digitado
  Object.assign(nuvem.tabelas.notas_nota[0], {
    texto: 'um deles',
    editada_em: '2026-11-23T11:00:00.000Z',
  });
  await pg.evaluate(() => carregar(usuario, mostrar));
  await andarAte(pg, () => db.notas.length === 2);
  await sincronizado(pg);

  assert.equal(await doc(pg), 'um deles');
  assert.equal(await pg.evaluate(() => tSalvar), null);
  assert.equal(await pg.evaluate(() => temPendente()), false);
  assert.deepEqual(
    Object.fromEntries(nuvem.tabelas.notas_nota.map((l) => [l.titulo, l.texto])),
    { Lista: 'um deles', 'Lista (conflito)': 'um meu' }
  );
  assert.equal(await pg.isVisible('#avisos [data-abrir]'), true);
  assert.deepEqual(erros, []);
  await ctx.close();
});
