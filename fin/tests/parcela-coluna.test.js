// Regressão: coluna Parcela nas tabelas do ciclo — toda linha com ciclo numerada como parcela da
// sequência de ciclos seguidos com o mesmo compromisso ("2 de 3 (até Out/26)"), sem janela de 3,
// sem Repete/Some/traço; um ciclo sem ele recomeça a contagem; linha calculada fica vazia;
// parcelas "(2/12)" e o mesmo lote são o mesmo compromisso; no Crédito, o ciclo é o das compras.
// Roda o código real de domain/shared/finance e a célula de tables.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const tabelas = ler('js/tables.js');
const estado = ler('js/app-state.js');
const regras = ler('docs/REGRAS.md');
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Oito ciclos, de Jul/26 a Fev/27 (dia 8 ao dia 7).
const CICLOS = [[2026, 7], [2026, 8], [2026, 9], [2026, 10], [2026, 11], [2026, 12], [2027, 1], [2027, 2]].map(([a, m], i) => {
    const dd = n => String(n).padStart(2, '0');
    const [a2, m2] = m == 12 ? [a + 1, 1] : [a, m + 1];
    return { id: `c:${i}`, cicloId: i, ini: `${a}-${dd(m)}-08`, fat: `${a2}-${dd(m2)}-07` };
});
function carrega(linhas) {
    const contexto = { Estado: { ciclos: CICLOS, lancamentos: linhas, idxHoje: -1, limitesPorCiclo: new Map(), metas: [] }, SALDO_DESDE: '2026-01-01', MESES, document: { getElementById: () => ({}) }, setTimeout, clearTimeout };
    vm.createContext(contexto);
    ['js/domain.js', 'js/shared.js', 'js/finance.js'].forEach(arquivo => vm.runInContext(ler(arquivo), contexto));
    const visoes = ler('js/cycle-views.js');
    vm.runInContext('const ehVazioTextual = v => v == null || !String(v).trim(); const textoOuTraco = v => ehVazioTextual(v) ? "—" : v;', contexto);
    vm.runInContext(visoes.slice(visoes.indexOf('function categoriaDaComparacao('), visoes.indexOf('function vComp()')), contexto);
    vm.runInContext(visoes.slice(visoes.indexOf('function chaveDaRecorrencia('), visoes.indexOf('function gruposComRecorrenciaDuplicadaEntreMeses(')), contexto);
    const inicio = tabelas.indexOf('const corDaParcela = p =>');
    vm.runInContext(tabelas.slice(inicio, tabelas.indexOf('\n};\n', tabelas.indexOf('const celParcela = r =>')) + 4) +
        'globalThis.f = { parcela: parcelaDaLinha, detalhe: detalheDaParcela, cel: celParcela };', contexto);
    return contexto.f;
}
const linha = (id, nome, ciclo, extra = {}) => ({ id, nome, categ: 'Casa', v: -10, valor: -10, cred: false, pago: false, periodoIdx: ciclo, ...extra });
const resumo = p => p && `${p.posicao}/${p.total} falta ${p.falta}`;

test('Renegociação de Ago, Set e Out (acaba na fatura de Nov): 1, 2 e 3 de 3, até Out/26', () => {
    // No Crédito o ciclo da fatura é o seguinte ao da compra; a linha aparece no da compra.
    const ago = linha(1, 'Renegociação Nu', 2, { cred: true, data: '2026-08-05', fatura: '2026-09-12' });
    const set = linha(2, 'Renegociação Nu', 3, { cred: true, data: '2026-09-05', fatura: '2026-10-12' });
    const out = linha(3, 'Renegociação Nu', 4, { cred: true, data: '2026-10-05', fatura: '2026-11-12' });
    const f = carrega([ago, set, out]);
    assert.match(f.cel(ago), /class="togParcela vm"[^>]*>1 de 3 \(até Out\/26\)</);   // até 1/3: vermelho
    assert.match(f.cel(set), /class="togParcela vd"[^>]*>2 de 3 \(até Out\/26\)</);   // depois de 2/3: verde
    assert.match(f.cel(out), /class="togParcela vd"[^>]*>3 de 3 \(até Out\/26\)</);
    assert.equal(f.detalhe(ago), 'Parcela 1 de 3: de Ago/26 a Out/26. Próximas: 05/09 fat. 12/10 · 05/10 fat. 12/11');
});

