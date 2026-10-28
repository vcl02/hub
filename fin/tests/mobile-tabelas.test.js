// Regressão: no celular as tabelas mostram Data, Nome e Valor na primeira tela (ano curto,
// Nome fixo ao rolar de lado), sem tirar coluna; barra de seleção e cabeçalho cabem na tela.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const tabelas = ler('js/tables.js');
const mobile = ler('css/mobile.css');
const graficos = ler('js/charts.js');
const regras = ler('docs/REGRAS.md');

test('data com o século num span que só o celular esconde', () => {
    assert.match(tabelas, /dataBR\(r\.data\)\.replace\(\/\\\/\(\\d\{2\}\)\(\\d\{2\}\)\$\/, '\/<span class=seculo>\$1<\/span>\$2'\)/);
    assert.match(mobile, /\.seculo \{\s*display: none;/);
    assert.match(mobile, /table\.larguraFixa td\.cData \{\s*white-space: nowrap;/);
});

test('Nome fixo à esquerda no celular, com o fundo das linhas especiais valendo', () => {
    assert.match(tabelas, /<td class="corta\$\{chave == 'nome' \? ' cNome' : ''\}"/);
    assert.match(tabelas, /\$\{chave == 'nome' \? 'cNome' : ''\}/);
    assert.match(mobile, /table\.larguraFixa \.cNome \{\s*position: sticky;\s*left: 0;/);
    // Seletor fraco: tbody tr.fat td (e as demais linhas especiais) vence.
    assert.match(mobile, /\n      td\.cNome \{\s*background: var\(--pa\);/);
    assert.match(mobile, /tbody tr\.mp td\.cNome/);
    assert.match(mobile, /tbody tr\.sim td\.cNome/);
});

test('nenhuma coluna some no celular: só larguras', () => {
    assert.doesNotMatch(mobile, /col-[a-z_]+ \{[^}]*display: none/);
    assert.match(mobile, /table\.larguraFixa \.col-data \{ width: 5rem; \}/);
    assert.match(mobile, /table\.larguraFixa \.col-nome \{ width: 8rem; \}/);
    assert.match(mobile, /table\.larguraFixa \.col-valor \{ width: 9\.25rem; \}/);
});

test('barra de seleção e cabeçalho cabem na largura do celular', () => {
    assert.match(mobile, /#selbar \{\s*left: \.9rem;\s*right: \.9rem;/);
    assert.match(mobile, /#selbar button \{\s*flex: 1 1 0;/);
    assert.match(mobile, /\.acoesCabecalho \{\s*display: grid;\s*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/);
    assert.match(mobile, /\.visWrap \.menuIcone \{\s*left: auto;\s*right: 0;/);
});

test('pizza com legenda embaixo no celular', () => {
    assert.match(graficos, /legend: \{ position: isMobile\(\) \? 'bottom' : 'right'/);
});

test('regra documentada', () => {
    assert.match(regras, /### Tabelas, faixas e seleção no celular/);
    assert.match(regras, /Data, Nome e Valor caberem juntos na primeira tela/);
    assert.match(regras, /grade de 6 colunas/);
});
