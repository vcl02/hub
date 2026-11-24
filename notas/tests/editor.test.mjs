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

  assert.equal(
    await pg.textContent('#n-lista li[data-id="antiga"] small'),
    'Conteúdo original'
  );
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