test('sequência inteira, sem janela de 3; ciclo sem ele recomeça; sozinho é 1 de 1', () => {
    const serie = [0, 1, 2, 3, 4, 5, 6, 7].map(c => linha(10 + c, 'Spotify', c));
    const gas = [linha(1, 'Gás', 0), linha(2, 'Gás', 1), linha(3, 'Gás', 3)];   // falta em Set
    const sozinho = linha(4, 'Tênis', 2);
    const f = carrega([...serie, ...gas, sozinho, linha(5, 'Gás', 0)]);           // dois gás em Jul: mesma parcela
    assert.equal(resumo(f.parcela(serie[2])), '3/8 falta 5');
    assert.match(f.cel(serie[2]), /class="togParcela am"[^>]*>3 de 8 \(até Fev\/27\)</);   // 37,5%: amarelo
    assert.match(f.cel(serie[1]), /class="togParcela vm"[^>]*>2 de 8/);                   // 25%: vermelho
    assert.match(f.cel(serie[5]), /class="togParcela vd"[^>]*>6 de 8/);                   // 75%: verde
    assert.match(f.cel(gas[0]), /class="togParcela am"[^>]*>1 de 2/);                     // 50%: amarelo
    const salario = [0, 1, 2].map(c => linha(30 + c, 'Salário', c, { v: 100, valor: 100 }));
    assert.match(carrega(salario).cel(salario[0]), /class="togParcela" [^>]*>1 de 3/);   // entrada: sem cor
    assert.equal(resumo(f.parcela(gas[1])), '2/2 falta 0');
    assert.equal(resumo(f.parcela(gas[2])), '1/1 falta 0');
    assert.match(f.cel(sozinho), /class=togParcela [^>]*>—</);   // 1 de 1: traço, sem cor
    const condominio = [0, 1, 2].map(c => linha(40 + c, 'Condomínio', c, { pra_sempre: true }));
    assert.match(carrega(condominio).cel(condominio[1]), /class=togParcela [^>]*>—</);   // pra sempre: traço
    assert.equal(f.detalhe(sozinho), 'Parcela 1 de 1: só em Set/26. Próximas: nenhuma');
});

test('mesmo lote e parcelas "(n/m)" sem lote são o mesmo compromisso; mesmo nome em outra categoria não', () => {
    const p1 = linha(1, 'TV (1/3)', 0, { recorrencia_id: 9 });
    const t1 = linha(4, 'Renegociação Itaú (1/12)', 0);
    const f = carrega([p1, linha(2, 'TV (2/3)', 1, { recorrencia_id: 9 }), linha(3, 'TV (3/3)', 2, { recorrencia_id: 9 }),
        t1, linha(5, 'renegociacao itau (2/12)', 1), linha(6, 'Renegociação Itaú', 1, { categ: 'Outra' })]);
    assert.equal(resumo(f.parcela(p1)), '1/3 falta 2');
    assert.equal(resumo(f.parcela(t1)), '1/2 falta 1');
});

test('linha calculada e sem ciclo ficam vazias (sem traço)', () => {
    const f = carrega([]);
    for (const extra of [{ periodoIdx: null }, { _fat: 1 }, { _sal: 1 }, { _sug: -5 }, { _res: 1 }]) {
        assert.equal(f.cel(linha(1, 'X', 0, extra)), '', JSON.stringify(extra));
    }
    assert.equal(f.cel(linha(1, 'X', 0, { cred: true })), '');   // fatura de Jul: compra antes dos ciclos
});

test('coluna depois de Frequência, fora do Backlog; ordena por quantas faltam; filtro pela faixa da cor; toque', () => {
    assert.match(estado, /\['freq', 'Frequência', 't'\], \['parcela', 'Parcela', 's'\]/);
    assert.match(estado, /chave !== 'prio' && chave !== 'parcela'/);
    assert.doesNotMatch(tabelas, /Repete|'some'/);
    assert.match(tabelas, /parcela: \[\['vm', '0–33%'[^\]]+'vm'\], \['am', '33–66%'[^\]]+'am'\], \['vd', '66–100%'[^\]]+'vd'\]\]/);
    assert.match(tabelas, /return !!p && p\.total > 1 && !r\.pra_sempre && \(r\.v \|\| 0\) <= 0 && corDaParcela\(p\) === termo;/);
    assert.match(tabelas, /const valor = r => coluna == 'parcela' \? parcelaDaLinha\(r\)\?\.falta \?\? null : r\[coluna\];/);
    assert.match(ler('css/dashboard.css'), /\.col-parcela \{ width: 11\.5rem; \}/);
    assert.match(ler('js/interactions.js'), /const celula = e\.target\.closest\('\[data-parcela\]'\);[\s\S]{0,80}e\.stopImmediatePropagation\(\);\s*\n\s*mostrarToast\('Parcela', celula\.dataset\.parcela\);/);
});

test('regra documentada', () => {
    assert.match(regras, /### Coluna Parcela/);
    assert.match(regras, /Um ciclo sem o compromisso encerra a sequência/);
    assert.match(regras, /até 1\/3 \*\*vermelho\*\*, até 2\/3 \*\*amarelo\*\*, depois \*\*verde\*\*/);
    assert.match(regras, /entrada \(valor positivo\) e o "—" ficam sem cor/);
    assert.match(regras, /filtra por clique pela faixa da cor/);
    assert.match(regras, /Lançamento sozinho \(`1 de 1`\) e o que é \*\*pra sempre\*\*/);
    assert.match(regras, /ignorando o número de parcela no fim do nome/);
    assert.match(regras, /Linha calculada .* fica com a célula vazia/);
});
