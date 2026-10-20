// Cadastro: cada opção de Vezes mostra quanto fica a parcela com o valor digitado,
// dividindo (com Dividir marcado) ou repetindo o valor (desmarcado).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const trecho = assinatura => {
    const inicio = formulario.indexOf(assinatura);
    return formulario.slice(inicio, formulario.indexOf('\n}\n', inicio) + 3);
};

function opcoesCom(valor, dividir) {
    const opcoes = [{ value: '1', textContent: 'À vista' }, { value: '2', textContent: '2x' }, { value: '3', textContent: '3x' },
        { value: '12', textContent: '12x' }, { value: 'serie', textContent: '75x até 2032' }];
    const campos = { fValor: { value: valor }, fDivide: { checked: dividir }, fParcelas: { options: opcoes } };
    const ctx = {
        el: id => campos[id],
        brl: v => `R$ ${v.toFixed(2).replace('.', ',')}`,
    };
    vm.runInNewContext([
        trecho('function valorMascaraParaNumero(textoMascarado) {'),
        trecho('function valorDasParcelas(valorTotal, parcelas) {'),
        trecho('function atualizarParcelaNasVezes() {'),
        'atualizarParcelaNasVezes();',
    ].join('\n'), ctx);
    return opcoes.map(o => o.textContent);
}

test('dividindo: total pelas vezes (a parcela das primeiras); À vista e a série intactos', () => {
    assert.deepEqual(opcoesCom('R$ 100,00', true), ['À vista', '2x de R$ 50,00', '3x de R$ 33,33', '12x de R$ 8,33', '75x até 2032']);
});

test('sem dividir: o valor digitado se repete em cada vez', () => {
    assert.deepEqual(opcoesCom('R$ 50,00', false), ['À vista', '2x de R$ 50,00', '3x de R$ 50,00', '12x de R$ 50,00', '75x até 2032']);
});

test('sem valor: só a quantidade', () => {
    assert.deepEqual(opcoesCom('', true), ['À vista', '2x', '3x', '12x', '75x até 2032']);
});

test('atualiza ao digitar o valor, ao trocar Dividir e quando o crédito sugere o modo', () => {
    assert.match(trecho('function atualizaSinalUI() {'), /atualizarParcelaNasVezes\(\);/);
    assert.match(trecho('function sugereModoValorParcelas() {'), /atualizarParcelaNasVezes\(\);/);
    assert.match(formulario, /el\('fDivide'\)\.addEventListener\('change', atualizarParcelaNasVezes\);/);
    assert.match(regras, /Cada opção de Vezes já mostra quanto fica a parcela com o valor digitado \(`12x de R\$ 779,17`\)/);
});
