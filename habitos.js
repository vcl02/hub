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
//         aguas:    { dia: ml }                             agua_dia (soma do dia)
//         besteiras:{ dia: reais } }                        fin: gastos com a categoria Besteira, pela data da compra
// Estados de um hábito num dia: feito, falhou, protegido (falhou, mas uma proteção segurou a ofensiva), pendente (hoje, ainda
// dá tempo), folga (dia sem o hábito, como terça no treino) e antes (antes do primeiro registro do hábito).
const LANCADO_NO_DIA_DESDE = '2026-10-27';   // antes disso não se sabia quando cada coisa foi lançada: tudo conta como no dia
const META_AGUA_ML = 1000;                   // a mesma META_ML de agua/js/config.js (o teste confere)
const PROTECOES_MAX = 2;                     // proteções guardadas, no máximo
// Besteira (Fin): nos dias presenciais (qua e qui, ROTINA.presencial), no máximo R$ 22 na categoria Besteira por dia.
// A meta começou em 27/10/2026: antes disso, nada conta.
const LIMITE_BESTEIRA_DIA = 22;
const BESTEIRA_DESDE = '2026-10-27';
// Sono: no mínimo 7 h (o OK do Corpo) na noite que terminou no dia, lançado no dia. A noite de terça para quarta (o dia de
// quarta) é folga.
const SONO_MIN_H = 7;
const SONO_FOLGA = [3];   // Date.getDay do dia em que acordou: quarta

const HABITOS = Object.freeze([
  { id: 'treino', nome: 'Treino', pasta: 'tr/' },
  { id: 'deficit', nome: 'Alimentação', pasta: 'al/' },   // o déficit do dia
  { id: 'corpo', nome: 'Corpo (Peso e Sono)', pasta: 'corpo/' },   // as duas partes: pesagem e sono (7 h ou mais), lançados no dia
  { id: 'agua', nome: 'Água', pasta: 'agua/' },
  { id: 'besteira', nome: 'Fin (Besteira)', pasta: 'fin/' }   // qua e qui: até R$ 22 em besteira
]);

const diaMais = (dia, n) => { const [a, m, d] = dia.split('-').map(Number); return diaDoInstante(new Date(a, m - 1, d + n, 12).getTime()); };
// Lançado no próprio dia: pelo instante gravado pelo app (relógio do celular); antes da regra, sempre
const lancadoNoDia = (em, dia) => dia < LANCADO_NO_DIA_DESDE || (!!em && diaDoInstante(Date.parse(em)) === dia);
// Comido e meta do dia, só com o que foi lançado no dia (a partir da regra): comida ou caminhada lançada depois não conta
function contaDoDia(D, dia) {
  const vale = x => dia < LANCADO_NO_DIA_DESDE || !!x.hora;
  const comidas = [...(D.comidas[dia] || []), ...(D.bebidas?.[dia] || [])], trechos = (D.trechos[dia] || []).filter(vale);
  const gasto = gastoNoDia(D.medidas, D.treinos, trechos, dia);
  return { comidas, tarde: comidas.some(c => !vale(c)), comido: Math.round(comidas.reduce((s, c) => s + c.kcal, 0)), meta: gasto ? metaKcal(gasto) : null, gasto: gasto?.total ?? null };
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
  if (id === 'corpo') {   // peso e sono: feito com os dois (sono de folga vale); qualquer um que falhou, falhou; senão, falta um
    const p = estadoNoDia('peso', dia, D, hoje), s = estadoNoDia('sono', dia, D, hoje);
    if (p === 'falhou' || s === 'falhou') return 'falhou';
    return p === 'feito' && (s === 'feito' || s === 'folga') ? 'feito' : aindaDa;
  }
  if (id === 'peso') {   // pesagem lançada no próprio dia (uma das partes do Corpo)
    const m = D.medidas.find(x => x.data === dia && x.peso);
    return m && lancadoNoDia(m.pesoEm, dia) ? 'feito' : aindaDa;
  }
  if (id === 'sono') {   // 7 h ou mais, lançado no dia; lançado com menos já falhou (a noite não volta); quarta é folga
    if (SONO_FOLGA.includes(semanaDoDia(dia))) return 'folga';
    const s = D.sonos[dia];
    if (!s || s.sono == null || !lancadoNoDia(s.sonoEm, dia)) return aindaDa;
    return s.sono >= SONO_MIN_H ? 'feito' : 'falhou';
  }
  if (id === 'besteira') {   // só qua e qui; o gasto só sobe: hoje é feito enquanto couber, passou do limite já falhou
    if (!ROTINA.presencial.includes(semanaDoDia(dia))) return 'folga';
    return (D.besteiras?.[dia] || 0) <= LIMITE_BESTEIRA_DIA ? 'feito' : 'falhou';
  }
  return (D.aguas[dia] || 0) >= META_AGUA_ML ? 'feito' : aindaDa;
}

