// Regras dos hábitos (habitos.js) sem navegador: estados de cada dia, ofensivas, dias perfeitos, proteções e o resumo de hoje.
// Roda corpo/perfil.js, al/gasto.js e habitos.js num mesmo contexto, como a página inicial carrega.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = arquivo => readFileSync(path.join(RAIZ, arquivo), 'utf8');
const ctx = vm.createContext({});
for (const f of ['corpo/perfil.js', 'al/gasto.js', 'habitos.js']) vm.runInContext(ler(f), ctx, { filename: f });
const H = vm.runInContext('({ comPendentesDoAl, calcularHabitos, resumoDeHoje, ateODia, estadoNoDia, HABITOS, META_AGUA_ML, PROTECOES_MAX, LANCADO_NO_DIA_DESDE, LIMITE_BESTEIRA_DIA, gastoNoDia, metaKcal })', ctx);
const json = x => JSON.parse(JSON.stringify(x));

// Instante local (o hub usa o relógio do celular): dia AAAA-MM-DD e hora
const as = (dia, h = 12) => { const [a, m, d] = dia.split('-').map(Number); return new Date(a, m - 1, d, h).getTime(); };
const vazio = () => ({ treinos: [], comidas: {}, trechos: {}, medidas: [], sonos: {}, aguas: {}, besteiras: {} });
const treino = dia => ({ inicio: as(dia, 18), fim: as(dia, 19) });
// 2026-11: qua 4, qui 5; outubro: qua 21/28, qui 22/29
const HOJE = '2026-11-05';

test('lista de hábitos: treino, déficit, peso, sono, água e besteira (Fin), cada um com a pasta do app', () => {
  assert.deepEqual(json(H.HABITOS.map(h => [h.id, h.pasta])), [['treino', 'tr/'], ['deficit', 'al/'], ['peso', 'corpo/'], ['sono', 'corpo/'], ['agua', 'agua/'], ['besteira', 'fin/']]);
  assert.equal(H.META_AGUA_ML, +ler('agua/js/config.js').match(/const META_ML = (\d+);/)[1]);   // a mesma meta da Água
  assert.equal(H.PROTECOES_MAX, 2);
});

test('treino: só quarta e quinta contam (segunda não); folga não quebra, falta quebra', () => {
  const D = vazio();
  D.treinos = ['2026-10-21', '2026-10-28', '2026-11-04', '2026-11-02'].map(treino);   // faltam as quintas 22 e 29/10; seg 2/11 é extra
  const R = H.calcularHabitos(D, HOJE).habitos.treino;
  assert.equal(R.dias['2026-10-22'], 'falhou');                     // sem semana perfeita, sem proteção
  assert.equal(R.dias['2026-11-02'], 'folga');                      // segunda: mesmo treinando, não conta
  assert.equal(R.dias['2026-11-03'], 'folga');
  assert.equal(R.dias['2026-10-29'], 'falhou');
  assert.equal(R.hoje, 'pendente');                                  // quinta, ainda sem treino
  assert.equal(R.ofensiva, 1);                                       // só qua 4/11 (qui 29/10 quebrou)
  D.treinos.push(treino(HOJE));
  const R2 = H.calcularHabitos(D, HOJE).habitos.treino;
  assert.deepEqual([R2.hoje, R2.ofensiva], ['feito', 2]);
});

test('peso: pesagem lançada no próprio dia (a partir de 27/10); antes disso, qualquer pesagem conta', () => {
  const D = vazio();
  const iso = (dia, h) => new Date(as(dia, h)).toISOString();
  D.medidas = [
    { data: '2026-10-26', hora: '07:00', peso: 100 },                                   // antes da regra, sem pesoEm: conta
    { data: '2026-10-27', hora: '07:00', peso: 100, pesoEm: iso('2026-10-27', 7) },
    { data: '2026-10-28', hora: '07:00', peso: 100, pesoEm: iso('2026-10-29', 9) },     // lançado no dia seguinte: falhou
    { data: '2026-10-29', hora: '07:00', peso: 100 },                                   // sem pesoEm depois da regra: falhou
    { data: '2026-10-30', hora: '07:00', cintura: 100 },                                // só barriga: não é pesagem
    { data: '2026-10-31', hora: '07:00', peso: 100, pesoEm: iso('2026-10-31', 7) }
  ];
  const dia = d => H.estadoNoDia('peso', d, D, HOJE);
  assert.deepEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'].map(dia), ['feito', 'feito', 'falhou', 'falhou', 'falhou', 'feito']);
  D.sonos[HOJE] = { sono: 9, sonoEm: iso(HOJE, 8) };                 // o sono não conta para o peso
  assert.equal(dia(HOJE), 'pendente');
  D.medidas.push({ data: HOJE, hora: '07:00', peso: 100, pesoEm: iso(HOJE, 7) });
  assert.equal(dia(HOJE), 'feito');
  assert.equal(H.LANCADO_NO_DIA_DESDE, '2026-10-27');
});

