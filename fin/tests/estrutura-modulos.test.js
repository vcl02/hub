// Contrato de arquitetura: scripts clássicos dependem da ordem declarada no HTML.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const estado = fs.readFileSync('js/app-state.js', 'utf8');
const dominio = fs.readFileSync('js/domain.js', 'utf8');
const compartilhado = fs.readFileSync('js/shared.js', 'utf8');
const api = fs.readFileSync('js/supabase-api.js', 'utf8');
const financeiro = fs.readFileSync('js/finance.js', 'utf8');
const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');

test('carrega estado, Supabase e interface na ordem necessária', () => {
    const estadoIdx = html.indexOf('./js/app-state.js');
    const dominioIdx = html.indexOf('./js/domain.js');
    const compartilhadoIdx = html.indexOf('./js/shared.js');
    const apiIdx = html.indexOf('./js/supabase-api.js');
    const financeiroIdx = html.indexOf('./js/finance.js');
    const dadosUiIdx = html.indexOf('./js/data-ui.js');
    const tabelasIdx = html.indexOf('./js/tables.js');
    const visoesIdx = html.indexOf('./js/cycle-views.js');
    const interacoesIdx = html.indexOf('./js/interactions.js');
    const graficosIdx = html.indexOf('./js/charts.js');
    const formularioIdx = html.indexOf('./js/form.js');
    const bootstrapIdx = html.indexOf('./js/bootstrap.js');
    assert.ok(estadoIdx >= 0 && estadoIdx < dominioIdx && dominioIdx < compartilhadoIdx && compartilhadoIdx < apiIdx && apiIdx < financeiroIdx && financeiroIdx < dadosUiIdx && dadosUiIdx < tabelasIdx && tabelasIdx < visoesIdx && visoesIdx < interacoesIdx && interacoesIdx < graficosIdx && graficosIdx < formularioIdx && formularioIdx < bootstrapIdx);
    assert.doesNotMatch(html, /\.\/js\/export\.js/);
});

test('separa estado e acesso ao banco da camada de interface', () => {
    assert.match(estado, /const Estado =/);
    assert.match(estado, /const TABELA_FIN = 'fin';/);
    assert.match(dominio, /function validarLancamentosCarregados/);
    assert.match(compartilhado, /function dataDaOcorrencia/);
    assert.match(compartilhado, /const el =/);
    assert.match(api, /const sb = supabase\.createClient/);
    assert.match(api, /buscar\(TABELA_FIN\)/);
    assert.doesNotMatch(api, /rest\/v1\/lancamentos/);
    assert.match(api, /async function carregarDados/);
    assert.match(financeiro, /function saldoDoCiclo/);
    assert.match(financeiro, /function creditosExibidosNoCiclo/);
    assert.match(dadosUi, /async function load/);
    assert.match(tabelas, /const renderTabela/);
    assert.match(visoes, /function vCiclo/);
    assert.match(interacoes, /function desenhar/);
    assert.match(graficos, /function desenhaGraficoPizza/);
    assert.match(formulario, /function submeteNovoLancamento/);
    assert.match(bootstrap, /async function boot/);
});
