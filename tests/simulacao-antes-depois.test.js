// Simulação mostra "antes → depois": retrato dos dados reais ao ligar, o mesmo cálculo com
// ele (sem estragar o estado do desenho) e a data em que a Reserva completa a meta.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const api = fs.readFileSync('js/supabase-api.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const trecho = (fonte, assinatura) => {
    const inicio = fonte.indexOf(assinatura);
    return fonte.slice(inicio, fonte.indexOf('\n}\n', inicio) + 3);
};

test('retrato ao ligar copia linha a linha (a simulação edita os objetos no lugar)', () => {
    const linha = { id: 1, v: -10 };
    const ctx = { Estado: { lancamentos: [linha], limitesPorCiclo: new Map([[5, { teto_besteira: 100 }]]) } };
    vm.runInNewContext(`${trecho(formulario, 'function guardarRetratoAntesDaSimulacao() {')}\nguardarRetratoAntesDaSimulacao();`, ctx);
    const retrato = ctx.Estado.retratoAntesDaSimulacao;
    linha.v = -999;
    ctx.Estado.limitesPorCiclo.get(5).teto_besteira = 0;
    assert.equal(retrato.lancamentos[0].v, -10);
    assert.equal(retrato.limitesPorCiclo.get(5).teto_besteira, 100);
    // Liga → retrato; desliga (recarga ok) → descarta; recarregar no meio → novo retrato.
    assert.match(formulario, /Estado\.simulando = true;\s*\n\s*guardarRetratoAntesDaSimulacao\(\);/);
    assert.match(formulario, /Estado\.simulando = false;\s*\n\s*Estado\.retratoAntesDaSimulacao = null;/);
    assert.match(api, /if \(Estado\.simulando\) guardarRetratoAntesDaSimulacao\(\);/);
});

test('cálculo com os dados reais devolve o resultado e restaura o estado do desenho', () => {
    const simulados = [{ id: 1 }, { id: -1, _sim: true }];
    const reais = [{ id: 1 }];
    let limpezas = 0;
    const Estado = {
        lancamentos: simulados, limitesPorCiclo: 'simulado', cartoesDoCiclo: 'simulado', fechados: { db: false },
        cicloQuitadoRecolhido: null, valorFaturaPorCiclo: { a: 1 }, linhasVisiveis: { db: [] },
        retratoAntesDaSimulacao: { lancamentos: reais, limitesPorCiclo: 'real' },
    };
    const ctx = { Estado, limparCachesFinanceiros: () => { limpezas++; } };
    vm.runInNewContext(`${trecho(interacoes, 'function comDadosAntesDaSimulacao(fn) {')}
        globalThis.r = comDadosAntesDaSimulacao(() => {
            const visto = [Estado.lancamentos.length, Estado.limitesPorCiclo];
            Estado.cartoesDoCiclo = 'real'; Estado.fechados.db = true; Estado.cicloQuitadoRecolhido = '3:db';
            Estado.valorFaturaPorCiclo.a = 2; Estado.linhasVisiveis.db = ['x'];
            return visto;
        });`, ctx);
    // Objetos criados dentro do vm têm outro protótipo: compara pelo conteúdo.
    const json = v => JSON.parse(JSON.stringify(v));
    assert.deepEqual(json(ctx.r), [1, 'real']);
    assert.equal(Estado.lancamentos, simulados);
    assert.equal(Estado.limitesPorCiclo, 'simulado');
    assert.equal(Estado.cartoesDoCiclo, 'simulado');
    assert.deepEqual(json(Estado.fechados), { db: false });
    assert.equal(Estado.cicloQuitadoRecolhido, null);
    assert.deepEqual(json(Estado.valorFaturaPorCiclo), { a: 1 });
    assert.deepEqual(json(Estado.linhasVisiveis), { db: [] });
    assert.equal(limpezas, 2);   // antes (pra calcular com os reais) e depois (pro desenho seguir simulado)
});

test('desenho: calcula o antes primeiro, marca depois de encaixar os indicadores', () => {
    const corpo = interacoes.slice(interacoes.indexOf('function desenhar() {'));
    const antes = corpo.indexOf('const antesDaSimulacao = Estado.simulando && Estado.retratoAntesDaSimulacao && !simples');
    const real = corpo.indexOf("if (temCicloParaIndicadores) atualizarIndicadoresFinanceiros(+el('compAte').value);\n\n");
    const marca = corpo.indexOf('if (antesDaSimulacao) marcarAntesDaSimulacao(antesDaSimulacao);');
    const encaixe = corpo.indexOf('encaixarIndicadoresNoDebito(temCicloParaIndicadores && modoBlocos);');
    const alinha = corpo.indexOf('alinharResumosDosTitulos();');
    assert.ok(antes > 0 && antes < real && encaixe < marca && marca < alinha);
    assert.match(interacoes, /`<span class=valorAntes title="Sem a simulação">\$\{escapeHtml\(textos\[i\]\)\} →<\/span> `/);
    assert.match(estilos, /\.valorAntes \{\s*\n\s*color: var\(--mu\);\s*\n\s*font-weight: 400;/);
});

test('Reserva: primeiro ciclo seguinte em que o guardado projetado alcança a meta', () => {
    // [guardado projetado, meta calculada naquele ciclo]: só a meta do ciclo de partida vale.
    const projecao = { 3: [100, 1000], 4: [400, 0], 5: [990, 5000], 6: [1000, 1100], 7: [2000, 1000] };
    const roda = (idx, tabela = projecao) => {
        const ctx = {
            TOLERANCIA_FINANCEIRA: 0.005, Estado: { ciclos: Array(8).fill({}) },
            dadosMetaReservaEmergenciaCiclo: i => ({ guardado: tabela[i][0], meta: tabela[i][1] }),
            guardadoAte: i => tabela[i][0],
        };
        vm.runInNewContext(`${trecho(graficos, 'function cicloEmQueReservaCompleta(idxPeriodo) {')}\nglobalThis.r = cicloEmQueReservaCompleta(${idx});`, ctx);
        return ctx.r;
    };
    assert.equal(roda(3), 6);            // alvo 1000 (o de hoje): 990 no 5 não chega; 1000 no 6 chega
    assert.equal(roda(7), null);         // já completa: sem data
    assert.equal(roda(3, { 3: [0, 1000], 4: [0, 1000], 5: [0, 1000], 6: [0, 1000], 7: [0, 1000] }), null);   // não fecha
    assert.equal(roda(3, { 3: [0, 0] }), null);   // sem meta
    assert.match(graficos, / <span class=limiteRotulo>·<\/span> <b>\$\{nomePeriodoAbrev\(Estado\.ciclos\[idxCompleta\]\)\}<\/b>/);
    assert.match(graficos, / <span class=limiteRotulo>· depois de<\/span> <b>\$\{nomePeriodoAbrev\(ultimoCiclo\)\}<\/b>/);
});

test('REGRAS.md documenta antes → depois, data da Reserva e parcelas no Comprometido', () => {
    assert.match(regras, /\*\*Antes → depois:\*\* ao ligar a simulação, o app guarda um retrato dos dados reais/);
    assert.match(regras, /`Comprometido 71,6% → 83,2% do mês`/);
    assert.match(regras, /Com a meta incompleta, depois do percentual vem o ciclo em que ela completa no ritmo projetado/);
    assert.match(regras, /alcança a meta de hoje, fixa/);
    assert.match(regras, /Parcela de compra parcelada no Crédito \(lote do cadastro com `recorrencia_id`, sem Frequência\) entra mesmo sem a marca/);
});
