// Dados do Treino sem navegador: o formato do db (preparar, com os formatos antigos), as linhas que vão para o Supabase e voltam
// (linhas/deLinhas/diferenca), a junção com o banco da versão antiga e o login por usuário. A sincronização de verdade
// (outro aparelho, offline) está em nuvem.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarTr, usar, puro } from './helpers/js.mjs';

const f = carregarTr('2026-10-21T19:00:00');

const variacao = (id, o = {}) => ({
  id,
  nome: id,
  unidade: 'kg',
  passo: 5,
  lados: 1,
  ...o,
});

const completo = () => ({
  exercicios: [
    {
      id: 'e1',
      grupo: 'Peito',
      regiao: 'Superior',
      series: 3,
      reps: 12,
      descanso: 75,
      modo: 'invertida',
      ativo: 0,
      variacoes: [
        variacao('v1', { equip: '12', nota: 'banco no furo 4' }),
        variacao('v2'),
        variacao('v3'),
      ],
    },
  ],
  registros: [
    {
      variacao: 'v1',
      data: '2026-10-21',
      series: [
        { kg: 40, reps: 8 },
        { kg: 35, reps: 10, falha: true },
      ],
    },
  ],
  treinos: [
    {
      inicio: Date.parse('2026-10-21T18:00:00Z'),
      fim: Date.parse('2026-10-21T19:00:00Z'),
      fechado: true,
      cardio: { inicio: Date.parse('2026-10-21T19:05:00Z'), ms: 600000, vel: 6, incl: 0 },
    },
  ],
});

test('migra dados de versões antigas (slots e logs) para o formato atual', () => {
  const r = f.preparar({
    slots: [
      {
        id: 'a',
        g: 'Pernas · empurrar',
        sets: 3,
        reps: '10–12',
        rest: 90,
        a: 0,
        vs: [{ id: 'v1', pt: 'Leg press', u: 'kg' }],
      },
    ],
    logs: [{ v: 'v1', d: '2026-10-20', w: 40, r: 12 }],
  });

  assert.equal(r.exercicios[0].regiao, 'Pernas'); // deduzida do nome
  assert.equal(r.exercicios[0].variacoes[0].passo, 5);
  assert.equal(r.exercicios[0].reps, 12); // "10–12" vira 12
  assert.deepEqual(r.registros[0].series, [
    { kg: 40, reps: 12 },
    { kg: 45, reps: 12 },
    { kg: 50, reps: 12 },
  ]); // carga + reps viram pirâmide crescente
  assert.equal(r.medidas, undefined); // pesagens agora são do app Corpo
});

test('completa e limita os campos: 3 variações, unidade, passo, reps, séries, descanso, modo, equipamento e nota', () => {
  const r = f.preparar({
    exercicios: [
      {
        grupo: 'Costas',
        series: 11,
        reps: 'x',
        descanso: 5,
        modo: 'inventado',
        variacoes: [
          {
            nome: '  Puxada  ',
            unidade: 'jarda',
            passo: 'abc',
            lados: 2,
            equip: '  123456789012  ',
            nota: '   ',
          },
          { nome: 'Barra', unidade: 'lb', passo: '2,5' },
        ],
      },
    ],
    registros: [],
  });

  const e = r.exercicios[0];

  assert.ok(e.id);
  assert.equal(e.regiao, 'Superior');
  assert.equal(e.series, 3); // fora de 1 a 10: o padrão
  assert.deepEqual(
    [10, 1, 0].map(
      (n) =>
        f.preparar({ exercicios: [{ series: n }], registros: [] }).exercicios[0].series
    ),
    [10, 1, 3]
  ); // os limites valem; zero é fora
  assert.equal(e.reps, 12);
  assert.equal(e.descanso, 90); // fora de 10 a 600: o padrão do 1º exercício (Leg press)
  assert.equal(e.modo, 'invertida');
  assert.equal(e.variacoes.length, 3);
  assert.deepEqual(
    e.variacoes.map((v) => [v.nome, v.unidade, v.passo, v.lados]),
    [
      ['Puxada', 'kg', 5, 2], // unidade desconhecida vira kg; passo inválido, o da anilha
      ['Barra', 'lb', 2.5, 1],
      ['', 'kg', 2, 1], // a 3ª vaga é o halter: passo 2
    ]
  );
  assert.equal(e.variacoes[0].equip, '12345678'); // até 8 caracteres
  assert.equal('nota' in e.variacoes[0], false); // nota em branco sai
  assert.equal(e.ativo, 0);

  const sem = f.preparar({
    exercicios: [{ variacoes: [{ nome: '' }, { nome: 'B' }] }],
    registros: [],
  });

  assert.equal(sem.exercicios[0].ativo, 1); // a variação ativa é a 1ª com nome
  assert.throws(() => f.preparar({ exercicios: 1 }), /formato/);
  assert.throws(() => f.preparar(null), /formato/);
});

