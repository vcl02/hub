// Tela das Notas no navegador, só o que precisa dela: a conversa no celular (enviar, segurar para selecionar, Editar, Apagar com
// toque duplo, Copiar) chegando à nuvem; a nota no endereço (?nota=, recarregar, Voltar) com a nota vazia que some e o Esc.
// O editor do PC fica em editor.test.mjs. As regras (parágrafos, Markdown, limpeza do db, envio só do que mudou) são funções
// testadas sem navegador em funcoes.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, novaNuvem, sincronizado, DONO } from './helpers/app.mjs';

prepararApp();

// Segurar um balão com o dedo (eventos de toque de verdade do Chromium) pelo tempo do toque longo, no relógio pausado
async function segurar(pg, cdp, i) {
  const r = await pg.locator(`#c-baloes li.balao[data-i="${i}"]`).boundingBox(),
    ponto = { x: r.x + r.width / 2, y: r.y + r.height / 2 };

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [ponto],
  });
  await pg.clock.runFor(600);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const baloes = (pg) =>
  pg.$$eval('#c-baloes li.balao', (L) => L.map((b) => b.innerHTML.trim()));

async function enviarParagrafo(pg, texto) {
  await pg.fill('#c-texto', texto);
  await pg.tap('#c-enviar');
  await pg.clock.runFor(600); // passa o toque repetido (0,5 s)
}

test('celular: nota nova como conversa — enviar 2 parágrafos (formatados, chegam à nuvem), segurar seleciona, Copiar, Editar troca o parágrafo e Apagar com toque duplo', async () => {
  const { ctx, pg, erros, nuvem } = await abrirApp();
  const cdp = await ctx.newCDPSession(pg);

  await pg.tap('#n-nova');
  await pg.waitForSelector('#conversa:not([hidden])');
  assert.match(pg.url(), /\?nota=[A-Za-z0-9_-]+$/);
  assert.equal(await pg.isHidden('#editor'), true);

  await pg.fill('#n-titulo', 'Compras');
  await enviarParagrafo(pg, '**leite** e <b>pão</b>');
  await enviarParagrafo(pg, 'ver [site](https://a.com) e [x](javascript:alert(1))');

  assert.deepEqual(await baloes(pg), [
    '<p><strong>leite</strong> e &lt;b&gt;pão&lt;/b&gt;</p>',
    '<p>ver <a href="https://a.com" target="_blank" rel="noopener noreferrer">site</a> e [x](javascript:alert(1))</p>',
  ]);
  assert.equal(await pg.inputValue('#n-titulo'), 'Compras');

  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.notas_nota.map((l) => [l.user_id, l.titulo, l.texto]),
    [
      [
        DONO,
        'Compras',
        '**leite** e <b>pão</b>\n\nver [site](https://a.com) e [x](javascript:alert(1))',
      ],
    ]
  );

  // segurar seleciona; com algo selecionado, um toque seleciona outro
  await segurar(pg, cdp, 0);
  assert.equal(await pg.isVisible('#s-barra'), true);
  assert.equal(await pg.textContent('#s-qtd'), '1');
  await pg.tap('#c-baloes li.balao[data-i="1"]');
  assert.equal(await pg.textContent('#s-qtd'), '2');
  assert.equal(await pg.isDisabled('#s-editar'), true);

  // Copiar: os dois parágrafos separados por uma linha em branco; a seleção sai
  await pg.tap('#s-copiar');
  await pg.waitForSelector('#s-barra', { state: 'hidden' });
  assert.equal(
    await pg.evaluate(() => navigator.clipboard.readText()),
    '**leite** e <b>pão</b>\n\nver [site](https://a.com) e [x](javascript:alert(1))'
  );

  // Editar (1 selecionado): o texto vai para o campo; enviar troca o parágrafo no lugar
  await segurar(pg, cdp, 1);
  await pg.tap('#s-editar');
  assert.equal(
    await pg.inputValue('#c-texto'),
    'ver [site](https://a.com) e [x](javascript:alert(1))'
  );
  await enviarParagrafo(pg, 'segundo *trocado*');
  assert.deepEqual((await baloes(pg)).slice(1), ['<p>segundo <em>trocado</em></p>']);
  assert.equal((await baloes(pg)).length, 2);

  // Apagar: o 1º toque só arma; o 2º apaga
  await segurar(pg, cdp, 0);
  await pg.tap('#s-apagar');
  assert.equal((await baloes(pg)).length, 2);
  await pg.tap('#s-apagar');
  assert.deepEqual(await baloes(pg), ['<p>segundo <em>trocado</em></p>']);

  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.notas_nota.map((l) => [l.titulo, l.texto]),
    [['Compras', 'segundo *trocado*']]
  );
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('?nota= no endereço: recarregar mantém a nota, Voltar (do app e do navegador) volta para a lista, nota nova vazia some ao sair e o Esc sai da nota e depois do app', async () => {
  const nuvem = novaNuvem([
    {
      user_id: DONO,
      id: 'n1',
      titulo: 'Lista',
      texto: 'item',
      criada_em: '2026-11-23T10:00:00+00:00',
      editada_em: '2026-11-23T10:00:00+00:00',
    },
  ]);

  const { ctx, pg, erros } = await abrirApp({ busca: '?nota=n1', nuvem });
  const aberta = () => pg.waitForSelector('#v-nota:not([hidden])');
  const lista = () => pg.waitForSelector('#v-lista:not([hidden])');

  await aberta();
  assert.equal(await pg.inputValue('#n-titulo'), 'Lista');

  await pg.reload();
  await aberta();
  assert.equal(await pg.inputValue('#n-titulo'), 'Lista');
  assert.match(pg.url(), /\?nota=n1$/);

  // botão Voltar do app: a lista, sem ?nota
  await pg.tap('#n-voltar');
  await lista();
  assert.doesNotMatch(pg.url(), /nota=/);

  // abrir pela lista empilha; o Voltar do navegador volta para a lista
  await pg.tap('#n-lista li[data-id="n1"] a.oque');
  await aberta();
  assert.match(pg.url(), /\?nota=n1$/);
  await pg.goBack();
  await lista();
  assert.doesNotMatch(pg.url(), /nota=/);

  // nota nova sem nada escrito: o 1º Esc só tira o foco do campo, o 2º volta para a lista e ela some
  await pg.tap('#n-nova');
  await aberta();
  assert.equal(await pg.evaluate(() => document.activeElement.id), 'c-texto');
  await pg.keyboard.press('Escape');
  assert.equal(await pg.isVisible('#v-nota'), true);
  await pg.keyboard.press('Escape');
  await lista();
  assert.deepEqual(await pg.$$eval('#n-lista li', (L) => L.map((li) => li.dataset.id)), [
    'n1',
  ]);
  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.notas_nota.map((l) => l.id),
    ['n1']
  );

  // na lista, o Esc sai do app (../)
  const saiu = pg.waitForEvent('framenavigated');

  await pg.keyboard.press('Escape');
  await saiu;
  assert.deepEqual(erros, []);
  await ctx.close();
});

