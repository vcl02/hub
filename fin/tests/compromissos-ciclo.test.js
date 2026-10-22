// Regra de orçamento: Comprometido compara ao que o ciclo ganhou — toda entrada positiva,
// menos resgate de investimento e transferências. Nenhum lançamento é procurado pelo nome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/charts.js', 'utf8');
const inicio = fonte.indexOf('const LIMITES_COMPROMISSOS =');
const fim = fonte.indexOf('\nfunction dadosDoGraficoCiclo(', inicio);
if (inicio < 0 || fim < 0) throw Error('Não encontrou o cálculo de compromissos do ciclo.');

const contexto = {
    TOLERANCIA_FINANCEIRA: 0.005,
    semAcento: valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    MESES_MEDIA_LIBERDADE_FINANCEIRA: 12,
    TAXA_RETIRADA_LIBERDADE_FINANCEIRA: 0.035,
    ehCategoria: (categ, procurada) => String(categ || '').split(',')
        .some(categoria => categoria.trim().toLowerCase() == procurada.toLowerCase()),
};
vm.createContext(contexto);
vm.runInContext(`${fonte.slice(inicio, fim)}; globalThis.regras = {
    calcular: dadosCompromissosDoCiclo,
    proporcaoReserva: dadosProporcaoReservaDoCiclo,
    liberdade: dadosLiberdadeFinanceira,
    classeReserva: classeIndicadorReserva,
    classeComprometido: classeIndicadorComprometido,
    classeProporcaoReserva: classeIndicadorProporcaoReserva,
    variacao: variacaoPercentualIndicador,
    variacaoValor: variacaoValorIndicador,
};`, contexto);

test('Comprometido usa crédito e débito contra 50% do faturamento do ciclo', () => {
    const d = contexto.regras.calcular([
        { nome: 'Faturamento PJ', categ: 'Évora', v: 10000 },
        { nome: 'Curso', categ: 'Casa', comprometido: true, v: -900, cred: true },
        { nome: 'Aluguel', categ: '', comprometido: true, v: -3500, cred: false },
        { nome: 'Antecipação', categ: '', comprometido: true, v: -700, _transferencia: true },
    ]);
    const [comprometido] = d.limites;
    assert.equal(d.faturamento, 10000);
    assert.equal(comprometido.valor, 4400);
    assert.equal(comprometido.teto, 5000);
    assert.equal(comprometido.percentualFaturamento, 44);
    assert.equal(comprometido.percentualDoTeto, 88);
    assert.equal(comprometido.excedido, false);
});

test('parcela de compra parcelada no Crédito entra no Comprometido mesmo sem a marca', () => {
    const d = contexto.regras.calcular([
        { nome: 'Faturamento PJ', v: 10000 },
        { nome: 'Sofá', cred: true, recorrencia_id: 7, freq: null, v: -600 },              // parcela sem marca: entra
        { nome: 'iPhone', cred: true, recorrencia_id: 3, comprometido: true, v: -400 },    // já marcada: conta uma vez
        { nome: 'Netflix', cred: true, recorrencia_id: 9, freq: 'Mensal', v: -50 },        // série, não parcela
        { nome: 'Mercado', cred: true, recorrencia_id: null, v: -300 },                    // compra à vista
        { nome: 'Academia', cred: false, recorrencia_id: 4, freq: null, v: -120 },         // débito em lote
    ]);
    const [comprometido] = d.limites;
    assert.equal(comprometido.valor, 1000);
    assert.equal(comprometido.valorParcelasSemMarca, 600);
    assert.deepEqual(comprometido.linhas.map(r => r.nome), ['Sofá', 'iPhone']);
});

test('base são todas as entradas do ciclo, sem resgate de investimento nem transferência', () => {
    const d = contexto.regras.calcular([
        { nome: 'Faturamento PJ', v: 8000 },
        { nome: 'Reembolso', v: 2000 },
        { nome: 'Resgate', inv: true, v: 5000 },
        { nome: 'Estorno de fatura', _transferencia: true, v: 300 },
    ]);
    assert.equal(d.faturamento, 10000);
});

test('sem faturamento o limite permanece zerado', () => {
    const d = contexto.regras.calcular([{ nome: 'Conta', categ: '', comprometido: true, v: -200 }]);
    assert.equal(d.faturamento, 0);
    assert.equal(d.limites[0].valor, 200);
    assert.equal(d.limites[0].teto, 0);
    assert.equal(d.limites[0].excedido, true);
});

