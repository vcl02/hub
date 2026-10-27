'use strict';
// Contas: total do dia, lembretes (horários e se foram cumpridos), e botões de ml (das quantidades já usadas).
const doDia = dia => db.dias.find(x => x.data === dia) || { data: dia, aguas: [] };
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
// Lembrete da vez: o mais recente que já chegou e não foi cumprido (só hoje, e só até 1 h depois do último horário:
// à noite não chama para beber)
function lembreteAgora(dia) {
  if (dia !== hoje()) return null;
  const L = lembretes(dia), m = minutos(agoraHHMM());
  if (m >= (LEMBRETE_FIM + 1) * 60) return null;
  const atual = [...L].reverse().find(x => minutos(x.hora) <= m);
  return atual && atual.estado === 'atrasado' ? atual : null;
}

// Botões de ml: as quantidades que já digitei, das mais usadas para as menos (empate: a menor primeiro)
function botoesMl() {
  const conta = {};
  db.dias.forEach(x => x.aguas.forEach(a => { conta[a.ml] = (conta[a.ml] || 0) + 1; }));
  return Object.entries(conta).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, BOTOES_ML).map(([ml]) => +ml).sort((a, b) => a - b);
}
