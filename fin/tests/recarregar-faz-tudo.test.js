// Botão verde Recarregar (cabeçalho): recarrega, volta ao ciclo atual, limpa os filtros e
// consolida tudo, no lugar dos antigos botões Atual, Limpar filtros e Consolidar tudo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const pagina = fs.readFileSync('index.html', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const inicializacao = fs.readFileSync('js/bootstrap.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

const trechoAte = (fonte, inicio, fim) => {
    const i = fonte.indexOf(inicio);
    assert.ok(i >= 0, `não achou: ${inicio}`);
    return fonte.slice(i, fonte.indexOf(fim, i) + fim.length);
};

// Roda os códigos reais (limparFiltros, voltarAoCicloAtualELimpar e o clique do Recarregar)
// com um DOM mínimo. consolidarTudo é simulado no contrato dele: recarrega e, só se a carga
// der certo, chama depoisDaCarga antes de varrer.
function montaTela(idxHoje, { restrito = false, cargaOk = true } = {}) {
    const elementos = {};
    const etapas = [];
    const ctx = {
        el: id => (elementos[id] ||= { value: 'x', disabled: false, classList: { add() {}, remove() {} } }),
        Estado: {
            idxHoje, filtroTexto: { nome: 'café' }, fechados: { db: true }, selecionados: new Set(['5']),
            ordenacaoPorTabela: { db: { k: 'valor', d: -1 } }, ordComp: { k: 'nome', d: 1 },
        },
        CATEGORIA_EXCLUIDA_GRAFICO_PADRAO: 'Contabilidade',
        excluidasDoGrafico: [],
        etapas,
    };
    ctx.modoRestrito = () => restrito;
    ctx.desenhar = () => etapas.push('desenhar');
    ctx.abrirBlocosFinanceiros = () => { ctx.Estado.fechados.db = false; };
    ctx.load = async () => { etapas.push('recarregar'); return cargaOk; };
    ctx.consolidarTudo = async (botao, depoisDaCarga) => {
        etapas.push(`consolidarTudo(${botao === elementos.recarregar ? 'recarregar' : '?'})`);
        if (!(await ctx.load())) return;
        depoisDaCarga();
        etapas.push('consolidar');
    };
    const limpar = trechoAte(graficos, 'const FILTROS_PADRAO', '\n}\n');
    const voltar = trechoAte(interacoes, 'function voltarAoCicloAtualELimpar() {', '\n}\n');
    const clique = trechoAte(inicializacao, "el('recarregar').onclick = async () => {", '\n};');
    vm.runInNewContext(`${limpar}\n${voltar}\n${clique}\nthis.clica = () => el('recarregar').onclick();\nthis.excluidas = () => excluidasDoGrafico;`, ctx);
    return { ctx, elementos, etapas };
}

test('Recarregar: recarrega, volta ao ciclo atual, limpa os filtros e consolida, nessa ordem', async () => {
    const { ctx, elementos, etapas } = montaTela(3);
    await ctx.clica();
    assert.deepEqual(etapas, ['consolidarTudo(recarregar)', 'recarregar', 'desenhar', 'consolidar']);
    assert.equal(elementos.compDe.value, 3);
    assert.equal(elementos.compAte.value, 3);
    assert.equal(elementos.somenteDif.value, 'N');
    assert.deepEqual(Object.keys(ctx.Estado.filtroTexto), []);
    assert.equal(ctx.Estado.selecionados.size, 0);
    assert.deepEqual(Object.keys(ctx.Estado.ordenacaoPorTabela), []);
    assert.equal(ctx.Estado.ordComp.k, 'total');
    assert.equal(ctx.excluidas().join(), 'Contabilidade');
    assert.equal(ctx.Estado.fechados.db, false);
});

test('carga com falha para tudo: não navega, não limpa nem consolida', async () => {
    const { ctx, etapas, elementos } = montaTela(3, { cargaOk: false });
    await ctx.clica();
    assert.deepEqual(etapas, ['consolidarTudo(recarregar)', 'recarregar']);
    assert.equal(elementos.compDe, undefined);
    assert.deepEqual(Object.keys(ctx.Estado.filtroTexto), ['nome']);
});

test('conta restrita: o botão nem aparece e, se acionado, não faz nada (nunca consolida)', async () => {
    const { ctx, etapas } = montaTela(3, { restrito: true });
    await ctx.clica();
    assert.deepEqual(etapas, []);
});

