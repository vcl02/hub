'use strict';
// Hábitos da página inicial do hub: o estado de cada hábito em cada dia, as ofensivas, os dias perfeitos e as proteções.
// Só funções puras sobre os dados que os apps já gravam (o hub só lê): carregado depois de corpo/perfil.js (ROTINA, pesoNoDia…)
// e de al/gasto.js (gastoNoDia, metaKcal, diaDoInstante, semanaDoDia). hub.js baixa os dados e desenha.
//   D = { treinos:  [{ inicio, fim, cardio? }]              tr_treino, instantes em ms
//         comidas:  { dia: [{ hora, kcal }] }               al_registro (kcal já × qtd; hora '' = lançado depois do dia)
//         bebidas:  { dia: [{ hora, kcal }] }               agua_dia: suco, refri… (kcal por agua/bebidas.js), contam como comida
//         trechos:  { dia: [{ hora, minutos?, km? }] }      al_dia.caminhadas (hora '' = lançado depois do dia)
//         medidas:  [{ data, hora, peso?, cintura?, pesoEm? }]   corpo_medida, por ordenarMedidas (corpo/perfil.js)
//         sonos:    { dia: { sono, sonoEm? } }               corpo_dia
//         aguas:    { dia: ml } }                           agua_dia (soma do dia)
// Estados de um hábito num dia: feito, falhou, protegido (falhou, mas uma proteção segurou a ofensiva), pendente (hoje, ainda
// dá tempo), folga (dia sem o hábito, como terça no treino) e antes (antes do primeiro registro do hábito).
const LANCADO_NO_DIA_DESDE = '2026-10-27';   // antes disso não se sabia quando cada coisa foi lançada: tudo conta como no dia
const META_AGUA_ML = 1000;                   // a mesma META_ML de agua/js/config.js (o teste confere)
const PROTECOES_MAX = 2;                     // proteções guardadas, no máximo

const HABITOS = Object.freeze([
  { id: 'treino', nome: 'Treino', pasta: 'tr/' },
  { id: 'deficit', nome: 'Déficit', pasta: 'al/' },
  { id: 'corpo', nome: 'Peso e sono', pasta: 'corpo/' },   // os dois lançados no dia
  { id: 'agua', nome: 'Água', pasta: 'agua/' }
]);

const diaMais = (dia, n) => { const [a, m, d] = dia.split('-').map(Number); return diaDoInstante(new Date(a, m - 1, d + n, 12).getTime()); };
// Lançado no próprio dia: pelo instante gravado pelo app (relógio do celular); antes da regra, sempre
const lancadoNoDia = (em, dia) => dia < LANCADO_NO_DIA_DESDE || (!!em && diaDoInstante(Date.parse(em)) === dia);
// Comido e meta do dia, só com o que foi lançado no dia (a partir da regra): comida ou caminhada lançada depois não conta
function contaDoDia(D, dia) {
  const vale = x => dia < LANCADO_NO_DIA_DESDE || !!x.hora;
  const comidas = [...(D.comidas[dia] || []), ...(D.bebidas?.[dia] || [])], trechos = (D.trechos[dia] || []).filter(vale);
  const gasto = gastoNoDia(D.medidas, D.treinos, trechos, dia);
  return { comidas, tarde: comidas.some(c => !vale(c)), comido: Math.round(comidas.reduce((s, c) => s + c.kcal, 0)), meta: gasto ? metaKcal(gasto) : null };
}

function estadoNoDia(id, dia, D, hoje) {
  const aindaDa = dia === hoje ? 'pendente' : 'falhou';
  if (id === 'treino') {
    if (!ROTINA.treino.includes(semanaDoDia(dia))) return 'folga';
    return D.treinos.some(t => diaDoInstante(t.inicio) === dia) ? 'feito' : aindaDa;
  }
  if (id === 'deficit') {   // hoje: feito enquanto o comido couber na meta (pendente se passou ou nada lançado); fecha à meia-noite
    const c = contaDoDia(D, dia);
    return c.comidas.length && !c.tarde && c.meta != null && c.comido <= c.meta ? 'feito' : aindaDa;
  }
  if (id === 'corpo') {   // peso e sono: feito só com os dois lançados no próprio dia
    const m = D.medidas.find(x => x.data === dia && x.peso), s = D.sonos[dia];
    const pesou = !!m && lancadoNoDia(m.pesoEm, dia), dormiu = !!s && s.sono != null && lancadoNoDia(s.sonoEm, dia);
    return pesou && dormiu ? 'feito' : aindaDa;
  }
  return (D.aguas[dia] || 0) >= META_AGUA_ML ? 'feito' : aindaDa;
}

