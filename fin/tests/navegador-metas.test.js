// No navegador: o modal de metas (antes só conferido procurando o texto do código). Cada campo grava o que deve e só
// quando deve (o mês com o ano pela metade não grava; a entrada nova volta o mês dela pra 1 mês antes; entrada depois do
// mês da meta não vale), Vezes mostra até quando vão as parcelas enquanto digita, Mês a mês abre o detalhe, Excluir pede
// confirmação e Comprar abre o cadastro da compra e, ao salvar, marca a meta como comprada.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepararNavegador, abrirFin, dadosDeExemplo } = require('./helpers/navegador');

prepararNavegador();

// Ciclos de setembro/2026 a dezembro/2027 (o último aberto) e uma meta à vista em novembro
function dadosComMeta(meta = {}) {
    const d = dadosDeExemplo();
    d.fin_ciclo = Array.from({ length: 16 }, (_, i) => {
        const ini = new Date(Date.UTC(2026, 8 + i, 15)), fim = new Date(Date.UTC(2026, 9 + i, 14));
        return { id: i + 1, inicio: ini.toISOString().slice(0, 10), fim: i === 15 ? null : fim.toISOString().slice(0, 10) };
    });
    d.fin_meta = [{ id: 7, nome: 'Mesa', valor: 1500, mes: '2026-11-01', forma: 'avista', parcelas: null, entrada: null, meses_ate_parcela: null, status: 'aberta', ...meta }];
    return d;
}
async function abrirMetas(meta) {
    const r = await abrirFin('', dadosComMeta(meta));
    await r.pg.click('#btMetas');
    await r.pg.waitForSelector('#modalMetas', { state: 'visible' });
    return r;
}
const campo = c => `#corpoMetas [data-meta="7"] [data-campo="${c}"]`;
// Como o navegador faz ao terminar de digitar num campo: o valor e o change
const mudar = (pg, c, valor) => pg.$eval(campo(c), (i, v) => { i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }, valor);
// Depois de gravar, o Fin recarrega em segundo plano e redesenha o modal: o próximo passo espera isso acabar
const patches = (escritas) => escritas.filter(([m, t]) => m === 'PATCH' && t === 'fin_meta').length;

