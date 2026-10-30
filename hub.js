'use strict';
// Página inicial do hub: login (Supabase Auth) antes de tudo, os hábitos (habitos.js) com os dados dos apps, Sair e cache
// offline (sw.js).
// A sessão fica no localStorage da origem com a chave padrão do supabase-js, a mesma do fin e do tr:
// entrou aqui, os apps abrem direto.
const SUPABASE_URL = 'https://yzmyncxoskvqzdczaill.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Fq984qUdQO8mGq4PSYmUiQ_ySaLrmEQ';   // publicável; o RLS protege os dados
const DONO = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7';   // única conta com acesso (a mesma do tr)
const EMAIL_POR_USUARIO = { victor: 'victor.cabrera0209@gmail.com' };   // login aceita o usuário ou o e-mail, como nos apps
const emailDoLogin = texto => { const t = String(texto || '').trim(); return t.includes('@') ? t : EMAIL_POR_USUARIO[t.toLowerCase()] || null; };

const $ = id => document.getElementById(id);
// Rede ruim (metrô): sem teto, um pedido que perde o sinal no meio pode ficar pendente por minutos, e o que espera por ele
// (o envio, a busca) fica preso até ele cair. Todo pedido ao Supabase, inclusive a leitura da resposta, tem limite; estourou,
// vira falha de rede comum ("Failed to fetch") e o pendente vai na próxima tentativa. A função (IA) tem mais tempo.
const TETO_REDE_MS = 15000, TETO_FUNCAO_MS = 40000;
async function fetchComTeto(url, op = {}) {
  const c = new AbortController(), ms = String(url).includes('/functions/v1/') ? TETO_FUNCAO_MS : TETO_REDE_MS, t = setTimeout(() => c.abort(), ms);
  if (op.signal?.aborted) c.abort(); else op.signal?.addEventListener('abort', () => c.abort());
  try {
    const r = await fetch(url, { ...op, signal: c.signal });
    const corpo = [101, 103, 204, 205, 304].includes(r.status) ? null : await r.arrayBuffer();
    return new Response(corpo, { status: r.status, statusText: r.statusText, headers: r.headers });
  } catch (e) {
    if (c.signal.aborted && !op.signal?.aborted) throw new TypeError(`Failed to fetch: sem resposta em ${ms / 1000} s`);
    throw e;
  } finally { clearTimeout(t); }
}
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: fetchComTeto } });

function mostrar(logado, erro = '') {
  $('v-login').hidden = logado;
  $('v-apps').hidden = !logado;
  $('l-erro').textContent = erro;
  if (!logado) $('l-usuario').focus();
}

// ?volta=fin/?ciclo=… : um app aberto sem sessão mandou pra cá; depois de entrar, volta pra ele.
// Só aceita a pasta de um dos apps da página (nunca outro site nem caminho fora dela).
function destinoDaVolta() {
  const volta = new URLSearchParams(location.search).get('volta') || '';
  const pastas = [...document.querySelectorAll('.app:not(.externo)')].map(a => a.dataset.pasta || a.getAttribute('href'));
  const daPasta = pastas.some(p => volta === p || volta.startsWith(p + '?') || volta.startsWith(p + '#'));
  return daPasta && !/\.\.|\/\/|\\/.test(volta) ? volta : null;
}

// Com o dono logado: volta pro app que pediu o login ou mostra os hábitos.
let conta = null;
function entrou(usuario) {
  const destino = destinoDaVolta();
  if (destino) { location.replace(destino); return; }
  conta = usuario.id;
  mostrar(true);
  abrirHabitos();
}

