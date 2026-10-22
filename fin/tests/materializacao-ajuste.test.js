// Regressão de consolidação: ajustes sintéticos alteram uma linha real, nunca duplicam dinheiro.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync('js/interactions.js', 'utf8');
const inicio = script.indexOf('function valorArredondado(');
const fim = script.indexOf('\n// valor de uma linha a partir da sua chave de selecao', inicio);

if (inicio < 0 || fim < 0) throw Error('Não encontrou a regra de consolidação no script.');

const contexto = {};
vm.createContext(contexto);
vm.runInContext(script.slice(inicio, fim), contexto);
const consolidar = (...args) => ({ ...contexto.consolidarAjusteExistente(...args) });

test('aporte sugerido soma ao aporte existente', () => {
    assert.deepEqual(
        consolidar({ nome: 'Aporte', v: -100 }, -25),
        { nome: 'Aporte', valor: -125 }
    );
});

test('aporte sugerido abate resgate existente e altera o tipo restante', () => {
    assert.deepEqual(
        consolidar({ nome: 'Resgate', v: 100 }, -150),
        { nome: 'Aporte', valor: -50 }
    );
});

test('resgate necessário abate aporte existente e altera o tipo restante', () => {
    assert.deepEqual(
        consolidar({ nome: 'Aporte', v: -100 }, 150),
        { nome: 'Resgate', valor: 50 }
    );
});

test('abatimento exato atualiza o lançamento existente para zero', () => {
    assert.deepEqual(
        consolidar({ nome: 'Resgate', v: 100 }, -100),
        { nome: 'Resgate', valor: 0 }
    );
});
