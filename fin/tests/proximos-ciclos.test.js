// Regressão: coluna Próx. 3 nas tabelas do ciclo — pelos dados dos 3 ciclos seguintes, sem
// supor o futuro: Repete só nos 3, Some em nenhum com os 3 terminados, numeração de parcela no
// meio ("1 de 3 (até Out/26)", "2 de 3", "3 de 3"), "Ainda não" sozinho antes de os 3
// terminarem, "—" sem dado; cor só nas saídas; parcelas "(2/12)" são o mesmo compromisso;
// tocar mostra os ciclos e as próximas. Roda o código real de domain/shared/finance e a
// célula de tables.js, com hoje fixo.
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
    const doisDigitos = n => String(n).padStart(2, '0');
    const [a2, m2] = m == 12 ? [a + 1, 1] : [a, m + 1];
    return { id: `c:${i}`, cicloId: i, ini: `${a}-${doisDigitos(m)}-08`, fat: `${a2}-${doisDigitos(m2)}-07` };
});
function carrega(linhas, hoje = '2027-03-01') {
    const contexto = { Estado: { ciclos: CICLOS, lancamentos: linhas, idxHoje: -1, limitesPorCiclo: new Map(), metas: [] }, SALDO_DESDE: '2026-01-01', MESES, document: { getElementById: () => ({}) }, setTimeout, clearTimeout };
    vm.createContext(contexto);
    vm.runInContext(ler('js/domain.js'), contexto);
    vm.runInContext(ler('js/shared.js').replace('const hojeISO = () =>', 'var hojeISO = () =>'), contexto);
    contexto.hojeISO = () => hoje;
    vm.runInContext(ler('js/finance.js'), contexto);
    const visoes = ler('js/cycle-views.js');
    vm.runInContext('const ehVazioTextual = v => v == null || !String(v).trim(); const textoOuTraco = v => ehVazioTextual(v) ? "—" : v;', contexto);
    vm.runInContext(visoes.slice(visoes.indexOf('function categoriaDaComparacao('), visoes.indexOf('function vComp()')), contexto);
    vm.runInContext(visoes.slice(visoes.indexOf('function chaveDaRecorrencia('), visoes.indexOf('function gruposComRecorrenciaDuplicadaEntreMeses(')), contexto);
    const inicio = tabelas.indexOf('const celSeguintes = r =>');
    vm.runInContext(tabelas.slice(inicio, tabelas.indexOf('\n};\n', inicio) + 4) +
        'globalThis.f = { situacao: situacaoNosSeguintes, detalhe: detalheDosSeguintes, cel: celSeguintes };', contexto);
    return contexto.f;
}
const linha = (id, nome, ciclo, extra = {}) => ({ id, nome, categ: 'Casa', v: -10, valor: -10, cred: false, pago: false, periodoIdx: ciclo, ...extra });
const tipo = s => s && `${s.tipo} ${s.sim}`;
const TERMINADOS = '2027-06-01';   // todos os ciclos do teste já acabaram

test('ciclos que já terminaram: Repete, Some e parcela (mesmo nome + categoria, sem acento/caixa)', () => {
    const condominio = linha(1, 'Condomínio', 0), uber = linha(5, 'Uber', 0), gas = linha(6, 'Gás', 0);
    const f = carrega([condominio, linha(2, 'Condominio', 1), linha(3, 'CONDOMÍNIO', 2), linha(4, 'Condomínio', 3),
        uber, gas, linha(7, 'Gás', 2), linha(8, 'Condomínio', 1, { categ: 'Outra' })], TERMINADOS);
    assert.equal(tipo(f.situacao(condominio)), 'repete 3');
    assert.equal(tipo(f.situacao(uber)), 'some 0');
    assert.equal(tipo(f.situacao(gas)), 'parcela 1');           // volta em Set (com um mês sem)
    assert.match(f.cel(gas), /class="togSeguintes"[^>]*>1 de 2 \(até Set\/26\)</);
});