// ===== Hábitos =====
// Os dados dos apps (só leitura), com cópia no aparelho (hub-habitos.<conta>) para abrir na hora, inclusive sem internet.
// Cada tabela que falhar (sem internet, tabela ainda não criada) fica com a cópia; as pesagens vêm por corpo/perfil.js.
const K_HABITOS = id => 'hub-habitos.' + id;
let dados = null;
const dadosVazios = () => ({ treinos: [], comidas: {}, bebidas: {}, trechos: {}, medidas: [], sonos: {}, aguas: {}, besteiras: {} });
const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
const horaOk = h => /^\d{2}:\d{2}$/.test(h) ? h : '';
async function todas(tabela) {
  const R = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(tabela).select('*').range(i, i + 999); if (error) throw error;
    R.push(...data); if (data.length < 1000) return R;
  }
}
const porDia = (L, valor) => L.filter(x => x && dataOk(x.data)).reduce((o, x) => { const v = valor(x); if (v != null) o[x.data] = v; return o; }, {});
const FONTES = {
  // Treino: o dia vem do início; sem fim (treino aberto), conta o dia mas não soma no gasto. cardio = esteira depois do treino.
  treinos: async () => (await todas('tr_treino')).map(t => {
    const inicio = Date.parse(t.inicio), fim = Date.parse(t.fim), c = t.cardio;
    return { inicio, fim: fim >= inicio ? fim : inicio, ...(c && c.ms > 0 && c.vel > 0 && { cardio: { ms: +c.ms, vel: +c.vel, incl: Math.max(0, +c.incl || 0) } }) };
  }).filter(t => !isNaN(t.inicio)),
  // Comida: kcal da porção × quantidade; hora vazia = lançada depois do dia (no al, registro de outro dia fica sem hora).
  // Mesma limpeza do preparar do al (js/banco.js), pro saldo daqui ser o mesmo de lá: sem nome sai, qtd inválida = 1 (até 20),
  // kcal de 0 a 5.000; trecho com até 600 min e 60 km, até 30 por dia.
  comidas: async () => (await todas('al_registro')).filter(r => r && dataOk(r.data) && String(r.nome ?? '').trim()).reduce((o, r) => {
    const qtd = +r.qtd > 0 ? Math.min(+r.qtd, 20) : 1, kcal = +r.kcal >= 0 ? Math.min(+r.kcal, 5000) : 0;
    (o[r.data] = o[r.data] || []).push({ hora: horaOk(r.hora), kcal: kcal * qtd }); return o;
  }, {}),
  trechos: async () => porDia(await todas('al_dia'), x => Array.isArray(x.caminhadas) ? x.caminhadas.map(t => ({ hora: horaOk(t?.hora),
    ...(+t?.minutos > 0 && +t.minutos <= 600 && { minutos: +t.minutos }), ...(+t?.km > 0 && +t.km <= 60 && { km: +t.km }) })).slice(0, 30) : null),
  medidas: () => lerMedidas(sb, conta),
  sonos: async () => porDia(await todas('corpo_dia'), x => x.sono == null || isNaN(+x.sono) ? null : { sono: +x.sono, ...(x.sono_em && { sonoEm: x.sono_em }) }),
  aguas: async () => porDia(await todas('agua_dia'), x => Array.isArray(x.aguas) ? x.aguas.reduce((s, a) => s + (+a.ml || 0), 0) : null),
  // Besteira do Fin: soma por dia (data da compra) dos gastos com a categoria Besteira, pela mesma regra do teto de Besteira
  // do Fin (contaNoTeto em fin/js/charts.js): valor negativo, categoria "Besteira" como item inteiro da lista separada por
  // vírgula (sem acento), fora a antecipação de fatura
  besteiras: async () => {
    const R = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await sb.from('fin').select('data,valor,categ,nome,cred').ilike('categ', '%besteira%').range(i, i + 999);
      if (error) throw error;
      R.push(...data); if (data.length < 1000) break;
    }
    const sem = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const antecipacao = s => sem(s).includes('antecipacao') && sem(s).includes('fatura');
    return R.filter(r => dataOk(r.data) && +r.valor < 0 && String(r.categ ?? '').split(',').some(c => sem(c) === 'besteira') && !(!r.cred && (antecipacao(r.categ) || antecipacao(r.nome))))
      .reduce((o, r) => { o[r.data] = Math.round(((o[r.data] || 0) - +r.valor) * 100) / 100; return o; }, {});
  },
  // Bebidas da Água (suco, refri…): kcal por agua/bebidas.js, contam como comido no déficit (lançadas sempre no dia, com hora)
  bebidas: async () => porDia(await todas('agua_dia'), x => {
    const L = (Array.isArray(x.aguas) ? x.aguas : []).map(a => ({ hora: horaOk(a?.hora), n: nutrientesBebida(a) })).filter(b => b.n);
    return L.length ? L.map(b => ({ hora: b.hora, kcal: b.n.kcal })) : null;
  })
};
function abrirHabitos() {
  try { dados = { ...dadosVazios(), ...JSON.parse(localStorage.getItem(K_HABITOS(conta))) }; } catch (e) { dados = dadosVazios(); }
  if (!dados.medidas.length) dados.medidas = medidasGuardadas(conta);
  desenhar();
  atualizarHabitos();
}
let buscando = false;
async function atualizarHabitos() {
  if (!conta || buscando) return;
  buscando = true;
  const id = conta, chaves = Object.keys(FONTES);
  const R = await Promise.allSettled(chaves.map(k => FONTES[k]()));
  buscando = false;
  if (conta !== id) return;
  R.forEach((r, i) => { if (r.status === 'fulfilled') dados[chaves[i]] = r.value; });
  try { localStorage.setItem(K_HABITOS(id), JSON.stringify(dados)); } catch (e) {}
  desenhar();
}