test('registros e treinos inválidos são descartados; falha só como true; cardio sem tempo ou velocidade sai', () => {
  const base = completo();

  base.exercicios[0].variacoes[1] = variacao('v2', { unidade: 'corpo', passo: 1 });
  base.registros = [
    {
      variacao: 'v1',
      data: '2026-10-20',
      series: [{ kg: '40,5', reps: '8', falha: 'sim' }],
    },
    { variacao: 'v1', data: 'ontem', series: [{ kg: 40, reps: 8 }] }, // data inválida
    { variacao: 'sumiu', data: '2026-10-20', series: [{ kg: 40, reps: 8 }] }, // variação que não existe
    { variacao: 'v1', data: '2026-10-19', series: [] },
    { variacao: 'v1', data: '2026-10-18', series: [{ kg: 0, reps: 8 }] }, // kg sem peso
    { variacao: 'v2', data: '2026-10-20', series: [{ kg: 0, reps: 6, falha: true }] }, // corpo: kg 0 vale
  ];
  base.treinos = [
    { inicio: 10, fim: 20 },
    { inicio: 30, fim: 20 }, // acaba antes de começar
    { inicio: 0, fim: 5 },
    { inicio: 40, fim: 50, cardio: { inicio: 41, ms: 1000.4, vel: '6,5', incl: -2 } },
    { inicio: 60, fim: 70, cardio: { inicio: 61, ms: 0, vel: 6, incl: 0 } },
    { inicio: 80, fim: 90, cardio: { inicio: 81, ms: 1000, vel: 0, incl: 0 } },
  ];

  const r = f.preparar(base);

  assert.deepEqual(r.registros, [
    { variacao: 'v1', data: '2026-10-20', series: [{ kg: 40.5, reps: 8 }] }, // "sim" não é true
    { variacao: 'v2', data: '2026-10-20', series: [{ kg: 0, reps: 6, falha: true }] },
  ]);
  assert.deepEqual(r.treinos, [
    { inicio: 10, fim: 20 },
    { inicio: 40, fim: 50, cardio: { inicio: 41, ms: 1000, vel: 6.5, incl: 0 } },
    { inicio: 60, fim: 70 },
    { inicio: 80, fim: 90 },
  ]);
});

test('formato antigo na cópia do aparelho: preparar é idempotente, então a base nunca fica "pendente" só pelo formato', () => {
  const velho = {
    slots: [
      {
        id: 'a',
        g: 'Peito',
        sets: 3,
        reps: '8–10',
        rest: 75,
        a: 0,
        vs: [{ id: 'v1', pt: 'Supino', u: 'kg' }],
      },
    ],
    logs: [{ v: 'v1', d: '2026-10-20', w: 30, r: 10 }],
    medidas: [{ d: '2026-10-01', peso: 90 }],
  };

  const uma = f.preparar(velho);

  assert.deepEqual(f.preparar(uma), uma);
  // a base (o que o servidor tem) é a mesma cópia, já limpa: sem diferença
  assert.equal(f.diferenca(f.linhas(uma), f.linhas(f.preparar(uma))), null);
  // um campo a mais no formato novo (equip) é diferença de verdade
  const mudou = f.preparar(uma);

  mudou.exercicios[0].variacoes[0].equip = '9';
  assert.deepEqual(
    Object.entries(f.diferenca(f.linhas(uma), f.linhas(mudou)).up).map(([t, l]) => [
      t,
      l.length,
    ]),
    [
      ['tr_exercicio', 0],
      ['tr_variacao', 1],
      ['tr_registro', 0],
      ['tr_treino', 0],
    ]
  );
});

