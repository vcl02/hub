'use strict';
// Banco: Supabase + cópia local e sincronização por diferença (agua_dia, 1 linha por dia).
// Cada mudança grava a cópia local na hora e, 0,8 s depois, envia ao Supabase só os dias que mudaram
// (diferença para "base", a última versão confirmada pelo servidor). Sem internet, fica pendente e envia ao reconectar.
// O envio MESCLA, não sobrescreve: lê o dia como está na nuvem agora e aplica só o que este aparelho acrescentou ou tirou
// desde a base. O que outro aparelho lançou nunca some por causa de uma cópia velha ou atrasada deste.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const K_LOCAL = id => 'agua.db.' + id, K_BASE = id => 'agua.base.' + id;
let db = null, usuario = null, base = null, enviando = false, tEnvio = null, erroSync = '';

function linhas(d) {   // db → { data: linha }; listas copiadas: a base não pode mudar junto quando o dia muda
  return Object.fromEntries(d.dias.map(x => [x.data, { data: x.data, aguas: x.aguas.map(a => ({ ...a })) }]));
}
// Base guardada no aparelho passa pela mesma limpeza do db antes de comparar: depois de uma mudança de formato (ex.: xixis
// que saíram), a base antiga não pode parecer "diferente" do db e fazer a cópia velha do aparelho subir por cima da nuvem
// (nem apagar na nuvem um dia que só a limpeza tirou do db).
const baseNormal = b => b && typeof b === 'object' ? linhas(preparar({ dias: Object.values(b) })) : null;
function diferenca(a, b) {   // o que enviar para sair de a e chegar em b; null = nada
  const up = Object.entries(b).filter(([k, l]) => JSON.stringify(a?.[k]) !== JSON.stringify(l)).map(([, l]) => l);
  const del = Object.keys(a || {}).filter(k => !(k in b));
  return up.length || del.length ? { up, del } : null;
}
const temPendente = () => !!(db && usuario && diferenca(base, linhas(db)));
// Lista mesclada (multiconjunto: dois copos iguais no mesmo minuto são dois): a da nuvem, mais o que está no aparelho e não
// estava na base (acrescentado aqui), menos o que estava na base e saiu do aparelho (tirado aqui).
function mesclar(nuvem, base, local) {
  const k = x => JSON.stringify(x), conta = L => L.reduce((m, x) => m.set(k(x), (m.get(k(x)) || 0) + 1), new Map());
  const b = conta(base), l = conta(local), R = [...nuvem];
  for (const [c, n] of l) for (let i = b.get(c) || 0; i < n; i++) R.push(JSON.parse(c));
  for (const [c, n] of b) for (let i = l.get(c) || 0; i < n; i++) { const j = R.findIndex(x => k(x) === c); if (j >= 0) R.splice(j, 1); }
  return R;
}
const aguasDe = (L, data) => preparar({ dias: [{ data, aguas: L }] }).dias[0]?.aguas || [];
async function enviar() {
  clearTimeout(tEnvio);
  if (enviando || !usuario || !db) return;
  const agora = linhas(db), mud = diferenca(base, agora);
  if (!mud) { erroSync = ''; pintarSync(); return; }
  enviando = true;
  try {
    // Os dias que mudaram aqui, como estão na nuvem agora (com a mesma limpeza), e o resultado da mescla de cada um
    const dias = [...mud.up.map(l => l.data), ...mud.del];
    const { data: N, error } = await sb.from('agua_dia').select('data,aguas').in('data', dias);
    if (error) throw error;
    const nuvem = Object.fromEntries((N || []).map(x => [x.data, aguasDe(x.aguas, x.data)]));
    const final = Object.fromEntries(dias.map(d => [d, aguasDe(mesclar(nuvem[d] || [], base?.[d]?.aguas || [], agora[d]?.aguas || []), d)]));
    const sobe = dias.filter(d => final[d].length), sai = dias.filter(d => !final[d].length && nuvem[d]);
    if (sobe.length) {
      const { error: e } = await sb.from('agua_dia').upsert(sobe.map(d => ({ user_id: usuario.id, data: d, aguas: final[d] })), { onConflict: 'user_id,data' });
      if (e) throw e;
    }
    for (const data of sai) { const { error: e } = await sb.from('agua_dia').delete().eq('data', data); if (e) throw e; }
    // O aparelho fica com o resultado (mais o que mudou aqui enquanto enviava); a base, com o que a nuvem tem agora
    for (const d of dias) {
      const atual = db.dias.find(x => x.data === d)?.aguas || [], aqui = aguasDe(mesclar(final[d], agora[d]?.aguas || [], atual), d);
      db.dias = db.dias.filter(x => x.data !== d);
      if (aqui.length) db.dias.push({ data: d, aguas: aqui });
    }
    db = preparar(db);
    base = { ...agora, ...Object.fromEntries(dias.map(d => [d, { data: d, aguas: final[d] }])) };
    for (const d of dias) if (!final[d].length) delete base[d];
    store.set(K_BASE(usuario.id), JSON.stringify(base)); store.set(K_LOCAL(usuario.id), JSON.stringify(db)); erroSync = '';
    if (typeof desenhar === 'function' && !$('v-agua').hidden) desenhar();
  } catch (e) { erroSync = e.message || String(e); }
  finally { enviando = false; }
  pintarSync();
  if (!erroSync && temPendente()) enviar();   // mudou algo enquanto enviava
}
async function baixar() {
  const R = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from('agua_dia').select('data,aguas').range(i, i + 999); if (error) throw error;
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
    aguas: (Array.isArray(x.aguas) ? x.aguas : []).map(a => {
      // Suco ou refri: o volume bebido e a água dele (ml); bebida desconhecida ou sem volume vale como água pura
      const vol = Math.round(num(a?.volume)), outra = a?.bebida !== 'agua' && BEBIDAS[a?.bebida] && vol > 0 && vol <= ML_MAX;
      return outra ? { hora: a.hora, ml: Math.round(vol * BEBIDAS[a.bebida].agua), bebida: a.bebida, volume: vol } : { hora: a?.hora, ml: Math.round(num(a?.ml)) };
    }).filter(a => hhmmOk(a.hora) && a.ml > 0 && a.ml <= ML_MAX)
      .sort((a, b) => a.hora.localeCompare(b.hora)).slice(0, 100)
  })).filter(x => x.aguas.length).sort((a, b) => a.data.localeCompare(b.data))
});