// Primeiro dia com registro de cada hábito (sem nenhum, hoje): antes dele o hábito não existia. Peso e sono: o 1º de qualquer um
function primeiroDia(id, D, hoje) {
  const L = id === 'treino' ? D.treinos.map(t => diaDoInstante(t.inicio)) : id === 'deficit' ? Object.keys(D.comidas)
    : id === 'corpo' ? [...D.medidas.filter(m => m.peso).map(m => m.data), ...Object.keys(D.sonos).filter(d => D.sonos[d].sono != null)]
    : Object.keys(D.aguas).filter(d => D.aguas[d] > 0);
  return L.reduce((a, b) => b < a ? b : a, hoje);
}

// Todos os dias, do primeiro registro até hoje, em ordem. Proteções: +1 a cada semana de treino perfeita (todos os dias de
// treino da ROTINA feitos, contada no último deles), até PROTECOES_MAX guardadas. Dia que falhou gasta uma, se houver,
// na ordem dos hábitos; o dia fica "protegido" (não quebra a ofensiva, mas também não soma).
function calcularHabitos(D, hoje) {
  const inicio = Object.fromEntries(HABITOS.map(h => [h.id, primeiroDia(h.id, D, hoje)]));
  const dias = [];
  for (let d = Object.values(inicio).reduce((a, b) => b < a ? b : a, hoje); d <= hoje; d = diaMais(d, 1)) dias.push(d);
  const E = Object.fromEntries(HABITOS.map(h => [h.id, {}]));
  const ultimoTreino = Math.max(...ROTINA.treino);
  let protecoes = 0, ganhas = 0, usadas = 0;
  for (const d of dias) {
    for (const h of HABITOS) {
      let e = estadoNoDia(h.id, d, D, hoje);
      if (d < inicio[h.id] && e !== 'folga') e = 'antes';   // folga continua folga (terça antes do 1º treino)
      if (e === 'falhou' && protecoes > 0) { protecoes--; usadas++; e = 'protegido'; }
      E[h.id][d] = e;
    }
    if (semanaDoDia(d) === ultimoTreino && ROTINA.treino.every(wd => E.treino[diaMais(d, wd - ultimoTreino)] === 'feito')) {
      if (protecoes < PROTECOES_MAX) protecoes++;
      ganhas++;
    }
  }
  // Ofensiva: dias feitos seguidos até hoje. Hoje pendente, folga e protegido não quebram nem somam; falhou quebra.
  const ofensiva = id => {
    let n = 0;
    for (let i = dias.length - 1; i >= 0; i--) {
      const e = E[id][dias[i]];
      if (e === 'feito') n++;
      else if (e === 'falhou' || e === 'antes') break;
    }
    return n;
  };
  // Dia perfeito: todos os hábitos feitos (ou de folga), sem proteção. Hoje conta quando tudo já está feito.
  const perfeito = d => HABITOS.every(h => E[h.id][d] === 'feito' || E[h.id][d] === 'folga');
  let perfeitos = 0;
  for (let i = dias.length - 1; i >= 0; i--) {
    if (perfeito(dias[i])) perfeitos++;
    else if (dias[i] !== hoje) break;
  }
  return {
    habitos: Object.fromEntries(HABITOS.map(h => [h.id, { dias: E[h.id], hoje: E[h.id][hoje], ofensiva: ofensiva(h.id) }])),
    perfeito: Object.fromEntries(dias.map(d => [d, perfeito(d)])),
    perfeitos, protecoes, ganhas, usadas
  };
}

// O de hoje para cada hábito, para a tela: valor (texto curto) e progresso (0 a 1, só os que têm meta numérica)
const NOMES_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const milhar = n => Math.round(n).toLocaleString('pt-BR');
const decimal = n => (Math.round(n * 10) / 10).toLocaleString('pt-BR');
function resumoDeHoje(D, hoje) {
  const wd = semanaDoDia(hoje);
  const proximo = [1, 2, 3, 4, 5, 6, 7].map(n => (wd + n) % 7).find(x => ROTINA.treino.includes(x));
  const treinou = D.treinos.some(t => diaDoInstante(t.inicio) === hoje);
  const c = contaDoDia(D, hoje), resta = c.meta == null ? null : c.meta - c.comido;
  const m = D.medidas.find(x => x.data === hoje && x.peso), s = D.sonos[hoje], ml = D.aguas[hoje] || 0;
  return {
    treino: { valor: treinou ? 'Treinou' : ROTINA.treino.includes(wd) ? 'Dia de treino' : `Próximo: ${NOMES_SEMANA[proximo]}` },
    deficit: resta == null ? { valor: 'Sem pesagem' } : resta >= 0
      ? { valor: `${milhar(resta)} kcal restantes`, progresso: c.meta ? c.comido / c.meta : 0 }
      : { valor: `${milhar(-resta)} kcal acima`, progresso: 1, acima: true },
    corpo: { valor: `${m ? `${decimal(m.peso)} kg` : 'Pesar hoje'} · ${s && s.sono != null ? `${decimal(s.sono)} h` : 'Registrar sono'}` },
    agua: { valor: `${milhar(ml)} / ${milhar(META_AGUA_ML)} ml`, progresso: Math.min(1, ml / META_AGUA_ML) }
  };
}