test('Renegociação de Ago, Set e Out (acaba na fatura de Nov) como parcelas: 1, 2 e 3 de 3, até Out/26', () => {
    // Hoje 28/10 (ciclo Out). Compra dia 05, fatura dia 12 do mês seguinte: no Crédito o ciclo
    // da fatura é o seguinte ao da compra, e a linha aparece na tela no ciclo da compra.
    const ago = linha(1, 'Renegociação Nu', 2, { cred: true, data: '2026-08-05', fatura: '2026-09-12' });
    const set = linha(2, 'Renegociação Nu', 3, { cred: true, data: '2026-09-05', fatura: '2026-10-12' });
    const out = linha(3, 'Renegociação Nu', 4, { cred: true, data: '2026-10-05', fatura: '2026-11-12' });
    const f = carrega([ago, set, out], '2026-10-28');
    assert.match(f.cel(ago), />1 de 3 \(até Out\/26\)</);
    assert.match(f.cel(set), />2 de 3 \(até Out\/26\)</);
    assert.match(f.cel(out), />3 de 3 \(até Out\/26\)</);
    assert.equal(f.detalhe(ago), 'Set/26 sim · Out/26 sim · Nov/26 não começou. Próximas: 05/09 fat. 12/10 · 05/10 fat. 12/11');
});

test('sem supor o futuro: ciclo não terminado sem o compromisso não faz Some nem completa Repete', () => {
    // Hoje 20/09: Ago terminou, Set (o de hoje) e Out não.
    const cafe = linha(1, 'Café', 0), ia = linha(3, 'IA Crédito', 0), novo = linha(4, 'Novo', 2);
    const f = carrega([cafe, linha(2, 'Café', 1), ia, novo], '2026-09-20');
    assert.equal(tipo(f.situacao(cafe)), 'parcela 1');           // Ago sim; Set e Out ainda não
    assert.match(f.cel(cafe), /class="togSeguintes"[^>]*>1 de 2 \(até Ago\/26\)</);
    assert.equal(f.detalhe(cafe), 'Ago/26 sim · Set/26 em andamento · Out/26 não começou. Próximas: nenhuma');
    assert.equal(tipo(f.situacao(ia)), 'aindaNao 0');            // sozinho; Ago não, o resto não terminou
    assert.match(f.cel(ia), /class="togSeguintes"[^>]*>Ainda não</);
    assert.equal(f.detalhe(ia), 'Ago/26 não · Set/26 em andamento · Out/26 não começou. Vira Some se Set/26 e Out/26 terminarem sem ele. Próximas: nenhuma');
    assert.equal(f.situacao(novo), null);                        // nada terminou ainda
    assert.match(f.cel(novo), />—</);
    // Um mês depois, Ago e Set terminados sem ele: ainda não é Some; com Out terminado, é.
    const ia2 = linha(3, 'IA Crédito', 0);
    assert.equal(tipo(carrega([ia2], '2026-10-20').situacao(ia2)), 'aindaNao 0');
    assert.match(carrega([ia2], '2026-10-20').detalhe(ia2), /Vira Some se Out\/26 terminar sem ele\./);
    assert.match(carrega([ia2], '2026-11-20').cel(ia2), /class="togSeguintes vd"[^>]*>Some</);
    // Série cadastrada pra frente diz "sim" mesmo no futuro.
    const serie = linha(10, 'Renegociação Nu', 0);
    const g = carrega([serie, linha(11, 'Renegociação Nu', 1), linha(12, 'Renegociação Nu', 2), linha(13, 'Renegociação Nu', 3)], '2026-09-20');
    assert.equal(tipo(g.situacao(serie)), 'repete 3');
});

test('mesmo lote e parcelas "(n/m)" sem lote são o mesmo compromisso', () => {
    const p1 = linha(1, 'TV (1/3)', 0, { recorrencia_id: 9 });
    const t1 = linha(4, 'Renegociação Itaú (1/12)', 0);
    const f = carrega([p1, linha(2, 'TV (2/3)', 1, { recorrencia_id: 9 }), linha(3, 'TV (3/3)', 2, { recorrencia_id: 9 }),
        t1, linha(5, 'Renegociação Itaú (2/12)', 1), linha(6, 'Renegociação Itaú (3/12)', 2), linha(7, 'Renegociação Itaú (4/12)', 3)], TERMINADOS);
    assert.match(f.cel(p1), />1 de 3 \(até Set\/26\)</);
    assert.equal(tipo(f.situacao(t1)), 'repete 3');
});

