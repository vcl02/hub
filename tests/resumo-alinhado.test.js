// Faixas Hoje e Futuro dos títulos: cada item e cada valor/rótulo variável dentro dele
// ganham a largura do maior entre as faixas, pra ficarem um embaixo do outro.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Elemento falso: largura fixa, filhos e consulta por seletor simples (só o que a função usa).
function elemento(largura, { classes = [], internos = [], filhos = [] } = {}) {
    return {
        style: {}, children: filhos, classList: { contains: c => classes.includes(c) },
        getBoundingClientRect: () => ({ width: largura }),
        querySelectorAll: () => internos,
    };
}

function rodar(faixas) {
    const titulo = { querySelectorAll: () => faixas.map(filhos => ({ children: filhos })) };
    const inicio = interacoes.indexOf('function alinharResumosDosTitulos() {');
    const fim = interacoes.indexOf('\n}\n', inicio) + 3;
    const antigos = rodar.antigos || [];
    const ctx = { el: () => ({ querySelectorAll: sel => (sel == '.resumoTitulo' ? [titulo] : antigos) }), Math };
    vm.runInNewContext(`${interacoes.slice(inicio, fim)}\nalinharResumosDosTitulos();`, ctx);
}

test('itens e valores das duas faixas ficam com a largura do maior', () => {
    const livreHoje = elemento(70), livreFuturo = elemento(55);
    const rotuloHoje = elemento(30), rotuloFuturo = elemento(38);   // "Livre" × "Acima"
    const hoje = [elemento(200, { internos: [rotuloHoje, livreHoje] }), elemento(100)];
    const futuro = [elemento(180, { internos: [rotuloFuturo, livreFuturo] }), elemento(120)];
    const meta = elemento(90, { classes: ['resumoMeta'] });
    rodar([hoje, [...futuro, meta]]);
    // Só o mais estreito de cada par ganha largura mínima; o maior fica como está.
    assert.equal(livreHoje.style.minWidth, undefined);
    assert.equal(livreFuturo.style.minWidth, '70px');
    assert.equal(rotuloFuturo.style.minWidth, undefined);
    assert.equal(rotuloHoje.style.minWidth, '38px');
    assert.equal(hoje[0].style.minWidth, undefined);
    assert.equal(futuro[0].style.minWidth, '200px');
    assert.equal(hoje[1].style.minWidth, '120px');
    // "N registros" fica fora do alinhamento.
    assert.equal(meta.style.minWidth, undefined);
});

test('larguras da janela anterior são apagadas antes de medir de novo', () => {
    const antigo = { style: { minWidth: '300px' } };
    rodar.antigos = [antigo];
    rodar([[elemento(200)], [elemento(180)]]);
    rodar.antigos = [];
    assert.equal(antigo.style.minWidth, '');
    assert.match(interacoes, /el\('out'\)\.querySelectorAll\('\.resumoDados \[style\*="min-width"\]'\)\.forEach\(e => \{ e\.style\.minWidth = ''; \}\);/);
    // Mudou a largura da janela: refaz o alinhamento (no próximo quadro).
    assert.match(interacoes, /window\.addEventListener\('resize', \(\) => \{\s*\n\s*if \(window\.innerWidth == larguraDosResumos\) return;\s*\n\s*larguraDosResumos = window\.innerWidth;\s*\n\s*requestAnimationFrame\(alinharResumosDosTitulos\);/);
});

test('faixas com estrutura diferente não são mexidas', () => {
    const hoje = [elemento(200), elemento(100)];
    const futuro = [elemento(180)];
    rodar([hoje, futuro]);
    assert.equal(hoje[0].style.minWidth, undefined);
});

test('alinhamento roda a cada desenho; Crédito tem a mesma estrutura em Hoje e Futuro', () => {
    assert.match(interacoes, /el\('out'\)\.innerHTML = modoBlocos \? vCiclo\(\) : vComp\(\);\s*\n\s*alinharResumosDosTitulos\(\);/);
    assert.match(visoes, /<span class=resumoRotulo>Hoje<\/span><span class=resumoDados>` \+\s*\n\s*resumoLimites\('limiteLivreHoje'\)/);
    assert.match(visoes, /<span class=resumoRotulo>Futuro<\/span><span class=resumoDados>` \+\s*\n\s*resumoLimites\('limiteLivreFuturo'\)/);
    assert.match(estilos, /\.resumoDados \{[\s\S]*?font-variant-numeric: tabular-nums;/);
    assert.match(regras, /cada item fica exatamente embaixo do correspondente da outra faixa/);
});

test('em todas as faixas o valor fica colado no rótulo; só o percentual reserva a largura de 100%', () => {
    assert.match(estilos, /\.resumoDados b \{\s*\n\s*display: inline-block;\s*\n\s*text-align: left;\s*\n\s*\}/);
    assert.doesNotMatch(estilos, /min-width: 13ch/);
    assert.match(estilos, /\.resumoDados b\.pct \{\s*\n\s*min-width: 5ch;/);
    assert.match(visoes, /\$\{rotulo\} <b class="pct \$\{cor\}">/);
    assert.match(regras, /Em todas as faixas \(Saldo, Guardado, Besteira\/Isabella e cartões\), cada valor fica colado no próprio rótulo/);
    assert.doesNotMatch(regras, /reserva esse lugar vazio/);
});

test('faixa estreita quebra entre pedaços inteiros, sem divisor no começo da linha', () => {
    assert.match(estilos, /\.resumoDados > \.temPedacos \{\s*\n\s*display: flex;\s*\n\s*flex-wrap: wrap;/);
    assert.match(estilos, /\.pedaco \{\s*\n\s*white-space: nowrap;/);
    // Recuo de borda+folga cortado pelo clip: o divisor do item que abre a linha some.
    assert.match(estilos, /margin-left: calc\(-\.8rem - 1px\);\s*\n\s*clip-path: inset\(0 0 0 calc\(\.8rem \+ 1px\)\);/);
    assert.match(visoes, /<span class="besteiraIndicador temPedacos"><span class=pedaco>\$\{rotulo\} <b class="pct \$\{cor\}">/);
    assert.match(visoes, /`<span class="pedaco limiteTeto">\$\{dentro \? 'de' : 'dos'\} \$\{tetoDoIndicador\(limite\)\}<\/span><\/span>`/);
    assert.match(regras, /quebra só entre seus pedaços[^.]*nunca no meio de um valor ou separando "de" do teto\.\s+O divisor vertical entre itens nunca aparece no começo de uma linha\./);
});
