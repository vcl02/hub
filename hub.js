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

// Ao abrir: com sessão salva do dono entra direto (inclusive sem internet); senão, login.
async function abrir() {
  let usuario = null;
  try { usuario = (await sb.auth.getSession()).data.session?.user || null; } catch (e) {}
  if (usuario && usuario.id !== DONO) { await sairDaConta(); usuario = null; }
  mostrar(!!usuario);
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
  let resposta = { data: null, error: true };
  try { if (email) resposta = await sb.auth.signInWithPassword({ email, password: $('l-senha').value }); }
  catch (e) { resposta = { data: null, error: { message: 'rede' } }; }
  $('l-campos').disabled = false; $('l-botao').textContent = 'Entrar';
  const { data, error } = resposta;
  // Usuário desconhecido recebe a mesma mensagem de senha errada: não revela quais existem.
  if (error) { mostrar(false, error.message === 'rede' ? 'Sem conexão. Tente de novo.' : 'Usuário ou senha inválidos.'); return; }
  if (data.user.id !== DONO) { await sairDaConta(); mostrar(false, 'Esta conta não tem acesso.'); return; }
  $('l-senha').value = '';
  mostrar(true);
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

abrir();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
