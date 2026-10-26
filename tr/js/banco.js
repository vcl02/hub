'use strict';
// Banco: Supabase + cópia local, sincronização por diferença, formato e validação do db.
// ===== Banco: Supabase + cópia local =====
// Cada mudança grava a cópia local na hora e, 0,8 s depois, envia ao Supabase só as linhas que mudaram
// (diferença para "base", a última versão confirmada pelo servidor). Sem internet, fica pendente e envia ao reconectar.
// Tabelas (todas com user_id e RLS "só o dono"): chave de cada linha entre colchetes.
const TABELAS = { tr_exercicio: ['id'], tr_variacao: ['id'], tr_registro: ['variacao_id', 'data'], tr_treino: ['inicio'] };
const ORDEM = Object.keys(TABELAS);   // pais antes dos filhos
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const K_LOCAL = id => 'tr.db.' + id, K_BASE = id => 'tr.base.' + id;
let db = null, usuario = null, base = null, enviando = false, tEnvio = null, erroSync = '';
// Pesagens do app Corpo (só leitura, ../corpo/perfil.js): o peso das calorias do treino
let medidas = [];
function linhas(d) {   // db → { tabela: { chave: linha } }
  const L = Object.fromEntries(ORDEM.map(t => [t, {}]));
  const por = (t, l) => { L[t][TABELAS[t].map(k => l[k]).join('|')] = l; };
  d.exercicios.forEach((e, ordem) => {
    por('tr_exercicio', { id: e.id, ordem, grupo: e.grupo, regiao: e.regiao, series: e.series, reps: e.reps, descanso: e.descanso, modo: e.modo, ativo: e.ativo });
    e.variacoes.forEach((v, i) => por('tr_variacao', { id: v.id, exercicio_id: e.id, ordem: i, nome: v.nome, unidade: v.unidade, passo: v.passo, lados: v.lados, equip: v.equip || null, nota: v.nota || null }));
  });
  d.registros.forEach(r => por('tr_registro', { variacao_id: r.variacao, data: r.data, series: r.series }));
  d.treinos.forEach(t => por('tr_treino', { inicio: new Date(t.inicio).toISOString(), fim: new Date(t.fim).toISOString(), fechado: !!t.fechado, cardio: t.cardio || null }));
  return L;
}
function deLinhas(R) {   // linhas do servidor → db
  const vs = {}; R.tr_variacao.forEach(v => (vs[v.exercicio_id] ||= []).push(v));
  return preparar({
    exercicios: [...R.tr_exercicio].sort((a, b) => a.ordem - b.ordem).map(e => ({ ...e, variacoes: (vs[e.id] || []).sort((a, b) => a.ordem - b.ordem) })),
    registros: R.tr_registro.map(r => ({ variacao: r.variacao_id, data: r.data, series: r.series })),
    treinos: R.tr_treino.map(t => ({ inicio: Date.parse(t.inicio), fim: Date.parse(t.fim), fechado: t.fechado, cardio: t.cardio }))
  });
}
function diferenca(a, b) {   // o que enviar para o servidor sair de a e chegar em b; null = nada
  let n = 0; const up = {}, del = {};
  for (const t of ORDEM) {
    up[t] = Object.entries(b[t]).filter(([k, l]) => JSON.stringify(a?.[t]?.[k]) !== JSON.stringify(l)).map(([, l]) => l);
    del[t] = Object.entries(a?.[t] || {}).filter(([k]) => !(k in b[t])).map(([, l]) => l);
    n += up[t].length + del[t].length;
  }
  return n ? { up, del } : null;
}
const temPendente = () => !!(db && usuario && diferenca(base, linhas(db)));
async function enviar() {
  clearTimeout(tEnvio);
  if (enviando || !usuario || !db) return;
  const agora = linhas(db), mud = diferenca(base, agora);
  if (!mud) { erroSync = ''; pintarSync(); return; }
  enviando = true;
  try {
    for (const t of ORDEM) if (mud.up[t].length) {
      const { error } = await sb.from(t).upsert(mud.up[t].map(l => ({ user_id: usuario.id, ...l })), { onConflict: ['user_id', ...TABELAS[t]].join(',') });
      if (error) throw error;
    }
    for (const t of [...ORDEM].reverse()) for (const l of mud.del[t]) {
      let q = sb.from(t).delete(); for (const k of TABELAS[t]) q = q.eq(k, l[k]);
      const { error } = await q; if (error) throw error;
    }
    base = agora; store.set(K_BASE(usuario.id), JSON.stringify(base)); erroSync = '';
  } catch (e) { erroSync = e.message || String(e); }
  finally { enviando = false; }
  pintarSync();
  if (!erroSync && temPendente()) enviar();   // mudou algo enquanto enviava
}
async function baixar() {
  const R = {};
  for (const t of ORDEM) {
    R[t] = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await sb.from(t).select('*').range(i, i + 999); if (error) throw error;
      R[t].push(...data); if (data.length < 1000) break;
    }
  }
  return R;
}
function gravar() {
  if (!usuario || !db) return Promise.resolve();
  if (!store.set(K_LOCAL(usuario.id), JSON.stringify(db))) toast('Não consegui gravar no aparelho.', null, true);
  clearTimeout(tEnvio); tEnvio = setTimeout(enviar, 800);
  pintarSync();
  return Promise.resolve();
}
function pintarSync() {
  const p = temPendente(), off = !navigator.onLine || /fetch|network/i.test(erroSync);
  const txt = !p ? 'Tudo salvo na nuvem.' : erroSync && !off ? 'Erro ao enviar para a nuvem: ' + erroSync
    : off ? 'Sem internet: salvo no aparelho, envia para a nuvem quando conectar.' : 'Enviando para a nuvem…';
  $('i-sync').hidden = !p || (!erroSync && !off); $('i-sync').textContent = txt;
  $('i-sync').classList.toggle('err', !!erroSync && !off);
  return txt;
}
addEventListener('online', () => enviar());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && temPendente()) enviar(); });
setInterval(() => { if (temPendente()) enviar(); }, 60000);
// Executa uma mudança, grava e devolve a função que desfaz
function alterar(acao) {
  const antes = JSON.stringify(db);
  acao(); gravar();
  return () => { db = JSON.parse(antes); gravar(); mostrar(pilha[pilha.length - 1]); toast('Desfeito'); };
}

