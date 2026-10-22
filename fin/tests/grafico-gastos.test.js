// Pizza de gastos: agrupa despesas reais e evita contar transferência de fatura duas vezes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/charts.js', 'utf8');
const dominio = fs.readFileSync('js/domain.js', 'utf8');
const regrasMd = fs.readFileSync('docs/REGRAS.md', 'utf8');
const inicio = fonte.indexOf('const PERCENTUAL_MINIMO_PIZZA');
const fim = fonte.indexOf('\n// clique numa celula', inicio);
if (inicio < 0 || fim < 0) throw Error('Não encontrou os dados da pizza de gastos.');

function dadosDoGrafico(lancamentos) {
    const contexto = {
        Estado: { ciclos: [{ fat: '2026-10-12' }], lancamentos },
        ehTransferenciaFatura: r => !r.cred && /antecipação de fatura/i.test(`${r.nome || ''} ${r.categ || ''}`),
        ajusteDoCiclo: () => null,
        previstasDoCiclo: () => [],
        textoOuTraco: valor => String(valor || '-'),
        categoriasSeparadas: valor => String(valor || '').split(',').map(c => c.trim()).filter(Boolean),
        ehCategoria: (categoria, procurada) => String(categoria).trim().toLowerCase() === String(procurada).toLowerCase(),
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(inicio, fim)}\nglobalThis.regras = { dadosDoGraficoCiclo, categoriasMinimasDaPizza, ordenarCategoriasDoGrafico, proximaExclusaoDasCategorias, agruparGastosDaPizza };`, contexto);
    return contexto.regras;
}

test('pizza oculta Reserva e mantém a outra categoria sem duplicação', () => {
    const regras = dadosDoGrafico([
        { periodoIdx: 0, cred: false, nome: 'Mercado', categ: 'Casa', reserva: true, v: -100 },
        { periodoIdx: 0, cred: false, nome: 'Antecipação de Fatura', categ: 'Fatura', v: -200 },
        { periodoIdx: 0, cred: true, nome: 'Compra cartão', categ: 'Eletrônicos', v: -300 },
    ]);

    const dados = regras.dadosDoGraficoCiclo(0);
    assert.deepEqual(Array.from(dados.categorias), ['Casa']);
    assert.deepEqual(Array.from(dados.categoriasCompartilhadas), []);
    assert.deepEqual(Array.from(dados.gastos, gasto => ({ categorias: Array.from(gasto.categorias), valor: gasto.valor })), [
        { categorias: ['Casa'], valor: 100 },
    ]);
});

test('lançamento só-Reserva (bit, sem nenhuma outra categoria) não cria fatia nenhuma', () => {
    const regras = dadosDoGrafico([
        { periodoIdx: 0, cred: false, nome: 'Evolução Obra', categ: '', reserva: true, v: -100 },
        { periodoIdx: 0, cred: false, nome: 'Mercado', categ: 'Casa', v: -50 },
    ]);
    const dados = regras.dadosDoGraficoCiclo(0);
    assert.deepEqual(Array.from(dados.categorias), ['Casa']);
    assert.deepEqual(Array.from(dados.gastos, gasto => gasto.categorias[0]), ['Casa']);
});

test('pizza mantém somente categorias de ao menos dois por cento do recorte', () => {
    const regras = dadosDoGrafico([]);
    const resultado = regras.categoriasMinimasDaPizza({ Casa: 96, Pequena: 1.99, Reserva: 2.01 });
    assert.equal(resultado.total, 100);
    assert.deepEqual(Array.from(resultado.categorias), ['Casa', 'Reserva']);
});

test('seletor prioriza categorias compartilhadas antes das simples', () => {
    const regras = dadosDoGrafico([]);
    assert.deepEqual(Array.from(regras.ordenarCategoriasDoGrafico(
        ['Transporte', 'Casa', 'Reserva', 'Lazer'], new Set(['Reserva', 'Casa'])
    )), ['Casa', 'Reserva', 'Lazer', 'Transporte']);
});

test('comando do seletor alterna entre incluir e excluir todas as categorias do ciclo', () => {
    const regras = dadosDoGrafico([]);
    assert.deepEqual(Array.from(regras.proximaExclusaoDasCategorias(['Casa', 'Lazer'], [])), ['Casa', 'Lazer']);
    assert.deepEqual(Array.from(regras.proximaExclusaoDasCategorias(['Casa', 'Lazer'], ['Casa', 'Outra'])), ['Outra']);
    assert.match(fonte, /id=excluirCatTudo/);
});

test('clique fora do seletor no modal fecha o dropdown antes do gráfico tratar o gesto', () => {
    assert.match(fonte, /modalGrafico'\)\.addEventListener\('pointerdown'/);
    assert.match(fonte, /!e\.target\.closest\('#excluirCatWrap'\)/);
});

test('Contabilidade (CATEGORIA_EXCLUIDA_GRAFICO_PADRAO) é intrínseca ao faturamento, fixa em código', () => {
    assert.match(dominio, /const CATEGORIA_EXCLUIDA_GRAFICO_PADRAO = 'Contabilidade';/);
});

test('o modal Gráfico abre toda vez com Contabilidade excluída por padrão, mostrando o líquido', () => {
    assert.match(fonte, /excluidasDoGrafico = \[CATEGORIA_EXCLUIDA_GRAFICO_PADRAO\];/);
    // O botão Atual (que limpa os filtros) também repõe esse mesmo padrão, não a lista vazia de antes.
    assert.match(fonte, /excluidasDoGrafico = \[CATEGORIA_EXCLUIDA_GRAFICO_PADRAO\];\s*\/\/ volta ao padrão: só Contabilidade fora/);
    assert.doesNotMatch(fonte, /excluidasDoGrafico = \[\];/);
});

test('categoria continua reincluível no seletor: só o estado INICIAL muda, não a lista de categorias disponíveis', () => {
    assert.match(fonte, /const { periodo, renda, categorias, categoriasCompartilhadas } = dadosDoGraficoCiclo\(idxPeriodo\);/);
    assert.match(fonte, /montaExcluirCatDrop\(todasCategorias, categoriasCompartilhadas\);/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regrasMd, /`Contabilidade` \(`CATEGORIA_EXCLUIDA_GRAFICO_PADRAO` em `js\/domain\.js`\) já abre desmarcada por padrão/);
    assert.match(regrasMd, /é custo intrínseco ao próprio faturamento PJ, não um gasto discricionário, então a pizza mostra direto o líquido/);
    assert.match(regrasMd, /Fechar e abrir o modal restaura esse padrão \(só `Contabilidade` fora, as demais categorias de volta\)/);
});

test('fatia mantém as linhas reais para abrir seu detalhamento no recorte atual', () => {
    const regras = dadosDoGrafico([]);
    const linha = { id: 12, nome: 'Mercado', v: -100 };
    const agrupado = regras.agruparGastosDaPizza([{ categorias: ['Casa'], valor: 100, linha }], []);
    assert.deepEqual({ ...agrupado.porCategoria }, { Casa: 100 });
    assert.deepEqual(Array.from(agrupado.linhasPorCategoria.Casa), [linha]);
    assert.match(fonte, /onClick: \(_evento, elementos\)/);
    assert.match(fonte, /abrirDetalheFatiaGrafico/);
});
