// Pirâmide, unidades e planos por mês (sem navegador): as funções de js/piramide.js e js/series.js rodando com números fixos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarTr, usar, puro } from './helpers/js.mjs';

const f = carregarTr('2026-10-21T19:00:00');

const kg = (o = {}) => ({ unidade: 'kg', passo: 5, lados: 1, ...o });
const ex = (o = {}) => ({ series: 3, reps: 12, modo: 'invertida', ...o });

test('pirâmide invertida (padrão): aquecimento a 50% e séries 8/10/12 com o peso descendo ~10%', () => {
  assert.deepEqual(f.plano(ex(), kg(), 40, true), [
    { nome: 'Aquecimento', kg: 20, reps: 15, aq: true },
    { nome: 'Série 1', i: 0, kg: 40, reps: 8 },
    { nome: 'Série 2', i: 1, kg: 35, reps: 10 },
    { nome: 'Série 3', i: 2, kg: 30, reps: 12 },
  ]);
  assert.deepEqual(
    f.plano(ex(), kg(), 40, false).map((s) => s.nome),
    ['Série 1', 'Série 2', 'Série 3']
  );
});

test('modos: crescente sobe o peso e desce as reps; mesma carga repete; o peso arredonda ao passo da máquina', () => {
  assert.deepEqual(
    f.plano(ex({ modo: 'crescente' }), kg(), 40, false).map((s) => [s.kg, s.reps]),
    [
      [40, 12],
      [45, 10],
      [50, 8],
    ]
  );
  assert.deepEqual(
    f.plano(ex({ modo: 'reta' }), kg(), 40, false).map((s) => [s.kg, s.reps]),
    [
      [40, 12],
      [40, 12],
      [40, 12],
    ]
  );
  // passo 2 (halter): 10% de 40 = 4
  assert.deepEqual(
    f.plano(ex({ modo: 'crescente' }), kg({ passo: 2 }), 40, false).map((s) => s.kg),
    [40, 44, 48]
  );
  assert.equal(f.arred(0.4, 5), 5); // nunca menos que um passo
  assert.equal(f.alvoReps(ex({ reps: 3, modo: 'crescente' }), 2), 1); // nunca menos que 1 rep
});

test('sem peso na caixa: a pirâmide fica sem peso (null) e o ajuste da série vale mais que o plano', () => {
  const sem = f.plano(ex(), kg(), 0, true);

  assert.deepEqual(
    sem.map((s) => s.kg),
    [null, null, null, null]
  );

  const ajustado = f.plano(ex({ modo: 'reta' }), kg(), 40, false, {
    2: { kg: 37 },
    0: { reps: 10 },
  });

  assert.deepEqual(
    ajustado.map((s) => [s.kg, s.reps]),
    [
      [40, 10],
      [40, 12],
      [37, 12],
    ]
  );
});

test('peso do corpo e segundos: sem aquecimento e sem peso, só o alvo de reps (ou segundos)', () => {
  const e = ex({ series: 3, reps: 6, modo: 'reta' });

  for (const unidade of ['corpo', 's'])
    assert.deepEqual(f.plano(e, { unidade, passo: 1 }, 0, true), [
      { nome: 'Série 1', i: 0, kg: 0, reps: 6 },
      { nome: 'Série 2', i: 1, kg: 0, reps: 6 },
      { nome: 'Série 3', i: 2, kg: 0, reps: 6 },
    ]);
  assert.equal(f.semPeso({ unidade: 's' }), true);
  assert.equal(f.semPeso({ unidade: 'kg' }), false);
  assert.equal(f.serieTxt(0, 8, { unidade: 'corpo' }), '8 reps');
  assert.equal(f.serieTxt(0, 20, { unidade: 's' }), '20 s');
  assert.equal(f.serieTxt(40, 12, kg()), '40 kg × 12');
});

