// No navegador, num celular (390 × 844, com toque): o que antes só era conferido procurando o texto do código e agora é
// medido na tela. Arrastar de lado troca de ciclo como as setas (e não troca onde não deve); nada estoura a largura da tela;
// as tabelas mostram Data, Nome e Valor na primeira tela, com o Nome parado ao rolar de lado; o cadastro sem vão sobrando sob
// Categorias e com Salvar no fim do modal; e a compra parcelada mostra uma fatura só no campo, com as outras num modal.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepararNavegador, abrirFin } = require('./helpers/navegador');

prepararNavegador();

// Gesto de dedo de verdade (CDP): de x1 a x2 na altura y, em 10 passos de 16 ms (um gesto rápido, como no celular)
async function arrastar(ctx, pg, x1, x2, y) {
    const cdp = await ctx.newCDPSession(pg);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / 10, y }] }); await new Promise(ok => setTimeout(ok, 16)); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const meio = async (pg, sel) => { const b = await pg.locator(sel).first().boundingBox(); return b.y + b.height / 2; };
const tabela = pg => pg.$eval('#out', el => el.textContent);

test('arrastar: para a direita o ciclo anterior, para a esquerda o seguinte; na ponta, com modal aberto ou num campo, não troca', async () => {
    const { ctx, pg, erros } = await abrirFin('', undefined, 0, { celular: true });
    const y = await meio(pg, '#indicadoresFinanceiros');
    await arrastar(ctx, pg, 80, 330, y);                                           // para a direita: o anterior
    await pg.waitForFunction(() => /Aluguel/.test(document.getElementById('out').textContent));
    await arrastar(ctx, pg, 330, 80, y);                                           // para a esquerda: o seguinte
    await pg.waitForFunction(() => /Mercado/.test(document.getElementById('out').textContent));
    const ciclo = () => pg.$eval('#ciclo', s => s.value);
    while (!(await pg.isDisabled('#cicloAnterior'))) await pg.click('#cicloAnterior');   // o 1º ciclo (o Backlog): na ponta
    const ponta = await ciclo();
    await arrastar(ctx, pg, 80, 330, y);
    assert.equal(await ciclo(), ponta);                                            // não passa do 1º
    while (!(await pg.isDisabled('#cicloProximo'))) await pg.click('#cicloProximo');     // volta ao de hoje
    await pg.waitForFunction(() => /Mercado/.test(document.getElementById('out').textContent));
    await arrastar(ctx, pg, 340, 300, y);                                          // 40 px devagar não é gesto
    assert.match(await tabela(pg), /Mercado/);
    await pg.click('#abreNovo'); await pg.waitForSelector('#modalNovo', { state: 'visible' });
    await arrastar(ctx, pg, 80, 330, await meio(pg, '#fNome'));                    // com o cadastro aberto
    await pg.click('#fechaNovo');
    assert.match(await tabela(pg), /Mercado/);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('celular: nada estoura a largura; a navegação de ciclo, a simulação e as ferramentas ficam visíveis, sem menu escondido', async () => {
    const { ctx, pg } = await abrirFin('', undefined, 0, { celular: true });
    assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'a página rola de lado');
    for (const sel of ['#cicloAnterior', '#cicloProximo', '#fde', '#fate', '#toggleSimulacao', '#abreNovo', '#btMetas', '#voltarHub']) {
        const b = await pg.locator(sel).boundingBox();
        assert.ok(b && b.width > 0 && b.x >= 0 && b.x + b.width <= 391, `${sel} fora da tela: ${JSON.stringify(b)}`);
    }
    await pg.click('#out tr[data-sid="2"]');                                     // selecionar: a barra de seleção também cabe
    await pg.waitForSelector('#selbar', { state: 'visible' });
    for (const sel of ['#selbar', '#seledit', '#seldup', '#seldel']) {
        const b = await pg.locator(sel).boundingBox();
        assert.ok(b && b.x >= 0 && b.x + b.width <= 391, `${sel} fora da tela: ${JSON.stringify(b)}`);
    }
    await ctx.close();
});

test('celular: Data, Nome e Valor na primeira tela (ano com 2 dígitos); rolando a tabela de lado, o Nome fica parado', async () => {
    const { ctx, pg } = await abrirFin('', undefined, 0, { celular: true });
    const linha = '#out tr[data-sid="2"]';
    const celulas = await pg.$eval(linha, tr => [...tr.cells].map(td => ({ t: td.innerText.trim(), x: td.getBoundingClientRect().x, d: td.getBoundingClientRect().right })));
    const data = celulas.find(c => /16\/10\/26/.test(c.t)), nome = celulas.find(c => c.t === 'Mercado'), valor = celulas.find(c => /320,50/.test(c.t));
    assert.ok(data && nome && valor, JSON.stringify(celulas.slice(0, 4)));         // 16/10/26: o século (20) fica escondido
    assert.ok(valor.d <= 390, `Valor fora da 1ª tela: ${valor.d}`);
    // Rolando de lado, a Data sai e o Nome gruda na borda esquerda da tabela (sem isso, sairia da tela junto)
    const r = await pg.$eval(`${linha} td.cNome`, td => { const caixa = td.closest('.wrap, .wx'); caixa.scrollLeft = 300; return [caixa.scrollLeft, td.getBoundingClientRect().x - caixa.getBoundingClientRect().x]; });
    assert.ok(r[0] > 0, 'a tabela não rolou');
    assert.ok(Math.abs(r[1]) <= 1, `o Nome não ficou na borda: ${r[1]}`);
    await ctx.close();
});

test('cadastro: sem mensagem, o vão sob Categorias é o mesmo dos outros campos; no celular, Salvar fica no fim do modal', async () => {
    const { ctx, pg } = await abrirFin('', undefined, 0, { celular: true });
    await pg.click('#abreNovo'); await pg.waitForSelector('#modalNovo', { state: 'visible' });
    const m = await pg.evaluate(() => {
        const b = id => document.getElementById(id).getBoundingClientRect();
        const campo = id => document.getElementById(id).closest('.fm, label, div').getBoundingClientRect();
        return { erro: document.getElementById('erroNovo').textContent, categSalvar: b('salvaNovo').top - campo('fCateg').bottom,
            nomeData: campo('fData').top - campo('fNome').bottom, fimModal: b('modalNovo').bottom - b('salvaNovo').bottom };
    });
    assert.equal(m.erro, '');
    assert.ok(m.categSalvar <= m.nomeData * 2 + 1, `vão sob Categorias (${m.categSalvar}) bem maior que entre campos (${m.nomeData})`);
    assert.ok(m.fimModal >= 0 && m.fimModal < 48, `Salvar longe do fim do modal: ${m.fimModal}`);
    await ctx.close();
});

test('compra parcelada: o campo mostra a fatura da 1ª parcela e "+N"; as outras abrem num modal; no débito, "—" desativado', async () => {
    const { ctx, pg } = await abrirFin('', undefined, 0, { celular: true });
    await pg.click('#abreNovo'); await pg.waitForSelector('#modalNovo', { state: 'visible' });
    const altura = () => pg.$eval('#fFaturasWrap', e => Math.round(e.getBoundingClientRect().height));
    const antes = await altura();
    await pg.selectOption('#fParcelas', '12');
    assert.equal(await pg.locator('#faturaPrincipal select').count(), 1);
    assert.match(await pg.textContent('#fFaturasMais'), /\+11/);
    assert.equal(await altura(), antes);                                            // o campo não cresce com as parcelas
    await pg.click('#fFaturasMais');
    await pg.waitForSelector('#modalFaturasParcelas', { state: 'visible' });
    assert.equal(await pg.locator('#faturasPorParcela select').count(), 11);
    assert.match(await pg.textContent('#faturasPorParcela'), /Parcela 2[\s\S]*Parcela 12/);
    await pg.keyboard.press('Escape');
    await pg.$eval('#fCred', e => { if (e.checked) e.click(); });                  // débito
    assert.equal(await pg.isDisabled('#faturaPrincipal select'), true);
    assert.equal((await pg.textContent('#faturaPrincipal select')).trim(), '—');
    await ctx.close();
});
