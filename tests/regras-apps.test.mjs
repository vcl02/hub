// Regras próprias de cada app, sem navegador (milissegundos): a função sai do arquivo publicado do app (tests/funcoes.mjs) e
// roda com dados fixos. O caminho pela tela continua nos testes de navegador de cada app; aqui a conta em si, com os números.
//   · gasto e meta do dia (al/gasto.js com corpo/perfil.js), o mesmo no al e no hábito Alimentação da página inicial
//   · Água: lembretes do dia e limpeza do db (formato antigo, bebidas)
//   · Corpo: horas de sono e o nível (BOM, OK, RUIM)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregar, carregarArquivos } from './funcoes.mjs';

const json = x => JSON.parse(JSON.stringify(x));
const G = carregarArquivos(['corpo/perfil.js', 'al/gasto.js'], ['gastoNoDia', 'metaKcal', 'tmb', 'ROTINA', 'DEFICIT_META', 'FATOR_ATIVIDADE']);
const ms = (dia, h) => new Date(`${dia}T${String(h).padStart(2, '0')}:00:00`).getTime();

test('gasto do dia: basal (Mifflin pela idade do dia) × 1,2; meta = gasto − 500; sem pesagem nenhuma, sem gasto', () => {
  const sexta = '2026-10-30', medidas = [{ data: '2026-10-01', hora: '', peso: 100 }];
  const g = G.gastoNoDia(medidas, [], [], sexta);
  // 10 × 100 + 6,25 × 178 − 5 × 24 anos + 5 = 1.997,5 → 1.998; × 1,2 = 2.397,6 → 2.398
  assert.deepEqual([g.peso, g.basal, g.rotina, g.treino, g.caminhada, g.previsto, g.total], [100, 1998, 2398, 0, null, null, 2398]);
  assert.equal(G.metaKcal(g), 2398 - G.DEFICIT_META);
  assert.equal(G.gastoNoDia([], [], [], sexta), null);
  assert.equal(G.gastoNoDia([{ data: '2026-11-05', hora: '', peso: 90 }], [], [], sexta).peso, 90);   // só pesagem depois do dia: vale a primeira
});

test('gasto do dia: caminhada soma só o que passa da basal (ACSM); sem tempo nem distância, 20 min a 5 km/h', () => {
  const sexta = '2026-10-30', medidas = [{ data: '2026-10-01', hora: '', peso: 100 }];
  const c = G.gastoNoDia(medidas, [], [{ hora: '08:00', km: 3, minutos: 36 }], sexta).caminhada;
  // 5 km/h: MET = (0,1 × 83,3 + 3,5) ÷ 3,5 = 3,381; (MET − 1) × 1.998/24 × 0,6 h = 118,9 → 119
  assert.equal(c.kcal, 119);
  const padrao = G.gastoNoDia(medidas, [], [{ hora: '08:00' }], sexta).caminhada.kcal;
  assert.equal(padrao, Math.round((((0.1 * 5000 / 60 + 3.5) / 3.5) - 1) * 1998 / 24 * 20 / 60));
  const g = G.gastoNoDia(medidas, [], [{ hora: '08:00', km: 3, minutos: 36 }, { hora: '18:00' }], sexta);
  assert.equal(g.total, 2398 + 119 + padrao);                                   // os trechos somam
});

test('gasto do dia: dia de treino sem treino prevê 1 h (ou a média dos últimos); com treino, conta o treino e não prevê', () => {
  const quarta = '2026-10-28', medidas = [{ data: '2026-10-01', hora: '', peso: 100 }];
  assert.ok(G.ROTINA.treino.includes(3));
  const sem = G.gastoNoDia(medidas, [], [], quarta);
  assert.deepEqual([sem.previsto.minutos, sem.previsto.extra, sem.treino], [60, false, 0]);
  assert.ok(sem.previsto.kcal > 0);
  const antes = [{ inicio: ms('2026-10-22', 18), fim: ms('2026-10-22', 18) + 45 * 6e4 }];
  assert.equal(G.gastoNoDia(medidas, antes, [], quarta).previsto.minutos, 45);   // a média dos últimos treinos
  const com = G.gastoNoDia(medidas, [{ inicio: ms(quarta, 18), fim: ms(quarta, 19) }], [], quarta);
  assert.equal(com.previsto, null);
  assert.equal(com.treino, sem.previsto.kcal);                                   // 1 h feita = 1 h prevista
  assert.equal(com.total, com.rotina + com.treino);
  assert.equal(G.gastoNoDia(medidas, [], [], '2026-10-26').previsto.extra, true);   // segunda: o extra opcional
});

