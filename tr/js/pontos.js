'use strict';
// Pontos, nível, conquistas, calorias e resumo de um dia (tudo calculado dos dados).
// ===== Pontos, nível, conquistas e resumo (calculados dos dados) =====
const PONTOS = [['treino', 50, 'por dia de treino'], ['exercicio', 10, 'por exercício feito'], ['piramide', 10, 'por pirâmide completa'],
  ['recorde', 25, 'por recorde de carga'], ['extra', 20, 'por treino extra na segunda'], ['pesagem', 10, 'por pesagem semanal']];
const PTS_NIVEL = 300;
const semanaDe = d => { const x = deIso(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };
const somaDias = (d, n) => { const x = deIso(d); x.setDate(x.getDate() + n); return iso(x); };
const mapas = () => { const ex = new Map(), va = new Map(); db.exercicios.forEach(e => e.variacoes.forEach(v => { ex.set(v.id, e); va.set(v.id, v); })); return { ex, va }; };
// Dia treinado = tem exercício registrado ou treino finalizado (mesmo sem séries salvas)
const diasTreinados = () => new Set([...db.registros.map(r => r.data), ...db.treinos.filter(t => t.fechado).map(t => iso(new Date(t.inicio)))]);
const ordemCronologica = () => [...db.registros].sort((a, b) => a.data.localeCompare(b.data));
function recordesAte(fim) {   // registros que bateram a maior carga anterior da mesma variação
  const melhor = {}, rec = new Set();
  for (const r of ordemCronologica()) {
    if (fim && r.data > fim) break;
    if (r.variacao in melhor && topo(r) > melhor[r.variacao]) rec.add(r);
    melhor[r.variacao] = Math.max(melhor[r.variacao] ?? -Infinity, topo(r));
  }
  return rec;
}
function estatisticas() {
  const { ex } = mapas(), dias = diasTreinados();
  const s = { treino: dias.size, exercicio: db.registros.length, piramide: 0, recorde: recordesAte().size, extra: 0, pesagem: 0, perda: 0, rapido: false };
  s.piramide = db.registros.filter(r => completo(r, ex.get(r.variacao))).length;
  s.extra = [...dias].filter(d => DIAS_EXTRA.includes(deIso(d).getDay())).length;
  const porSemana = {}; dias.forEach(d => { const w = semanaDe(d); porSemana[w] = (porSemana[w] || 0) + 1; });
  s.semanasMeta = Object.values(porSemana).filter(n => n >= 2).length;
  s.semanasCheias = Object.values(porSemana).filter(n => n >= 3).length;
  // sequência: semanas seguidas com 2+ treinos (a semana atual só conta quando bate a meta)
  let w = semanaDe(hoje()); if ((porSemana[w] || 0) < 2) w = somaDias(w, -7);
  s.sequencia = 0; while ((porSemana[w] || 0) >= 2) { s.sequencia++; w = somaDias(w, -7); }
  s.melhorSequencia = 0; let corrida = 0;
  const semanas = Object.keys(porSemana).sort();
  if (semanas.length) for (let x = semanas[0]; x <= semanaDe(hoje()); x = somaDias(x, 7)) { corrida = (porSemana[x] || 0) >= 2 ? corrida + 1 : 0; s.melhorSequencia = Math.max(s.melhorSequencia, corrida); }
  s.pesagem = new Set(db.medidas.map(m => semanaDe(m.data))).size;
  const ms = [...db.medidas].sort((a, b) => a.data.localeCompare(b.data));
  if (ms.length > 1) s.perda = Math.round((ms[0].peso - ms[ms.length - 1].peso) * 10) / 10;
  const primeiro = [...dias].sort()[0];
  s.dias = primeiro ? diasDesde(primeiro) : 0;   // dias desde o 1º treino
  s.rapido = db.treinos.some(t => { const min = (t.fim - t.inicio) / 6e4, d = iso(new Date(t.inicio)); return min >= 15 && min <= 45 && db.registros.filter(r => r.data === d).length >= 4; });
  s.pontos = PONTOS.reduce((soma, [k, p]) => soma + s[k] * p, 0);
  s.nivel = Math.floor(s.pontos / PTS_NIVEL) + 1;
  s.progresso = (s.pontos % PTS_NIVEL) / PTS_NIVEL;
  return s;
}
const CONQUISTAS = [
  ['Primeiro treino', 'Faça o 1º exercício', s => s.treino >= 1],
  ['Semana batida', '2 treinos na mesma semana', s => s.semanasMeta >= 1],
  ['Semana cheia', '3 treinos na mesma semana (com o extra)', s => s.semanasCheias >= 1],
  ['Pirâmide perfeita', 'Bata todas as reps de uma pirâmide', s => s.piramide >= 1],
  ['Primeiro recorde', 'Suba a carga de um exercício', s => s.recorde >= 1],
  ['Na balança', '4 pesagens em semanas diferentes', s => s.pesagem >= 4],
  ['Rápido e completo', 'Treino de até 45 min com 4+ exercícios', s => s.rapido],
  ['4 semanas seguidas', 'Meta de 2 treinos por 4 semanas seguidas', s => s.melhorSequencia >= 4],
  ['10 treinos', '10 dias de treino', s => s.treino >= 10],
  ['−2 kg', 'Perca 2 kg desde a 1ª pesagem', s => s.perda >= 2],
  ['10 recordes', '10 recordes de carga', s => s.recorde >= 10],
  ['20 pirâmides perfeitas', 'Bata todas as reps em 20 pirâmides', s => s.piramide >= 20],
  ['8 semanas seguidas', 'Meta de 2 treinos por 8 semanas seguidas', s => s.melhorSequencia >= 8],
  ['25 treinos', '25 dias de treino', s => s.treino >= 25],
  ['−5 kg', 'Perca 5 kg desde a 1ª pesagem', s => s.perda >= 5],
  ['50 treinos', '50 dias de treino', s => s.treino >= 50],
  // Longo prazo, ano a ano. Base: meta de 2 treinos/semana batida em ~80% das semanas ≈ 80 treinos e 40 semanas batidas por ano.
  ...[1, 2, 3, 4, 5].flatMap(n => [
    [`${n} ${n === 1 ? 'ano' : 'anos'} de treino`, `${n === 1 ? '1 ano' : n + ' anos'} desde o 1º treino, com ${80 * n}+ treinos`, s => s.dias >= 365 * n && s.treino >= 80 * n, 'Ano ' + n],
    [`${40 * n} semanas batidas`, `${40 * n} semanas com 2+ treinos (não precisam ser seguidas)`, s => s.semanasMeta >= 40 * n, 'Ano ' + n],
    [`${25 * n} recordes`, `${25 * n} vezes subindo a carga`, s => s.recorde >= 25 * n, 'Ano ' + n],
    [`${100 * n} pirâmides perfeitas`, `Bata todas as reps em ${100 * n} pirâmides`, s => s.piramide >= 100 * n, 'Ano ' + n]
  ])
];
// Conquistas e nível ganhos num dia: compara as estatísticas sem os dados do dia (e depois) com as de agora
function ganhosDoDia(dia) {
  const salvo = db; let antes;
  try {
    db = { ...db, registros: db.registros.filter(r => r.data < dia), treinos: db.treinos.filter(t => iso(new Date(t.inicio)) < dia), medidas: db.medidas.filter(m => m.data < dia) };
    antes = estatisticas();
  } finally { db = salvo; }
  const depois = estatisticas();
  return { conquistas: CONQUISTAS.filter(([, , f]) => f(depois) && !f(antes)).map(([nome, desc]) => ({ nome, desc })), nivel: depois.nivel > antes.nivel ? depois.nivel : null };
}
function celebrar(antes) {   // mensagens do que mudou depois de uma ação
  const depois = estatisticas(), msgs = [];
  if (depois.recorde > antes.recorde) msgs.push('Recorde! +25 pts');
  if (depois.nivel > antes.nivel) msgs.push('Nível ' + depois.nivel + '!');
  CONQUISTAS.forEach(([nome, , f]) => { if (f(depois) && !f(antes)) msgs.push('Conquista: ' + nome); });
  if (msgs.length) vibrar([60, 80, 60]);
  return msgs;
}
function pintarJogo(s) {
  const feitas = CONQUISTAS.filter(c => c[2](s)).length;
  $('g-nivel').textContent = 'Nível ' + s.nivel;
  $('g-pts').textContent = s.pontos.toLocaleString('pt-BR') + ' pts';
  $('g-barra').style.width = s.progresso * 100 + '%';
  $('g-info').textContent = `Sequência: ${s.sequencia} ${s.sequencia === 1 ? 'semana' : 'semanas'} · ${s.recorde} recordes · ${feitas}/${CONQUISTAS.length} conquistas`;
}
telas.conquistas = () => {
  const s = estatisticas();
  $('q-resumo').innerHTML = `<div class="q-top"><b>Nível ${s.nivel}</b><span>${s.pontos.toLocaleString('pt-BR')} pts · faltam ${PTS_NIVEL - (s.pontos % PTS_NIVEL)} para o nível ${s.nivel + 1}</span></div>
    <div class="track"><span style="width:${s.progresso * 100}%"></span></div>
    <p class="small muted">Sequência atual: <b>${s.sequencia}</b> · melhor: <b>${s.melhorSequencia}</b> semanas com 2+ treinos · ${s.recorde} recordes · ${s.piramide} pirâmides completas</p>`;
  $('q-lista').innerHTML = CONQUISTAS.map(([nome, desc, f, ano], i) => `${ano && ano !== CONQUISTAS[i - 1][3] ? `<li class="q-ano">${ano}</li>` : ''}<li class="${f(s) ? 'on' : ''}"><span class="q-ico" aria-hidden="true">${f(s) ? '★' : '☆'}</span><span><b>${nome}</b><small>${desc}</small></span></li>`).join('');
  $('q-pontos').innerHTML = PONTOS.map(([, p, txt]) => `<li><b>+${p}</b> ${txt}</li>`).join('');
};
// Calorias: kcalTreino (../perfil.js, a mesma conta do al) com a pesagem mais recente até o dia do treino.
function pesoEm(dia) { const L = [...db.medidas].sort((a, b) => b.data.localeCompare(a.data)); return (L.find(m => m.data <= dia) || L[L.length - 1])?.peso; }
const kcal = t => { const dia = iso(new Date(t.inicio)), p = pesoEm(dia); return p ? kcalTreino(p, dia, t.fim - t.inicio) : null; };
function resumoDia(dia) {
  const { ex, va } = mapas(), regs = db.registros.filter(r => r.data === dia), rec = recordesAte(dia);
  const r = { regs, series: 0, volume: 0, recordes: regs.filter(x => rec.has(x)).length, completas: regs.filter(x => completo(x, ex.get(x.variacao))).length };
  regs.forEach(x => { r.series += x.series.length; const v = va.get(x.variacao); if (v) x.series.forEach(s => { r.volume += emKg(s.kg, v) * s.reps; }); });
  r.treino = [...db.treinos].reverse().find(t => iso(new Date(t.inicio)) === dia);
  r.kcal = r.treino ? kcal(r.treino) : null;
  r.pontos = regs.length ? 50 + 10 * regs.length + 10 * r.completas + 25 * r.recordes + (DIAS_EXTRA.includes(deIso(dia).getDay()) ? 20 : 0) : 0;
  return r;
}
