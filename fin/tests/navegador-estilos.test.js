// No navegador: as cores do Fin vêm da base comum do hub (../base/tokens.css), medidas no estilo calculado de cada peça
// (antes conferidas procurando o texto do CSS, que quebrava a cada token renomeado). O esperado é um token da base
// ('--ok', resolvido pelo próprio navegador) ou um valor fixo; a página abre uma vez só e mede tudo de uma vez.
const assert = require('./helpers/assert-tolerante');
const { test } = require('node:test');
const { prepararNavegador, abrirFin } = require('./helpers/navegador');

prepararNavegador();

// [o que é, HTML posto na página (null: a peça já existe), peça medida, { propriedade: esperado }]
const CASOS = [
  [
    'campo desativado do cadastro: mais escuro, apagado, tracejado e sem setinha',
    '<div class=fm><select id=sondaDesativado disabled></select></div>',
    '#sondaDesativado',
    {
      color: '--muted',
      'background-color': '--bg',
      'background-image': 'none',
      'border-top-style': 'dashed',
      opacity: '0.7',
      'box-shadow': 'inset 0 2px 6px var(--shadow)',
    },
  ],
  [
    'lista do Consolidar tudo em cinza',
    null,
    '#listaConsolidarTudo',
    { color: '--muted' },
  ],
  [
    'divisor antes da faixa de cada cartão',
    '<div class=resumoDados><span></span><div class=limiteCartao id=sondaCartao></div></div>',
    '#sondaCartao',
    { 'border-left-color': '--line-strong' },
  ],
  [
    'divisor do indicador de besteira',
    '<div class=resumoDados><span></span><div class=besteiraIndicador id=sondaBesteira></div></div>',
    '#sondaBesteira',
    { 'border-left-color': '--line' },
  ],
  [
    'nome do teto ligado: o chip escolhido da base, verde como os outros controles ativos',
    '<button class="chip compacto ativo" style="--cor:var(--ok)" id=sondaTeto></button>',
    '#sondaTeto',
    {
      color: '--ok',
      'background-color': 'color-mix(in srgb, var(--ok) 16%, var(--bg))',
      'border-top-color': '--ok',
      'font-size': '--t-xs',
    },
  ],
  [
    'parte da meta em laranja: o selo de atenção da base',
    '<span class="selo aviso" id=sondaMeta></span>',
    '#sondaMeta',
    { color: '--aviso', 'background-color': '--aviso-soft' },
  ],
  [
    'opção da meta que sugere outro mês: o chip laranja da base',
    '<button class="chip compacto aviso" id=sondaOpcao></button>',
    '#sondaOpcao',
    {
      color: '--aviso',
      'background-color': '--aviso-soft',
      'border-top-color': '--aviso',
    },
  ],
  [
    'inconsistência do diagnóstico: item da lista de texto da base, em vermelho e no fundo dentro do modal',
    '<div class=modal><ul class="lista texto erro"><li id=sondaItem></li></ul></div>',
    '#sondaItem',
    { color: '--erro', 'background-color': '--bg', 'overflow-wrap': 'anywhere' },
  ],
  [
    'sugestões do Nome: a lista suspensa da base',
    null,
    '#nomesExistentes',
    {
      position: 'absolute',
      'background-color': '--surface',
      'border-top-color': '--line-strong',
    },
  ],
  [
    'sinal + da tabela: o botão de sinal compacto da base, verde',
    '<button class="bt-ic sinal compacto pos" id=sondaSinal></button>',
    '#sondaSinal',
    { color: '--ok', width: '24px', height: '24px' },
  ],
  [
    'campo da meta: o campo compacto da base',
    '<input class="campo compacto" id=sondaMetaCampo>',
    '#sondaMetaCampo',
    { height: '36px', 'background-color': '--bg', 'font-size': '--t-sm' },
  ],
  [
    'fechar do cadastro: o botão de ícone de perigo da base (ícone vermelho no fundo da superfície)',
    null,
    '#fechaNovo',
    {
      color: '--erro',
      'background-color': '--surface',
      'border-top-color': '--line',
    },
  ],
  [
    'Salvar do cadastro: o botão primário da base, na cor do Fin',
    null,
    '#salvaNovo',
    { color: '--on-cor', 'background-color': '--cor', 'min-height': '48px' },
  ],
  [
    'campo do cadastro: o .campo da base',
    null,
    '#fNome',
    {
      'background-color': '--bg',
      'border-top-color': '--line',
      'border-top-left-radius': '--r',
    },
  ],
  [
    'Crédito marcado no cadastro: o botão de ícone ligado da base (cor do Fin)',
    null,
    'label:has(> #fCred)',
    { color: '--cor', 'border-top-color': '--cor', 'background-color': '--cor-soft' },
  ],
  [
    'Reserva desmarcado: o botão de ícone da base',
    null,
    'label:has(> #fReserva)',
    { color: '--fg', 'background-color': '--surface', 'border-top-color': '--line' },
  ],
  [
    'modal (o cadastro e os demais): o .modal da base',
    null,
    '#modalDiagnostico',
    {
      'background-color': '--surface',
      'border-top-color': '--line',
      'border-top-left-radius': '--r-lg',
    },
  ],
  [
    'variação boa em verde',
    '<span class="variacaoIndicador vd" id=sondaVd></span>',
    '#sondaVd',
    { color: '--ok' },
  ],
  [
    'variação ruim em vermelho',
    '<span class="variacaoIndicador vm" id=sondaVm></span>',
    '#sondaVm',
    { color: '--erro' },
  ],
  [
    'indicador inteiro numa linha, com o divisor à esquerda',
    '<span class=indicadorItem id=sondaIndicador></span>',
    '#sondaIndicador',
    {
      'flex-wrap': 'wrap',
      'border-left-style': 'solid',
      'border-left-width': '1px',
      'border-left-color': '--line',
    },
  ],
  [
    'título do bloco: negrito e 1,05 rem (o atalho font com inherit era inválido e o navegador o ignorava)',
    '<div class=blk><h3 id=sondaTitulo></h3></div>',
    '#sondaTitulo',
    { 'font-size': '1.05rem', 'font-weight': '700' },
  ],
  [
    'contagem do título do bloco em cinza',
    '<div class=blk><h3><span class=contagemTitulo id=sondaContagem></span></h3></div>',
    '#sondaContagem',
    { color: '--muted' },
  ],
  [
    'Simular sempre laranja',
    null,
    '#toggleSimulacao',
    {
      color: '--aviso',
      'background-color': '--aviso-soft',
      'border-top-color': '--aviso',
    },
  ],
  [
    'Recarregar sempre verde',
    null,
    '#recarregar',
    { color: '--ok', 'background-color': '--ok-soft', 'border-top-color': '--ok' },
  ],
  [
    'asterisco da categoria compartilhada em vermelho',
    '<b class=catCompartilhada id=sondaCompartilhada>*</b>',
    '#sondaCompartilhada',
    { color: '--erro' },
  ],
  [
    'categoria do gráfico na pizza: o chip ligado da base, na cor do Fin',
    '<button class=chip aria-pressed=true id=sondaCategoria></button>',
    '#sondaCategoria',
    { color: '--cor', 'background-color': '--cor-soft', 'border-top-color': '--cor' },
  ],
  [
    'aviso (o da base) quebra texto sem espaço (chave Pix) em vez de estourar a largura',
    null,
    '#toast',
    { 'overflow-wrap': 'anywhere' },
  ],
  [
    'valor de antes da simulação em cinza e sem negrito',
    '<span class=valorAntes id=sondaAntes></span>',
    '#sondaAntes',
    { color: '--muted', 'font-weight': '400' },
  ],
];

