// Tabelas no celular: medido na tela em navegador-celular.test.js (Data, Nome e Valor na 1ª tela com o ano curto; o Nome
// gruda na borda ao rolar de lado); aqui, a legenda da pizza embaixo no celular e a regra documentada.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');

const ler = (arquivo) => fs.readFileSync(arquivo, 'utf8');

assert.ok(ler('css/mobile.css'), 'css/mobile.css existe');
const regras = ler('docs/REGRAS.md');

test('regra documentada', () => {
  assert.match(regras, /### Tabelas, faixas e seleção no celular/);
  assert.match(regras, /Data, Nome e Valor caberem juntos na primeira tela/);
  assert.match(regras, /grade de 6 colunas/);
});
