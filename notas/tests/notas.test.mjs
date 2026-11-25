// Tela das Notas no navegador, só o que precisa dela: a conversa no celular (enviar, segurar para selecionar, Editar, Apagar com
// toque duplo, Copiar) chegando à nuvem; a nota no endereço (?nota=, recarregar, Voltar) com a nota vazia que some e o Esc.
// O editor do PC fica em editor.test.mjs. As regras (parágrafos, Markdown, limpeza do db, envio só do que mudou) são funções
// testadas sem navegador em funcoes.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepararApp,
  abrirApp,
  novaNuvem,
  sincronizado,
  DONO,
  app,
} from './helpers/app.mjs';

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

// Outro aparelho grava a nota (texto e versão novos) e o app baixa, como no carregar() ao entrar
const outroAparelhoGravou = (pg, nuvem, texto, editadaEm) => {
  Object.assign(nuvem.tabelas.notas_nota[0], { texto, editada_em: editadaEm });

  return pg.evaluate(() => carregar(usuario, mostrar));
};

test('celular, aba parada: apagar um parágrafo selecionado antes de a nuvem mudar a nota vira a cópia "(conflito)"; a conversa mostra o da nuvem, o aviso fica no alto até o Esc (que não sai da nota) e Abrir cópia abre a cópia, que chega à nuvem', async () => {
  const nuvem = novaNuvem([nota('A\n\nB')]),
    { ctx, pg, erros } = await abrirApp({ busca: '?nota=n1', nuvem }),
    cdp = await ctx.newCDPSession(pg);

  await pg.waitForSelector('#conversa:not([hidden])');

  // 1º conflito: "A" selecionado; outro aparelho acrescenta "C" (a seleção segura a tela); apagar grava sobre o texto velho
  await segurar(pg, cdp, 0);
  await outroAparelhoGravou(pg, nuvem, 'A\n\nB\n\nC', '2026-11-23T11:00:00.000Z');
  assert.equal((await baloes(pg)).length, 2);
  await pg.tap('#s-apagar');
  await pg.tap('#s-apagar');

  // a nota fica com o da nuvem (nada se perdeu) e a versão daqui é a cópia, logo abaixo
  assert.deepEqual(await baloes(pg), ['<p>A</p>', '<p>B</p>', '<p>C</p>']);
  const copia1 = await pg.evaluate(() => db.notas[1]);

  assert.deepEqual([copia1.titulo, copia1.texto], ['Lista (conflito)', 'B']);
  assert.deepEqual(
    await pg.$$eval('#avisos li .oque', (L) => L.map((x) => x.textContent)),
    ['Lista: mudou em outro aparelho; sua versão foi salva como "Lista (conflito)".']
  );

  // o aviso fica no alto da nota (logo abaixo do cabeçalho, acima dos balões), dentro da tela
  const [topo, aviso, baloesBox] = await Promise.all(
    ['#n-topo', '#avisos', '#c-baloes'].map((s) => pg.locator(s).boundingBox())
  );

  assert.ok(
    aviso.y >= topo.y + topo.height - 1 && aviso.y + aviso.height <= baloesBox.y + 1
  );
  assert.ok(aviso.x >= 0 && aviso.x + aviso.width <= 390);

  // Esc fecha o aviso primeiro (não volta para a lista)
  await pg.keyboard.press('Escape');
  assert.equal(await pg.isHidden('#avisos'), true);
  assert.match(pg.url(), /\?nota=n1$/);

  // 2º conflito, agora pelo Editar: Abrir cópia leva à cópia (no endereço), com o texto daqui
  await segurar(pg, cdp, 1);
  await pg.tap('#s-editar');
  await outroAparelhoGravou(pg, nuvem, 'A\n\nB\n\nC\n\nD', '2026-11-23T12:00:00.000Z');
  await pg.fill('#c-texto', 'B2');
  await pg.tap('#c-enviar');
  assert.equal((await baloes(pg)).length, 4);
  assert.equal(await pg.isVisible('#avisos [data-abrir]'), true);
  await pg.tap('#avisos [data-abrir]');

  const copia2 = await pg.evaluate(() => notaPorId(aberta));

  assert.ok(copia2.id !== 'n1' && copia2.id !== copia1.id);
  assert.match(pg.url(), new RegExp(`\\?nota=${copia2.id}$`));
  assert.equal(await pg.inputValue('#n-titulo'), 'Lista (conflito)');
  assert.deepEqual(await baloes(pg), ['<p>A</p>', '<p>B2</p>', '<p>C</p>']);
  assert.equal(await pg.isHidden('#avisos'), true);

  // na nuvem: a original como o outro aparelho deixou e as duas cópias
  await sincronizado(pg);

  const naNuvem = Object.fromEntries(
    nuvem.tabelas.notas_nota.map((l) => [l.id, l.texto])
  );

  assert.deepEqual(naNuvem, {
    n1: 'A\n\nB\n\nC\n\nD',
    [copia1.id]: 'B',
    [copia2.id]: 'A\n\nB2\n\nC',
  });
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

// ---------- ordem da lista: arrastar pela alça ----------
const linhaOrdem = (id, ordem, titulo) => ({
  user_id: DONO,
  id,
  titulo,
  texto: '',
  ordem,
  criada_em: '2026-11-23T10:00:00+00:00',
  editada_em: '2026-11-23T10:00:00+00:00',
});

const tresNotas = () =>
  novaNuvem([
    linhaOrdem('a', 1, 'Alfa'),
    linhaOrdem('b', 2, 'Beta'),
    linhaOrdem('c', 3, 'Gama'),
  ]);

const titulos = (pg) =>
  pg.$$eval('#n-lista li', (L) => L.map((l) => l.querySelector('b').textContent));

const centro = async (pg, seletor) => {
  const r = await pg.locator(seletor).boundingBox();

  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

test('celular: arrastar a alça com o dedo leva a nota para onde soltou, a nuvem recebe a ordem nova só dela e recarregar mantém', async () => {
  const nuvem = tresNotas(),
    { ctx, pg, erros } = await abrirApp({ nuvem }),
    cdp = await ctx.newCDPSession(pg);

  assert.deepEqual(await titulos(pg), ['Alfa', 'Beta', 'Gama']);

  const de = await centro(pg, '#n-lista li[data-id="c"] .alca'),
    ate = await centro(pg, '#n-lista li[data-id="a"]');

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [de] });
  assert.equal(await pg.locator('#n-lista li[data-id="c"].arrastando').count(), 1);

  for (const t of [0.25, 0.5, 0.75, 1])
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: de.x, y: de.y + (ate.y - 10 - de.y) * t }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  assert.deepEqual(await titulos(pg), ['Gama', 'Alfa', 'Beta']);
  assert.equal(await pg.locator('#n-lista li.arrastando').count(), 0);

  await sincronizado(pg);
  // só a nota movida mudou na nuvem: ordem antes da primeira (1 − 1)
  assert.deepEqual(
    nuvem.tabelas.notas_nota.map((l) => [l.id, l.ordem]),
    [
      ['a', 1],
      ['b', 2],
      ['c', 0],
    ]
  );
  // mover não muda a edição: a coluna nem é enviada (fica como a nuvem tinha)
  assert.equal(
    Date.parse(nuvem.tabelas.notas_nota.find((l) => l.id === 'c').editada_em),
    Date.parse('2026-11-23T10:00:00.000Z')
  );

  // recarregar: a ordem definida fica
  await pg.reload();
  await pg.waitForFunction(() => typeof carregado !== 'undefined' && carregado);
  assert.deepEqual(await titulos(pg), ['Gama', 'Alfa', 'Beta']);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('PC: Alt+↓ na alça move uma posição, mantém o foco nela e grava; no fim não faz nada', async () => {
  const nuvem = tresNotas(),
    { ctx, pg, erros } = await abrirApp({ nuvem, pc: true });

  await pg.focus('#n-lista li[data-id="a"] .alca');
  await pg.keyboard.press('Alt+ArrowDown');
  assert.deepEqual(await titulos(pg), ['Beta', 'Alfa', 'Gama']);
  assert.equal(
    await pg.evaluate(() => document.activeElement.closest('li')?.dataset.id),
    'a'
  );
  assert.equal(await pg.evaluate(() => document.activeElement.className), 'alca');

  await pg.keyboard.press('Alt+ArrowDown');
  await pg.keyboard.press('Alt+ArrowDown'); // já é a última
  assert.deepEqual(await titulos(pg), ['Beta', 'Gama', 'Alfa']);
  await pg.keyboard.press('Alt+ArrowUp');
  assert.deepEqual(await titulos(pg), ['Beta', 'Alfa', 'Gama']);

  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.notas_nota.map((l) => [l.id, l.ordem]),
    [
      ['a', 2.5],
      ['b', 2],
      ['c', 3],
    ]
  );
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('PC: Esc no meio do arraste cancela (a nota volta, nada grava) sem sair do app', async () => {
  const nuvem = tresNotas(),
    { ctx, pg, erros } = await abrirApp({ nuvem, pc: true }),
    de = await centro(pg, '#n-lista li[data-id="a"] .alca'),
    ate = await centro(pg, '#n-lista li[data-id="c"]');

  await pg.mouse.move(de.x, de.y);
  await pg.mouse.down();
  await pg.mouse.move(de.x, (de.y + ate.y) / 2, { steps: 4 });
  await pg.mouse.move(de.x, ate.y + 10, { steps: 4 });
  assert.equal(await pg.locator('#n-lista li[data-id="a"].arrastando').count(), 1);

  await pg.keyboard.press('Escape');
  assert.equal(await pg.locator('#n-lista li.arrastando').count(), 0);
  assert.equal(
    await pg.evaluate(() => document.body.classList.contains('arrastando-lista')),
    false
  );
  await pg.mouse.up();
  assert.deepEqual(await titulos(pg), ['Alfa', 'Beta', 'Gama']);
  assert.equal(await pg.isVisible('#n-lista'), true);
  assert.equal(pg.url().startsWith(app.url), true);

  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.notas_nota.map((l) => [l.id, l.ordem]),
    [
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]
  );
  assert.deepEqual(erros, []);
  await ctx.close();
});

// ---------- Favoritas ----------
async function segurarFav(pg, cdp, k) {
  const r = await pg.locator(`#f-baloes li.balao[data-k="${k}"]`).boundingBox(),
    ponto = { x: r.x + r.width / 2, y: r.y + r.height / 2 };

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [ponto],
  });
  await pg.clock.runFor(600);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('celular: favoritar pela barra → o card conta → a Favoritas mostra o balão com o título da origem → tocar abre a origem no parágrafo → tirar das favoritas grava na origem → recarregar mantém', async () => {
  const nuvem = novaNuvem([
      { ...nota('primeiro\n\nsegundo\n\n```\ncodigo\n```', 'Compras'), ordem: 1 },
      { ...nota('outro ★', ''), id: 'n2', ordem: 2 },
    ]),
    { ctx, pg, erros } = await abrirApp({ busca: '?nota=n1', nuvem }),
    cdp = await ctx.newCDPSession(pg),
    texto = (id) => pg.evaluate((i) => notaPorId(i).texto, id);

  await pg.waitForSelector('#conversa:not([hidden])');

  // o bloco de código sozinho: a estrela fica desativada
  await segurar(pg, cdp, 2);
  assert.equal(await pg.isDisabled('#s-favoritar'), true);

  // o parágrafo comum com o de código selecionados: a estrela vale só para o comum e favorita
  await pg.tap('#c-baloes li.balao[data-i="1"]');
  assert.equal(await pg.isDisabled('#s-favoritar'), false);
  assert.equal(await pg.getAttribute('#s-favoritar', 'title'), 'Favoritar');
  await pg.tap('#s-favoritar');
  assert.equal(await pg.isHidden('#s-barra'), true);
  assert.equal(await texto('n1'), 'primeiro\n\nsegundo ★\n\n```\ncodigo\n```');
  assert.equal(await pg.locator('#c-baloes li.balao.favorito').count(), 1);
  assert.equal(await pg.locator('#c-baloes li.balao.favorito .estrela').count(), 1);
  // o balão não mostra a marca de texto
  assert.equal(await pg.textContent('#c-baloes li.balao[data-i="1"] p'), 'segundo');

  // selecionar o favorito: a estrela agora tira
  await segurar(pg, cdp, 1);
  assert.equal(await pg.getAttribute('#s-favoritar', 'title'), 'Tirar das favoritas');
  await pg.keyboard.press('Escape');
  assert.equal(await pg.isHidden('#s-barra'), true);

  // volta para a lista: o card conta as duas favoritas (a de outra nota também)
  await pg.tap('#n-voltar');
  await pg.waitForSelector('#v-lista:not([hidden])');
  assert.equal(await pg.textContent('#n-favs-qtd'), '2 mensagens');

  await pg.tap('#n-favs');
  await pg.waitForSelector('#v-fav:not([hidden])');
  assert.match(pg.url(), /\?nota=favoritas$/);
  assert.deepEqual(
    await pg.$$eval('#f-baloes li.balao', (L) =>
      L.map((b) => [b.querySelector('.de').textContent, b.querySelector('p').textContent])
    ),
    [
      ['Compras', 'segundo'],
      ['Sem título', 'outro'],
    ]
  );

  // tocar abre a nota de origem rolada até o parágrafo, com o destaque
  await pg.tap('#f-baloes li.balao[data-k="0"]');
  await pg.waitForSelector('#conversa:not([hidden])');
  assert.match(pg.url(), /\?nota=n1$/);
  assert.equal(await pg.locator('#c-baloes li.balao[data-i="1"].destaque').count(), 1);
  await pg.clock.runFor(1600);
  assert.equal(await pg.locator('#c-baloes li.balao.destaque').count(), 0);

  // Voltar do navegador devolve à Favoritas
  await pg.goBack();
  await pg.waitForSelector('#v-fav:not([hidden])');

  // editar o favorito na origem mantém a marca
  await pg.tap('#f-baloes li.balao[data-k="0"]');
  await pg.waitForSelector('#conversa:not([hidden])');
  await segurar(pg, cdp, 1);
  await pg.tap('#s-editar');
  assert.equal(await pg.inputValue('#c-texto'), 'segundo');
  await enviarParagrafo(pg, 'segundo editado');
  assert.equal(await texto('n1'), 'primeiro\n\nsegundo editado ★\n\n```\ncodigo\n```');
  // o Voltar da nota aberta pela Favoritas leva de volta a ela
  await pg.tap('#n-voltar');
  await pg.waitForSelector('#v-fav:not([hidden])');

  // Favoritas: o Esc sem seleção volta para a lista; com seleção, só desmarca
  await segurarFav(pg, cdp, 0);
  assert.equal(await pg.textContent('#f-qtd'), '1');
  await pg.keyboard.press('Escape');
  assert.equal(await pg.isHidden('#f-barra'), true);
  assert.equal(await pg.isVisible('#v-fav'), true);
  await pg.keyboard.press('Escape');
  await pg.waitForSelector('#v-lista:not([hidden])');

  // tirar das favoritas: seleciona as duas, o texto das origens perde só a marca e a Favoritas esvazia
  await pg.tap('#n-favs');
  await pg.waitForSelector('#v-fav:not([hidden])');
  await segurarFav(pg, cdp, 0);
  await pg.tap('#f-baloes li.balao[data-k="1"]');
  assert.equal(await pg.textContent('#f-qtd'), '2');
  await pg.tap('#f-desfavoritar');
  assert.equal(await texto('n1'), 'primeiro\n\nsegundo editado\n\n```\ncodigo\n```');
  assert.equal(await texto('n2'), 'outro');
  assert.equal(await pg.locator('#f-baloes li.balao').count(), 0);
  assert.equal(await pg.isVisible('#f-vazio'), true);

  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.notas_nota.map((l) => [l.id, l.texto]),
    [
      ['n1', 'primeiro\n\nsegundo editado\n\n```\ncodigo\n```'],
      ['n2', 'outro'],
    ]
  );

  // recarregar na Favoritas mantém a tela (vazia) e o card da lista diz "Nenhuma ainda"
  await pg.reload();
  await pg.waitForSelector('#v-fav:not([hidden])');
  assert.equal(await pg.isVisible('#f-vazio'), true);
  await pg.tap('#f-voltar');
  await pg.waitForSelector('#v-lista:not([hidden])');
  assert.equal(await pg.textContent('#n-favs-qtd'), 'Nenhuma ainda');
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('celular: o card Temp (igual ao Favoritas, logo abaixo) abre a nota Temp; escrever, selecionar e Mover para outra nota → some da Temp, aparece no fim da outra, a nuvem fica com as duas e recarregar mantém', async () => {
  const nuvem = novaNuvem([
      { ...nota('antes', 'Destino'), ordem: 1 },
      { ...nota('outra', 'Outra'), id: 'n2', ordem: 2 },
    ]),
    { ctx, pg, erros } = await abrirApp({ nuvem }),
    cdp = await ctx.newCDPSession(pg),
    texto = (id) => pg.evaluate((i) => notaPorId(i)?.texto, id);

  await pg.waitForSelector('#v-lista:not([hidden])');

  // o card: logo abaixo do Favoritas, com a mesma altura, largura e fundo; fora da lista (sem alça, sem lixeira)
  const caixa = (sel) => pg.locator(sel).boundingBox(),
    fav = await caixa('#n-favs li'),
    temp = await caixa('#n-temp li');

  assert.equal(temp.height, fav.height);
  assert.equal(temp.width, fav.width);
  assert.equal(temp.x, fav.x);
  assert.ok(
    temp.y > fav.y + fav.height && temp.y < (await caixa('#n-lista li:first-child')).y
  );
  assert.equal(
    await pg.$eval('#n-temp li', (li) => getComputedStyle(li).backgroundColor),
    await pg.$eval('#n-favs li', (li) => getComputedStyle(li).backgroundColor)
  );
  assert.equal(await pg.textContent('#n-temp-qtd'), 'Vazia');
  assert.equal(await pg.locator('#n-lista li').count(), 2);

  // abre (e nasce) a Temp, de título fixo
  await pg.tap('#n-temp');
  await pg.waitForSelector('#conversa:not([hidden])');
  assert.match(pg.url(), /\?nota=temp$/);
  assert.equal(await pg.inputValue('#n-titulo'), 'Temp');
  assert.equal(await pg.$eval('#n-titulo', (i) => i.readOnly), true);

  await enviarParagrafo(pg, 'fica');
  await enviarParagrafo(pg, 'vai ★');
  await enviarParagrafo(pg, 'vai também');

  // seleciona os dois de baixo e Mover: o seletor tem a Temp de fora (é a origem), as notas na ordem e Nova nota
  await segurar(pg, cdp, 1);
  await pg.tap('#c-baloes li.balao[data-i="2"]');
  await pg.tap('#s-mover');
  await pg.waitForSelector('#m-mover[open]');
  assert.deepEqual(
    await pg.$$eval('#m-lista button', (B) => B.map((b) => b.textContent)),
    ['Destino', 'Outra', 'Nova nota']
  );

  // Esc fecha só o seletor: a seleção continua e a nota fica aberta
  await pg.keyboard.press('Escape');
  assert.equal(await pg.$eval('#m-mover', (d) => d.open), false);
  assert.equal(await pg.textContent('#s-qtd'), '2');
  assert.match(pg.url(), /\?nota=temp$/);

  await pg.tap('#s-mover');
  await pg.tap('#m-lista button[data-destino="n1"]');
  assert.equal(await pg.$eval('#m-mover', (d) => d.open), false);
  assert.equal(await pg.isHidden('#s-barra'), true);
  assert.equal(await texto('temp'), 'fica');
  assert.equal(await texto('n1'), 'antes\n\nvai ★\n\nvai também');
  assert.equal(await texto('n2'), 'outra');
  assert.equal(await pg.locator('#c-baloes li.balao').count(), 1);
  assert.equal(await pg.textContent('#toast-msg'), 'Movido para Destino');
  assert.equal(await pg.textContent('#toast-acao'), 'Abrir');

  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.notas_nota.map((l) => [l.id, l.titulo, l.texto]).sort(),
    [
      ['n1', 'Destino', 'antes\n\nvai ★\n\nvai também'],
      ['n2', 'Outra', 'outra'],
      ['temp', 'Temp', 'fica'],
    ]
  );

  // Abrir no aviso leva ao destino
  await pg.tap('#toast-acao');
  await pg.waitForFunction(
    () => new URLSearchParams(location.search).get('nota') === 'n1'
  );
  assert.equal(await pg.locator('#c-baloes li.balao').count(), 3);
  assert.equal(await pg.$eval('#n-titulo', (i) => i.readOnly), false);

  // recarregar mantém; o card conta o que ficou na Temp
  await pg.reload();
  await pg.waitForSelector('#conversa:not([hidden])');
  assert.equal(await texto('n1'), 'antes\n\nvai ★\n\nvai também');
  // Voltar: o destino foi aberto por cima da Temp, então volta para ela e depois para a lista
  await pg.tap('#n-voltar');
  await pg.waitForFunction(
    () => new URLSearchParams(location.search).get('nota') === 'temp'
  );
  assert.equal(await pg.locator('#c-baloes li.balao').count(), 1);
  await pg.tap('#n-voltar');
  await pg.waitForSelector('#v-lista:not([hidden])');
  assert.equal(await pg.textContent('#n-temp-qtd'), '1 mensagem');
  assert.equal(await pg.textContent('#n-favs-qtd'), '1 mensagem');
  assert.equal(await pg.locator('#n-lista li').count(), 2);
  assert.deepEqual(erros, []);
  await ctx.close();
});
