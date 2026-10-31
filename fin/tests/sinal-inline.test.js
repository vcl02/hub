// Botão ± ao lado do Valor: inverter e gravar na hora (e só na memória na simulação) é testado no navegador em
// navegador-linhas.test.js; aqui, a regra documentada e que o sinal embutido no campo de Valor não volta.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilosPainel = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /botão \+\/− ao lado do Valor \(mesmo ícone do cadastro\) que inverte o sinal na hora/);
    assert.match(regras, /Indisponível para linhas sintéticas\/simuladas sem `id` real: nelas o botão aparece no mesmo lugar, só que desabilitado/);
    assert.match(estilosPainel, /\.valorLinha \.togValor,\s*\n\s*\.valorLinha \.valorFixo \{/);
});

test('sinal embutido no campo de edição de Valor foi removido por não funcionar de verdade', () => {
    // O clique no +/- de dentro da edição perdia o foco do input ANTES do próprio clique
    // terminar de registrar: blur disparava confirma() com o sinal antigo primeiro, então o
    // toggle nunca pegava de fato. O botão de sinal ao lado (fora do campo) resolve isso com
    // seu próprio PATCH; o campo de Valor volta a só editar a magnitude, mantendo o sinal.
    assert.doesNotMatch(interacoes, /inpValorSinal|sinalNegativo/);
    assert.match(interacoes, /const novoValor = valorMascaraParaNumero\(input\.value\.trim\(\) \|\| '0'\) \* \(negativo \? -1 : 1\);/);
    assert.doesNotMatch(estilosPainel, /\.inpValorSinal/);
    assert.match(regras, /uma versão antiga embutida nesse campo não funcionava de verdade/);
});
