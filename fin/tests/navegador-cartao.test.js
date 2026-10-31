// No navegador: o modal de um cartão (antes conferido em parte procurando o texto do código). O botão do Mercado Pago só
// funciona com dados dele; o modal abre focado nele (sem abrir o teclado num campo), fecha tocando fora e não fecha ao
// arrastar; ← → e arrastar o cartão trocam de fatura; o Aprovado editado grava no ciclo, na coluna do cartão.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepararNavegador, abrirFin, dadosDeExemplo, esperar } = require('./helpers/navegador');

prepararNavegador();
const compra = (id, fatura, valor) => ({ id, nome: 'Compra ' + id, data: '2026-10-18', valor, categ: 'Compras', cred: true, pago: true, fatura, freq: null });
function dadosComCompras() {
    const d = dadosDeExemplo();
    d.fin.push(compra('20', '2026-11-12', -80), compra('21', '2026-12-12', -60), compra('22', '2026-11-13', -150));
    return d;
}
async function abrirCartao(pg, id = '#btNubank') {
    await pg.click(id);
    await pg.waitForSelector('#modalCartao', { state: 'visible' });
}

test('o botão do Mercado Pago fica desativado sem compra nele; com compra, abre o modal dele', async () => {
    let r = await abrirFin();
    assert.equal(await r.pg.isDisabled('#btMercadoPago'), true);
    await r.ctx.close();
    r = await abrirFin('', dadosComCompras());
    assert.equal(await r.pg.isDisabled('#btMercadoPago'), false);
    await abrirCartao(r.pg, '#btMercadoPago');
    assert.match(await r.pg.textContent('#tituloCartao'), /Mercado Pago/);
    await r.ctx.close();
});

test('abre focado no próprio modal (nenhum campo com o teclado); tocar fora fecha', async () => {
    const { ctx, pg, erros } = await abrirFin('', dadosComCompras());
    await abrirCartao(pg);
    assert.equal(await pg.evaluate(() => document.activeElement?.id), 'modalCartao');
    await pg.mouse.click(5, 5);                                                  // fora do cartão, no fundo do diálogo
    await pg.waitForSelector('#modalCartao', { state: 'hidden' });
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('← → trocam a fatura (a de cada ciclo; na ponta não troca); arrastar o cartão também, sem fechar o modal', async () => {
    const { ctx, pg, erros } = await abrirFin('', dadosComCompras());
    await abrirCartao(pg);
    const corpo = () => pg.textContent('#corpoCartao');
    const mudou = de => pg.waitForFunction(t => document.getElementById('corpoCartao').textContent !== t, de);
    const primeira = await corpo();                                              // a fatura do ciclo de hoje, o último
    await pg.keyboard.press('ArrowRight');
    await new Promise(ok => setTimeout(ok, 150));
    assert.equal(await corpo(), primeira);                                       // na ponta: não troca
    await pg.keyboard.press('ArrowLeft'); await mudou(primeira);                 // a do ciclo anterior
    const anterior = await corpo();
    await pg.keyboard.press('ArrowRight'); await mudou(anterior);                // de volta
    assert.equal(await corpo(), primeira);
    await pg.waitForFunction(() => !document.getAnimations().some(a => a.playState === 'running'));   // o cartão terminou de entrar
    const b = await pg.locator('#modalCartao .cartaoArte').boundingBox(), y = b.y + b.height / 2;
    await pg.mouse.move(b.x + 20, y); await pg.mouse.down();
    await pg.mouse.move(b.x + b.width - 10, y, { steps: 8 }); await pg.mouse.up();   // para a direita: a anterior
    await mudou(primeira);
    assert.equal(await corpo(), anterior);
    await new Promise(ok => setTimeout(ok, 100));
    assert.equal(await pg.isVisible('#modalCartao'), true);                      // o arrasto não fechou
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('Aprovado editado no modal grava no ciclo, na coluna do cartão (Mercado Pago: limite_aprovado_mp)', async () => {
    const { ctx, pg, erros, dados, ocioso } = await abrirFin('', dadosComCompras());
    await abrirCartao(pg, '#btMercadoPago');
    const campo = '#corpoCartao input[data-limite-cartao="mp"]';
    await pg.fill(campo, '150000'); await pg.press(campo, 'Enter');            // em centavos, como o cadastro: R$ 1.500,00
    await esperar(() => dados.fin_ciclo.some(c => c.limite_aprovado_mp != null)); await ocioso();
    const ciclo = dados.fin_ciclo.find(c => c.fim === null);
    assert.equal(+ciclo.limite_aprovado_mp, 1500);
    assert.equal(ciclo.limite_aprovado_nubank, undefined);
    assert.deepEqual(erros, []);
    await ctx.close();
});
