'use strict';
/*
  Diário de Carga — tudo roda no navegador.

  Banco (um único item no localStorage, criptografado com a senha mestra):
    db = {
      exercicios: [{ id, grupo, series, reps, descanso, ativo, variacoes: [{ id, nome, unidade }] }],
      registros:  [{ variacao, data, carga, reps }]      // 1 por variação por dia
    }
  variacoes[0] = principal, [1] = substituto (máquina), [2] = halter. "ativo" = índice da variação em uso.
*/

// ===== Configuração =====
const DIAS_FIXOS = [3, 4];   // quarta, quinta (Date.getDay)
const DIAS_EXTRA = [1];      // segunda (sugerido)
const TIPOS = ['Principal', 'Substituto', 'Halter'];
const PADRAO = [             // grupo, descanso (s), [principal, substituto, halter]
  ['Pernas · empurrar', 90, ['Leg press 45°', 'Agachamento no Smith', 'Agachamento taça com halter']],
  ['Posterior de coxa', 60, ['Cadeira flexora', 'Mesa flexora', 'Stiff com halteres']],
  ['Peito', 75, ['Supino máquina', 'Voador (peck deck)', 'Supino reto com halteres']],
  ['Costas · puxar de cima', 75, ['Puxada alta', 'Barra assistida (graviton)', 'Pullover com halter']],
  ['Costas · remar', 75, ['Remada sentada máquina', 'Remada baixa no cabo', 'Remada unilateral (serrote)']],
  ['Ombros', 60, ['Desenvolvimento máquina', 'Desenvolvimento no Smith', 'Desenvolvimento com halteres']]
];
const K_DADOS = 'carga.vault.v1', K_CHAVE = 'carga.key.v1', ITER = 310000;
const NOME_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIA_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// ===== Utilidades =====
const $ = id => document.getElementById(id);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del: k => { try { localStorage.removeItem(k); } catch (e) {} }
};
const novoId = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hoje = () => iso(new Date());
const num = s => parseFloat(String(s).replace(',', '.'));
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('pt-BR');
const intEntre = (v, min, max, padrao) => { const n = parseInt(v, 10); return n >= min && n <= max ? n : padrao; };
function dataCurta(d) { const [a, m, dia] = d.split('-'); return dia + '/' + m + (+a !== new Date().getFullYear() ? '/' + a.slice(2) : ''); }
function quando(d) {
  const [a, m, dia] = d.split('-').map(Number), t = new Date();
  const n = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(a, m - 1, dia)) / 864e5);
  return n === 0 ? 'hoje' : n === 1 ? 'ontem' : n > 1 && n < 7 ? 'há ' + n + ' dias' : dataCurta(d);
}
const repsMax = e => { const m = String(e.reps).match(/\d+/g); return m ? Math.max(...m.map(Number)) : 12; };
// Pirâmide: série i = peso inicial + i × 10% (arredondado ao passo), reps = topo − 2i
const repsSerie = (e, i) => Math.max(1, repsMax(e) - 2 * i);
const repsUltima = e => repsSerie(e, e.series - 1);
const passoCarga = v => v.unidade === 'kg' ? 2.5 : 1;
const arred = (x, p) => Math.max(p, Math.round(x / p) * p);
function plano(e, v, inicial, comAquecimento) {
  const p = passoCarga(v), ok = isFinite(inicial) && inicial > 0, inc = ok ? arred(inicial * .1, p) : 0, s = [];
  if (comAquecimento) s.push({ nome: 'Aquecimento', carga: ok ? arred(inicial * .5, p) : null, reps: 15, aq: true });
  for (let i = 0; i < e.series; i++) s.push({ nome: 'Série ' + (i + 1), carga: ok ? inicial + inc * i : null, reps: repsSerie(e, i) });
  return s;
}
let tToast;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(tToast); tToast = setTimeout(() => { t.hidden = true; }, 2400); }
function confirmar(btn, texto) {   // 1º toque arma, 2º confirma (alert/confirm não são usados)
  if (btn.classList.contains('armed')) return true;
  const antes = btn.textContent; btn.classList.add('armed'); btn.textContent = texto;
  setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = antes; } }, 3000);
  return false;
}

// ===== Banco criptografado (PBKDF2 → AES-GCM) =====
let db = null, chave = null, sal = null, iter = ITER;
const te = new TextEncoder(), td = new TextDecoder();
function b64(buf) { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
function deB64(s) { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
async function derivar(senha, s, it) {
  const base = await crypto.subtle.importKey('raw', te.encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: s, iterations: it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function abrir(k) {
  const c = JSON.parse(store.get(K_DADOS));
  return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(c.iv) }, k, deB64(c.ct))));
}
async function fechar() {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, te.encode(JSON.stringify(db)));
  if (!store.set(K_DADOS, JSON.stringify({ it: iter, salt: b64(sal), iv: b64(iv), ct: b64(ct) }))) toast('Não consegui gravar no aparelho. Faça um backup.');
}
let fila = Promise.resolve();
const gravar = () => (fila = fila.then(fechar).catch(() => toast('Erro ao gravar')));
async function manterChave(sim) { if (sim) store.set(K_CHAVE, b64(await crypto.subtle.exportKey('raw', chave))); else store.del(K_CHAVE); }