test('linhas: uma por exercício, variação, registro e treino, com a chave de cada tabela', () => {
  const L = f.linhas(f.preparar(completo()));

  assert.deepEqual(Object.keys(L), [
    'tr_exercicio',
    'tr_variacao',
    'tr_registro',
    'tr_treino',
  ]);
  assert.deepEqual(L.tr_exercicio.e1, {
    id: 'e1',
    ordem: 0,
    grupo: 'Peito',
    regiao: 'Superior',
    series: 3,
    reps: 12,
    descanso: 75,
    modo: 'invertida',
    ativo: 0,
  });
  assert.deepEqual(Object.keys(L.tr_variacao), ['v1', 'v2', 'v3']);
  assert.deepEqual(L.tr_variacao.v1, {
    id: 'v1',
    exercicio_id: 'e1',
    ordem: 0,
    nome: 'v1',
    unidade: 'kg',
    passo: 5,
    lados: 1,
    equip: '12',
    nota: 'banco no furo 4',
  });
  assert.equal(L.tr_variacao.v2.equip, null); // sem equipamento: null no banco
  assert.deepEqual(L.tr_registro['v1|2026-10-21'], {
    variacao_id: 'v1',
    data: '2026-10-21',
    series: [
      { kg: 40, reps: 8 },
      { kg: 35, reps: 10, falha: true },
    ],
  });

  const [chave] = Object.keys(L.tr_treino);

  assert.equal(chave, '2026-10-21T18:00:00.000Z'); // o início em ISO é a chave
  assert.deepEqual(L.tr_treino[chave], {
    inicio: '2026-10-21T18:00:00.000Z',
    fim: '2026-10-21T19:00:00.000Z',
    fechado: true,
    cardio: { inicio: Date.parse('2026-10-21T19:05:00Z'), ms: 600000, vel: 6, incl: 0 },
  });
});

test('ida e volta: as linhas do servidor viram o mesmo db (e o cardio e o fechado de um treino aberto)', () => {
  const db = f.preparar(completo());

  db.treinos.push({
    inicio: Date.parse('2026-10-22T18:00:00Z'),
    fim: Date.parse('2026-10-22T18:30:00Z'),
  });
  const L = f.linhas(db);

  // como o PostgREST devolve: listas de linhas (exercícios e variações em ordem qualquer, pois deLinhas ordena pela coluna ordem)
  const R = Object.fromEntries(
    Object.entries(L).map(([t, m]) => [
      t,
      t === 'tr_exercicio' || t === 'tr_variacao'
        ? Object.values(m).reverse()
        : Object.values(m),
    ])
  );

  assert.deepEqual(f.deLinhas(R), db);
  assert.equal(L.tr_treino['2026-10-22T18:00:00.000Z'].fechado, false);
  assert.equal(L.tr_treino['2026-10-22T18:00:00.000Z'].cardio, null);
});

