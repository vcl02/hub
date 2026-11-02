// Regressão: débito em aberto e fatura sem pagar de um ciclo que já acabou (desde SALDO_DESDE)
// são atrasados: contam no ciclo de hoje (não no da data), aparecem na tabela dele com a marca
// e no aviso da faixa Hoje; pagar o débito traz a data pra hoje. Roda o código real de
// domain/shared/finance com hoje fixo.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { ouvinteDe } = require('./helpers/ouvintes');

const ler = (arquivo) => fs.readFileSync(arquivo, 'utf8');
const regras = ler('docs/REGRAS.md');

// Agosto e setembro já acabaram; outubro é o de hoje (28/10/2026); novembro vem depois.
const CICLOS = [
  { id: 'c:0', cicloId: 0, ini: '2026-08-05', fat: '2026-09-04' },
  { id: 'c:1', cicloId: 1, ini: '2026-09-05', fat: '2026-10-04' },
  { id: 'c:2', cicloId: 2, ini: '2026-10-05', fat: '2026-11-04' },
  { id: 'c:3', cicloId: 3, ini: '2026-11-05', fat: '2026-12-04' },
];

function carrega(crus, hoje = '2026-10-28') {
  const contexto = {
    Estado: {
      ciclos: CICLOS.map((c) => ({ ...c })),
      lancamentos: [],
      faturas: [],
      limitesPorCiclo: new Map(),
    },
    SALDO_DESDE: '2026-08-07',
    MESES: [],
    document: { getElementById: () => ({}) },
    setTimeout,
    clearTimeout,
  };

  vm.createContext(contexto);
  // hojeISO vira var pra o teste fixar o dia.
  vm.runInContext(ler('js/domain.js'), contexto);
  vm.runInContext(
    ler('js/shared.js').replace('const hojeISO = () =>', 'var hojeISO = () =>'),
    contexto
  );
  contexto.hojeISO = () => hoje;
  vm.runInContext(ler('js/finance.js'), contexto);
  contexto.Estado.lancamentos = crus.map((r) => ({
    ...r,
    v: +r.valor || 0,
    periodoIdx: contexto.periodoDoLancamento(r),
  }));

  return contexto;
}

const debito = (extra) => ({
  id: 1,
  nome: 'Contabilidade',
  categ: 'Contabilidade',
  valor: -350,
  cred: false,
  pago: false,
  data: '2026-09-20',
  fatura: null,
  ...extra,
});

test('débito em aberto de um ciclo que já acabou é atrasado e conta no ciclo de hoje', () => {
  const c = carrega([]);

  assert.equal(c.ehDebitoAtrasado(debito()), true);
  assert.equal(c.periodoDoLancamento(debito()), 2);

  // Não é atrasado: pago, status vazio, crédito, investimento, linha calculada, antes de
  // SALDO_DESDE, no ciclo de hoje ou depois, sem data.
  for (const extra of [
    { pago: true },
    { pago: null },
    { cred: true, fatura: '2026-09-12' },
    { categ: 'Investimento' },
    { _sid: 'fat:1' },
    { data: '2026-08-06' },
    { data: '2026-10-10' },
    { data: '2026-11-20' },
    { data: null },
  ]) {
    assert.equal(c.ehDebitoAtrasado(debito(extra)), false, JSON.stringify(extra));
  }

  assert.equal(c.periodoDoLancamento(debito({ pago: true })), 1);
});