test('kg ↔ lb: a outra unidade ao lado do peso, de 1 em 1, e o histórico convertido com 1 casa', () => {
  const lb = kg({ unidade: 'lb' });

  assert.equal(f.naOutra(50, lb), 22.7); // 50 lb ≈ 22,7 kg
  assert.equal(f.naOutra(40, kg()), 88.2);
  assert.equal(f.daOutra(23, lb), 50.71); // 23 kg → lb, 2 casas
  assert.equal(f.daOutra(27, lb), 59.52);
  assert.equal(f.outraUnidade({ unidade: 'nível' }), null); // nível não converte
  assert.equal(f.naOutra(7, { unidade: 'nível' }), 7);
  // de um valor quebrado vai para o inteiro vizinho: 22,7 → 23 → 24; para baixo 22,7 → 22; nunca abaixo de 0
  assert.equal(f.umAUm(22.7, 1), 23);
  assert.equal(f.umAUm(23, 1), 24);
  assert.equal(f.umAUm(22.7, -1), 22);
  assert.equal(f.umAUm(0, -1), 0);
  assert.equal(f.umAUm(NaN, 1), 1);

  const registros = () => [
    {
      variacao: 'v',
      data: '2026-10-01',
      series: [
        { kg: 23, reps: 12 },
        { kg: 27, reps: 10, falha: true },
      ],
    },
    { variacao: 'outra', data: '2026-10-01', series: [{ kg: 10, reps: 5 }] },
  ];

  const r = registros();

  f.converterHistorico(r, 'v', 'kg', 'lb');
  assert.deepEqual(puro(r[0].series), [
    { kg: 50.7, reps: 12 },
    { kg: 59.5, reps: 10, falha: true },
  ]);
  assert.deepEqual(puro(r[1]), registros()[1]); // só a variação trocada
  f.converterHistorico(r, 'v', 'lb', 'kg'); // e volta
  assert.deepEqual(
    r[0].series.map((s) => s.kg),
    [23, 27]
  );

  const igual = registros();

  f.converterHistorico(igual, 'v', 'kg', 'kg');
  f.converterHistorico(igual, 'v', 'kg', 'nível');
  assert.deepEqual(puro(igual), registros()); // mesma unidade ou sem conversão: intacto
});

test('total em kg: por lado dobra, lb converte, nível não pesa; textos do peso', () => {
  assert.equal(f.emKg(40, kg({ lados: 2 })), 80);
  assert.ok(Math.abs(f.emKg(100, kg({ unidade: 'lb' })) - 45.359237) < 1e-9);
  assert.equal(f.emKg(5, kg({ unidade: 'nível' })), 0);
  assert.equal(f.pesoTxt(40, kg({ lados: 2 })), '40 kg/lado');
  assert.equal(f.pesoTxt(0, kg()), '—');
  assert.equal(f.unidadeTxt(kg({ unidade: 'lb' })), 'lb');
});

test('registro em texto: cargas distintas, reps com ✗ nas falhas, maior carga ou, sem peso, mais reps', () => {
  const r = {
    series: [
      { kg: 40, reps: 8 },
      { kg: 35, reps: 10, falha: true },
      { kg: 35, reps: 9 },
    ],
  };

  assert.equal(f.repsTxt(r), '8/10✗/9');
  assert.equal(f.kgsTxt(r), '40/35');
  assert.equal(f.registroTxt(r, kg()), '<b>40/35 kg</b> × 8/10✗/9');
  assert.equal(f.topo(r), 40);

  const corpo = {
    series: [
      { kg: 0, reps: 6 },
      { kg: 0, reps: 9 },
    ],
  };

  assert.equal(f.topo(corpo), 9);
  assert.equal(f.registroTxt(corpo, { unidade: 'corpo' }), '<b>6/9</b> reps');
  assert.equal(f.registroTxt(corpo, { unidade: 's' }), '<b>6/9</b> s');
});