test('diferença para o servidor: só o que mudou, e o que sumiu vai para apagar', () => {
  const antes = f.linhas(f.preparar(completo()));

  assert.equal(f.diferenca(antes, f.linhas(f.preparar(completo()))), null);

  const novo = f.preparar(completo());

  novo.registros[0].series[0].kg = 42.5;
  novo.registros.push({
    variacao: 'v2',
    data: '2026-10-21',
    series: [{ kg: 10, reps: 10 }],
  });
  novo.treinos = [];

  const d = f.diferenca(antes, f.linhas(novo));

  assert.deepEqual(
    d.up.tr_registro.map((l) => [l.variacao_id, l.series[0].kg]),
    [
      ['v1', 42.5],
      ['v2', 10],
    ]
  );
  assert.deepEqual(d.up.tr_exercicio, []);
  assert.deepEqual(
    d.del.tr_treino.map((l) => l.inicio),
    ['2026-10-21T18:00:00.000Z']
  );
  assert.deepEqual(d.del.tr_registro, []);
  // sem base (aparelho novo ou conta recriada): tudo vai
  assert.equal(f.diferenca(null, antes).up.tr_exercicio.length, 1);
});

test('junta ao da nuvem o banco da versão antiga: no mesmo dia vale o do aparelho', () => {
  const dia = (d, h = '18:00') => new Date(`${d}T${h}`).getTime();

  const nuvem = f.preparar({
    exercicios: completo().exercicios,
    registros: [
      { variacao: 'v1', data: '2026-10-20', series: [{ kg: 30, reps: 12 }] },
      { variacao: 'v1', data: '2026-10-21', series: [{ kg: 99, reps: 1 }] },
    ],
    treinos: [
      { inicio: dia('2026-10-20'), fim: dia('2026-10-20', '19:00') },
      { inicio: dia('2026-10-21'), fim: dia('2026-10-21', '19:00') },
    ],
  });

  const local = f.preparar({
    exercicios: completo().exercicios,
    registros: [{ variacao: 'v1', data: '2026-10-21', series: [{ kg: 30, reps: 12 }] }],
    treinos: [{ inicio: dia('2026-10-21', '17:00'), fim: dia('2026-10-21', '17:30') }],
  });

  const r = f.juntar(nuvem, local);

  assert.deepEqual(
    r.registros.map((x) => [x.data, x.series[0].kg]),
    [
      ['2026-10-20', 30],
      ['2026-10-21', 30],
    ]
  );
  assert.deepEqual(
    r.treinos.map((t) => t.inicio),
    [dia('2026-10-20'), dia('2026-10-21', '17:00')]
  );
});

test('login aceita o usuário no lugar do e-mail; usuário desconhecido não tem e-mail (nem chega ao Supabase)', () => {
  assert.equal(f.emailDoLogin('Victor'), 'victor.cabrera0209@gmail.com');
  assert.equal(f.emailDoLogin('  victor '), 'victor.cabrera0209@gmail.com');
  assert.equal(f.emailDoLogin('eu@teste.com'), 'eu@teste.com');
  assert.equal(f.emailDoLogin('fulano'), null);
  assert.equal(f.emailDoLogin(''), null);
  assert.equal(f.emailDoLogin(undefined), null);
});

test('config: conta dona, chave publicável e descrição (GUIA) de cada exercício das migrations', () => {
  assert.match(f.DONO, /^[0-9a-f-]{36}$/);
  assert.ok(f.SUPABASE_KEY.startsWith('sb_publishable_'));
  assert.deepEqual(f.DIAS_FIXOS, [3, 4]);
  assert.deepEqual(f.DIAS_EXTRA, [1]);

  for (const [grupo, , , nomes] of f.PADRAO)
    for (const nome of nomes)
      assert.ok(f.GUIA[nome.toLowerCase()], `${grupo}: ${nome} sem GUIA`);
});

test('banco novo: os 6 exercícios padrão com 3 variações vazias cada, antes de preparar', () => {
  usar(f, {});
  const b = f.preparar(f.bancoNovo());

  assert.equal(b.exercicios.length, 6);
  assert.equal(b.exercicios[0].variacoes[0].nome, 'Leg press 45°');
  assert.equal(b.exercicios[0].descanso, 90);
  assert.equal(b.exercicios[0].modo, 'invertida');
  assert.equal(puro(b.registros).length, 0);
});