test('sem ciclo atual: limpa os filtros e deixa De/Até vazios, como a página abre', async () => {
    const { ctx, elementos } = montaTela(-1);
    await ctx.clica();
    assert.equal(elementos.compDe.value, '');
    assert.equal(elementos.compAte.value, '');
    assert.deepEqual(Object.keys(ctx.Estado.filtroTexto), []);
});

test('consolidarTudo chama depoisDaCarga entre a recarga e a varredura', () => {
    const funcao = trechoAte(formulario, 'async function consolidarTudo(botao, depoisDaCarga = () => {}, { silencioso = false } = {}) {', '\n}\n');
    assert.ok(funcao.indexOf('await load({ silencioso })') < funcao.indexOf('depoisDaCarga();'));
    assert.ok(funcao.indexOf('depoisDaCarga();') < funcao.indexOf("etapa('Consolidando…');"));
    assert.ok(funcao.indexOf('depoisDaCarga();') < funcao.indexOf('if (Estado.idxHoje < 0) return;'));
});

test('recarga automática só lê: chama recarregarDados, nunca o clique do botão', () => {
    assert.match(inicializacao, /async function recarregarDados\(\) \{[\s\S]*?await load\(\{ silencioso: true \}\);[\s\S]*?\n\}/);
    assert.match(inicializacao, /if \(Date\.now\(\) - Estado\.ultimaCarga >= INTERVALO_RECARGA_AUTOMATICA_MS\) recarregarDados\(\);/);
    assert.doesNotMatch(inicializacao, /el\('recarregar'\)\.onclick\(\)/);
    assert.match(regras, /a recarga automática de 5 minutos só lê, e a consolidação automática de 15 minutos/);
});

test('o botão verde é o único: sem Atual, Limpar filtros nem Consolidar tudo', () => {
    assert.match(pagina, /<button id=recarregar title="Recarregar, voltar ao ciclo atual, limpar filtros e consolidar tudo"\s*\n\s*aria-label="Recarregar, voltar ao ciclo atual, limpar filtros e consolidar tudo">/);
    assert.doesNotMatch(pagina, /id=cicloHoje|btLimparFiltros|id=flimpar|btConsolidarTudo/);
    assert.doesNotMatch(graficos + interacoes + inicializacao + formulario, /cicloHoje|btLimparFiltros|btConsolidarTudo/);
    assert.doesNotMatch(estilos, /\.btHoje\b/);
    assert.match(regras, /O botão verde \*\*Recarregar\*\* do cabeçalho \(mesmo ícone de setas\) faz, num só clique e nesta ordem: recarrega os dados do banco, volta De\/Até ao ciclo atual, limpa os filtros/);
    assert.match(regras, /Não existem mais botões "Atual", "Limpar filtros" nem "Consolidar tudo" separados\./);
    assert.match(regras, /A conta restrita não tem esse botão\./);
});