test('sono: 7 h ou mais, lançado no próprio dia; a noite de terça para quarta (quarta) é folga; lançado com menos já falha', () => {
  const D = vazio();
  const iso = (dia, h) => new Date(as(dia, h)).toISOString();
  const sono = (h, em) => ({ sono: h, ...(em && { sonoEm: iso(em, 8) }) });
  D.sonos = { '2026-10-26': sono(6), '2026-10-27': sono(7, '2026-10-27'), '2026-10-28': sono(4, '2026-10-28'),
    '2026-10-29': sono(6.98, '2026-10-29'), '2026-10-30': sono(9.5, '2026-10-30'), '2026-10-31': sono(8, '2026-11-01') };
  D.medidas = [{ data: '2026-10-27', hora: '07:00', peso: 100, pesoEm: iso('2026-10-27', 7) }];   // pesar não conta para o sono
  const dia = (d, hoje = HOJE) => H.estadoNoDia('sono', d, D, hoje);
  // 26: antes da regra de lançar no dia, mas 6 h: falhou · 27: 7 h · 28: quarta, folga mesmo com 4 h · 29: 6 h 59 · 30: 9 h 30
  // · 31: lançado no dia seguinte · 1/11 sem sono
  assert.deepEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].map(d => dia(d)),
    ['falhou', 'feito', 'folga', 'falhou', 'feito', 'falhou', 'falhou']);
  assert.equal(dia(HOJE), 'pendente');                                 // quinta sem sono ainda
  D.sonos[HOJE] = sono(6.5, HOJE);
  assert.equal(dia(HOJE), 'falhou');                                   // a noite já foi: não dá mais
  assert.equal(json(H.resumoDeHoje(D, HOJE)).sono.acima, true);        // em vermelho
  D.sonos[HOJE] = sono(7.5, HOJE);
  assert.equal(dia(HOJE), 'feito');
  assert.equal(json(H.resumoDeHoje(D, HOJE)).sono.valor, '7 h 30');
  assert.equal(json(H.resumoDeHoje(vazio(), '2026-11-04')).sono.valor, 'Folga hoje');   // quarta sem sono
  const R = H.calcularHabitos(D, HOJE).habitos.sono;
  assert.deepEqual([R.dias['2026-11-04'], R.ofensiva], ['folga', 1]);  // quarta não quebra nem soma; 1/11 quebrou
});

test('besteira (Fin): qua e qui no máximo R$ 22 por dia; os outros dias são folga; antes de 27/10 não conta', () => {
  const D = vazio();
  const dia = (d, hoje = HOJE) => H.estadoNoDia('besteira', d, D, hoje);
  D.besteiras = { '2026-11-04': 22, '2026-11-05': 22.01, '2026-11-02': 80 };
  // 4/11 qua no limite: feito · 5/11 qui 1 centavo acima: falhou · 2/11 seg: folga, gaste o que for
  assert.deepEqual([dia('2026-11-04'), dia('2026-11-05'), dia('2026-11-02')], ['feito', 'falhou', 'folga']);
  assert.equal(dia('2026-11-11', '2026-11-11'), 'feito');                 // qua sem nada ainda: feito enquanto couber
  const R = H.calcularHabitos({ ...D, aguas: { '2026-10-20': 1000 }, besteiras: { '2026-10-22': 50 } }, '2026-10-29');   // água desde 20/10
  assert.equal(R.habitos.besteira.dias['2026-10-22'], 'antes');            // a meta começou em 27/10
  assert.equal(R.habitos.besteira.dias['2026-10-28'], 'feito');
  assert.equal(H.LIMITE_BESTEIRA_DIA, 22);
  const r = json(H.resumoDeHoje({ ...D, besteiras: { '2026-11-04': 12.5 } }, '2026-11-04'));
  assert.deepEqual([r.besteira.valor, r.besteira.progresso], ['R$\u00a012,50 / R$\u00a022', 12.5 / 22]);
  assert.equal(json(H.resumoDeHoje({ ...D, besteiras: { '2026-11-04': 30 } }, '2026-11-04')).besteira.acima, true);
  assert.equal(json(H.resumoDeHoje(D, '2026-11-02')).besteira.valor, 'Próximo: qua');
});

