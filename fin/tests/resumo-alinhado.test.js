// Faixas Hoje e Futuro dos títulos: cada item e cada valor/rótulo variável dentro dele
// ganham a largura do maior entre as faixas, pra ficarem um embaixo do outro.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');
const { declaracoes, regras: regrasCss } = require('./helpers/regras-css');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Um ciclo com Besteira dentro do teto (R$ 50 de 250), Isabella acima (R$ 800 de 700) e uma compra no cartão
function dadosDoCiclo() {
  const l = (id, nome, valor, extra = {}) => ({
    id: String(id),
    nome,
    data: '2026-10-17',
    valor,
    categ: 'Compras',
    cred: false,
    pago: true,
    fatura: null,
    freq: null,
    ...extra,
  });

  return {
    fin_ciclo: [
      { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
      { id: 2, inicio: '2026-10-15', fim: null },
    ],
    fin: [
      l(1, 'Salário', 9000, { data: '2026-10-15', categ: 'Salário' }),
      l(40, 'Café', -50, { categ: 'Besteira' }),
      l(43, 'Cinema', -800, { categ: 'Isabella' }),
      l(20, 'Livro', -80, { data: '2026-10-18', cred: true, fatura: '2026-11-12' }),
    ],
    fin_meta: [],
  };
}

// Elemento falso: largura fixa, filhos e consulta por seletor simples (só o que a função usa).
function elemento(largura, { classes = [], internos = [], filhos = [], id = '' } = {}) {
  return {
    id,
    style: {},
    children: filhos,
    classList: { contains: (c) => classes.includes(c) },
    getBoundingClientRect: () => ({ width: largura }),
    querySelectorAll: () => internos,
  };
}

function rodar(faixas) {
  const titulo = {
    querySelectorAll: () => faixas.map((filhos) => ({ children: filhos })),
  };

  const inicio = interacoes.indexOf('function alinharResumosDosTitulos() {');
  const fim = interacoes.indexOf('\n}\n', inicio) + 3;
  const antigos = rodar.antigos || [];

  // Os divisores dos indicadores têm teste próprio (indicadores-no-debito.test.js).
  const ctx = {
    el: () => ({
      querySelectorAll: (sel) =>
        sel == '.resumoTitulo'
          ? [titulo]
          : sel == '.resumoDados [style*="min-width"]' // as larguras do desenho anterior
            ? antigos
            : [],
    }),
    Math,
    alinharDivisoresDosIndicadores: () => {},
  };

  vm.runInNewContext(
    `${interacoes.slice(inicio, fim)}\nalinharResumosDosTitulos();`,
    ctx
  );
}

test('itens e valores das duas faixas ficam com a largura do maior', () => {
  const livreHoje = elemento(70),
    livreFuturo = elemento(55);

  const rotuloHoje = elemento(30),
    rotuloFuturo = elemento(38); // "Livre" × "Acima"

  const hoje = [elemento(200, { internos: [rotuloHoje, livreHoje] }), elemento(100)];

  const futuro = [
    elemento(180, { internos: [rotuloFuturo, livreFuturo] }),
    elemento(120),
  ];

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

test('indicadores na faixa Hoje do Débito não desfazem o alinhamento com o Futuro', () => {
  const hoje = [elemento(200), elemento(100)];
  const futuro = [elemento(180), elemento(120)];
  const indicadores = elemento(900, { id: 'indicadoresFinanceiros' });

  rodar([[...hoje, indicadores], futuro]);
  assert.equal(futuro[0].style.minWidth, '200px');
  assert.equal(hoje[1].style.minWidth, '120px');
  assert.equal(indicadores.style.minWidth, undefined);
});

test('larguras da janela anterior são apagadas antes de medir de novo', () => {
  const antigo = { style: { minWidth: '300px' } };

  rodar.antigos = [antigo];
  rodar([[elemento(200)], [elemento(180)]]);
  rodar.antigos = [];
  assert.equal(antigo.style.minWidth, '');
});

test('mudou a largura da janela: refaz o alinhamento no próximo quadro; mesma largura, nada', () => {
  const inicio = interacoes.indexOf('let larguraDosResumos = window.innerWidth;');
  const fim = interacoes.indexOf('\n});\n', inicio) + 5;
  const quadros = [];
  let aoRedimensionar;

  const ctx = {
    window: {
      innerWidth: 1000,
      addEventListener: (tipo, fn) => {
        if (tipo === 'resize') aoRedimensionar = fn;
      },
    },
    requestAnimationFrame: (fn) => quadros.push(fn),
    alinharResumosDosTitulos: () => {},
  };

  vm.runInNewContext(interacoes.slice(inicio, fim), ctx);
  aoRedimensionar();
  assert.equal(quadros.length, 0); // a largura é a mesma

  ctx.window.innerWidth = 800;
  aoRedimensionar();
  assert.deepEqual(quadros, [ctx.alinharResumosDosTitulos]);

  aoRedimensionar(); // já refeito para 800
  assert.equal(quadros.length, 1);
});

test('faixas com estrutura diferente não são mexidas', () => {
  const hoje = [elemento(200), elemento(100)];
  const futuro = [elemento(180)];

  rodar([hoje, futuro]);
  assert.equal(hoje[0].style.minWidth, undefined);
});

test('alinhamento roda a cada desenho, depois do HTML novo e dos indicadores, nos dois modos', async () => {
  const tela = carregarTela({
    dados: {
      fin: [],
      fin_ciclo: [{ id: 1, inicio: '2026-09-15', fim: null }],
      fin_meta: [],
    },
  });

  await tela.bruto('carregarDados()');
  trazer(tela.ctx, 'js/interactions.js', ['desenhar']);

  const el = (id) => tela.ctx.document.getElementById(id);

  tela.ctx.ordem = [];
  tela.bruto(`(() => {
    const registra = (nome) => () => ordem.push(nome + ':' + el('out').innerHTML);

    sincronizarCicloNaUrl = () => {};
    popularAlvosVisualizacao = () => {};
    atualizarIndicadoresFinanceiros = () => {};
    vCiclo = () => 'CICLO';
    vComp = () => 'MATRIZ';
    encaixarIndicadoresNoDebito = registra('encaixar');
    alinharResumosDosTitulos = registra('alinhar');
    atualizarCartoes = () => {};
    atualizarMetas = () => {};
    atualizarBotaoSomenteDif = () => {};
  })()`);

  el('compDe').value = '1';
  el('compAte').value = '1';
  tela.bruto('desenhar')();
  el('compAte').value = '2';
  tela.bruto('desenhar')();
  assert.deepEqual(Array.from(tela.ctx.ordem), [
    'encaixar:CICLO',
    'alinhar:CICLO',
    'encaixar:MATRIZ',
    'alinhar:MATRIZ',
  ]);
});

test('Crédito tem a mesma estrutura em Hoje e Futuro: Fatura, Usado e Livre nas duas faixas', async () => {
  const { html } = await carregarTela({ dados: dadosDoCiclo() }).desenharCiclo(1);
  const faixas = html.split('<span class=resumoLinha>').slice(1);
  const nome = (faixa) => faixa.match(/^<span class=resumoRotulo>(\w+)</)[1];

  const rotulos = (faixa) =>
    [...faixa.matchAll(/class=limiteRotulo>(\w+)</g)].map((m) => m[1]);

  assert.deepEqual(faixas.map(nome), ['Hoje', 'Futuro', 'Hoje', 'Futuro']); // Débito e Crédito
  assert.deepEqual(rotulos(faixas[2]).slice(0, 3), ['Fatura', 'Usado', 'Livre']);
  assert.deepEqual(rotulos(faixas[3]).slice(0, 3), ['Fatura', 'Usado', 'Livre']);
});

test('números tabulares nas faixas, documentado em REGRAS.md: cada item fica embaixo do correspondente', () => {
  assert.ok(
    declaracoes(estilos, '.resumoDados').includes('font-variant-numeric: tabular-nums')
  );
  assert.match(
    regras,
    /cada item fica exatamente embaixo do correspondente da outra faixa/
  );
});

test('em todas as faixas o valor fica colado no rótulo; só o percentual reserva a largura de 100%', async () => {
  assert.deepEqual(declaracoes(estilos, '.resumoDados b'), [
    'display: inline-block',
    'text-align: left',
  ]);
  assert.ok(regrasCss(estilos).every((r) => !r.declaracoes.includes('min-width: 13ch')));
  assert.deepEqual(declaracoes(estilos, '.resumoDados b.pct'), ['min-width: 5ch']);

  // O percentual é o único valor com a classe pct, mesmo ao passar do teto (Isabella: R$ 800 de 700)
  const { html } = await carregarTela({ dados: dadosDoCiclo() }).desenharCiclo(1);

  assert.ok(
    html.includes(
      '<span class=limiteRotulo>Ultrapassado</span> <b class="pct vm">14%</b>'
    )
  );
  assert.ok(
    html.includes('<span class=limiteRotulo>Usado</span> <b class="pct vd">20%</b>')
  );
  assert.match(
    regras,
    /Em todas as faixas \(Saldo, Guardado, Besteira\/Isabella e cartões\), cada valor fica colado no próprio rótulo/
  );
  assert.doesNotMatch(regras, /reserva esse lugar vazio/);
});

test('faixa estreita quebra entre pedaços inteiros, sem divisor no começo da linha', async () => {
  assert.deepEqual(declaracoes(estilos, '.resumoDados > .temPedacos').slice(0, 2), [
    'display: flex',
    'flex-wrap: wrap',
  ]);
  assert.deepEqual(declaracoes(estilos, '.pedaco'), ['white-space: nowrap']);

  // Recuo de borda+folga cortado pelo clip: o divisor do item que abre a linha some.
  const faixa = declaracoes(estilos, '.resumoDados');

  assert.ok(faixa.includes('margin-left: calc(-0.8rem - 1px)'));
  assert.ok(faixa.includes('clip-path: inset(0 0 0 calc(0.8rem + 1px))'));

  // Cada indicador de teto sai em pedaços: rótulo e %, o valor livre (ou acima) e "de/dos" o teto
  const { html } = await carregarTela({ dados: dadosDoCiclo() }).desenharCiclo(1);
  const itens = html.split('<span class="besteiraIndicador temPedacos">').slice(1);

  assert.equal(itens.length, 4); // Besteira e Isabella, em Hoje e em Futuro

  for (const item of itens) {
    const teto = item.indexOf('<span class="pedaco limiteTeto">');

    assert.ok(teto > 0, 'o teto é o último pedaço');
    assert.equal(item.slice(0, teto).split('<span class=pedaco>').length - 1, 2); // rótulo e %, valor livre
  }

  assert.match(itens[1], /pedaco limiteTeto">dos </); // Isabella passou do teto
  assert.match(itens[0], /pedaco limiteTeto">de </);
  assert.match(
    regras,
    /quebra só entre seus pedaços[^.]*nunca no meio de um valor ou separando "de" do teto\.\s+O divisor vertical entre itens nunca aparece no começo de uma linha\./
  );
});
