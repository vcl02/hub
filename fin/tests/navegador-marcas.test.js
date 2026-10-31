// No navegador: as marcas Reserva e Comprometido do lançamento (antes só conferido procurando o texto do código). No
// cadastro vêm desmarcadas e, marcadas, gravam em todas as parcelas; na tabela a célula mostra "—" e o toque grava na hora
// (na simulação, só na memória); Duplicar e Editar levam as marcas; o cabeçalho tem a pergunta que decide cada uma.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepararNavegador, abrirFin, dadosDeExemplo } = require('./helpers/navegador');

prepararNavegador();
const linha = id => `#out tr[data-sid="${id}"]`;
const celula = (pg, chave, id) => pg.$eval(`${linha(id)} [data-tog-flag="${chave}:${id}"]`, e => e.textContent.trim());

test('cadastro: Reserva e Comprometido desmarcados; marcados, gravam em todas as parcelas', async () => {
    const { ctx, pg, erros, dados } = await abrirFin();
    await pg.click('#abreNovo'); await pg.waitForSelector('#modalNovo', { state: 'visible' });
    assert.deepEqual([await pg.isChecked('#fReserva'), await pg.isChecked('#fComprometido')], [false, false]);
    await pg.$eval('#fReserva', e => e.click()); await pg.$eval('#fComprometido', e => e.click());
    await pg.fill('#fNome', 'Escola'); await pg.fill('#fValor', '90000'); await pg.fill('#fCateg', 'Educação');
    await pg.selectOption('#fParcelas', '3');
    await pg.click('#salvaNovo');
    await pg.waitForFunction(() => /^Salvo/.test(document.getElementById('erroNovo').textContent));
    const serie = dados.fin.filter(l => l.nome === 'Escola');
    assert.equal(serie.length, 3);
    assert.ok(serie.every(l => l.reserva === true && l.comprometido === true), JSON.stringify(serie));
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('tabela: "—" quando desmarcado; tocar marca e grava na hora; na simulação, só na tela', async () => {
    const { ctx, pg, erros, dados, escritas } = await abrirFin();
    assert.equal(await celula(pg, 'reserva', '2'), '—');
    await pg.click(`${linha(2)} [data-tog-flag="reserva:2"]`);
    await pg.waitForFunction(() => document.querySelector('#out tr[data-sid="2"] [data-tog-flag="reserva:2"]').textContent.trim() !== '—');
    assert.equal(dados.fin.find(l => l.id === '2').reserva, true);
    assert.deepEqual(escritas, [['PATCH', 'fin']]);
    await pg.click('#toggleSimulacao');
    await pg.waitForFunction(() => document.getElementById('toggleSimulacao').classList.contains('ativo'));
    await pg.click(`${linha(2)} [data-tog-flag="comprometido:2"]`);
    await pg.waitForFunction(() => document.querySelector('#out tr[data-sid="2"] [data-tog-flag="comprometido:2"]').textContent.trim() !== '—');
    assert.deepEqual(escritas, [['PATCH', 'fin']]);                              // nada a mais no banco
    assert.equal(dados.fin.find(l => l.id === '2').comprometido, undefined);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('Duplicar herda as marcas; Editar reenvia as duas no PATCH', async () => {
    const d = dadosDeExemplo();
    Object.assign(d.fin.find(l => l.id === '2'), { reserva: true, comprometido: false });
    const { ctx, pg, erros } = await abrirFin('', d);
    const corpos = [];
    pg.on('request', r => { if (r.method() === 'PATCH') corpos.push(JSON.parse(r.postData())); });
    await pg.click(linha(2) + ' td:last-child');
    await pg.click('#seldup'); await pg.waitForSelector('#modalNovo', { state: 'visible' });
    assert.deepEqual([await pg.isChecked('#fReserva'), await pg.isChecked('#fComprometido')], [true, false]);
    await pg.click('#fechaNovo');
    if (!(await pg.isVisible('#selbar'))) await pg.click(linha(2) + ' td:last-child');   // fechar o cadastro pode limpar a seleção
    await pg.click('#seledit'); await pg.waitForSelector('#modalNovo', { state: 'visible' });
    assert.deepEqual([await pg.isChecked('#fReserva'), await pg.isChecked('#fComprometido')], [true, false]);
    await pg.fill('#fNome', 'Mercado do mês');
    await pg.click('#salvaNovo');
    await pg.waitForFunction(() => /Mercado do mês/.test(document.getElementById('out').textContent));
    assert.ok(corpos.some(c => c.reserva === true && c.comprometido === false && c.nome === 'Mercado do mês'), JSON.stringify(corpos));
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('o cabeçalho de Reserva e de Comprometido tem a pergunta que decide a marca', async () => {
    const { ctx, pg } = await abrirFin();
    const dicas = await pg.$$eval('#out thead th[title]', L => L.map(th => th.title));
    assert.ok(dicas.includes('Se eu perder o emprego, preciso continuar pagando isso?'), JSON.stringify(dicas));
    assert.ok(dicas.includes('Começou o mês, isso já é obrigatório pagar?'));
    await ctx.close();
});

test('Frequência: Vezes desativa e só pede a 1ª fatura; sem data, avisa; salva a série mensal até dez/2032 e o cadastro volta ao normal', async () => {
    const { ctx, pg, erros, dados, ocioso } = await abrirFin();
    await pg.click('#abreNovo'); await pg.waitForSelector('#modalNovo', { state: 'visible' });
    await pg.fill('#fNome', 'Internet'); await pg.fill('#fValor', '10000'); await pg.fill('#fCateg', 'Casa');
    await pg.selectOption('#fFreq', 'Mensal');
    assert.equal(await pg.isDisabled('#fParcelas'), true);
    assert.equal(await pg.locator('[data-fatura-parcela]').count(), 1);          // só a 1ª fatura
    assert.equal(await pg.getAttribute('#faturaPrincipal select', 'title'), '1ª fatura');
    await pg.fill('#fData', '');
    await pg.click('#salvaNovo');
    assert.equal(await pg.textContent('#erroNovo'), 'Escolha a data da 1ª ocorrência.');
    await pg.fill('#fData', '2026-10-20');
    await pg.$eval('#fDivide', e => { if (e.checked) e.click(); });            // conta mensal: o valor se repete (marcado, divide entre as 75)
    await pg.click('#salvaNovo');
    await pg.waitForFunction(() => /^Salvo/.test(document.getElementById('erroNovo').textContent));
    await ocioso();
    const serie = dados.fin.filter(l => l.nome === 'Internet').sort((a, b) => a.data.localeCompare(b.data));
    assert.equal(serie.length, 75);                                               // out/2026 a dez/2032
    assert.deepEqual([serie[0].data, serie.at(-1).data, serie[0].fatura, serie[1].fatura], ['2026-10-20', '2032-12-20', '2026-11-12', '2026-12-12']);
    assert.ok(serie.every(l => l.freq === 'Mensal' && l.valor === -100));
    assert.equal(await pg.inputValue('#fFreq'), '');                              // de volta a "sem recorrência"
    assert.equal(await pg.isDisabled('#fParcelas'), false);
    assert.deepEqual(erros, []);
    await ctx.close();
});
