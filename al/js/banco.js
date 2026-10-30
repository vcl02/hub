'use strict';
// Banco: Supabase + cópia local, sincronização por diferença, formato do db e leitura do peso e dos treinos do tr.
// Cada mudança grava a cópia local na hora e, 0,8 s depois, envia ao Supabase só as linhas que mudaram
// (diferença para "base", a última versão confirmada pelo servidor). Sem internet, fica pendente e envia ao reconectar.
// Tabelas (todas com user_id e RLS "só o dono"): chave de cada linha entre colchetes.
const TABELAS = { al_item: ['id'], al_registro: ['id'], al_dia: ['data'] };
const ORDEM = Object.keys(TABELAS);
// Rede ruim (metrô): sem teto, um pedido que perde o sinal no meio pode ficar pendente por minutos, e o que espera por ele
// (o envio, a busca) fica preso até ele cair. Todo pedido ao Supabase, inclusive a leitura da resposta, tem limite; estourou,
// vira falha de rede comum ("Failed to fetch") e o pendente vai na próxima tentativa. A função (IA) tem mais tempo.
const TETO_REDE_MS = 15000, TETO_FUNCAO_MS = 40000;
async function fetchComTeto(url, op = {}) {
  const c = new AbortController(), ms = String(url).includes('/functions/v1/') ? TETO_FUNCAO_MS : TETO_REDE_MS, t = setTimeout(() => c.abort(), ms);
  if (op.signal?.aborted) c.abort(); else op.signal?.addEventListener('abort', () => c.abort());
  try {
    const r = await fetch(url, { ...op, signal: c.signal });
    const corpo = [101, 103, 204, 205, 304].includes(r.status) ? null : await r.arrayBuffer();
    return new Response(corpo, { status: r.status, statusText: r.statusText, headers: r.headers });
  } catch (e) {
    if (c.signal.aborted && !op.signal?.aborted) throw new TypeError(`Failed to fetch: sem resposta em ${ms / 1000} s`);
    throw e;
  } finally { clearTimeout(t); }
}
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: fetchComTeto } });
const K_LOCAL = id => 'al.db.' + id, K_BASE = id => 'al.base.' + id, K_TR = id => 'al.tr.' + id, K_BEBIDAS = id => 'al.bebidas.' + id, K_VOO = id => 'al.voo.' + id;
// bebidas = { dia: [{ hora, bebida, volume }] }: suco, refri e as outras lançadas na Água (agua_dia, só leitura); contam como comido
let bebidas = {};
let db = null, tr = { treinos: [] }, medidas = [], usuario = null, base = null, enviando = false, tEnvio = null, erroSync = '';

