// No navegador: os dois cartões (antes só conferido procurando o texto do código). O dia do vencimento decide o cartão
// (12 = Nubank, 13 = Mercado Pago): o cadastro oferece os vencimentos dos dois, a sugestão das parcelas segue o cartão da
// 1ª, o débito tem uma linha de fatura por cartão e o Mercado Pago só aparece depois da 1ª compra nele.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepararNavegador, abrirFin, dadosDeExemplo, textoDaTabela } = require('./helpers/navegador');

prepararNavegador();
const compra = (id, nome, fatura, valor = -100) => ({ id, nome, data: '2026-10-18', valor, categ: 'Compras', cred: true, pago: true, fatura, freq: null });   // como o cadastro grava (Pago marcado)
async function abrirCadastro(dados) {
    const r = await abrirFin('', dados);
    await r.pg.click('#abreNovo'); await r.pg.waitForSelector('#modalNovo', { state: 'visible' });
    return r;
}

test('cadastro: a fatura oferece os vencimentos dos dois cartões, do mês passado até dez/2032, com o nome do cartão', async () => {
    const { ctx, pg, erros } = await abrirCadastro();
    const opcoes = await pg.$$eval('#faturaPrincipal select option:not([disabled])', L => L.map(o => [o.value, o.textContent]));
    assert.ok(opcoes.some(([v, t]) => v.endsWith('-12') && /Nubank/.test(t)));
    assert.ok(opcoes.some(([v, t]) => v.endsWith('-13') && /Mercado Pago/.test(t)));
    assert.equal(opcoes[0][0].slice(0, 7), '2026-09');                           // do mês passado
    assert.equal(opcoes.at(-1)[0].slice(0, 7), '2032-12');                       // até dez/2032
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('parcelas: escolher o Mercado Pago na 1ª leva a sugestão das outras para o Mercado Pago (dia 13)', async () => {
    const { ctx, pg, erros } = await abrirCadastro();
    await pg.selectOption('#fParcelas', '3');
    const sugeridas = () => pg.$$eval('[data-fatura-parcela]', L => L.map(s => s.value));
    assert.ok((await sugeridas()).every(v => v.endsWith('-12')), 'Nubank por padrão');
    await pg.selectOption('#faturaPrincipal select', '2026-11-13');
    await pg.waitForFunction(() => [...document.querySelectorAll('[data-fatura-parcela]')].slice(1).every(s => s.value.endsWith('-13')));
    assert.deepEqual(await sugeridas(), ['2026-11-13', '2026-12-13', '2027-01-13']);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('débito com uma linha de fatura por cartão; o Mercado Pago só aparece depois da 1ª compra nele', async () => {
    let r = await abrirFin();
    assert.doesNotMatch(await textoDaTabela(r.pg), /Mercado Pago/);              // sem compra no Mercado Pago: só o Nubank
    await r.ctx.close();
    const d = dadosDeExemplo();
    d.fin.push(compra('20', 'Livro', '2026-11-12', -80), compra('21', 'Fone', '2026-11-13', -150));
    r = await abrirFin('', d);
    const t = await textoDaTabela(r.pg);
    assert.match(t, /Fatura Nubank−R\$\s80,00/);
    assert.match(t, /Fatura Mercado Pago−R\$\s150,00/);
    assert.match(t, /Mercado Pago/);
    assert.deepEqual(r.erros, []);
    await r.ctx.close();
});