function bancoNovo() {
  return {
    exercicios: PADRAO.map(([grupo, descanso, nomes]) => ({ grupo, series: 3, reps: '10–12', descanso, variacoes: nomes.map(nome => ({ nome })) })),
    registros: []
  };
}
function variacaoAtiva(e) { if (e.variacoes[e.ativo]?.nome) return e.ativo; const i = e.variacoes.findIndex(v => v.nome); return i < 0 ? 0 : i; }
function preparar(d) {           // valida, completa campos e migra o formato antigo
  if (d && d.slots) d = {
    exercicios: d.slots.map(s => ({ id: s.id, grupo: s.g, series: s.sets, reps: s.reps, descanso: s.rest, ativo: s.a, variacoes: (s.vs || []).map(v => ({ id: v.id, nome: v.pt, unidade: v.u })) })),
    registros: (d.logs || []).map(l => ({ variacao: l.v, data: l.d, carga: l.w, reps: l.r }))
  };
  if (!d || !Array.isArray(d.exercicios) || !Array.isArray(d.registros)) throw new Error('formato');
  const exercicios = d.exercicios.map((e, i) => {
    const vs = (e.variacoes || []).slice(0, 3).map(v => ({ id: v.id || novoId(), nome: String(v.nome || '').trim(), unidade: v.unidade === 'nível' ? 'nível' : 'kg' }));
    while (vs.length < 3) vs.push({ id: novoId(), nome: '', unidade: 'kg' });
    const ex = { id: e.id || novoId(), grupo: String(e.grupo || vs[0].nome), series: intEntre(e.series, 1, 10, 3), reps: String(e.reps || '').trim() || '10–12', descanso: intEntre(e.descanso, 10, 600, PADRAO[i]?.[1] || 75), ativo: e.ativo || 0, variacoes: vs };
    ex.ativo = variacaoAtiva(ex);
    return ex;
  });
  const registros = d.registros
    .filter(r => r && r.variacao && /^\d{4}-\d{2}-\d{2}$/.test(r.data) && isFinite(r.carga))
    .map(r => ({ variacao: r.variacao, data: r.data, carga: +r.carga, reps: +r.reps || 0 }));
  return { exercicios, registros };
}

// ===== Navegação =====
const telas = {};
let pilha = [];
function mostrar(nome) {
  document.querySelectorAll('section.view').forEach(v => { v.hidden = v.id !== 'v-' + nome; });
  telas[nome]?.();
  salvarSessao();
  window.scrollTo(0, 0);
}
function ir(nome) {
  if (nome === 'inicio' || nome === 'bloqueio') { pilha = [nome]; history.replaceState(null, ''); }
  else { pilha.push(nome); history.pushState(null, ''); }
  mostrar(nome);
}
function voltar() { if (pilha.length > 1) history.back(); else mostrar('inicio'); }
addEventListener('popstate', () => { if (db && pilha.length > 1) { pilha.pop(); mostrar(pilha[pilha.length - 1]); } });

