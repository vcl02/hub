// Regressão: do ciclo atual em diante, Besteira e Isabella contam como se o teto do ciclo
// fosse gasto por inteiro — uma compra sintética EM ABERTO no Crédito (Nubank, fatura do
// ciclo seguinte) completa o que falta até 100% e entra na fatura, no saldo e no Futuro. O teto é individual por ciclo, gravado na linha âncora
// do ciclo em fin_ciclo (migrations 25/26). Roda o código real de domain/shared/finance + a regra de
// categorias de charts.js.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { extrairTrecho } = require('./helpers/carregar-funcoes');

const ler = (arquivo) => fs.readFileSync(arquivo, 'utf8');
const graficos = ler('js/charts.js');
const interacoes = ler('js/interactions.js');
const regras = ler('docs/REGRAS.md');
const migration = ler('migrations/23-limites-categoria-por-ciclo.sql');

// Três ciclos: setembro (passado), outubro (atual) e novembro (futuro).
const CICLOS = [
  { id: 'c:1', cicloId: 1, ini: '2026-09-05', fat: '2026-10-04' },
  { id: 'c:2', cicloId: 2, ini: '2026-10-05', fat: '2026-11-04' },
  { id: 'c:3', cicloId: 3, ini: '2026-11-05', fat: '2026-12-04' },
];

function carrega(lancamentos, idxHoje = 1, ciclos = CICLOS) {
  const estado = {
    idxHoje,
    ciclos: ciclos.map((c) => ({ ...c })),
    faturas: [],
    lancamentos,
    // fin_ciclo: cada "ciclo" abaixo (ids 1..3) carrega os limite_* da linha da tabela.
    limitesPorCiclo: new Map(
      lancamentos.filter((l) => l.nome === 'Ciclo').map((l) => [l.id, { ...l }])
    ),
  };

  const contexto = {
    Estado: estado,
    SALDO_DESDE: '2026-01-01',
    MESES: [],
    document: { getElementById: () => ({}) },
    setTimeout,
    clearTimeout,
  };

  vm.createContext(contexto);
  ['js/domain.js', 'js/shared.js', 'js/finance.js'].forEach((arquivo) =>
    vm.runInContext(ler(arquivo), contexto)
  );
  const inicio = graficos.indexOf('// Base do percentual');
  const fim = graficos.indexOf('function dadosCompromissosCiclo(');

  vm.runInContext(graficos.slice(inicio, fim), contexto);
  vm.runInContext(
    'globalThis.r = { previstasDoCiclo, limitesCategoriaDoCiclo, totalBaseDoCiclo, lancamentosComPrevistas, previstasDosTetos, limparCachesFinanceiros };',
    contexto
  );

  return contexto.r;
}

// Linhas de fin_ciclo (marcadas "Ciclo" só pra montar o Map acima; v: 0 não altera conta).
const linhasCiclo = [
  { id: 1, nome: 'Ciclo', data: '2026-09-05', v: 0, periodoIdx: 0 },
  { id: 2, nome: 'Ciclo', data: '2026-10-05', v: 0, periodoIdx: 1 },
  { id: 3, nome: 'Ciclo', data: '2026-11-05', v: 0, periodoIdx: 2 },
];

const resumo = (linhas) =>
  JSON.parse(JSON.stringify(linhas.map((l) => [l.nome, l.categ, l.v, l.data])));

test('ciclo sem lançamento: compras previstas em aberto no Crédito, com o teto inteiro, na fatura Nubank do ciclo seguinte', () => {
  const r = carrega([...linhasCiclo]);
  const [besteira, isabella] = r.previstasDoCiclo(1, [...linhasCiclo]);

  assert.deepEqual(resumo([besteira, isabella]), [
    ['Besteira prevista', 'Besteira', -250, '2026-11-04'],
    ['Isabella prevista', 'Lazer, Isabella', -700, '2026-11-04'],
  ]);
  // Crédito, em aberto (não ocupa limite de Hoje), na prévia: fatura do ciclo 2 (05/11 a 04/12).
  assert.equal(besteira.cred, true);
  assert.equal(besteira.pago, false);
  assert.equal(besteira.fatura, '2026-11-12');
  assert.equal(besteira.periodoIdx, 2);
});