test('fatura sem pagar de ciclo passado sai do ciclo dela e entra no de hoje; paga não', () => {
  const compra = {
    id: 2,
    nome: 'Mercado',
    categ: 'Alimentação',
    valor: -500,
    cred: true,
    pago: true,
    data: '2026-08-20',
    fatura: '2026-09-12',
  };

  let c = carrega([compra]);

  const base = c.Estado.lancamentos,
    abat = c.alocacaoAntecipacoes(base);

  assert.equal(c.faturasLiquidasDoCiclo(base, abat, 1).length, 0);
  const deHoje = c.faturasLiquidasDoCiclo(base, abat, 2);

  assert.equal(deHoje.length, 1);
  assert.equal(deHoje[0].liquido, -500);
  assert.equal(deHoje[0].atrasada, true);
  assert.equal(deHoje[0].cicloOrigem, 1);
  // Saldo: o mesmo total, só que no ciclo de hoje.
  assert.equal(
    c.totalBaseDoCiclo(1, base, abat, () => 0),
    0
  );
  assert.equal(
    c.totalBaseDoCiclo(2, base, abat, () => 0),
    -500
  );

  // Antecipação apontando pra ela (paga hoje): quitada, fica no ciclo dela, sem atrasada.
  const pagamento = {
    id: 3,
    nome: 'Pagamento fatura',
    categ: 'Antecipação Fatura',
    valor: -500,
    cred: false,
    pago: true,
    data: '2026-10-28',
    fatura: '2026-09-12',
  };

  c = carrega([compra, pagamento]);

  const base2 = c.Estado.lancamentos,
    abat2 = c.alocacaoAntecipacoes(base2);

  assert.equal(
    c.faturasLiquidasDoCiclo(base2, abat2, 2).filter((f) => f.atrasada).length,
    0
  );
  assert.equal(c.faturasLiquidasDoCiclo(base2, abat2, 1)[0].liquido, 0);
});

