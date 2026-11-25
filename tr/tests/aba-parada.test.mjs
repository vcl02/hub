// Aba parada (sem navegador): o Treino aberto horas ou dias num aparelho, outro aparelho grava no mesmo exercício e no mesmo
// dia, e este mexe depois. O banco.js publicado roda inteiro (../../tests/nuvem-falsa.mjs) com uma nuvem falsa: nenhuma linha
// sobe inteira por cima do que este aparelho não viu (enviarMesclado do núcleo), e apagar não apaga o que mudou na nuvem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rodarBanco } from '../../tests/nuvem-falsa.mjs';

const HUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = (a) => path.join(HUB, a);
const json = (x) => JSON.parse(JSON.stringify(x));

const HOJE = '2026-11-24',
  ONTEM = '2026-11-23';

const EXERCICIO = {
  id: 'e1',
  grupo: 'Supino',
  regiao: 'Superior',
  series: 3,
  reps: 10,
  descanso: 90,
  variacoes: [
    { id: 'v1', nome: 'Supino reto', unidade: 'kg' },
    { id: 'v2', nome: 'Supino inclinado', unidade: 'kg' },
    { id: 'v3', nome: 'Crucifixo', unidade: 'kg' },
  ],
};

const s = (kg, reps) => ({ kg, reps });

// Um aparelho com a cópia `d` (e a base igual a ela) e a nuvem igual a essa cópia, que o teste muda depois
function aparelho(d) {
  const nuvem = { tabelas: {} },
    B = rodarBanco(
      [
        A('base/nucleo.js'),
        A('corpo/perfil.js'),
        A('tr/js/config.js'),
        A('tr/js/util.js'),
        A('tr/js/piramide.js'),
        A('tr/js/banco.js'),
      ],
      {
        nuvem,
        nomes: ['enviar', 'preparar', 'linhas', 'temPendente'],
        estado: ['db', 'base', 'usuario', 'erroSync'],
      }
    );

  B.E.usuario = { id: 'u1' };
  B.E.db = B.preparar(d);
  B.E.base = B.linhas(B.E.db);

  for (const [t, L] of Object.entries(B.E.base))
    nuvem.tabelas[t] = Object.values(L).map((l) => ({ user_id: 'u1', ...json(l) }));

  return { B, nuvem };
}

const registro = (nuvem, data) =>
  nuvem.tabelas.tr_registro.find((r) => r.variacao_id === 'v1' && r.data === data);

test('aba parada: os dois aparelhos lançaram séries no mesmo exercício e dia → todas ficam (nada sobe inteiro por cima)', async () => {
  const { B, nuvem } = aparelho({
    exercicios: [EXERCICIO],
    registros: [{ variacao: 'v1', data: HOJE, series: [s(20, 10)] }],
    treinos: [],
  });

  // outro aparelho: mais uma série hoje e o descanso do exercício
  registro(nuvem, HOJE).series.push(s(22, 8));
  nuvem.tabelas.tr_exercicio[0].descanso = 120;

  // este (cópia velha): outra série e as reps do exercício
  const d = json(B.E.db);

  d.registros[0].series.push(s(21, 9));
  d.exercicios[0].reps = 12;
  B.E.db = B.preparar(d);
  await B.enviar();

  assert.equal(B.E.erroSync, '');
  assert.deepEqual(json(registro(nuvem, HOJE).series), [s(20, 10), s(22, 8), s(21, 9)]);
  assert.equal(nuvem.tabelas.tr_exercicio[0].descanso, 120);
  assert.equal(nuvem.tabelas.tr_exercicio[0].reps, 12);
  // este aparelho fica com o que a nuvem tem, sem pendente
  assert.deepEqual(json(B.E.db.registros[0].series), [s(20, 10), s(22, 8), s(21, 9)]);
  assert.equal(B.E.db.exercicios[0].descanso, 120);
  assert.equal(B.temPendente(), false);
});