function bancoNovo() {
  return {
    exercicios: PADRAO.map(([grupo, regiao, descanso, nomes]) => ({ grupo, regiao, series: 3, reps: 12, descanso, modo: MODO_PADRAO, variacoes: nomes.map(nome => ({ nome })) })),
    registros: [], treinos: []
  };
}
// reps aceitam o formato antigo em texto ("10–12" → 12)
const repsDe = r => intEntre(Math.max(0, ...(String(r ?? '').match(/\d+/g) || [0]).map(Number)), 1, 50, 12);
function variacaoAtiva(e) { if (e.variacoes[e.ativo]?.nome) return e.ativo; const i = e.variacoes.findIndex(v => v.nome); return i < 0 ? 0 : i; }
function preparar(d) {           // valida, completa campos e migra formatos antigos
  if (d && d.slots) d = {
    exercicios: d.slots.map(s => ({ id: s.id, grupo: s.g, series: s.sets, reps: s.reps, descanso: s.rest, ativo: s.a, variacoes: (s.vs || []).map(v => ({ id: v.id, nome: v.pt, unidade: v.u })) })),
    registros: (d.logs || []).map(l => ({ variacao: l.v, data: l.d, carga: l.w, reps: l.r }))
  };
  if (!d || !Array.isArray(d.exercicios) || !Array.isArray(d.registros)) throw new Error('formato');
  const exercicios = d.exercicios.map((e, i) => {
    const vs = (e.variacoes || []).slice(0, 3).map((v, j) => {
      const unidade = UNIDADES.includes(v.unidade) ? v.unidade : 'kg', p = num(v.passo);
      const equip = String(v.equip ?? '').trim().slice(0, 8), nota = String(v.nota ?? '').slice(0, 500);
      return { id: v.id || novoId(), nome: String(v.nome || '').trim(), unidade, passo: p > 0 && p <= 50 ? p : passoPadrao(j, unidade), lados: v.lados === 2 ? 2 : 1, ...(equip && { equip }), ...(nota.trim() && { nota }) };
    });
    while (vs.length < 3) vs.push({ id: novoId(), nome: '', unidade: 'kg', passo: passoPadrao(vs.length, 'kg'), lados: 1 });
    const grupo = String(e.grupo || vs[0].nome);
    const regiao = REGIOES.includes(e.regiao) ? e.regiao : /perna|coxa|gl[uú]t|panturr|agach|leg/i.test(grupo + ' ' + vs[0].nome) ? 'Pernas' : 'Superior';
    const ex = { id: e.id || novoId(), grupo, regiao, series: intEntre(e.series, 1, 10, 3), reps: repsDe(e.reps), descanso: intEntre(e.descanso, 10, 600, PADRAO[i]?.[2] || 75), modo: MODOS[e.modo] ? e.modo : MODO_PADRAO, ativo: e.ativo || 0, variacoes: vs };
    ex.ativo = variacaoAtiva(ex);
    return ex;
  });
  const exDe = new Map(), varDe = new Map();
  exercicios.forEach(e => e.variacoes.forEach(v => { exDe.set(v.id, e); varDe.set(v.id, v); }));
  const registros = d.registros.filter(r => r && r.variacao && dataOk(r.data)).map(r => {
    let series = r.series;
    if (!Array.isArray(series)) {   // formato antigo: carga (peso da 1ª série) + reps → pirâmide crescente
      const e = exDe.get(r.variacao), v = varDe.get(r.variacao), reps = Array.isArray(r.reps) ? r.reps : Array(e?.series || 3).fill(r.reps);
      series = reps.map((n, i) => ({ kg: e && v ? alvoKg({ ...e, modo: 'crescente' }, v, +r.carga, i) : +r.carga, reps: n }));
    }
    return { variacao: r.variacao, data: r.data, series: series.map(s => ({ kg: Math.max(0, num(s.kg) || 0), reps: Math.max(0, parseInt(s.reps, 10) || 0), ...(s.falha === true && { falha: true }) })) };
  }).filter(r => varDe.has(r.variacao) && r.series.length && r.series.every(s => s.kg > 0));
  // cardio (esteira depois do treino): { inicio, ms, vel, incl } em ms, ms, km/h e %; sem tempo ou sem velocidade, descartado
  const cardio = c => c && c.inicio > 0 && c.ms > 0 && num(c.vel) > 0 ? { inicio: +c.inicio, ms: Math.round(+c.ms), vel: num(c.vel), incl: Math.max(0, num(c.incl) || 0) } : null;
  const treinos = (d.treinos || []).filter(t => t && t.inicio > 0 && t.fim >= t.inicio).map(t => ({ inicio: +t.inicio, fim: +t.fim, ...(t.fechado && { fechado: true }), ...(cardio(t.cardio) && { cardio: cardio(t.cardio) }) }));
  return { exercicios, registros, treinos };   // pesagens antigas da cópia local (medidas) ficam de fora: agora são do app Corpo
}
