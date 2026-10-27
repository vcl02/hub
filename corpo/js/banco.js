'use strict';
// Banco: Supabase + cópia local, sincronização por diferença (corpo_medida e corpo_dia) e a cópia que os outros apps leem.
// Cada mudança grava a cópia local na hora e, 0,8 s depois, envia ao Supabase só as linhas que mudaram
// (diferença para "base", a última versão confirmada pelo servidor). Sem internet, fica pendente e envia ao reconectar.
// corpo_dia é enviado MESCLANDO: lê o dia como está na nuvem agora e aplica só o que este aparelho acrescentou ou tirou nas
// evacuações e nos xixis (e o sono, se mudou aqui) desde a base; o que outro aparelho lançou nunca some por causa deste.
// Também atualiza corpo.medidas.<conta> (guardarMedidas, de ../corpo/perfil.js): Treino e Alimentação veem na hora.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const K_LOCAL = id => 'corpo.db.' + id, K_BASE = id => 'corpo.base.' + id, K_AGUAS = id => 'corpo.aguas.' + id;
// aguas = { dia: ml } da Água (agua_dia, só leitura), para a bexiga
let aguas = {};
let db = null, usuario = null, base = null, enviando = false, tEnvio = null, erroSync = '';
// corpo_dia ainda não criada no banco (migration 01 não aplicada): o app segue só com as pesagens e esconde "Evacuou"
let semCorpoDia = false;

