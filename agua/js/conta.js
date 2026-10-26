'use strict';
// Contas: total do dia, lembretes (horários e se foram cumpridos), botões de ml (das quantidades já usadas) e a bexiga.
const doDia = dia => db.dias.find(x => x.data === dia) || { data: dia, aguas: [], xixis: [] };
const totalMl = dia => doDia(dia).aguas.reduce((s, a) => s + a.ml, 0);

// Lembretes, das 10 às 16: em casa (dia útil não presencial), de hora em hora; presencial (ROTINA.presencial, em
// ../corpo/perfil.js) e fim de semana, de 2 em 2 horas. Cada horário vale até o próximo; cumprido se bebeu nesse
// intervalo (ou até 30 min antes dele). Passou sem beber = atrasado; o atual atrasado vira "Hora de beber água".
function lembretes(dia, agora = agoraHHMM()) {
  const wd = deIso(dia).getDay(), fimDeSemana = wd === 0 || wd === 6, passo = fimDeSemana || ROTINA.presencial.includes(wd) ? 2 : 1;
  const horas = []; for (let h = LEMBRETE_INICIO; h <= LEMBRETE_FIM; h += passo) horas.push(pad(h) + ':00');
  const aguas = doDia(dia).aguas.map(a => minutos(a.hora)), passado = dia < hoje(), m = minutos(agora);
  return horas.map((hora, i) => {
    const ini = minutos(hora) - 30, fim = i + 1 < horas.length ? minutos(horas[i + 1]) - 30 : 24 * 60;
    const feito = aguas.some(x => x >= ini && x < fim);
    const chegou = passado || (dia === hoje() && m >= minutos(hora));
    return { hora, estado: feito ? 'feito' : chegou ? 'atrasado' : 'depois' };
  });
}
// Lembrete da vez: o mais recente que já chegou e não foi cumprido (só hoje)
function lembreteAgora(dia) {
  if (dia !== hoje()) return null;
  const L = lembretes(dia), m = minutos(agoraHHMM());
  const atual = [...L].reverse().find(x => minutos(x.hora) <= m);
  return atual && atual.estado === 'atrasado' ? atual : null;
}

// Botões de ml: as quantidades que já digitei, das mais usadas para as menos (empate: a menor primeiro)
function botoesMl() {
  const conta = {};
  db.dias.forEach(x => x.aguas.forEach(a => { conta[a.ml] = (conta[a.ml] || 0) + 1; }));
  return Object.entries(conta).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, BOTOES_ML).map(([ml]) => +ml).sort((a, b) => a - b);
}

// Bexiga: dos dias com xixi registrado (até 7, contando hoje só se ele já tiver xixi), xixis por dia, intervalo médio entre
// um xixi e o seguinte no mesmo dia e quanto bebi por xixi (total do dia ÷ xixis). Não é o volume da bexiga: é o que
// dá para tirar só contando, sem medir.
function bexiga() {
  const D = [...db.dias].filter(x => x.xixis.length && x.data <= hoje()).slice(-7);
  if (!D.length) return null;
  const xixis = D.reduce((s, x) => s + x.xixis.length, 0), ml = D.reduce((s, x) => s + totalMl(x.data), 0);
  const intervalos = D.flatMap(x => x.xixis.slice(1).map((h, i) => minutos(h) - minutos(x.xixis[i])));
  return {
    dias: D.length,
    porDia: xixis / D.length,
    intervalo: intervalos.length ? Math.round(intervalos.reduce((s, x) => s + x, 0) / intervalos.length) : null,
    mlPorXixi: Math.round(ml / xixis)
  };
}