test('déficit: comido ≤ meta (gasto − 500); dia sem registro, com comida lançada depois ou acima da meta falha; hoje é feito enquanto couber', () => {
  const D = vazio();
  D.medidas = [{ data: '2026-10-01', hora: '', peso: 100 }];
  const meta = dia => H.metaKcal(H.gastoNoDia(D.medidas, D.treinos, [], dia));
  assert.equal(meta('2026-11-02'), H.gastoNoDia(D.medidas, [], [], '2026-11-02').total - 500);
  D.comidas = {
    '2026-11-01': [{ hora: '12:00', kcal: meta('2026-11-01') }],                         // no limite: feito
    '2026-11-02': [{ hora: '12:00', kcal: meta('2026-11-02') + 1 }],                     // passou 1 kcal
    '2026-11-03': [{ hora: '12:00', kcal: 800 }, { hora: '', kcal: 300 }],               // um item lançado depois
    [HOJE]: [{ hora: '12:00', kcal: 500 }]
  };
  const dia = d => H.estadoNoDia('deficit', d, D, HOJE);
  assert.deepEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', HOJE].map(dia), ['feito', 'falhou', 'falhou', 'falhou', 'feito']);
  D.comidas[HOJE].push({ hora: '20:00', kcal: meta(HOJE) });          // hoje passou da meta: pendente (o dia ainda não fechou)
  assert.equal(dia(HOJE), 'pendente');
  assert.equal(dia('2026-11-06'), 'falhou');                           // dia que ainda não chegou, sem nada: nunca é feito
  // Caminhada lançada depois do dia não sobe a meta do hábito; a lançada no dia sobe
  D.comidas['2026-11-04'] = [{ hora: '12:00', kcal: meta('2026-11-04') + 50 }];
  D.trechos['2026-11-04'] = [{ hora: '', km: 5 }];
  assert.equal(dia('2026-11-04'), 'falhou');
  D.trechos['2026-11-04'] = [{ hora: '18:00', km: 5 }];
  assert.equal(dia('2026-11-04'), 'feito');
  // Bebida lançada na Água (suco, refri…) conta como comida: no limite, um suco passa da meta
  D.comidas['2026-11-01'] = [{ hora: '12:00', kcal: meta('2026-11-01') - 50 }];
  assert.equal(dia('2026-11-01'), 'feito');
  D.bebidas = { '2026-11-01': [{ hora: '15:00', kcal: 60 }] };
  assert.equal(dia('2026-11-01'), 'falhou');
  // Sem pesagem nenhuma não há meta: falha
  assert.equal(H.estadoNoDia('deficit', '2026-11-01', { ...D, medidas: [] }, HOJE), 'falhou');
});

test('água: 1.000 ml no dia; ofensiva conta até ontem enquanto hoje ainda está pendente', () => {
  const D = vazio();
  D.aguas = { '2026-11-02': 1200, '2026-11-03': 1000, '2026-11-04': 999, [HOJE]: 300 };
  let R = H.calcularHabitos(D, HOJE).habitos.agua;
  assert.deepEqual([R.dias['2026-11-04'], R.hoje, R.ofensiva], ['falhou', 'pendente', 0]);
  D.aguas['2026-11-04'] = 1000;
  R = H.calcularHabitos(D, HOJE).habitos.agua;
  assert.deepEqual([R.hoje, R.ofensiva], ['pendente', 3]);
  D.aguas[HOJE] = 1000;
  assert.equal(H.calcularHabitos(D, HOJE).habitos.agua.ofensiva, 4);
});

