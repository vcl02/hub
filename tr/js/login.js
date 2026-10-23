'use strict';
// Login (Supabase Auth) e migração do banco criptografado da versão antiga.
// ===== Login (Supabase Auth, e-mail e senha) =====
function telaLogin(erro = '') {
  db = null; usuario = null; base = null;
  clearInterval(T.intervalo); T.intervalo = null; T.fim = 0; manterTela(false); $('mini').hidden = true;   // sessão salva continua
  $('l-erro').textContent = erro; $('l-senha').value = '';
  ir('bloqueio');
}
async function entrou() {
  db = preparar(db);
  try { await navigator.storage?.persist?.(); } catch (e) {}
  restaurarSessao();
}
// Abre na hora com a cópia local; depois envia o que estava pendente e traz a versão da nuvem.
async function carregar(u) {
  if (u.id !== DONO) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {} telaLogin('Esta conta não tem acesso ao Treino.'); return; }
  usuario = u;
  let local = null;
  try { local = JSON.parse(store.get(K_LOCAL(u.id))); base = JSON.parse(store.get(K_BASE(u.id))); } catch (e) { local = null; }
  if (local) { db = local; await entrou(); }
  if (local && temPendente()) { await enviar(); if (erroSync) return; }   // sem internet: segue com a cópia local
  let R;
  try { R = await baixar(); } catch (e) { erroSync = e.message || String(e); pintarSync(); if (!local) telaLogin('Sem conexão com a nuvem. Tente de novo.'); return; }
  if (usuario !== u) return;   // saiu enquanto baixava
  const nuvem = deLinhas(R), vazio = !R.tr_exercicio.length;
  base = linhas(nuvem);
  let novo = vazio ? preparar(bancoNovo()) : nuvem;
  novo = await migrarAntigo(novo);
  const mudou = !db || JSON.stringify(linhas(db)) !== JSON.stringify(linhas(novo));
  db = novo; gravar();
  if (!local) await entrou();
  else if (mudou && TELAS_SEGURAS.includes(pilha[pilha.length - 1])) mostrar(pilha[pilha.length - 1]);
}
// Enquanto entra (login + 1ª carga dos dados): campos travados e "Entrando…". A senha só é limpa depois de entrar.
const travarLogin = sim => { $('l-campos').disabled = sim; $('l-carregando').hidden = !sim; };
$('l-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  if ($('l-campos').disabled) return;
  const erro = $('l-erro'), email = emailDoLogin($('l-email').value);
  erro.textContent = '';
  // Usuário desconhecido recebe a mesma mensagem de senha errada: não revela quais existem.
  if (!email) { erro.textContent = 'Usuário ou senha inválidos.'; return; }
  travarLogin(true);
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: $('l-senha').value });
    if (error) { erro.textContent = /invalid/i.test(error.message) ? 'Usuário ou senha inválidos.' : 'Não foi possível entrar: ' + error.message; return; }
    await carregar(data.user);
    if (db) $('l-senha').value = '';
  } catch (e) { erro.textContent = 'Sem conexão. Tente de novo.'; }
  finally { travarLogin(false); }
});

// ===== Migração do banco criptografado da versão antiga (fica só neste aparelho) =====
const deB64 = s => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
async function abrirAntigo(chave) {
  const c = JSON.parse(store.get(K_ANTIGO));
  return preparar(JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(c.iv) }, chave, deB64(c.ct)))));
}
// Junta os dados antigos do aparelho com os da nuvem; no mesmo dia (treino), variação+dia (registro) ou dia (pesagem), vale o do aparelho.
function juntar(nuvem, local) {
  const dia = t => iso(new Date(t.inicio)), dias = new Set(local.treinos.map(dia));
  return preparar({
    exercicios: local.exercicios,
    registros: [...nuvem.registros.filter(r => !local.registros.some(x => x.variacao === r.variacao && x.data === r.data)), ...local.registros],
    treinos: [...nuvem.treinos.filter(t => !dias.has(dia(t))), ...local.treinos].sort((a, b) => a.inicio - b.inicio),
    medidas: [...nuvem.medidas.filter(m => !local.medidas.some(x => x.data === m.data)), ...local.medidas]
  });
}
// Com "manter desbloqueado" a chave está salva e a migração é automática. Sem a chave não há como abrir: a senha agora é só a do Supabase.
async function migrarAntigo(atual) {
  const k = store.get(K_ANTIGO_CHAVE);
  if (!store.get(K_ANTIGO) || !window.crypto?.subtle) return atual;
  if (!k) return atual;
  try {
    const velho = await abrirAntigo(await crypto.subtle.importKey('raw', deB64(k), { name: 'AES-GCM' }, false, ['decrypt']));
    store.del(K_ANTIGO); store.del(K_ANTIGO_CHAVE);
    setTimeout(() => toast('Dados da versão antiga enviados para a sua conta'), 300);
    return juntar(atual, velho);
  } catch (e) { return atual; }
}
