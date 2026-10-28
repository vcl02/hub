// Regressão: coluna Próx. 3 nas tabelas do ciclo — Repete (vermelho) quando o compromisso
// aparece nos 3 ciclos seguintes, Some (verde) quando em nenhum, "n de 3" no meio, "—" sem
// como saber. Roda o código real de domain/shared/finance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const tabelas = ler('js/tables.js');
const estado = ler('js/app-state.js');
const regras = ler('docs/REGRAS.md');

// Cinco ciclos; a linha olhada fica no 0, então 1, 2 e 3 são os seguintes.
const CICLOS = ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05']
    .map((ini, i) => ({ id: `c:${i}`, cicloId: i, ini, fat: '9999-12-31' }));
function carrega(linhas) {
    const contexto = { Estado: { ciclos: CICLOS, lancamentos: linhas, idxHoje: -1, limitesPorCiclo: new Map(), metas: [] }, SALDO_DESDE: '2026-01-01', MESES: [], document: { getElementById: () => ({}) }, setTimeout, clearTimeout };
    vm.createContext(contexto);
    ['js/domain.js', 'js/shared.js', 'js/finance.js'].forEach(arquivo => vm.runInContext(ler(arquivo), contexto));
    const visoes = ler('js/cycle-views.js');
    // chaveDaRecorrencia e o que ela usa (categoriaDaComparacao) vêm de cycle-views.js.
    vm.runInContext('const ehVazioTextual = v => v == null || !String(v).trim(); const textoOuTraco = v => ehVazioTextual(v) ? "—" : v;', contexto);
    vm.runInContext(visoes.slice(visoes.indexOf('function categoriaDaComparacao('), visoes.indexOf('function vComp()')), contexto);
    vm.runInContext(visoes.slice(visoes.indexOf('function chaveDaRecorrencia('), visoes.indexOf('function gruposComRecorrenciaDuplicadaEntreMeses(')), contexto);
    vm.runInContext('globalThis.f = presencasNosSeguintes;', contexto);
    return contexto.f;
}
const linha = (id, nome, ciclo, extra = {}) => ({ id, nome, categ: 'Casa', v: -10, valor: -10, cred: false, pago: false, periodoIdx: ciclo, ...extra });

test('conta em quantos dos 3 ciclos seguintes o mesmo nome + categoria aparece', () => {
    const condominio = linha(1, 'Condomínio', 0);
    const uber = linha(5, 'Uber', 0);
    const gas = linha(6, 'Gás', 0);
    const f = carrega([condominio, linha(2, 'Condominio', 1), linha(3, 'CONDOMÍNIO', 2), linha(4, 'Condomínio', 3),
        uber, gas, linha(7, 'Gás', 2), linha(8, 'Condomínio', 1, { categ: 'Outra' })]);
    assert.equal(f(condominio), 3);   // sem acento/caixa; outra categoria não conta
    assert.equal(f(uber), 0);
    assert.equal(f(gas), 1);
});

test('mesmo lote conta mesmo com o nome trocado (parcelas "(2/12)")', () => {
    const p1 = linha(1, 'TV (1/3)', 0, { recorrencia_id: 9 });
    const f = carrega([p1, linha(2, 'TV (2/3)', 1, { recorrencia_id: 9 }), linha(3, 'TV (3/3)', 2, { recorrencia_id: 9 })]);
    assert.equal(f(p1), 2);
});

test('"—" sem ciclo, em linha calculada e sem 3 ciclos à frente', () => {
    const f = carrega([]);
    assert.equal(f(linha(1, 'X', null)), null);
    assert.equal(f(linha(1, 'Fatura Nubank', 0, { _fat: 1 })), null);
    assert.equal(f(linha(1, 'Saldo do mês anterior', 0, { _sal: 1 })), null);
    assert.equal(f(linha(1, 'Aporte sugerido', 0, { _sug: -5 })), null);
    assert.equal(f(linha(1, 'Resgate necessário', 0, { _res: 1 })), null);
    assert.equal(f(linha(1, 'X', 2)), null);   // ciclos 3 e 4 só: faltam 3 à frente
    assert.equal(f(linha(1, 'X', 1)), 0);      // 2, 3 e 4
});

test('coluna depois de Frequência, fora do Backlog, com cor, ordenação e filtro', () => {
    assert.match(estado, /\['freq', 'Frequência', 't'\], \['seguintes', 'Próx\. 3', 's'\]/);
    assert.match(estado, /chave !== 'prio' && chave !== 'seguintes'/);
    assert.match(tabelas, /if \(n == CICLOS_SEGUINTES\) return '<span class=vm title="Aparece nos 3 ciclos seguintes">Repete<\/span>';/);
    assert.match(tabelas, /if \(n == 0\) return '<span class=vd title="Não aparece em nenhum dos 3 ciclos seguintes">Some<\/span>';/);
    assert.match(tabelas, /seguintes: \[\['3', 'Repete'[^\]]+'vm'\], \['0', 'Some'[^\]]+'vd'\]\]/);
    assert.match(tabelas, /if \(coluna == 'seguintes'\) return presencasNosSeguintes\(r\) === \+termo;/);
    assert.match(tabelas, /if \(coluna == 'seguintes' && \(A == null\) != \(B == null\)\) return A == null \? 1 : -1;/);
    assert.match(ler('css/dashboard.css'), /\.col-seguintes \{ width: 6\.25rem; \}/);
});

test('regra documentada', () => {
    assert.match(regras, /### Coluna Próx\. 3/);
    assert.match(regras, /\*\*Repete\*\* em vermelho \(nos 3\), \*\*Some\*\* em verde \(em nenhum\)/);
});