async function coresDeCadaPeca(pg) {
  const medidas = await pg.evaluate((casos) => {
    const caixa = document.createElement('div'),
      sonda = document.createElement('i');

    document.body.append(caixa);
    caixa.append(sonda);

    // O valor que o navegador calcula para o esperado (token da base ou valor fixo), na mesma propriedade
    const calcular = (prop, esperado) => {
      sonda.style.borderStyle = 'solid'; // sem estilo de borda, a largura calcula 0
      sonda.style.setProperty(
        prop,
        esperado.startsWith('--') ? `var(${esperado})` : esperado
      );
      const v = getComputedStyle(sonda).getPropertyValue(prop);

      sonda.style.removeProperty(prop);

      return v;
    };

    return casos.flatMap(([nome, html, alvo, props]) => {
      if (html) caixa.insertAdjacentHTML('beforeend', html);

      const e = document.querySelector(alvo),
        estilo = getComputedStyle(e);

      return Object.entries(props).map(([prop, esperado]) => [
        `${nome} (${prop})`,
        estilo.getPropertyValue(prop),
        calcular(prop, esperado),
      ]);
    });
  }, CASOS);

  for (const [nome, tem, quer] of medidas) assert.equal(tem, quer, nome);
}

// O Fin carrega a base (tokens e componentes) antes do próprio CSS e não redefine os tokens dela: só escolhe a própria cor (--cor)
async function baseAntesDoCss(pg) {
  const { ordem, daBase, doFin, cor } = await pg.evaluate(() => {
    const folhas = [...document.styleSheets].filter((f) =>
      f.href?.startsWith(location.origin)
    ); // as fontes vêm de fora

    const declarados = (f) =>
      [...f.cssRules].flatMap((r) =>
        r.style ? [...r.style].filter((p) => p.startsWith('--')) : []
      );

    const base = folhas.find((f) => f.href.endsWith('/base/tokens.css'));

    return {
      ordem: folhas.map((f) => new URL(f.href).pathname.replace(/^\/hub\//, '')),
      daBase: declarados(base),
      doFin: folhas.filter((f) => f.href.includes('/fin/css/')).flatMap(declarados),
      cor: getComputedStyle(document.documentElement).getPropertyValue('--cor').trim(),
    };
  });

  assert.deepEqual(ordem.slice(0, 2), ['base/tokens.css', 'base/componentes.css']);
  assert.ok(
    ordem.slice(2).every((f) => f.startsWith('fin/css/')),
    JSON.stringify(ordem)
  );
  assert.ok(
    daBase.includes('--ok') && daBase.includes('--surface'),
    JSON.stringify(daBase)
  );
  assert.deepEqual(
    doFin.filter((t) => daBase.includes(t)),
    ['--cor']
  );
  assert.equal(cor, '#a78bfa'); // a mesma da referência da base
}

// O bloco de botões do cabeçalho, na ordem (REGRAS.md, "Os botões (cartões …) formam um bloco só")
const BOTOES = [
  'btNubank',
  'btMercadoPago',
  'btSomenteDif',
  'btGrafico',
  'btVis',
  'toggleSimulacao',
  'abreNovo',
  'recarregar',
  'btDiagnostico',
];

// Cabeçalho: ‹ › e cada botão são o botão de ícone da base (.bt-ic, 40 px), o bloco na ordem; Novo é o .ok da base
async function botoesDoCabecalho(pg) {
  await pg.setViewportSize({ width: 1280, height: 800 });

  const r = await pg.evaluate(() => ({
    ordem: [
      ...document.querySelectorAll('.acoesCabecalho > button, .visWrap > button'),
    ].map((b) => b.id),
    medidas: [
      ...document.querySelectorAll(
        '#navComparar button, .acoesCabecalho > button, .visWrap > button'
      ),
    ]
      .filter((b) => !b.hidden)
      .map((b) => [
        b.id,
        b.classList.contains('bt-ic'),
        Math.round(b.getBoundingClientRect().width),
        Math.round(b.getBoundingClientRect().height),
      ]),
    novo: document.getElementById('abreNovo').className,
  }));

  assert.deepEqual(
    r.ordem.filter((id) => id !== 'btMetas'),
    BOTOES
  );

  for (const [id, base, w, h] of r.medidas)
    assert.deepEqual([id, base, w, h], [id, true, 40, 40]);
  assert.equal(r.novo, 'bt-ic ok');
}

test('a base comum: cada peça com a cor que deve, a base antes do CSS do Fin, e o cabeçalho no botão de ícone da base', async () => {
  const { ctx, pg, erros } = await abrirFin();

  await coresDeCadaPeca(pg);
  await baseAntesDoCss(pg);
  await botoesDoCabecalho(pg);
  assert.deepEqual(erros, []);
  await ctx.close();
});

// Cadastro aberto: a data (mais alta por natureza) com a altura do Hoje e dos outros campos; o ± na altura do Valor;
// o seletor de Vezes desativado afundado (a sombra de dentro), já que o ativo tem o mesmo fundo
test('cadastro: Data, Hoje, Nome, Valor e ± na mesma altura; Vezes desativado afundado', async () => {
  const { ctx, pg, erros } = await abrirFin();

  await pg.click('#abreNovo');

  const r = await pg.evaluate(() => {
    const altura = (s) =>
      Math.round(document.querySelector(s).getBoundingClientRect().height);

    const vezes = document.getElementById('fParcelas');

    vezes.disabled = true;

    return {
      alturas: ['#fData', '#fDataHoje', '#fNome', '.moneyWrap', '#fSinal'].map(altura),
      sinal: Math.round(document.getElementById('fSinal').getBoundingClientRect().width),
      sombra: getComputedStyle(vezes).boxShadow,
    };
  });

  assert.equal(new Set(r.alturas).size, 1, JSON.stringify(r.alturas));
  assert.equal(r.sinal, 48);
  assert.equal(r.sombra, 'rgba(0, 0, 0, 0.35) 0px 2px 6px 0px inset');
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('celular: ‹ De Até › numa linha só e os botões numa grade de 6 colunas com a altura da base, sem estourar', async () => {
  const { ctx, pg } = await abrirFin('', undefined, 0, { celular: true });

  const caixa = (id) =>
    pg.$eval('#' + id, (e) => {
      const r = e.getBoundingClientRect();

      return { x: r.x, y: r.y, w: r.width, h: r.height, fim: r.right };
    });

  const nav = await Promise.all(
    ['cicloAnterior', 'fde', 'fate', 'cicloProximo'].map(caixa)
  );

  assert.ok(
    nav.every((c) => Math.abs(c.y + c.h / 2 - (nav[0].y + nav[0].h / 2)) < 4),
    JSON.stringify(nav)
  );

  const visiveis = await pg.$$eval('.acoesCabecalho > button, .visWrap > button', (L) =>
    L.filter((b) => !b.hidden).map((b) => b.id)
  );

  const bts = await Promise.all(visiveis.map(caixa)),
    largura = await pg.evaluate(() => innerWidth);

  assert.deepEqual([...new Set(bts.map((c) => Math.round(c.y)))].length, 2); // duas linhas
  assert.equal(bts.filter((c) => Math.round(c.y) === Math.round(bts[0].y)).length, 6);
  assert.ok(
    bts.every((c) => Math.round(c.h) === 40 && c.fim <= largura),
    JSON.stringify(bts)
  );
  await ctx.close();
});
