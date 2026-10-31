// No navegador: o diagnóstico (antes só conferido procurando o texto do código). Dado inconsistente acende o botão e o
// modal separa inconsistências de avisos; a carga lenta avisa por toast e deixa uma linha só no Console; falha de carga
// avisa por toast (nunca alert) e na própria tela; tocar fora fecha o modal.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepararNavegador, abrirFin, dadosDeExemplo } = require('./helpers/navegador');

prepararNavegador();
const toasts = pg => pg.$$eval('#toasts .toast strong', L => L.map(t => t.textContent));

test('dado inconsistente acende o botão; o modal separa inconsistências de avisos; tocar fora fecha', async () => {
    const d = dadosDeExemplo();
    d.fin.push({ id: '30', nome: 'Sem fatura', data: '2026-10-17', valor: -50, categ: 'Compras', cred: true, pago: true, fatura: null, freq: null });   // crédito sem fatura
    d.fin_ciclo = [{ id: 1, inicio: '2026-08-01', fim: '2026-08-31' }, ...d.fin_ciclo];   // buraco entre 31/08 e 15/09: aviso
    const { ctx, pg, erros } = await abrirFin('', d);
    assert.equal(await pg.$eval('#btDiagnostico', b => b.classList.contains('temInconsistencia')), true);
    await pg.click('#btDiagnostico');
    await pg.waitForSelector('#modalDiagnostico', { state: 'visible' });
    assert.match(await pg.textContent('#listaInconsistencias'), /crédito sem fatura vinculada/);
    assert.match(await pg.textContent('#listaAvisos'), /Sem ciclo entre 2026-09-01/);
    const b = await pg.locator('#modalDiagnostico').boundingBox();
    await pg.mouse.click(b.x + 2, b.y + 2);                                      // na borda do diálogo (o fundo dele)
    await pg.waitForSelector('#modalDiagnostico', { state: 'hidden' });
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('sem nada errado, o botão de diagnóstico fica apagado', async () => {
    const { ctx, pg } = await abrirFin();
    assert.equal(await pg.$eval('#btDiagnostico', b => b.classList.contains('temInconsistencia')), false);
    await ctx.close();
});

test('carga lenta (1 s ou mais): toast "Carga lenta" e uma linha só de métricas no Console; nada de alert', async () => {
    const { ctx, pg, dados, ocioso } = await abrirFin();
    const consola = [], alertas = [];
    pg.on('console', m => consola.push([m.type(), m.text()]));
    pg.on('dialog', d => { alertas.push(d.message()); d.dismiss(); });
    dados._leituraLenta = 600;                                                   // várias leituras em fila: passa de 1 s
    await pg.click('#cicloAnterior'); await pg.click('#cicloProximo');
    await pg.evaluate(() => load());
    await ocioso();
    assert.ok((await toasts(pg)).includes('Carga lenta'), JSON.stringify(await toasts(pg)));
    const diag = consola.filter(([, t]) => t.startsWith('[diag]'));
    assert.equal(diag.length, 1, JSON.stringify(consola));
    assert.match(diag[0][1], /^\[diag\] carga \d+ms/);
    assert.ok(!consola.some(([tipo]) => tipo === 'error'), JSON.stringify(consola));
    assert.deepEqual(alertas, []);
    await ctx.close();
});

test('falha de carga: toast, sem alert, e a tela diz que pode tentar de novo sem duplicar', async () => {
    const { ctx, pg, dados, ocioso } = await abrirFin();
    const alertas = [];
    pg.on('dialog', d => { alertas.push(d.message()); d.dismiss(); });
    dados._semRede = true;
    await pg.evaluate(() => load());
    await ocioso();
    await pg.waitForFunction(() => [...document.querySelectorAll('#toasts .toast strong')].some(t => /Não foi possível carregar/.test(t.textContent)));
    assert.deepEqual(alertas, []);
    assert.match(await pg.textContent('#out'), /Falhou: carregar[\s\S]*repetir não duplica nada/);   // a tela diz o que houve e que pode tentar de novo
    await ctx.close();
});
