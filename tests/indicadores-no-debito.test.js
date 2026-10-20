// Reserva, Comprometido, Gastos e Liberdade moram na faixa Hoje do Débito no ciclo único e
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
