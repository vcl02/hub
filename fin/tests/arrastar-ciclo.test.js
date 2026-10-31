// Arrastar de lado troca de ciclo: o gesto em si (limiar, direção, ponta, modal aberto) é testado no navegador em
// navegador-celular.test.js; aqui, a animação de entrada (e sem ela com movimento reduzido) e a regra documentada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const mobile = fs.readFileSync('css/mobile.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('o ciclo novo entra pelo lado do gesto, sem animação com movimento reduzido', () => {
    assert.match(mobile, /#out\.entraDaDireita \{ animation: cicloEntra/);
    assert.match(mobile, /@media \(prefers-reduced-motion: reduce\) \{\s*#out\.entraDaDireita, #out\.entraDaEsquerda \{ animation: none; \}/);
});

test('regra documentada', () => {
    assert.match(regras, /\*\*Arrastar para o lado\*\* \(celular\) troca de ciclo como as setas: para a esquerda o próximo/);
});
