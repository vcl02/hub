// Pontos, nível, conquistas (inclusive as de longo prazo) e o resumo de um dia, sem navegador: as funções de js/pontos.js e
// js/cardio.js rodando com números fixos. A tela (placar e lista de conquistas) é conferida em treino.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarTr, usar } from './helpers/js.mjs';

const variacao = (id) => ({ id, nome: id, unidade: 'kg', passo: 5, lados: 1 });

const exercicios = () => [
  {
    id: 'e0',
    grupo: 'Pernas',
    regiao: 'Pernas',
    series: 3,
    reps: 12,
    descanso: 90,
    modo: 'invertida',
    ativo: 0,
    variacoes: [variacao('v0')],
  },
];

const reg = (data, series = [{ kg: 40, reps: 12 }], v = 'v0') => ({
  variacao: v,
  data,
  series,
});

const treino = (dia, ini = '18:00', fim = '19:00', extra = {}) => ({
  inicio: new Date(`${dia}T${ini}`).getTime(),
  fim: new Date(`${dia}T${fim}`).getTime(),
  fechado: true,
  ...extra,
});

const feitas = (s) =>
  s.CONQUISTAS.filter(([, , fn]) => fn(s.estatisticas())).map(([nome]) => nome);

test('o placar é só de treino: pontos fixos, nível a cada 300 e nenhuma conquista de pesagem', () => {
  const f = carregarTr('2026-10-21T19:00:00'); // quarta: sem o bônus de dia extra

  assert.deepEqual(
    f.PONTOS.map(([chave, pts]) => [chave, pts]),
    [
      ['treino', 50],
      ['exercicio', 10],
      ['piramide', 10],
      ['recorde', 25],
      ['extra', 20],
    ]
  );
  assert.equal(f.PTS_NIVEL, 300);

  const nomes = f.CONQUISTAS.map((c) => c[0]);

  assert.equal(nomes.length, 33);
  assert.equal(new Set(nomes).size, 33);

  for (const fora of ['Na balança', '−2 kg', '−5 kg']) assert.ok(!nomes.includes(fora));

  usar(f, { db: { exercicios: exercicios(), registros: [reg('2026-10-21')] } });
  const s = f.estatisticas();

  assert.equal(s.pontos, 60); // 50 do dia de treino + 10 do exercício
  assert.equal(s.nivel, 1);
  assert.equal(s.progresso, 60 / 300);
  assert.deepEqual(feitas(f), ['Primeiro treino']);
});

test('pirâmide completa (+10), recorde de carga (+25) e treino extra na segunda (+20) entram na conta', () => {
  const f = carregarTr('2026-10-21T19:00:00');

  usar(f, {
    db: {
      exercicios: exercicios(),
      registros: [
        reg('2026-10-14', [{ kg: 40, reps: 12 }]), // 1 série só: incompleta
        reg('2026-10-19', [
          { kg: 45, reps: 8 },
          { kg: 40, reps: 10 },
          { kg: 35, reps: 12 },
        ]), // segunda: completa (invertida 8/10/12) e bateu 40 kg
      ],
    },
  });
  const s = f.estatisticas();

  assert.deepEqual(
    [s.treino, s.exercicio, s.piramide, s.recorde, s.extra],
    [2, 2, 1, 1, 1]
  );
  assert.equal(s.pontos, 2 * 50 + 2 * 10 + 10 + 25 + 20);
  assert.equal(f.resumoDia('2026-10-19').pontos, 50 + 10 + 10 + 25 + 20); // segunda: +20 do extra
  assert.equal(f.resumoDia('2026-10-14').pontos, 50 + 10);
  assert.deepEqual(
    [...f.recordesAte('2026-10-14')].map((r) => r.data),
    []
  );
  assert.deepEqual(
    [...f.recordesAte()].map((r) => r.data),
    ['2026-10-19']
  );
});

test('o dia treinado vale com exercício registrado ou treino finalizado (mesmo sem séries salvas)', () => {
  const f = carregarTr('2026-10-21T19:00:00');

  usar(f, {
    db: {
      exercicios: exercicios(),
      registros: [reg('2026-10-14')],
      treinos: [
        treino('2026-10-14'), // mesmo dia do registro: um dia só
        treino('2026-10-15'),
        { ...treino('2026-10-16'), fechado: undefined }, // sem finalizar e sem séries: não conta
      ],
    },
  });
  assert.deepEqual([...f.diasTreinados()].sort(), ['2026-10-14', '2026-10-15']);
  assert.equal(f.estatisticas().treino, 2);
});

