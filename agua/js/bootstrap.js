'use strict';
// Inicialização: sessão do Supabase, cópia local, dados da nuvem, login (fora do hub) e service worker.
function telaLogin(erro = '') {
  db = null; usuario = null; base = null;
  $('v-agua').hidden = true; $('v-login').hidden = false;
  $('l-erro').textContent = erro; $('l-senha').value = '';
}
function abrirAgua() { $('v-login').hidden = true; $('v-agua').hidden = false; desenhar(); }

// Abre na hora com a cópia local; depois envia o que estava pendente e traz a nuvem.
async function carregar(u) {
  if (u.id !== DONO) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {} telaLogin('Esta conta não tem acesso.'); return; }
  usuario = u;
  let local = null;
  try { local = JSON.parse(store.get(K_LOCAL(u.id))); base = JSON.parse(store.get(K_BASE(u.id))); } catch (e) { local = null; }
  if (local) { db = preparar(local); abrirAgua(); }
  if (local && temPendente()) await enviar();
  try {
    const R = await baixar();
    if (usuario !== u) return;
    // Pendente que não subiu (sem internet) continua valendo: a nuvem só entra quando não há nada a enviar.
    if (!local || !temPendente()) {
      db = preparar({ dias: R }); base = linhas(db);
      store.set(K_BASE(u.id), JSON.stringify(base)); store.set(K_LOCAL(u.id), JSON.stringify(db));
    }
  } catch (e) {
    erroSync = e.message || String(e);
    if (!local) { db = preparar({}); }   // sem a cópia e sem a nuvem (ou a tabela ainda não criada): abre vazio, envia depois
  }
  abrirAgua(); pintarSync();
}

$('l-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  if ($('l-campos').disabled) return;
  const email = emailDoLogin($('l-usuario').value);
  $('l-erro').textContent = '';
  if (!email) { $('l-erro').textContent = 'Usuário ou senha inválidos.'; return; }
  $('l-campos').disabled = true;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: $('l-senha').value });
    if (error) { $('l-erro').textContent = /invalid/i.test(error.message) ? 'Usuário ou senha inválidos.' : 'Não foi possível entrar: ' + error.message; return; }
    await carregar(data.user);
  } catch (e) { $('l-erro').textContent = 'Sem conexão. Tente de novo.'; }
  finally { $('l-campos').disabled = false; }
});

// Dentro do hub (…/agua/), o login é o da página inicial: sem sessão vai pra lá e, depois de entrar,
// o hub devolve pra cá. Servido fora do hub (testes), usa o login próprio.
function irParaLoginDoHub() {
  if (!/\/agua\/(index\.html)?$/.test(location.pathname)) return false;
  location.replace('../?volta=' + encodeURIComponent('agua/' + location.search + location.hash));
  return true;
}

(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  const { data } = await sb.auth.getSession();   // sessão salva no aparelho (a do hub): entra direto, mesmo sem internet
  if (data.session) carregar(data.session.user); else if (!irParaLoginDoHub()) telaLogin();
})();
