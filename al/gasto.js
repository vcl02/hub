'use strict';
// Gasto e meta do dia, para o al e para a página inicial do hub (hábito do déficit): módulo do app Alimentação, carregado
// depois de ../corpo/perfil.js (pesoNoDia, tmb, kcalTreino, kcalEsteira, ROTINA). Só funções puras: quem chama passa as
// pesagens, os treinos e os trechos de caminhada do dia. O hub carrega com <script src="al/gasto.js">.
// Gasto = basal × fator de atividade (sedentário: rotina sem exercício) + o que o treino e a caminhada somam acima da basal.
const FATOR_ATIVIDADE = 1.2;
const CAMINHADA_MIN_PADRAO = 20;   // trecho sem tempo nem distância
const VELOCIDADE_PADRAO = 5;       // km/h, quando só o tempo ou só a distância é informado
const DEFICIT_META = 500;          // kcal/dia abaixo do gasto: ~0,5 kg de gordura por semana

// Dia (AAAA-MM-DD, hora do aparelho) de um instante em ms, e dia da semana (0 = domingo) de um AAAA-MM-DD
const diaDoInstante = ms => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const semanaDoDia = dia => { const [a, m, d] = dia.split('-').map(Number); return new Date(a, m - 1, d).getDay(); };

// Caminhada: cada trecho (rua ou esteira, plano) pela equação de caminhada do ACSM, VO2 = 0,1 × velocidade (m/min) + 3,5 ml/kg/min,
// e MET = VO2 ÷ 3,5. Com tempo e distância a velocidade é a real (limitada a 2–7 km/h, faixa de caminhada); com um só, 5 km/h.
// Sem nenhum, 20 min. O gasto líquido da caminhada depende quase só da distância: com km informado, o tempo pouco muda.
function kcalTrecho(t, porHora) {
  const km = t.km || null, min = t.minutos || (km ? km / VELOCIDADE_PADRAO * 60 : CAMINHADA_MIN_PADRAO);
  const kmh = km ? Math.min(Math.max(km / (min / 60), 2), 7) : VELOCIDADE_PADRAO;
  const met = (0.1 * kmh * 1000 / 60 + 3.5) / 3.5;
  return Math.round((met - 1) * porHora * min / 60);
}
function caminhadaNoDia(trechos, porHora) {
  if (!trechos.length) return null;
  const T = trechos.map(t => ({ ...t, kcal: kcalTrecho(t, porHora) }));
  return { trechos: T, kcal: T.reduce((s, t) => s + t.kcal, 0) };
}
// Gasto do dia: medidas (pesagens do Corpo), treinos [{ inicio, fim, cardio? }] em ms e os trechos de caminhada do dia.
// Treino (com o cardio na esteira feito depois dele, kcalEsteira) e caminhada contam só o que passa da basal
// ((MET − 1) × basal/hora): a basal do dia já está no fator de atividade. Sem pesagem nenhuma, null.
function gastoNoDia(medidas, treinos, trechos, dia) {
  const peso = pesoNoDia(medidas, dia);
  if (!peso) return null;
  const basal = tmb(peso, dia), porHora = basal / 24;
  const doDia = treinos.filter(t => diaDoInstante(t.inicio) === dia);
  const msTreino = doDia.reduce((s, t) => s + t.fim - t.inicio, 0);
  const cardio = doDia.filter(t => t.cardio).reduce((s, { cardio: c }) => s + kcalEsteira(peso, dia, c.ms, c.vel, c.incl) - Math.round(porHora * c.ms / 36e5), 0);
  const treino = (msTreino ? kcalTreino(peso, dia, msTreino) - Math.round(porHora * msTreino / 36e5) : 0) + cardio;
  const caminhada = caminhadaNoDia(trechos, porHora);
  const rotina = Math.round(basal * FATOR_ATIVIDADE);
  // Treino previsto: dia de treino fixo ou extra (opcional) da ROTINA ainda sem treino registrado no Treino. Quanto a meta
  // sobe depois de treinar, com a duração média dos últimos treinos (sem nenhum, 1 h).
  let previsto = null;
  const wd = semanaDoDia(dia);
  if (!msTreino && (ROTINA.treino.includes(wd) || ROTINA.treinoExtra.includes(wd))) {
    const T = [...treinos].sort((a, b) => b.inicio - a.inicio).slice(0, 8).map(t => t.fim - t.inicio).filter(ms => ms > 0);
    const ms = T.length ? Math.round(T.reduce((s, x) => s + x, 0) / T.length / 3e5) * 3e5 : 36e5;   // média, em passos de 5 min
    previsto = { extra: !ROTINA.treino.includes(wd), minutos: Math.round(ms / 6e4), kcal: kcalTreino(peso, dia, ms) - Math.round(porHora * ms / 36e5) };
  }
  return { peso, basal, rotina, treino, caminhada, previsto, total: rotina + treino + (caminhada?.kcal || 0) };
}
// Meta de kcal do dia: gasto − déficit planejado (sobe junto com treino e caminhada)
const metaKcal = gasto => Math.max(0, gasto.total - DEFICIT_META);