test('Todas/Diferentes, Gráfico e Visualizações ficam no bloco de botões, antes da simulação', () => {
    const acoes = pagina.slice(pagina.indexOf('<div class=acoesCabecalho>'), pagina.indexOf('id=toggleSimulacao'));
    assert.ok(acoes.indexOf('id=btSomenteDif') < acoes.indexOf('id=btGrafico'));
    assert.doesNotMatch(pagina.slice(pagina.indexOf('id=navComparar'), pagina.indexOf('id=rowVis')), /btGrafico|btVis|btSomenteDif/);
    assert.match(acoes, /<button type=button id=btGrafico class=btIcone title="Gráfico" aria-label="Gráfico">\s*\n\s*<svg/);
    assert.ok(acoes.indexOf('id=btGrafico') < acoes.indexOf('id=visIcone'));
    // Fora de #rowVis: a conta restrita precisa escondê-los à parte.
    const barra = pagina.slice(pagina.indexOf('id=rowVis'), pagina.indexOf('id=indicadoresFinanceiros'));
    assert.doesNotMatch(barra, /btGrafico|btVis/);
    assert.match(interacoes, /el\('btGrafico'\)\.hidden = simples;\s*\n\s*el\('visIcone'\)\.hidden = simples;/);
    assert.match(estilos, /\.menuIcone \{\s*\n\s*position: absolute;\s*\n\s*top: calc\(100% \+ \.45rem\);/);
    assert.match(regras, /\*\*Visualizações\*\* é um ícone \(olho\) no bloco de botões do cabeçalho, logo depois do Gráfico/);
    assert.match(fs.readFileSync('css/base.css', 'utf8'), /\.acoesCabecalho \.btIcone \{\s*\n\s*width: 2rem;\s*\n\s*height: 2rem;/);
    assert.match(estilos, /\.btIcone \{[\s\S]*?width: 2\.2rem;\s*\n\s*height: 2\.2rem;/);
    assert.match(estilos, /\.btIcone:disabled \{\s*\n\s*opacity: \.5;/);
    assert.match(regras, /\*\*Gráfico\*\* \(ícone de barras\) é botão só de ícone[^.]*no bloco de botões à direita do cabeçalho, junto dos demais\./);
    assert.match(regras, /Os botões \(cartões Nubank e Mercado Pago, Todas\/Diferentes, Gráfico, Visualizações, simulação, cadastro, recarregar, diagnóstico, sair, nessa ordem\) formam um bloco só/);
});

test('navegação de ciclo quebra linha em vez de sobrepor o cabeçalho, e no mobile os ícones cabem ao lado do Até', () => {
    const mobile = fs.readFileSync('css/mobile.css', 'utf8');
    assert.match(estilos, /#navComparar \{\s*\n\s*display: flex;\s*\n\s*flex-direction: row;\s*\n\s*flex-wrap: wrap;/);
    assert.match(mobile, /#fate \{\s*\n\s*flex: 1 1 0;\s*\n\s*min-width: 9rem;/);
    assert.match(mobile, /#navComparar \.btNavCiclo,\s*\n\s*#navComparar \.btIcone \{\s*\n\s*width: 2rem;/);
});

test('menu de Visualizações fecha ao escolher, ao clicar fora e com Esc, e não sai da tela', () => {
    assert.match(graficos, /el\('visMenu'\)\.onclick = e => \{[\s\S]*?fecharMenuVis\(\);\s*\n\s*abrirVisualizacao\(item\.dataset\.vis\);/);
    assert.match(graficos, /if \(!el\('visMenu'\)\.hidden && !el\('visIcone'\)\.contains\(e\.target\)\) fecharMenuVis\(\);/);
    assert.match(graficos, /if \(e\.key === 'Escape' && !el\('visMenu'\)\.hidden\) \{ fecharMenuVis\(\); el\('btVis'\)\.focus\(\); \}/);
    assert.match(graficos, /if \(sobra < 0\) menu\.style\.left = `\$\{sobra\}px`;/);
});

test('recarga automática é silenciosa: sem toast, e falha não troca a tela pelo erro', async () => {
    const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
    const codigo = trechoAte(dadosUi, 'async function load({ silencioso = false } = {}) {', '\n}\n');
    const rodar = async (falhar, opcoes) => {
        const toasts = [];
        const out = { innerHTML: 'tabela antiga' };
        const ctx = {
            API: 'https://x', LIMIAR_CARGA_LENTA_MS: 0, Estado: { ciclos: [], lancamentos: [] },
            performance: { now: () => 0 }, console: { info() {}, warn() {} },
            carregarDados: async () => { if (falhar) throw Error('sem rede'); return { lancamentosCrus: [], diagnosticoDeDados: {} }; },
            atualizarCombos() {}, desenhar() {}, desenharQuandoLivre() {}, atualizarBotaoDiagnostico() {}, escapeHtml: String,
            mostrarToast: titulo => toasts.push(titulo),
            el: id => (id === 'out' ? out : { textContent: '' }),
        };
        vm.runInNewContext(`${codigo}\nthis.load = load;`, ctx);
        const ok = await ctx.load(opcoes);
        return { ok, toasts, out: out.innerHTML };
    };
    // Limiar 0: toda carga conta como lenta, então o toast apareceria se não fosse silenciosa.
    assert.deepEqual(await rodar(false, { silencioso: true }), { ok: true, toasts: [], out: 'tabela antiga' });
    assert.deepEqual(await rodar(true, { silencioso: true }), { ok: false, toasts: [], out: 'tabela antiga' });
    // Clique manual continua avisando.
    assert.deepEqual((await rodar(false)).toasts, ['Carga lenta']);
    const falhaManual = await rodar(true);
    assert.deepEqual(falhaManual.toasts, ['Não foi possível carregar']);
    assert.match(falhaManual.out, /Falhou: sem rede/);
    assert.match(inicializacao, /async function recarregarDados\(\) \{[\s\S]*?await load\(\{ silencioso: true \}\);/);
    assert.match(regras, /É silenciosa: não mostra toast nem toca som/);
});
