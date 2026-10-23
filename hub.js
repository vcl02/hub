'use strict';
// Página inicial do hub: login (Supabase Auth) antes dos apps, Sair e cache offline (sw.js).
// A sessão fica no localStorage da origem com a chave padrão do supabase-js, a mesma do fin e do tr:
// entrou aqui, os apps abrem direto.
const SUPABASE_URL = 'https://yzmyncxoskvqzdczaill.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Fq984qUdQO8mGq4PSYmUiQ_ySaLrmEQ';   // publicável; o RLS protege os dados
const DONO = '2f9bc201-9966-4f37-9963-2f4b9ddab849';   // única conta com acesso (a mesma do tr)
const EMAIL_POR_USUARIO = { victor: 'victor.cabrera0209@gmail.com' };   // login aceita o usuário ou o e-mail, como nos apps
const emailDoLogin = texto => { const t = String(texto || '').trim(); return t.includes('@') ? t : EMAIL_POR_USUARIO[t.toLowerCase()] || null; };

const $ = id => document.getElementById(id);
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function mostrar(logado, erro = '') {
  $('v-login').hidden = logado;
  $('v-apps').hidden = !logado;
  $('l-erro').textContent = erro;
  if (!logado) $('l-usuario').focus();
}

// ?volta=fin/?ciclo=… : um app aberto sem sessão mandou pra cá; depois de entrar, volta pra ele.
// Só aceita a pasta de um dos cards (nunca outro site nem caminho fora dela).
function destinoDaVolta() {
  const volta = new URLSearchParams(location.search).get('volta') || '';
  const pastas = [...document.querySelectorAll('.app:not(.externo)')].map(a => a.getAttribute('href'));
  const daPasta = pastas.some(p => volta === p || volta.startsWith(p + '?') || volta.startsWith(p + '#'));
  return daPasta && !/\.\.|\/\/|\\/.test(volta) ? volta : null;
}

// Com o dono logado: volta pro app que pediu o login ou mostra os cards.
function entrou() {
  const destino = destinoDaVolta();
  if (destino) location.replace(destino);
  else mostrar(true);
}

// Ao abrir: com sessão salva do dono entra direto (inclusive sem internet); senão, login.
async function abrir() {
  let usuario = null;
  try { usuario = (await sb.auth.getSession()).data.session?.user || null; } catch (e) {}
  if (usuario && usuario.id !== DONO) { await sairDaConta(); usuario = null; }
  if (usuario) entrou(); else mostrar(false);
}

// Sem resposta do servidor (sem internet, rede caiu) o supabase-js devolve status 0 em vez de
// lançar exceção: não pode virar "senha inválida".
function mensagemDeErro(error) {
  if (/invalid/i.test(error.message || '')) return 'Usuário ou senha inválidos.';
  if (!error.status || error.name === 'AuthRetryableFetchError') return 'Sem conexão. Tente de novo.';
  return 'Não foi possível entrar: ' + error.message;
}

async function sairDaConta() {
  try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
}

$('l-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  if ($('l-campos').disabled) return;
  const email = emailDoLogin($('l-usuario').value);
  $('l-erro').textContent = '';
  $('l-campos').disabled = true; $('l-botao').textContent = 'Entrando…';
  // Usuário desconhecido recebe a mesma mensagem de senha errada: não revela quais existem.
  let resposta = { data: null, error: { message: 'Invalid login credentials' } };
  try { if (email) resposta = await sb.auth.signInWithPassword({ email, password: $('l-senha').value }); }
  catch (e) { resposta = { data: null, error: { status: 0, message: String(e) } }; }
  $('l-campos').disabled = false; $('l-botao').textContent = 'Entrar';
  const { data, error } = resposta;
  if (error) { mostrar(false, mensagemDeErro(error)); return; }
  if (data.user.id !== DONO) { await sairDaConta(); mostrar(false, 'Esta conta não tem acesso.'); return; }
  $('l-senha').value = '';
  entrou();
});

// Sair: toque duplo (o 1º deixa o botão vermelho por 3 s), como nos apps.
let armado = null;
$('sair').addEventListener('click', async () => {
  const botao = $('sair');
  if (!botao.classList.contains('armado')) {
    botao.classList.add('armado');
    clearTimeout(armado); armado = setTimeout(() => botao.classList.remove('armado'), 3000);
    return;
  }
  clearTimeout(armado); botao.classList.remove('armado');
  await sairDaConta();
  $('l-usuario').value = ''; $('l-senha').value = '';
  mostrar(false);
});

// Google Agenda: no Android, um link intent abre o app (pacote com.google.android.calendar); se ele não abrir,
// o Chrome segue para a versão web (browser_fallback_url). Fora do Android fica o link web.
if (/Android/i.test(navigator.userAgent)) {
  const web = $('agenda').href;
  $('agenda').href = `intent://calendar.google.com/calendar/r#Intent;scheme=https;package=com.google.android.calendar;S.browser_fallback_url=${encodeURIComponent(web)};end`;
}

// Toque num card: dá a crescidinha (.tocado) e ela some sozinha; ao voltar pro hub (de um app,
// de outra aba ou do histórico), nenhum card fica selecionado.
let toque = null;
const soltarCard = () => {
  clearTimeout(toque);
  document.querySelectorAll('.app.tocado').forEach(a => a.classList.remove('tocado'));
  if (document.activeElement?.classList.contains('app')) document.activeElement.blur();
};
document.querySelectorAll('.app').forEach(a => a.addEventListener('click', () => {
  soltarCard(); a.classList.add('tocado'); toque = setTimeout(soltarCard, 600);
}));
addEventListener('pageshow', soltarCard);
addEventListener('pagehide', soltarCard);
document.addEventListener('visibilitychange', soltarCard);

abrir();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
