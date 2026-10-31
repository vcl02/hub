// Cadastro sem vão sobrando: medido na tela em navegador-celular.test.js (o vão sob Categorias igual ao dos outros campos e
// Salvar no fim do modal no celular); aqui, a regra documentada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /A mensagem de erro\/confirmação \(`#erroNovo`\) fica sem texto na maior parte do tempo; vazia, ela não reserva o espaço de uma linha de texto/);
    assert.match(regras, /o campo Categorias fica colado perto do botão Salvar, mesma distância de qualquer outro par de campos/);
    assert.match(regras, /volta ao tamanho normal sozinha assim que ganha uma mensagem/);
});

test('no mobile, o formulário reparte a altura entre os campos (regra documentada; medido em navegador-celular.test.js)', () => {
    assert.match(regras, /No mobile, o modal ocupa a tela inteira e o formulário reparte a altura que sobra igualmente entre os campos, com Salvar encostado no fim do modal/);
});