test('"—" sem ciclo, em linha calculada e sem 3 ciclos à frente', () => {
    const f = carrega([], TERMINADOS);
    for (const extra of [{ periodoIdx: null }, { _fat: 1 }, { _sal: 1 }, { _sug: -5 }, { _res: 1 }, { periodoIdx: 5 }]) {
        assert.equal(f.situacao(linha(1, 'X', 0, extra)), null, JSON.stringify(extra));
    }
    assert.equal(f.cel(linha(1, 'X', 5)), '—');                  // faltam ciclos depois de Dez
    assert.equal(f.cel(linha(1, 'X', 0, { cred: true })), '—');  // fatura de Jul: compra antes dos ciclos
});

test('cor só nas saídas; o meio sem cor; próximas com data e fatura', () => {
    const saida = linha(1, 'Aluguel', 0), entrada = linha(2, 'Salário', 0, { v: 100, valor: 100 }), avulsa = linha(5, 'Presente', 0);
    const f = carrega([saida, linha(3, 'Aluguel', 1), linha(4, 'Aluguel', 2), linha(6, 'Aluguel', 3), entrada,
        linha(7, 'Salário', 1), linha(8, 'Salário', 2), linha(9, 'Salário', 3), avulsa], TERMINADOS);
    assert.match(f.cel(saida), /class="togSeguintes vm"[^>]*>Repete</);
    assert.match(f.cel(entrada), /class="togSeguintes"[^>]*>Repete</);
    assert.match(f.cel(avulsa), /class="togSeguintes vd"[^>]*>Some</);
    const p1 = linha(20, 'Renegociação Nu', 1, { cred: true, data: '2026-07-05', fatura: '2026-08-12' });
    const h = carrega([p1, linha(21, 'Renegociação Nu', 1, { cred: true, data: '2026-08-05', fatura: '2026-08-12' }),
        linha(22, 'Renegociação Nu', null, { cred: true, data: '2026-09-05', fatura: null })], TERMINADOS);
    assert.match(h.detalhe(p1), /Próximas: 05\/08 fat\. 12\/08 · 05\/09 fat\. nenhuma sem ciclo$/);
});

test('coluna depois de Frequência, fora do Backlog, ordenação, filtro e toque', () => {
    assert.match(estado, /\['freq', 'Frequência', 't'\], \['seguintes', 'Próx\. 3', 's'\]/);
    assert.match(estado, /chave !== 'prio' && chave !== 'seguintes'/);
    assert.match(tabelas, /seguintes: \[\['repete', 'Repete'[^\]]+'vm'\], \['some', 'Some'[^\]]+'vd'\]\]/);
    assert.match(tabelas, /if \(coluna == 'seguintes'\) return situacaoNosSeguintes\(r\)\?\.tipo === termo;/);
    assert.match(tabelas, /if \(coluna == 'seguintes' && \(A == null\) != \(B == null\)\) return A == null \? 1 : -1;/);
    assert.match(ler('css/dashboard.css'), /\.col-seguintes \{ width: 10\.5rem; \}/);
    assert.match(ler('js/interactions.js'), /const celula = e\.target\.closest\('\[data-seguintes\]'\);[\s\S]{0,80}e\.stopImmediatePropagation\(\);\s*\n\s*mostrarToast\('Próx\. 3', celula\.dataset\.seguintes\);/);
});

test('regra documentada', () => {
    assert.match(regras, /### Coluna Próx\. 3/);
    assert.match(regras, /Cor só nas saídas: \*\*Repete\*\* em vermelho, \*\*Some\*\* em verde/);
    assert.match(regras, /ignorando o número de parcela no fim do nome/);
    assert.match(regras, /sem supor o futuro/);
    assert.match(regras, /como numeração de parcela/);
    assert.match(regras, /Exemplo de \*\*Ainda não\*\*/);
});
