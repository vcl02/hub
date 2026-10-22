// Regressão: barra de seleção ganha "Editar" pra transformar Débito <-> Crédito (e
// escolher fatura/data) numa linha já existente, via UPDATE em vez de criar um lançamento
// novo. Cobre também o bug de reclassificaPeriodo que essa feature expôs: um Crédito sem
// 'data' (vindo do Backlog) precisa classificar certo só com a fatura.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('botão Editar existe na barra de seleção, antes de Duplicar/Excluir', () => {
    assert.match(html, /<button id=seledit>Editar<\/button>\s*\n\s*<button id=seldup>Duplicar<\/button>/);
});

test('só aparece com exatamente 1 linha real/simulada selecionada, nunca ajuste sintético nem fatura', () => {
    assert.match(interacoes, /el\('seledit'\)\.hidden = !chaveUnicaReal;/);
});

test('abre o modal de cadastro pré-preenchido em modo edição, escondendo Vezes\\/Dividir', () => {
    assert.match(formulario, /function abreModalNovo\(prefill, modoEdicao\) \{/);
    assert.match(formulario, /\(modoEdicao \? 'Editar lançamento' : \(prefill \? 'Duplicar lançamento' : 'Novo lançamento'\)\)/);
    // Some a linha Vezes/Dividir; a Frequência, fora dela, continua editável.
    assert.match(formulario, /el\('parcelasLinha'\)\.hidden = !!modalNovo\.dataset\.editandoId;/);
    assert.ok(html.indexOf('id=fFreqWrap') < html.indexOf('id=parcelasLinha'));
    assert.match(formulario, /if \(modoEdicao\) \{ el\('fParcelas'\)\.value = 1; modalNovo\.dataset\.editandoId = String\(prefill\.id\); \}/);
    assert.match(formulario, /el\('seledit'\)\.onclick = \(\) => \{/);
    assert.match(formulario, /if \(r\) abreModalNovo\(r, true\);/);
});

test('fechar o modal de edição limpa a seleção, igual ao Duplicar', () => {
    assert.match(formulario, /if \(modalNovo\.dataset\.viaDuplicar \|\| modalNovo\.dataset\.editandoId\) \{ Estado\.selecionados\.clear\(\); desenhar\(\); \}/);
    assert.match(formulario, /delete modalNovo\.dataset\.editandoId;/);
});

test('salvar redireciona pra submeteEdicaoLancamento quando o modal está em modo edição', () => {
    assert.match(formulario, /if \(modalNovo\.dataset\.editandoId\) \{\s*\n\s*const r = Estado\.lancamentos\.find\(x => String\(x\.id\) == modalNovo\.dataset\.editandoId\);\s*\n\s*if \(r\) await submeteEdicaoLancamento\(r\);\s*\n\s*return;\s*\n\s*\}/);
});

test('submeteEdicaoLancamento exige fatura ao marcar Crédito (ou antecipação) e sempre reenvia "fatura" (null pra limpar)', () => {
    assert.match(formulario, /async function submeteEdicaoLancamento\(r\) \{/);
    assert.match(formulario, /if \(\(cred \|\| ehAntecip\) && \(faturaIds\.length !== 1 \|\| !faturaIds\[0\]\)\) \{/);
    assert.match(formulario, /fatura: \(cred \|\| ehAntecip\) \? dataISO\(faturaIds\[0\]\) : null,/);
    assert.match(formulario, /if \(!Estado\.simulando && !r\._sim\) await atualizarLancamento\(r\.id, campos\);/);
    assert.match(formulario, /Object\.assign\(r, campos\);/);
    assert.match(formulario, /reclassificaPeriodo\(r\);/);
    assert.match(formulario, /modalNovo\.close\(\);   \/\/ o close listener ja' limpa a selecao e redesenha/);
});

// Extrai a reclassificaPeriodo real (não reescreve a regra à mão) e roda isolada, com
// periodoDoDebito/periodoDaFatura/dataISO e Estado.ciclos simulados.
function carregaReclassificaPeriodo() {
    const inicio = interacoes.indexOf('function reclassificaPeriodo(r) {');
    const fim = interacoes.indexOf('\n}\n', inicio) + 3;
    if (inicio < 0) throw Error('Não encontrou reclassificaPeriodo.');
    const contexto = {
        Estado: { ciclos: [0, 1, 2, 3, 4, 5] },   // só o .length importa aqui
        dataISO: v => v,
        periodoDoDebito: data => (data === '2026-10-09' ? 2 : -1),
        periodoDaFatura: fatura => (fatura === '2026-11-10' ? 3 : -1),
    };
    // A regra de ciclo é a única de shared.js (periodoDoLancamento), a mesma da carga.
    const compartilhado = fs.readFileSync('js/shared.js', 'utf8');
    const inicioRegra = compartilhado.indexOf('function periodoDoLancamento(r) {');
    const regra = compartilhado.slice(inicioRegra, compartilhado.indexOf('\n}\n', inicioRegra) + 3);
    vm.createContext(contexto);
    vm.runInContext(`${regra}\n${interacoes.slice(inicio, fim)}\nglobalThis.reclassificaPeriodo = reclassificaPeriodo;`, contexto);
    return contexto.reclassificaPeriodo;
}

test('Crédito sem "data" mas com "fatura" (ex.: veio do Backlog) classifica pelo vencimento, não cai no Backlog', () => {
    const reclassificaPeriodo = carregaReclassificaPeriodo();
    const r = { cred: true, data: null, fatura: '2026-11-10' };
    reclassificaPeriodo(r);
    assert.equal(r.periodoIdx, 3);
});

test('sem "data" nem "fatura": continua no Backlog (periodoIdx null)', () => {
    const reclassificaPeriodo = carregaReclassificaPeriodo();
    const r = { cred: true, data: null, fatura: null };
    reclassificaPeriodo(r);
    assert.equal(r.periodoIdx, null);
});

test('Débito continua classificando só pela própria "data", ignorando fatura', () => {
    const reclassificaPeriodo = carregaReclassificaPeriodo();
    const r = { cred: false, data: '2026-10-09', fatura: null };
    reclassificaPeriodo(r);
    assert.equal(r.periodoIdx, 2);
});

test('estilo do botão Editar reaproveita o visual discreto do Duplicar', () => {
    assert.match(estilos, /#selbar #seledit,\s*\n\s*#selbar #seldup \{/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /a barra de seleção ganha \*\*Editar\*\*, ao lado de Duplicar\/Excluir/);
    assert.match(regras, /sem campo Vezes\/Dividir, que só serve pra gerar parcelas novas/);
    assert.match(regras, /marcar Crédito exige escolher a fatura/);
    assert.match(regras, /então funciona igual para um lançamento vindo do Backlog, sem data, ou de qualquer ciclo/);
    assert.match(regras, /desmarcar Crédito limpa a fatura da linha \(`fatura: null`\)/);
    assert.match(regras, /mesmo Editar\/Duplicar\/Excluir na barra de seleção/);
});
