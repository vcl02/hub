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

test('Data na própria célula: digitar o dia "19" grava 19 (não 1), uma vez só', async () => {
    const { ctx, pg, erros, dados, escritas } = await abrirFin();
    await pg.click(`${linha(2)} [data-tog-data]`);
    const campo = `${linha(2)} input[type=date]`;
    await pg.waitForSelector(campo);
    // O que o campo de data faz ao digitar "1" e "9" no dia: com o "1", a data já é válida e ele dispara change (01/10);
    // com o "9", input e change de novo (19/10). A ordem dos segmentos depende do idioma do navegador, então os eventos
    // vão direto, os mesmos e na mesma ordem.
    const digitar = (valor, ...eventos) => pg.$eval(campo, (i, [v, ev]) => { i.value = v; ev.forEach(e => i.dispatchEvent(new Event(e, { bubbles: true }))); }, [valor, eventos]);
    await digitar('2026-10-01', 'input', 'change');
    await new Promise(ok => setTimeout(ok, 100));
    await digitar('2026-10-19', 'input', 'change');
    await pg.waitForFunction(() => document.querySelector('#out tr[data-sid="2"]')?.textContent.includes('19/10/2026'));
    await new Promise(ok => setTimeout(ok, 600));                               // passou a espera de 450 ms: só um pedido
    assert.deepEqual(escritas, [['PATCH', 'fin']]);
    assert.equal(dados.fin.find(l => l.id === '2').data, '2026-10-19');
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('Excluir com várias linhas marcadas: apaga todas as reais (uma confirmação) e ignora a sintética marcada junto', async () => {
    const { ctx, pg, erros, dados, escritas } = await abrirFin();
    const dialogos = [];
    pg.on('dialog', d => { dialogos.push(d.message()); d.accept(); });
    const sintetica = await pg.$$eval('#out tbody tr[data-sid]', L => L.find(tr => /Saldo do mês anterior/.test(tr.textContent))?.dataset.sid);
    for (const sid of ['1', '2', sintetica].filter(Boolean)) await pg.click(`${linha(sid)} td:last-child`);
    await pg.waitForSelector('#seldel', { state: 'visible' });
    await pg.click('#seldel');
    await pg.waitForFunction(() => !/Mercado|Salário/.test(document.getElementById('out').textContent));
    assert.equal(dialogos.length, 1);
    assert.match(dialogos[0], /2 lançamentos/);
    assert.deepEqual(escritas.filter(([m]) => m === 'DELETE').length, 2);
    assert.deepEqual(dados.fin.map(l => l.nome), ['Aluguel']);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('comparar dois ciclos: as colunas dizem onde acabou e onde começou; o botão Todas/Diferentes só liga com 2 ciclos e filtra', async () => {
    const { ctx, pg, erros } = await abrirFin();
    assert.equal(await pg.isDisabled('#btSomenteDif'), true);                    // sem comparar: desativado
    const valor = nome => pg.$$eval('#compDe option', (L, n) => L.find(o => o.text.startsWith(n))?.value, nome);
    await pg.selectOption('#compDe', await valor('Set')); await pg.selectOption('#compAte', await valor('Out'));
    await pg.waitForFunction(() => !document.getElementById('btSomenteDif').disabled);
    const categorias = async () => +(await textoDaTabela(pg)).match(/(\d+) Categorias/)[1];
    const t = await textoDaTabela(pg);
    assert.match(t, /Acabou em Setembro/); assert.match(t, /Começou em Outubro/);
    const todas = await categorias();
    assert.ok(todas >= 3, `categorias: ${todas}`);
    await pg.click('#btSomenteDif');
    assert.equal(await pg.getAttribute('#btSomenteDif', 'aria-pressed'), 'true');
    assert.ok(await categorias() < todas);                                       // Diferentes: menos linhas
    await pg.click('#btSomenteDif');
    assert.equal(await categorias(), todas);                                      // Todas de novo
    await pg.selectOption('#compAte', '');                                        // um ciclo só: desativa
    await pg.waitForFunction(() => document.getElementById('btSomenteDif').disabled);
    assert.deepEqual(erros, []);
    await ctx.close();
});
