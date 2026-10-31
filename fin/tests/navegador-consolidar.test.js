// No navegador: o Consolidar tudo, que roda no toque do Recarregar (antes só conferido procurando o texto do código).
// Cada ciclo do atual até o último com lançamento ganha o Aporte (ou Resgate) da sobra dele, com a data do fim do ciclo;
// um resumo diz ciclo a ciclo o que foi feito; recarregar de novo não duplica nada; sem rede, não consolida.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepararNavegador, abrirFin, dadosDeExemplo } = require('./helpers/navegador');

prepararNavegador();
const ajustes = dados => dados.fin.filter(l => /^(Aporte|Resgate)$/.test(l.nome));
async function recarregar(pg, ocioso) {
    await pg.click('#recarregar');
    await pg.waitForSelector('#modalConsolidarTudo', { state: 'visible' });
    await ocioso();
    return (await pg.textContent('#modalConsolidarTudo')).replace(/\s+/g, ' ');
}

test('Recarregar consolida: o ciclo de hoje ganha o Aporte da sobra, no fim do ciclo, e o resumo conta ciclo a ciclo', async () => {
    const { ctx, pg, erros, dados, escritas, ocioso } = await abrirFin();
    const resumo = await recarregar(pg, ocioso);
    assert.deepEqual(ajustes(dados).map(l => [l.nome, l.valor, l.data, l.categ]), [['Aporte', -6679.5, '2026-11-14', 'Investimento']]);   // 9.000 − 320,50 − 2.000 (saldo anterior)
    assert.deepEqual(escritas, [['POST', 'fin']]);
    assert.match(resumo, /1 materializado\(s\), 0 consolidado\(s\)/);
    assert.match(resumo, /Outubro 2026: Materializado Aporte de R\$\s6\.679,50/);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('Recarregar de novo não duplica: o Aporte já está lá e nada novo é gravado', async () => {
    const { ctx, pg, dados, escritas, ocioso } = await abrirFin();
    await recarregar(pg, ocioso);
    await pg.keyboard.press('Escape');
    const n = escritas.length;
    await pg.click('#recarregar'); await ocioso();
    await new Promise(ok => setTimeout(ok, 300));
    assert.equal(ajustes(dados).length, 1);
    assert.equal(escritas.filter(([m]) => m === 'POST').length, 1);
    assert.ok(escritas.length - n <= 1, `gravou de novo: ${JSON.stringify(escritas.slice(n))}`);   // no máximo confirma o mesmo valor
    await ctx.close();
});

test('vai do ciclo de hoje até o último com lançamento: cada um com a sua sobra (o seguinte conta o aporte do anterior)', async () => {
    const d = dadosDeExemplo();
    d.fin_ciclo = [{ id: 1, inicio: '2026-09-15', fim: '2026-10-14' }, { id: 2, inicio: '2026-10-15', fim: '2026-11-14' }, { id: 3, inicio: '2026-11-15', fim: '2026-12-14' }, { id: 4, inicio: '2026-12-15', fim: null }];
    d.fin.push({ id: '9', nome: 'Salário', data: '2026-11-15', valor: 9000, categ: 'Salário', cred: false, pago: false, fatura: null, freq: null },
        { id: '10', nome: 'Mercado', data: '2026-11-20', valor: -1000, categ: 'Mercado', cred: false, pago: false, fatura: null, freq: null });
    const { ctx, pg, erros, dados, ocioso } = await abrirFin('', d);
    const resumo = await recarregar(pg, ocioso);
    const A = ajustes(dados).map(l => [l.data, l.valor]).sort();
    // novembro: 9.000 − 1.000 − 950 (os tetos de Besteira, 250, e Isabella, 700, contam como gastos por inteiro e caem na
    // fatura do ciclo seguinte; ver gasto-previsto.test.js); o de outubro já foi aportado e não entra de novo
    assert.deepEqual(A, [['2026-11-14', -6679.5], ['2026-12-14', -7050]]);
    assert.match(resumo, /Outubro 2026[\s\S]*Novembro 2026/);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('sem rede no Recarregar: não consolida nada (só com os dados frescos do banco)', async () => {
    const { ctx, pg, dados, escritas, ocioso } = await abrirFin();
    dados._semRede = true;
    await pg.click('#recarregar');
    await ocioso(); await new Promise(ok => setTimeout(ok, 500));
    assert.deepEqual(escritas, []);
    assert.equal(ajustes(dados).length, 0);
    await ctx.close();
});
