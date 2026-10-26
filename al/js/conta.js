'use strict';
// Conta do dia: o que comi (kcal e macros), o gasto (basal × fator de atividade + treino + caminhada) e o saldo.
// Peso: a pesagem mais recente até o dia (do Treino); sem pesagem nenhuma, não há gasto nem saldo.
function pesoEm(dia) {
  const L = tr.medidas;
  return ([...L].reverse().find(m => m.data <= dia) || L[0])?.peso || null;
}
// Treino e caminhada contam só o que passa da basal ((MET − 1) × basal/hora): a basal do dia já está no fator de atividade.
function gastoDoDia(dia) {
  const peso = pesoEm(dia);
  if (!peso) return null;
  const basal = tmb(peso, dia), porHora = basal / 24;
  const msTreino = tr.treinos.filter(t => iso(new Date(t.inicio)) === dia).reduce((s, t) => s + t.fim - t.inicio, 0);
  const treino = msTreino ? kcalTreino(peso, dia, msTreino) - Math.round(porHora * msTreino / 36e5) : 0;
  const andou = !!db.dias.find(x => x.data === dia)?.andou;
  const caminhada = Math.round((MET_CAMINHADA - 1) * porHora * CAMINHADA_MIN / 60);
  const rotina = Math.round(basal * FATOR_ATIVIDADE);
  return { peso, basal, rotina, treino, caminhada, andou, total: rotina + treino + (andou ? caminhada : 0) };
}
function comidoNoDia(dia) {
  const t = { kcal: 0, prot: 0, carb: 0, gord: 0 };
  for (const r of db.registros) if (r.data === dia) for (const k in t) t[k] += r[k] * r.qtd;
  return { kcal: Math.round(t.kcal), prot: Math.round(t.prot), carb: Math.round(t.carb), gord: Math.round(t.gord) };
}
// saldo < 0 = déficit (comi menos do que gastei)
function saldoDoDia(dia) {
  const g = gastoDoDia(dia), c = comidoNoDia(dia);
  return { gasto: g, comido: c, saldo: g ? c.kcal - g.total : null };
}