test('pirâmide completa: bateu as reps-alvo de todas as séries, sem falha', () => {
  const e = ex({ modo: 'invertida' }), // alvo 8/10/12
    s = (...reps) => ({ series: reps.map((r) => ({ kg: 40, reps: r })) });

  assert.equal(f.completo(s(8, 10, 12), e), true);
  assert.equal(f.completo(s(9, 11, 13), e), true);
  assert.equal(f.completo(s(8, 9, 12), e), false);
  assert.equal(f.completo(s(8, 10), e), false); // faltou série
  assert.equal(
    f.completo(
      { series: [...s(8, 10, 12).series.slice(0, 2), { kg: 40, reps: 12, falha: true }] },
      e
    ),
    false
  );
  assert.equal(f.completo(null, e), false);
});

test('falhas: em quantos dos últimos 5 treinos da variação falhou e em quais séries', () => {
  usar(f, {
    db: {
      registros: [
        { variacao: 'v', data: '2026-10-01', series: [{ kg: 1, reps: 1 }] },
        {
          variacao: 'v',
          data: '2026-10-05',
          series: [
            { kg: 1, reps: 1, falha: true },
            { kg: 1, reps: 1 },
          ],
        },
        {
          variacao: 'v',
          data: '2026-10-10',
          series: [
            { kg: 1, reps: 1 },
            { kg: 1, reps: 1 },
            { kg: 1, reps: 1, falha: true },
          ],
        },
        { variacao: 'v', data: '2026-10-15', series: [{ kg: 1, reps: 1, falha: true }] },
        {
          variacao: 'outra',
          data: '2026-10-16',
          series: [{ kg: 1, reps: 1, falha: true }],
        },
      ],
    },
  });
  assert.deepEqual(f.falhas('v'), { treinos: 3, de: 4, series: [1, 3] });
  assert.deepEqual(f.falhas('v', 1), { treinos: 1, de: 1, series: [1] }); // só o mais recente
  assert.deepEqual(f.falhas('nenhuma'), { treinos: 0, de: 0, series: [] });
});

// ===== Planos por mês (flexão e barra fixa) =====
test('plano por mês: cada etapa vale 1 mês a partir do início, com o alvo de cada semana; a última continua', () => {
  const etapas = [
    '2026-10-20',
    '2026-10-28',
    '2026-11-04',
    '2026-11-27',
    '2026-11-28',
    '2026-12-28',
    '2027-06-01',
  ].map((d) => {
    const x = f.etapaDoPlano(f.PLANOS.barrafix, d);

    return [x.k, x.semana, x.ate];
  });

  assert.deepEqual(etapas, [
    [0, 0, '2026-11-28'], // antes do início: 1ª etapa, semana 1
    [0, 0, '2026-11-28'],
    [0, 1, '2026-11-28'],
    [0, 3, '2026-11-28'],
    [1, 0, '2026-12-28'],
    [2, 0, null], // a última não acaba
    [2, 3, null],
  ]);
  assert.equal(f.maisMeses('2027-01-31', 1), '2027-02-28'); // fim de mês mais curto
  assert.equal(f.maisMeses('2028-01-31', 1), '2028-02-29'); // bissexto
  assert.equal(f.maisMeses('2026-12-15', 2), '2027-02-15'); // vira o ano
  assert.equal(f.etapaDoPlano(f.PLANOS.flexao, '2026-12-28').etapa.reps[0], 6);
});

test('o plano escolhe variação, séries e reps (mesmo alvo em todas): 2ª semana do 1º mês, 2º e 3º mês', () => {
  const exercicio = (id) => ({
    id,
    series: 9,
    reps: 99,
    modo: 'invertida',
    ativo: 2,
    variacoes: [{ nome: 'a' }, { nome: 'b' }, { nome: 'c' }],
  });

  let gravou = 0;
  const g = carregarTr('2026-11-05T19:00:00', { gravar: () => gravou++ });

  const no = (dia) => {
    usar(g, {
      db: {
        exercicios: [exercicio('flexao'), exercicio('barrafix'), exercicio('peito')],
      },
    });

    return [
      g.aplicarPlanos(dia),
      g.db.exercicios.map((e) => [e.ativo, e.series, e.reps, e.modo]),
    ];
  };

  assert.deepEqual(no('2026-11-05'), [
    true,
    [
      [0, 3, 8, 'reta'],
      [0, 3, 20, 'reta'],
      [2, 9, 99, 'invertida'], // exercício sem plano: intacto
    ],
  ]);
  assert.equal(gravou, 1);
  assert.deepEqual(no('2026-12-01')[1].slice(0, 2), [
    [1, 3, 3, 'reta'],
    [1, 3, 3, 'reta'],
  ]);
  assert.deepEqual(no('2027-01-20')[1].slice(0, 2), [
    [1, 3, 12, 'reta'],
    [2, 3, 3, 'reta'],
  ]);

  // já no alvo: não muda nem grava de novo
  const antes = gravou;

  assert.equal(g.aplicarPlanos('2027-01-20'), false);
  assert.equal(gravou, antes);
});

