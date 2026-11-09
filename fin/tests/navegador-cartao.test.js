// No navegador, só o que é toque, foco e banco: o modal de um cartão (abre focado nele, sem teclado num campo; ← → e arrastar o
// cartão trocam de fatura sem fechar; tocar fora fecha; o Aprovado editado grava no ciclo, na coluna do cartão) e os botões
// do cabeçalho que abrem o diagnóstico e filtram pelo teto. As contas e o HTML estão em telas-por-funcao.test.js
// (botão do Mercado Pago sem dados, tetos, faturas por cartão) e em modal-cartao.test.js.
const assert = require('./helpers/assert-tolerante');
const { test } = require('node:test');

const {
  prepararNavegador,
  abrirFin,
  dadosDeExemplo,
  esperar,
  textoDaTabela,
} = require('./helpers/navegador');

prepararNavegador();

const compra = (id, fatura, valor) => ({
  id,
  nome: 'Compra ' + id,
  data: '2026-10-18',
  valor,
  categ: 'Compras',
  cred: true,
  pago: true,
  fatura,
  freq: null,
});

function dadosComCompras() {
  const d = dadosDeExemplo();

  d.fin.push(
    compra('20', '2026-11-12', -80),
    compra('21', '2026-12-12', -60),
    compra('22', '2026-11-13', -150)
  );

  return d;
}

async function abrirCartao(pg, id = '#btNubank') {
  await pg.click(id);
  await pg.waitForSelector('#modalCartao', { state: 'visible' });
}

test('modal do cartão: abre focado nele, grava o Aprovado na coluna do cartão, ← → e arrastar trocam a fatura, tocar fora fecha', async () => {
  const { ctx, pg, erros, dados, ocioso } = await abrirFin('', dadosComCompras());

  assert.equal(await pg.isDisabled('#btMercadoPago'), false); // com compra nele
  await abrirCartao(pg, '#btMercadoPago');
  assert.match(await pg.textContent('#tituloCartao'), /Mercado Pago/);
  assert.equal(await pg.evaluate(() => document.activeElement?.id), 'modalCartao'); // nenhum campo com o teclado

  const campo = '#corpoCartao input[data-limite-cartao="mp"]';

  await pg.fill(campo, '150000');
  await pg.press(campo, 'Enter'); // em centavos, como o cadastro: R$ 1.500,00
  await esperar(() => dados.fin_ciclo.some((c) => c.limite_aprovado_mp != null));
  await ocioso();
  const ciclo = dados.fin_ciclo.find((c) => c.fim === null);

  assert.equal(+ciclo.limite_aprovado_mp, 1500);
  assert.equal(ciclo.limite_aprovado_nubank, undefined);
  await pg.mouse.click(5, 5); // fora do cartão, no fundo do diálogo
  await pg.waitForSelector('#modalCartao', { state: 'hidden' });

  await abrirCartao(pg);
  const corpo = () => pg.textContent('#corpoCartao');

  const mudou = (de) =>
    pg.waitForFunction(
      (t) => document.getElementById('corpoCartao').textContent !== t,
      de
    );

  const primeira = await corpo(); // a fatura do ciclo de hoje, o último

  await pg.keyboard.press('ArrowRight');
  await new Promise((ok) => setTimeout(ok, 150));
  assert.equal(await corpo(), primeira); // na ponta: não troca
  await pg.keyboard.press('ArrowLeft');
  await mudou(primeira); // a do ciclo anterior
  const anterior = await corpo();

  await pg.keyboard.press('ArrowRight');
  await mudou(anterior); // de volta
  assert.equal(await corpo(), primeira);
  await pg.waitForFunction(
    () => !document.getAnimations().some((a) => a.playState === 'running')
  ); // o cartão terminou de entrar

  const b = await pg.locator('#modalCartao .cartaoArte').boundingBox(),
    y = b.y + b.height / 2;

  await pg.mouse.move(b.x + 20, y);
  await pg.mouse.down();
  await pg.mouse.move(b.x + b.width - 10, y, { steps: 8 });
  await pg.mouse.up(); // para a direita: a anterior
  await mudou(primeira);
  assert.equal(await corpo(), anterior);
  await new Promise((ok) => setTimeout(ok, 100));
  assert.equal(await pg.isVisible('#modalCartao'), true); // o arrasto não fechou
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('botões do cabeçalho: o diagnóstico abre e fecha tocando fora; o nome do teto filtra a tabela pelos lançamentos dele', async () => {
  const d = dadosDeExemplo();

  d.fin.push(
    {
      id: '40',
      nome: 'Café',
      data: '2026-10-17',
      valor: -50,
      categ: 'Besteira',
      cred: false,
      pago: true,
      fatura: null,
      freq: null,
    },
    {
      id: '43',
      nome: 'Cinema',
      data: '2026-10-17',
      valor: -80,
      categ: 'Isabella',
      cred: false,
      pago: true,
      fatura: null,
      freq: null,
    }
  );
  const { ctx, pg, erros } = await abrirFin('', d);

  await pg.click('#btDiagnostico');
  await pg.waitForSelector('#modalDiagnostico', { state: 'visible' });
  const m = await pg.locator('#modalDiagnostico').boundingBox();

  await pg.mouse.click(m.x + 2, m.y + 2); // na borda do diálogo (o fundo dele)
  await pg.waitForSelector('#modalDiagnostico', { state: 'hidden' });

  await pg.click('[data-filtro-teto=besteira] >> nth=0');
  await pg.waitForFunction(
    () => !/Salário/.test(document.getElementById('out').textContent)
  );
  const t = await textoDaTabela(pg);

  assert.match(t, /Café/);
  assert.doesNotMatch(t, /Cinema|Mercado/);
  assert.deepEqual(erros, []);
  await ctx.close();
});
