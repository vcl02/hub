// Contrato de composição visual: preserva ordem da cascata e responsabilidade dos módulos CSS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const estilos = [
    'css/base.css', 'css/dashboard.css', 'css/forms.css',
    'css/charts.css', 'css/utilities.css', 'css/mobile.css',
];

test('carrega os estilos em camadas e mantém o responsivo por último', () => {
    const posicoes = estilos.map(arquivo => html.indexOf(`./${arquivo}`));
    assert.ok(posicoes.every(posicao => posicao >= 0));
    assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes);
});

test('cada camada possui a responsabilidade esperada', () => {
    assert.match(fs.readFileSync('css/base.css', 'utf8'), /:root/);
    assert.match(fs.readFileSync('css/dashboard.css', 'utf8'), /\.tool/);
    assert.match(fs.readFileSync('css/forms.css', 'utf8'), /#modalNovo/);
    assert.match(fs.readFileSync('css/charts.css', 'utf8'), /#modalGrafico/);
    assert.match(fs.readFileSync('css/mobile.css', 'utf8'), /@media \(max-width: 640px\)/);
});
