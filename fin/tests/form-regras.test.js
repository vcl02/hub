// Contratos do formulário que não dependem de modal: dinheiro, calculadora e parcelas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/form.js', 'utf8');
function trecho(inicioTexto, fimTexto) {
    const inicio = fonte.indexOf(inicioTexto);
    const fim = fonte.indexOf(fimTexto, inicio);
    if (inicio < 0 || fim < 0) throw Error(`Não encontrou ${inicioTexto}.`);
    return fonte.slice(inicio, fim);
}
const contexto = {};
vm.createContext(contexto);
vm.runInContext(`${trecho('function formataMascaraDinheiro(', '\nel(\'fValor\')')}${trecho('function calcParensAbertosAte(', '\nfunction calcConfirma')}${trecho('function valorDasParcelas(', '\n// ---- salvar')}\nglobalThis.regras = { formataMascaraDinheiro, valorMascaraParaNumero, calcTokeniza, calcAvalia, valorDasParcelas };`, contexto);
const r = contexto.regras;

test('máscara financeira interpreta dígitos como centavos', () => {
    assert.equal(r.formataMascaraDinheiro(''), '0,00');
    assert.equal(r.formataMascaraDinheiro('1'), '0,01');
    assert.equal(r.formataMascaraDinheiro('123456'), '1.234,56');
    assert.equal(r.valorMascaraParaNumero('R$ 1.234,56'), 1234.56);
    assert.equal(r.valorMascaraParaNumero(''), 0);
});

test('calculadora respeita precedência e parênteses', () => {
    assert.equal(r.calcAvalia('2+3×4'), 14);
    assert.equal(r.calcAvalia('(2+3)×4'), 20);
    assert.equal(r.calcAvalia('10÷4'), 2.5);
    assert.equal(r.calcAvalia('1,25+2,75'), 4);
});

test('calculadora rejeita expressão inválida em vez de executar texto arbitrário', () => {
    assert.equal(r.calcAvalia('2++3'), null);
    assert.equal(r.calcAvalia('(2+3'), null);
    assert.equal(r.calcAvalia('alert(1)'), null);
    assert.deepEqual(Array.from(r.calcTokeniza('12.50*(3+2)')), ['12.50', '*', '(', '3', '+', '2', ')']);
});

test('parcelamento mantém soma exata inclusive para valores negativos e centavos ímpares', () => {
    assert.deepEqual(Array.from(r.valorDasParcelas(100, 3)), [33.33, 33.33, 33.34]);
    assert.deepEqual(Array.from(r.valorDasParcelas(-100, 3)), [-33.33, -33.33, -33.34]);
    assert.deepEqual(Array.from(r.valorDasParcelas(0.01, 3)), [0, 0, 0.01]);
    assert.equal(r.valorDasParcelas(987.65, 7).reduce((s, v) => s + v, 0).toFixed(2), '987.65');
});
