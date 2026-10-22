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
  if (u.id !== DONO) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {} telaLogin('Esta conta não tem acesso ao Diário de Carga.'); return; }
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
$('l-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const erro = $('l-erro'), email = emailDoLogin($('l-email').value);
  erro.textContent = '';
  // Usuário desconhecido recebe a mesma mensagem de senha errada: não revela quais existem.
  if (!email) { erro.textContent = 'Usuário ou senha inválidos.'; return; }
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: $('l-senha').value });
    if (error) { erro.textContent = /invalid/i.test(error.message) ? 'Usuário ou senha inválidos.' : 'Não foi possível entrar: ' + error.message; return; }
    $('l-senha').value = '';
    await carregar(data.user);
  } catch (e) { erro.textContent = 'Sem conexão. Tente de novo.'; }
});

// ===== Migração do banco criptografado da versão antiga (fica só neste aparelho) =====
const deB64 = s => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
async function abrirAntigo(chave) {
  const c = JSON.parse(store.get(K_ANTIGO));
  return preparar(JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(c.iv) }, chave, deB64(c.ct)))));
}
async function chaveDaSenha(senha) {
  const c = JSON.parse(store.get(K_ANTIGO)), base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: deB64(c.salt), iterations: c.it || 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
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
// Com "manter desbloqueado" a chave está salva e a migração é automática; sem ela, pede a senha antiga em Ajustes.
async function migrarAntigo(atual) {
  const k = store.get(K_ANTIGO_CHAVE);
  if (!store.get(K_ANTIGO) || !window.crypto?.subtle) return atual;
  if (!k) { setTimeout(() => toast('Há dados da versão antiga neste aparelho: Ajustes'), 300); return atual; }
  try {
    const velho = await abrirAntigo(await crypto.subtle.importKey('raw', deB64(k), { name: 'AES-GCM' }, false, ['decrypt']));
    store.del(K_ANTIGO); store.del(K_ANTIGO_CHAVE);
    setTimeout(() => toast('Dados da versão antiga enviados para a sua conta'), 300);
    return juntar(atual, velho);
  } catch (e) { return atual; }
}
$('m-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const erro = $('m-erro'); erro.textContent = '';
  let velho; try { velho = await abrirAntigo(await chaveDaSenha($('m-senha').value)); } catch (e) { erro.textContent = 'Senha incorreta.'; return; }
  db = juntar(db, velho); gravar();
  store.del(K_ANTIGO); store.del(K_ANTIGO_CHAVE);
  $('m-senha').value = ''; toast('Dados antigos juntados à sua conta'); ir('inicio');
});