// ---------- Água ----------
const contextoAgua = (hojeDia, agora, aguas = []) => ({
  LEMBRETE_INICIO: 10, LEMBRETE_FIM: 16, ROTINA: G.ROTINA,
  deIso: d => { const [a, m, x] = d.split('-').map(Number); return new Date(a, m - 1, x); },
  pad: n => String(n).padStart(2, '0'), minutos: h => +h.slice(0, 2) * 60 + +h.slice(3),
  hoje: () => hojeDia, agoraHHMM: () => agora, doDia: () => ({ aguas })
});
test('água: lembretes de hora em hora (de 2 em 2 nos dias presenciais e no fim de semana); feito na meia hora em volta', () => {
  const L = (dia, agora, aguas) => json(carregar('agua/js/conta.js', ['lembretes', 'lembreteAgora'], contextoAgua('2026-10-30', agora, aguas)).lembretes(dia, agora));
  assert.deepEqual(L('2026-10-30', '12:10', []).map(x => x.hora), ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);   // sexta
  assert.deepEqual(L('2026-10-29', '12:10', []).map(x => x.hora), ['10:00', '12:00', '14:00', '16:00']);   // quinta (presencial)
  const r = L('2026-10-30', '12:10', [{ hora: '09:35' }, { hora: '11:20' }]);
  assert.deepEqual(r.slice(0, 4).map(x => x.estado), ['feito', 'feito', 'atrasado', 'depois']);   // cada um vale de meia hora antes a meia hora antes do próximo: 9:35 → 10h, 11:20 → 11h
  const vez = carregar('agua/js/conta.js', ['lembretes', 'lembreteAgora'], contextoAgua('2026-10-30', '12:10', [{ hora: '09:35' }])).lembreteAgora('2026-10-30');
  assert.equal(vez.hora, '12:00');                                               // a da vez, ainda sem água
  assert.equal(carregar('agua/js/conta.js', ['lembretes', 'lembreteAgora'], contextoAgua('2026-10-30', '17:05', [])).lembreteAgora('2026-10-30'), null);   // depois das 17, nada
});

test('água: a limpeza do db tira o formato antigo (xixis), horário ou ml inválido e dia vazio; bebida vira a água dela', () => {
  const { preparar } = carregar('agua/js/banco.js', ['hhmmOk', 'preparar'], {
    BEBIDAS: { suco: { agua: 0.88 } }, ML_MAX: 3000, num: x => +x, dataOk: d => /^\d{4}-\d{2}-\d{2}$/.test(d)
  });
  const d = json(preparar({ dias: [
    { data: '2026-10-27', aguas: [{ hora: '12:00', ml: 150 }, { hora: '9:00', ml: 100 }, { hora: '10:00', ml: 0 }, { hora: '08:00', ml: 300, bebida: 'suco', volume: 300 }], xixis: ['10:00'] },
    { data: '2026-10-28', aguas: [{ hora: '25:00', ml: 100 }, { hora: '10:60', ml: 100 }] },   // horário impossível
    { data: 'ontem', aguas: [{ hora: '10:00', ml: 100 }] }
  ] }));
  assert.deepEqual(d, { dias: [{ data: '2026-10-27', aguas: [{ hora: '08:00', ml: 264, bebida: 'suco', volume: 300 }, { hora: '12:00', ml: 150 }] }] });
});

// ---------- Corpo ----------
test('corpo: horas de sono passando da meia-noite; BOM com 8 h, OK de 7 a 8, RUIM abaixo de 7', () => {
  const C = carregar('corpo/js/config.js', ['SONO_BOM', 'horasDeSono', 'nivelSono']);   // SONO_OK vem na mesma linha do SONO_BOM
  assert.deepEqual([C.horasDeSono('23:30', '07:00'), C.horasDeSono('01:00', '08:15'), C.horasDeSono('22:00', '22:00'), C.horasDeSono('', '07:00')], [7.5, 7.25, 0, null]);
  assert.deepEqual([8, 7.99, 7, 6.98].map(h => C.nivelSono(h).txt), ['BOM', 'OK', 'OK', 'RUIM']);
});

// ---------- Treino ----------
const P = carregar('tr/js/piramide.js', ['arred', 'outraUnidade', 'fatorUnidade', 'naOutra', 'daOutra', 'umAUm', 'alvoReps', 'alvoKg', 'plano', 'completo'],
  { ...carregar('tr/js/config.js', ['LB', 'semPeso']) });
