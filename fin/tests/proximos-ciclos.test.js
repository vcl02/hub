// Regressão: coluna Próx. 3 nas tabelas do ciclo — Repete quando o compromisso aparece nos 3
// ciclos seguintes, Some quando em nenhum, "n de 3" no meio, "—" sem como saber; cor só nas
// saídas; parcelas "(2/12)" são o mesmo compromisso; tocar mostra os ciclos. Roda o código
// real de domain/shared/finance e a célula de tables.js.
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
    const contexto = { Estado: { ciclos: CICLOS, lancamentos: linhas, idxHoje: -1, limitesPorCiclo: new Map(), metas: [] }, SALDO_DESDE: '2026-01-01', MESES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'], document: { getElementById: () => ({}) }, setTimeout, clearTimeout };
    vm.createContext(contexto);
    ['js/domain.js', 'js/shared.js', 'js/finance.js'].forEach(arquivo => vm.runInContext(ler(arquivo), contexto));
    const visoes = ler('js/cycle-views.js');
    // chaveDaRecorrencia e o que ela usa (categoriaDaComparacao) vêm de cycle-views.js.
    vm.runInContext('const ehVazioTextual = v => v == null || !String(v).trim(); const textoOuTraco = v => ehVazioTextual(v) ? "—" : v;', contexto);
    vm.runInContext(visoes.slice(visoes.indexOf('function categoriaDaComparacao('), visoes.indexOf('function vComp()')), contexto);
    vm.runInContext(visoes.slice(visoes.indexOf('function chaveDaRecorrencia('), visoes.indexOf('function gruposComRecorrenciaDuplicadaEntreMeses(')), contexto);
    vm.runInContext('globalThis.f = presencasNosSeguintes; globalThis.detalhe = detalheDosSeguintes;', contexto);
    const tabelas = ler('js/tables.js');
    vm.runInContext(tabelas.slice(tabelas.indexOf('const celSeguintes = r =>'), tabelas.indexOf('\n};\n', tabelas.indexOf('const celSeguintes = r =>')) + 4) + 'globalThis.cel = celSeguintes;', contexto);
    contexto.f.detalhe = contexto.detalhe;
    contexto.f.cel = contexto.cel;
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
    assert.match(tabelas, /seguintes: \[\['3', 'Repete'[^\]]+'vm'\], \['0', 'Some'[^\]]+'vd'\]\]/);
    assert.match(tabelas, /if \(coluna == 'seguintes'\) return presencasNosSeguintes\(r\) === \+termo;/);
    assert.match(tabelas, /if \(coluna == 'seguintes' && \(A == null\) != \(B == null\)\) return A == null \? 1 : -1;/);
    assert.match(ler('css/dashboard.css'), /\.col-seguintes \{ width: 6\.25rem; \}/);
});

test('parcelas do Tasker (nome com "(n/m)", sem lote) são o mesmo compromisso', () => {
    const p1 = linha(1, 'Renegociação Itaú (1/12)', 0, { cred: true });
    const f = carrega([p1, linha(2, 'Renegociação Itaú (2/12)', 1, { cred: true }), linha(3, 'Renegociação Itaú (3/12)', 2, { cred: true }),
        linha(4, 'Renegociação Itaú (4/12)', 3, { cred: true })]);
    assert.equal(f(p1), 3);
});

test('cor só nas saídas; entrada e o meio sem cor; tocar mostra os ciclos', () => {
    const saida = linha(1, 'Aluguel', 0), entrada = linha(2, 'Salário', 0, { v: 100, valor: 100 }), avulsa = linha(5, 'Presente', 0);
    const f = carrega([saida, linha(3, 'Aluguel', 1), linha(4, 'Aluguel', 2), linha(6, 'Aluguel', 3), entrada,
        linha(7, 'Salário', 1), linha(8, 'Salário', 2), linha(9, 'Salário', 3), avulsa]);
    assert.match(f.cel(saida), /class="togSeguintes vm"[^>]*>Repete</);
    assert.match(f.cel(entrada), /class="togSeguintes"[^>]*>Repete</);
    assert.match(f.cel(avulsa), /class="togSeguintes vd"[^>]*>Some</);
    assert.equal(f.detalhe(saida), 'Ago/26 sim · Set/26 sim · Out/26 sim');
    assert.equal(f.detalhe(avulsa), 'Ago/26 não · Set/26 não · Out/26 não');
    // Crédito aparece na tela no ciclo anterior ao da fatura.
    const compra = linha(10, 'Netflix', 0, { cred: true });
    const g = carrega([compra, linha(11, 'Netflix', 1, { cred: true })]);
    assert.equal(g.detalhe(compra), 'Jul/26 sim · Ago/26 não · Set/26 não');
    assert.match(ler('js/interactions.js'), /const celula = e\.target\.closest\('\[data-seguintes\]'\);[\s\S]{0,80}e\.stopImmediatePropagation\(\);\s*\n\s*mostrarToast\('Próx\. 3', celula\.dataset\.seguintes\);/);
});

test('regra documentada', () => {
    assert.match(regras, /### Coluna Próx\. 3/);
    assert.match(regras, /Cor só nas saídas: \*\*Repete\*\* em vermelho, \*\*Some\*\* em verde/);
    assert.match(regras, /ignorando o número de parcela no fim do nome/);
});
