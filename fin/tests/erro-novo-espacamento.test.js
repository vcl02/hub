// Regressão: a mensagem de erro/confirmação do cadastro (#erroNovo) reservava uma altura
// mínima mesmo vazia, somando aos dois gaps do flex do formulário (Categoria → erroNovo →
// Salvar) e dobrando o espaço visual ali contra qualquer outro par de campos. Vazia, ela
// agora colapsa e cancela o gap de cima com margem negativa, deixando a mesma distância de
// qualquer outro campo — e volta ao normal sozinha assim que ganha uma mensagem (CSS puro,
// sem JS extra).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const estilos = fs.readFileSync('css/forms.css', 'utf8');
const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('.erroNovo:empty colapsa a altura reservada e cancela o gap de cima, sem mexer no caso com mensagem', () => {
    assert.match(estilos, /\.erroNovo \{\s*\n\s*color: var\(--vm\);\s*\n\s*font-size: \.85rem;\s*\n\s*margin: 0;\s*\n\s*min-height: 1\.1rem;\s*\n\s*\}/);
    assert.match(estilos, /\.erroNovo:empty \{\s*\n\s*min-height: 0;\s*\n\s*margin-top: -1rem;\s*\n\s*\}/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /A mensagem de erro\/confirmação \(`#erroNovo`\) fica sem texto na maior parte do tempo; vazia, ela não reserva o espaço de uma linha de texto/);
    assert.match(regras, /o campo Categorias fica colado perto do botão Salvar, mesma distância de qualquer outro par de campos/);
    assert.match(regras, /volta ao tamanho normal sozinha assim que ganha uma mensagem/);
});

test('no mobile o formulário preenche o modal e reparte a sobra entre os campos, sem vão sob Salvar', () => {
    assert.match(estilosMobile, /#formNovo \{\s*\n\s*height: 100%;\s*\n\s*max-height: none;\s*\n\s*justify-content: space-between;/);
    // Salvar (.btPri, flex: 1) não pode esticar e ficar com a sobra toda.
    assert.match(estilosMobile, /#salvaNovo \{\s*\n\s*flex: none;\s*\n\s*\}/);
    // A mensagem vazia não pode virar mais um item a receber espaço.
    assert.match(estilosMobile, /\.erroNovo:empty \{\s*\n\s*display: none;\s*\n\s*\}/);
    assert.match(regras, /No mobile, o modal ocupa a tela inteira e o formulário reparte a altura que sobra igualmente entre os campos, com Salvar encostado no fim do modal/);
});
