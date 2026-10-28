// Regressão: coluna Próx. 3 nas tabelas do ciclo — pelos dados dos 3 ciclos seguintes, sem
// supor o futuro: Repete só nos 3, Some em nenhum com 2 ciclos terminados sem ele, "1 de 3
// (até Out/26)" no meio, "Ainda não" com 1 só, "—" sem dado; ciclo não terminado sem o compromisso é "ainda não"; cor só nas saídas; parcelas "(2/12)" são o mesmo compromisso; tocar mostra os ciclos e as próximas.
// Roda o código real de domain/shared/finance e a célula de tables.js, com hoje fixo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const tabelas = ler('js/tables.js');
const estado = ler('js/app-state.js');
const regras = ler('docs/REGRAS.md');
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Ciclos de Jul/26 a Dez/26 (dia 8 ao dia 7). A linha olhada fica no 0 (Jul).
const CICLOS = ['07', '08', '09', '10', '11', '12'].map((m, i) => ({
    id: `c:${i}`, cicloId: i, ini: `2026-${m}-08`, fat: i < 5 ? `2026-${String(+m + 1).padStart(2, '0')}-07` : '2027-01-07',
}));
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

test('ciclos que já terminaram: Repete, Some e o meio; mesmo nome + categoria, sem acento/caixa', () => {
    const condominio = linha(1, 'Condomínio', 0), uber = linha(5, 'Uber', 0), gas = linha(6, 'Gás', 0);
    const f = carrega([condominio, linha(2, 'Condominio', 1), linha(3, 'CONDOMÍNIO', 2), linha(4, 'Condomínio', 3),
        uber, gas, linha(7, 'Gás', 2), linha(8, 'Condomínio', 1, { categ: 'Outra' })]);
    assert.equal(tipo(f.situacao(condominio)), 'repete 3');
    assert.equal(tipo(f.situacao(uber)), 'some 0');
    assert.equal(tipo(f.situacao(gas)), 'ate 1');
    assert.match(f.cel(gas), /class="togSeguintes"[^>]*>1 de 3 \(até Set\/26\)</);
    assert.doesNotMatch(f.cel(gas), / de 3</);
});

test('sem supor o futuro: ciclo não terminado sem o compromisso não faz Some nem completa Repete', () => {
    // Hoje 20/09: Ago terminou, Set (o de hoje) e Out não.
    const cafe = linha(1, 'Café', 0), ia = linha(3, 'IA Crédito', 0), tudoDepois = linha(4, 'Novo', 2);
    const f = carrega([cafe, linha(2, 'Café', 1), ia, tudoDepois], '2026-09-20');
    assert.equal(tipo(f.situacao(cafe)), 'ate 1');           // Ago sim; Set em andamento, Out não começou
    assert.equal(tipo(f.situacao(ia)), 'aindaNao 0');        // Ago não; o resto não terminou: não é Some
    assert.equal(f.situacao(tudoDepois), null);              // Out, Nov e Dez: nada diz nada ainda
    assert.equal(f.detalhe(cafe), 'Ago/26 sim · Set/26 em andamento · Out/26 não começou. Próximas: nenhuma');
    assert.match(f.cel(tudoDepois), />—</);
    assert.match(f.cel(cafe), /class="togSeguintes"[^>]*>1 de 3 \(até Ago\/26\)</);
    assert.match(f.cel(ia), /class="togSeguintes"[^>]*>Ainda não</);
    assert.equal(f.detalhe(ia), 'Ago/26 não · Set/26 em andamento · Out/26 não começou. Vira Some se Set/26 terminar sem ele. Próximas: nenhuma');
    // Um mês depois (hoje 20/10): Ago e Set terminaram sem ele — 2 bastam pra Some.
    const depois = carrega([linha(3, 'IA Crédito', 0)], '2026-10-20');
    assert.equal(tipo(depois.situacao(linha(3, 'IA Crédito', 0))), 'some 0');
    assert.match(depois.cel(linha(3, 'IA Crédito', 0)), /class="togSeguintes vd"[^>]*>Some</);
    // Série cadastrada pra frente diz "sim" mesmo no futuro.
    const serie = linha(10, 'Renegociação Nu', 0);
    const g = carrega([serie, linha(11, 'Renegociação Nu', 1), linha(12, 'Renegociação Nu', 2), linha(13, 'Renegociação Nu', 3)], '2026-09-20');
    assert.equal(tipo(g.situacao(serie)), 'repete 3');
});

test('no Crédito, o ciclo que importa é o das compras (o anterior ao da fatura)', () => {
    // Compra na fatura do ciclo 1 (aparece na tela no ciclo 0); hoje 20/09 (ciclo 2).
    const compra = linha(1, 'Netflix', 1, { cred: true });
    const f = carrega([compra, linha(2, 'Netflix', 2, { cred: true })], '2026-09-20');
    // Seguintes pela fatura: 2, 3, 4; as compras delas, na tela: Ago (terminou), Set (hoje), Out.
    assert.equal(f.detalhe(compra), 'Ago/26 sim · Set/26 em andamento · Out/26 não começou. Próximas: nenhuma');
    assert.equal(tipo(f.situacao(compra)), 'ate 1');
    assert.match(f.cel(compra), />1 de 3 \(até Ago\/26\)</);
});

