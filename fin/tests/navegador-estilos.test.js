// No navegador: as cores do Fin vêm da base comum do hub (../base/tokens.css), medidas no estilo calculado de cada peça
// (antes conferidas procurando o texto do CSS, que quebrava a cada token renomeado). O esperado é um token da base
// ('--ok', resolvido pelo próprio navegador) ou um valor fixo; a página abre uma vez só e mede tudo de uma vez.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepararNavegador, abrirFin } = require('./helpers/navegador');

prepararNavegador();

// [o que é, HTML posto na página (null: a peça já existe), peça medida, { propriedade: esperado }]
const CASOS = [
    ['campo desativado do cadastro: mais escuro, apagado, tracejado e sem setinha', '<div class=fm><select id=sondaDesativado disabled></select></div>', '#sondaDesativado',
        { color: '--muted', 'background-color': '--bg', 'background-image': 'none', 'border-top-style': 'dashed', opacity: '0.7' }],
    ['lista do Consolidar tudo em cinza', null, '#listaConsolidarTudo', { color: '--muted' }],
    ['divisor antes da faixa de cada cartão', '<div class=resumoDados><span></span><div class=limiteCartao id=sondaCartao></div></div>', '#sondaCartao', { 'border-left-color': '--line-strong' }],
    ['divisor do indicador de besteira', '<div class=resumoDados><span></span><div class=besteiraIndicador id=sondaBesteira></div></div>', '#sondaBesteira', { 'border-left-color': '--line' }],
    ['nome do teto ligado fica verde, como os outros controles ativos', '<span class="filtroTeto ativo" id=sondaTeto></span>', '#sondaTeto',
        { color: '--ok', 'background-color': '--ok-soft', 'border-top-color': '--ok' }],
    ['pílula da meta em laranja', '<span class="mpParte am" id=sondaMeta></span>', '#sondaMeta', { color: '#F0A83A', 'background-color': '--laranja-soft', 'border-top-color': '#6A5330' }],
    ['fechar do cadastro em vermelho suave', null, '#fechaNovo', { 'background-color': '--erro-soft' }],
    ['variação boa em verde', '<span class="variacaoIndicador vd" id=sondaVd></span>', '#sondaVd', { color: '--ok' }],
    ['variação ruim em vermelho', '<span class="variacaoIndicador vm" id=sondaVm></span>', '#sondaVm', { color: '--erro' }],
    ['indicador inteiro numa linha, com o divisor à esquerda', '<span class=indicadorItem id=sondaIndicador></span>', '#sondaIndicador',
        { 'flex-wrap': 'wrap', 'border-left-style': 'solid', 'border-left-width': '1px', 'border-left-color': '--line' }],
    ['título do bloco: negrito e 1,05 rem (o atalho font com inherit era inválido e o navegador o ignorava)', '<div class=blk><h3 id=sondaTitulo></h3></div>', '#sondaTitulo', { 'font-size': '1.05rem', 'font-weight': '700' }],
    ['contagem do título do bloco em cinza', '<div class=blk><h3><span class=contagemTitulo id=sondaContagem></span></h3></div>', '#sondaContagem', { color: '--muted' }],
    ['Simular sempre laranja', null, '#toggleSimulacao', { color: '#F0A83A', 'background-color': '--laranja-soft', 'border-top-color': '#F0A83A' }],
    ['Recarregar sempre verde', null, '#recarregar', { color: '--ok', 'background-color': '--ok-soft', 'border-top-color': '--ok' }],
    ['asterisco da categoria compartilhada em vermelho', '<b class=catCompartilhada id=sondaCompartilhada>*</b>', '#sondaCompartilhada', { color: '--erro' }],
    ['Selecionar tudo das categorias na cor do Fin', '<button class=multiSelAll id=sondaTodas></button>', '#sondaTodas', { color: '--cor' }],
    ['toast quebra texto sem espaço (chave Pix) em vez de estourar a largura', '<article class=recado><p id=sondaRecado></p></article>', '#sondaRecado', { 'overflow-wrap': 'break-word' }],
    ['valor de antes da simulação em cinza e sem negrito', '<span class=valorAntes id=sondaAntes></span>', '#sondaAntes', { color: '--muted', 'font-weight': '400' }],
];

test('cada peça usa a cor da base comum (ou a própria do Fin) que deve', async () => {
    const { ctx, pg, erros } = await abrirFin();
    const medidas = await pg.evaluate(casos => {
        const caixa = document.createElement('div'), sonda = document.createElement('i');
        document.body.append(caixa); caixa.append(sonda);
        // O valor que o navegador calcula para o esperado (token da base ou valor fixo), na mesma propriedade
        const calcular = (prop, esperado) => {
            sonda.style.borderStyle = 'solid';                                    // sem estilo de borda, a largura calcula 0
            sonda.style.setProperty(prop, esperado.startsWith('--') ? `var(${esperado})` : esperado);
            const v = getComputedStyle(sonda).getPropertyValue(prop);
            sonda.style.removeProperty(prop);
            return v;
        };
        return casos.flatMap(([nome, html, alvo, props]) => {
            if (html) caixa.insertAdjacentHTML('beforeend', html);
            const e = document.querySelector(alvo), estilo = getComputedStyle(e);
            return Object.entries(props).map(([prop, esperado]) => [`${nome} (${prop})`, estilo.getPropertyValue(prop), calcular(prop, esperado)]);
        });
    }, CASOS);
    for (const [nome, tem, quer] of medidas) assert.equal(tem, quer, nome);
    assert.deepEqual(erros, []);
    await ctx.close();
});

test('o Fin carrega a base (tokens e componentes) antes do próprio CSS e não redefine os tokens dela: só escolhe a própria cor (--cor)', async () => {
    const { ctx, pg } = await abrirFin();
    const { ordem, daBase, doFin, cor } = await pg.evaluate(() => {
        const folhas = [...document.styleSheets].filter(f => f.href?.startsWith(location.origin));   // as fontes vêm de fora
        const declarados = f => [...f.cssRules].flatMap(r => (r.style ? [...r.style].filter(p => p.startsWith('--')) : []));
        const base = folhas.find(f => f.href.endsWith('/base/tokens.css'));
        return { ordem: folhas.map(f => new URL(f.href).pathname.replace(/^\/hub\//, '')),
            daBase: declarados(base), doFin: folhas.filter(f => f.href.includes('/fin/css/')).flatMap(declarados),
            cor: getComputedStyle(document.documentElement).getPropertyValue('--cor').trim() };
    });
    assert.deepEqual(ordem.slice(0, 2), ['base/tokens.css', 'base/componentes.css']);
    assert.ok(ordem.slice(2).every(f => f.startsWith('fin/css/')), JSON.stringify(ordem));
    assert.ok(daBase.includes('--ok') && daBase.includes('--surface'), JSON.stringify(daBase));
    assert.deepEqual(doFin.filter(t => daBase.includes(t)), ['--cor']);
    assert.equal(cor, '#A78BFA');                                                 // a mesma da referência da base
    await ctx.close();
});
