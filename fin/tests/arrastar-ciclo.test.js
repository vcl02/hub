// Arrastar de lado troca de ciclo: o gesto em si (limiar, direção, ponta, modal aberto) é testado no navegador em
// navegador-celular.test.js; aqui, a animação de entrada (e sem ela com movimento reduzido) lida como regras de CSS e a regra documentada.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const { declaracoes } = require('./helpers/regras-css');

const mobile = fs.readFileSync('css/mobile.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('o ciclo novo entra pelo lado do gesto, sem animação com movimento reduzido', () => {
  const direita = declaracoes(mobile, '#out.entraDaDireita', '');
  const esquerda = declaracoes(mobile, '#out.entraDaEsquerda', '');

  assert.ok(direita.includes('animation: cicloEntra 0.18s ease-out'));
  assert.ok(direita.includes('--de: 2.5rem')); // sai da direita para o centro
  assert.ok(esquerda.includes('animation: cicloEntra 0.18s ease-out'));
  assert.ok(esquerda.includes('--de: -2.5rem')); // sai da esquerda para o centro

  const semMovimento = '@media (prefers-reduced-motion: reduce)';

  assert.deepEqual(declaracoes(mobile, '#out.entraDaDireita', semMovimento), [
    'animation: none',
  ]);
  assert.deepEqual(declaracoes(mobile, '#out.entraDaEsquerda', semMovimento), [
    'animation: none',
  ]);
});

test('regra documentada', () => {
  assert.match(
    regras,
    /\*\*Arrastar para o lado\*\* \(celular\) troca de ciclo como as setas: para a esquerda o próximo/
  );
});