const nota = (texto, titulo = 'Lista') => ({
  user_id: DONO,
  id: 'n1',
  titulo,
  texto,
  criada_em: '2026-11-23T10:00:00+00:00',
  editada_em: '2026-11-23T10:00:00+00:00',
});

// Resposta da nuvem com texto novo: a nuvem muda e o app baixa de novo, como no carregar() ao entrar
const chegouDaNuvem = (pg, nuvem, texto) => {
  nuvem.tabelas.notas_nota[0].texto = texto;

  return pg.evaluate(() => carregar(usuario, mostrar));
};

test('celular: texto da nuvem não limpa o campo nem cancela a edição; enviar acrescenta ao texto mais novo e Cancelar mostra o da nuvem', async () => {
  const nuvem = novaNuvem([nota('A\n\nB')]),
    { ctx, pg, erros } = await abrirApp({ busca: '?nota=n1', nuvem }),
    cdp = await ctx.newCDPSession(pg);

  await pg.waitForSelector('#conversa:not([hidden])');

  // texto digitado no campo: a resposta da nuvem não o apaga nem redesenha a tela
  await pg.fill('#c-texto', 'rascunho');
  await chegouDaNuvem(pg, nuvem, 'A\n\nB\n\nC');
  assert.equal(await pg.inputValue('#c-texto'), 'rascunho');
  assert.equal((await baloes(pg)).length, 2);

  // enviar: o parágrafo vai para o texto mais novo, sem sobrescrever o que veio de outro aparelho
  await pg.tap('#c-enviar');
  await pg.clock.runFor(600);
  assert.equal(await pg.evaluate(() => notaPorId('n1').texto), 'A\n\nB\n\nC\n\nrascunho');
  assert.equal((await baloes(pg)).length, 4);
  await sincronizado(pg);
  assert.equal(nuvem.tabelas.notas_nota[0].texto, 'A\n\nB\n\nC\n\nrascunho');

  // parágrafo em edição: a edição continua, com o texto do campo
  await segurar(pg, cdp, 0);
  await pg.tap('#s-editar');
  assert.equal(await pg.inputValue('#c-texto'), 'A');
  await chegouDaNuvem(pg, nuvem, 'A\n\nB\n\nC\n\nrascunho\n\nD');
  assert.equal(await pg.inputValue('#c-texto'), 'A');
  assert.equal(await pg.isVisible('#c-editando'), true);
  assert.equal((await baloes(pg)).length, 4);

  // Cancelar: o texto que chegou da nuvem entra
  await pg.tap('#c-cancelar');
  assert.equal(await pg.isHidden('#c-editando'), true);
  assert.equal((await baloes(pg)).length, 5);
  assert.equal(await pg.inputValue('#c-texto'), '');
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('título da aba: volta a "Notas" ao voltar para a lista, na conversa e no editor', async () => {
  for (const pc of [false, true]) {
    const nuvem = novaNuvem([nota('item', 'Compras')]),
      { ctx, pg } = await abrirApp({ busca: '?nota=n1', nuvem, pc });

    await pg.waitForSelector('#v-nota:not([hidden])');
    assert.equal(await pg.title(), 'Compras · Notas');
    await pg.click('#n-voltar');
    await pg.waitForSelector('#v-lista:not([hidden])');
    assert.equal(await pg.title(), 'Notas');
    await ctx.close();
  }
});
