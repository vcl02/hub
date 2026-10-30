'use strict';
// Inicialização: sessão do Supabase, cópia local, dados da nuvem, login (fora do hub) e service worker.
function telaLogin(erro = '') {
  db = null; usuario = null; base = null;
  $('v-corpo').hidden = true; $('v-login').hidden = false;
  $('l-erro').textContent = erro; $('l-senha').value = '';
}
function abrirCorpo() {
  $('v-login').hidden = true; $('v-corpo').hidden = false;
  if (diaDaUrl()) $('c-data').value = diaDaUrl();   // ?dia=: aquele dia (anterior: só leitura)
  else if (!$('c-data').value) { $('c-data').value = hoje(); $('c-hora').value = agoraHHMM(); }   // horário livre: vem a hora de agora
  $('c-data').max = hoje();
  desenhar();
}

// Abre na hora com a cópia local; depois envia o que estava pendente e traz a nuvem (pesagens e dias).
async function carregar(u) {
  if (u.id !== DONO) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {} telaLogin('Esta conta não tem acesso.'); return; }
  usuario = u;
  let local = null;
  try { local = JSON.parse(store.get(K_LOCAL(u.id))); base = baseNormal(JSON.parse(store.get(K_BASE(u.id)))); } catch (e) { local = null; }
  try { aguas = JSON.parse(store.get(K_AGUAS(u.id))) || {}; } catch (e) { aguas = {}; }
  if (local) { db = preparar(local); abrirCorpo(); }
  if (local && temPendente()) await enviar();
  try {
    // corpo_dia que não existe (migration 01 não aplicada) não derruba o app: só as pesagens seguem.
    // '*': com ou sem as colunas peso_em e sono_em (migration 03), a leitura funciona
    // agua_dia (só leitura, para a bexiga): se falhar, fica a cópia do aparelho
    const [M, D, A] = await Promise.all([todas('corpo_medida', '*'), todas('corpo_dia', '*').then(L => { semCorpoDia = false; return L; }, () => { semCorpoDia = true; return []; }),
      todas('agua_dia', 'data,aguas').catch(() => null)]);
    if (usuario !== u) return;
    if (A) {
      aguas = Object.fromEntries(A.map(x => [x.data, (Array.isArray(x.aguas) ? x.aguas : []).reduce((s, a) => s + (+a?.ml > 0 ? +a.ml : 0), 0)]));
      store.set(K_AGUAS(u.id), JSON.stringify(aguas));
    }
    // Pendente que não subiu (sem internet) continua valendo: a nuvem só entra quando não há nada a enviar.
    if (!local || !temPendente()) {
      db = preparar({ medidas: M, dias: D }); base = linhas(db);
      store.set(K_BASE(u.id), JSON.stringify(base)); store.set(K_LOCAL(u.id), JSON.stringify(db)); guardarMedidas(u.id, db.medidas);
    }
  } catch (e) {
    erroSync = e.message || String(e);
    if (!local) { telaLogin('Sem conexão com a nuvem. Tente de novo.'); return; }
  }
  abrirCorpo(); pintarSync();
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

// Virou o dia com o app aberto: o formulário passa para o dia novo.
let ultimoHoje = hoje();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !db || ultimoHoje === hoje()) return;
  if ($('c-data').value === ultimoHoje) { $('c-data').value = hoje(); $('c-hora').value = agoraHHMM(); }
  ultimoHoje = hoje(); $('c-data').max = hoje(); desenhar();
});

// Dentro do hub (…/corpo/), o login é o da página inicial: sem sessão vai pra lá e, depois de entrar,
// o hub devolve pra cá. Servido fora do hub (testes), usa o login próprio.
function irParaLoginDoHub() {
  if (!/\/corpo\/(index\.html)?$/.test(location.pathname)) return false;
  location.replace('../?volta=' + encodeURIComponent('corpo/' + location.search + location.hash));
  return true;
}

(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  const { data } = await sb.auth.getSession();   // sessão salva no aparelho (a do hub): entra direto, mesmo sem internet
  if (data.session) carregar(data.session.user); else if (!irParaLoginDoHub()) telaLogin();
})();
