// O treino do dia sem navegador (js/treino.js): quando ele começa, quando fecha por inatividade, quando trava o dia (um treino
// por dia) e como se anda entre os dias treinados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarTr, usar, puro } from './helpers/js.mjs';

const hora = (dia, h) => new Date(`${dia}T${h}`).getTime();

const exercicio = {
  id: 'e0',
  regiao: 'Pernas',
  ativo: 0,
  variacoes: [{ id: 'v0', unidade: 'kg' }],
};

const registroDeHoje = {
  variacao: 'v0',
  data: '2026-10-21',
  series: [{ kg: 40, reps: 8 }],
};

// Um relógio por cenário, com o db do cenário anterior (o app guarda tudo no db)
function em(agora, db) {
  let gravou = 0;
  const f = carregarTr(agora, { gravar: () => gravou++ });

  usar(f, { db: { exercicios: [exercicio], ...db } });

  return Object.assign(f, { gravacoes: () => gravou });
}

test('o 1º toque dentro de um exercício começa o treino; os seguintes só levam o fim para agora', () => {
  const a = em('2026-10-21T19:00:00', {});

  a.marcarAtividade();
  assert.deepEqual(puro(a.db.treinos), [
    { inicio: hora('2026-10-21', '19:00'), fim: hora('2026-10-21', '19:00') },
  ]);
  assert.equal(a.gravacoes(), 1);

  const b = em('2026-10-21T19:25:00', { treinos: a.db.treinos });

  b.marcarAtividade();
  assert.equal(b.db.treinos.length, 1);
  assert.deepEqual(
    [b.hhmm(b.db.treinos[0].inicio), b.hhmm(b.db.treinos[0].fim)],
    ['19:00', '19:25'] // última interação 19:25
  );
});

test('30 min sem mexer fecha o treino no horário da última interação e, com exercícios feitos, trava o dia', () => {
  const t = { inicio: hora('2026-10-21', '19:00'), fim: hora('2026-10-21', '19:25') };

  const f = em('2026-10-21T20:10:00', { treinos: [t], registros: [registroDeHoje] });

  assert.equal(f.INATIVO, 30 * 60 * 1000);
  assert.equal(f.emAndamento(t), false); // 45 min depois da última interação
  assert.ok(f.travadoHoje());
  f.marcarAtividade(); // travado: nada muda
  assert.deepEqual(
    [f.hhmm(f.db.treinos[0].inicio), f.hhmm(f.db.treinos[0].fim)],
    ['19:00', '19:25']
  );
  assert.equal(f.gravacoes(), 0);

  // 29 min depois ainda é o mesmo treino
  const g = em('2026-10-21T19:54:00', { treinos: [t], registros: [registroDeHoje] });

  assert.equal(g.emAndamento(t), true);
  assert.equal(g.travadoHoje(), null);
});

test('abrir o app e não treinar não trava o dia: recomeça a contagem, sem 2º treino', () => {
  const t = { inicio: hora('2026-10-21', '18:00'), fim: hora('2026-10-21', '18:00') };

  const f = em('2026-10-21T18:40:00', { treinos: [t] }); // esteira, sem marcar série

  assert.equal(f.travadoHoje(), null);
  f.marcarAtividade();
  assert.equal(f.db.treinos.length, 1);
  assert.equal(f.hhmm(f.db.treinos[0].inicio), '18:40');
  assert.equal(f.emAndamento(f.db.treinos[0]), true);
});

test('um treino por dia: finalizado trava (até sem séries salvas); reabrir destrava; ontem não trava hoje', () => {
  const fechado = {
    inicio: hora('2026-10-21', '17:43'),
    fim: hora('2026-10-21', '18:37'),
    fechado: true,
  };

  const f = em('2026-10-21T20:00:00', { treinos: [fechado] }); // finalizado, sem registros

  assert.equal(f.treinoHoje().inicio, fechado.inicio);
  assert.ok(f.travadoHoje());
  f.marcarAtividade();
  assert.deepEqual(
    [f.hhmm(f.db.treinos[0].inicio), f.hhmm(f.db.treinos[0].fim)],
    ['17:43', '18:37']
  ); // não recomeçou a contagem
  assert.equal(f.db.treinos.length, 1);

  // reabrir: sai o fechado e o fim vai para agora
  Object.assign(f.db.treinos[0], { fim: f.Date.now() });
  delete f.db.treinos[0].fechado;
  assert.equal(f.travadoHoje(), null);

  // treino de ontem: hoje começa um novo
  const ontem = em('2026-10-22T09:00:00', { treinos: [fechado] });

  assert.equal(ontem.treinoHoje(), null);
  assert.equal(ontem.travadoHoje(), null);
  ontem.marcarAtividade();
  assert.equal(ontem.db.treinos.length, 2);
});

test('dias treinados vizinhos: o anterior e o seguinte a um dia, e null nas pontas', () => {
  const fim = (d) => ({ inicio: hora(d, '18:00'), fim: hora(d, '19:00'), fechado: true });

  const f = em('2026-10-22T19:00:00', {
    treinos: [fim('2026-10-08'), fim('2026-10-15'), fim('2026-10-21')],
    registros: [{ ...registroDeHoje, data: '2026-10-21' }],
  });

  assert.equal(f.diaVizinho(-1, '2026-10-21'), '2026-10-15');
  assert.equal(f.diaVizinho(-1, '2026-10-15'), '2026-10-08');
  assert.equal(f.diaVizinho(-1, '2026-10-08'), null); // o 1º treino
  assert.equal(f.diaVizinho(1, '2026-10-15'), '2026-10-21');
  assert.equal(f.diaVizinho(1, '2026-10-21'), null); // depois do mais recente: volta à lista de hoje
  assert.equal(f.diaVizinho(-1), '2026-10-21'); // sem dia: a partir de hoje
  assert.equal(f.diaVizinho(1, '2026-10-10'), '2026-10-15'); // de um dia sem treino também anda
});
