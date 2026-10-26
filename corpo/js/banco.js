'use strict';
// Banco: Supabase + cópia local, sincronização por diferença (corpo_medida e corpo_dia) e a cópia que os outros apps leem.
// Cada mudança grava a cópia local na hora e, 0,8 s depois, envia ao Supabase só as linhas que mudaram
// (diferença para "base", a última versão confirmada pelo servidor). Sem internet, fica pendente e envia ao reconectar.
// Também atualiza corpo.medidas.<conta> (guardarMedidas, de ../corpo/perfil.js): Treino e Alimentação veem na hora.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const K_LOCAL = id => 'corpo.db.' + id, K_BASE = id => 'corpo.base.' + id;
let db = null, usuario = null, base = null, enviando = false, tEnvio = null, erroSync = '';
// corpo_dia ainda não criada no banco (migration 01 não aplicada): o app segue só com as pesagens e esconde "Evacuou"
let semCorpoDia = false;

// Tabelas e a chave de cada linha (além de user_id): corpo_medida (pesagem e barriga) e corpo_dia (evacuou sim ou não)
const TABELAS = { corpo_medida: 'data', corpo_dia: 'data' };
function linhas(d) {   // db → { tabela: { data: linha } }
  return {
    corpo_medida: Object.fromEntries(d.medidas.map(m => [m.data, { data: m.data, hora: m.hora || '', peso: m.peso ?? null, cintura: m.cintura ?? null }])),
    corpo_dia: Object.fromEntries(d.dias.map(x => [x.data, { data: x.data, evacuou: x.evacuou }]))
  };
}
// base das versões antigas (só pesagens, { data: linha }) → formato com as duas tabelas
const baseCompat = b => !b ? null : b.corpo_medida ? b : { corpo_medida: b, corpo_dia: {} };
function diferenca(a, b) {   // o que enviar para sair de a e chegar em b; null = nada
  let n = 0; const up = {}, del = {};
  for (const t in TABELAS) {
    up[t] = Object.entries(b[t]).filter(([k, l]) => JSON.stringify(a?.[t]?.[k]) !== JSON.stringify(l)).map(([, l]) => l);
    del[t] = Object.keys(a?.[t] || {}).filter(k => !(k in b[t]));
    n += up[t].length + del[t].length;
  }
  return n ? { up, del } : null;
}
const temPendente = () => { const d = db && usuario && diferenca(base, linhas(db)); return !!d && (!semCorpoDia || Object.keys(TABELAS).some(t => t !== 'corpo_dia' && (d.up[t].length || d.del[t].length))); };
async function enviar() {
  clearTimeout(tEnvio);
  if (enviando || !usuario || !db) return;
  const agora = linhas(db), mud = diferenca(base, agora);
  if (!mud) { erroSync = ''; pintarSync(); return; }
  enviando = true;
  try {
    for (const t in TABELAS) {
      if (t === 'corpo_dia' && semCorpoDia) continue;
      if (mud.up[t].length) {
        const { error } = await sb.from(t).upsert(mud.up[t].map(l => ({ user_id: usuario.id, ...l })), { onConflict: 'user_id,' + TABELAS[t] });
        if (error) throw error;
      }
      for (const k of mud.del[t]) { const { error } = await sb.from(t).delete().eq(TABELAS[t], k); if (error) throw error; }
    }
    base = semCorpoDia ? { ...agora, corpo_dia: base?.corpo_dia || {} } : agora;
    store.set(K_BASE(usuario.id), JSON.stringify(base)); erroSync = '';
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
const preparar = d => ({
  medidas: ordenarMedidas(d?.medidas || []),
  dias: (d?.dias || []).filter(x => x && dataOk(x.data) && typeof x.evacuou === 'boolean').map(x => ({ data: x.data, evacuou: x.evacuou })).sort((a, b) => a.data.localeCompare(b.data))
});
// Baixa uma tabela inteira (de 1000 em 1000)
async function todas(tabela, colunas) {
  const R = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(tabela).select(colunas).range(i, i + 999); if (error) throw error;
    R.push(...data); if (data.length < 1000) return R;
  }
}