// Estados de cada dia (feito, falhou, protegido, pendente, folga, antes) viram classes das barrinhas
const LETRAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
let diaDesenhado = '';
// Dia visto: null = hoje. Arrastar para a direita volta um dia (até o 1º dia com registro), para a esquerda avança (até
// hoje). Num dia passado tudo é do fim daquele dia, e cada hábito abre o app naquele dia (?dia=AAAA-MM-DD), só leitura;
// o Fin (Besteira) abre no ciclo daquele dia, normal (o Fin não tem modo só leitura).
let diaVisto = null;
function desenhar() {
  if (!dados || $('v-apps').hidden) return;
  const hoje = diaDoInstante(Date.now()), R = calcularHabitos(dados, hoje);
  const primeiro = Object.keys(R.perfeito)[0] || hoje;
  if (diaVisto && (diaVisto >= hoje || diaVisto < primeiro)) diaVisto = diaVisto < primeiro && primeiro < hoje ? primeiro : null;
  const dia = diaVisto || hoje, passado = dia < hoje, H = resumoDeHoje(dados, dia, passado), A = ateODia(R, dia);
  // A semana do dia visto, de segunda a domingo (como no Treino): os dias que ainda não chegaram ficam vazios (.futuro)
  const segunda = diaMais(dia, -((semanaDoDia(dia) + 6) % 7)), semana = [0, 1, 2, 3, 4, 5, 6].map(n => diaMais(segunda, n));
  diaDesenhado = hoje;
  const [a, m, d] = dia.split('-').map(Number);
  const data = new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('h-data').textContent = data;
  $('v-apps').classList.toggle('passado', passado);
  $('h-hoje').hidden = !passado;
  $('h-anterior').disabled = dia <= primeiro;
  $('h-proximo').disabled = !passado;
  const perfeitos = passado ? A.perfeitos : R.perfeitos;
  $('h-perfeitos').textContent = perfeitos;
  $('h-perfeitos').nextElementSibling.textContent = perfeitos === 1 ? 'dia perfeito' : 'dias perfeitos';
  $('h-perfeitos').parentElement.classList.toggle('acesa', perfeitos > 0);
  $('h-protecoes').querySelector('b').textContent = R.protecoes;
  $('h-protecoes').setAttribute('aria-label', `${R.protecoes} de ${PROTECOES_MAX} proteções`);
  $('h-protecoes').classList.toggle('apagada', !R.protecoes);
  $('h-semana').innerHTML = semana.map(x => `<li class="${x > hoje ? 'futuro' : R.perfeito[x] ? 'sim' : ''}${x === dia ? ' hoje' : ''}"><span>${LETRAS[semanaDoDia(x)]}</span><i></i></li>`).join('');
  for (const el of document.querySelectorAll('[data-habito]')) {
    const id = el.dataset.habito, h = R.habitos[id], r = H[id], estado = h.dias[dia] || 'antes', ofensiva = passado ? A.ofensiva[id] : h.ofensiva;
    el.dataset.pasta ||= el.getAttribute('href');
    el.setAttribute('href', passado ? `${el.dataset.pasta}?dia=${dia}` : el.dataset.pasta);
    el.querySelector('.hab-valor').textContent = r.valor;
    el.querySelector('.hab-valor').classList.toggle('acima', !!r.acima);
    const barra = el.querySelector('.hab-barra');
    barra.hidden = r.progresso == null;
    if (r.progresso != null) barra.firstElementChild.style.width = Math.round(Math.min(1, Math.max(0, r.progresso)) * 100) + '%';
    const of = el.querySelector('.hab-ofensiva');
    of.querySelector('b').textContent = ofensiva;
    // Chama acesa: feito no dia, ou dia de folga com a ofensiva em dia (treino na sexta depois de qua e qui feitos)
    of.classList.toggle('acesa', estado === 'feito' || (estado === 'folga' && ofensiva > 0));
    of.classList.toggle('apagada', !ofensiva);
    of.setAttribute('aria-label', `Ofensiva: ${ofensiva}`);
    el.classList.toggle('feito', estado === 'feito');
    el.querySelector('.hab-dias').innerHTML = semana.map(x => `<i class="${x > hoje ? 'futuro' : h.dias[x] || 'antes'}${x === dia ? ' hoje' : ''}"></i>`).join('');
  }
}
function mudarDia(n) {
  if (!dados) return;
  const hoje = diaDoInstante(Date.now()), alvo = diaMais(diaVisto || hoje, n);
  const primeiro = Object.keys(calcularHabitos(dados, hoje).perfeito)[0] || hoje;
  if (alvo > hoje || alvo < primeiro) return;
  diaVisto = alvo < hoje ? alvo : null;
  desenhar();
}
// Arrastar de lado na tela dos hábitos (como no Treino: só gesto claramente horizontal, longo ou rápido); no computador,
// as setas do teclado e os botões ‹ ›. O link do hábito não abre no fim de um arrasto.
let x0 = 0, y0 = 0, t0 = 0, arrastando = false, eixo = null, arrastou = false;
$('v-apps').addEventListener('touchstart', ev => {
  arrastando = ev.touches.length === 1; eixo = null; arrastou = false;
  if (arrastando) { x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; t0 = Date.now(); }
}, { passive: true });
$('v-apps').addEventListener('touchmove', ev => {
  if (!arrastando || eixo) return;
  const dx = ev.touches[0].clientX - x0, dy = ev.touches[0].clientY - y0;
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) eixo = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
  if (eixo === 'x') soltarCard();
}, { passive: true });
$('v-apps').addEventListener('touchend', ev => {
  if (!arrastando) return; arrastando = false;
  const dx = ev.changedTouches[0].clientX - x0, rapido = Date.now() - t0 < 300;
  if (eixo === 'x' && (Math.abs(dx) > 80 || (rapido && Math.abs(dx) > 40))) { arrastou = true; mudarDia(dx > 0 ? -1 : 1); }
});
$('v-apps').addEventListener('touchcancel', () => { arrastando = false; });
$('v-apps').addEventListener('click', ev => { if (arrastou && ev.target.closest('.app')) { ev.preventDefault(); ev.stopImmediatePropagation(); } arrastou = false; }, true);
addEventListener('keydown', ev => {
  if ($('v-apps').hidden || ev.target.closest?.('input')) return;
  if (ev.key === 'ArrowLeft') mudarDia(-1);
  if (ev.key === 'ArrowRight') mudarDia(1);
});
$('h-anterior').addEventListener('click', () => mudarDia(-1));
$('h-proximo').addEventListener('click', () => mudarDia(1));
$('h-hoje').addEventListener('click', () => { diaVisto = null; desenhar(); });
// Voltou de um app: busca de novo. Passou da meia-noite com a tela aberta: redesenha o dia novo.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') atualizarHabitos(); });
addEventListener('online', () => atualizarHabitos());
setInterval(() => { if (dados && diaDoInstante(Date.now()) !== diaDesenhado) desenhar(); }, 60000);

