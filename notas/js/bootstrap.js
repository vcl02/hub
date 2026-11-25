'use strict';

// Inicialização: sessão do Supabase, cópia local, dados da nuvem (js/banco.js), login (fora do hub) e service worker.
function telaLogin(erro = '') {
  db = null;
  usuario = null;
  base = null;
  conflitos = []; // os avisos de outra conta não aparecem nesta
  mantidas = [];
  avisos = [];
  pintarAvisos();
  aberta = null;
  emFavoritas = false;
  document.body.classList.remove('aberta');
  $('v-nota').hidden = true;
  $('v-fav').hidden = true;
  $('w-lista').hidden = false;
  $('v-lista').hidden = true;
  $('v-login').hidden = false;
  $('l-erro').textContent = erro;
  $('l-senha').value = '';
}

// Abre na hora com a cópia local; depois envia o que estava pendente e traz a nuvem (carregar, de js/banco.js).
async function entrar(u) {
  if (u.id !== DONO) {
    try {
      await sb.auth.signOut({ scope: 'local' });
    } catch {
      // erro inesperado ao sair (os de rede voltam em { error }, com a sessão local já limpa): segue mesmo assim
    }

    telaLogin('Esta conta não tem acesso.');

    return;
  }

  carregado = false;
  await carregar(u, mostrar);
  carregado = true;
  mostrar(); // a nota do endereço que não chegou nem da nuvem: volta para a lista
}

$('l-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();

  if ($('l-campos').disabled) return;
  const email = emailDoLogin($('l-usuario').value);

  $('l-erro').textContent = '';

  if (!email) {
    $('l-erro').textContent = 'Usuário ou senha inválidos.';

    return;
  }

  $('l-campos').disabled = true;

  try {
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password: $('l-senha').value,
    });

    if (error) {
      $('l-erro').textContent = /invalid/i.test(error.message)
        ? 'Usuário ou senha inválidos.'
        : 'Não foi possível entrar: ' + error.message;

      return;
    }

    await entrar(data.user);
  } catch {
    $('l-erro').textContent = 'Sem conexão. Tente de novo.';
  } finally {
    $('l-campos').disabled = false;
  }
});

// Dentro do hub (…/notas/), o login é o da página inicial: sem sessão vai pra lá e, depois de entrar,
// o hub devolve pra cá (com a nota do endereço). Servido fora do hub (testes), usa o login próprio.
function irParaLoginDoHub() {
  if (!/\/notas\/(index\.html)?$/.test(location.pathname)) return false;
  location.replace(
    '../?volta=' + encodeURIComponent('notas/' + location.search + location.hash)
  );

  return true;
}

(async () => {
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  const { data } = await sb.auth.getSession(); // sessão salva no aparelho (a do hub): entra direto, mesmo sem internet

  if (data.session) entrar(data.session.user);
  else if (!irParaLoginDoHub()) telaLogin();
})();
