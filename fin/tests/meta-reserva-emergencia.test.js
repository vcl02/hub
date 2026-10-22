// Meta de reserva: projeção de nove ciclos com valores observados e estimados por nome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync('js/charts.js', 'utf8');
const inicio = script.indexOf('const MESES_META_RESERVA_EMERGENCIA = 9;');
const fim = script.indexOf('\nfunction dadosMetaReservaEmergenciaCiclo(', inicio);
if (inicio < 0 || fim < 0) throw Error('Não encontrou o cálculo da meta de reserva emergência.');

// Reserva é lida direto do bit `reserva` da linha (coluna própria, não mais texto em
// categ — ver migration 22); dadosMetaReservaEmergencia não precisa de nenhum global
// externo além do que já vem no próprio trecho extraído.
const contexto = {};
vm.createContext(contexto);
vm.runInContext(script.slice(inicio, fim), contexto);
const calcular = (linhas, idx, guardado) => ({ ...contexto.dadosMetaReservaEmergencia(linhas, idx, guardado) });

test('soma nove ciclos previstos e acompanha o aumento da Evolução Obra', () => {
    const d = calcular([
        { periodoIdx: 4, nome: 'Condomínio', v: -100, categ: 'Casa', reserva: true },
        { periodoIdx: 4, nome: 'Evolução Obra', v: -200, categ: '', reserva: true },
        { periodoIdx: 5, nome: 'Evolução Obra', v: -300, categ: '', reserva: true },
        { periodoIdx: 6, nome: 'Evolução Obra', v: -400, categ: '', reserva: true },
        { periodoIdx: 5, nome: 'Outros', v: -700, categ: 'Casa', reserva: false },
        { periodoIdx: 5, nome: 'Antecipação', v: -800, categ: '', reserva: true, _transferencia: true },
        { periodoIdx: 5, nome: 'Estorno', v: 50, categ: '', reserva: true },
    ], 4, 450);
    assert.equal(d.gastoMensal, 300);
    assert.equal(d.meta, 4200); // 300 + 400 + sete ciclos de 500
    assert.equal(d.guardado, 450);
    assert.equal(d.restante, 3750);
    assert.equal(d.mesesComEstimativa, 8);
});

test('gasto que começa no futuro entra na meta e valor sem ocorrência é mantido', () => {
    const d = calcular([
        { periodoIdx: 2, nome: 'Casa', v: -100, categ: '', reserva: true },
        { periodoIdx: 3, nome: 'Seguro', v: -50, categ: '', reserva: true },
    ], 2, 0);
    assert.equal(d.meta, 100 + 8 * 150);
    assert.equal(d.mesesComEstimativa, 8);
});

test('progresso fica limitado a cem por cento e mostra excedente', () => {
    const d = calcular([{ periodoIdx: 1, nome: 'Casa', v: -100, categ: '', reserva: true }], 1, 1200);
    assert.equal(d.meta, 900);
    assert.equal(d.percentual, 100);
    assert.equal(d.guardadoNaMeta, 900);
    assert.equal(d.excedente, 300);
});

test('sem gastos marcados a meta e o progresso ficam zerados', () => {
    const d = calcular([{ periodoIdx: 1, nome: 'Casa', v: -100, categ: 'Casa', reserva: false }], 1, 500);
    assert.equal(d.meta, 0);
    assert.equal(d.percentual, 0);
    assert.equal(d.guardadoNaMeta, 0);
    assert.equal(d.excedente, 500);
});

test('soma lançamentos do mesmo nome no mesmo ciclo antes de projetar', () => {
    const d = calcular([
        { periodoIdx: 3, nome: 'Casa', v: -100, categ: '', reserva: true },
        { periodoIdx: 3, nome: 'Casa', v: -50, categ: '', reserva: true },
    ], 3, 0);
    assert.equal(d.gastoMensal, 150);
    assert.equal(d.meta, 1350);
    assert.equal(d.mesesComEstimativa, 8);
});

test('não inclui entradas, transferências nem outras categorias no cálculo', () => {
    const d = calcular([
        { periodoIdx: 7, nome: 'Entrada', v: 500, categ: '', reserva: true },
        { periodoIdx: 7, nome: 'Transferência', v: -400, categ: '', reserva: true, _transferencia: true },
        { periodoIdx: 7, nome: 'Outra', v: -300, categ: 'Casa', reserva: false },
        { periodoIdx: 7, nome: 'Válido', v: -200, categ: '', reserva: true },
    ], 7, -100);
    assert.equal(d.meta, 1800);
    assert.equal(d.guardado, 0);
});
