// Clique no nome Besteira/Isabella do título do Débito filtra Débito e Crédito do ciclo pelo
// que conta naquele teto — mesma regra do indicador (contaNoTeto), sem as previstas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Roda o filtro real (tables.js) com a regra real (charts.js: contaNoTeto e ehGastoIsabella).
function carregaFiltro() {
    const semAcento = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const categoriasSeparadas = v => String(v ?? '').split(',').map(c => c.trim()).filter(Boolean);
    const contexto = {
        Estado: { filtroTeto: null },
        CATEGORIA_BESTEIRA: 'Besteira',
        semAcento, categoriasSeparadas,
        ehCategoria: (categ, procurada) => categoriasSeparadas(categ).some(c => semAcento(c) === semAcento(procurada).trim()),
        ehTransferenciaFatura: r => !r.cred && /antecipa/i.test(r.categ || ''),
    };
    vm.createContext(contexto);
    const trecho = (fonte, de, ate) => fonte.slice(fonte.indexOf(de), fonte.indexOf(ate, fonte.indexOf(de)));
    vm.runInContext([
        trecho(graficos, 'const ehGastoIsabella', '\n// Regra única pros indicadores'),
        trecho(graficos, 'function contaNoTeto(', 'function dadosLimiteCategoriaDoCiclo('),
        trecho(graficos, 'function dadosLimiteCategoriaDoCiclo(', '\n// Cor do indicador'),
        trecho(tabelas, 'const criterioDoTeto', '// renderiza uma tabela completa'),
        'globalThis.r = { passaFiltroTeto, dadosLimiteCategoriaDoCiclo, criterioDoTeto };',
    ].join('\n'), contexto);
    return contexto;
}

const linhas = [
    { id: 1, categ: 'Besteira', v: -20, pago: true },
    { id: 2, categ: 'Lazer, Besteira', v: -30, pago: false, cred: true },
    { id: 3, categ: 'Besteira Isabella', v: -40, pago: true },          // categoria antiga: não conta
    { id: 4, categ: 'Besteira', v: 15, pago: true },                    // entrada: não é gasto
    { id: 5, categ: 'Lazer, Isabella', v: -80, pago: true },
    { id: 6, categ: 'Isabella', v: -50, pago: true, comprometido: true }, // Comprometido: fora do teto Isabella
    { id: 7, nome: 'Fatura Nu', categ: 'Isabella, Fatura', v: -500, pago: true },
    { id: -6, categ: 'Besteira', v: -200, _prev: 1, cred: true },        // prevista: o indicador ignora
    { id: 8, categ: 'Casa', v: -900, pago: true },
    { id: -3, nome: 'Fatura Nubank', categ: 'Fatura', v: -300, _fat: 1 },
];

test('sem filtro, nada muda; com filtro, Débito e Crédito mostram só o que conta no teto', () => {
    const c = carregaFiltro();
    assert.equal(linhas.filter(l => c.r.passaFiltroTeto(l, 'db')).length, linhas.length);
    c.Estado.filtroTeto = 'besteira';
    assert.deepEqual(linhas.filter(l => c.r.passaFiltroTeto(l, 'db')).map(l => l.id), [1, 2]);
    assert.deepEqual(linhas.filter(l => c.r.passaFiltroTeto(l, 'cr')).map(l => l.id), [1, 2]);
    c.Estado.filtroTeto = 'isabella';
    assert.deepEqual(linhas.filter(l => c.r.passaFiltroTeto(l, 'db')).map(l => l.id), [5]);
});

test('outras tabelas (Backlog, Comparar) não obedecem ao filtro de teto', () => {
    const c = carregaFiltro();
    c.Estado.filtroTeto = 'besteira';
    assert.equal(linhas.filter(l => c.r.passaFiltroTeto(l, 'bk')).length, linhas.length);
});

test('a soma das linhas filtradas é o valor do indicador (pago + aberto)', () => {
    const c = carregaFiltro();
    for (const chave of ['besteira', 'isabella']) {
        c.Estado.filtroTeto = chave;
        const reais = linhas.filter(l => !l._prev);
        const soma = linhas.filter(l => c.r.passaFiltroTeto(l, 'db')).reduce((s, l) => s - l.v, 0);
        assert.equal(soma, c.r.dadosLimiteCategoriaDoCiclo(reais, c.r.criterioDoTeto(chave), 100).valorTotal, chave);
    }
});

test('o filtro entra junto com a busca por coluna na renderização da tabela', () => {
    assert.match(tabelas, /linhasBrutas\.filter\(r => passaFiltroTexto\(r, idTabela\) && passaFiltroTeto\(r, idTabela\)\)/);
});

test('clique no nome liga, desliga ou troca o teto e reabre os blocos; Recarregar limpa', () => {
    const inicio = interacoes.indexOf("const botao = e.target.closest('[data-filtro-teto]');");
    assert.ok(inicio >= 0);
    const trecho = interacoes.slice(inicio, interacoes.indexOf('\n});', inicio));
    assert.match(trecho, /e\.stopImmediatePropagation\(\);/);
    assert.match(trecho, /Estado\.filtroTeto = Estado\.filtroTeto === chave \? null : chave;/);
    assert.match(trecho, /if \(Estado\.filtroTeto\) \{ delete Estado\.fechados\.db; delete Estado\.fechados\.cr; \}/);
    assert.doesNotMatch(trecho, /atualizarLancamento|inserirLancamento|excluirLancamento/);
    assert.match(graficos, /Estado\.filtroTeto = null;/);
    assert.match(fs.readFileSync('js/app-state.js', 'utf8'), /filtroTeto: null,/);
});

test('nome ligado fica verde, como os outros controles ativos', () => {
    assert.match(estilos, /\.filtroTeto\.ativo \{\s*\n\s*color: var\(--vd\);\s*\n\s*background: var\(--green-soft\);\s*\n\s*border-color: var\(--vd\);/);
});

test('REGRAS.md documenta o toggle', () => {
    assert.match(regras, /\*\*Clicar no nome\*\* é um toggle de filtro: as tabelas Débito e Crédito do ciclo exibido passam a mostrar só o que conta naquele teto/);
    assert.match(regras, /limpa os filtros — buscas por coluna, filtro de teto \(Besteira\/Isabella\), Linhas/);
});