const macros = x => ({ kcal: x.kcal, prot: x.prot, carb: x.carb, gord: x.gord });
function linhas(d) {   // db → { tabela: { chave: linha } }
  const L = Object.fromEntries(ORDEM.map(t => [t, {}]));
  const por = (t, l) => { L[t][TABELAS[t].map(k => l[k]).join('|')] = l; };
  d.itens.forEach(i => por('al_item', { id: i.id, nome: i.nome, porcao: i.porcao, ...macros(i), usos: i.usos }));
  d.registros.forEach(r => por('al_registro', { id: r.id, data: r.data, hora: r.hora, item_id: r.item || null, nome: r.nome, porcao: r.porcao, qtd: r.qtd, ...macros(r) }));
  d.dias.forEach(x => por('al_dia', { data: x.data, caminhadas: x.caminhadas.map(t => ({ ...t })) }));   // cópia: editar o dia não mexe na base
  return L;
}
function deLinhas(R) {   // linhas do servidor → db (numeric chega como texto ou número)
  return preparar({
    itens: R.al_item,
    registros: R.al_registro.map(r => ({ ...r, item: r.item_id })),
    dias: R.al_dia
  });
}
// Base guardada no aparelho passa pela mesma limpeza do db antes de comparar: depois de uma mudança de formato, a base
// antiga não pode parecer "diferente" do db e fazer a cópia velha do aparelho subir por cima da nuvem (nem apagar nada lá).
const baseNormal = b => b && typeof b === 'object' ? linhas(deLinhas(Object.fromEntries(ORDEM.map(t => [t, Object.values(b[t] || {})])))) : null;
function diferenca(a, b) {   // o que enviar para o servidor sair de a e chegar em b; null = nada
  let n = 0; const up = {}, del = {};
  for (const t of ORDEM) {
    up[t] = Object.entries(b[t]).filter(([k, l]) => JSON.stringify(a?.[t]?.[k]) !== JSON.stringify(l)).map(([, l]) => l);
    del[t] = Object.entries(a?.[t] || {}).filter(([k]) => !(k in b[t])).map(([, l]) => l);
    n += up[t].length + del[t].length;
  }
  return n ? { up, del } : null;
}
// Envio sem resposta (o sinal caiu no meio, ex.: metrô): pode ter chegado à nuvem ou não. Antes de mandar a caminhada, o
// aparelho guarda como cada dia vai ficar lá ("em voo"); no envio seguinte, o dia que está na nuvem exatamente assim chegou, e a
// base dele passa a ser isso. Sem isso a mescla somaria de novo o trecho que já tinha subido. (Comida e comidas salvas vão por
// id: repetir não duplica.)
const lerVoo = () => { try { return JSON.parse(store.get(K_VOO(usuario.id)) || 'null') || {}; } catch (e) { return {}; } };
const temPendente = () => !!(db && usuario && (diferenca(base, linhas(db)) || Object.keys(lerVoo()).length));
// Caminhada (al_dia) é enviada MESCLANDO: lê o dia como está na nuvem agora e aplica só os trechos que este aparelho
// acrescentou ou tirou desde a base (multiconjunto); o que outro aparelho lançou nunca some por causa deste.
function mesclar(nuvem, base, local) {
  const k = x => JSON.stringify(x), conta = L => L.reduce((m, x) => m.set(k(x), (m.get(k(x)) || 0) + 1), new Map());
  const b = conta(base), l = conta(local), R = [...nuvem];
  for (const [c, n] of l) for (let i = b.get(c) || 0; i < n; i++) R.push(JSON.parse(c));
  for (const [c, n] of b) for (let i = l.get(c) || 0; i < n; i++) { const j = R.findIndex(x => k(x) === c); if (j >= 0) R.splice(j, 1); }
  return R;
}
const trechosDe = (L, data) => preparar({ itens: [], registros: [], dias: [{ data, caminhadas: L }] }).dias[0]?.caminhadas || [];
async function enviar() {
  clearTimeout(tEnvio);
  if (enviando || !usuario || !db) return;
  const agora = linhas(db), mud = diferenca(base, agora) || { up: Object.fromEntries(ORDEM.map(t => [t, []])), del: Object.fromEntries(ORDEM.map(t => [t, []])) }, voo = lerVoo();
  if (!ORDEM.some(t => mud.up[t].length || mud.del[t].length) && !Object.keys(voo).length) { erroSync = ''; pintarSync(); return; }
  enviando = true;
  try {
    const porId = ORDEM.filter(t => t !== 'al_dia');
    for (const t of porId) if (mud.up[t].length) {
      const { error } = await sb.from(t).upsert(mud.up[t].map(l => ({ user_id: usuario.id, ...l })), { onConflict: ['user_id', ...TABELAS[t]].join(',') });
      if (error) throw error;
    }
    for (const t of porId) for (const l of mud.del[t]) {
      let q = sb.from(t).delete(); for (const k of TABELAS[t]) q = q.eq(k, l[k]);
      const { error } = await q; if (error) throw error;
    }
    // Caminhada: dia a dia, mesclada com o que está na nuvem agora
    const dias = [...new Set([...mud.up.al_dia.map(l => l.data), ...mud.del.al_dia.map(l => l.data), ...Object.keys(voo)])], final = {};
    if (dias.length) {
      const { data: N, error } = await sb.from('al_dia').select('data,caminhadas').in('data', dias);
      if (error) throw error;
      const nuvem = Object.fromEntries((N || []).map(x => [x.data, trechosDe(x.caminhadas, x.data)]));
      const chegou = d => voo[d] && JSON.stringify(nuvem[d] || []) === JSON.stringify(voo[d]);
      for (const d of dias) final[d] = trechosDe(mesclar(nuvem[d] || [], chegou(d) ? voo[d] : base?.al_dia?.[d]?.caminhadas || [], agora.al_dia[d]?.caminhadas || []), d);
      store.set(K_VOO(usuario.id), JSON.stringify(final));
      const sobe = dias.filter(d => final[d].length), sai = dias.filter(d => !final[d].length && nuvem[d]);
      if (sobe.length) { const { error: e } = await sb.from('al_dia').upsert(sobe.map(d => ({ user_id: usuario.id, data: d, caminhadas: final[d] })), { onConflict: 'user_id,data' }); if (e) throw e; }
      for (const d of sai) { const { error: e } = await sb.from('al_dia').delete().eq('data', d); if (e) throw e; }
    }
    base = { ...agora, al_dia: { ...agora.al_dia } };
    if (dias.length) {
      // O aparelho fica com o resultado (mais o que mudou aqui enquanto enviava); a base, com o que a nuvem tem agora
      for (const d of dias) {
        if (final[d].length) base.al_dia[d] = { data: d, caminhadas: final[d] }; else delete base.al_dia[d];
        const atual = db.dias.find(x => x.data === d)?.caminhadas || [], aqui = trechosDe(mesclar(final[d], agora.al_dia[d]?.caminhadas || [], atual), d);
        db.dias = db.dias.filter(x => x.data !== d);
        if (aqui.length) db.dias.push({ data: d, caminhadas: aqui });
      }
      db = preparar(db);
      store.set(K_LOCAL(usuario.id), JSON.stringify(db));
      if (typeof desenhar === 'function' && !$('v-dia').hidden) desenhar();
    }
    store.set(K_BASE(usuario.id), JSON.stringify(base)); store.set(K_VOO(usuario.id), '{}'); erroSync = '';
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
// Treinos do Treino e pesagens do Corpo (só leitura): ficam no aparelho para a conta do gasto abrir sem internet.
async function baixarTreino() {
  const [treinos, M] = await Promise.all([todas('tr_treino', 'inicio,fim,cardio'), lerMedidas(sb, usuario.id)]);
  // cardio = esteira depois do treino, no Treino: { ms, vel, incl } (tempo feito, km/h e %)
  const cardio = c => c && c.ms > 0 && c.vel > 0 ? { ms: +c.ms, vel: +c.vel, incl: Math.max(0, +c.incl || 0) } : null;
  tr = { treinos: treinos.map(t => ({ inicio: Date.parse(t.inicio), fim: Date.parse(t.fim), ...(cardio(t.cardio) && { cardio: cardio(t.cardio) }) })).filter(t => t.fim >= t.inicio) };
  medidas = M;
  store.set(K_TR(usuario.id), JSON.stringify(tr));
  // Bebidas da Água (só leitura): se agua_dia falhar, fica a cópia do aparelho
  try {
    const A = await todas('agua_dia', 'data,aguas');
    bebidas = Object.fromEntries(A.map(x => [x.data, (Array.isArray(x.aguas) ? x.aguas : [])
      .filter(a => nutrientesBebida(a)).map(a => ({ hora: /^\d{2}:\d{2}$/.test(a.hora) ? a.hora : '', bebida: a.bebida, volume: +a.volume }))]).filter(([, L]) => L.length));
    store.set(K_BEBIDAS(usuario.id), JSON.stringify(bebidas));
  } catch (e) { /* fica a cópia */ }
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
// Saindo do app (ícone do hub, outra aba) antes dos 0,8 s: tenta enviar já. Se não der tempo, a página inicial lê a cópia do
// aparelho (comPendentesDoAl, ../habitos.js) e envia na próxima vez que o al abrir.
addEventListener('pagehide', () => { if (temPendente()) enviar(); });
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
  // Caminhada: trechos do dia em ordem de horário; dia sem trecho sai. Cópia local antiga (andou, minutos e km no total do
  // dia) vira 1 trecho sem horário, como a migration 02 fez no servidor.
  const trecho = t => {
    const minutos = num(t?.minutos), km = num(t?.km);
    return { hora: /^\d{2}:\d{2}$/.test(t?.hora) ? t.hora : '', ...(minutos > 0 && minutos <= 600 && { minutos }), ...(km > 0 && km <= 60 && { km }) };
  };
  const dias = (d?.dias || []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.data)).map(x => ({
    data: x.data,
    caminhadas: (Array.isArray(x.caminhadas) ? x.caminhadas : x.andou === true ? [x] : []).map(trecho).sort((a, b) => a.hora.localeCompare(b.hora)).slice(0, TRECHOS_MAX)
  })).filter(x => x.caminhadas.length);
  return { itens, registros, dias };
}