test('proteções: +1 a cada semana de treino perfeita (no máximo 2); a falta gasta uma e o dia fica protegido', () => {
  const D = vazio();
  // Semanas perfeitas: 14–15/10, 21–22/10 e 28–29/10 (a 3ª passa do máximo de 2)
  D.treinos = ['2026-10-14', '2026-10-15', '2026-10-21', '2026-10-22', '2026-10-28', '2026-10-29', '2026-11-04'].map(treino);
  for (let d = 12; d <= 31; d++) D.aguas[`2026-10-${d}`] = 1000;
  for (let d = 1; d <= 5; d++) D.aguas[`2026-11-0${d}`] = 1000;
  delete D.aguas['2026-10-30']; delete D.aguas['2026-10-31']; delete D.aguas['2026-11-01'];   // 3 faltas seguidas
  const R = H.calcularHabitos(D, HOJE);
  assert.equal(R.ganhas, 3);
  assert.deepEqual(['2026-10-30', '2026-10-31', '2026-11-01'].map(d => R.habitos.agua.dias[d]), ['protegido', 'protegido', 'falhou']);
  assert.equal(R.usadas, 2);
  assert.equal(R.protecoes, 0);
  assert.equal(R.habitos.agua.ofensiva, 4);                       // 2 a 5/11 (hoje já feito); a falta de 1/11 quebrou
  // Uma proteção só: segura a 1ª falta, a 2ª quebra
  const D2 = vazio();
  D2.treinos = ['2026-10-21', '2026-10-22'].map(treino);
  for (let d = 20; d <= 31; d++) if (d !== 26 && d !== 27) D2.aguas[`2026-10-${d}`] = 1000;
  const R2 = H.calcularHabitos(D2, '2026-10-31');
  assert.equal(R2.habitos.agua.dias['2026-10-20'], 'feito');
  assert.equal(R2.habitos.treino.dias['2026-10-20'], 'folga');     // terça antes do 1º treino continua folga
  assert.deepEqual([R2.habitos.agua.dias['2026-10-26'], R2.habitos.agua.dias['2026-10-27'], R2.habitos.agua.ofensiva], ['protegido', 'falhou', 4]);
});

test('dia perfeito: todos os hábitos feitos (treino pode ser folga), sem proteção; hoje conta quando tudo já está feito', () => {
  const D = vazio();
  D.medidas = [{ data: '2026-10-01', hora: '', peso: 100 }];
  const dias = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', HOJE];
  for (const d of dias) {
    D.medidas.push({ data: d, hora: '07:00', peso: 100, pesoEm: new Date(as(d, 7)).toISOString() });
    D.sonos[d] = { sono: 7, sonoEm: new Date(as(d, 8)).toISOString() };
    D.aguas[d] = 1000;
    D.comidas[d] = [{ hora: '12:00', kcal: 1000 }];
  }
  D.medidas.shift();
  D.treinos = ['2026-11-04', HOJE].map(treino);
  let R = H.calcularHabitos(D, HOJE);
  assert.deepEqual(dias.map(d => R.perfeito[d]), [true, true, true, true, true]);
  assert.equal(R.perfeitos, 5);
  D.aguas[HOJE] = 300;                                                // hoje ainda falta água: não quebra, só não soma
  R = H.calcularHabitos(D, HOJE);
  assert.deepEqual([R.perfeito[HOJE], R.perfeitos], [false, 4]);
  delete D.aguas['2026-11-02'];
  R = H.calcularHabitos(D, HOJE);
  assert.equal(R.perfeitos, 2);                                       // 3 e 4/11
});

test('resumo de hoje: valor curto de cada hábito e o progresso das metas', () => {
  const D = vazio();
  D.medidas = [{ data: HOJE, hora: '07:00', peso: 100.4 }];
  D.aguas = { [HOJE]: 650 };
  D.sonos = { [HOJE]: { sono: 7.5 } };
  const meta = H.metaKcal(H.gastoNoDia(D.medidas, [], [], HOJE));
  D.comidas = { [HOJE]: [{ hora: '12:00', kcal: meta - 400 }] };
  let r = json(H.resumoDeHoje(D, HOJE));
  assert.deepEqual([r.treino.valor, r.peso.valor, r.sono.valor, r.agua.valor, r.agua.progresso], ['Dia de treino', '100,4 kg', '7 h 30', '650 / 1.000 ml', 0.65]);
  assert.equal(json(H.resumoDeHoje({ ...D, sonos: {} }, HOJE)).sono.valor, 'Registrar sono');
  assert.equal(json(H.resumoDeHoje({ ...D, medidas: [] }, HOJE)).peso.valor, 'Pesar hoje');
  assert.equal(r.deficit.valor, '400 kcal restantes');
  D.comidas[HOJE].push({ hora: '20:00', kcal: 1650 });
  r = json(H.resumoDeHoje(D, HOJE));
  assert.deepEqual([r.deficit.valor, r.deficit.acima, r.deficit.bom], ['750 kcal', true, undefined]);   // meta + 1.250 = gasto + 750: superávit, vermelho
  D.comidas[HOJE] = [{ hora: '12:00', kcal: meta + 300 }];                                                   // passou da meta, mas abaixo do gasto
  r = json(H.resumoDeHoje(D, HOJE));
  assert.deepEqual([r.deficit.valor, r.deficit.acima, r.deficit.bom], ['200 kcal', undefined, true]);         // ainda em déficit: verde
  assert.deepEqual(json(H.resumoDeHoje(D, HOJE, true)).deficit, r.deficit);                                  // dia fechado: o mesmo
  assert.equal(json(H.resumoDeHoje(D, '2026-11-02')).treino.valor, 'Próximo: qua');
  assert.equal(json(H.resumoDeHoje(vazio(), HOJE)).deficit.valor, 'Sem pesagem');
});

