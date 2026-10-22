// Regressão: compra em muitas parcelas gera um <select> de fatura por parcela
// (atualizarFaturasDoFormulario, js/form.js). Antes, a lista inteira ficava dentro do campo
// Fatura e empurrava Categorias e Salvar pra longe no mobile. Agora o campo mostra só a 1ª
// parcela + "+N"; as parcelas 2..N ficam em #modalFaturasParcelas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const estilos = fs.readFileSync('css/forms.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('o campo Fatura é uma linha fixa: seletor da 1ª parcela + botão "+N"', () => {
    assert.match(pagina, /<div class=fm id=fFaturasWrap>\s*\n\s*<span>Fatura<\/span>\s*\n\s*<div class=faturaLinha>\s*\n\s*<div id=faturaPrincipal><\/div>\s*\n\s*<button type=button id=fFaturasMais class="btHojeMini btMaisFaturas vazio" disabled\s*\n\s*title="Escolher as faturas das outras parcelas" aria-label="Escolher as faturas das outras parcelas">\+0<\/button>/);
    assert.match(estilos, /\.faturaLinha \{\s*\n\s*display: grid;\s*\n\s*grid-template-columns: minmax\(0, 1fr\) auto;/);
    // Sem outras parcelas o "+N" some da vista, mas guarda o espaço.
    assert.match(estilos, /\.btMaisFaturas\.vazio \{\s*\n\s*visibility: hidden;/);
});

test('as parcelas 2..N ficam em #modalFaturasParcelas, sem altura limitada própria', () => {
    assert.match(pagina, /<dialog id=modalFaturasParcelas>[\s\S]*?<div id=faturasPorParcela><\/div>\s*\n\s*<\/dialog>/);
    assert.match(estilos, /#faturasPorParcela \{\s*\n\s*display: flex;\s*\n\s*flex-direction: column;\s*\n\s*gap: \.7rem;\s*\n\s*\}/);
    assert.match(estilos, /dialog#modalFaturasParcelas,\s*\n\s*dialog#modalDiagnostico,/);
    assert.match(formulario, /el\('fFaturasMais'\)\.onclick = \(\) => el\('modalFaturasParcelas'\)\.showModal\(\);/);
    assert.match(formulario, /if \(e\.target == el\('modalFaturasParcelas'\)\) el\('modalFaturasParcelas'\)\.close\(\);/);
});

test('a ordem das faturas vem de data-fatura-parcela, não da posição no documento', () => {
    assert.match(formulario, /\.sort\(\(a, b\) => Number\(a\.dataset\.faturaParcela\) - Number\(b\.dataset\.faturaParcela\)\);/);
    assert.match(formulario, /principal\.innerHTML = seletor\(0, tituloPrincipal\);/);
    assert.match(formulario, /Array\.from\(\{ length: parcelas - 1 \}, \(_, i\) =>\s*\n\s*`<label class=fm><span>Parcela \$\{i \+ 2\} <b class=req>\*<\/b><\/span>\$\{seletor\(i \+ 1\)\}<\/label>`/);
});

test('no Débito comum, Fatura continua no lugar como seletor desativado que não conta como escolha', () => {
    assert.match(formulario, /principal\.innerHTML = '<select disabled title="Fatura só no Crédito" aria-label="Fatura \(só no Crédito\)"><option>—<\/option><\/select>';/);
    assert.doesNotMatch(formulario, /fFaturasWrap'\)\.hidden|wrap\.hidden/);
});

test('salvar com fatura faltando numa parcela 2..N abre o modal das parcelas', () => {
    assert.match(formulario, /if \(faturaIds\.findIndex\(id => !id\) > 0\) el\('modalFaturasParcelas'\)\.showModal\(\);/);
});

test('o formulário inteiro (#formNovo) continua com seu próprio scroll e teto de altura', () => {
    assert.match(estilos, /#formNovo \{[\s\S]*?overflow-y: auto;[\s\S]*?max-height: 88vh;/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /O campo \*\*Fatura\*\* fica sempre visível, logo abaixo de Frequência\/Vezes\/Dividir, numa única linha: o seletor da 1ª parcela e um botão "\+N" \(`#fFaturasMais`, N = demais parcelas\) que abre `#modalFaturasParcelas`/);
    assert.match(regras, /No Débito comum \(fora antecipação\), Fatura vira um seletor desativado "—", que nunca conta como fatura escolhida/);
    assert.match(regras, /Salvar com a fatura de alguma parcela 2\.\.N em branco mostra o erro e abre esse modal direto/);
});
