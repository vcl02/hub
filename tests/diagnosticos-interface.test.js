// Contrato de diagnóstico: métricas resumidas no Console e problemas visíveis em modal.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const base = fs.readFileSync('css/base.css', 'utf8');
const estilos = fs.readFileSync('css/forms.css', 'utf8');
const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
const api = fs.readFileSync('js/supabase-api.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const inicializacao = fs.readFileSync('js/bootstrap.js', 'utf8');
const fontesJs = fs.readdirSync('js')
    .filter(arquivo => arquivo.endsWith('.js'))
    .map(arquivo => fs.readFileSync(path.join('js', arquivo), 'utf8'))
    .join('\n');

test('modal separa inconsistências de avisos e problemas operacionais usam toast', () => {
    assert.match(html, /<dialog id=modalDiagnostico>/);
    assert.doesNotMatch(html, /id=fechaDiagnostico/);
    assert.match(html, /id=btDiagnostico/);
    assert.match(html, /id=secaoInconsistencias/);
    assert.match(html, /id=listaInconsistencias/);
    assert.match(html, /id=secaoAvisos/);
    assert.match(html, /id=listaAvisos/);
    assert.match(html, /id=toasts/);
    assert.match(estilos, /dialog#modalDiagnostico/);
    assert.match(estilos, /@media \(min-width: 700px\) \{\s*dialog#modalDiagnostico,\s*dialog#modalConsolidarTudo \{\s*width: min\(44rem, calc\(100vw - 4rem\)\)/);
    assert.match(estilos, /\.listaDiagnostico \{[\s\S]*?overflow-wrap: anywhere/);
    assert.match(estilos, /#toasts/);
    assert.match(base, /#btDiagnostico\.temInconsistencia::after/);
    assert.match(estilos, /#secaoAvisos \.listaDiagnostico/);
    assert.match(dadosUi, /function mostrarDiagnostico/);
    assert.match(dadosUi, /function atualizarBotaoDiagnostico/);
    assert.match(dadosUi, /function abrirDiagnosticoDeDados/);
    assert.match(dadosUi, /atualizarBotaoDiagnostico\(diagnosticoDeDados\)/);
    assert.match(dadosUi, /const inconsistencias = diagnostico\.inconsistencias \|\| \[\];/);
    assert.match(dadosUi, /const avisos = diagnostico\.avisos \|\| \[\];/);
    assert.match(dadosUi, /temInconsistencia = inconsistencias\.length > 0/);
    assert.match(dadosUi, /function mostrarToast/);
    assert.match(dadosUi, /function tocarSomToast/);
    assert.match(dadosUi, /void tocarSomToast\(\)/);
    assert.match(dadosUi, /oscilador\.frequency\.value = 660/);
    assert.match(dadosUi, /Dados para revisar/);
    assert.match(dadosUi, /mostrarToast\('Não foi possível carregar'/);
    assert.match(interacoes, /mostrarToast\('Não foi possível atualizar a visão'/);
    assert.match(inicializacao, /el\('modalDiagnostico'\)\.addEventListener\('click', e => \{\s*if \(e\.target == el\('modalDiagnostico'\)\) el\('modalDiagnostico'\)\.close\(\);\s*\}\);/);
});

test('erros operacionais usam toast; só exclusão, pago fora do ciclo e corrigir recorrência duplicada pedem confirmação nativa', () => {
    assert.doesNotMatch(fontesJs, /\balert\(/);
    // As quatro únicas caixas nativas permitidas (ver REGRAS.md): excluir lançamento, marcar
    // como pago um Débito com data fora do ciclo atual (ver pago-ajusta-data.test.js),
    // corrigir a data de uma recorrência duplicada no ciclo (ver recorrencia-duplicada.test.js)
    // e excluir uma meta ou âncora (ver metas.test.js).
    assert.equal((fontesJs.match(/\bconfirm\(/g) || []).length, 4);
    assert.match(formulario, /if \(!confirm\(pergunta\)\) return;/);
    assert.match(interacoes, /mostrarToast\('Falhou ao atualizar'/);
});

test('Console recebe uma única linha de métricas e toast avisa carga lenta', () => {
    assert.match(dadosUi, /const LIMIAR_CARGA_LENTA_MS = 1000/);
    assert.match(dadosUi, /console\.info\(`\[diag\] carga \$\{cargaMs\}ms/);
    assert.match(dadosUi, /if \(cargaMs >= LIMIAR_CARGA_LENTA_MS && !silencioso\) mostrarToast\('Carga lenta'/);
    assert.doesNotMatch(dadosUi, /console\.time|console\.timeEnd|load\(\) iniciou|load\(\) terminou/);
    assert.doesNotMatch(interacoes, /console\.time|console\.timeEnd/);
    assert.doesNotMatch(dadosUi, /console\.error/);
    assert.doesNotMatch(interacoes, /console\.error/);
    assert.doesNotMatch(api, /console\.warn\('\[diagnóstico\]/);
});
