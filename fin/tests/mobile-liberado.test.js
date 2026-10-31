// Paridade celular/computador: medido na tela em navegador-celular.test.js (nada estoura a largura; navegação de ciclo,
// simulação, ferramentas e barra de seleção visíveis); aqui, a regra documentada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /## Acesso/);
    assert.match(regras, /A garantia vem do RLS de `fin`, `fin_ciclo` e `fin_meta`: somente o mantenedor lê \(migration 39\) e grava \(migration 20\)/);
    assert.match(regras, /fica sempre visível, em qualquer largura — sem menu pra abrir\/fechar/);
});
