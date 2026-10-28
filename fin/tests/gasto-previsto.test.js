// Regressão: do ciclo atual em diante, Besteira e Isabella contam como se o teto do ciclo
// fosse gasto por inteiro — uma compra sintética EM ABERTO no Crédito (Nubank, fatura do
// ciclo seguinte) completa o que falta até 100% e entra na fatura, no saldo e no Futuro. O teto é individual por ciclo, gravado na linha âncora
// do ciclo em fin_ciclo (migrations 25/26). Roda o código real de domain/shared/finance + a regra de
// categorias de charts.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const graficos = ler('js/charts.js');
const visoes = ler('js/cycle-views.js');
const interacoes = ler('js/interactions.js');
const regras = ler('docs/REGRAS.md');
const migration = ler('migrations/23-limites-categoria-por-ciclo.sql');

// Três ciclos: setembro (passado), outubro (atual) e novembro (futuro).
const CICLOS = [
    { id: 'c:1', cicloId: 1, ini: '2026-09-05', fat: '2026-10-04' },
    { id: 'c:2', cicloId: 2, ini: '2026-10-05', fat: '2026-11-04' },
    { id: 'c:3', cicloId: 3, ini: '2026-11-05', fat: '2026-12-04' },
];
function carrega(lancamentos, idxHoje = 1, ciclos = CICLOS) {
    const estado = {
        idxHoje,
        ciclos: ciclos.map(c => ({ ...c })),
        faturas: [],
        lancamentos,
        // fin_ciclo: cada "ciclo" abaixo (ids 1..3) carrega os limite_* da linha da tabela.
        limitesPorCiclo: new Map(lancamentos.filter(l => l.nome === 'Ciclo').map(l => [l.id, { ...l }])),
    };
    const contexto = { Estado: estado, SALDO_DESDE: '2026-01-01', MESES: [], document: { getElementById: () => ({}) }, setTimeout, clearTimeout };
    vm.createContext(contexto);
    ['js/domain.js', 'js/shared.js', 'js/finance.js'].forEach(arquivo => vm.runInContext(ler(arquivo), contexto));
    const inicio = graficos.indexOf('// Base do percentual');
    const fim = graficos.indexOf('function dadosCompromissosCiclo(');
    vm.runInContext(graficos.slice(inicio, fim), contexto);
    vm.runInContext('globalThis.r = { previstasDoCiclo, limitesCategoriaDoCiclo, totalBaseDoCiclo, lancamentosComPrevistas, previstasDosTetos, limparCachesFinanceiros };', contexto);
    return contexto.r;
}

// Linhas de fin_ciclo (marcadas "Ciclo" só pra montar o Map acima; v: 0 não altera conta).
const linhasCiclo = [
    { id: 1, nome: 'Ciclo', data: '2026-09-05', v: 0, periodoIdx: 0 },
    { id: 2, nome: 'Ciclo', data: '2026-10-05', v: 0, periodoIdx: 1 },
    { id: 3, nome: 'Ciclo', data: '2026-11-05', v: 0, periodoIdx: 2 },
];
const resumo = linhas => JSON.parse(JSON.stringify(linhas.map(l => [l.nome, l.categ, l.v, l.data])));

test('ciclo sem lançamento: compras previstas em aberto no Crédito, com o teto inteiro, na fatura Nubank do ciclo seguinte', () => {
    const r = carrega([...linhasCiclo]);
    const [besteira, isabella] = r.previstasDoCiclo(1, [...linhasCiclo]);
    assert.deepEqual(resumo([besteira, isabella]), [
        ['Besteira prevista', 'Besteira', -250, '2026-11-04'],
        ['Isabella prevista', 'Lazer, Isabella', -700, '2026-11-04'],
    ]);
    // Crédito, em aberto (não ocupa limite de Hoje), na prévia: fatura do ciclo 2 (05/11 a 04/12).
    assert.equal(besteira.cred, true);
    assert.equal(besteira.pago, false);
    assert.equal(besteira.fatura, '2026-11-12');
    assert.equal(besteira.periodoIdx, 2);
});

test('fatura cai no 1º dia 12 dentro do ciclo seguinte; último ciclo (sem seguinte) não prevê', () => {
    const r = carrega([...linhasCiclo]);
    // O ciclo 2 é o último aqui: não há ciclo 3 pra fatura cair.
    assert.equal(r.previstasDoCiclo(2, [...linhasCiclo]).length, 0);
    // Ciclo seguinte começando depois do dia 12: a fatura é a do dia 12 do mês seguinte.
    const tardio = carrega([...linhasCiclo], 1, [CICLOS[0], { ...CICLOS[1], fat: '2026-11-19' }, { ...CICLOS[2], ini: '2026-11-20', fat: '2026-12-19' }]);
    assert.equal(tardio.previstasDoCiclo(1, [...linhasCiclo])[0].fatura, '2026-12-12');
});

