// No navegador (Chromium do Playwright de ../tr): o Fin servido dentro do hub (/hub/fin/), com login no hub e um Supabase
// falso em memória (auth do falso do tr; as tabelas fin, fin_ciclo e fin_meta aqui). Nada sai pra rede nem toca o banco real.
// Cobre o que os testes de funções não veem: a tela abre com os dados, lançar e apagar gravam uma vez e aparecem, a troca
// de ciclo vai para o endereço e nenhum arquivo falta nem dá erro na página.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { HOJE, prepararNavegador, abrirFin, dadosDeExemplo, textoDaTabela } = require('./helpers/navegador');

prepararNavegador();

test('abre no ciclo de hoje com os lançamentos dele, sem erro nem arquivo faltando', async () => {
    const { ctx, pg, erros, faltando } = await abrirFin();
    const t = await textoDaTabela(pg);
    assert.match(t, /Salário/); assert.match(t, /Mercado/);
    assert.doesNotMatch(t, /Aluguel/);                                    // do ciclo anterior
    assert.equal(await pg.getAttribute('#voltarHub', 'href'), '../');
    assert.deepEqual([erros, faltando], [[], []]);
    await ctx.close();
});

test('ciclo anterior: vai para o endereço (?ciclo) e mostra os lançamentos dele; recarregar mantém', async () => {
    const { ctx, pg, erros } = await abrirFin();
    await pg.click('#cicloAnterior');
    await pg.waitForFunction(() => /Aluguel/.test(document.getElementById('out').textContent));
    assert.match(pg.url(), /[?&]ciclo=/);
    const endereco = pg.url();
    await pg.reload();
    await pg.waitForFunction(() => /Aluguel/.test(document.getElementById('out').textContent));
    assert.equal(pg.url(), endereco);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('lançar um gasto: grava uma vez só (mesmo com toque repetido) e aparece no ciclo', async () => {
    const { ctx, pg, erros, dados, escritas } = await abrirFin();
    await pg.click('#abreNovo');
    await pg.waitForSelector('#modalNovo', { state: 'visible' });
    await pg.$eval('#fCred', e => { if (e.checked) e.click(); });                               // no débito: entra neste ciclo (no crédito, na fatura)
    await pg.fill('#fNome', 'Café');
    await pg.fill('#fValor', '1200');                                     // o campo é em centavos: 1200 = R$ 12,00
    await pg.fill('#fCateg', 'Besteira');
    await Promise.all([pg.click('#salvaNovo'), pg.click('#salvaNovo', { timeout: 500 }).catch(() => {})]);   // o 2º toque não grava de novo
    await pg.waitForFunction(() => /Café/.test(document.getElementById('out').textContent));
    assert.deepEqual(escritas.filter(([m, t]) => m === 'POST' && t === 'fin').length, 1);
    const novo = dados.fin.find(l => l.nome === 'Café');
    assert.equal(novo.data, HOJE);
    assert.deepEqual([novo.valor, novo.cred, novo.categ], [-12, false, 'Besteira']);   // gasto: negativo
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('apagar: tocar na linha seleciona; Excluir pede confirmação, grava um DELETE só e a linha some', async () => {
    const { ctx, pg, erros, dados, escritas } = await abrirFin();
    pg.on('dialog', d => d.accept());                                      // o "Excluir "Mercado"? Não dá pra desfazer."
    await pg.click('#out tr[data-sid="2"]');
    await pg.waitForSelector('#selbar', { state: 'visible' });
    await Promise.all([pg.click('#seldel'), pg.click('#seldel', { timeout: 500 }).catch(() => {})]);   // o 2º toque com o pedido no ar não repete
    await pg.waitForFunction(() => !/Mercado/.test(document.getElementById('out').textContent));
    assert.deepEqual(escritas.filter(([m]) => m === 'DELETE'), [['DELETE', 'fin']]);
    assert.equal(dados.fin.some(l => l.nome === 'Mercado'), false);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('simulação: lançar na simulação aparece na tela mas não grava nada; desligar descarta', async () => {
    const { ctx, pg, erros, dados, escritas } = await abrirFin();
    await pg.click('#toggleSimulacao');
    await pg.waitForFunction(() => document.getElementById('toggleSimulacao').classList.contains('ativo'));
    await pg.click('#abreNovo');
    await pg.waitForSelector('#modalNovo', { state: 'visible' });
    await pg.$eval('#fCred', e => { if (e.checked) e.click(); });
    await pg.fill('#fNome', 'Viagem simulada'); await pg.fill('#fValor', '50000'); await pg.fill('#fCateg', 'Lazer');
    await pg.click('#salvaNovo');
    await pg.waitForFunction(() => /Viagem simulada/.test(document.getElementById('out').textContent));
    assert.deepEqual(escritas, []);                                                // nada foi para o banco
    assert.equal(dados.fin.some(l => l.nome === 'Viagem simulada'), false);
    await pg.click('#fechaNovo');
    await pg.click('#toggleSimulacao');                                            // desligar: recarrega do banco
    await pg.waitForFunction(() => !document.getElementById('toggleSimulacao').classList.contains('ativo'));
    await pg.waitForFunction(() => !/Viagem simulada/.test(document.getElementById('out').textContent));
    assert.deepEqual([escritas, erros], [[], []]);
    await ctx.close();
});

test('metas: o botão aparece com a tabela; Nova meta grava uma vez só (mesmo com toque repetido) e aparece na lista', async () => {
    const { ctx, pg, erros, dados, escritas } = await abrirFin('', dadosDeExemplo(), 300);   // rede lenta
    await pg.click('#btMetas');
    await pg.waitForSelector('#modalMetas', { state: 'visible' });
    const nova = '#modalMetas [data-acao=novaMeta]';
    await Promise.all([pg.click(nova), pg.click(nova, { timeout: 500 }).catch(() => {})]);
    await pg.waitForFunction(() => [...document.querySelectorAll('#corpoMetas input')].some(i => i.value === 'Nova meta'));   // a meta vem em campos editáveis
    await pg.waitForTimeout(400);                                                  // tempo de um 2º pedido chegar, se houvesse
    assert.deepEqual(escritas.filter(([m]) => m === 'POST'), [['POST', 'fin_meta']]);
    assert.deepEqual(dados.fin_meta.map(m => [m.nome, m.valor, m.forma]), [['Nova meta', 1000, 'avista']]);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('cartão: compra lançada no crédito entra na fatura do Nubank, que o botão dele abre', async () => {
    const { ctx, pg, erros, dados } = await abrirFin();
    await pg.click('#abreNovo');
    await pg.waitForSelector('#modalNovo', { state: 'visible' });
    assert.equal(await pg.isChecked('#fCred'), true);                              // crédito é o padrão
    await pg.fill('#fNome', 'Tênis'); await pg.fill('#fValor', '40000'); await pg.fill('#fCateg', 'Roupas');
    await pg.click('#salvaNovo');
    await pg.waitForFunction(() => document.getElementById('erroNovo').textContent.startsWith('Salvo'));
    await pg.click('#fechaNovo');
    const tenis = dados.fin.find(l => l.nome === 'Tênis');
    assert.deepEqual([tenis.cred, tenis.valor, tenis.fatura], [true, -400, '2026-11-12']);   // vence no dia 12: Nubank
    await pg.click('#btNubank');
    await pg.waitForSelector('#modalCartao', { state: 'visible' });
    assert.match(await pg.textContent('#tituloCartao'), /Nubank/);
    assert.match((await pg.textContent('#corpoCartao')).replace(/\s+/g, ' '), /Usado ?R\$ ?400,00/);
    assert.deepEqual(erros, []);
    await ctx.close();
});