test('dia passado: o texto diz o que aconteceu, e a ofensiva e os dias perfeitos são os do fim daquele dia', () => {
  // água feita de 1 a 3/11, falhou em 4/11 (sem proteção), feita hoje (5/11)
  const D = { ...vazio(), aguas: { '2026-11-01': 1000, '2026-11-02': 1000, '2026-11-03': 1000, '2026-11-05': 1000 } };
  const R = H.calcularHabitos(D, HOJE);
  assert.equal(R.habitos.agua.ofensiva, 1);                                   // hoje: quebrou em 4/11
  assert.equal(H.ateODia(R, '2026-11-03').ofensiva.agua, 3);                  // no fim de 3/11 eram 3
  assert.equal(H.ateODia(R, '2026-11-04').ofensiva.agua, 0);
  assert.equal(H.ateODia(R, '2026-11-03').perfeitos, 0);                      // os outros hábitos não foram feitos
  const r = json(H.resumoDeHoje(D, '2026-11-04', true));                      // quarta passada
  assert.deepEqual([r.treino.valor, r.treino.acima], ['Não treinou', true]);
  assert.deepEqual([r.peso.valor, r.sono.valor, r.deficit.valor, r.agua.valor], ['Sem pesagem', 'Folga', 'Nada lançado', '0 / 1.000 ml']);
  assert.equal(json(H.resumoDeHoje(D, '2026-11-03', true)).besteira.valor, 'Folga');   // terça: sem besteira
  const dentro = json(H.resumoDeHoje({ ...D, medidas: [{ data: '2026-11-01', peso: 100 }], comidas: { '2026-11-03': [{ hora: '12:00', kcal: 1000 }] } }, '2026-11-03', true)).deficit;
  assert.match(dentro.valor, /^[\d.]+ kcal$/);                               // dentro da meta: só as kcal, sem "abaixo da meta"
  assert.equal(dentro.bom, true);                                             // em verde
  assert.equal(json(H.resumoDeHoje(D, '2026-11-03', true)).treino.valor, 'Folga');
  assert.equal(json(H.resumoDeHoje(D, '2026-11-04')).treino.valor, 'Dia de treino');  // como hoje, o texto de antes
});

test('o que o al deste aparelho ainda não enviou (caminhada ou comida) já conta no déficit; dias sem pendência ficam com a nuvem', () => {
  const D = vazio();
  D.medidas = [{ data: HOJE, hora: '07:00', peso: 100 }];
  D.comidas = { [HOJE]: [{ hora: '12:00', kcal: 1000 }], '2026-11-04': [{ hora: '12:00', kcal: 700 }] };
  const base = { al_registro: { a: { id: 'a', data: HOJE, hora: '12:00', qtd: 1, kcal: 1000 } }, al_dia: {} };
  const alDb = { registros: [{ id: 'a', data: HOJE, hora: '12:00', qtd: 1, kcal: 1000 }], dias: [{ data: HOJE, caminhadas: [{ hora: '18:00', minutos: 21, km: 1.8 }] }] };
  const resta = X => +H.resumoDeHoje(X, HOJE).deficit.valor.replace(/\D/g, '');
  const com = H.comPendentesDoAl(D, alDb, base);
  assert.deepEqual(json(com.trechos[HOJE]), [{ hora: '18:00', minutos: 21, km: 1.8 }]);   // a caminhada que não subiu ainda
  assert.equal(json(com.comidas['2026-11-04']).length, 1);                                // dia sem pendência: o da nuvem
  assert.equal(resta(com) - resta(D), 71);                                                // 21 min a 1,8 km: +71 kcal na meta
  alDb.registros.push({ id: 'b', data: HOJE, hora: '19:00', qtd: 2, kcal: 100 });          // comida ainda não enviada: conta
  assert.equal(resta(H.comPendentesDoAl(D, alDb, base)), resta(com) - 200);
  assert.equal(H.comPendentesDoAl(D, null, null), D);                                     // sem al no aparelho: só a nuvem
  const tudoEnviado = H.comPendentesDoAl(D, { registros: alDb.registros.slice(0, 1), dias: [] }, base);
  assert.deepEqual(json(tudoEnviado.comidas), json(D.comidas));
});