test('completa só o que falta até 100% (pago ou aberto), e some quando já passou do teto', () => {
    const base = [
        ...linhasCiclo,
        { id: 10, nome: 'Café', categ: 'Besteira', v: -100, pago: true, cred: false, periodoIdx: 1 },
        { id: 11, nome: 'Lanche', categ: 'Besteira', v: -50, pago: false, cred: false, periodoIdx: 1 },
        { id: 12, nome: 'Cinema', categ: 'Lazer, Isabella', v: -800, pago: true, cred: false, periodoIdx: 1 },
        // Isabella sozinha não conta no teto dela (regra existente).
        { id: 13, nome: 'Presente', categ: 'Isabella', v: -300, pago: true, cred: false, periodoIdx: 1 },
    ];
    const r = carrega(base);
    assert.deepEqual(resumo(r.previstasDoCiclo(1, base)), [['Besteira prevista', 'Besteira', -100, '2026-11-04']]);
});

test('crédito conta pela prévia (fatura do ciclo seguinte), como o indicador', () => {
    const base = [
        ...linhasCiclo,
        { id: 20, nome: 'Café', categ: 'Besteira', v: -60, pago: true, cred: true, periodoIdx: 2 },   // fatura de novembro
    ];
    const r = carrega(base);
    assert.equal(r.previstasDoCiclo(1, base)[0].v, -190);   // outubro: 250 − 60 da prévia
});

test('ciclo passado não ganha previsão', () => {
    const r = carrega([...linhasCiclo]);
    assert.equal(r.previstasDoCiclo(0, [...linhasCiclo]).length, 0);
});

test('teto individual por ciclo, salvo em fin_ciclo; vazio volta ao padrão', () => {
    const base = [{ ...linhasCiclo[0] }, { ...linhasCiclo[1], limite_besteira: 400, limite_isabella: '0' }, { ...linhasCiclo[2], limite_besteira: null }];
    const r = carrega(base);
    assert.deepEqual({ ...r.limitesCategoriaDoCiclo(1) }, { besteira: 400, isabella: 0 });
    assert.deepEqual({ ...r.limitesCategoriaDoCiclo(2) }, { besteira: 250, isabella: 700 });
    // Teto zero: nada previsto pra Isabella naquele ciclo.
    assert.deepEqual(resumo(r.previstasDoCiclo(1, base)), [['Besteira prevista', 'Besteira', -400, '2026-11-04']]);
});

test('a base dos cálculos (filtrarLancamentos) inclui as previstas, montada uma vez por desenho', () => {
    const r = carrega([...linhasCiclo]);
    const base = r.lancamentosComPrevistas();
    assert.equal(base.filter(l => l._prev).length, 2);          // ciclo atual (1); o 2 é o último
    assert.equal(r.lancamentosComPrevistas(), base);           // mesma lista até limpar os caches
    r.limparCachesFinanceiros();
    assert.notEqual(r.lancamentosComPrevistas(), base);
    // Pela fatura do ciclo seguinte, o saldo desse ciclo já sente as previstas: 0 − 250 − 700.
    assert.equal(r.totalBaseDoCiclo(2, r.lancamentosComPrevistas(), {}, () => 0), -950);
});

test('tabelas e cálculos usam a mesma base; o indicador ignora a prevista', () => {
    assert.match(ler('js/tables.js'), /const filtrarLancamentos = \(\) => lancamentosComPrevistas\(\);/);
    assert.match(ler('js/finance.js'), /_lancamentosComPrevistas = null;\s*\n\}/);
    assert.doesNotMatch(visoes + graficos, /previstasDoCiclo\(/);
    assert.match(ler('js/domain.js'), /const PREFIXO_LINHA_SINTETICA = \/\^\(fat\|cp\|sal\|res\|sug\|abt\|prev\):\/;/);
});