// Ao abrir: com sessão salva do dono entra direto (inclusive sem internet); senão, login.
async function abrir() {
  let usuario = null;
  try { usuario = (await sb.auth.getSession()).data.session?.user || null; } catch (e) {}
  if (usuario && usuario.id !== DONO) { await sairDaConta(); usuario = null; }
  if (usuario) entrou(usuario); else mostrar(false);
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
  entrou(data.user);
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
  conta = null; dados = null; diaVisto = null;
  $('l-usuario').value = ''; $('l-senha').value = '';
  mostrar(false);
});

// Google Agenda: no Android, um link intent abre o app (pacote com.google.android.calendar); se ele não abrir,
// o Chrome segue para a versão web (browser_fallback_url). Fora do Android fica o link web.
if (/Android/i.test(navigator.userAgent)) {
  const web = $('agenda').href;
  $('agenda').href = `intent://calendar.google.com/calendar/r#Intent;scheme=https;package=com.google.android.calendar;S.browser_fallback_url=${encodeURIComponent(web)};end`;
}

// Toque num hábito ou atalho: a crescidinha (.tocado) aparece já no toque e, nos apps do hub, a troca de página
// espera um instante pra ela ser vista. Ao voltar pro hub, o tocado cresce de novo e volta ao
// normal sozinho: nada fica selecionado.
let toque = null, ultimo = null;
const soltarCard = () => {
  clearTimeout(toque);
  document.querySelectorAll('.app.tocado').forEach(a => a.classList.remove('tocado'));
  if (document.activeElement?.classList.contains('app')) document.activeElement.blur();
};
const destacar = (a, ms) => { soltarCard(); a.classList.add('tocado'); toque = setTimeout(soltarCard, ms); };
document.querySelectorAll('.app').forEach(a => {
  a.addEventListener('pointerdown', () => { ultimo = a; destacar(a, 900); });
  a.addEventListener('click', ev => {
    ultimo = a; destacar(a, 900);
    if (a.classList.contains('externo') || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    ev.preventDefault();
    setTimeout(() => { location.href = a.href; }, 180);
  });
});
const voltou = () => { if (document.visibilityState === 'visible' && ultimo) destacar(ultimo, 700); else soltarCard(); };
addEventListener('pageshow', voltou);
addEventListener('pagehide', soltarCard);
document.addEventListener('visibilitychange', voltou);

abrir();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
