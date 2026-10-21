// Máscara de R$ nos campos de dinheiro: "R$" fixo dentro da caixa (cadastro, edição do Valor
// na tabela, metas) e a mesma máscara de caixa eletrônico do cadastro (formataMascaraDinheiro).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const pagina = ler('index.html');
const interacoes = ler('js/interactions.js');
const visoes = ler('js/cycle-views.js');
const formularios = ler('css/forms.css');
const regras = ler('docs/REGRAS.md');

test('cadastro: "R$" fixo dentro da caixa do Valor, antes do campo', () => {
    assert.match(pagina, /<div class=moneyWrap>\s*<span class=dinheiroPrefixo aria-hidden=true>R\$<\/span>\s*<input type=text inputmode=numeric id=fValor/);
    assert.match(formularios, /\.moneyWrap \.dinheiroPrefixo \{\s*align-self: center;/);
});

test('edição do Valor na tabela: caixa .dinheiro com "R$" e a máscara do cadastro', () => {
    assert.match(interacoes, /<span class="inpValor dinheiro"><span class=dinheiroPrefixo aria-hidden=true>R\$<\/span>/);
    assert.match(interacoes, /<input type=text inputmode=numeric aria-label="Valor" value="\$\{bruto \? formataMascaraDinheiro\(String\(Math\.round\(bruto \* 100\)\)\) : ''\}" placeholder="0,00"><\/span>`;/);
    // A caixa é o span; o input fica transparente dentro, e o foco aparece na caixa.
    assert.match(formularios, /\.dinheiro > input \{[^}]*background: transparent;[^}]*border: 0;/);
    assert.match(formularios, /\.dinheiro:focus-within \{ outline: 2px solid var\(--fg\); outline-offset: -1px; \}/);
});

test('metas: Valor total e Entrada com "R$" e máscara de caixa eletrônico; vazio fica vazio', () => {
    assert.match(visoes, /const dinheiro = \(nome, valor\) => `<span class=dinheiro><span class=dinheiroPrefixo aria-hidden=true>R\$<\/span>` \+/);
    assert.match(visoes, /campo\('mcValor', 'Valor total', dinheiro\('valor', m\.valor\)\)/);
    assert.match(visoes, /campo\('mcEntrada', 'Entrada', dinheiro\('entrada', m\.entrada\), /);
    assert.match(interacoes, /el\('corpoMetas'\)\.addEventListener\('input', e => \{[\s\S]*?const input = e\.target\.closest\('\[data-dinheiro\]'\);/);
    assert.match(interacoes, /input\.value = input\.value\.replace\(\/\\D\/g, ''\) \? formataMascaraDinheiro\(input\.value\) : '';/);
    // O valor mascarado ("1.500,00") volta a número pela mesma leitura dos limites.
    const trecho = interacoes.slice(interacoes.indexOf('function numeroDoLimiteDigitado('), interacoes.indexOf('\n}\n', interacoes.indexOf('function numeroDoLimiteDigitado(')) + 3);
    const numeroDoLimiteDigitado = new Function(`${trecho}; return numeroDoLimiteDigitado;`)();
    assert.equal(numeroDoLimiteDigitado('1.500,00'), 1500);
    assert.equal(numeroDoLimiteDigitado('0,50'), 0.5);
});

test('REGRAS.md documenta a máscara de R$', () => {
    assert.match(regras, /Todo campo de dinheiro tem \*\*máscara de R\$\*\*: o "R\$" fixo à esquerda, dentro da própria caixa/);
    assert.match(regras, /no Valor total e na Entrada das metas/);
});