test('proporção de Reserva separa o gasto inteiro dos demais sem duplicar categoria composta', () => {
    const d = contexto.regras.proporcaoReserva([
        { nome: 'Casa', categ: 'Casa', reserva: true, v: -300, cred: false },
        { nome: 'Mercado', categ: 'Alimentação', v: -500, cred: false },
        { nome: 'Compra', categ: '', reserva: true, v: -200, cred: true },
        { nome: 'Antecipação', categ: '', reserva: true, v: -100, _transferencia: true },
    ]);
    assert.deepEqual({ ...d }, {
        total: 1000, reserva: 500, demais: 500,
        percentualReserva: 50, percentualDemais: 50,
    });
});

test('liberdade usa média de gastos, taxa de 3,5% e só capital acima da reserva', () => {
    const d = contexto.regras.liberdade([
        { periodoIdx: 0, categ: 'Casa', v: -1000 },
        { periodoIdx: 1, categ: 'Lazer', v: -2000 },
        { periodoIdx: 1, categ: 'Investimento', inv: true, v: -900 },
        { periodoIdx: 1, categ: 'Reembolso', v: -100 },
        { periodoIdx: 1, categ: 'Casa', v: -300, _transferencia: true },
    ], 1, 10000, 3000);
    assert.equal(d.mesesObservados, 2);
    assert.equal(d.gastoMensal, 1500);
    assert.equal(d.meta, 1500 * 12 / 0.035);
    assert.equal(d.patrimonioLivre, 7000);
    assert.equal(d.percentual, 7000 / d.meta * 100);
});

test('indicadores usam faixas verde, âmbar e vermelha conforme suas regras', () => {
    assert.equal(contexto.regras.classeReserva({ meta: 900, percentual: 40 }), 'vm');
    assert.equal(contexto.regras.classeReserva({ meta: 900, percentual: 50 }), 'am');
    assert.equal(contexto.regras.classeReserva({ meta: 900, percentual: 100 }), 'vd');
    assert.equal(contexto.regras.classeComprometido({
        faturamento: 1000, limites: [{ percentualFaturamento: 40, percentual: 50 }],
    }), 'vd');
    assert.equal(contexto.regras.classeComprometido({
        faturamento: 1000, limites: [{ percentualFaturamento: 45, percentual: 50 }],
    }), 'am');
    assert.equal(contexto.regras.classeComprometido({
        faturamento: 1000, limites: [{ percentualFaturamento: 51, percentual: 50 }],
    }), 'vm');
    assert.equal(contexto.regras.classeProporcaoReserva({ total: 1000, percentualReserva: 40 }), 'vd');
    assert.equal(contexto.regras.classeProporcaoReserva({ total: 1000, percentualReserva: 45 }), 'am');
    assert.equal(contexto.regras.classeProporcaoReserva({ total: 1000, percentualReserva: 51 }), 'vm');
});

test('variação usa sentidos opostos para Reserva e Comprometido', () => {
    assert.deepEqual({ ...contexto.regras.variacao(12.34, 10.01, true) }, {
        diferenca: 2.3, seta: '↑', classe: 'vd',
    });
    assert.deepEqual({ ...contexto.regras.variacao(42.04, 45.02, false) }, {
        diferenca: 3, seta: '↓', classe: 'vd',
    });
    assert.deepEqual({ ...contexto.regras.variacao(50.01, 50.04, false) }, {
        diferenca: 0, seta: '→', classe: 'neutro',
    });
    assert.equal(contexto.regras.variacao(NaN, 20, true), null);
});

test('variação em reais usa Guardado ou valor comprometido sem perder os centavos', () => {
    assert.deepEqual({ ...contexto.regras.variacaoValor(620, 500, true) }, {
        diferenca: 120, seta: '↑', classe: 'vd',
    });
    assert.deepEqual({ ...contexto.regras.variacaoValor(900, 1000, false) }, {
        diferenca: 100, seta: '↓', classe: 'vd',
    });
    assert.deepEqual({ ...contexto.regras.variacaoValor(100, 100.004, false) }, {
        diferenca: 0, seta: '→', classe: 'neutro',
    });
});
