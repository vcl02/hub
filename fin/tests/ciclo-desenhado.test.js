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

const dadosComparacao = () => base(
    l(2, 'Aluguel', '2026-09-20', -2000, { categ: 'Moradia', freq: 'Mensal' }), l(3, 'Aluguel', '2026-10-20', -2100, { categ: 'Moradia', freq: 'Mensal' }),
    l(4, 'Antecipação', '2026-10-18', -100, { categ: 'Antecipação fatura', fatura: '2026-11-12' }));

test('comparar dois ciclos: por categoria, sem a antecipação de fatura (transferência) e sem linha de abatimento inventada', async () => {
    const { texto } = await carregarTela({ dados: dadosComparacao() }).desenharComparacao(0, 1);
    assert.match(texto, /Moradia -R\$\s2\.000,00 -R\$\s2\.100,00 -R\$\s4\.100,00/);
    assert.doesNotMatch(texto, /Antecipação|Abatimento de fatura/);
    assert.match(texto, /Acabou em Setembro Começou em Outubro Único em Outubro/);
});

test('comparar: a linha Total soma cada ciclo e o total geral, com as mesmas colunas das outras linhas', async () => {
    const { html, texto } = await carregarTela({ dados: dadosComparacao() }).desenharComparacao(0, 1);
    assert.match(texto, /Total -R\$\s2\.000,00 R\$\s2\.100,00 R\$\s100,00$/);       // setembro, outubro (9.000 − 2.100 − 4.800 aportado), soma
    const celulas = tr => (tr.match(/<td/g) || []).length;
    const linhas = html.split('<tr').slice(1);
    const total = linhas.find(tr => />Total</.test(tr)), moradia = linhas.find(tr => /Moradia/.test(tr));
    assert.equal(celulas(total), celulas(moradia));
});
