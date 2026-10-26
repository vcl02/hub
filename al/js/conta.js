'use strict';
// Conta do dia: o que comi (kcal e macros), o gasto (basal × fator de atividade + treino + caminhada) e o saldo.
// Peso: a pesagem mais recente até o dia (do app Corpo, pesoNoDia); sem pesagem nenhuma, não há gasto nem saldo.
// Caminhada do dia (rua ou esteira, plano): equação de caminhada do ACSM, VO2 = 0,1 × velocidade (m/min) + 3,5 ml/kg/min,
// e MET = VO2 ÷ 3,5. Com tempo e distância a velocidade é a real (limitada a 2–7 km/h, faixa de caminhada); com um só, 5 km/h.
// Sem nenhum, 20 min. O gasto líquido da caminhada depende quase só da distância: com km informado, o tempo pouco muda.
// Dia de caminhada da rotina (qua e qui, ROTINA em ../corpo/perfil.js): sem linha no dia, "Andei" já vem marcado.
const caminhadaAuto = dia => ROTINA.caminhada.includes(deIso(dia).getDay());
const andouNoDia = dia => { const d = db.dias.find(x => x.data === dia); return d ? d.andou : caminhadaAuto(dia); };
function caminhadaDoDia(dia, porHora) {
  if (!andouNoDia(dia)) return null;
  const d = db.dias.find(x => x.data === dia) || {};
  const km = d.km || null;
  const min = d.minutos || (km ? km / VELOCIDADE_PADRAO * 60 : CAMINHADA_MIN_PADRAO);
  const kmh = km ? Math.min(Math.max(km / (min / 60), 2), 7) : VELOCIDADE_PADRAO;
  const met = (0.1 * kmh * 1000 / 60 + 3.5) / 3.5;
  return { minutos: d.minutos || null, km, kcal: Math.round((met - 1) * porHora * min / 60) };
}
// Treino e caminhada contam só o que passa da basal ((MET − 1) × basal/hora): a basal do dia já está no fator de atividade.
function gastoDoDia(dia) {
  const peso = pesoNoDia(medidas, dia);
  if (!peso) return null;
  const basal = tmb(peso, dia), porHora = basal / 24;
  const msTreino = tr.treinos.filter(t => iso(new Date(t.inicio)) === dia).reduce((s, t) => s + t.fim - t.inicio, 0);
  const treino = msTreino ? kcalTreino(peso, dia, msTreino) - Math.round(porHora * msTreino / 36e5) : 0;
  const caminhada = caminhadaDoDia(dia, porHora);
  const rotina = Math.round(basal * FATOR_ATIVIDADE);
  // Treino previsto: dia de treino fixo ou extra (opcional) da ROTINA ainda sem treino registrado no Treino. Quanto a meta
  // sobe depois de treinar, com a duração média dos últimos treinos (sem nenhum, 1 h).
  let previsto = null;
  const wd = deIso(dia).getDay();
  if (!msTreino && (ROTINA.treino.includes(wd) || ROTINA.treinoExtra.includes(wd))) {
    const T = [...tr.treinos].sort((a, b) => b.inicio - a.inicio).slice(0, 8).map(t => t.fim - t.inicio).filter(ms => ms > 0);
    const ms = T.length ? Math.round(T.reduce((s, x) => s + x, 0) / T.length / 3e5) * 3e5 : 36e5;   // média, em passos de 5 min
    previsto = { extra: !ROTINA.treino.includes(wd), minutos: Math.round(ms / 6e4), kcal: kcalTreino(peso, dia, ms) - Math.round(porHora * ms / 36e5) };
  }
  return { peso, basal, rotina, treino, caminhada, previsto, total: rotina + treino + (caminhada?.kcal || 0) };
}
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
  const kcal = Math.max(0, g.total - DEFICIT_META), prot = Math.round(PROT_G_KG * g.peso), gord = Math.round(kcal * GORD_PCT / 9);
  return { kcal, prot, gord, carb: Math.max(0, Math.round((kcal - prot * 4 - gord * 9) / 4)) };
}
// saldo < 0 = déficit (comi menos do que gastei)
function saldoDoDia(dia) {
  const g = gastoDoDia(dia), c = comidoNoDia(dia);
  return { gasto: g, comido: c, saldo: g ? c.kcal - g.total : null };
}