test('semanas com 2+ treinos: sequência atual (a semana em curso só conta batendo a meta) e a melhor', () => {
  const f = carregarTr('2026-10-21T19:00:00'); // quarta; semana de 19/10

  const dias = (...d) => d.map((x) => reg(x));

  usar(f, {
    db: {
      exercicios: exercicios(),
      // semanas de 5/10, 12/10 e 19/10 batidas; a de 28/9 com 1 treino só
      registros: dias(
        '2026-09-30',
        '2026-10-06',
        '2026-10-08',
        '2026-10-13',
        '2026-10-15',
        '2026-10-19',
        '2026-10-21'
      ),
    },
  });
  let s = f.estatisticas();

  assert.deepEqual(
    [s.sequencia, s.melhorSequencia, s.semanasMeta, s.semanasCheias],
    [3, 3, 3, 0]
  );

  // a semana em curso com 1 treino só não zera a sequência, só não soma
  usar(f, {
    db: {
      exercicios: exercicios(),
      registros: dias(
        '2026-10-06',
        '2026-10-08',
        '2026-10-13',
        '2026-10-15',
        '2026-10-21'
      ),
    },
  });
  s = f.estatisticas();
  assert.deepEqual([s.sequencia, s.melhorSequencia], [2, 2]);

  // uma semana vazia no meio quebra a sequência
  usar(f, {
    db: {
      exercicios: exercicios(),
      registros: dias(
        '2026-09-22',
        '2026-09-24',
        '2026-10-13',
        '2026-10-15',
        '2026-10-19',
        '2026-10-21'
      ),
    },
  });
  s = f.estatisticas();
  assert.deepEqual([s.sequencia, s.melhorSequencia], [2, 2]);

  // 3 treinos na mesma semana: semana cheia
  usar(f, {
    db: {
      exercicios: exercicios(),
      registros: dias('2026-10-19', '2026-10-20', '2026-10-21'),
    },
  });
  assert.equal(f.estatisticas().semanasCheias, 1);
  assert.ok(feitas(f).includes('Semana cheia'));
});

test('conquistas de longo prazo, ano a ano: 81 treinos em ~1 ano dão "1 ano de treino" e "40 semanas batidas"', () => {
  const f = carregarTr('2026-10-21T20:00:00');

  const registros = [];

  // 81 treinos em ~1 ano, 2 por semana
  for (let i = 0; i < 81; i++)
    registros.push(reg(f.somaDias('2025-10-15', Math.floor(i / 2) * 7 + (i % 2) * 2)));
  usar(f, { db: { exercicios: exercicios(), registros } });

  const anos = f.CONQUISTAS.filter((c) => c[3]).map((c) => c[3]);

  assert.deepEqual([...new Set(anos)], ['Ano 1', 'Ano 2', 'Ano 3', 'Ano 4', 'Ano 5']);
  assert.equal(f.CONQUISTAS.length - anos.length, 13);
  assert.deepEqual(
    feitas(f).filter((t) => /ano|semanas batidas/.test(t)),
    ['1 ano de treino', '40 semanas batidas']
  );
  assert.equal(f.estatisticas().dias, 371); // dias desde o 1º treino
});

test('"Rápido e completo": treino de 15 a 45 min com 4+ exercícios no dia', () => {
  const f = carregarTr('2026-10-21T20:00:00');

  const quatro = ['a', 'b', 'c', 'd'].map((v) => ({ ...variacao(v) }));

  const ex = quatro.map((v, i) => ({ ...exercicios()[0], id: 'e' + i, variacoes: [v] }));
  const regs = quatro.map((v) => reg('2026-10-21', [{ kg: 20, reps: 12 }], v.id));

  usar(f, {
    db: {
      exercicios: ex,
      registros: regs,
      treinos: [treino('2026-10-21', '18:00', '18:40')],
    },
  });
  assert.equal(f.estatisticas().rapido, true);
  usar(f, {
    db: {
      exercicios: ex,
      registros: regs,
      treinos: [treino('2026-10-21', '18:00', '19:00')],
    },
  });
  assert.equal(f.estatisticas().rapido, false); // 60 min
  usar(f, {
    db: {
      exercicios: ex,
      registros: regs.slice(0, 3),
      treinos: [treino('2026-10-21', '18:00', '18:40')],
    },
  });
  assert.equal(f.estatisticas().rapido, false); // 3 exercícios
});

test('o que o treino ganhou no dia: conquistas novas e o nível, comparando com o antes', () => {
  const f = carregarTr('2026-10-21T19:00:00');

  usar(f, { db: { exercicios: exercicios(), registros: [reg('2026-10-21')] } });
  assert.deepEqual(f.ganhosDoDia('2026-10-21'), {
    conquistas: [{ nome: 'Primeiro treino', desc: 'Faça o 1º exercício' }],
    nivel: null,
  });
  assert.equal(f.db.registros.length, 1); // o db volta ao que era

  // 4 treinos antes (4 × 60 = 240 pts) e mais um hoje (300): sobe para o nível 2
  const antes = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].map((d) =>
    reg(d)
  );

  usar(f, { db: { exercicios: exercicios(), registros: [...antes, reg('2026-10-21')] } });
  const g = f.ganhosDoDia('2026-10-21');

  assert.equal(g.nivel, 2);
  assert.ok(!g.conquistas.some((c) => c.nome === 'Primeiro treino')); // já tinha
});

