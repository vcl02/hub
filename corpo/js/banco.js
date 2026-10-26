'use strict';
// Banco: Supabase + cópia local, sincronização por diferença (corpo_medida) e a cópia que os outros apps leem.
// Cada mudança grava a cópia local na hora e, 0,8 s depois, envia ao Supabase só as linhas que mudaram
// (diferença para "base", a última versão confirmada pelo servidor). Sem internet, fica pendente e envia ao reconectar.
// Também atualiza corpo.medidas.<conta> (guardarMedidas, de ../corpo/perfil.js): Treino e Alimentação veem na hora.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const K_LOCAL = id => 'corpo.db.' + id, K_BASE = id => 'corpo.base.' + id;
let db = null, usuario = null, base = null, enviando = false, tEnvio = null, erroSync = '';

function linhas(d) {   // db → { data: linha }
  return Object.fromEntries(d.medidas.map(m => [m.data, { data: m.data, hora: m.hora || '', peso: m.peso ?? null, cintura: m.cintura ?? null }]));
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
      const { error } = await sb.from('corpo_medida').upsert(mud.up.map(l => ({ user_id: usuario.id, ...l })), { onConflict: 'user_id,data' });
      if (error) throw error;
    }
    for (const data of mud.del) { const { error } = await sb.from('corpo_medida').delete().eq('data', data); if (error) throw error; }
    base = agora; store.set(K_BASE(usuario.id), JSON.stringify(base)); erroSync = '';
  } catch (e) { erroSync = e.message || String(e); }
  finally { enviando = false; }
  pintarSync();
  if (!erroSync && temPendente()) enviar();   // mudou algo enquanto enviava
}
function gravar() {
  if (!usuario || !db) return;
  if (!store.set(K_LOCAL(usuario.id), JSON.stringify(db))) toast('Não consegui gravar no aparelho.', true);
  guardarMedidas(usuario.id, db.medidas);
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

// Valida e completa o db (cópia local ou linhas do servidor), com a mesma limpeza que os outros apps usam
const preparar = d => ({ medidas: ordenarMedidas(d?.medidas || []) });
