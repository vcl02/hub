// Regressão: coluna "prio" (prioridade de elevação do Backlog), preenchida na mão pelo
// usuário — 1 = mais provável, quanto maior menos chance (ex.: 999). O Backlog ordena por
// ela por padrão; sem valor preenchido conta como a MENOR prioridade (vai pro fim), nunca
// como zero. Edita direto na célula, igual Nome/Categoria/Frequência.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const estado = fs.readFileSync('js/app-state.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const migracao = fs.readFileSync('migrations/18-prioridade-elevacao-backlog.sql', 'utf8');

test('coluna prio existe em COLS, numérica', () => {
    assert.match(estado, /\['prio', 'Prio', 'n'\]/);
});

test('Backlog ("bk") ordena por prio por padrão; as demais tabelas continuam por data', () => {
    assert.match(estado, /const estadoOrdenacao = id => Estado\.ordenacaoPorTabela\[id\] \|\| \(Estado\.ordenacaoPorTabela\[id\] = \{ k: id === 'bk' \? 'prio' : 'data', d: 1 \}\);/);
});

// Extrai COLS/colunasAtivas do arquivo real e roda num contexto isolado.
function carregaColunasAtivas() {
    const inicio = estado.indexOf('const COLS = [');
    const fim = estado.indexOf('\nconst isMobile');
    if (inicio < 0 || fim < 0) throw Error('Não encontrou COLS/colunasAtivas em app-state.js.');
    const contexto = { Estado: { temPraSempre: true } };
    vm.createContext(contexto);
    vm.runInContext(`${estado.slice(inicio, fim)}\nglobalThis.colunasAtivas = colunasAtivas;`, contexto);
    return contexto.colunasAtivas;
}

test('Prio é a PRIMEIRA coluna no Backlog, mas nem aparece em Débito/Crédito', () => {
    const colunasAtivas = carregaColunasAtivas();
    const colsBacklog = colunasAtivas('bk').map(([chave]) => chave);
    assert.equal(colsBacklog[0], 'prio');
    assert.ok(colsBacklog.includes('data') && colsBacklog.includes('nome'));   // nada se perde, só reordena

    const colsDebito = colunasAtivas('db').map(([chave]) => chave);
    const colsCredito = colunasAtivas('cr').map(([chave]) => chave);
    assert.ok(!colsDebito.includes('prio'));
    assert.ok(!colsCredito.includes('prio'));
});

// Extrai ordenarLinhas do arquivo real e roda num contexto isolado, com estadoOrdenacao/COLS
// e timestamp simulados.
function criaOrdenarLinhas(colunaOrdenada) {
    const inicio = tabelas.indexOf('function ordenarLinhas(');
    const fim = tabelas.indexOf('\n}', inicio) + 2;
    if (inicio < 0) throw Error('Não encontrou ordenarLinhas em tables.js.');
    const contexto = {
        estadoOrdenacao: () => ({ k: colunaOrdenada, d: 1 }),
        COLS: [['prio', 'Prio', 'n'], ['data', 'Data', 'd'], ['nome', 'Nome', 't']],
        timestamp: s => Date.parse(s) || 0,
    };
    vm.createContext(contexto);
    vm.runInContext(`${tabelas.slice(inicio, fim)}\nglobalThis.ordenarLinhas = ordenarLinhas;`, contexto);
    return contexto.ordenarLinhas;
}

test('ordena por prio crescente, linha sem prio preenchida vai pro FIM (nunca tratada como zero)', () => {
    const ordenarLinhas = criaOrdenarLinhas('prio');
    const linhas = [
        { nome: 'sem prio', prio: null },
        { nome: 'prio 999', prio: 999 },
        { nome: 'prio 1', prio: 1 },
        { nome: 'prio 5', prio: 5 },
    ];
    const ordenadas = Array.from(ordenarLinhas(linhas, 'bk'), r => r.nome);
    assert.deepEqual(ordenadas, ['prio 1', 'prio 5', 'prio 999', 'sem prio']);
});

test('outras tabelas continuam ordenando por data normalmente, ignorando a regra especial de prio', () => {
    const ordenarLinhas = criaOrdenarLinhas('data');
    const linhas = [{ nome: 'b', data: '2026-10-10' }, { nome: 'a', data: '2026-10-01' }];
    const ordenadas = Array.from(ordenarLinhas(linhas, 'db'), r => r.nome);
    assert.deepEqual(ordenadas, ['a', 'b']);
});

test('célula Prio só é clicável pra linha real, igual às demais colunas livres', () => {
    assert.match(tabelas, /const celPrio = r => ehLinhaReal\(r\)\s*\n\s*\? `<span class="togPrio" data-tog-prio=/);
    assert.match(tabelas, /chave == 'prio' \? celPrio\(r\)/);
});

test('clique em Prio abre um <input type=number>, aceita limpar (volta a null) e ignora entrada inválida sem salvar', async () => {
    const { editar } = require('./helpers/editor-inline');
    let r = await editar('data-tog-prio', { prio: 3 }, ' 7.9 ');
    assert.match(r.html, /<input type=number class=inpPrio inputmode=numeric step=1 value="3"/);
    assert.deepEqual(r.gravado, { prio: 7 });   // inteiro: a casa decimal cai
    r = await editar('data-tog-prio', { prio: 3 }, '');
    assert.deepEqual(r.gravado, { prio: null });
    r = await editar('data-tog-prio', { prio: 3 }, 'abc');
    assert.equal(r.gravado, null);
    assert.equal(r.lancamento.prio, 3);
    r = await editar('data-tog-prio', { prio: 5 }, '0');   // zero é prioridade válida, não vira null
    assert.deepEqual(r.gravado, { prio: 0 });
});

test('estilos cobrem .togPrio/.inpPrio reaproveitando o padrão visual das demais colunas livres', () => {
    assert.match(estilos, /\.togData, \.togNome, \.togCateg, \.togFreq, \.togPrio, \.togObs, \.togCanal \{/);
    assert.match(estilos, /\.inpValor, \.inpNome, \.inpCateg, \.inpFreq, \.inpPrio, \.inpObs, \.inpCanal \{/);
});

test('migration versionada adiciona a coluna, não aplicada automaticamente (mantenedor roda manualmente)', () => {
    assert.match(migracao, /^-- /);
    assert.match(migracao, /alter table public\.fin\s*\nadd column prio integer;/);
    assert.match(migracao, /notify pgrst, 'reload schema';/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /`fin\.prio` guarda a prioridade de elevação do Backlog pra um ciclo/);
    assert.match(regras, /1 é o mais provável de entrar num ciclo em breve, quanto maior o número menos a chance/);
    assert.match(regras, /O Backlog ordena por essa coluna por padrão \(menor primeiro\)/);
    assert.match(regras, /Linha sem `prio` preenchida conta como a \*\*menor\*\* prioridade possível/);
});

test('Débito mostra todas as colunas, inclusive ID, Reserva, Comprometido e Pra sempre', () => {
    const colunas = carregaColunasAtivas()('db').map(([chave]) => chave);
    assert.ok(['id', 'reserva', 'comprometido', 'pra_sempre'].every(c => colunas.includes(c)));
});
