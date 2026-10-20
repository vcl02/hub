// Reserva, Gastos, Comprometido e Liberdade moram na faixa Hoje do Débito no ciclo único e
// voltam ao cabeçalho na comparação; o nó é sempre o mesmo e sobrevive ao redesenho.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Roda encaixarIndicadoresNoDebito do arquivo real com um DOM falso mínimo.
function encaixar(noCicloUnico, faixaDoDebito) {
    const inicio = interacoes.indexOf('function encaixarIndicadoresNoDebito(');
    const fim = interacoes.indexOf('\n}\n', inicio) + 3;
    const indicadores = { id: 'indicadoresFinanceiros' };
    const classes = new Set();
    const consultas = [];
    const nos = {
        indicadoresFinanceiros: indicadores,
        rowVis: { classList: { toggle: (c, ligar) => (ligar ? classes.add(c) : classes.delete(c)) } },
        out: { querySelector: sel => { consultas.push(sel); return faixaDoDebito; } },
    };
    const ctx = { el: id => nos[id] };
    vm.runInNewContext(`${interacoes.slice(inicio, fim)}\nencaixarIndicadoresNoDebito(${noCicloUnico});`, ctx);
    return { classes, consultas, indicadores };
}

test('ciclo único: os indicadores entram na primeira faixa do Débito', () => {
    const recebidos = [];
    const faixa = { append: n => recebidos.push(n) };
    const r = encaixar(true, faixa);
    assert.deepEqual(r.consultas, ['.blk[data-bloco=db] .resumoDados']);
    assert.deepEqual(recebidos, [r.indicadores]);
    assert.ok(r.classes.has('semIndicadores'));   // a linha própria do cabeçalho some
});

test('comparação (ou sem Débito na tela): ficam no cabeçalho', () => {
    const r = encaixar(false, { append: () => assert.fail('não deveria encaixar') });
    assert.deepEqual(r.consultas, []);
    assert.ok(!r.classes.has('semIndicadores'));
    assert.ok(!encaixar(true, null).classes.has('semIndicadores'));
});