// Tabelas e a chave de cada linha (além de user_id): corpo_medida (pesagem e barriga) e corpo_dia (evacuações e xixis com horário e sono)
const TABELAS = { corpo_medida: 'data', corpo_dia: 'data' };
function linhas(d) {   // db → { tabela: { data: linha } }
  return {
    // peso_em e sono_em (quando foram lançados, migration 03) só vão quando existem: linha antiga continua igual à da nuvem
    corpo_medida: Object.fromEntries(d.medidas.map(m => [m.data, { data: m.data, hora: m.hora || '', peso: m.peso ?? null, cintura: m.cintura ?? null, ...(m.pesoEm && { peso_em: m.pesoEm }) }])),
    // evacuacoes e xixis copiadas: a base não pode mudar junto quando o +1 mexe na lista do dia
    corpo_dia: Object.fromEntries(d.dias.map(x => [x.data, { data: x.data, evacuou: null, evacuacoes: [...x.evacuacoes], xixis: [...x.xixis], sono: x.sono ?? null, ...(x.sonoEm && { sono_em: x.sonoEm }) }]))
  };
}
// base das versões antigas (só pesagens, { data: linha }) → formato com as duas tabelas
const baseCompat = b => !b ? null : b.corpo_medida ? b : { corpo_medida: b, corpo_dia: {} };
// Base guardada no aparelho passa pela mesma limpeza do db antes de comparar: depois de uma mudança de formato (ex.: xixis
// que entraram), a base antiga não pode parecer "diferente" do db e fazer a cópia velha do aparelho subir por cima da nuvem.
function baseNormal(b) {
  b = baseCompat(b);
  return b ? linhas(preparar({ medidas: Object.values(b.corpo_medida || {}), dias: Object.values(b.corpo_dia || {}) })) : null;
}
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
// Lista mesclada (multiconjunto): a da nuvem, mais o que entrou aqui desde a base, menos o que saiu daqui
function mesclar(nuvem, base, local) {
  const conta = L => L.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const b = conta(base), l = conta(local), R = [...nuvem];
  for (const [c, n] of l) for (let i = b.get(c) || 0; i < n; i++) R.push(c);
  for (const [c, n] of b) for (let i = l.get(c) || 0; i < n; i++) { const j = R.indexOf(c); if (j >= 0) R.splice(j, 1); }
  return R;
}
// Linha de corpo_dia (formato de linhas) do dia d depois da mescla: nuvem N, base B e aparelho L (qualquer um pode faltar)
function diaMesclado(d, N, B, L) {
  const v = (x, k) => x?.[k] || [], mudouSono = (L?.sono ?? null) !== (B?.sono ?? null), S = mudouSono ? L : N;
  const dia = preparar({ dias: [{ data: d, evacuacoes: mesclar(v(N, 'evacuacoes'), v(B, 'evacuacoes'), v(L, 'evacuacoes')),
    xixis: mesclar(v(N, 'xixis'), v(B, 'xixis'), v(L, 'xixis')), sono: S?.sono ?? null, sono_em: S?.sono_em }] }).dias[0];
  return dia ? linhas({ medidas: [], dias: [dia] }).corpo_dia[d] : null;
}
async function enviar() {
  clearTimeout(tEnvio);
  if (enviando || !usuario || !db) return;
  const agora = linhas(db), mud = diferenca(base, agora);
  if (!mud) { erroSync = ''; pintarSync(); return; }
  enviando = true;
  try {
    // corpo_dia: dia a dia, mesclado com o que está na nuvem agora
    const diasMudados = semCorpoDia ? [] : [...mud.up.corpo_dia.map(l => l.data), ...mud.del.corpo_dia];
    const finais = {};
    if (diasMudados.length) {
      const { data: N, error } = await sb.from('corpo_dia').select('*').in('data', diasMudados);
      if (error) throw error;
      const nuvem = linhas({ medidas: [], dias: preparar({ dias: N || [] }).dias }).corpo_dia;
      for (const d of diasMudados) finais[d] = diaMesclado(d, nuvem[d], base?.corpo_dia?.[d], agora.corpo_dia[d]);
      const sobe = diasMudados.filter(d => finais[d]), sai = diasMudados.filter(d => !finais[d] && nuvem[d]);
      if (sobe.length) { const { error: e } = await sb.from('corpo_dia').upsert(sobe.map(d => ({ user_id: usuario.id, ...finais[d] })), { onConflict: 'user_id,data' }); if (e) throw e; }
      for (const d of sai) { const { error: e } = await sb.from('corpo_dia').delete().eq('data', d); if (e) throw e; }
    }
    for (const t in TABELAS) {
      if (t === 'corpo_dia') continue;
      if (mud.up[t].length) {
        const { error } = await sb.from(t).upsert(mud.up[t].map(l => ({ user_id: usuario.id, ...l })), { onConflict: 'user_id,' + TABELAS[t] });
        if (error) throw error;
      }
      for (const k of mud.del[t]) { const { error } = await sb.from(t).delete().eq(TABELAS[t], k); if (error) throw error; }
    }
    base = semCorpoDia ? { ...agora, corpo_dia: base?.corpo_dia || {} } : agora;
    if (diasMudados.length) {
      // O aparelho fica com o resultado da mescla (mais o que mudou aqui enquanto enviava); a base, com o que a nuvem tem agora
      const atual = linhas(db).corpo_dia;
      base = { ...base, corpo_dia: { ...base.corpo_dia } };
      for (const d of diasMudados) {
        if (finais[d]) base.corpo_dia[d] = finais[d]; else delete base.corpo_dia[d];
        const aqui = diaMesclado(d, finais[d], agora.corpo_dia[d], atual[d]);
        db.dias = db.dias.filter(x => x.data !== d);
        if (aqui) db.dias.push({ data: d, evacuacoes: aqui.evacuacoes, xixis: aqui.xixis, ...(aqui.sono != null && { sono: aqui.sono }), ...(aqui.sono_em && { sonoEm: aqui.sono_em }) });
      }
      db = preparar(db);
      store.set(K_LOCAL(usuario.id), JSON.stringify(db));
      if (typeof desenhar === 'function' && !$('v-corpo').hidden) desenhar();
    }
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
  // Dia: evacuações (horários "HH:MM", "" = sem horário, em ordem), xixis ("HH:MM", em ordem), sono (h) e quando o sono foi
  // lançado (sonoEm). Formato da migration 01 (evacuou sim ou não): sim vira 1 evacuação sem horário. Dia sem nada não fica guardado.
  dias: (d?.dias || []).filter(x => x && dataOk(x.data)).map(x => {
    const ev = Array.isArray(x.evacuacoes) ? x.evacuacoes.map(h => /^\d{2}:\d{2}$/.test(h) ? h : '').slice(0, 20) : x.evacuou === true ? [''] : [];
    const sono = num(x.sono), sonoEm = x.sonoEm || x.sono_em;
    const xixis = (Array.isArray(x.xixis) ? x.xixis : []).filter(h => /^\d{2}:\d{2}$/.test(h)).sort().slice(0, 50);
    return { data: x.data, evacuacoes: ev.sort(), xixis, ...(sono >= 0 && sono <= 24 && { sono }),
      ...(sono >= 0 && sono <= 24 && sonoEm && !isNaN(Date.parse(sonoEm)) && { sonoEm: new Date(sonoEm).toISOString() }) };
  }).filter(x => x.evacuacoes.length || x.xixis.length || x.sono != null).sort((a, b) => a.data.localeCompare(b.data))
});
// Baixa uma tabela inteira (de 1000 em 1000)
async function todas(tabela, colunas) {
  const R = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(tabela).select(colunas).range(i, i + 999); if (error) throw error;
    R.push(...data); if (data.length < 1000) return R;
  }
}
