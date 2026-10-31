// Tabelas no celular: medido na tela em navegador-celular.test.js (Data, Nome e Valor na 1ª tela com o ano curto; o Nome
// gruda na borda ao rolar de lado); aqui, a legenda da pizza embaixo no celular e a regra documentada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const mobile = ler('css/mobile.css');
const graficos = ler('js/charts.js');
const regras = ler('docs/REGRAS.md');

test('pizza com legenda embaixo no celular', () => {
    assert.match(graficos, /legend: \{ position: isMobile\(\) \? 'bottom' : 'right'/);
});

test('regra documentada', () => {
    assert.match(regras, /### Tabelas, faixas e seleção no celular/);
    assert.match(regras, /Data, Nome e Valor caberem juntos na primeira tela/);
    assert.match(regras, /grade de 6 colunas/);
});
