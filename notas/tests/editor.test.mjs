// O editor do PC no navegador (o CodeMirror do vendor, de verdade): Ctrl+D faz vários cursores, Ctrl+X sem seleção recorta a
// linha inteira (com a quebra), o Esc desfaz os vários cursores antes de sair, e o texto grava sozinho e chega à nuvem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { andarAte } from '../../tests/relogio.mjs';
import { prepararApp, abrirApp, sincronizado } from './helpers/app.mjs';

prepararApp();

const doc = (pg) => pg.evaluate(() => editor.state.doc.toString());

test('PC: a nota abre no editor; Ctrl+D seleciona as ocorrências com vários cursores, Ctrl+X sem seleção recorta a linha inteira (colar a põe acima) e o texto grava sozinho na nuvem', async () => {
  const { ctx, pg, erros, nuvem } = await abrirApp({ pc: true });

  await pg.click('#n-nova');
  await pg.waitForSelector('#editor:not([hidden]) .cm-content');
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
  assert.equal(await pg.textContent('#n-titulo'), 'bar um');
  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.notas_nota.map((l) => l.texto),
    ['bar um\nbar dois\nfim']
  );
  assert.deepEqual(erros, []);
  await ctx.close();
});