test('fatura cai no 1º dia 12 dentro do ciclo seguinte; último ciclo (sem seguinte) não prevê', () => {
  const r = carrega([...linhasCiclo]);

  // O ciclo 2 é o último aqui: não há ciclo 3 pra fatura cair.
  assert.equal(r.previstasDoCiclo(2, [...linhasCiclo]).length, 0);

  // Ciclo seguinte começando depois do dia 12: a fatura é a do dia 12 do mês seguinte.
  const tardio = carrega([...linhasCiclo], 1, [
    CICLOS[0],
    { ...CICLOS[1], fat: '2026-11-19' },
    { ...CICLOS[2], ini: '2026-11-20', fat: '2026-12-19' },
  ]);

  assert.equal(tardio.previstasDoCiclo(1, [...linhasCiclo])[0].fatura, '2026-12-12');
});

test('completa só o que falta até 100% (pago ou aberto), e some quando já passou do teto', () => {
  const base = [
    ...linhasCiclo,
    {
      id: 10,
      nome: 'Café',
      categ: 'Besteira',
      v: -100,
      pago: true,
      cred: false,
      periodoIdx: 1,
    },
    {
      id: 11,
      nome: 'Lanche',
      categ: 'Besteira',
      v: -50,
      pago: false,
      cred: false,
      periodoIdx: 1,
    },
    {
      id: 12,
      nome: 'Cinema',
      categ: 'Lazer, Isabella',
      v: -800,
      pago: true,
      cred: false,
      periodoIdx: 1,
    },
    // Isabella sozinha não conta no teto dela (regra existente).
    {
      id: 13,
      nome: 'Presente',
      categ: 'Isabella',
      v: -300,
      pago: true,
      cred: false,
      periodoIdx: 1,
    },
  ];

  const r = carrega(base);

  assert.deepEqual(resumo(r.previstasDoCiclo(1, base)), [
    ['Besteira prevista', 'Besteira', -100, '2026-11-04'],
  ]);
});

test('crédito conta pela prévia (fatura do ciclo seguinte), como o indicador', () => {
  const base = [
    ...linhasCiclo,
    {
      id: 20,
      nome: 'Café',
      categ: 'Besteira',
      v: -60,
      pago: true,
      cred: true,
      periodoIdx: 2,
    }, // fatura de novembro
  ];

  const r = carrega(base);

  assert.equal(r.previstasDoCiclo(1, base)[0].v, -190); // outubro: 250 − 60 da prévia
});

test('ciclo passado não ganha previsão', () => {
  const r = carrega([...linhasCiclo]);

  assert.equal(r.previstasDoCiclo(0, [...linhasCiclo]).length, 0);
});

test('teto individual por ciclo, salvo em fin_ciclo; vazio volta ao padrão', () => {
  const base = [
    { ...linhasCiclo[0] },
    { ...linhasCiclo[1], limite_besteira: 400, limite_isabella: '0' },
    { ...linhasCiclo[2], limite_besteira: null },
  ];

  const r = carrega(base);

  assert.deepEqual({ ...r.limitesCategoriaDoCiclo(1) }, { besteira: 400, isabella: 0 });
  assert.deepEqual({ ...r.limitesCategoriaDoCiclo(2) }, { besteira: 250, isabella: 700 });
  // Teto zero: nada previsto pra Isabella naquele ciclo.
  assert.deepEqual(resumo(r.previstasDoCiclo(1, base)), [
    ['Besteira prevista', 'Besteira', -400, '2026-11-04'],
  ]);
});

test('a base dos cálculos (filtrarLancamentos) inclui as previstas, montada uma vez por desenho', () => {
  const r = carrega([...linhasCiclo]);
  const base = r.lancamentosComPrevistas();

  assert.equal(base.filter((l) => l._prev).length, 2); // ciclo atual (1); o 2 é o último
  assert.equal(r.lancamentosComPrevistas(), base); // mesma lista até limpar os caches
  r.limparCachesFinanceiros();
  assert.notEqual(r.lancamentosComPrevistas(), base);
  // Pela fatura do ciclo seguinte, o saldo desse ciclo já sente as previstas: 0 − 250 − 700.
  assert.equal(
    r.totalBaseDoCiclo(2, r.lancamentosComPrevistas(), {}, () => 0),
    -950
  );
});

// Três ciclos com o 2º no meio (hoje): as previstas do ciclo 2 caem no 3º. Com os tetos zerados não há previstas.
const lanc = (id, nome, data, valor, extra = {}) => ({
  id,
  nome,
  data,
  valor,
  categ: 'Casa',
  cred: false,
  pago: true,
  fatura: null,
  freq: null,
  ...extra,
});

