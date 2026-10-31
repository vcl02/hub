// No navegador: os tetos de Besteira (R$ 250) e Isabella (R$ 700) no título do Débito (antes só conferido procurando o texto
// do código). Hoje conta só o pago, Futuro soma o em aberto; acima do teto diz Ultrapassado e quanto passou; o nome explica o
// que entra no teto e filtra a tabela por ele.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepararNavegador, abrirFin, dadosDeExemplo, textoDaTabela } = require('./helpers/navegador');

prepararNavegador();
const l = (id, nome, valor, categ, extra = {}) => ({ id, nome, data: '2026-10-17', valor, categ, cred: false, pago: true, fatura: null, freq: null, ...extra });
function dadosComTetos() {
    const d = dadosDeExemplo();
    d.fin.push(l('40', 'Café', -50, 'Besteira'), l('42', 'Sorvete', -20, 'Besteira', { pago: false }), l('43', 'Cinema', -800, 'Isabella'));
    return d;
}
// Os indicadores na ordem da tela: [Hoje Besteira, Hoje Isabella, Futuro Besteira, Futuro Isabella]
const indicadores = pg => pg.$$eval('[data-filtro-teto]', L => L.map(b => [b.dataset.filtroTeto, b.parentElement.textContent.replace(/\s+/g, ' ').trim()]));

test('Besteira: Hoje conta só o pago (R$ 50 de 250 = 20%), Futuro soma o em aberto (R$ 70 = 28%)', async () => {
    const { ctx, pg, erros } = await abrirFin('', dadosComTetos());
    const I = await indicadores(pg);
    assert.deepEqual(I.filter(([c]) => c === 'besteira').map(([, t]) => t), ['Besteira Usado 20%', 'Besteira Usado 28%']);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('Isabella acima do teto (R$ 800 de 700): Ultrapassado, nos dois', async () => {
    const { ctx, pg } = await abrirFin('', dadosComTetos());
    const I = await indicadores(pg);
    assert.ok(I.filter(([c]) => c === 'isabella').every(([, t]) => /^Isabella Ultrapassado/.test(t)), JSON.stringify(I));
    assert.match(await textoDaTabela(pg), /Acima R\$\s100,00/);
    await ctx.close();
});

test('o nome do teto explica o que entra (dica) e, tocado, filtra a tabela pelos lançamentos dele', async () => {
    const { ctx, pg } = await abrirFin('', dadosComTetos());
    assert.match(await pg.getAttribute('[data-filtro-teto=besteira]', 'title'), /café/);
    assert.match(await pg.getAttribute('[data-filtro-teto=isabella]', 'title'), /Lazer/);
    await pg.click('[data-filtro-teto=besteira] >> nth=0');
    await pg.waitForFunction(() => !/Salário/.test(document.getElementById('out').textContent));
    const t = await textoDaTabela(pg);
    assert.match(t, /Café/); assert.match(t, /Sorvete/);
    assert.doesNotMatch(t, /Cinema|Mercado/);
    await ctx.close();
});
