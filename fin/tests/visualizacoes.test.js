// Regressão das Visualizações fixas e de suas correspondências por nome/categoria.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const graficos = fs.readFileSync('js/charts.js', 'utf8');
const inicio = graficos.indexOf('const NOMES_DAS_VISUALIZACOES =');
// Inclui popularAlvosVisualizacao na extra\u00e7\u00e3o (termina antes da auto-chamada dela, que
// precisaria de um DOM de verdade pra rodar sem mock nenhum).
const fim = graficos.indexOf('\n// A escolha abre o acompanhamento diretamente', inicio);
const codigo = graficos.slice(inicio, fim);

// Mock mínimo de #visMenu (só innerHTML), o suficiente pra popularAlvosVisualizacao rodar
// sem precisar de jsdom.
function criarVisualizacoes(lancamentos) {
    const visMenuMock = { innerHTML: '' };
    const contexto = {
        Estado: { lancamentos },
        semAcento: valor => String(valor ?? '').normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').toLowerCase(),
        escapeHtml: valor => String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
        el: id => { if (id !== 'visMenu') throw Error(`mock só conhece #visMenu, pediu #${id}`); return visMenuMock; },
    };
    vm.runInNewContext(`${codigo}; this.testadas = { OPCOES_VISUALIZACOES, dadosVisualizacao, opcaoDaVisualizacao, popularAlvosVisualizacao };`, contexto);
    return { ...contexto.testadas, visMenuMock };
}

test('a lista fixa de acompanhamentos (roster) continua na ordem de definição', () => {
    const { OPCOES_VISUALIZACOES } = criarVisualizacoes([]);
    assert.deepEqual(Array.from(OPCOES_VISUALIZACOES, opcao => opcao.rotulo), [
        'Roberta',
        'Entrada Econ',
        'Evolução Obra', 'Financiamento Casa', 'Trybe', 'Senac',
        'Seguro Residencial', 'Iphone', 'Pós',
        'Banco do Brasil',
    ]);
});

test('popularAlvosVisualizacao reordena o dropdown do mais próximo de acabar pro mais longe', () => {
    const { popularAlvosVisualizacao, opcaoDaVisualizacao, visMenuMock } = criarVisualizacoes([
        // Trybe: 100% pago (acabou) — deve vir primeiro.
        { nome: 'Trybe', categ: 'Dívida', pago: true, v: -100 },
        // Iphone: 50% pago — no meio.
        { nome: 'Iphone', categ: 'Isabella', pago: true, v: -50 },
        { nome: 'Iphone', categ: 'Isabella', pago: false, v: -50 },
        // Senac: 0% pago (nada pago ainda) — deve vir por último entre os com lançamento.
        { nome: 'Senac', categ: 'Isabella', pago: false, v: -200 },
    ]);
    popularAlvosVisualizacao();
    const idsRenderizados = [...visMenuMock.innerHTML.matchAll(/data-vis="([^"]+)"/g)].map(m => m[1]);
    assert.match(visMenuMock.innerHTML, /^<button type=button role=menuitem data-vis="/);
    const idPorNome = nome => idsRenderizados.find(id => opcaoDaVisualizacao(id)?.nome === nome);
    const posicao = id => idsRenderizados.indexOf(id);
    assert.ok(posicao(idPorNome('Trybe')) < posicao(idPorNome('Iphone')), 'Trybe (100%) antes de Iphone (50%)');
    assert.ok(posicao(idPorNome('Iphone')) < posicao(idPorNome('Senac')), 'Iphone (50%) antes de Senac (0%)');
});

test('Roberta corresponde a categoria contendo o texto e nunca a entrada positiva', () => {
    const { dadosVisualizacao } = criarVisualizacoes([
        { nome: 'Aluguel', categ: 'Casa, Roberta', pago: true, v: -100 },
        { nome: 'Fatura', categ: 'Roberta', pago: false, v: -50 },
        { nome: 'Receita', categ: 'Roberta', pago: true, v: 500 },
        { nome: 'Outra', categ: 'Casa', pago: false, v: -80 },
    ]);
    const dados = dadosVisualizacao('categoria-roberta');
    assert.deepEqual(Array.from(dados.linhas, linha => linha.nome), ['Aluguel', 'Fatura']);
    assert.equal(dados.pago, 100);
    assert.equal(dados.naoPago, 50);
});

test('nomes são exatos sem diferenciar caixa ou acento', () => {
    const { OPCOES_VISUALIZACOES, dadosVisualizacao } = criarVisualizacoes([
        { nome: 'EVOLUÇÃO OBRA', categ: 'Casa', pago: false, v: -200 },
        { nome: 'Evolução Obra Extra', categ: 'Casa', pago: false, v: -300 },
    ]);
    const id = OPCOES_VISUALIZACOES.find(opcao => opcao.rotulo == 'Evolução Obra').id;
    assert.deepEqual(Array.from(dadosVisualizacao(id).linhas, linha => linha.v), [-200]);
});
