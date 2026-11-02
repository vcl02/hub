// Pizza de gastos: agrupa despesas reais e evita contar transferência de fatura duas vezes.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { ouvinteDe } = require('./helpers/ouvintes');
const { etiquetas } = require('./helpers/html');

const fonte = fs.readFileSync('js/charts.js', 'utf8');
const regrasMd = fs.readFileSync('docs/REGRAS.md', 'utf8');
const inicio = fonte.indexOf('const PERCENTUAL_MINIMO_PIZZA');
const fim = fonte.indexOf('\n// clique numa celula', inicio);

if (inicio < 0 || fim < 0) throw Error('Não encontrou os dados da pizza de gastos.');

function dadosDoGrafico(lancamentos) {
  const contexto = {
    Estado: { ciclos: [{ fat: '2026-10-12' }], lancamentos },
    ehTransferenciaFatura: (r) =>
      !r.cred && /antecipação de fatura/i.test(`${r.nome || ''} ${r.categ || ''}`),
    ajusteDoCiclo: () => null,
    previstasDoCiclo: () => [],
    textoOuTraco: (valor) => String(valor || '-'),
    categoriasSeparadas: (valor) =>
      String(valor || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    ehCategoria: (categoria, procurada) =>
      String(categoria).trim().toLowerCase() === String(procurada).toLowerCase(),
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${fonte.slice(inicio, fim)}\nglobalThis.regras = { dadosDoGraficoCiclo, categoriasMinimasDaPizza, ordenarCategoriasDoGrafico, proximaExclusaoDasCategorias, agruparGastosDaPizza };`,
    contexto
  );

  return contexto.regras;
}

test('pizza oculta Reserva e mantém a outra categoria sem duplicação', () => {
  const regras = dadosDoGrafico([
    {
      periodoIdx: 0,
      cred: false,
      nome: 'Mercado',
      categ: 'Casa',
      reserva: true,
      v: -100,
    },
    {
      periodoIdx: 0,
      cred: false,
      nome: 'Antecipação de Fatura',
      categ: 'Fatura',
      v: -200,
    },
    { periodoIdx: 0, cred: true, nome: 'Compra cartão', categ: 'Eletrônicos', v: -300 },
  ]);

  const dados = regras.dadosDoGraficoCiclo(0);

  assert.deepEqual(Array.from(dados.categorias), ['Casa']);
  assert.deepEqual(Array.from(dados.categoriasCompartilhadas), []);
  assert.deepEqual(
    Array.from(dados.gastos, (gasto) => ({
      categorias: Array.from(gasto.categorias),
      valor: gasto.valor,
    })),
    [{ categorias: ['Casa'], valor: 100 }]
  );
});

test('lançamento só-Reserva (bit, sem nenhuma outra categoria) não cria fatia nenhuma', () => {
  const regras = dadosDoGrafico([
    {
      periodoIdx: 0,
      cred: false,
      nome: 'Evolução Obra',
      categ: '',
      reserva: true,
      v: -100,
    },
    { periodoIdx: 0, cred: false, nome: 'Mercado', categ: 'Casa', v: -50 },
  ]);

  const dados = regras.dadosDoGraficoCiclo(0);

  assert.deepEqual(Array.from(dados.categorias), ['Casa']);
  assert.deepEqual(
    Array.from(dados.gastos, (gasto) => gasto.categorias[0]),
    ['Casa']
  );
});

test('pizza mantém somente categorias de ao menos dois por cento do recorte', () => {
  const regras = dadosDoGrafico([]);

  const resultado = regras.categoriasMinimasDaPizza({
    Casa: 96,
    Pequena: 1.99,
    Reserva: 2.01,
  });

  assert.equal(resultado.total, 100);
  assert.deepEqual(Array.from(resultado.categorias), ['Casa', 'Reserva']);
});

test('seletor prioriza categorias compartilhadas antes das simples', () => {
  const regras = dadosDoGrafico([]);

  assert.deepEqual(
    Array.from(
      regras.ordenarCategoriasDoGrafico(
        ['Transporte', 'Casa', 'Reserva', 'Lazer'],
        new Set(['Reserva', 'Casa'])
      )
    ),
    ['Casa', 'Reserva', 'Lazer', 'Transporte']
  );
});

test('comando do seletor alterna entre incluir e excluir todas as categorias do ciclo', () => {
  const regras = dadosDoGrafico([]);

  assert.deepEqual(
    Array.from(regras.proximaExclusaoDasCategorias(['Casa', 'Lazer'], [])),
    ['Casa', 'Lazer']
  );
  assert.deepEqual(
    Array.from(regras.proximaExclusaoDasCategorias(['Casa', 'Lazer'], ['Casa', 'Outra'])),
    ['Outra']
  );
});

// O seletor de categorias do modal do gráfico: abrirGraficoGastos de verdade (carga e desenho reais, banco falso, Chart.js falso).
async function abrirGrafico(preparar = () => {}) {
  const l = (id, nome, data, valor, categ) => ({
    id,
    nome,
    data,
    valor,
    categ,
    cred: false,
    pago: true,
    fatura: null,
    freq: null,
  });

  const t = carregarTela({
    dados: {
      fin_ciclo: [{ id: 1, inicio: '2026-10-15', fim: null }],
      fin_meta: [],
      fin: [
        l(1, 'Salário', '2026-10-15', 9000, 'Salário'),
        l(2, 'Mercado', '2026-10-16', -300, 'Mercado'),
        l(3, 'Contador', '2026-10-16', -200, 'Contabilidade'),
      ],
    },
  });

  preparar(t);
  await t.bruto('carregarDados()');
  t.bruto('abrirGraficoGastos(0)');

  return { t, lista: t.ctx.document.getElementById('excluirCatDrop').innerHTML };
}

test('o seletor tem o comando de selecionar/desmarcar tudo e a categoria excluída por padrão continua reincluível', async () => {
  const { lista } = await abrirGrafico();

  // com Contabilidade fora, nem todas estão incluídas: o comando oferece selecionar tudo
  assert.match(
    lista,
    /<button type=button id=excluirCatTudo class=chip[^>]*>Selecionar tudo<\/button>/
  );
  // a lista traz todas as categorias do ciclo em chips da base: as incluídas ligadas e a excluída desligada (dá para reincluir)
  assert.match(
    lista,
    /<button type=button class=chip data-categoria="Mercado" aria-pressed="true" /
  );
  assert.match(
    lista,
    /<button type=button class=chip data-categoria="Contabilidade" aria-pressed="false" /
  );
});

// Tocar fora do seletor fecha as categorias antes de o gráfico tratar o gesto: os dois ouvintes reais de js/charts.js.
function tocarForaDoSeletor(evento, marcador, { dentro }) {
  let aberto = true;

  const { ouvinte } = ouvinteDe(
    'js/charts.js',
    marcador,
    (registra) => ({
      el: () => ({ addEventListener: registra }),
      mostraCategoriasDoGrafico: (abrir) => (aberto = abrir),
    }),
    { evento }
  );

  ouvinte({ target: { closest: () => (dentro ? {} : null) } });

  return aberto;
}

test('clique fora do seletor no modal fecha as categorias antes do gráfico tratar o gesto', () => {
  const pointerdown = "'pointerdown'";

  const clique =
    "if (!e.target.closest('#excluirCatWrap')) mostraCategoriasDoGrafico(false);\n});";

  assert.equal(tocarForaDoSeletor('pointerdown', pointerdown, { dentro: false }), false); // fechou
  assert.equal(tocarForaDoSeletor('pointerdown', pointerdown, { dentro: true }), true); // dentro do seletor: segue aberto
  assert.equal(tocarForaDoSeletor('click', clique, { dentro: false }), false);
  assert.equal(tocarForaDoSeletor('click', clique, { dentro: true }), true);
});

test('regra documentada em REGRAS.md', () => {
  assert.match(
    regrasMd,
    /`Contabilidade` \(`CATEGORIA_EXCLUIDA_GRAFICO_PADRAO` em `js\/domain\.js`\) já abre desmarcada por padrão/
  );
  assert.match(
    regrasMd,
    /é custo intrínseco ao próprio faturamento PJ, não um gasto discricionário, então a pizza mostra direto o líquido/
  );
  assert.match(
    regrasMd,
    /Fechar e abrir o modal restaura esse padrão \(só `Contabilidade` fora, as demais categorias de volta\)/
  );
});

test('fatia mantém as linhas reais para abrir seu detalhamento no recorte atual', () => {
  const regras = dadosDoGrafico([]);
  const linha = { id: 12, nome: 'Mercado', v: -100 };

  const agrupado = regras.agruparGastosDaPizza(
    [{ categorias: ['Casa'], valor: 100, linha }],
    []
  );

  assert.deepEqual({ ...agrupado.porCategoria }, { Casa: 100 });
  assert.deepEqual(Array.from(agrupado.linhasPorCategoria.Casa), [linha]);
});

// Seletor de categorias por função: abrirGraficoGastos de verdade num DOM falso que guarda o estado do que os scripts
// escrevem (hidden, aria-expanded, textContent) e lê os chips do innerHTML, cada um com o aria-pressed no próprio objeto.
async function abrirSeletor() {
  let drop, botao, chips;

  const { t } = await abrirGrafico((tela) => {
    const doc = tela.ctx.document;
    let html = '';

    drop = doc.getElementById('excluirCatDrop');
    botao = doc.getElementById('excluirCatBtn');
    botao.attrs = {};
    botao.setAttribute = (nome, valor) => (botao.attrs[nome] = valor);
    Object.defineProperty(drop, 'innerHTML', {
      get: () => html,
      set: (v) => {
        html = v;
        chips = null;
      },
    });
    drop.querySelectorAll = () =>
      (chips ??= etiquetas(html)
        .filter((e) => e.tag === 'button' && 'data-categoria' in e.attrs)
        .map((e) => {
          const attrs = { ...e.attrs };

          return {
            attrs,
            dataset: { categoria: attrs['data-categoria'] },
            setAttribute: (nome, valor) => (attrs[nome] = valor),
          };
        }));
  });

  return { t, drop, botao, tudo: t.ctx.document.getElementById('excluirCatTudo') };
}

// O toque no chip roda o próprio onclick que o app escreveu no HTML (com `this` = o chip)
function tocar(t, chip) {
  vm.runInContext(`(function(){ ${chip.attrs.onclick} })`, t.ctx).call({
    getAttribute: (nome) => chip.attrs[nome],
  });
}

const excluidas = (t) => Array.from(t.bruto('excluidasDoGrafico'));

const pressionados = (drop) =>
  Object.fromEntries(
    drop
      .querySelectorAll('[data-categoria]')
      .map((c) => [c.dataset.categoria, c.attrs['aria-pressed']])
  );

test('o resumo abre e fecha a lista de categorias e o aria-expanded acompanha', async () => {
  const { t, drop, botao } = await abrirSeletor();

  drop.hidden = true;
  botao.onclick();
  assert.equal(drop.hidden, false);
  assert.equal(botao.attrs['aria-expanded'], 'true');
  botao.onclick();
  assert.equal(drop.hidden, true);
  assert.equal(botao.attrs['aria-expanded'], 'false');
  t.bruto('mostraCategoriasDoGrafico(true)');
  assert.equal(drop.hidden, false);
  assert.equal(botao.attrs['aria-expanded'], 'true');
});

test('tocar num chip inverte o aria-pressed e inclui ou exclui a categoria (a exclusão fica no estado)', async () => {
  const { t, drop, botao } = await abrirSeletor();

  const chip = (nome) =>
    drop.querySelectorAll().find((c) => c.dataset.categoria === nome);

  // abre com só Contabilidade fora (padrão)
  assert.deepEqual(excluidas(t), ['Contabilidade']);
  assert.deepEqual(pressionados(drop), {
    Investimento: 'true',
    Mercado: 'true',
    Contabilidade: 'false',
  });

  tocar(t, chip('Mercado')); // ligado -> desliga: exclui
  assert.deepEqual(excluidas(t), ['Contabilidade', 'Mercado']);
  assert.deepEqual(pressionados(drop), {
    Investimento: 'true',
    Mercado: 'false',
    Contabilidade: 'false',
  });
  assert.equal(botao.textContent, '2 excluídas');

  tocar(t, chip('Contabilidade')); // desligado -> liga: reinclui
  assert.deepEqual(excluidas(t), ['Mercado']);
  assert.deepEqual(pressionados(drop), {
    Investimento: 'true',
    Mercado: 'false',
    Contabilidade: 'true',
  });
  assert.equal(botao.textContent, '1 excluída');
});

test('Selecionar tudo liga todos os chips e Desmarcar tudo desliga, com o texto do comando trocando', async () => {
  const { t, drop, botao, tudo } = await abrirSeletor();

  assert.equal(tudo.textContent, 'Selecionar tudo'); // há uma excluída
  t.ctx.alternarTodasCategoriasGrafico();
  assert.deepEqual(excluidas(t), []);
  assert.deepEqual(pressionados(drop), {
    Investimento: 'true',
    Mercado: 'true',
    Contabilidade: 'true',
  });
  assert.equal(tudo.textContent, 'Desmarcar tudo');
  assert.equal(botao.textContent, 'Nenhuma excluída');

  t.ctx.alternarTodasCategoriasGrafico();
  assert.deepEqual(excluidas(t).sort(), ['Contabilidade', 'Investimento', 'Mercado']);
  assert.deepEqual(pressionados(drop), {
    Investimento: 'false',
    Mercado: 'false',
    Contabilidade: 'false',
  });
  assert.equal(tudo.textContent, 'Selecionar tudo');
  assert.equal(botao.textContent, '3 excluídas');
});

test('o botão de resumo conta as categorias excluídas (nenhuma, uma, várias) pelo estado', async () => {
  const { t, botao } = await abrirSeletor();

  for (const [lista, texto] of [
    [[], 'Nenhuma excluída'],
    [['Mercado'], '1 excluída'],
    [['Mercado', 'Contabilidade'], '2 excluídas'],
  ]) {
    t.bruto(`excluidasDoGrafico = ${JSON.stringify(lista)}`);
    t.bruto('atualizaBotaoExcluirCat()');
    assert.equal(botao.textContent, texto);
  }
});

test('mostraCategoriasDoGrafico monta um chip por categoria do ciclo e o aria-pressed bate com o estado', async () => {
  const { t, drop } = await abrirSeletor();
  const html = drop.innerHTML;
  const chips = etiquetas(html).filter((e) => 'data-categoria' in e.attrs);

  assert.deepEqual(chips.map((c) => c.attrs['data-categoria']).sort(), [
    'Contabilidade',
    'Investimento',
    'Mercado',
  ]);
  assert.ok(chips.every((c) => c.attrs.class === 'chip' && c.tag === 'button'));
  assert.deepEqual(
    Object.fromEntries(
      chips.map((c) => [c.attrs['data-categoria'], c.attrs['aria-pressed']])
    ),
    { Investimento: 'true', Mercado: 'true', Contabilidade: 'false' }
  );
  assert.equal(t.bruto('excluidasDoGrafico').length, 1);
});
