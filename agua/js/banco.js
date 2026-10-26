'use strict';
// Banco: Supabase + cópia local e sincronização por diferença (agua_dia, 1 linha por dia).
// Cada mudança grava a cópia local na hora e, 0,8 s depois, envia ao Supabase só os dias que mudaram
// (diferença para "base", a última versão confirmada pelo servidor). Sem internet, fica pendente e envia ao reconectar.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const K_LOCAL = id => 'agua.db.' + id, K_BASE = id => 'agua.base.' + id;
let db = null, usuario = null, base = null, enviando = false, tEnvio = null, erroSync = '';

function linhas(d) {   // db → { data: linha }; listas copiadas: a base não pode mudar junto quando o dia muda
  return Object.fromEntries(d.dias.map(x => [x.data, { data: x.data, aguas: x.aguas.map(a => ({ hora: a.hora, ml: a.ml })), xixis: [...x.xixis] }]));
}
function diferenca(a, b) {   // o que enviar para sair de a e chegar em b; null = nada
  const up = Object.entries(b).filter(([k, l]) => JSON.stringify(a?.[k]) !== JSON.stringify(l)).map(([, l]) => l);
  const del = Object.keys(a || {}).filter(k => !(k in b));
  return up.length || del.length ? { up, del } : null;
}
const temPendente = () => !!(db && usuario && diferenca(base, linhas(db)));
async function enviar() {
  clearTimeout(tEnvio);
  if (enviando || !usuario || !db) return;
  const agora = linhas(db), mud = diferenca(base, agora);
  if (!mud) { erroSync = ''; pintarSync(); return; }
  enviando = true;
  try {
    if (mud.up.length) {
      const { error } = await sb.from('agua_dia').upsert(mud.up.map(l => ({ user_id: usuario.id, ...l })), { onConflict: 'user_id,data' });
      if (error) throw error;
    }
    for (const data of mud.del) { const { error } = await sb.from('agua_dia').delete().eq('data', data); if (error) throw error; }
    base = agora; store.set(K_BASE(usuario.id), JSON.stringify(base)); erroSync = '';
  } catch (e) { erroSync = e.message || String(e); }
  finally { enviando = false; }
  pintarSync();
  if (!erroSync && temPendente()) enviar();   // mudou algo enquanto enviava
}
async function baixar() {
  const R = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from('agua_dia').select('data,aguas,xixis').range(i, i + 999); if (error) throw error;
    R.push(...data); if (data.length < 1000) return R;
  }
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

// Valida e completa o db (cópia local ou linhas do servidor): horários "HH:MM" em ordem, ml de 1 a 3000; dia vazio sai
const hhmmOk = h => /^\d{2}:\d{2}$/.test(h);
const preparar = d => ({
  dias: (d?.dias || []).filter(x => x && dataOk(x.data)).map(x => ({
    data: x.data,
    aguas: (Array.isArray(x.aguas) ? x.aguas : []).map(a => ({ hora: a?.hora, ml: Math.round(num(a?.ml)) })).filter(a => hhmmOk(a.hora) && a.ml > 0 && a.ml <= ML_MAX)
      .sort((a, b) => a.hora.localeCompare(b.hora)).slice(0, 100),
    xixis: (Array.isArray(x.xixis) ? x.xixis : []).filter(hhmmOk).sort().slice(0, 50)
  })).filter(x => x.aguas.length || x.xixis.length).sort((a, b) => a.data.localeCompare(b.data))
});