// ===== Aquecimento e séries do dia =====
const exs = () => [
  { id: 'e0', regiao: 'Pernas', ativo: 0, variacoes: [kg({ id: 'v0' })] },
  { id: 'e1', regiao: 'Pernas', ativo: 0, variacoes: [kg({ id: 'v1' })] },
  { id: 'e2', regiao: 'Superior', ativo: 0, variacoes: [kg({ id: 'v2' })] },
  { id: 'e3', regiao: 'Superior', ativo: 0, variacoes: [{ id: 'v3', unidade: 'corpo' }] },
];

test('aquecimento só no 1º exercício começado de cada região', () => {
  usar(f, { db: { exercicios: exs() } });
  const [e0, e1, e2] = f.db.exercicios;

  assert.deepEqual(
    [e0, e1, e2].map((e) => f.temAquecimento(e)),
    [true, true, true]
  ); // ninguém começou

  f.T.series.e0 = 1;
  f.T.aquecimento.Pernas = 'e0'; // começou pelo e0: o aquecimento é dele
  assert.deepEqual(
    [e0, e1, e2].map((e) => f.temAquecimento(e)),
    [true, false, true]
  );
  assert.equal(f.seriesDeTrabalho(e0), 0); // a 1ª série marcada foi o aquecimento
  f.T.series.e0 = 3;
  assert.equal(f.seriesDeTrabalho(e0), 2);
  assert.equal(f.seriesDeTrabalho(e1), 0);
});

test('aquecimento: quem já tem série ou registro hoje na região tira o dos outros; peso do corpo nunca tem', () => {
  usar(f, { db: { exercicios: exs() } });
  const [, e1, , e3] = f.db.exercicios;

  f.T.series.e0 = 2; // ainda sem a região registrada em T.aquecimento (ex.: sessão restaurada)
  assert.equal(f.temAquecimento(e1), false);

  usar(f, {
    db: {
      exercicios: exs(),
      registros: [{ variacao: 'v0', data: '2026-10-21', series: [{ kg: 40, reps: 8 }] }],
    },
  });
  assert.equal(f.temAquecimento(f.db.exercicios[1]), false); // registro de hoje (outro aparelho)
  assert.equal(f.temAquecimento(f.db.exercicios[2]), true); // outra região
  assert.equal(f.temAquecimento(e3), false); // corpo: sem aquecimento
  assert.equal(f.descansoAquecimento({ descanso: 90 }), 45);
  assert.equal(f.descansoAquecimento({ descanso: 30 }), 30);
});

test('as séries do dia zeram quando o dia muda; relógio do descanso', () => {
  usar(f, {
    db: { exercicios: exs() },
    T: { dia: '2026-10-20', series: { e0: 3 }, aquecimento: { Pernas: 'e0' } },
  });
  f.T.dia = '2026-10-20';
  assert.equal(f.seriesFeitas('e0'), 0);
  assert.equal(f.T.dia, '2026-10-21');
  assert.deepEqual(puro(f.T.aquecimento), {});
  f.T.series.e0 = 2;
  assert.equal(f.seriesFeitas('e0'), 2); // mesmo dia: mantém
  assert.deepEqual([84000, 1, 0, -5, 90000].map(f.relogio), [
    '1:24',
    '0:01',
    '0:00',
    '0:00',
    '1:30',
  ]);
});