test('resumo do dia: séries, volume em kg, recordes, pirâmides, pontos e calorias do treino e da esteira', () => {
  const f = carregarTr('2026-10-21T20:00:00');

  usar(f, {
    db: {
      exercicios: exercicios(),
      registros: [
        reg('2026-10-14', [{ kg: 40, reps: 12 }]),
        reg('2026-10-21', [
          { kg: 45, reps: 8 },
          { kg: 40, reps: 10 },
          { kg: 35, reps: 12 },
        ]),
      ],
      treinos: [
        treino('2026-10-21', '19:00', '19:50', {
          cardio: {
            inicio: new Date('2026-10-21T19:55').getTime(),
            ms: 15 * 60000,
            vel: 6.5,
            incl: 1,
          },
        }),
      ],
    },
    medidas: [{ data: '2026-10-21', hora: '07:00', peso: 90 }],
  });
  const r = f.resumoDia('2026-10-21');

  assert.equal(r.series, 3);
  assert.equal(r.volume, 45 * 8 + 40 * 10 + 35 * 12);
  f.db.exercicios[0].variacoes[0].lados = 2; // por lado: o total em kg é o dobro
  assert.equal(f.resumoDia('2026-10-21').volume, 2 * (45 * 8 + 40 * 10 + 35 * 12));
  f.db.exercicios[0].variacoes[0].lados = 1;
  assert.equal(r.recordes, 1);
  assert.equal(r.completas, 1);
  assert.equal(r.pontos, 50 + 10 + 10 + 25); // quarta: sem o extra da segunda
  // 3,5 × basal 1.898 kcal/dia ÷ 24 × 50/60 h
  assert.equal(r.kcal, 231);
  // 6,5 km/h a 1%: MET 4,65 × basal 1.898 ÷ 24 × 0,25 h
  assert.equal(r.kcalCardio, 92);
  assert.equal(f.resumoDia('2026-10-14').pontos, 50 + 10);
  assert.equal(f.resumoDia('2026-10-14').treino, undefined);
  assert.equal(f.resumoDia('2026-10-14').kcal, null);
  assert.equal(f.resumoDia('2026-10-19').pontos, 0); // sem exercício: nada

  // sem pesagem no app Corpo, sem calorias
  f.medidas.length = 0;
  assert.equal(f.resumoDia('2026-10-21').kcal, null);
  assert.equal(f.resumoDia('2026-10-21').kcalCardio, null);
});

test('a pesagem usada é a mais recente até o dia do treino (nunca uma de depois)', () => {
  const f = carregarTr('2026-10-21T20:00:00');

  const t = treino('2026-10-21', '19:00', '20:00');

  usar(f, {
    medidas: [
      { data: '2026-10-01', peso: 100 },
      { data: '2026-10-20', peso: 90 },
      { data: '2026-10-25', peso: 50 },
    ],
  });
  assert.equal(f.kcal(t), f.kcalTreino(90, '2026-10-21', 3600000));
});

test('cardio: texto com calorias, ajustes que começam do último cardio e limites', () => {
  const f = carregarTr('2026-10-21T20:00:00');

  usar(f, { medidas: [{ data: '2026-10-21', hora: '07:00', peso: 90 }] });
  const c = { inicio: 1, ms: 15 * 60000, vel: 6.5, incl: 1 };

  assert.equal(f.cardioTxt(c, '2026-10-21'), '15 min · 6,5 km/h · 1% · ~92 kcal');
  f.medidas.length = 0;
  assert.equal(f.cardioTxt(c, '2026-10-21'), '15 min · 6,5 km/h · 1%'); // sem pesagem, sem calorias

  usar(f, {});
  assert.deepEqual(f.ajustePadrao(), { min: 20, vel: 6, incl: 0 }); // sem cardio anterior: 20 min a 6 km/h no plano

  const com = (ms, vel = 5, incl = 2) => {
    usar(f, {
      db: {
        treinos: [
          treino('2026-10-14'),
          treino('2026-10-15', '18:00', '19:00', {
            cardio: { inicio: 1, ms, vel, incl },
          }),
        ],
      },
    });

    return f.ajustePadrao();
  };

  assert.deepEqual(com(17 * 60000), { min: 15, vel: 5, incl: 2 }); // duração arredondada a 5 min
  assert.equal(com(1 * 60000).min, 5); // piso
  assert.equal(com(300 * 60000).min, 120); // teto
  assert.deepEqual(f.CARDIO, { min: [5, 120, 5], vel: [1, 20, 0.5], incl: [0, 15, 1] });
});