// O ciclo desenhado de verdade (carga e desenho reais, banco falso): a marca no nome e o aviso da faixa Hoje.
const lancamento = (id, nome, data, valor, extra = {}) => ({
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

const dadosDoCiclo = (...lancamentos) => ({
  fin_ciclo: [
    { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
    { id: 2, inicio: '2026-10-15', fim: null },
  ],
  fin: [
    lancamento(1, 'Salário', '2026-10-15', 9000, { categ: 'Salário' }),
    ...lancamentos,
  ],
  fin_meta: [],
});

// A faixa Hoje só aparece com o ciclo de hoje marcado (a carga completa da página faz isso; aqui, à mão).
async function desenharHoje(dados) {
  const t = carregarTela({ dados });

  await t.bruto('carregarDados()');
  t.bruto('Estado.idxHoje = 1');
  t.ctx.recolherBloco = () => {}; // vem de js/interactions.js, que a harness não carrega

  t.ctx.document.getElementById('ciclo').value = '1';

  return t.bruto('vCiclo()');
}

test('o débito atrasado ganha a marca Atrasado no nome e a faixa Hoje avisa; o pago não', async () => {
  const atrasado = await desenharHoje(
    dadosDoCiclo(lancamento(3, 'Luz', '2026-10-10', -150, { pago: false }))
  );

  assert.match(
    atrasado,
    /Luz<\/span> <span class=tagAviso title="Venceu em 10\/10\/2026, num ciclo que já acabou[^"]*">Atrasado<\/span>/
  );
  assert.match(
    atrasado,
    /<span class=resumoAtrasado title="[^"]*10\/10\/2026 Luz[^"]*">Atrasado <b class=vm>-R\$ 150,00<\/b> · 1<\/span>/
  );

  const pago = await desenharHoje(dadosDoCiclo(lancamento(3, 'Luz', '2026-10-10', -150)));

  assert.doesNotMatch(pago, /tagAviso|resumoAtrasado/);
});

test('o aviso Atrasado não entra no alinhamento das faixas Hoje e Futuro (só uma delas o tem)', () => {
  const elemento = (largura, classes = []) => ({
    style: {},
    children: [],
    classList: { contains: (c) => classes.includes(c) },
    getBoundingClientRect: () => ({ width: largura }),
    querySelectorAll: () => [],
  });

  const hoje = [elemento(200), elemento(100)];
  const aviso = elemento(150, ['resumoAtrasado']);
  const futuro = [elemento(180), elemento(120)];

  const inicio = ler('js/interactions.js').indexOf(
    'function alinharResumosDosTitulos() {'
  );

  const fonte = ler('js/interactions.js');

  const ctx = {
    el: () => ({
      querySelectorAll: (seletor) =>
        seletor == '.resumoTitulo'
          ? [
              {
                querySelectorAll: () => [
                  { children: [...hoje, aviso] },
                  { children: futuro },
                ],
              },
            ]
          : [],
    }),
    Math,
    alinharDivisoresDosIndicadores: () => {},
  };

  vm.runInNewContext(
    `${fonte.slice(inicio, fonte.indexOf('\n}\n', inicio) + 3)}\nalinharResumosDosTitulos();`,
    ctx
  );
  // Com o aviso fora da conta as duas faixas têm 2 itens e se igualam; contando o aviso, a função desistia de alinhar.
  assert.equal(futuro[0].style.minWidth, '200px');
  assert.equal(hoje[1].style.minWidth, '120px');
  assert.equal(aviso.style.minWidth, undefined);
});

test('pagar o atrasado traz a data pra hoje, sem perguntar', () => {
  const interacoes = ler('js/interactions.js');

  const corpo = interacoes.slice(
    interacoes.indexOf('const novoPago = !r.pago;'),
    interacoes.indexOf('badge.classList.toggle')
  );

  const confirmacoes = [];

  const contexto = {
    ehDebitoAtrasado: (r) => r.data === '2026-09-20',
    hojeISO: () => '2026-10-28',
    dataISO: (v) => v,
    dataBR: (v) => v,
    periodoDoDebito: () => -1,
    confirm: (msg) => {
      confirmacoes.push(msg);

      return true;
    },
  };

  vm.createContext(contexto);
  vm.runInContext(
    `function decide(r) {\n${corpo}\n    return { novoPago, novaData, dataDoAtraso };\n}\nglobalThis.decide = decide;`,
    contexto
  );

  const r = contexto.decide({
    pago: false,
    cred: false,
    data: '2026-09-20',
    nome: 'Contabilidade',
  });

  assert.equal(r.novaData, '2026-10-28');
  assert.equal(r.dataDoAtraso, '2026-09-20');
  assert.equal(confirmacoes.length, 0);
});

// O clique inteiro no selo Pago do atrasado: o PATCH leva a data de hoje e o toast diz a data antiga (para corrigir na célula).
async function clicarNoSelo({ linha, falhar = false }) {
  const toasts = [];
  const patches = [];

  const selo = {
    dataset: { togPago: String(linha.id) },
    classList: { toggle() {} },
    style: {},
  };

  const { ctx, ouvinte } = ouvinteDe('js/interactions.js', "closest('[data-tog-pago]')", {
    Estado: { lancamentos: [linha], simulando: false },
    togglesNoAr: new Set(),
    ehDebitoAtrasado: (r) => r.data < '2026-10-05',
    hojeISO: () => '2026-10-28',
    dataISO: (v) => v,
    dataBR: (v) => v.split('-').reverse().join('/'),
    periodoDoDebito: () => 2,
    confirm: () => true,
    atualizarLancamento: async (id, campos) => {
      if (falhar) throw Error('RLS');
      patches.push([id, { ...campos }]);
    },
    reclassificaPeriodo() {},
    desenhar() {},
    mostrarToast: (titulo, texto) => toasts.push([titulo, texto]),
  });

  await ouvinte({ target: { closest: () => selo }, stopImmediatePropagation() {} });

  return { patches, toasts, noAr: ctx.togglesNoAr.size };
}

test('pagar o atrasado: o PATCH leva a data de hoje e o toast avisa a data antiga', async () => {
  const linha = {
    id: 5,
    pago: false,
    cred: false,
    data: '2026-09-20',
    nome: 'Contabilidade',
  };

  const r = await clicarNoSelo({ linha });

  assert.deepEqual(r.patches, [[5, { pago: true, data: '2026-10-28' }]]);
  assert.deepEqual(r.toasts, [
    ['Atrasado pago hoje', 'A data passou de 20/09/2026 para hoje.'],
  ]);
  assert.equal(linha.data, '2026-10-28');
});

test('pagar o atrasado e o banco recusar: avisa a falha, não muda a linha e libera o selo', async () => {
  const linha = {
    id: 5,
    pago: false,
    cred: false,
    data: '2026-09-20',
    nome: 'Contabilidade',
  };

  const r = await clicarNoSelo({ linha, falhar: true });

  assert.deepEqual(r.toasts, [['Falhou ao atualizar', 'RLS']]);
  assert.equal(linha.pago, false);
  assert.equal(linha.data, '2026-09-20');
  assert.equal(r.noAr, 0);
});

test('regra documentada', () => {
  assert.match(regras, /### Atrasados/);
  assert.match(regras, /conta no ciclo de hoje/);
});
