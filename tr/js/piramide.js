'use strict';
// Pirâmide: pesos, unidades, reps e pesos-alvo de cada série.
// ===== Pesos, unidades e pirâmide =====
const unidadeTxt = v => v.unidade + (v.lados === 2 ? '/lado' : '');
const pesoTxt = (kg, v) => kg > 0 ? fmt(kg) + ' ' + unidadeTxt(v) : '—';
const emKg = (kg, v) => v.unidade === 'nível' ? 0 : kg * (v.unidade === 'lb' ? LB : 1) * (v.lados || 1);   // total real em kg
const arred = (x, p) => Math.max(p, Math.round(x / p) * p);
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
  if (comAquecimento) s.push({ nome: 'Aquecimento', kg: base > 0 ? arred(base * .5, v.passo) : null, reps: 15, aq: true });
  for (let i = 0; i < e.series; i++) s.push({ nome: 'Série ' + (i + 1), i, kg: ajuste[i]?.kg ?? alvoKg(e, v, base, i), reps: ajuste[i]?.reps ?? alvoReps(e, i) });
  return s;
}
const topo = r => Math.max(...r.series.map(s => s.kg));
const repsTxt = r => r.series.map(s => s.reps).join('/');
const kgsTxt = r => [...new Set(r.series.map(s => fmt(s.kg)))].join('/');
// Pirâmide completa = bateu as reps-alvo de todas as séries
const completo = (r, e) => !!r && !!e && r.series.length >= e.series && r.series.slice(0, e.series).every((s, i) => s.reps >= alvoReps(e, i));
