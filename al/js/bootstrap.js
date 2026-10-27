'use strict';
// Inicialização: sessão do Supabase, cópia local, dados da nuvem e do Treino, login (fora do hub) e service worker.
function telaLogin(erro = '') {
  db = null; usuario = null; base = null;
  $('v-dia').hidden = true; $('v-login').hidden = false;
  $('l-erro').textContent = erro; $('l-senha').value = '';
}
function abrirDia() { $('v-login').hidden = true; $('v-dia').hidden = false; desenhar(); }

// Abre na hora com a cópia local; depois envia o que estava pendente e traz a nuvem e o Treino.
async function carregar(u) {
  if (u.id !== DONO) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {} telaLogin('Esta conta não tem acesso.'); return; }
  usuario = u;
  let local = null;
  try { local = JSON.parse(store.get(K_LOCAL(u.id))); base = baseNormal(JSON.parse(store.get(K_BASE(u.id)))); tr = JSON.parse(store.get(K_TR(u.id))) || tr; } catch (e) { local = null; }
  try { bebidas = JSON.parse(store.get(K_BEBIDAS(u.id))) || {}; } catch (e) { bebidas = {}; }
  medidas = medidasGuardadas(u.id);
  if (local) { db = preparar(local); abrirDia(); }
  if (local && temPendente()) await enviar();
  try {
    const [R] = await Promise.all([baixar(), baixarTreino()]);
    if (usuario !== u) return;
    const nuvem = deLinhas(R);
    // Pendente que não subiu (sem internet) continua valendo: a nuvem só entra quando não há nada a enviar.
    if (!local || !temPendente()) { base = linhas(nuvem); db = nuvem; store.set(K_BASE(u.id), JSON.stringify(base)); store.set(K_LOCAL(u.id), JSON.stringify(db)); }
  } catch (e) {
    erroSync = e.message || String(e);
    if (!local) { telaLogin('Sem conexão com a nuvem. Tente de novo.'); return; }
  }
  if (unirRepetidas()) gravar();   // comidas salvas repetidas (mesmo nome e mesma medida): ficam uma só
  abrirDia(); pintarSync();
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

// Virou o dia com o app aberto: "Hoje" passa a ser o dia novo.
let ultimoHoje = hoje();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !db) return;
  if (ultimoHoje !== hoje()) { if (diaVisto === ultimoHoje) diaVisto = hoje(); ultimoHoje = hoje(); desenhar(); }
});

// Dentro do hub (…/al/), o login é o da página inicial: sem sessão vai pra lá e, depois de entrar,
// o hub devolve pra cá. Servido fora do hub (testes), usa o login próprio.
function irParaLoginDoHub() {
  if (!/\/al\/(index\.html)?$/.test(location.pathname)) return false;
  location.replace('../?volta=' + encodeURIComponent('al/' + location.search + location.hash));
  return true;
}

(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  const { data } = await sb.auth.getSession();   // sessão salva no aparelho (a do hub): entra direto, mesmo sem internet
  if (data.session) carregar(data.session.user); else if (!irParaLoginDoHub()) telaLogin();
})();