test('o nó volta pro cabeçalho antes de #out ser reescrito, e é encaixado depois', () => {
    const corpo = interacoes.slice(interacoes.indexOf('function desenhar() {'));
    const volta = corpo.indexOf("el('acoesAcompanhamento').append(el('indicadoresFinanceiros'));");
    const reescrita = corpo.indexOf("el('out').innerHTML = modoBlocos ? vCiclo() : vComp();");
    const encaixe = corpo.indexOf('encaixarIndicadoresNoDebito(temCicloParaIndicadores && modoBlocos);');
    assert.ok(volta > 0 && volta < reescrita && reescrita < encaixe);
    assert.match(tabelas, /return `<div class=blk data-bloco=\$\{idTabela\}><h3>/);
});

test('estilo: linha própria dentro da faixa; sem linha vazia no cabeçalho estreito', () => {
    assert.match(estilos, /\.resumoDados > #indicadoresFinanceiros \{\s*\n\s*flex: 1 1 100%;/);
    assert.match(estilos, /\.resumoDados \.indicadorRegra \{\s*\n\s*font-size: inherit;/);
    // A faixa herda nowrap; o texto do indicador volta a quebrar pra não cortar no celular.
    assert.match(estilos, /\.indicadorRegra \{\s*\n\s*font-size: \.84rem;\s*\n\s*white-space: normal;/);
    assert.match(estilos, /@media \(max-width: 1250px\) \{[\s\S]*?#rowVis\.semIndicadores \{\s*\n\s*display: none;/);
});

test('REGRAS.md documenta o lugar dos indicadores', () => {
    assert.match(regras, /No ciclo único, os indicadores ficam \*\*dentro da faixa Hoje do Débito\*\*/);
    assert.match(regras, /Eles não entram no alinhamento Hoje\/Futuro das faixas/);
    assert.match(regras, /com os indicadores no Débito, essa linha não aparece/);
});

// Layout falso em linha: cada lista quebra quando passa da largura; minWidth vale como largura.
function alinharDivisores({ cima, futuro, baixo, larguraCima = 1000, larguraBaixo = 1000 }) {
    const inicio = interacoes.indexOf('function alinharDivisoresDosIndicadores() {');
    const fim = interacoes.indexOf('\n}\n', inicio) + 3;
    const largura = e => Math.max(e.w, parseFloat(e.style.minWidth) || 0);
    const posicoes = (lista, limite) => {
        let x = 0, linha = 0;
        return lista.map(e => {
            if (x > 0 && x + largura(e) > limite) { x = 0; linha++; }
            const caixa = { left: x, top: linha * 20, height: 20, width: largura(e) };
            x += largura(e);
            return caixa;
        });
    };
    const item = (w, divisor = false) => ({ w, divisor, style: { minWidth: '' }, classList: { contains: () => false } });
    const faixa = lista => ({ children: lista });
    const deCima = cima.map(([w, d]) => item(w, d)), deFuturo = futuro.map(([w, d]) => item(w, d));
    const itens = baixo.map(w => item(w, true));
    const indicadores = { hidden: false, querySelectorAll: () => itens, classList: { contains: () => false } };
    const hoje = faixa([...deCima, indicadores]), proxima = faixa(deFuturo);
    const titulo = { querySelectorAll: () => [hoje, proxima] };
    hoje.closest = () => titulo;
    indicadores.closest = () => hoje;
    [[deCima, larguraCima], [deFuturo, larguraCima], [itens, larguraBaixo]].forEach(([lista, limite]) =>
        lista.forEach((e, i) => { e.getBoundingClientRect = () => posicoes(lista, limite)[i]; }));
    const ctx = {
        el: () => indicadores,
        getComputedStyle: e => ({ borderLeftColor: e.divisor ? 'rgb(59, 65, 71)' : 'rgba(0, 0, 0, 0)' }),
    };
    vm.runInNewContext(`${interacoes.slice(inicio, fim)}\nalinharDivisoresDosIndicadores();`, ctx);
    return { deCima, deFuturo, itens };
}

const linhaDeCima = [[100], [120], [300, true], [300, true]];   // Saldo, Guardado | Besteira | Isabella

test('divisores de baixo embaixo dos de cima: estica quem ficou pra trás', () => {
    const r = alinharDivisores({ cima: linhaDeCima, futuro: linhaDeCima, baixo: [150, 330, 280, 120] });
    // 1º par: Besteira em 220, Comprometido em 150 → Reserva cresce 70.
    assert.equal(r.itens[0].style.minWidth, '220px');
    // 2º par: Isabella em 520, Gastos em 550 → a coluna Besteira cresce 30, em Hoje e Futuro.
    assert.equal(r.deCima[2].style.minWidth, '330px');
    assert.equal(r.deFuturo[2].style.minWidth, '330px');
    assert.equal(r.deCima[1].style.minWidth, '');
    assert.equal(r.itens[1].style.minWidth, '');
});

test('se esticar fizer um item descer de linha, desfaz e para', () => {
    // Reserva precisaria crescer 70, mas aí Liberdade não cabe mais nos 900 da linha de baixo.
    const r = alinharDivisores({ cima: linhaDeCima, futuro: linhaDeCima, baixo: [150, 330, 280, 120], larguraBaixo: 900 });
    assert.ok(r.itens.every(e => e.style.minWidth === ''));
    assert.ok(r.deCima.every(e => e.style.minWidth === ''));
});

test('alinhamento dos divisores roda junto com o das faixas (desenho, largura e fonte)', () => {
    assert.match(interacoes, /igualarLarguras\(colunas\);\s*\n\s*\}\);\s*\n\s*alinharDivisoresDosIndicadores\(\);\s*\n\}/);
    assert.match(interacoes, /document\.fonts\?\.ready\.then\(\(\) => requestAnimationFrame\(alinharResumosDosTitulos\)\);/);
    assert.match(regras, /os divisores da linha dos indicadores ficam embaixo dos da linha de cima/);
});
