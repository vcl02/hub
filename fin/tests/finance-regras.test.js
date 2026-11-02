// Regras puras de saldo, aporte/resgate e prévia de Crédito executadas sem banco.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { declaracoes } = require('./helpers/regras-css');

const fonte = fs.readFileSync('js/finance.js', 'utf8');
const inicio = fonte.indexOf('function totalBaseDoCiclo(');
const fim = fonte.indexOf('\n// Linha sintetica de Resgate', inicio);
const trechoCredito = fonte.slice(fonte.indexOf('function creditosExibidosNoCiclo('));

if (inicio < 0 || fim < 0) throw Error('Não encontrou as regras centrais de saldo.');

function regrasFinanceiras(ciclos) {
  const contexto = {
    Estado: { ciclos },
    SALDO_DESDE: '2026-01-01',
    CATEGORIA_INVESTIMENTO: 'Investimento',
    LIMITE_CARTAO: 3750,
    TOLERANCIA_FINANCEIRA: 0.005,
    CARTAO_NUBANK: 'nubank',
    CARTAO_MERCADO_PAGO: 'mp',
    LIMITE_CARTAO_MP: 1100,
    // Linhas destes testes não têm fatura: são todas do Nubank, como antes do 2º cartão.
    cartaoDaFatura: () => 'nubank',
    dataISO: (valor) => String(valor).slice(0, 10),
    hojeISO: () => '2026-09-26',
    // Fatura por ciclo como antes (sem atrasada, que tem testes próprios): compras + antecipações.
    faturasLiquidasDoCiclo: (base, abat, idx) => {
      const bruto = base
        .filter((r) => r.cred && r.periodoIdx === idx)
        .reduce((s, r) => s + r.v, 0);

      return bruto ? [{ liquido: bruto + (abat[idx] || 0) }] : [];
    },
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${fonte.slice(inicio, fim)}\n${fonte.slice(fonte.indexOf('function ajusteInvestimento('), fonte.indexOf('\n// Total do bloco Debito', fonte.indexOf('function ajusteInvestimento(')))}\n${trechoCredito}\nglobalThis.regras = { totalBaseDoCiclo, ajusteInvestimento, creditosExibidosNoCiclo, totalCreditoExibidoAposAntecipacoes, lancamentosPagos, resumoDebitoPago, guardadoGarantidoAte, guardadoRealAte, limiteCartaoOcupado, limiteCartaoTotal, limiteCartaoLivre, limiteCartaoLivreFuturo };`,
    contexto
  );

  return contexto.regras;
}

test('aporte sugerido absorve somente saldo positivo acima da tolerância', () => {
  const r = regrasFinanceiras([{ fat: '2026-09-30' }]);

  assert.deepEqual(
    { ...r.ajusteInvestimento(300) },
    { tipo: 'aporte', nome: 'Aporte sugerido', categ: 'Investimento', v: -300 }
  );
  assert.equal(r.ajusteInvestimento(0.005), null);
  assert.equal(r.ajusteInvestimento(-0.005), null);
});

test('resgate necessário respeita o patrimônio disponível', () => {
  const r = regrasFinanceiras([{ fat: '2026-09-30' }]);

  // Déficit maior que o guardado: resgata tudo o que há e marca "Resgatou tudo".
  assert.deepEqual(
    { ...r.ajusteInvestimento(-300, 120) },
    {
      tipo: 'resgate',
      nome: 'Resgate necessário',
      categ: 'Investimento',
      v: 120,
      resgatouTudo: true,
    }
  );
  // Guardado cobre o déficit: resgate comum, sem aviso.
  assert.deepEqual(
    { ...r.ajusteInvestimento(-100, 120) },
    { tipo: 'resgate', nome: 'Resgate necessário', categ: 'Investimento', v: 100 }
  );
  assert.equal(r.ajusteInvestimento(-300, 0), null);
});

test('guardado nunca fica negativo: resgate real acima do guardado é diminuído até zerar', () => {
  const r = regrasFinanceiras([{ fat: '2026-09-30' }]);

  // Resgates reais do ciclo levaram R$ 20 a mais do que havia: ajuste de -20 (diminui o
  // resgate), com aviso — vale com déficit, com saldo zero e com sobra menor que o rombo.
  for (const totalBase of [-300, 0, 15]) {
    assert.deepEqual(
      { ...r.ajusteInvestimento(totalBase, -20) },
      {
        tipo: 'resgate',
        nome: 'Resgate necessário',
        categ: 'Investimento',
        v: -20,
        resgatouTudo: true,
      }
    );
  }

  // Sobra do ciclo maior que o rombo: Aporte sugerido comum, que já cobre o rombo.
  assert.deepEqual(
    { ...r.ajusteInvestimento(50, -20) },
    { tipo: 'aporte', nome: 'Aporte sugerido', categ: 'Investimento', v: -50 }
  );
});

test('saldo base carrega o anterior, débito e fatura líquida de antecipação', () => {
  const r = regrasFinanceiras([{ fat: '2026-09-30' }, { fat: '2026-10-31' }]);

  const base = [
    { periodoIdx: 1, cred: false, v: 50 },
    { periodoIdx: 1, cred: true, v: -200 },
  ];

  assert.equal(
    r.totalBaseDoCiclo(1, base, { 1: 80 }, () => 30),
    -40
  );
});

test('saldo diário inclui pagamento antecipado na data e deixa a fatura futura líquida', () => {
  // A antecipação é débito real da conta; o abatimento já reduz a fatura sintética futura.
  // Débito atrasado sai hoje (ver atrasados.test.js); os demais, na própria data.
  const r = regrasFinanceiras([{ fat: '2026-09-30' }]);

  assert.equal(
    r.totalBaseDoCiclo(
      0,
      [
        { periodoIdx: 0, cred: false, v: -114 },
        { periodoIdx: 0, cred: true, v: -500 },
      ],
      { 0: 114 },
      () => 0
    ),
    -500
  );
});

test('saldo diário alternativo recalcula eventos e ajustes só com a categoria não excluída', () => {
  const contexto = {
    Estado: {
      ciclos: [{ fat: '2026-01-01' }],
      lancamentos: [],
    },
    SALDO_DESDE: '2026-01-01',
    SALDO_INICIAL: 0,
    CATEGORIA_INVESTIMENTO: 'Investimento',
    TOLERANCIA_FINANCEIRA: 0.005,
    dataISO: (valor) => String(valor).slice(0, 10),
    alocacaoAntecipacoes: () => ({}),
    faturasLiquidasDoCiclo: () => [],
    ehDebitoAtrasado: () => false,
    hojeISO: () => '2026-01-01',
    filtrarLancamentos: () => contexto.Estado.lancamentos,
  };

  vm.createContext(contexto);
  vm.runInContext(`${fonte}\nglobalThis.regras = { saldoPorDia };`, contexto);

  const base = [
    { data: '2026-01-05', periodoIdx: 0, cred: false, categ: 'Casa', v: -100 },
    { data: '2026-01-05', periodoIdx: 0, cred: false, categ: 'Investimento', v: -70 },
  ];

  assert.equal(contexto.regras.saldoPorDia(base)['2026-01-05'], -170);
  assert.equal(
    contexto.regras.saldoPorDia(base.filter((r) => r.categ != 'Investimento'))[
      '2026-01-05'
    ],
    -100
  );
});

test('saldo base não usa ciclos anteriores ao marco de saldo', () => {
  const r = regrasFinanceiras([{ fat: '2025-12-31' }]);

  assert.equal(
    r.totalBaseDoCiclo(0, [{ periodoIdx: 0, cred: false, v: 999 }], {}, () => 0),
    0
  );
  assert.equal(
    r.totalBaseDoCiclo(-1, [], {}, () => 0),
    0
  );
});

test('crédito é visualmente deslocado, mas o total respeita antecipação', () => {
  const r = regrasFinanceiras([{ fat: '2026-09-30' }, { fat: '2026-10-31' }]);

  const linhas = [
    { id: 1, cred: true, periodoIdx: 0, v: -90 },
    { id: 2, cred: true, periodoIdx: 1, v: -120 },
  ];

  assert.deepEqual(
    Array.from(r.creditosExibidosNoCiclo(linhas, 0)).map((x) => x.id),
    [2]
  );
  assert.equal(r.totalCreditoExibidoAposAntecipacoes([{ v: -120 }, { v: -30 }], 70), -80);
  assert.equal(r.totalCreditoExibidoAposAntecipacoes([], 0), 0);
});

test('resumo de hoje ignora abertos mas inclui pagos de qualquer data, e separa saldo de guardado', () => {
  // "Hoje" não olha mais a data do lançamento: só pago = true decide. A linha de
  // 2026-09-27 (depois do hojeISO '2026-09-26' do contexto) entra porque está paga;
  // só a de pago: false (2026-09-22) fica de fora.
  const r = regrasFinanceiras([]);

  const linhas = [
    { data: '2025-12-31', pago: true, cred: false, inv: true, v: -900 },
    { data: '2026-09-20', pago: true, cred: false, v: 1000 },
    { data: '2026-09-21', pago: true, cred: false, inv: true, v: -560 },
    { data: '2026-09-22', pago: false, cred: false, v: -200 },
    { data: '2026-09-27', pago: true, cred: false, v: -300 },
    { data: '2026-09-23', pago: true, cred: true, v: -90 },
  ];

  assert.deepEqual(
    Array.from(r.lancamentosPagos(linhas)).map((linha) => linha.v),
    [-900, 1000, -560, -300, -90]
  );
  assert.deepEqual({ ...r.resumoDebitoPago(linhas) }, { saldo: 140, guardado: 560 });
});

test('limite considera só crédito confirmado, antecipação, garantia e quitação projetada', () => {
  const r = regrasFinanceiras([]);

  const linhas = [
    { cred: true, pago: false, periodoIdx: 0, v: -500 }, // projeção: não ocupa
    { cred: true, pago: true, periodoIdx: 0, v: -300 },
    { cred: true, pago: true, periodoIdx: 1, v: -450 },
  ];

  const abatido = { 0: 100, 1: 450 };

  assert.equal(r.limiteCartaoOcupado(linhas, abatido), 200);
  assert.equal(r.limiteCartaoLivre(linhas, abatido), 3550);
  assert.equal(r.limiteCartaoTotal(600), 4350);
  assert.equal(r.limiteCartaoLivre(linhas, abatido, 600), 4150);
  assert.equal(r.limiteCartaoTotal(-600), 3750);
  // A prévia do próximo ciclo assume as faturas até o ciclo atual quitadas; o crédito
  // confirmado da próxima fatura continua ocupando limite.
  assert.equal(r.limiteCartaoOcupado(linhas, abatido, 0), 0);
  assert.equal(r.limiteCartaoLivre(linhas, abatido, 0, 0), 3750);
});

test('Livre Futuro quita só faturas anteriores e preserva compras confirmadas posteriores', () => {
  const r = regrasFinanceiras([]);

  const linhas = [
    { cred: true, pago: true, periodoIdx: 0, v: -600 },
    { cred: true, pago: true, periodoIdx: 1, v: -450 },
    { cred: true, pago: true, periodoIdx: 2, v: -250 },
  ];

  assert.equal(r.limiteCartaoOcupado(linhas), 1300);
  // Ao projetar a fatura do ciclo 1, a fatura do ciclo 0 já foi quitada.
  assert.equal(r.limiteCartaoOcupado(linhas, {}, 0), 700);
  assert.equal(r.limiteCartaoLivre(linhas, {}, 0, 0), 3050);
});

test('Livre Futuro subtrai a fatura inteira exibida e o uso confirmado posterior', () => {
  const r = regrasFinanceiras([]);

  const linhas = [
    { cred: true, pago: true, periodoIdx: 0, v: -600 },
    { cred: true, pago: true, periodoIdx: 1, v: -450 },
    { cred: true, pago: true, periodoIdx: 2, v: -250 },
  ];

  // Fatura do ciclo 1 já reúne R$ 900,00 (inclui R$ 450,00 ainda aberto); só R$ 250,00
  // do ciclo 2 continua sendo uma compra confirmada além dela.
  assert.equal(r.limiteCartaoLivreFuturo(linhas, 0, 1, -900), 2600);
  assert.equal(r.limiteCartaoLivreFuturo(linhas, 0, 1, 100), 3500);
});

test('Livre Futuro: antecipação de fatura seguinte não alivia o limite (só conta no ciclo dela)', () => {
  const r = regrasFinanceiras([]);

  // Parcela confirmada de R$ 133,33 em cada uma das duas faturas seguintes, cada uma com uma
  // antecipação de R$ 199,90 (planejada) no próprio ciclo. A projeção da fatura do ciclo 1
  // não usa essas antecipações: as duas parcelas ocupam o limite por inteiro.
  const linhas = [
    { cred: true, pago: true, periodoIdx: 1, v: -2728.9 },
    { cred: true, pago: true, periodoIdx: 2, v: -133.33 },
    { cred: true, pago: true, periodoIdx: 3, v: -133.33 },
  ];

  const livre = r.limiteCartaoLivreFuturo(linhas, 0, 1, -2719.14);

  assert.equal(Math.round((3750 - livre) * 100) / 100, 2985.8);
  // A assinatura nem recebe mais a alocação: nada de fora pode reduzir o uso posterior.
  assert.equal(r.limiteCartaoLivreFuturo.length, 1);
});

test('garantia Nubank só com aporte/resgate pago; Liberdade usa também os abertos', () => {
  const r = regrasFinanceiras([]);

  const linhas = [
    { inv: true, pago: true, periodoIdx: 0, v: -300 },
    { inv: true, pago: false, periodoIdx: 1, v: -500 }, // materializado e aberto: ainda não está na caixinha
    { inv: true, pago: true, periodoIdx: 1, v: 100 }, // resgate reduz a garantia
    { inv: true, pago: true, periodoIdx: 2, v: -900 }, // ciclo futuro não entra
    { inv: false, periodoIdx: 1, v: -800 }, // sugestão não é aporte real
  ];

  assert.equal(r.guardadoGarantidoAte(linhas, 1), 200);
  assert.equal(r.limiteCartaoTotal(r.guardadoGarantidoAte(linhas, 1)), 3950);
  assert.equal(r.guardadoRealAte(linhas, 1), 700);
});

// Aviso "Resgatou tudo": o ciclo desenhado de verdade (carga e desenho reais, banco falso). Ciclo 1 (set): salário 1.000 vira
// guardado; ciclo 2 (out): a despesa e o resgate abaixo mexem nesse guardado.
const lancamento = (id, nome, data, valor, categ) => ({
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

const doGuardado = (...mais) => ({
  fin_ciclo: [
    { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
    { id: 2, inicio: '2026-10-15', fim: null },
  ],
  fin: [lancamento(1, 'Salário', '2026-09-16', 1000, 'Salário'), ...mais],
  fin_meta: [],
});

const AVISO = /⚠ Resgatou tudo/;

test('aviso "Resgatou tudo" na linha de resgate calculada (Resgate necessário)', async () => {
  // déficit 1.500 maior que o guardado 1.000: o resgate leva tudo
  const tudo = await carregarTela({
    dados: doGuardado(lancamento(2, 'Reforma', '2026-10-20', -1500, 'Casa')),
  }).desenharCiclo(1);

  assert.match(tudo.texto, /Resgate necessário ⚠ Resgatou tudo/);

  // déficit 600 cabe no guardado: o resgate não é "tudo"
  const folga = await carregarTela({
    dados: doGuardado(lancamento(2, 'Reforma', '2026-10-20', -600, 'Casa')),
  }).desenharCiclo(1);

  assert.match(folga.texto, /Resgate necessário/);
  assert.doesNotMatch(folga.html, AVISO);
});

test('aviso "Resgatou tudo" na linha de resgate real: só quando o guardado acaba no ciclo', async () => {
  const levouTudo = await carregarTela({
    dados: doGuardado(
      lancamento(2, 'Reforma', '2026-10-20', -1500, 'Casa'),
      lancamento(3, 'Resgate', '2026-10-21', 1000, 'Investimento')
    ),
  }).desenharCiclo(1);

  assert.match(levouTudo.texto, /Resgate ⚠ Resgatou tudo/);

  const sobrou = await carregarTela({
    dados: doGuardado(
      lancamento(2, 'Reforma', '2026-10-20', -300, 'Casa'),
      lancamento(3, 'Resgate', '2026-10-21', 400, 'Investimento')
    ),
  }).desenharCiclo(1);

  assert.match(sobrou.texto, /Resgate/);
  assert.doesNotMatch(sobrou.html, AVISO);
});

test('a evolução separa Resgatado de Aportado pelo sinal: o resgate diminuído (negativo) não conta como resgatado', async () => {
  const evolucao = async (...mais) => {
    const t = carregarTela({ dados: doGuardado(...mais) });

    await t.bruto('carregarDados()');

    return t.rodar('dadosEvolucao(1, 1)')[0];
  };

  const comum = await evolucao(lancamento(2, 'Reforma', '2026-10-20', -1500, 'Casa'));

  assert.deepEqual(
    comum.linhasDe.Resgatado.map((l) => [l.nome, l.v]),
    [['Resgate necessário', 1000]]
  );
  assert.deepEqual(comum.linhasDe.Aportado, []);

  // o resgate real (1.500) passa do guardado (1.000): o ajuste o diminui em 500 e vai para Aportado
  const diminuido = await evolucao(
    lancamento(2, 'Reforma', '2026-10-20', -1500, 'Casa'),
    lancamento(3, 'Resgate', '2026-10-21', 1500, 'Investimento')
  );

  assert.deepEqual(
    diminuido.linhasDe.Resgatado.map((l) => [l.nome, l.v]),
    [['Resgate', 1500]]
  );
  assert.deepEqual(
    diminuido.linhasDe.Aportado.map((l) => [l.nome, l.v]),
    [['Resgate necessário', -500]]
  );
  assert.equal(diminuido.resgatado, 1500);
  assert.equal(diminuido.aportado, 500);
});

test('o guardado nunca fica negativo e o aviso está documentado', () => {
  const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

  assert.match(regras, /O \*\*guardado nunca fica negativo\*\*/);
  assert.match(
    regras,
    /a linha de resgate \(calculada ou real\) ganha o aviso laranja \*\*⚠ Resgatou tudo\*\*/
  );
});

test('no Nome só o texto é cortado com "…"; as marcas ficam inteiras', async () => {
  // a célula de Nome de uma linha com as três marcas: o texto primeiro, depois Fatura, Resgatou tudo e Atrasado, tudo dentro de .nomeLinha
  const t = carregarTela({
    dados: {
      fin_ciclo: [{ id: 1, inicio: '2026-09-15', fim: null }],
      fin: [],
      fin_meta: [],
    },
  });

  await t.bruto('carregarDados()');

  const html = t.rodar(
    "celNome({ _res: 1, _resgatouTudo: true, _atrasado: true, nome: 'Transf', categ: 'Antecipação Fatura', cred: false, fatura: '2026-11-12', v: -100, id: -2, _sid: 'res:1' })"
  );

  assert.match(
    html,
    /^<span class=nomeLinha><span class=nomeTexto>Transf<\/span> <span class="tagFatura"[^>]*>[^<]*<\/span> <span class=tagAviso[^>]*>⚠ Resgatou tudo<\/span> <span class=tagAviso[^>]*>Atrasado<\/span><\/span>$/
  );

  // só o texto do nome encolhe e ganha reticências; as marcas (filhas diretas) nunca encolhem
  const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
  const texto = declaracoes(estilos, '.nomeLinha > .nomeTexto');

  for (const regra of [
    'flex: 0 1 auto',
    'min-width: 0',
    'overflow: hidden',
    'text-overflow: ellipsis',
  ])
    assert.ok(texto.includes(regra), regra);
  assert.ok(declaracoes(estilos, '.nomeLinha > *').includes('flex: none'));
});
