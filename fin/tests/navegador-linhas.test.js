// No navegador: o que se faz direto numa linha da tabela, sem abrir o cadastro (antes só conferido procurando o texto do
// código). O ± inverte o sinal e grava na hora (na simulação, só na memória); tocar no Nome abre o campo na própria célula e
// Enter grava; linha que não é lançamento (o saldo do mês anterior) não abre edição. E a compra parcelada grava a série
// inteira num pedido só, com o número da série.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepararNavegador, abrirFin, textoDaTabela } = require('./helpers/navegador');

prepararNavegador();
const linha = id => `#out tr[data-sid="${id}"]`;

test('±: inverte o sinal do lançamento e grava uma vez (PATCH só do valor); na simulação, só na tela', async () => {
    const { ctx, pg, erros, dados, escritas } = await abrirFin();
    await pg.click(`${linha(2)} [data-tog-sinal]`);
    await pg.waitForFunction(() => /\+R\$\s320,50/.test(document.querySelector('#out tr[data-sid="2"]').textContent));
    assert.deepEqual(escritas, [['PATCH', 'fin']]);
    assert.equal(dados.fin.find(l => l.id === '2').valor, 320.5);
    await pg.click('#toggleSimulacao');
    await pg.waitForFunction(() => document.getElementById('toggleSimulacao').classList.contains('ativo'));
    await pg.click(`${linha(2)} [data-tog-sinal]`);
    await pg.waitForFunction(() => /−R\$\s320,50/.test(document.querySelector('#out tr[data-sid="2"]').textContent));
    assert.deepEqual(escritas, [['PATCH', 'fin']]);                                // nada a mais no banco
    assert.equal(dados.fin.find(l => l.id === '2').valor, 320.5);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('Nome na própria célula: tocar abre o campo, Enter grava aparado; tocar fora do texto só seleciona a linha', async () => {
    const { ctx, pg, erros, dados, escritas } = await abrirFin();
    await pg.click(`${linha(2)} [data-tog-nome]`);
    const campo = `${linha(2)} input`;
    await pg.waitForSelector(campo);
    await pg.fill(campo, '  Feira  '); await pg.press(campo, 'Enter');
    await pg.waitForFunction(() => /Feira/.test(document.getElementById('out').textContent));
    assert.deepEqual(escritas, [['PATCH', 'fin']]);
    assert.equal(dados.fin.find(l => l.id === '2').nome, 'Feira');
    assert.equal(await pg.isVisible('#selbar'), false);                            // editar não selecionou a linha
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('linha que não é lançamento (saldo do mês anterior) não tem edição nem ±', async () => {
    const { ctx, pg } = await abrirFin();
    const sintetica = await pg.$$eval('#out tbody tr', L => L.filter(tr => /Saldo do mês anterior/.test(tr.textContent)).map(tr => [tr.querySelectorAll('[data-tog-nome]').length, tr.querySelectorAll('[data-tog-sinal]:not([disabled])').length]));
    assert.ok(sintetica.length > 0, 'sem a linha do saldo anterior');
    assert.deepEqual(sintetica[0], [0, 0]);
    await ctx.close();
});

test('compra parcelada: as 12 parcelas gravam num pedido só, com o mesmo número de série e uma fatura por mês', async () => {
    const { ctx, pg, erros, dados, escritas } = await abrirFin();
    await pg.click('#abreNovo'); await pg.waitForSelector('#modalNovo', { state: 'visible' });
    await pg.fill('#fNome', 'Geladeira'); await pg.fill('#fValor', '360000'); await pg.fill('#fCateg', 'Casa');
    await pg.selectOption('#fParcelas', '12');
    await pg.click('#salvaNovo');
    await pg.waitForFunction(() => document.getElementById('erroNovo').textContent.startsWith('Salvo'));
    assert.doesNotMatch(await pg.textContent('#erroNovo'), /sem o vínculo/);
    assert.deepEqual(escritas.filter(([m]) => m === 'POST'), [['POST', 'fin']]);  // um INSERT com as 12
    const serie = dados.fin.filter(l => l.nome === 'Geladeira');
    assert.equal(serie.length, 12);
    assert.deepEqual([...new Set(serie.map(l => l.recorrencia_id))], [1]);
    assert.equal(new Set(serie.map(l => l.fatura)).size, 12);
    assert.ok(serie.every(l => l.valor === -300 && l.cred === true));
    assert.match(await textoDaTabela(pg), /Usado R\$\s3\.600,00/);                // no débito do ciclo entra como Fatura; no limite do cartão, a série toda
    assert.deepEqual(erros, []);
    await ctx.close();
});