test('treino: pirâmide crescente, invertida e reta (reps −2 por série, peso ~10% ao passo); aquecimento com metade e 15 reps', () => {
  const v = { unidade: 'kg', passo: 2.5, lados: 1 }, e = modo => ({ modo, series: 3, reps: 12 });
  const so = L => json(L.map(s => [s.nome, s.kg, s.reps]));
  assert.deepEqual(so(P.plano(e('crescente'), v, 40, true)), [['Aquecimento', 20, 15], ['Série 1', 40, 12], ['Série 2', 45, 10], ['Série 3', 50, 8]]);   // 10% de 40 = 4 → 5 no passo de 2,5
  assert.deepEqual(so(P.plano(e('invertida'), v, 40, false)), [['Série 1', 40, 8], ['Série 2', 35, 10], ['Série 3', 30, 12]]);
  assert.deepEqual(so(P.plano(e('reta'), v, 40, false)), [['Série 1', 40, 12], ['Série 2', 40, 12], ['Série 3', 40, 12]]);
  assert.deepEqual(so(P.plano(e('crescente'), v, 0, true)).map(s => s[1]), [null, null, null, null]);   // sem peso ainda: só as reps
  assert.deepEqual(so(P.plano(e('crescente'), v, 40, false, { 1: { kg: 41, reps: 9 } }))[1], ['Série 2', 41, 9]);   // ajuste da série vence
  assert.deepEqual(so(P.plano(e('crescente'), { unidade: 'corpo' }, 0, true)), [['Série 1', 0, 12], ['Série 2', 0, 10], ['Série 3', 0, 8]]);   // peso do corpo: sem aquecimento
  assert.equal(P.alvoReps({ modo: 'crescente', series: 8, reps: 12 }, 7), 1);   // nunca menos de 1
});

test('treino: completo só com todas as séries no alvo e sem falha; kg ↔ lb; ± de 1 em 1 arredonda primeiro', () => {
  const e = { modo: 'crescente', series: 3, reps: 12 }, r = (...reps) => ({ series: reps.map(x => typeof x === 'number' ? { kg: 40, reps: x } : { kg: 40, reps: 12, falha: true }) });
  assert.equal(P.completo(r(12, 10, 8), e), true);
  assert.equal(P.completo(r(12, 10, 7), e), false);                              // uma abaixo do alvo
  assert.equal(P.completo(r(12, 10, 'f'), e), false);                           // falhou numa série
  assert.equal(P.completo(r(12, 10), e), false);                                // faltou série
  assert.deepEqual(json([P.naOutra(100, { unidade: 'kg' }), P.daOutra(220.5, { unidade: 'kg' }), P.naOutra(10, { unidade: 'nível' })]), [220.5, 100.02, 10]);
  assert.deepEqual([P.umAUm(40, 1), P.umAUm(40.5, 1), P.umAUm(40.5, -1), P.umAUm(0, -1)], [41, 41, 40, 0]);
});

// ---------- Formato antigo: a cópia local de uma versão anterior vira o formato de agora, sem perder o que tinha ----------
test('corpo: formato antigo (evacuou sim, sono só em horas, sono_em) vira o de agora; horário inválido e dia vazio saem', () => {
  const U = carregar('corpo/js/util.js', ['pad', 'dataOk', 'num']);
  const C = carregar('corpo/js/config.js', ['SONO_ANTIGO_DORMIU', 'horaOk', 'maisMinutos', 'horasDeSono'], U);
  const { ordenarMedidas } = carregarArquivos(['corpo/perfil.js'], ['ordenarMedidas']);
  const { preparar } = carregar('corpo/js/banco.js', ['preparar'], { ...U, ...C, ordenarMedidas });
  const d = json(preparar({ medidas: [], dias: [
    { data: '2026-10-20', evacuou: true, sono: 7.5, sono_em: '2026-10-20T10:00:00.000Z' },   // migration 01 e sono antes dos horários
    { data: '2026-10-21', evacuacoes: ['09:00', 'x'], xixis: ['14:00', '25:61', '06:00'], dormiu: '23:30', acordou: '07:00' },
    { data: '2026-10-22', evacuou: false, xixis: [] },                                          // nada: sai
    { data: '22/10', xixis: ['10:00'] }
  ] }));
  assert.deepEqual(d.dias, [
    { data: '2026-10-20', evacuacoes: [''], xixis: [], dormiu: '23:00', acordou: '06:30', sono: 7.5, sonoEm: '2026-10-20T10:00:00.000Z' },
    { data: '2026-10-21', evacuacoes: ['', '09:00'], xixis: ['06:00', '14:00'], dormiu: '23:30', acordou: '07:00', sono: 7.5 }
  ]);
});