test('campos da meta: cada mudança grava; o mês com o ano pela metade não grava; valor inválido avisa e não grava', async () => {
    const { ctx, pg, erros, dados, escritas } = await abrirMetas();
    await mudar(pg, 'nome', 'Mesa de jantar');
    await pg.waitForFunction(() => document.querySelector('#corpoMetas [data-meta="7"] [data-campo="nome"]')?.value === 'Mesa de jantar');
    assert.equal(dados.fin_meta[0].nome, 'Mesa de jantar');
    await mudar(pg, 'mes', '0202-01');                                           // o navegador manda o ano a cada dígito
    await new Promise(ok => setTimeout(ok, 300));
    assert.equal(patches(escritas), 1);
    await mudar(pg, 'mes', '2027-01');
    await pg.waitForFunction(() => document.querySelector('#corpoMetas [data-meta="7"] [data-campo="mes"]')?.value === '2027-01');
    assert.equal(dados.fin_meta[0].mes, '2027-01-01');
    await mudar(pg, 'valor', '0,00');                                            // valor total zero não vale
    await pg.waitForFunction(() => /Valor inválido/.test(document.getElementById('toasts').textContent));
    assert.equal(dados.fin_meta[0].valor, 1500);
    assert.equal(patches(escritas), 2);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('parcelado: Vezes mostra até quando vão as parcelas enquanto digita; entrada nova vai pra 1 mês antes; entrada depois do mês não vale', async () => {
    const { ctx, pg, erros, dados, escritas, ocioso } = await abrirMetas({ forma: 'financiamento', parcelas: 10, valor: 6000 });
    const fim = `#corpoMetas [data-meta="7"] .vezesFim`;
    const antes = await pg.textContent(fim);
    await pg.fill(campo('parcelas'), '20');
    await pg.waitForFunction(([s, a]) => document.querySelector(s).textContent !== a, [fim, antes]);
    assert.equal(patches(escritas), 0);
    await mudar(pg, 'entrada', '1.000,00');
    await pg.waitForFunction(() => document.querySelector('#corpoMetas [data-meta="7"] [data-campo="mes_entrada"]'));
    await ocioso();
    assert.deepEqual([dados.fin_meta[0].entrada, dados.fin_meta[0].meses_ate_parcela], [1000, 1]);   // 1 mês antes da 1ª parcela
    const n = patches(escritas);
    await mudar(pg, 'mes_entrada', '2027-03');                                   // depois de novembro/2026: não vale
    await pg.waitForFunction(() => [...document.querySelectorAll('#toasts .toast strong')].some(t => t.textContent === 'Mês inválido'));
    assert.equal(patches(escritas), n);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('Mês a mês abre o detalhe da meta; Excluir pede confirmação (recusar não apaga)', async () => {
    const { ctx, pg, erros, dados, escritas } = await abrirMetas();
    await pg.click('#corpoMetas [data-meta="7"] [data-acao=mesAMes]');
    await pg.waitForSelector('#modalPlanoMeta', { state: 'visible' });
    assert.match(await pg.textContent('#corpoPlanoMeta'), /Comprometido/);
    await pg.keyboard.press('Escape');
    let resposta = false;
    pg.on('dialog', d => (resposta ? d.accept() : d.dismiss()));
    await pg.click('#corpoMetas [data-meta="7"] [data-acao=excluir]');
    await new Promise(ok => setTimeout(ok, 200));
    assert.equal(dados.fin_meta.length, 1);                                      // recusou
    resposta = true;
    await pg.click('#corpoMetas [data-meta="7"] [data-acao=excluir]');
    await pg.waitForFunction(() => /Nenhuma meta/.test(document.getElementById('corpoMetas').textContent));
    assert.deepEqual([dados.fin_meta.length, escritas.filter(([m]) => m === 'DELETE').length], [0, 1]);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('Comprar: abre o cadastro com a compra da meta; salvar grava o lançamento e marca a meta como comprada', async () => {
    const { ctx, pg, erros, dados } = await abrirMetas();
    await pg.click('#corpoMetas [data-meta="7"] [data-acao=comprar]');
    await pg.waitForSelector('#modalNovo', { state: 'visible' });
    assert.equal(await pg.isVisible('#modalMetas'), false);
    assert.equal(await pg.inputValue('#fNome'), 'Mesa');
    await pg.fill('#fCateg', 'Casa');
    await pg.click('#salvaNovo');
    await pg.waitForFunction(() => /^Salvo/.test(document.getElementById('erroNovo').textContent) || !document.getElementById('modalNovo').open);
    for (let i = 0; i < 20 && dados.fin_meta[0].status !== 'comprada'; i++) await new Promise(ok => setTimeout(ok, 100));
    assert.equal(dados.fin_meta[0].status, 'comprada');
    const compra = dados.fin.find(l => l.nome === 'Mesa');
    assert.ok(compra, 'o lançamento da compra não foi gravado');
    assert.equal(compra.valor, -1500);
    assert.deepEqual(erros, []);
    await ctx.close();
});

// Uma meta que não cabe: R$ 60.000 em 3× no débito em dezembro, com o salário de cada mês lançado
function dadosQueNaoCabe() {
    const d = dadosComMeta({ nome: 'Carro', valor: 60000, mes: '2026-12-01', forma: 'financiamento', parcelas: 3 });
    d.fin.push(...Array.from({ length: 15 }, (_, i) => ({ id: String(100 + i), nome: 'Salário', data: new Date(Date.UTC(2026, 10 + i, 15)).toISOString().slice(0, 10), valor: 9000, categ: 'Salário', cred: false, pago: false, fatura: null, freq: null })));
    return d;
}

async function abrirQueNaoCabe() {
    const r = await abrirFin('', dadosQueNaoCabe());
    await r.pg.click('#btMetas'); await r.pg.waitForSelector('#modalMetas', { state: 'visible' });
    return r;
}

test('meta que não cabe: diz que não cabe; Mínimo usa as vezes que cabem; as formas são só À vista e os dois parcelados', async () => {
    const { ctx, pg, erros, dados, ocioso } = await abrirQueNaoCabe();
    assert.match(await pg.textContent('#corpoMetas'), /Não cabe/);
    assert.deepEqual(await pg.$$eval(`${campo('forma')} option`, L => L.map(o => o.textContent.trim())), ['À vista', 'Parcelado Crédito', 'Parcelado Débito']);
    const minimo = await pg.getAttribute('#corpoMetas [data-acao=usarVezes]', 'data-vezes');
    await pg.click('#corpoMetas [data-acao=usarVezes]');
    await ocioso();
    assert.equal(dados.fin_meta[0].parcelas, +minimo);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('meta que não cabe: "Cabe começando em …" muda o mês da meta para o que cabe', async () => {
    const { ctx, pg, erros, dados, ocioso } = await abrirQueNaoCabe();
    const mes = await pg.getAttribute('#corpoMetas [data-acao=usarMes]', 'data-mes');
    assert.ok(mes > '2026-12-01', mes);
    await pg.click('#corpoMetas [data-acao=usarMes]');
    await ocioso();
    assert.equal(dados.fin_meta[0].mes, mes);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('Mês a mês da meta que não cabe: Simular a receita liga a simulação sem gravar nada; o comprometido abre a lista', async () => {
    const { ctx, pg, erros, escritas } = await abrirFin('', dadosQueNaoCabe());
    await pg.click('#btMetas'); await pg.waitForSelector('#modalMetas', { state: 'visible' });
    await pg.click('#corpoMetas [data-meta="7"] [data-acao=mesAMes]');
    await pg.waitForSelector('#modalPlanoMeta', { state: 'visible' });
    await pg.click('#corpoPlanoMeta [data-acao=verComprometidos]');
    await pg.waitForSelector('#modalComprometidos', { state: 'visible' });
    await pg.keyboard.press('Escape');
    await pg.click('#corpoPlanoMeta [data-acao=simularReceita]');
    await pg.waitForFunction(() => document.getElementById('toggleSimulacao').classList.contains('ativo'));
    assert.deepEqual(escritas, []);                                              // simular é só na memória
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('sem a tabela de metas (antes da migration 36), o botão Metas não aparece e a tela abre normal', async () => {
    const d = dadosDeExemplo(); delete d.fin_meta;
    const { ctx, pg, erros } = await abrirFin('', d);
    assert.equal(await pg.isVisible('#btMetas'), false);
    assert.deepEqual(erros, []);
    await ctx.close();
});