test('teto editável no título do ciclo atual e seguintes; grava em fin_ciclo, vazio = padrão', () => {
    assert.match(visoes, /data-limite-categoria="\$\{limite\.chave\}" data-ciclo="\$\{i\}"/);
    assert.match(visoes, /const tetoDoIndicador = limite => \{\s*\n\s*const texto = limite\.teto\.toLocaleString/);
    assert.match(visoes, /const limitesCategoria = i >= 0 \? \[/);
    assert.match(interacoes, /if \(input\.dataset\.limiteCategoria\) return input\.dataset\.limiteCategoria === 'isabella' \? 'limite_isabella' : 'limite_besteira';/);
    assert.match(interacoes, /const valor = texto \? Math\.round\(numeroDoLimiteDigitado\(texto\) \* 100\) \/ 100 : null;/);
    assert.match(interacoes, /const gravada = !Estado\.simulando \? await salvarLimiteDoCiclo\(cicloId, campo, valor\) : null;/);
    assert.match(interacoes, /Estado\.limitesPorCiclo\.set\(cicloId, gravada \|\| \{ \.\.\.salvos, \[campo\]: valor \}\);/);
    assert.match(interacoes, /if \(input\) confirmarLimiteDoCiclo\(input\);/);
});

test('migration 23 só adiciona colunas nulas e não negativas na própria fin', () => {
    assert.match(migration, /add column if not exists limite_besteira numeric\(12, 2\);/);
    assert.match(migration, /add column if not exists limite_isabella numeric\(12, 2\);/);
    assert.match(migration, /check \(limite_besteira is null or limite_besteira >= 0\)/);
    assert.match(migration, /check \(limite_isabella is null or limite_isabella >= 0\)/);
    assert.doesNotMatch(migration, /^\s*(create table|create policy|grant)\b/im);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /Do ciclo atual em diante, Besteira e Isabella contam como se o teto do ciclo fosse gasto por inteiro/);
    assert.match(regras, /cada ciclo ganha compras sintéticas \*\*no Crédito, em aberto\*\*/);
    assert.match(regras, /por estarem em aberto, nunca ocupam o limite de \*\*Hoje\*\*/);
    assert.match(regras, /`migrations\/23-limites-categoria-por-ciclo\.sql`/);
});

test('previstas e faturas: Mensal, Aberto, Comprometido e Pra sempre só na exibição, somente leitura, ids distintos', () => {
    const r = carrega([...linhasCiclo]);
    const [besteira, isabella] = r.previstasDoCiclo(1, [...linhasCiclo]);
    assert.deepEqual([besteira.freq, besteira.pago, besteira.comprometido, besteira.pra_sempre, besteira.id, isabella.id, isabella.pra_sempre],
        ['Mensal', false, true, true, -6, -7, true]);
    assert.match(visoes, /freq: 'Mensal', pago: false, comprometido: true, pra_sempre: true,\s*\n\s*id: f\.cartao === CARTAO_NUBANK \? -3 : -4,/);
    // Nenhum cálculo lê pra_sempre: só a coluna e o filtro por clique dela.
    for (const arquivo of ['js/finance.js', 'js/charts.js', 'js/shared.js', 'js/cycle-views.js']) {
        assert.doesNotMatch(ler(arquivo).replace(/pra_sempre: true,/g, ''), /\.pra_sempre|\[['"]pra_sempre['"]\]/, arquivo);
    }
    // Pago clicável só em lançamento real; linha calculada mostra texto.
    assert.match(ler('js/tables.js'), /\(!ehLinhaReal\(r\) \? `<span class="\$\{r\[chave\] \? 'vd' : 'vm'\}">/);
    // Marcado em linha só leitura fica na mesma cor das linhas reais.
    assert.match(ler('js/tables.js'), /: \(marcado \? `<span class=\$\{COR_FLAG\[chave\]\}>\$\{texto\}<\/span>` : texto\);/);
    // O indicador Comprometido continua lendo só lançamentos reais.
    // Comprometido: lançamentos reais e as linhas do plano das metas — nunca as previstas de Besteira/Isabella.
    assert.match(graficos, /const linhas = \[\.\.\.Estado\.lancamentos, \.\.\.linhasDasMetas\(\)\]\s*\n\s*\.filter\(r => r\.periodoIdx == idxPeriodo\)/);
    assert.match(regras, /Mostram Frequência \*\*Mensal\*\*, Pago \*\*Aberto\*\*, \*\*Comprometido\*\* e \*\*Pra sempre\*\*/);
});

test('indicadores Gastos e Liberdade contam as previstas como compras de verdade (sem as metas)', () => {
    const r = carrega([...linhasCiclo]);
    assert.equal(r.previstasDosTetos().map(l => l._sid).join(), 'prev:besteira:1,prev:isabella:1');
    assert.match(graficos, /const comPrevistas = \[\.\.\.Estado\.lancamentos, \.\.\.previstasDosTetos\(\)\];/);
    assert.match(graficos, /dadosProporcaoReservaDoCiclo\(\s*comPrevistas\s*\.filter/);
    assert.match(graficos, /dadosLiberdadeFinanceira\(\s*comPrevistas\.map/);
    assert.match(regras, /contam como gasto nos indicadores \*\*Gastos\*\* e \*\*Liberdade\*\*/);
});
