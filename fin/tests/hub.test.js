// Link de volta ao hub no cabeçalho: último ícone, apontando pra página inicial (../); sem Sair no fin.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('ícone Hub é o último do cabeçalho e leva à página inicial do hub; não há Sair', () => {
    const acoes = pagina.slice(pagina.indexOf('<div class=acoesCabecalho>'));
    assert.match(acoes, /<a id=voltarHub class=btIcone href="\.\.\/" title="Hub" aria-label="Hub">[\s\S]*?<\/a>\s*<\/div>/);
    assert.doesNotMatch(pagina, /id=sair\b/);
    assert.match(regras, /O ícone de grade \(\*\*Hub\*\*\), o último do cabeçalho, volta à página inicial do hub/);
});
