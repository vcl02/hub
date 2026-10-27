'use strict';
// Pirâmide: pesos, unidades, reps e pesos-alvo de cada série, e os planos por mês (flexão, barra).
// ===== Pesos, unidades e pirâmide =====
const unidadeTxt = v => v.unidade + (v.lados === 2 ? '/lado' : '');
const pesoTxt = (kg, v) => kg > 0 ? fmt(kg) + ' ' + unidadeTxt(v) : '—';
const emKg = (kg, v) => v.unidade === 'nível' ? 0 : kg * (v.unidade === 'lb' ? LB : 1) * (v.lados || 1);   // total real em kg
const arred = (x, p) => Math.max(p, Math.round(x / p) * p);
// kg ↔ lb: a outra unidade mostrada (e editável) ao lado do peso; nível não converte
const outraUnidade = v => v.unidade === 'kg' ? 'lb' : v.unidade === 'lb' ? 'kg' : null;
const fatorUnidade = (de, para) => de === para || !['kg', 'lb'].includes(de) || !['kg', 'lb'].includes(para) ? 1 : de === 'kg' ? 1 / LB : LB;
const naOutra = (x, v) => Math.round(x * fatorUnidade(v.unidade, outraUnidade(v)) * 10) / 10;
const daOutra = (x, v) => Math.round(x * fatorUnidade(outraUnidade(v), v.unidade) * 100) / 100;
// ±1 na outra unidade: de um valor quebrado vai para o inteiro vizinho (22,7 → 23 → 24)
const umAUm = (x, dir) => Math.max(0, Number.isInteger(x) || !(x > 0) ? (x || 0) + dir : dir > 0 ? Math.ceil(x) : Math.floor(x));
// Os pesos ficam guardados na unidade da variação: trocar kg ↔ lb converte o histórico dela (1 casa decimal)
function converterHistorico(registros, vid, de, para) {
  const f = fatorUnidade(de, para); if (f === 1) return;
  for (const r of registros) if (r.variacao === vid) r.series = r.series.map(s => ({ ...s, kg: Math.round(s.kg * f * 10) / 10 }));
}
// Reps-alvo da série i: crescente 12→10→8 · mesma carga 12→12→12 · invertida 8→10→12
const alvoReps = (e, i) => Math.max(1, e.modo === 'reta' ? e.reps : e.modo === 'invertida' ? e.reps - 2 * (e.series - 1 - i) : e.reps - 2 * i);
// Peso da série i a partir do peso da 1ª série: sobe (ou desce, na invertida) ~10%, arredondado ao passo
function alvoKg(e, v, base, i) {
  if (!(base > 0)) return null;
  const inc = arred(base * .1, v.passo), k = e.modo === 'reta' ? base : e.modo === 'invertida' ? base - inc * i : base + inc * i;
  return Math.max(v.passo, Math.round(k * 100) / 100);
}
function plano(e, v, base, comAquecimento, ajuste = {}) {
  const s = [];
  if (semPeso(v)) {   // peso do corpo ou segundos: sem aquecimento e sem peso, só o alvo de reps (ou segundos)
    for (let i = 0; i < e.series; i++) s.push({ nome: 'Série ' + (i + 1), i, kg: 0, reps: ajuste[i]?.reps ?? alvoReps(e, i) });
    return s;
  }
  if (comAquecimento) s.push({ nome: 'Aquecimento', kg: base > 0 ? arred(base * .5, v.passo) : null, reps: 15, aq: true });
  for (let i = 0; i < e.series; i++) s.push({ nome: 'Série ' + (i + 1), i, kg: ajuste[i]?.kg ?? alvoKg(e, v, base, i), reps: ajuste[i]?.reps ?? alvoReps(e, i) });
  return s;
}
// Maior carga do registro; sem peso (corpo, segundos), o maior número de reps (ou segundos)
const topo = r => r.series.some(s => s.kg > 0) ? Math.max(...r.series.map(s => s.kg)) : Math.max(...r.series.map(s => s.reps));
// Uma série e um registro em texto: "40 kg × 12" · "8 reps" · "20 s"
const medidaSemPeso = v => v.unidade === 's' ? 's' : 'reps';
const serieTxt = (kg, reps, v) => semPeso(v) ? reps + ' ' + medidaSemPeso(v) : pesoTxt(kg, v) + ' × ' + reps;
const registroTxt = (r, v) => semPeso(v) ? `<b>${repsTxt(r)}</b> ${medidaSemPeso(v)}` : `<b>${kgsTxt(r)} ${esc(unidadeTxt(v))}</b> × ${repsTxt(r)}`;
const repsTxt = r => r.series.map(s => s.reps + (s.falha ? '✗' : '')).join('/');   // ✗ = falhou na série
const kgsTxt = r => [...new Set(r.series.map(s => fmt(s.kg)))].join('/');
// Pirâmide completa = bateu as reps-alvo de todas as séries, sem falha
const completo = (r, e) => !!r && !!e && r.series.length >= e.series && r.series.slice(0, e.series).every((s, i) => !s.falha && s.reps >= alvoReps(e, i));
// Falhas nos últimos registros da variação: em quantos treinos e em quais séries (1ª, 2ª…)
function falhas(vid, ultimos = 5) {
  const lista = db.registros.filter(r => r.variacao === vid).sort((a, b) => b.data.localeCompare(a.data)).slice(0, ultimos);
  const series = new Set(); let treinos = 0;
  for (const r of lista) if (r.series.some(s => s.falha)) { treinos++; r.series.forEach((s, i) => { if (s.falha) series.add(i + 1); }); }
  return { treinos, de: lista.length, series: [...series].sort((a, b) => a - b) };
}

// ===== Planos por mês (PLANOS, js/config.js) =====
// Etapa k vale do dia do início + k meses até a véspera da seguinte; a última continua. Semana = semanas desde o começo da
// etapa (0 a 3; a 4ª vale até o fim). Antes do início, a 1ª etapa, semana 1.
function maisMeses(dia, n) { const [a, m, d] = dia.split('-').map(Number), x = new Date(a, m - 1 + n, 1); x.setDate(Math.min(d, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return iso(x); }
function etapaDoPlano(p, dia) {
  let k = 0; while (k + 1 < p.etapas.length && maisMeses(p.inicio, k + 1) <= dia) k++;
  const desde = maisMeses(p.inicio, k), semana = dia < desde ? 0 : Math.min(3, Math.floor(Math.round((deIso(dia) - deIso(desde)) / 864e5) / 7));
  return { k, semana, etapa: p.etapas[k], ate: k + 1 < p.etapas.length ? maisMeses(p.inicio, k + 1) : null };
}
// O plano escolhe a variação, as séries e as reps do dia (mesmo alvo em todas as séries); devolve true se mudou algo
function aplicarPlanos(dia = hoje()) {
  let mudou = false;
  for (const e of db.exercicios) {
    const p = PLANOS[e.id]; if (!p) continue;
    const { etapa, semana } = etapaDoPlano(p, dia), alvo = { ativo: etapa.variacao, series: etapa.series, reps: etapa.reps[semana], modo: 'reta' };
    for (const [k, x] of Object.entries(alvo)) if (e[k] !== x) { e[k] = x; mudou = true; }
  }
  if (mudou) gravar();
  return mudou;
}