const dadosTresCiclos = (tetos = {}, extra = {}) => ({
  fin_ciclo: [
    { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
    { id: 2, inicio: '2026-10-15', fim: '2026-11-14', ...tetos },
    { id: 3, inicio: '2026-11-15', fim: null },
  ],
  fin: [
    lanc(1, 'Faturamento', '2026-09-15', 10000, { categ: 'Renda' }),
    lanc(2, 'Aluguel', '2026-09-16', -1000, { reserva: true, ...extra }),
    lanc(3, 'Faturamento', '2026-10-15', 10000, { categ: 'Renda' }),
    lanc(4, 'Aluguel', '2026-10-16', -1000, { reserva: true, ...extra }),
    lanc(5, 'Faturamento', '2026-11-15', 10000, { categ: 'Renda' }),
    lanc(6, 'Aluguel', '2026-11-16', -1000, { reserva: true, ...extra }),
  ],
  fin_meta: [],
});

async function telaTresCiclos(tetos, extra) {
  const tela = carregarTela({ dados: dadosTresCiclos(tetos, extra) });

  await tela.bruto('carregarDados()');
  tela.bruto('Estado.idxHoje = 1');
  tela.ctx.recolherBloco = () => {}; // vem de js/interactions.js, fora da tela sem navegador

  return tela;
}

const SEM_TETOS = { limite_besteira: 0, limite_isabella: 0 };

test('tabelas e cálculos usam a mesma base (com as previstas), montada uma vez por desenho', async () => {
  const tela = await telaTresCiclos();

  assert.equal(tela.bruto('filtrarLancamentos() === lancamentosComPrevistas()'), true);
  assert.deepEqual(
    tela.rodar('filtrarLancamentos().filter(l => l._prev).map(l => l._sid)'),
    ['prev:besteira:1', 'prev:isabella:1']
  );
  // Cache: a mesma lista até limparCachesFinanceiros, que força montar de novo.
  assert.deepEqual(
    tela.rodar(
      '(() => { const a = lancamentosComPrevistas(); const b = lancamentosComPrevistas(); limparCachesFinanceiros(); const c = lancamentosComPrevistas(); return [a === b, a === c, a.length === c.length]; })()'
    ),
    [true, false, true]
  );
  // Linha calculada é a que tem prefixo (fat, cp, sal, res, sug, abt, prev); o resto é real.
  assert.deepEqual(
    tela.rodar(
      "['fat:1', 'cp:2', 'sal:3', 'res:4', 'sug:5', 'abt:6', 'prev:besteira:1', 'x:1', 'fatura'].map(s => PREFIXO_LINHA_SINTETICA.test(s))"
    ),
    [true, true, true, true, true, true, true, false, false]
  );
});

// Trecho real de js/interactions.js (numeroDoLimiteDigitado, colunaDoCampoDeLimite e
// confirmarLimiteDoCiclo) com os globais de que depende simulados: o teste confere o que
// ele grava e mostra.
function carregaConfirmacaoDoLimite({ simulando = false, falhaAoSalvar = false } = {}) {
  const numero = extrairTrecho(
    interacoes,
    'function numeroDoLimiteDigitado(',
    '\nrestaurarLimiteCartaoLocal();'
  );

  const confirmacao = extrairTrecho(
    interacoes,
    'function colunaDoCampoDeLimite(',
    '// redesenha a tela conforme o modo ativo'
  );

  const registro = { salvas: [], toasts: [], desenhos: 0 };

  const contexto = {
    CARTAO_MERCADO_PAGO: 'mp',
    Estado: {
      simulando,
      ciclos: [{ cicloId: 7 }, { cicloId: 8 }],
      limitesPorCiclo: new Map([[7, { id: 7, limite_besteira: 250 }]]),
    },
    salvarLimiteDoCiclo: async (cicloId, campo, valor) => {
      if (falhaAoSalvar) throw Error('sem rede');
      registro.salvas.push([cicloId, campo, valor]);

      return { id: cicloId, [campo]: valor };
    },
    mostrarToast: (titulo, texto) => registro.toasts.push([titulo, texto]),
    desenhar: () => registro.desenhos++,
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${numero}\n${confirmacao}\nglobalThis.f = { colunaDoCampoDeLimite, confirmarLimiteDoCiclo };`,
    contexto
  );

  return { ...contexto.f, registro, Estado: contexto.Estado };
}

const campoDeLimite = (valor, dataset = { limiteCategoria: 'besteira', ciclo: '0' }) => ({
  value: valor,
  dataset,
  disabled: false,
});

test('teto editável no título de cada ciclo: coluna certa, grava em fin_ciclo, vazio = padrão', async () => {
  const c = carregaConfirmacaoDoLimite();

  assert.deepEqual(
    [
      { limiteCategoria: 'besteira' },
      { limiteCategoria: 'isabella' },
      { garantiaCartao: '' },
      { limiteCartao: 'mp' },
      { limiteCartao: 'nu' },
    ].map((dataset) => c.colunaDoCampoDeLimite({ dataset })),
    [
      'limite_besteira',
      'limite_isabella',
      'limite_garantia_nubank',
      'limite_aprovado_mp',
      'limite_aprovado_nubank',
    ]
  );

  // Valor digitado vai arredondado a 2 casas para o ciclo do campo (cicloId, não o índice).
  await c.confirmarLimiteDoCiclo(
    campoDeLimite('300,456', { limiteCategoria: 'isabella', ciclo: '1' })
  );
  assert.deepEqual(c.registro.salvas, [[8, 'limite_isabella', 300.46]]);
  assert.equal(c.Estado.limitesPorCiclo.get(8).limite_isabella, 300.46);
  assert.equal(c.registro.desenhos, 1);

  // Vazio grava null (volta ao padrão do código).
  await c.confirmarLimiteDoCiclo(campoDeLimite(''));
  assert.deepEqual(c.registro.salvas[1], [7, 'limite_besteira', null]);
  assert.equal(c.Estado.limitesPorCiclo.get(7).limite_besteira, null);
});

test('teto editável: igual ao salvo, inválido, ciclo inexistente, simulação e falha de rede não gravam no banco', async () => {
  const igual = carregaConfirmacaoDoLimite();

  await igual.confirmarLimiteDoCiclo(campoDeLimite('250,00'));
  assert.deepEqual([igual.registro.salvas, igual.registro.toasts], [[], []]);
  assert.equal(igual.registro.desenhos, 1);

  const invalido = carregaConfirmacaoDoLimite();

  await invalido.confirmarLimiteDoCiclo(campoDeLimite('abc'));
  await invalido.confirmarLimiteDoCiclo(campoDeLimite('-5'));
  assert.deepEqual(invalido.registro.salvas, []);
  assert.deepEqual(
    invalido.registro.toasts.map((t) => t[0]),
    ['Limite inválido', 'Limite inválido']
  );

  const semCiclo = carregaConfirmacaoDoLimite();

  await semCiclo.confirmarLimiteDoCiclo(
    campoDeLimite('100', { limiteCategoria: 'besteira', ciclo: '9' })
  );
  assert.deepEqual(semCiclo.registro.salvas, []);
  assert.equal(semCiclo.registro.toasts[0][0], 'Limite não salvo');

  // Simulação só altera a memória, como qualquer outra edição.
  const simulado = carregaConfirmacaoDoLimite({ simulando: true });

  await simulado.confirmarLimiteDoCiclo(campoDeLimite('400'));
  assert.deepEqual(simulado.registro.salvas, []);
  assert.deepEqual(JSON.parse(JSON.stringify(simulado.Estado.limitesPorCiclo.get(7))), {
    id: 7,
    limite_besteira: 400,
  });

  const caiu = carregaConfirmacaoDoLimite({ falhaAoSalvar: true });

  await caiu.confirmarLimiteDoCiclo(campoDeLimite('400'));
  assert.deepEqual(caiu.registro.toasts, [['Falhou ao salvar limite', 'sem rede']]);
  assert.equal(caiu.Estado.limitesPorCiclo.get(7).limite_besteira, 250);
});

test('migration 23 só adiciona colunas nulas e não negativas na própria fin', () => {
  assert.match(migration, /add column if not exists limite_besteira numeric\(12, 2\);/);
  assert.match(migration, /add column if not exists limite_isabella numeric\(12, 2\);/);
  assert.match(migration, /check \(limite_besteira is null or limite_besteira >= 0\)/);
  assert.match(migration, /check \(limite_isabella is null or limite_isabella >= 0\)/);
  assert.doesNotMatch(migration, /^\s*(create table|create policy|grant)\b/im);
});

test('regra documentada em REGRAS.md', () => {
  assert.match(
    regras,
    /Do ciclo atual em diante, Besteira e Isabella contam como se o teto do ciclo fosse gasto por inteiro/
  );
  assert.match(
    regras,
    /cada ciclo ganha compras sintéticas \*\*no Crédito, em aberto\*\*/
  );
  assert.match(regras, /por estarem em aberto, nunca ocupam o limite de \*\*Hoje\*\*/);
  assert.match(regras, /`migrations\/23-limites-categoria-por-ciclo\.sql`/);
});

test('previstas e faturas: Mensal, Aberto e Pra sempre só na exibição (Comprometido só nas faturas), somente leitura, ids distintos', async () => {
  const r = carrega([...linhasCiclo]);
  const [besteira, isabella] = r.previstasDoCiclo(1, [...linhasCiclo]);

  assert.deepEqual(
    [
      besteira.freq,
      besteira.pago,
      besteira.comprometido,
      besteira.pra_sempre,
      besteira.id,
      isabella.id,
      isabella.pra_sempre,
    ],
    ['Mensal', false, false, true, -6, -7, true]
  );
  assert.equal(isabella.comprometido, false);

  // Nenhum cálculo lê pra_sempre: só a coluna e o filtro por clique dela. Marcar todas as
  // linhas como "pra sempre" não muda a base nem os indicadores.
  const calculos = async (extra) => {
    const tela = await telaTresCiclos(undefined, extra);

    tela.bruto('atualizarIndicadoresFinanceiros(2)');
    const caixa = (id) => tela.ctx.document.getElementById(id);

    return {
      indicadores: [
        'indicadorReserva',
        'indicadorComprometido',
        'indicadorProporcaoReserva',
        'indicadorLiberdade',
      ].map((id) => [caixa(id).innerHTML, caixa(id).title]),
      base: tela.rodar(
        'lancamentosComPrevistas().map(l => [l.id, l.v, l.periodoIdx, l.cred, l.pago])'
      ),
    };
  };

  assert.deepEqual(await calculos({ pra_sempre: true }), await calculos({}));

  // Pago clicável só em lançamento real; linha calculada mostra texto (e, marcado, na
  // mesma cor das linhas reais: ver celulas-tabela.test.js).
  const tela = await telaTresCiclos();

  const celulas = (linha) =>
    tela.bruto(`celulasDaLinha(${JSON.stringify(linha)}, 'debito')`);

  const real = lanc(4, 'Aluguel', '2026-10-16', -1000, { v: -1000, categ: 'Casa' });
  const prevista = tela.rodar('lancamentosComPrevistas().find(l => l._prev)');

  assert.match(celulas(real), /class="vd togPago" data-tog-pago="4"/);
  assert.doesNotMatch(celulas(prevista), /togPago/);
  assert.match(celulas(prevista), /<span class="vm">Aberto<\/span>/);
  assert.match(
    regras,
    /Mostram Frequência \*\*Mensal\*\*, Pago \*\*Aberto\*\* e \*\*Pra sempre\*\*/
  );
  assert.match(regras, /as previstas não são Comprometido/);
});

test('indicadores Gastos e Liberdade contam as previstas como compras de verdade; o Comprometido não', async () => {
  const r = carrega([...linhasCiclo]);

  assert.equal(
    r
      .previstasDosTetos()
      .map((l) => l._sid)
      .join(),
    'prev:besteira:1,prev:isabella:1'
  );

  const indicadores = async (tetos) => {
    const tela = await telaTresCiclos(tetos);

    tela.bruto('atualizarIndicadoresFinanceiros(2)');
    const caixa = (id) => tela.ctx.document.getElementById(id);

    return Object.fromEntries(
      ['Reserva', 'Comprometido', 'ProporcaoReserva', 'Liberdade'].map((nome) => [
        nome,
        caixa(`indicador${nome}`).title.replaceAll(String.fromCharCode(0xa0), ' '),
      ])
    );
  };

  const com = await indicadores({});
  const sem = await indicadores(SEM_TETOS);

  // Gastos: as previstas (R$ 250 + R$ 700) entram no total do ciclo; só a Reserva real conta como Reserva.
  assert.equal(
    sem.ProporcaoReserva,
    'Reserva R$ 1.000,00 de R$ 1.000,00 em gastos; demais R$ 0,00'
  );
  assert.equal(
    com.ProporcaoReserva,
    'Reserva R$ 1.000,00 de R$ 1.950,00 em gastos; demais R$ 950,00'
  );
  // Liberdade: a média de gasto por ciclo sobe com elas.
  assert.match(sem.Liberdade, /média R\$ 1\.000,00\/mês em 3 ciclos/);
  assert.match(com.Liberdade, /média R\$ 1\.316,67\/mês em 3 ciclos/);
  // Comprometido segue só com o que é real (lançamentos e plano das metas).
  assert.equal(com.Comprometido, sem.Comprometido);
  assert.match(
    regras,
    /contam como gasto nos indicadores \*\*Gastos\*\* e \*\*Liberdade\*\*/
  );
});