// ===== Bloqueio =====
let modo = 'criar';
function telaBloqueio(m, erro = '') {
  modo = m; db = null; chave = null;
  clearInterval(T.intervalo); T.intervalo = null; T.fim = 0; manterTela(false); $('mini').hidden = true;   // sessão salva continua
  const criar = m === 'criar';
  $('l-titulo').textContent = criar ? 'Criar senha mestra' : 'Desbloquear';
  $('l-sub').textContent = criar ? 'Seus registros ficam criptografados neste aparelho. Não existe recuperação de senha: anote em lugar seguro.' : 'Digite sua senha mestra.';
  $('l-rep-box').hidden = !criar; $('l-rep').required = criar;
  $('l-senha').autocomplete = criar ? 'new-password' : 'current-password';
  $('l-btn').textContent = criar ? 'Criar e entrar' : 'Entrar';
  $('l-esqueci-box').hidden = criar; $('l-apagar-box').hidden = true;
  $('l-erro').textContent = erro; $('l-senha').value = ''; $('l-rep').value = '';
  ir('bloqueio');
}
async function entrou() {
  db = preparar(db);
  try { await navigator.storage?.persist?.(); } catch (e) {}
  restaurarSessao();
}
$('l-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const senha = $('l-senha').value, btn = $('l-btn'), erro = $('l-erro'), rotulo = btn.textContent;
  erro.textContent = '';
  if (!window.crypto?.subtle) { erro.textContent = 'Abra o app pelo endereço https.'; return; }
  if (senha.length < 4) { erro.textContent = 'Use pelo menos 4 caracteres.'; return; }
  if (modo === 'criar' && senha !== $('l-rep').value) { erro.textContent = 'As senhas não conferem.'; return; }
  btn.disabled = true; btn.textContent = 'Abrindo…';
  try {
    if (modo === 'criar') {
      sal = crypto.getRandomValues(new Uint8Array(16)); iter = ITER;
      chave = await derivar(senha, sal, iter); db = bancoNovo(); db = preparar(db); await gravar();
    } else {
      const c = JSON.parse(store.get(K_DADOS)); sal = deB64(c.salt); iter = c.it || ITER;
      const k = await derivar(senha, sal, iter);
      try { db = await abrir(k); } catch (e) { erro.textContent = 'Senha incorreta.'; return; }
      chave = k;
    }
    await manterChave($('l-manter').checked);
    await entrou();
  } catch (e) { erro.textContent = 'Não foi possível abrir: ' + (e.message || e); }
  finally { btn.disabled = false; btn.textContent = rotulo; }
});
$('l-esqueci').addEventListener('click', () => { $('l-apagar-box').hidden = !$('l-apagar-box').hidden; });
$('l-apagar').addEventListener('click', () => { store.del(K_DADOS); store.del(K_CHAVE); telaBloqueio('criar'); toast('Dados apagados'); });

// ===== Início =====
function ultimo(variacaoId) { let u = null; for (const r of db.registros) if (r.variacao === variacaoId && (!u || r.data > u.data)) u = r; return u; }
telas.inicio = () => {
  const h = hoje(); let feitos = 0;
  $('i-lista').innerHTML = db.exercicios.map(e => {
    e.ativo = variacaoAtiva(e);
    const v = e.variacoes[e.ativo], u = ultimo(v.id);
    const feito = db.registros.some(r => r.data === h && e.variacoes.some(x => x.id === r.variacao)); if (feito) feitos++;
    return `<li><button type="button" class="slot" data-ex="${e.id}">
      <span class="slot-main"><span class="eyebrow">${esc(e.grupo)}${e.ativo > 0 ? ` · <span class="kind">${TIPOS[e.ativo]}</span>` : ''}</span>
      <span class="name">${esc(v.nome)}</span><span class="r">${Array.from({ length: e.series }, (_, i) => repsSerie(e, i)).join(' → ')} reps · ${e.descanso} s</span>
      <span class="chips">${feito ? '<span class="chip ok">✓ Feito hoje</span>' : ''}${u && u.reps >= repsUltima(e) ? '<span class="chip warn">Subir carga</span>' : ''}</span></span>
      <span class="slot-load">${u ? `<span class="w">${fmt(u.carga)}<small>${esc(v.unidade)}</small></span><span class="r">× ${u.reps} · ${quando(u.data)}</span>` : '<span class="r">sem registro</span>'}</span>
    </button></li>`;
  }).join('');
  $('i-cont').textContent = feitos + '/' + db.exercicios.length;
  $('i-barra').style.width = (db.exercicios.length ? feitos / db.exercicios.length * 100 : 0) + '%';
  const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('i-data').textContent = d[0].toUpperCase() + d.slice(1);
  semana();
};
function semana() {
  const agora = new Date(), h = hoje(), dias = new Set(db.registros.map(r => r.data));
  const seg = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - ((agora.getDay() + 6) % 7));
  let fixos = 0, extra = false, html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + i), wd = d.getDay(), k = iso(d), feito = dias.has(k);
    const tipo = DIAS_FIXOS.includes(wd) ? 'fix' : DIAS_EXTRA.includes(wd) ? 'sug' : 'off';
    if (feito && tipo === 'fix') fixos++; if (feito && tipo === 'sug') extra = true;
    html += `<li class="day ${tipo}${k === h ? ' today' : ''}${feito ? ' done' : ''}"><span class="dn">${NOME_DIA[wd]}</span><span class="dd">${d.getDate()}</span><span class="dm">${feito ? '✓' : tipo === 'fix' ? 'fixo' : tipo === 'sug' ? 'extra' : ''}</span></li>`;
  }
  $('i-semana').innerHTML = html;
  const wd = agora.getDay(), treino = d => DIAS_FIXOS.includes(d) || DIAS_EXTRA.includes(d);
  let msg;
  if (DIAS_FIXOS.includes(wd)) msg = 'Hoje é dia de treino fixo.';
  else if (DIAS_EXTRA.includes(wd)) msg = 'Hoje é o treino extra sugerido (opcional).';
  else { let n = 1; while (!treino((wd + n) % 7)) n++; const p = (wd + n) % 7; msg = `Descanso. Próximo: ${n === 1 ? 'amanhã (' + DIA_LONGO[p] + ')' : DIA_LONGO[p]}${DIAS_EXTRA.includes(p) ? ', extra' : ''}.`; }
  $('i-msg').textContent = msg;
  $('i-cont-semana').textContent = `Semana: ${fixos}/${DIAS_FIXOS.length} fixos${extra ? ' + extra' : ''}`;
}

