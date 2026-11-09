'use strict';
// Conta do dia: o que comi (kcal e macros), o gasto (basal × fator de atividade + treino + caminhada) e o saldo.
// O gasto sai de gasto.js (gastoNoDia, o mesmo do hub): peso pela pesagem mais recente até o dia (do app Corpo, pesoNoDia),
// treinos do Treino e a soma dos trechos marcados ("Andei +": ida, volta, mercado…), sem nenhum automático.
// Sem pesagem nenhuma, não há gasto nem saldo.
const trechosDoDia = (dia) => db.dias.find((x) => x.data === dia)?.caminhadas || [];
const gastoDoDia = (dia) => gastoNoDia(medidas, tr.treinos, trechosDoDia(dia), dia);

// Comido: os registros do dia (porção × qtd) e as bebidas lançadas na Água (suco, refri…: kcal e macros por bebidas.js)
function comidoNoDia(dia) {
  const t = { kcal: 0, prot: 0, carb: 0, gord: 0 };

  for (const r of db.registros)
    if (r.data === dia) for (const k in t) t[k] += r[k] * r.qtd;

  for (const b of bebidas[dia] || []) {
    const n = nutrientesBebida(b);

    for (const k in t) t[k] += n[k];
  }

  return {
    kcal: Math.round(t.kcal),
    prot: Math.round(t.prot),
    carb: Math.round(t.carb),
    gord: Math.round(t.gord),
  };
}

// Meta do dia: kcal = gasto − déficit planejado (sobe junto com treino e caminhada); proteína por kg de peso,
// gordura em % das kcal e carboidrato com o que sobra. Sem pesagem, sem meta.
function metaDoDia(dia) {
  const g = gastoDoDia(dia);

  if (!g) return null;

  const kcal = metaKcal(g),
    prot = Math.round(PROT_G_KG * g.peso),
    gord = Math.round((kcal * GORD_PCT) / 9);

  return {
    kcal,
    prot,
    gord,
    carb: Math.max(0, Math.round((kcal - prot * 4 - gord * 9) / 4)),
  };
}

// saldo < 0 = déficit (comi menos do que gastei)
function saldoDoDia(dia) {
  const g = gastoDoDia(dia),
    c = comidoNoDia(dia);

  return { gasto: g, comido: c, saldo: g ? c.kcal - g.total : null };
}

// Passou da meta (que já tem o déficit planejado): o dia ainda pode fechar em déficit, só menor que o planejado, ou já em
// superávit. kcal que faltam para o gasto do dia inteiro, sem comer mais nada.
function avisoAinda(g, kcalComidas) {
  const ainda = g.total - kcalComidas;

  return {
    classe: ainda >= 0 ? 'bom' : 'ruim',
    texto:
      ainda >= 0
        ? `Ainda em déficit de ${inteiro(ainda)} kcal`
        : `Já em superávit de ${inteiro(-ainda)} kcal`,
  };
}

// Dia de treino opcional (extra) em que já passou da meta e ainda não treinou: o treino vira obrigatório
const alertaUrgente = (g, resto, aberto) => !!aberto && !!g?.previsto?.extra && resto < 0;

// As linhas do alerta urgente: quanto passou, o que o treino ajuda (volta para a meta ou só diminui o excesso) e o risco de
// fechar em superávit
function linhasDoAlerta(g, kcalComidas, resto) {
  const p = g.previsto,
    passou = -resto,
    depois = passou - p.kcal,
    superavit = kcalComidas - g.total,
    comTreino = kcalComidas - g.total - p.kcal;

  return [
    `Passou <b>${inteiro(passou)} kcal</b> da meta.`,
    depois <= 0
      ? `Se treinar, você ganha ${inteiro(p.kcal)} kcal e <b>volta para a meta</b>.`
      : `Se treinar, você ganha ${inteiro(p.kcal)} kcal e o excesso cai para <b>${inteiro(depois)} kcal</b>.`,
    superavit > 0
      ? `Sem treino o dia fecha em <b>superávit de ${inteiro(superavit)} kcal</b>${comTreino <= 0 ? '; treinando, ainda fecha em déficit' : ''}.`
      : '',
  ].filter(Boolean);
}
