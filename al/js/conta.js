'use strict';
// Conta do dia: o que comi (kcal e macros), o gasto (basal × fator de atividade + treino + caminhada) e o saldo.
// O gasto sai de gasto.js (gastoNoDia, o mesmo do hub): peso pela pesagem mais recente até o dia (do app Corpo, pesoNoDia),
// treinos do Treino e a soma dos trechos marcados ("Andei +": ida, volta, mercado…), sem nenhum automático.
// Sem pesagem nenhuma, não há gasto nem saldo.
const trechosDoDia = dia => db.dias.find(x => x.data === dia)?.caminhadas || [];
const gastoDoDia = dia => gastoNoDia(medidas, tr.treinos, trechosDoDia(dia), dia);
function comidoNoDia(dia) {
  const t = { kcal: 0, prot: 0, carb: 0, gord: 0 };
  for (const r of db.registros) if (r.data === dia) for (const k in t) t[k] += r[k] * r.qtd;
  return { kcal: Math.round(t.kcal), prot: Math.round(t.prot), carb: Math.round(t.carb), gord: Math.round(t.gord) };
}
// Meta do dia: kcal = gasto − déficit planejado (sobe junto com treino e caminhada); proteína por kg de peso,
// gordura em % das kcal e carboidrato com o que sobra. Sem pesagem, sem meta.
function metaDoDia(dia) {
  const g = gastoDoDia(dia);
  if (!g) return null;
  const kcal = metaKcal(g), prot = Math.round(PROT_G_KG * g.peso), gord = Math.round(kcal * GORD_PCT / 9);
  return { kcal, prot, gord, carb: Math.max(0, Math.round((kcal - prot * 4 - gord * 9) / 4)) };
}
// saldo < 0 = déficit (comi menos do que gastei)
function saldoDoDia(dia) {
  const g = gastoDoDia(dia), c = comidoNoDia(dia);
  return { gasto: g, comido: c, saldo: g ? c.kcal - g.total : null };
}
