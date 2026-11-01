// O ciclo desenhado inteiro, sem navegador: a carga real (carregarDados, com um banco falso) e o desenho real (vCiclo) rodam
// e o teste confere o que sai na tela. Pega a ligação entre as contas e a tela (antes, regex procurando quem chama quem).
const assert = require('node:assert/strict');
const test = require('node:test');
const { carregarTela } = require('./helpers/tela-sem-navegador');

const l = (id, nome, data, valor, extra = {}) => ({ id, nome, data, valor, categ: 'Casa', cred: false, pago: true, fatura: null, freq: null, ...extra });
const base = (...lancamentos) => ({
    fin_ciclo: [{ id: 1, inicio: '2026-09-15', fim: '2026-10-14' }, { id: 2, inicio: '2026-10-15', fim: null }],
    fin: [l(1, 'Salário', '2026-10-15', 9000, { categ: 'Salário' }), ...lancamentos], fin_meta: []
});
const desenhar = (dados, ciclo = 1) => carregarTela({ dados }).desenharCiclo(ciclo);

test('débito atrasado (de um ciclo que já fechou, em aberto) aparece no ciclo de hoje, com o aviso Atrasado na faixa Hoje', async () => {
    const { texto } = await desenhar(base(l(3, 'Luz', '2026-10-10', -150, { pago: false })));
    assert.match(texto, /Luz/);
    assert.match(texto, /Atrasado −?\s*R\$\s150,00/);
    const pago = await desenhar(base(l(3, 'Luz', '2026-10-10', -150)));             // pago: fica no ciclo dele
    assert.doesNotMatch(pago.texto, /Atrasado|Luz/);
});

test('ciclo aberto (sem fim no banco) nunca mostra 31/12/9999: o período vai até a véspera do 1º dia do ciclo seguinte previsto', async () => {
    const { html, texto } = await desenhar(base());
    assert.doesNotMatch(html, /9999/);
    assert.match(texto, /15\/10\/2026 a 14\/11\/2026/);
});
