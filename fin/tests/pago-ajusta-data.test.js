// Regressão: ao MARCAR como pago um Débito real (nunca ao desmarcar, nunca Crédito), a data
// é ajustada automaticamente pra hoje quando o vencimento ainda não chegou mas cai no MESMO
// ciclo; fora do ciclo atual, pede confirmação antes em vez de aplicar direto.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('guarda só MARCAR (nunca desmarcar) e só Débito (nunca Crédito)', () => {
    assert.match(interacoes, /if \(novoPago && !r\.cred && r\.data\) \{/);
});

test('fora do ciclo pede confirmação; é a 2ª caixa nativa permitida, documentada em REGRAS.md', () => {
    assert.match(interacoes, /if \(!confirm\(`"\$\{r\.nome \?\? ''\}" está datado \$\{dataBR\(dataAtual\)\}, fora do ciclo atual\. Marcar como pago mesmo assim\?`\)\) \{\s*\n\s*return;/);
    assert.match(regras, /As únicas caixas nativas \(`confirm\(\)`\) permitidas são:/);
    assert.match(regras, /a confirmação ao marcar como pago um Débito cuja data cai fora do ciclo atual/);
});

test('PATCH só inclui "data" quando ela realmente mudou, e reclassificaPeriodo roda junto', () => {
    assert.match(interacoes, /const campos = \{ pago: novoPago \};\s*\n\s*if \(novaData !== r\.data\) campos\.data = novaData;/);
    assert.match(interacoes, /if \(novaData !== r\.data\) \{ r\.data = novaData; reclassificaPeriodo\(r\); \}/);
});

// Extrai só a lógica de decisão (sem tocar DOM/Estado real) e roda num contexto isolado com
// hojeISO/periodoDoDebito/confirm simulados, pra testar o comportamento de verdade.
function criaDecideAjustePago({ hoje, periodoPorData, confirmResposta = true }) {
    const inicio = interacoes.indexOf('    const novoPago = !r.pago;');
    const fim = interacoes.indexOf('    badge.classList.toggle');
    if (inicio < 0 || fim < 0) throw Error('Não encontrou o ajuste automático de data no toggle de Pago.');
    const corpo = interacoes.slice(inicio, fim);
    const chamadasConfirm = [];
    const contexto = {
        hojeISO: () => hoje,
        dataISO: v => v,
        dataBR: v => v,
        periodoDoDebito: data => periodoPorData[data] ?? -1,
        confirm: msg => { chamadasConfirm.push(msg); return confirmResposta; },
    };
    vm.createContext(contexto);
    vm.runInContext(`function decide(r) {\n${corpo}\n    return { novoPago, novaData };\n}\nglobalThis.decide = decide;`, contexto);
    return { decide: contexto.decide, chamadasConfirm };
}

test('mesma data: segue direto, sem ajuste nem confirmação', () => {
    const { decide, chamadasConfirm } = criaDecideAjustePago({
        hoje: '2026-10-09',
        periodoPorData: { '2026-10-09': 2 },
    });
    const resultado = decide({ pago: false, cred: false, data: '2026-10-09', nome: 'Água' });
    assert.deepEqual({ ...resultado }, { novoPago: true, novaData: '2026-10-09' });
    assert.equal(chamadasConfirm.length, 0);
});

test('vencimento futuro no MESMO ciclo: ajusta a data pra hoje, sem perguntar', () => {
    const { decide, chamadasConfirm } = criaDecideAjustePago({
        hoje: '2026-10-09',
        periodoPorData: { '2026-10-09': 2, '2026-10-20': 2 },
    });
    const resultado = decide({ pago: false, cred: false, data: '2026-10-20', nome: 'Água' });
    assert.deepEqual({ ...resultado }, { novoPago: true, novaData: '2026-10-09' });
    assert.equal(chamadasConfirm.length, 0);
});

test('vencimento já passado no MESMO ciclo: mantém a data original, sem perguntar', () => {
    const { decide, chamadasConfirm } = criaDecideAjustePago({
        hoje: '2026-10-09',
        periodoPorData: { '2026-10-09': 2, '2026-10-01': 2 },
    });
    const resultado = decide({ pago: false, cred: false, data: '2026-10-01', nome: 'Água' });
    assert.deepEqual({ ...resultado }, { novoPago: true, novaData: '2026-10-01' });
    assert.equal(chamadasConfirm.length, 0);
});

test('data em ciclo diferente do de hoje: pede confirmação; confirmando, mantém a data original', () => {
    const { decide, chamadasConfirm } = criaDecideAjustePago({
        hoje: '2026-10-09',
        periodoPorData: { '2026-10-09': 2, '2026-11-05': 3 },
        confirmResposta: true,
    });
    const resultado = decide({ pago: false, cred: false, data: '2026-11-05', nome: 'Água' });
    assert.deepEqual({ ...resultado }, { novoPago: true, novaData: '2026-11-05' });
    assert.equal(chamadasConfirm.length, 1);
    assert.match(chamadasConfirm[0], /"Água" está datado 2026-11-05, fora do ciclo atual/);
});

test('data em ciclo diferente e usuário cancela a confirmação: aborta sem marcar pago', () => {
    const { decide, chamadasConfirm } = criaDecideAjustePago({
        hoje: '2026-10-09',
        periodoPorData: { '2026-10-09': 2, '2026-11-05': 3 },
        confirmResposta: false,
    });
    const resultado = decide({ pago: false, cred: false, data: '2026-11-05', nome: 'Água' });
    assert.equal(resultado, undefined);
    assert.equal(chamadasConfirm.length, 1);
});

test('ciclo não encontrado (periodoDoDebito devolve -1) conta como fora do ciclo, nunca como "mesmo ciclo"', () => {
    const { decide, chamadasConfirm } = criaDecideAjustePago({
        hoje: '2026-10-09',
        periodoPorData: { '2026-10-09': -1, '2099-01-01': -1 },   // nenhuma das duas datas cai em ciclo cadastrado
        confirmResposta: true,
    });
    decide({ pago: false, cred: false, data: '2099-01-01', nome: 'Teste' });
    assert.equal(chamadasConfirm.length, 1);
});

test('Crédito nunca entra nessa regra, mesmo com data fora do ciclo', () => {
    const { decide, chamadasConfirm } = criaDecideAjustePago({
        hoje: '2026-10-09',
        periodoPorData: { '2026-10-09': 2, '2026-12-01': 5 },
    });
    const resultado = decide({ pago: false, cred: true, data: '2026-12-01', nome: 'Compra cartão' });
    assert.deepEqual({ ...resultado }, { novoPago: true, novaData: '2026-12-01' });
    assert.equal(chamadasConfirm.length, 0);
});

test('desmarcar (já pago) nunca entra nessa regra, mesmo com data fora do ciclo', () => {
    const { decide, chamadasConfirm } = criaDecideAjustePago({
        hoje: '2026-10-09',
        periodoPorData: { '2026-10-09': 2, '2026-12-01': 5 },
    });
    const resultado = decide({ pago: true, cred: false, data: '2026-12-01', nome: 'Água' });
    assert.deepEqual({ ...resultado }, { novoPago: false, novaData: '2026-12-01' });
    assert.equal(chamadasConfirm.length, 0);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /Clicar no badge Pago\/Aberto de um lançamento real de Débito \(nunca Crédito/);
    assert.match(regras, /para MARCAR como pago \(nunca ao desmarcar\) compara a data gravada com hoje/);
    assert.match(regras, /dentro do MESMO ciclo, com a data gravada ainda no futuro, ajustam a data para hoje automaticamente, sem perguntar/);
    assert.match(regras, /a conta de água, paga logo no início do ciclo/);
    assert.match(regras, /Dentro do mesmo ciclo mas já no passado, ou em qualquer ciclo diferente do de hoje \(incluindo um já encerrado\), a data nunca é tocada/);
    assert.match(regras, /só no caso de ciclo diferente, a ação pede confirmação antes de marcar como pago/);
});
