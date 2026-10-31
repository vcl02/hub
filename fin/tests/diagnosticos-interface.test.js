// Contrato de diagnóstico: métricas resumidas no Console e problemas visíveis em modal. O comportamento na tela (botão aceso,
// inconsistências e avisos separados, carga lenta, falha de carga) está em navegador-diagnostico.test.js; aqui, o estilo do
// modal e a política de caixas nativas (só as 4 confirmações das REGRAS).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const base = fs.readFileSync('css/base.css', 'utf8');
const estilos = fs.readFileSync('css/forms.css', 'utf8');
const api = fs.readFileSync('js/supabase-api.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const fontesJs = fs.readdirSync('js')
    .filter(arquivo => arquivo.endsWith('.js'))
    .map(arquivo => fs.readFileSync(path.join('js', arquivo), 'utf8'))
    .join('\n');

test('modal de diagnóstico: larguras e lista que quebra palavras longas (o comportamento na tela está em navegador-diagnostico.test.js)', () => {
    assert.match(estilos, /dialog#modalDiagnostico/);
    assert.match(estilos, /@media \(min-width: 700px\) \{\s*dialog#modalDiagnostico,\s*dialog#modalConsolidarTudo \{\s*width: min\(44rem, calc\(100vw - 4rem\)\)/);
    assert.match(estilos, /\.listaDiagnostico \{[\s\S]*?overflow-wrap: anywhere/);
    assert.match(estilos, /#toasts/);
    assert.match(base, /#btDiagnostico\.temInconsistencia::after/);
    assert.match(estilos, /#secaoAvisos \.listaDiagnostico/);
});

test('erros operacionais usam toast; só exclusão, pago fora do ciclo e corrigir recorrência duplicada pedem confirmação nativa', () => {
    assert.doesNotMatch(fontesJs, /\balert\(/);
    // As quatro únicas caixas nativas permitidas (ver REGRAS.md): excluir lançamento, marcar
    // como pago um Débito com data fora do ciclo atual (ver pago-ajusta-data.test.js),
    // corrigir a data de uma recorrência duplicada no ciclo (ver recorrencia-duplicada.test.js)
    // e excluir uma meta (ver metas.test.js).
    assert.equal((fontesJs.match(/\bconfirm\(/g) || []).length, 4);
    assert.match(formulario, /if \(!confirm\(pergunta\)\) return;/);
    assert.match(interacoes, /mostrarToast\('Falhou ao atualizar'/);
});
