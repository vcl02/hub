// Fatura por parcela: medido na tela em navegador-celular.test.js (1 fatura e "+N" no campo, as outras no modal, "—"
// desativado no débito) e a série gravada em navegador-linhas.test.js; aqui, o que a tela não monta fácil (parcela 2..N sem
// fatura abre o modal dela), o scroll do formulário e a regra documentada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const estilos = fs.readFileSync('css/forms.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

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
