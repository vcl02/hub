'use strict';
// Banco: Supabase + cópia local, sincronização por diferença, formato do db e leitura do peso e dos treinos do tr.
// Cada mudança grava a cópia local na hora e, 0,8 s depois, envia ao Supabase só as linhas que mudaram
// (diferença para "base", a última versão confirmada pelo servidor). Sem internet, fica pendente e envia ao reconectar.
// Tabelas (todas com user_id e RLS "só o dono"): chave de cada linha entre colchetes.
const TABELAS = { al_item: ['id'], al_registro: ['id'], al_dia: ['data'] };
const ORDEM = Object.keys(TABELAS);
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const K_LOCAL = id => 'al.db.' + id, K_BASE = id => 'al.base.' + id, K_TR = id => 'al.tr.' + id;
let db = null, tr = { medidas: [], treinos: [] }, usuario = null, base = null, enviando = false, tEnvio = null, erroSync = '';

const macros = x => ({ kcal: x.kcal, prot: x.prot, carb: x.carb, gord: x.gord });
function linhas(d) {   // db → { tabela: { chave: linha } }
  const L = Object.fromEntries(ORDEM.map(t => [t, {}]));
  const por = (t, l) => { L[t][TABELAS[t].map(k => l[k]).join('|')] = l; };
  d.itens.forEach(i => por('al_item', { id: i.id, nome: i.nome, porcao: i.porcao, ...macros(i), usos: i.usos }));
  d.registros.forEach(r => por('al_registro', { id: r.id, data: r.data, hora: r.hora, item_id: r.item || null, nome: r.nome, porcao: r.porcao, qtd: r.qtd, ...macros(r) }));
  d.dias.forEach(x => por('al_dia', { data: x.data, andou: x.andou }));
  return L;
}
function deLinhas(R) {   // linhas do servidor → db (numeric chega como texto ou número)
  return preparar({
    itens: R.al_item,
    registros: R.al_registro.map(r => ({ ...r, item: r.item_id })),
    dias: R.al_dia
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
    for (const t of ORDEM) for (const l of mud.del[t]) {
      let q = sb.from(t).delete(); for (const k of TABELAS[t]) q = q.eq(k, l[k]);
      const { error } = await q; if (error) throw error;
    }
    base = agora; store.set(K_BASE(usuario.id), JSON.stringify(base)); erroSync = '';
  } catch (e) { erroSync = e.message || String(e); }
  finally { enviando = false; }
  pintarSync();
  if (!erroSync && temPendente()) enviar();   // mudou algo enquanto enviava
}
async function todas(tabela, colunas = '*') {
  const R = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(tabela).select(colunas).range(i, i + 999); if (error) throw error;
    R.push(...data); if (data.length < 1000) return R;
  }
}
async function baixar() {
  const R = {};
  for (const t of ORDEM) R[t] = await todas(t);
  return R;
}
// Peso e treinos do Treino (só leitura): ficam no aparelho para a conta do gasto abrir sem internet.
async function baixarTreino() {
  const [medidas, treinos] = await Promise.all([todas('tr_medida', 'data,peso'), todas('tr_treino', 'inicio,fim')]);
  tr = {
    medidas: medidas.map(m => ({ data: m.data, peso: num(m.peso) })).filter(m => m.peso > 0).sort((a, b) => a.data.localeCompare(b.data)),
    treinos: treinos.map(t => ({ inicio: Date.parse(t.inicio), fim: Date.parse(t.fim) })).filter(t => t.fim >= t.inicio)
  };
  store.set(K_TR(usuario.id), JSON.stringify(tr));
}
function gravar() {
  if (!usuario || !db) return;
  if (!store.set(K_LOCAL(usuario.id), JSON.stringify(db))) toast('Não consegui gravar no aparelho.', true);
  clearTimeout(tEnvio); tEnvio = setTimeout(enviar, 800);
  pintarSync();
}
function pintarSync() {
  const p = temPendente(), off = !navigator.onLine || /fetch|network/i.test(erroSync);
  const txt = !p ? '' : erroSync && !off ? 'Erro ao enviar para a nuvem: ' + erroSync
    : off ? 'Sem internet: salvo no aparelho, envia quando conectar.' : '';
  $('sync').hidden = !txt; $('sync').textContent = txt;
  $('sync').classList.toggle('erro', !!erroSync && !off);
}
addEventListener('online', () => enviar());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && temPendente()) enviar(); });
setInterval(() => { if (temPendente()) enviar(); }, 60000);

// Valida e completa o db (cópia local antiga ou linhas do servidor)
function preparar(d) {
  const n = (v, max) => { const x = num(v); return x >= 0 ? Math.min(x, max) : 0; };
  const valores = x => ({ kcal: n(x.kcal, 5000), prot: n(x.prot, 500), carb: n(x.carb, 500), gord: n(x.gord, 500) });
  const txt = (v, max) => String(v ?? '').trim().slice(0, max);
  const itens = (d?.itens || []).filter(i => i && i.id && txt(i.nome, 60))
    .map(i => ({ id: String(i.id), nome: txt(i.nome, 60), porcao: txt(i.porcao, 60), ...valores(i), usos: Math.max(0, parseInt(i.usos, 10) || 0) }));
  const registros = (d?.registros || []).filter(r => r && r.id && /^\d{4}-\d{2}-\d{2}$/.test(r.data) && txt(r.nome, 60))
    .map(r => ({ id: String(r.id), data: r.data, hora: /^\d{2}:\d{2}$/.test(r.hora) ? r.hora : '', ...(r.item && { item: String(r.item) }),
      nome: txt(r.nome, 60), porcao: txt(r.porcao, 60), qtd: num(r.qtd) > 0 ? Math.min(num(r.qtd), 20) : 1, ...valores(r) }));
  const dias = (d?.dias || []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.data)).map(x => ({ data: x.data, andou: x.andou === true }));
  return { itens, registros, dias };
}