// Primeiro dia com registro de cada hábito (sem nenhum, hoje): antes dele o hábito não existia
function primeiroDia(id, D, hoje) {
  if (id === 'besteira') return BESTEIRA_DESDE < hoje ? BESTEIRA_DESDE : hoje;
  if (id === 'corpo') { const p = primeiroDia('peso', D, hoje), s = primeiroDia('sono', D, hoje); return p < s ? p : s; }
  const L = id === 'treino' ? D.treinos.map(t => diaDoInstante(t.inicio)) : id === 'deficit' ? Object.keys(D.comidas)
    : id === 'peso' ? D.medidas.filter(m => m.peso).map(m => m.data) : id === 'sono' ? Object.keys(D.sonos).filter(d => D.sonos[d].sono != null)
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
const horasTxt = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h${m % 60 ? ' ' + pad2(m % 60) : ''}`; };   // 7,5 → "7 h 30"
const pad2 = n => String(n).padStart(2, '0');
// Passou da meta (gasto − 500): só o número do saldo pelo gasto do dia inteiro, e a cor diz o que é: verde, o dia ainda em
// déficit (só menor que o planejado, "200 kcal"); vermelho, já em superávit ("750 kcal")
const acimaDaMeta = c => { const d = c.gasto - c.comido; return { valor: `${milhar(Math.abs(d))} kcal`, progresso: 1, ...(d >= 0 ? { bom: true } : { acima: true }) }; };
// passado: um dia que já fechou (a tela inicial voltando para dias anteriores): o texto diz o que aconteceu, não o que fazer
// Corpo (Peso e Sono): os dois textos juntos ("100,4 kg · 7 h 30"); em vermelho se alguma parte está
const comCorpo = r => ({ ...r, corpo: { valor: `${r.peso.valor} · ${r.sono.valor}`, ...((r.peso.acima || r.sono.acima) && { acima: true }) } });
function resumoDeHoje(D, hoje, passado = false) {
  const wd = semanaDoDia(hoje);
  const proximo = [1, 2, 3, 4, 5, 6, 7].map(n => (wd + n) % 7).find(x => ROTINA.treino.includes(x));
  const treinou = D.treinos.some(t => diaDoInstante(t.inicio) === hoje);
  const c = contaDoDia(D, hoje), resta = c.meta == null ? null : c.meta - c.comido;
  const m = D.medidas.find(x => x.data === hoje && x.peso), s = D.sonos[hoje], ml = D.aguas[hoje] || 0;
  const presencial = ROTINA.presencial.includes(wd), gastou = D.besteiras?.[hoje] || 0;
  const proximoPresencial = [1, 2, 3, 4, 5, 6, 7].map(n => (wd + n) % 7).find(x => ROTINA.presencial.includes(x));
  const reais = v => 'R$\u00a0' + v.toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  if (passado) return comCorpo({
    treino: { valor: treinou ? 'Treinou' : ROTINA.treino.includes(wd) ? 'Não treinou' : 'Folga', ...(!treinou && ROTINA.treino.includes(wd) && { acima: true }) },
    deficit: !c.comidas.length ? { valor: 'Nada lançado', acima: true } : resta == null ? { valor: 'Sem pesagem' } : resta >= 0
      ? { valor: `${milhar(resta)} kcal`, progresso: c.meta ? c.comido / c.meta : 0, bom: true }   // dentro da meta: só o que sobrou, em verde
      : acimaDaMeta(c),
    peso: { valor: m ? `${decimal(m.peso)} kg` : 'Sem pesagem' },
    sono: { valor: s && s.sono != null ? horasTxt(s.sono) : SONO_FOLGA.includes(wd) ? 'Folga' : 'Sem sono', ...(s && s.sono != null && s.sono < SONO_MIN_H && { acima: true }) },
    agua: { valor: `${milhar(ml)} / ${milhar(META_AGUA_ML)} ml`, progresso: Math.min(1, ml / META_AGUA_ML) },
    besteira: !presencial ? { valor: 'Folga' }
      : { valor: `${reais(gastou)} / ${reais(LIMITE_BESTEIRA_DIA)}`, progresso: Math.min(1, gastou / LIMITE_BESTEIRA_DIA), ...(gastou > LIMITE_BESTEIRA_DIA && { acima: true }) }
  });
  return comCorpo({
    treino: { valor: treinou ? 'Treinou' : ROTINA.treino.includes(wd) ? 'Dia de treino' : `Próximo: ${NOMES_SEMANA[proximo]}` },
    deficit: resta == null ? { valor: 'Sem pesagem' } : resta >= 0
      ? { valor: `${milhar(resta)} kcal restantes`, progresso: c.meta ? c.comido / c.meta : 0 }
      : acimaDaMeta(c),
    peso: { valor: m ? `${decimal(m.peso)} kg` : 'Pesar hoje' },
    sono: { valor: s && s.sono != null ? horasTxt(s.sono) : SONO_FOLGA.includes(wd) ? 'Folga hoje' : 'Registrar sono', ...(s && s.sono != null && s.sono < SONO_MIN_H && { acima: true }) },
    agua: { valor: `${milhar(ml)} / ${milhar(META_AGUA_ML)} ml`, progresso: Math.min(1, ml / META_AGUA_ML) },
    besteira: !presencial ? { valor: `Próximo: ${NOMES_SEMANA[proximoPresencial]}` }
      : { valor: `${reais(gastou)} / ${reais(LIMITE_BESTEIRA_DIA)}`, progresso: Math.min(1, gastou / LIMITE_BESTEIRA_DIA), ...(gastou > LIMITE_BESTEIRA_DIA && { acima: true }) }

  });
}

// Como estava no fim de um dia já passado (a tela inicial voltando para dias anteriores), pelos mesmos estados de
// calcularHabitos(D, hoje): a ofensiva de cada hábito e os dias perfeitos seguidos até aquele dia, contados para trás.
function ateODia(R, dia) {
  const ofensiva = id => {
    let n = 0;
    for (let d = dia; R.habitos[id].dias[d] != null; d = diaMais(d, -1)) {
      const e = R.habitos[id].dias[d];
      if (e === 'feito') n++;
      else if (e === 'falhou' || e === 'antes') break;
    }
    return n;
  };
  let perfeitos = 0;
  for (let d = dia; R.perfeito[d]; d = diaMais(d, -1)) perfeitos++;
  return { ofensiva: Object.fromEntries(HABITOS.map(h => [h.id, ofensiva(h.id)])), perfeitos };
}

// O que o al deste aparelho ainda não enviou à nuvem (al.db e al.base no localStorage, mesma origem): o al envia 0,8 s depois
// de cada mudança, e voltar para cá antes disso (ou sem internet) deixaria a comida e a caminhada só no aparelho. Dia em que
// a cópia do al difere da base dele (pendente) usa a cópia; os outros dias ficam com o que veio da nuvem.
//   alDb = { registros: [{ data, hora, qtd, kcal }], dias: [{ data, caminhadas }] } · alBase = { al_registro: { id: linha }, al_dia: { data: linha } }
function comPendentesDoAl(D, alDb, alBase) {
  if (!alDb || !Array.isArray(alDb.registros) || !Array.isArray(alDb.dias)) return D;
  const hora = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(h) ? h : '';   // a mesma limpeza do al
  const comida = r => ({ hora: hora(r.hora), kcal: Math.min(Math.max(+r.kcal || 0, 0), 5000) * (+r.qtd > 0 ? Math.min(+r.qtd, 20) : 1) });
  const trecho = t => ({ hora: hora(t?.hora), ...(+t?.minutos > 0 && +t.minutos <= 600 && { minutos: +t.minutos }), ...(+t?.km > 0 && +t.km <= 60 && { km: +t.km }) });
  const porDia = (L, f) => L.reduce((o, x) => { (o[x.data] = o[x.data] || []).push(...f(x)); return o; }, {});
  const chave = L => JSON.stringify(L.map(x => JSON.stringify(x)).sort());
  const juntar = (atual, aqui, base) => {
    const R = { ...atual };
    for (const d of new Set([...Object.keys(aqui), ...Object.keys(base)])) {
      if (chave(aqui[d] || []) === chave(base[d] || [])) continue;
      if (aqui[d]?.length) R[d] = aqui[d]; else delete R[d];
    }
    return R;
  };
  const regs = L => porDia(L.filter(r => r && /^\d{4}-\d{2}-\d{2}$/.test(r.data)), r => [comida(r)]);
  const dias = L => porDia(L.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.data)), x => (Array.isArray(x.caminhadas) ? x.caminhadas : []).map(trecho));
  return {
    ...D,
    comidas: juntar(D.comidas, regs(alDb.registros), regs(Object.values(alBase?.al_registro || {}))),
    trechos: juntar(D.trechos, dias(alDb.dias), dias(Object.values(alBase?.al_dia || {})))
  };
}