test('alimentação: formato antigo da caminhada (andou + total do dia) vira 1 trecho; valores fora da faixa e marmita acabada saem', () => {
  const { preparar } = carregar('al/js/banco.js', ['preparar'], { ...carregar('al/js/util.js', ['num']), ...carregar('al/js/config.js', ['TRECHOS_MAX', 'MARMITAS_MAX']) });
  const d = json(preparar({
    itens: [{ id: 1, nome: ' Arroz ', porcao: '1 colher', kcal: 32, usos: '3' }, { id: 2, nome: '' }],
    registros: [{ id: 'r', data: '2026-10-20', hora: '24:00', nome: 'Arroz', qtd: 99, kcal: -5, prot: 900 }],
    dias: [{ data: '2026-10-20', andou: true, minutos: 30, km: 2 }, { data: '2026-10-21', caminhadas: [{ hora: '18:00' }, { hora: '08:00', minutos: 9999 }] }, { data: '2026-10-22', andou: false }],
    marmitas: [{ id: 'm1', nome: 'Feijoada', restam: 0, itens: [{ nome: 'x' }] }, { id: 'm2', nome: 'Frango', restam: 3, itens: [{ nome: 'Frango', qtd: 2, kcal: 200 }] }]
  }));
  assert.deepEqual(d.itens, [{ id: '1', nome: 'Arroz', porcao: '1 colher', kcal: 32, prot: 0, carb: 0, gord: 0, usos: 3 }]);
  assert.deepEqual(d.registros, [{ id: 'r', data: '2026-10-20', hora: '', nome: 'Arroz', porcao: '', qtd: 20, kcal: 0, prot: 500, carb: 0, gord: 0 }]);
  assert.deepEqual(d.dias, [{ data: '2026-10-20', caminhadas: [{ hora: '', minutos: 30, km: 2 }] }, { data: '2026-10-21', caminhadas: [{ hora: '08:00' }, { hora: '18:00' }] }]);
  assert.deepEqual(d.marmitas.map(m => [m.id, m.restam, m.itens[0].qtd]), [['m2', 3, 2]]);
});

test('treino: formato antigo (slots/logs, carga + reps) vira exercícios com 3 variações e séries da pirâmide crescente', () => {
  const U = carregar('tr/js/util.js', ['num', 'dataOk', 'intEntre', 'novoId']), K = carregar('tr/js/config.js', ['LB', 'semPeso', 'UNIDADES', 'REGIOES', 'MODO_PADRAO', 'MODOS', 'passoPadrao', 'PADRAO']);
  const Pi = carregar('tr/js/piramide.js', ['arred', 'alvoKg'], K);
  const { preparar } = carregar('tr/js/banco.js', ['repsDe', 'variacaoAtiva', 'preparar'], { ...U, ...K, ...Pi });
  const d = json(preparar({ slots: [{ id: 'leg', g: 'Leg press', sets: 3, reps: '8-12', rest: 90, a: 0, vs: [{ id: 'v1', pt: 'Leg press 45°', u: 'kg' }] }],
    logs: [{ v: 'v1', d: '2026-10-01', w: 100, r: [12, 10, 8] }, { v: 'sumiu', d: '2026-10-01', w: 50, r: 10 }], medidas: [{ data: '2026-10-01', peso: 99 }] }));
  const e = d.exercicios[0];
  assert.deepEqual([e.id, e.grupo, e.regiao, e.series, e.reps, e.descanso, e.variacoes.length, e.variacoes[0].nome, e.modo], ['leg', 'Leg press', 'Pernas', 3, 12, 90, 3, 'Leg press 45°', K.MODO_PADRAO]);
  assert.deepEqual(d.registros, [{ variacao: 'v1', data: '2026-10-01', series: [{ kg: 100, reps: 12 }, { kg: 110, reps: 10 }, { kg: 120, reps: 8 }] }]);   // variação que não existe sai
  assert.equal('medidas' in d, false);                                          // pesagens agora são do Corpo
  assert.throws(() => preparar({ exercicios: 'x' }));                           // formato desconhecido: erro (o app não sobrescreve nada)
});