test('mesmo lote e parcelas "(n/m)" sem lote são o mesmo compromisso', () => {
    const p1 = linha(1, 'TV (1/3)', 0, { recorrencia_id: 9 });
    const t1 = linha(4, 'Renegociação Itaú (1/12)', 0);
    const f = carrega([p1, linha(2, 'TV (2/3)', 1, { recorrencia_id: 9 }), linha(3, 'TV (3/3)', 2, { recorrencia_id: 9 }),
        t1, linha(5, 'Renegociação Itaú (2/12)', 1), linha(6, 'Renegociação Itaú (3/12)', 2), linha(7, 'Renegociação Itaú (4/12)', 3)]);
    assert.equal(tipo(f.situacao(p1)), 'ate 2');
    assert.equal(tipo(f.situacao(t1)), 'repete 3');
});

test('"—" sem ciclo, em linha calculada e sem 3 ciclos à frente', () => {
    const f = carrega([]);
    for (const extra of [{ periodoIdx: null }, { _fat: 1 }, { _sal: 1 }, { _sug: -5 }, { _res: 1 }, { periodoIdx: 3 }]) {
        assert.equal(f.situacao(linha(1, 'X', 0, extra)), null, JSON.stringify(extra));
    }
    assert.equal(f.cel(linha(1, 'X', 3)), '—');
});

test('cor só nas saídas; o meio sem cor; próximas com data e fatura', () => {
    const saida = linha(1, 'Aluguel', 0), entrada = linha(2, 'Salário', 0, { v: 100, valor: 100 }), avulsa = linha(5, 'Presente', 0);
    const f = carrega([saida, linha(3, 'Aluguel', 1), linha(4, 'Aluguel', 2), linha(6, 'Aluguel', 3), entrada,
        linha(7, 'Salário', 1), linha(8, 'Salário', 2), linha(9, 'Salário', 3), avulsa]);
    assert.match(f.cel(saida), /class="togSeguintes vm"[^>]*>Repete</);
    assert.match(f.cel(entrada), /class="togSeguintes"[^>]*>Repete</);
    assert.match(f.cel(avulsa), /class="togSeguintes vd"[^>]*>Some</);
    const p1 = linha(20, 'Renegociação Nu', 0, { cred: true, data: '2026-07-05', fatura: '2026-08-12' });
    const h = carrega([p1, linha(21, 'Renegociação Nu', 1, { cred: true, data: '2026-08-05', fatura: '2026-08-12' }),
        linha(22, 'Renegociação Nu', null, { cred: true, data: '2026-09-05', fatura: null })]);
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

test('Renegociação (série que acaba na fatura de Nov): a de Ago diz 2 de 3 (até Out/26)', () => {
    // Hoje 28/10 (ciclo Out). Compras dia 05, fatura dia 12 do mês seguinte (ciclo da fatura =
    // o seguinte ao da compra): 05/08 → 1 (Ago na tela), 05/09 → 2, 05/10 → 3, e acabou.
    const ago = linha(1, 'Renegociação Nu', 2, { cred: true, data: '2026-08-05', fatura: '2026-09-12' });
    const set = linha(2, 'Renegociação Nu', 3, { cred: true, data: '2026-09-05', fatura: '2026-10-12' });
    const out = linha(3, 'Renegociação Nu', 4, { cred: true, data: '2026-10-05', fatura: '2026-11-12' });
    const f = carrega([linha(0, 'Renegociação Nu', 1, { cred: true, data: '2026-07-05', fatura: '2026-08-12' }), ago, set, out], '2026-10-28');
    assert.match(f.cel(ago), />2 de 3 \(até Out\/26\)</);
    assert.equal(f.cel(set), '—');   // só 2 ciclos depois do 3 nos ciclos do teste
    const g = carrega([linha(0, 'Renegociação Nu', 0, { cred: true, data: '2026-06-05', fatura: '2026-07-12' }),
        linha(1, 'Renegociação Nu', 1, { cred: true, data: '2026-07-05', fatura: '2026-08-12' }),
        linha(2, 'Renegociação Nu', 2, { cred: true, data: '2026-08-05', fatura: '2026-09-12' })], '2026-08-20');
    const primeira = { ...linha(0, 'Renegociação Nu', 0, { cred: true, data: '2026-06-05', fatura: '2026-07-12' }) };
    assert.match(g.cel(primeira), />2 de 3 \(até Ago\/26\)</);
    assert.equal(g.detalhe(primeira), 'Jul/26 sim · Ago/26 sim · Set/26 não começou. Próximas: 05/07 fat. 12/08 · 05/08 fat. 12/09');
});

test('regra documentada', () => {
    assert.match(regras, /### Coluna Próx\. 3/);
    assert.match(regras, /Cor só nas saídas: \*\*Repete\*\* em vermelho, \*\*Some\*\* em verde/);
    assert.match(regras, /ignorando o número de parcela no fim do nome/);
    assert.match(regras, /ainda não terminou/);
    assert.match(regras, /sem supor o futuro/);
    assert.match(regras, /Nunca só "2 de 3"/);
    assert.match(regras, /pelo menos \*\*2\*\* deles já terminaram/);
    assert.match(regras, /Exemplo de \*\*Ainda não\*\*/);
});