// ===== Exercício =====
let atual = null;   // id do exercício aberto
const exAtual = () => db.exercicios.find(e => e.id === atual);
telas.exercicio = () => {
  const e = exAtual(); if (!e) { voltar(); return; }
  e.ativo = variacaoAtiva(e);
  const v = e.variacoes[e.ativo], pos = db.exercicios.indexOf(e), u = ultimo(v.id);
  $('e-pos').textContent = (pos + 1) + '/' + db.exercicios.length;
  $('e-pontos').innerHTML = db.exercicios.map((_, i) => `<i${i === pos ? ' class="on"' : ''}></i>`).join('');
  $('e-grupo').textContent = e.grupo;
  $('e-variacoes').innerHTML = e.variacoes.map((x, i) => x.nome ? `<button type="button" class="seg" role="radio" aria-checked="${i === e.ativo}" data-var="${i}"><span class="seg-k">${TIPOS[i]}</span><span class="seg-n">${esc(x.nome)}</span></button>` : '').join('');
  $('e-variacoes').hidden = e.variacoes.filter(x => x.nome).length < 2;
  $('e-nome').textContent = v.nome;
  $('e-presc').innerHTML = `<b>Pirâmide ${Array.from({ length: e.series }, (_, i) => repsSerie(e, i)).join(' → ')} reps</b> · descanso ${e.descanso} s`;
  $('e-youtube').href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent((v.nome + ' execução correta').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim());
  $('e-ultima').innerHTML = u
    ? `<span>Última: <b>peso inicial ${fmt(u.carga)} ${esc(v.unidade)}</b>, ${u.reps} reps na última série · ${quando(u.data)}</span>${u.reps >= repsUltima(e) ? '<span class="chip warn">Completou: suba o peso inicial</span>' : ''}`
    : '<span class="muted">Primeiro registro desta variação. Comece leve.</span>';
  $('e-unidade').textContent = v.unidade;
  const rs = rascunho[v.id];   // valor digitado e ainda não salvo tem prioridade
  $('e-carga').value = rs ? rs.carga : u ? String(u.carga).replace('.', ',') : '';
  $('e-reps').value = rs ? rs.reps : repsUltima(e);
  pintarDescanso(e);
  const lista = db.registros.filter(r => r.variacao === v.id).sort((a, b) => b.data.localeCompare(a.data));
  $('e-historico').innerHTML = lista.length
    ? lista.map(r => `<li><span class="h-d">${dataCurta(r.data)}</span><span class="h-v">${fmt(r.carga)} ${esc(v.unidade)} × ${r.reps}</span><button type="button" class="del" data-apagar="${r.data}">Apagar</button></li>`).join('')
    : '<li class="empty">Nenhum registro ainda.</li>';
  grafico(lista.slice(0, 12).reverse(), v.unidade);
};
function grafico(P, unidade) {
  const box = $('e-grafico');
  if (P.length < 2) { box.innerHTML = '<p>O gráfico aparece a partir do 2º registro.</p>'; return; }
  const W = 320, H = 120, l = 40, r = 12, t = 12, b = 22;
  let lo = Math.min(...P.map(p => p.carga)), hi = Math.max(...P.map(p => p.carga));
  if (lo === hi) { lo -= 1; hi += 1; }
  const x = i => l + i * (W - l - r) / (P.length - 1), y = c => t + (hi - c) * (H - t - b) / (hi - lo);
  const pts = P.map((p, i) => x(i).toFixed(1) + ',' + y(p.carga).toFixed(1)), fim = P[P.length - 1];
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução da carga">
    <line x1="${l}" x2="${W - r}" y1="${y(hi)}" y2="${y(hi)}" stroke="var(--line)" stroke-dasharray="3 3"/>
    <line x1="${l}" x2="${W - r}" y1="${y(lo)}" y2="${y(lo)}" stroke="var(--line)" stroke-dasharray="3 3"/>
    <text x="${l - 6}" y="${y(hi) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmt(hi)}</text>
    <text x="${l - 6}" y="${y(lo) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmt(lo)}</text>
    <path d="M${x(0)},${H - b} L${pts.join(' L')} L${x(P.length - 1)},${H - b} Z" fill="var(--accent)" fill-opacity=".12"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(P.length - 1)}" cy="${y(fim.carga)}" r="4.5" fill="var(--accent)"/>
    <text x="${l}" y="${H - 5}" font-size="11" fill="var(--muted)">${dataCurta(P[0].data)}</text>
    <text x="${W - r}" y="${H - 5}" text-anchor="end" font-size="11" fill="var(--muted)">${dataCurta(fim.data)} · ${fmt(fim.carga)} ${esc(unidade)}</text>
  </svg>`;
}
$('e-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const e = exAtual(), v = e.variacoes[e.ativo];
  const carga = num($('e-carga').value), reps = parseInt($('e-reps').value, 10);
  if (!isFinite(carga) || carga < 0) { toast('Informe a carga'); $('e-carga').focus(); return; }
  if (!(reps >= 0)) { toast('Informe as reps'); $('e-reps').focus(); return; }
  const h = hoje(), r = db.registros.find(x => x.variacao === v.id && x.data === h);
  if (r) { r.carga = carga; r.reps = reps; } else db.registros.push({ variacao: v.id, data: h, carga, reps });
  delete rascunho[v.id]; salvarSessao();
  gravar(); toast(r ? 'Registro de hoje atualizado' : `Salvo: ${fmt(carga)} ${v.unidade} × ${reps}`);
  telas.exercicio();
});
function passo(campo, dir) {
  const e = exAtual(), inp = $(campo === 'carga' ? 'e-carga' : 'e-reps');
  const d = campo === 'reps' ? 1 : e.variacoes[e.ativo].unidade === 'kg' ? 2.5 : 1;
  let n = num(inp.value); if (!isFinite(n)) n = 0;
  n = Math.max(0, Math.round((n + dir * d) * 100) / 100);
  inp.value = campo === 'carga' ? String(n).replace('.', ',') : n;
  guardarRascunho();
}
function guardarRascunho() {
  const e = exAtual(); if (!e) return;
  rascunho[e.variacoes[e.ativo].id] = { carga: $('e-carga').value, reps: $('e-reps').value };
  salvarSessao(); pintarDescanso(e);
}
$('e-carga').addEventListener('input', guardarRascunho);
$('e-reps').addEventListener('input', guardarRascunho);
function trocarExercicio(dir) {
  const n = db.exercicios.length, i = db.exercicios.findIndex(e => e.id === atual);
  atual = db.exercicios[(i + dir + n) % n].id;
  telas.exercicio(); salvarSessao(); tick(); window.scrollTo(0, 0);
  store.set('carga.arrastou', '1'); $('e-dica').hidden = true;
}

// Arrastar para o lado = próximo / anterior (escuta a tela inteira, inclusive as bordas)
(() => {
  const tela = $('v-exercicio'), semMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let x0 = 0, y0 = 0, t0 = 0, ativo = false, eixo = null, pendente = null;
  const soltar = () => { tela.classList.add('slide'); tela.style.transform = ''; tela.style.opacity = ''; };
  const concluir = () => {     // novo toque durante a animação: termina a troca na hora
    if (!pendente) return;
    clearTimeout(pendente.t); const d = pendente.dir; pendente = null;
    trocarExercicio(d); tela.classList.remove('slide'); tela.style.transform = ''; tela.style.opacity = '';
  };
  document.addEventListener('touchstart', ev => {
    ativo = false;
    if (tela.hidden || !db) return;
    concluir();
    if (ev.touches.length !== 1 || ev.target.closest('input,textarea,select,.segs,#mini')) return;
    ativo = true; x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; t0 = Date.now(); eixo = null; tela.classList.remove('slide');
  }, { passive: true });
  document.addEventListener('touchmove', ev => {
    if (!ativo) return;
    const dx = ev.touches[0].clientX - x0, dy = ev.touches[0].clientY - y0;
    if (!eixo && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) eixo = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
    if (eixo === 'x' && !semMovimento) { tela.style.transform = `translateX(${dx * .5}px)`; tela.style.opacity = String(1 - Math.min(Math.abs(dx) / 600, .4)); }
  }, { passive: true });
  document.addEventListener('touchend', ev => {
    if (!ativo) return; ativo = false;
    const dx = ev.changedTouches[0].clientX - x0, rapido = Date.now() - t0 < 300;
    const trocar = eixo === 'x' && (Math.abs(dx) > 80 || (rapido && Math.abs(dx) > 40)), dir = dx < 0 ? 1 : -1;
    if (!trocar || semMovimento) { soltar(); if (trocar) trocarExercicio(dir); return; }
    tela.classList.add('slide'); tela.style.transform = `translateX(${-dir * 40}%)`; tela.style.opacity = '0';
    pendente = { dir, t: setTimeout(() => {
      pendente = null; trocarExercicio(dir);
      tela.classList.remove('slide'); tela.style.transform = `translateX(${dir * 30}%)`;
      requestAnimationFrame(() => requestAnimationFrame(soltar));
    }, 170) };
  });
  document.addEventListener('touchcancel', () => { if (ativo) { ativo = false; soltar(); } });
  $('e-dicas').open = store.get('carga.dicas') !== 'fechado';
  $('e-dicas').addEventListener('toggle', () => store.set('carga.dicas', $('e-dicas').open ? 'aberto' : 'fechado'));
  if (store.get('carga.arrastou')) $('e-dica').hidden = true;
})();

// ===== Sessão do dia (fora do banco, sobrevive a fechar o app) =====
// { dia, series: {exercicioId: n}, rascunho: {variacaoId: {carga, reps}}, aquecimento: exercicioId, exercicio, fim, aberto }
const K_SESSAO = 'carga.sessao';
let rascunho = {};
function salvarSessao() {
  if (!db) return;
  store.set(K_SESSAO, JSON.stringify({ dia: T.dia, series: T.series, rascunho, aquecimento: T.aquecimento, exercicio: T.exercicio, fim: T.fim, aberto: $('v-exercicio').hidden ? null : atual }));
}
function restaurarSessao() {
  let s = null; try { s = JSON.parse(store.get(K_SESSAO)); } catch (e) {}
  const existe = id => db.exercicios.some(e => e.id === id);
  ir('inicio');
  if (!s || s.dia !== hoje()) return;
  T.dia = s.dia; T.series = s.series || {}; rascunho = s.rascunho || {}; T.aquecimento = existe(s.aquecimento) ? s.aquecimento : null;
  if (s.fim > Date.now() && existe(s.exercicio)) { T.exercicio = s.exercicio; T.fim = s.fim; manterTela(true); T.intervalo = setInterval(tick, 250); }
  if (existe(s.aberto)) { atual = s.aberto; ir('exercicio'); }
  salvarSessao(); tick();
}

// ===== Cronômetro de descanso (sem som; vibra no fim) =====
const T = { exercicio: null, fim: 0, intervalo: null, series: {}, aquecimento: null, dia: hoje() };
let telaLigada = null;
const relogio = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + pad(s % 60); };
function seriesFeitas(id) { if (T.dia !== hoje()) { T.series = {}; rascunho = {}; T.aquecimento = null; T.dia = hoje(); } return T.series[id] || 0; }
// O 1º exercício começado no dia ganha uma série de aquecimento
function temAquecimento(e) {
  seriesFeitas(e.id);
  if (T.aquecimento) return T.aquecimento === e.id;
  const h = hoje();
  return !Object.values(T.series).some(n => n > 0) && !db.registros.some(r => r.data === h);
}
async function manterTela(sim) {
  try {
    if (sim && !telaLigada && navigator.wakeLock) { telaLigada = await navigator.wakeLock.request('screen'); telaLigada.addEventListener('release', () => { telaLigada = null; }); }
    else if (!sim && telaLigada) { await telaLigada.release(); telaLigada = null; }
  } catch (e) {}
}
function iniciarDescanso(e, segundos) {
  T.exercicio = e.id; T.fim = Date.now() + segundos * 1000;
  manterTela(true); clearInterval(T.intervalo); T.intervalo = setInterval(tick, 250); salvarSessao(); tick();
}
function pararDescanso() { clearInterval(T.intervalo); T.intervalo = null; T.fim = 0; manterTela(false); salvarSessao(); tick(); }
function tick() {
  if (T.fim && Date.now() >= T.fim) {
    clearInterval(T.intervalo); T.intervalo = null; T.fim = 0; manterTela(false); salvarSessao();
    try { navigator.vibrate?.([400, 150, 400, 150, 700]); } catch (e) {}
    toast('Descanso acabou: próxima série');
  }
  const naTela = !$('v-exercicio').hidden;
  if (db && naTela && exAtual()) pintarDescanso(exAtual());
  const mostrarMini = !!(T.fim && db && !(naTela && atual === T.exercicio));
  $('mini').hidden = !mostrarMini;
  if (mostrarMini) {
    const e = db.exercicios.find(x => x.id === T.exercicio);
    $('mini-t').textContent = relogio(T.fim - Date.now());
    $('mini-n').textContent = 'Descanso' + (e ? ' · ' + e.variacoes[variacaoAtiva(e)].nome : '');
  }
}
const descansoAquecimento = e => Math.min(45, e.descanso);
function pintarDescanso(e) {
  const v = e.variacoes[e.ativo], n = seriesFeitas(e.id), rodando = !!T.fim && T.exercicio === e.id;
  const P = plano(e, v, num($('e-carga').value), temAquecimento(e)), prox = P[n];
  const txt = s => (s.carga ? fmt(s.carga) + ' ' + esc(v.unidade) : '—') + ' × ' + s.reps;
  $('t-plano').innerHTML = P.map((s, i) => `<li class="${i < n ? 'ok' : i === n ? 'cur' : ''}${s.aq ? ' aq' : ''}"><span>${s.nome}</span><b>${txt(s)}</b><span>${i < n ? '✓' : ''}</span></li>`).join('');
  $('t-relogio').textContent = relogio(rodando ? T.fim - Date.now() : (prox && prox.aq ? descansoAquecimento(e) : e.descanso) * 1000);
  $('t-relogio').classList.toggle('run', rodando);
  $('t-parado').hidden = rodando || n >= P.length;
  $('t-rodando').hidden = !rodando;
  $('t-zerar').hidden = n === 0;
  $('t-feita').textContent = prox ? `${prox.nome} feita · descansar` : '';
  $('t-nota').textContent = n >= P.length
    ? (rodando ? 'Última série feita. Salve abaixo as reps que fez nela.' : 'Pirâmide completa. Salve abaixo.')
    : !prox.carga ? 'Coloque o peso da 1ª série abaixo para calcular a pirâmide.'
    : (rodando ? 'Próxima: ' : 'Agora: ') + prox.nome.toLowerCase() + ' · ' + txt(prox).replace(/&amp;/g, '&');
}
$('t-feita').addEventListener('click', () => {
  const e = exAtual(), aq = temAquecimento(e), n = seriesFeitas(e.id);
  if (aq) T.aquecimento = e.id;
  T.series[e.id] = n + 1;
  iniciarDescanso(e, aq && n === 0 ? descansoAquecimento(e) : e.descanso);   // salva a sessão
});
$('t-menos').addEventListener('click', () => { if (T.fim) { T.fim -= 15000; salvarSessao(); tick(); } });
$('t-mais').addEventListener('click', () => { if (T.fim) { T.fim += 15000; salvarSessao(); tick(); } });
$('t-pular').addEventListener('click', pararDescanso);
$('t-zerar').addEventListener('click', () => { const e = exAtual(); T.series[e.id] = 0; if (T.exercicio === e.id) pararDescanso(); salvarSessao(); pintarDescanso(e); });
$('mini').addEventListener('click', () => { if (db && T.exercicio) { atual = T.exercicio; ir('exercicio'); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && T.fim) { manterTela(true); tick(); } });

// ===== Cliques gerais =====
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-ir],[data-voltar],[data-ex],[data-var],[data-passo],[data-apagar]');
  if (!b || !db) return;
  const d = b.dataset;
  if (d.ir) ir(d.ir);
  else if ('voltar' in d) voltar();
  else if (d.ex) { atual = d.ex; ir('exercicio'); }
  else if (d.var) { exAtual().ativo = +d.var; gravar(); telas.exercicio(); }
  else if (d.passo) passo(d.passo, +d.dir);
  else if (d.apagar) {
    if (!confirmar(b, 'Confirmar')) return;
    const e = exAtual(), vid = e.variacoes[e.ativo].id;
    db.registros = db.registros.filter(r => !(r.variacao === vid && r.data === d.apagar));
    gravar(); toast('Registro apagado'); telas.exercicio();
  }
});

// ===== Ajustes =====
let eventoInstalar = null;
telas.ajustes = async () => {
  $('a-instalar').hidden = !eventoInstalar;
  let info = `${db.registros.length} registro(s) neste aparelho.`;
  try { if (navigator.storage?.persisted) info += (await navigator.storage.persisted()) ? ' Armazenamento persistente ativo.' : ' O navegador não garantiu armazenamento persistente: faça backup de vez em quando.'; } catch (e) {}
  $('a-info').textContent = info;
};
$('a-bloquear').addEventListener('click', () => { store.del(K_CHAVE); telaBloqueio('entrar'); });
addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); eventoInstalar = ev; $('a-instalar').hidden = false; });
$('a-instalar').addEventListener('click', async () => { if (!eventoInstalar) return; eventoInstalar.prompt(); try { await eventoInstalar.userChoice; } catch (e) {} eventoInstalar = null; $('a-instalar').hidden = true; });

// Editar exercícios
function editorExercicio(e) {
  return `<fieldset class="ed" data-id="${e.id || ''}">
    <div class="ed-head"><input class="ed-grupo" value="${esc(e.grupo)}" placeholder="Grupo (ex.: Peito)" aria-label="Grupo muscular"><button type="button" class="del ed-remover">Remover</button></div>
    <div class="ed-p">
      <label>Séries<input class="ed-series" inputmode="numeric" value="${e.series ?? 3}"></label>
      <label>Reps 1ª série<input class="ed-reps" value="${esc(e.reps ?? '10–12')}"></label>
      <label>Descanso (s)<input class="ed-descanso" inputmode="numeric" value="${e.descanso ?? 75}"></label>
    </div>
    ${[0, 1, 2].map(i => { const v = (e.variacoes || [])[i] || {}; return `<div class="ed-v" data-id="${v.id || ''}">
      <span class="ed-k">${TIPOS[i]}${i === 0 ? ' (obrigatório)' : ''}</span>
      <input class="ed-nome" value="${esc(v.nome)}" placeholder="Nome do exercício" aria-label="${TIPOS[i]}: nome">
      <select class="ed-unidade" aria-label="${TIPOS[i]}: unidade"><option value="kg">kg</option><option value="nível"${v.unidade === 'nível' ? ' selected' : ''}>nível</option></select>
    </div>`; }).join('')}
  </fieldset>`;
}
telas.editar = () => { $('ed-lista').innerHTML = db.exercicios.map(editorExercicio).join(''); };
$('ed-novo').addEventListener('click', () => { $('ed-lista').insertAdjacentHTML('beforeend', editorExercicio({ grupo: '' })); $('ed-lista').lastElementChild.querySelector('.ed-grupo').focus(); });
$('ed-lista').addEventListener('click', ev => { const b = ev.target.closest('.ed-remover'); if (b && confirmar(b, 'Apagar com histórico?')) b.closest('fieldset').remove(); });
$('ed-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const exercicios = [];
  for (const f of $('ed-lista').querySelectorAll('fieldset')) {
    const variacoes = [...f.querySelectorAll('.ed-v')].map(r => ({ id: r.dataset.id, nome: r.querySelector('.ed-nome').value, unidade: r.querySelector('.ed-unidade').value }));
    if (!variacoes[0].nome.trim()) { toast('Preencha o exercício principal'); f.querySelector('.ed-nome').focus(); return; }
    const antigo = db.exercicios.find(e => e.id === f.dataset.id);
    exercicios.push({ id: f.dataset.id, grupo: f.querySelector('.ed-grupo').value, series: f.querySelector('.ed-series').value, reps: f.querySelector('.ed-reps').value, descanso: f.querySelector('.ed-descanso').value, ativo: antigo?.ativo, variacoes });
  }
  const novo = preparar({ exercicios, registros: db.registros });
  const ids = new Set(novo.exercicios.flatMap(e => e.variacoes.map(v => v.id)));
  novo.registros = novo.registros.filter(r => ids.has(r.variacao));   // remove histórico de exercício removido
  db = novo; gravar(); toast('Exercícios salvos'); voltar();
});

// Backup
$('b-baixar').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' }));
  a.download = 'carga-backup-' + hoje() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
$('b-restaurar').addEventListener('click', async ev => {
  const erro = $('b-erro'), f = $('b-arquivo').files[0]; erro.textContent = '';
  if (!f) { erro.textContent = 'Escolha o arquivo de backup.'; return; }
  let novo; try { novo = preparar(JSON.parse(await f.text())); } catch (e) { erro.textContent = 'Arquivo inválido. Use um backup gerado por este app.'; return; }
  if (!confirmar(ev.currentTarget, 'Confirmar: substituir tudo')) return;
  db = novo; gravar(); $('b-arquivo').value = ''; toast('Backup restaurado'); ir('inicio');
});

// Trocar senha
$('s-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const erro = $('s-erro'), nova = $('s-nova').value; erro.textContent = '';
  if (nova !== $('s-rep').value) { erro.textContent = 'As novas senhas não conferem.'; return; }
  try { await abrir(await derivar($('s-atual').value, sal, iter)); } catch (e) { erro.textContent = 'Senha atual incorreta.'; return; }
  sal = crypto.getRandomValues(new Uint8Array(16)); iter = ITER;
  chave = await derivar(nova, sal, iter); await gravar();
  if (store.get(K_CHAVE)) await manterChave(true);
  ev.target.reset(); toast('Senha trocada'); voltar();
});

// ===== Início do app =====
(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const bruto = store.get(K_DADOS);
  if (!bruto) return telaBloqueio('criar');
  try { const c = JSON.parse(bruto); sal = deB64(c.salt); iter = c.it || ITER; }
  catch (e) { return telaBloqueio('entrar', 'Dados corrompidos. Use “Esqueci a senha” e restaure um backup.'); }
  const k = store.get(K_CHAVE);
  if (k && window.crypto?.subtle) {
    try { chave = await crypto.subtle.importKey('raw', deB64(k), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); db = await abrir(chave); return entrou(); }
    catch (e) { store.del(K_CHAVE); }
  }
  telaBloqueio('entrar');
})();