test('aba parada: sem mudança na nuvem, a série daqui sobe como está (na ordem daqui); apagar o registro que mudou na nuvem não apaga, o que não mudou sai', async () => {
  const { B, nuvem } = aparelho({
    exercicios: [EXERCICIO],
    registros: [
      { variacao: 'v1', data: ONTEM, series: [s(20, 10)] },
      { variacao: 'v1', data: HOJE, series: [s(20, 10), s(21, 10)] },
    ],
    treinos: [],
  });

  // editar a 1ª série daqui (a nuvem não mudou): fica no lugar
  let d = json(B.E.db);

  d.registros.find((r) => r.data === HOJE).series[0].reps = 12;
  B.E.db = B.preparar(d);
  await B.enviar();
  assert.deepEqual(json(registro(nuvem, HOJE).series), [s(20, 12), s(21, 10)]);

  // outro aparelho mexeu no de ontem; este apaga os dois
  registro(nuvem, ONTEM).series.push(s(25, 5));
  d = json(B.E.db);
  d.registros = [];
  B.E.db = B.preparar(d);
  await B.enviar();

  assert.deepEqual(
    nuvem.tabelas.tr_registro.map((r) => r.data),
    [ONTEM]
  );
  assert.deepEqual(json(B.E.db.registros.map((r) => [r.data, r.series.length])), [
    [ONTEM, 2],
  ]);
  assert.equal(B.temPendente(), false);
});

test('metrô na aba parada: a mescla chegou mas a resposta se perdeu → a tentativa seguinte não repete a série daqui nem tira a do outro aparelho', async () => {
  const { B, nuvem } = aparelho({
    exercicios: [EXERCICIO],
    registros: [{ variacao: 'v1', data: HOJE, series: [s(20, 10)] }],
    treinos: [],
  });

  registro(nuvem, HOJE).series.push(s(22, 8)); // outro aparelho
  const d = json(B.E.db);

  d.registros[0].series.push(s(21, 9)); // este
  B.E.db = B.preparar(d);

  nuvem.semResposta = true;
  await B.enviar();
  assert.equal(B.temPendente(), true);
  assert.deepEqual(json(registro(nuvem, HOJE).series), [s(20, 10), s(22, 8), s(21, 9)]);

  nuvem.semResposta = false;
  await B.enviar();
  assert.deepEqual(json(registro(nuvem, HOJE).series), [s(20, 10), s(22, 8), s(21, 9)]);
  assert.deepEqual(json(B.E.db.registros[0].series), [s(20, 10), s(22, 8), s(21, 9)]);
  assert.equal(B.temPendente(), false);
  assert.deepEqual(JSON.parse(B.guardado.get('tr.vooLinhas.u1')), {});
});

test('mais de 1000 registros da mesma variação (o PostgREST corta em 1000): a linha mexida nos dois aparelhos mescla e a apagada sai da nuvem', async () => {
  // 1100 dias seguidos de Supino reto, um registro por dia
  const dias = Array.from({ length: 1100 }, (_, i) =>
      new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10)
    ),
    { B, nuvem } = aparelho({
      exercicios: [EXERCICIO],
      registros: dias.map((data) => ({ variacao: 'v1', data, series: [s(20, 10)] })),
      treinos: [],
    });

  const mexido = dias[1050],
    apagado = dias[1080];

  registro(nuvem, mexido).series.push(s(22, 8)); // outro aparelho
  const d = json(B.E.db);

  d.registros.find((r) => r.data === mexido).series.push(s(21, 9)); // este
  d.registros = d.registros.filter((r) => r.data !== apagado);
  B.E.db = B.preparar(d);
  await B.enviar();

  assert.equal(B.E.erroSync, '');
  assert.deepEqual(json(registro(nuvem, mexido).series), [s(20, 10), s(22, 8), s(21, 9)]);
  assert.equal(registro(nuvem, apagado), undefined);
  assert.equal(nuvem.tabelas.tr_registro.length, 1099);
  assert.equal(B.temPendente(), false);
});
