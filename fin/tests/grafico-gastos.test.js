// Pizza de gastos: agrupa despesas reais e evita contar transferência de fatura duas vezes.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { ouvinteDe } = require('./helpers/ouvintes');

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
async function abrirGrafico() {
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

  await t.bruto('carregarDados()');
  t.bruto('abrirGraficoGastos(0)');

  return { t, lista: t.ctx.document.getElementById('excluirCatDrop').innerHTML };
}

test('o seletor tem o comando de selecionar/desmarcar tudo e a categoria excluída por padrão continua reincluível', async () => {
  const { lista } = await abrirGrafico();

  // com Contabilidade fora, nem todas estão incluídas: o comando oferece selecionar tudo
  assert.match(
    lista,
    /<button type=button id=excluirCatTudo class=multiSelAll[^>]*>Selecionar tudo<\/button>/
  );
  // a lista traz todas as categorias do ciclo: as incluídas marcadas e a excluída desmarcada (dá para reincluir)
  assert.match(lista, /<input type=checkbox value="Mercado" checked /);
  assert.match(lista, /<input type=checkbox value="Contabilidade" {2}onchange=/);
});

// Tocar fora do seletor fecha o dropdown antes de o gráfico tratar o gesto: os dois ouvintes reais de js/charts.js.
function tocarForaDoSeletor(evento, marcador, { dentro }) {
  let aberto = true;

  const { ouvinte } = ouvinteDe(
    'js/charts.js',
    marcador,
    (registra) => ({
      el: (id) =>
        id === 'excluirCatDrop'
          ? { classList: { remove: () => (aberto = false) } }
          : { addEventListener: registra },
    }),
    { evento }
  );

  ouvinte({ target: { closest: () => (dentro ? {} : null) } });

  return aberto;
}

test('clique fora do seletor no modal fecha o dropdown antes do gráfico tratar o gesto', () => {
  const pointerdown = "'pointerdown'";
  const clique = "if (!e.target.closest('#excluirCatWrap')) el('excluirCatDrop')";

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
