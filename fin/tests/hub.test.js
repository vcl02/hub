// Link de volta ao hub no cabeçalho: ícone antes de Encerrar, apontando pra página inicial (../).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('ícone Hub no cabeçalho, antes de Encerrar, leva à página inicial do hub', () => {
    const acoes = pagina.slice(pagina.indexOf('<div class=acoesCabecalho>'));
    assert.match(acoes, /<a id=voltarHub class=btIcone href="\.\.\/" title="Hub" aria-label="Hub">/);
    assert.ok(acoes.indexOf('id=voltarHub') < acoes.indexOf('id=sair'));
    assert.match(regras, /O ícone de grade \(\*\*Hub\*\*\), logo antes de Encerrar, volta à página inicial do hub/);
});
