'use strict';
/*
  Diário de Carga — tudo roda no navegador.

  Banco (um item no localStorage, criptografado com a senha mestra):
    db = {
      exercicios: [{ id, grupo, regiao, series, reps, descanso, ativo, variacoes: [{ id, nome, unidade, passo }] }],
      registros:  [{ variacao, data, carga, reps: [n, n, n] }],  // 1 por variação por dia; carga = peso da 1ª série
      treinos:    [{ inicio, fim }],                              // horários (ms); fim = última interação
      medidas:    [{ data, peso, cintura }]                       // peso corporal (kg) e cintura (cm, opcional)
    }
  variacoes[0] = principal, [1] = substituto (máquina), [2] = halter. "ativo" = índice da variação em uso.
  "passo" = quanto o peso sobe de uma placa/halter para o próximo.
  Pontos, nível e conquistas são calculados a partir desses dados (nada extra é guardado).
*/

// ===== Configuração =====
const DIAS_FIXOS = [3, 4];   // quarta, quinta (Date.getDay)
const DIAS_EXTRA = [1];      // segunda (sugerido)
const TIPOS = ['Principal', 'Substituto', 'Halter'];
const REGIOES = ['Pernas', 'Superior'];
const PADRAO = [             // grupo, região, descanso (s), [principal, substituto, halter]
  ['Pernas · empurrar', 'Pernas', 90, ['Leg press 45°', 'Agachamento no Smith', 'Agachamento taça com halter']],
  ['Posterior de coxa', 'Pernas', 60, ['Cadeira flexora', 'Mesa flexora', 'Stiff com halteres']],
  ['Peito', 'Superior', 75, ['Supino máquina', 'Voador (peck deck)', 'Supino reto com halteres']],
  ['Costas · puxar de cima', 'Superior', 75, ['Puxada alta', 'Barra assistida (graviton)', 'Pullover com halter']],
  ['Costas · remar', 'Superior', 75, ['Remada sentada máquina', 'Remada baixa no cabo', 'Remada unilateral (serrote)']],
  ['Ombros', 'Superior', 60, ['Desenvolvimento máquina', 'Desenvolvimento no Smith', 'Desenvolvimento com halteres']]
];
const passoPadrao = (indice, unidade) => unidade === 'nível' ? 1 : indice === 2 ? 2 : 5;   // máquina 5 kg, halter 2 kg
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
const deIso = d => { const [a, m, dia] = d.split('-').map(Number); return new Date(a, m - 1, dia); };
const hoje = () => iso(new Date());
const num = s => parseFloat(String(s ?? '').replace(',', '.'));
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('pt-BR');
const virgula = n => String(n).replace('.', ',');
const intEntre = (v, min, max, padrao) => { const n = parseInt(v, 10); return n >= min && n <= max ? n : padrao; };
const vibrar = ms => { try { navigator.vibrate?.(ms); } catch (e) {} };
function dataCurta(d) { const [a, m, dia] = d.split('-'); return dia + '/' + m + (+a !== new Date().getFullYear() ? '/' + a.slice(2) : ''); }
function quando(d) {
  const t = new Date(), n = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - deIso(d)) / 864e5);
  return n === 0 ? 'hoje' : n === 1 ? 'ontem' : n > 1 && n < 7 ? 'há ' + n + ' dias' : dataCurta(d);
}
const diasDesde = d => Math.round((deIso(hoje()) - deIso(d)) / 864e5);

// ===== Pirâmide =====
// Série i = peso inicial + i × 10% (arredondado ao passo do aparelho); reps = topo − 2i
const repsMax = e => { const m = String(e.reps).match(/\d+/g); return m ? Math.max(...m.map(Number)) : 12; };
const repsSerie = (e, i) => Math.max(1, repsMax(e) - 2 * i);
const passoCarga = v => v.passo || (v.unidade === 'nível' ? 1 : 2.5);
const arred = (x, p) => Math.max(p, Math.round(x / p) * p);
function plano(e, v, inicial, comAquecimento) {
  const p = passoCarga(v), ok = isFinite(inicial) && inicial > 0, inc = ok ? arred(inicial * .1, p) : 0, s = [];
  if (comAquecimento) s.push({ nome: 'Aquecimento', carga: ok ? arred(inicial * .5, p) : null, reps: 15, aq: true });
  for (let i = 0; i < e.series; i++) s.push({ nome: 'Série ' + (i + 1), carga: ok ? Math.round((inicial + inc * i) * 100) / 100 : null, reps: repsSerie(e, i), i });
  return s;
}
// Pirâmide completa = bateu as reps de todas as séries
const completo = (r, e) => !!r && !!e && r.reps.length >= e.series && r.reps.slice(0, e.series).every((n, i) => n >= repsSerie(e, i));

// ===== Avisos (com "Desfazer") =====
let tToast, desfazerFn = null;
function toast(msg, desfazer) {
  $('toast-msg').textContent = msg; desfazerFn = desfazer || null; $('toast-desfazer').hidden = !desfazer;
  $('toast').hidden = false; clearTimeout(tToast);
  tToast = setTimeout(() => { $('toast').hidden = true; desfazerFn = null; }, desfazer ? 6000 : 2600);
}
$('toast-desfazer').addEventListener('click', () => { const f = desfazerFn; desfazerFn = null; $('toast').hidden = true; f?.(); });
function confirmar(btn, texto) {   // 1º toque arma, 2º confirma
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
// Executa uma mudança, grava e devolve a função que desfaz
function alterar(acao) {
  const antes = JSON.stringify(db);
  acao(); gravar();
  return () => { db = JSON.parse(antes); gravar(); mostrar(pilha[pilha.length - 1]); toast('Desfeito'); };
}

function bancoNovo() {
  return {
    exercicios: PADRAO.map(([grupo, regiao, descanso, nomes]) => ({ grupo, regiao, series: 3, reps: '10–12', descanso, variacoes: nomes.map(nome => ({ nome })) })),
    registros: [], treinos: [], medidas: []
  };
}
function variacaoAtiva(e) { if (e.variacoes[e.ativo]?.nome) return e.ativo; const i = e.variacoes.findIndex(v => v.nome); return i < 0 ? 0 : i; }
function preparar(d) {           // valida, completa campos e migra formatos antigos
  if (d && d.slots) d = {
    exercicios: d.slots.map(s => ({ id: s.id, grupo: s.g, series: s.sets, reps: s.reps, descanso: s.rest, ativo: s.a, variacoes: (s.vs || []).map(v => ({ id: v.id, nome: v.pt, unidade: v.u })) })),
    registros: (d.logs || []).map(l => ({ variacao: l.v, data: l.d, carga: l.w, reps: l.r }))
  };
  if (!d || !Array.isArray(d.exercicios) || !Array.isArray(d.registros)) throw new Error('formato');
  const exercicios = d.exercicios.map((e, i) => {
    const vs = (e.variacoes || []).slice(0, 3).map((v, j) => {
      const unidade = v.unidade === 'nível' ? 'nível' : 'kg', p = num(v.passo);
      return { id: v.id || novoId(), nome: String(v.nome || '').trim(), unidade, passo: p > 0 && p <= 50 ? p : passoPadrao(j, unidade) };
    });
    while (vs.length < 3) vs.push({ id: novoId(), nome: '', unidade: 'kg', passo: passoPadrao(vs.length, 'kg') });
    const grupo = String(e.grupo || vs[0].nome);
    const regiao = REGIOES.includes(e.regiao) ? e.regiao : /perna|coxa|gl[uú]t|panturr|agach|leg/i.test(grupo + ' ' + vs[0].nome) ? 'Pernas' : 'Superior';
    const ex = { id: e.id || novoId(), grupo, regiao, series: intEntre(e.series, 1, 10, 3), reps: String(e.reps || '').trim() || '10–12', descanso: intEntre(e.descanso, 10, 600, PADRAO[i]?.[2] || 75), ativo: e.ativo || 0, variacoes: vs };
    ex.ativo = variacaoAtiva(ex);
    return ex;
  });
  const seriesDe = new Map(); exercicios.forEach(e => e.variacoes.forEach(v => seriesDe.set(v.id, e.series)));
  const registros = d.registros
    .filter(r => r && r.variacao && /^\d{4}-\d{2}-\d{2}$/.test(r.data) && isFinite(r.carga))
    .map(r => ({
      variacao: r.variacao, data: r.data, carga: +r.carga,
      // formato antigo tinha um número só (reps da série mais fraca/última): vale para todas as séries
      reps: (Array.isArray(r.reps) ? r.reps : Array(seriesDe.get(r.variacao) || 3).fill(r.reps)).map(n => Math.max(0, parseInt(n, 10) || 0))
    }));
  const treinos = (d.treinos || []).filter(t => t && t.inicio > 0 && t.fim >= t.inicio).map(t => ({ inicio: +t.inicio, fim: +t.fim }));
  const medidas = (d.medidas || []).filter(m => m && /^\d{4}-\d{2}-\d{2}$/.test(m.data) && num(m.peso) > 0)
    .map(m => ({ data: m.data, peso: num(m.peso), cintura: num(m.cintura) > 0 ? num(m.cintura) : null }));
  return { exercicios, registros, treinos, medidas };
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
      chave = await derivar(senha, sal, iter); db = preparar(bancoNovo()); await gravar();
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

// ===== Pontos, nível e conquistas (calculados dos dados) =====
const PONTOS = [['treino', 50, 'por dia de treino'], ['exercicio', 10, 'por exercício salvo'], ['piramide', 10, 'por pirâmide completa'],
  ['recorde', 25, 'por recorde de peso inicial'], ['extra', 20, 'por treino extra na segunda'], ['pesagem', 10, 'por pesagem semanal']];
const PTS_NIVEL = 300;
const semanaDe = d => { const x = deIso(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };
const somaDias = (d, n) => { const x = deIso(d); x.setDate(x.getDate() + n); return iso(x); };
function estatisticas() {
  const exDe = new Map(); db.exercicios.forEach(e => e.variacoes.forEach(v => exDe.set(v.id, e)));
  const dias = new Set(db.registros.map(r => r.data)), melhor = {};
  const s = { treino: dias.size, exercicio: db.registros.length, piramide: 0, recorde: 0, extra: 0, pesagem: 0, perda: 0, rapido: false };
  for (const r of [...db.registros].sort((a, b) => a.data.localeCompare(b.data))) {
    if (r.variacao in melhor && r.carga > melhor[r.variacao]) s.recorde++;
    melhor[r.variacao] = Math.max(melhor[r.variacao] ?? -Infinity, r.carga);
    if (completo(r, exDe.get(r.variacao))) s.piramide++;
  }
  s.extra = [...dias].filter(d => DIAS_EXTRA.includes(deIso(d).getDay())).length;
  const porSemana = {}; dias.forEach(d => { const w = semanaDe(d); porSemana[w] = (porSemana[w] || 0) + 1; });
  s.semanasMeta = Object.values(porSemana).filter(n => n >= 2).length;
  s.semanasCheias = Object.values(porSemana).filter(n => n >= 3).length;
  // sequência: semanas seguidas com 2+ treinos (a semana atual só conta quando bate a meta)
  let w = semanaDe(hoje()); if ((porSemana[w] || 0) < 2) w = somaDias(w, -7);
  s.sequencia = 0; while ((porSemana[w] || 0) >= 2) { s.sequencia++; w = somaDias(w, -7); }
  s.melhorSequencia = 0; let corrida = 0;
  const semanas = Object.keys(porSemana).sort();
  if (semanas.length) for (let x = semanas[0]; x <= semanaDe(hoje()); x = somaDias(x, 7)) { corrida = (porSemana[x] || 0) >= 2 ? corrida + 1 : 0; s.melhorSequencia = Math.max(s.melhorSequencia, corrida); }
  s.pesagem = new Set(db.medidas.map(m => semanaDe(m.data))).size;
  const ms = [...db.medidas].sort((a, b) => a.data.localeCompare(b.data));
  if (ms.length > 1) s.perda = Math.round((ms[0].peso - ms[ms.length - 1].peso) * 10) / 10;
  s.rapido = db.treinos.some(t => { const min = (t.fim - t.inicio) / 6e4, d = iso(new Date(t.inicio)); return min >= 15 && min <= 45 && db.registros.filter(r => r.data === d).length >= 4; });
  s.pontos = PONTOS.reduce((soma, [k, p]) => soma + s[k] * p, 0);
  s.nivel = Math.floor(s.pontos / PTS_NIVEL) + 1;
  s.progresso = (s.pontos % PTS_NIVEL) / PTS_NIVEL;
  return s;
}
const CONQUISTAS = [
  ['Primeiro treino', 'Salve o 1º exercício', s => s.treino >= 1],
  ['Semana batida', '2 treinos na mesma semana', s => s.semanasMeta >= 1],
  ['Semana cheia', '3 treinos na mesma semana (com o extra)', s => s.semanasCheias >= 1],
  ['Pirâmide perfeita', 'Bata todas as reps de uma pirâmide', s => s.piramide >= 1],
  ['Primeiro recorde', 'Suba o peso inicial de um exercício', s => s.recorde >= 1],
  ['Na balança', '4 pesagens em semanas diferentes', s => s.pesagem >= 4],
  ['Rápido e completo', 'Treino de até 45 min com 4+ exercícios', s => s.rapido],
  ['4 semanas seguidas', 'Meta de 2 treinos por 4 semanas seguidas', s => s.melhorSequencia >= 4],
  ['10 treinos', '10 dias de treino', s => s.treino >= 10],
  ['−2 kg', 'Perca 2 kg desde a 1ª pesagem', s => s.perda >= 2],
  ['10 recordes', '10 recordes de peso inicial', s => s.recorde >= 10],
  ['20 pirâmides perfeitas', 'Bata todas as reps em 20 pirâmides', s => s.piramide >= 20],
  ['8 semanas seguidas', 'Meta de 2 treinos por 8 semanas seguidas', s => s.melhorSequencia >= 8],
  ['25 treinos', '25 dias de treino', s => s.treino >= 25],
  ['−5 kg', 'Perca 5 kg desde a 1ª pesagem', s => s.perda >= 5],
  ['50 treinos', '50 dias de treino', s => s.treino >= 50]
];
function celebrar(antes) {   // mensagens do que mudou depois de uma ação
  const depois = estatisticas(), msgs = [];
  if (depois.recorde > antes.recorde) msgs.push('Recorde! +25 pts');
  if (depois.nivel > antes.nivel) msgs.push('Nível ' + depois.nivel + '!');
  CONQUISTAS.forEach(([nome, , f]) => { if (f(depois) && !f(antes)) msgs.push('Conquista: ' + nome); });
  if (msgs.length) vibrar([60, 80, 60]);
  return msgs;
}
function pintarJogo(s) {
  const feitas = CONQUISTAS.filter(c => c[2](s)).length;
  $('g-nivel').textContent = 'Nível ' + s.nivel;
  $('g-pts').textContent = s.pontos.toLocaleString('pt-BR') + ' pts';
  $('g-barra').style.width = s.progresso * 100 + '%';
  $('g-info').textContent = `Sequência: ${s.sequencia} ${s.sequencia === 1 ? 'semana' : 'semanas'} · ${s.recorde} recordes · ${feitas}/${CONQUISTAS.length} conquistas`;
}
telas.conquistas = () => {
  const s = estatisticas();
  $('q-resumo').innerHTML = `<div class="q-top"><b>Nível ${s.nivel}</b><span>${s.pontos.toLocaleString('pt-BR')} pts · faltam ${PTS_NIVEL - (s.pontos % PTS_NIVEL)} para o nível ${s.nivel + 1}</span></div>
    <div class="track"><span style="width:${s.progresso * 100}%"></span></div>
    <p class="small muted">Sequência atual: <b>${s.sequencia}</b> · melhor: <b>${s.melhorSequencia}</b> semanas com 2+ treinos · ${s.recorde} recordes · ${s.piramide} pirâmides completas</p>`;
  $('q-lista').innerHTML = CONQUISTAS.map(([nome, desc, f]) => `<li class="${f(s) ? 'on' : ''}"><span class="q-ico" aria-hidden="true">${f(s) ? '★' : '☆'}</span><span><b>${nome}</b><small>${desc}</small></span></li>`).join('');
  $('q-pontos').innerHTML = PONTOS.map(([, p, txt]) => `<li><b>+${p}</b> ${txt}</li>`).join('');
};

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
      <span class="chips">${feito ? '<span class="chip ok">✓ Feito hoje</span>' : ''}${completo(u, e) ? '<span class="chip warn">Subir carga</span>' : ''}</span></span>
      <span class="slot-load">${u ? `<span class="w">${fmt(u.carga)}<small>${esc(v.unidade)}</small></span><span class="r">${u.reps.join('/')} · ${quando(u.data)}</span>` : '<span class="r">sem registro</span>'}</span>
    </button></li>`;
  }).join('');
  $('i-cont').textContent = feitos + '/' + db.exercicios.length;
  $('i-barra').style.width = (db.exercicios.length ? feitos / db.exercicios.length * 100 : 0) + '%';
  const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('i-data').textContent = d[0].toUpperCase() + d.slice(1);
  semana(); pintarTempo(); pintarJogo(estatisticas()); pintarCorpoInicio();
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

// ===== Gráfico de linha (carga ou peso corporal) =====
function grafico(box, P, unidade, rotulo) {   // P = [{ data, valor }] em ordem cronológica
  if (P.length < 2) { box.innerHTML = '<p>O gráfico aparece a partir do 2º registro.</p>'; return; }
  const W = 320, H = 120, l = 40, r = 12, t = 12, b = 22;
  let lo = Math.min(...P.map(p => p.valor)), hi = Math.max(...P.map(p => p.valor));
  if (lo === hi) { lo -= 1; hi += 1; }
  const x = i => l + i * (W - l - r) / (P.length - 1), y = c => t + (hi - c) * (H - t - b) / (hi - lo);
  const pts = P.map((p, i) => x(i).toFixed(1) + ',' + y(p.valor).toFixed(1)), fim = P[P.length - 1];
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${rotulo}">
    <line x1="${l}" x2="${W - r}" y1="${y(hi)}" y2="${y(hi)}" stroke="var(--line)" stroke-dasharray="3 3"/>
    <line x1="${l}" x2="${W - r}" y1="${y(lo)}" y2="${y(lo)}" stroke="var(--line)" stroke-dasharray="3 3"/>
    <text x="${l - 6}" y="${y(hi) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmt(hi)}</text>
    <text x="${l - 6}" y="${y(lo) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmt(lo)}</text>
    <path d="M${x(0)},${H - b} L${pts.join(' L')} L${x(P.length - 1)},${H - b} Z" fill="var(--accent)" fill-opacity=".12"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(P.length - 1)}" cy="${y(fim.valor)}" r="4.5" fill="var(--accent)"/>
    <text x="${l}" y="${H - 5}" font-size="11" fill="var(--muted)">${dataCurta(P[0].data)}</text>
    <text x="${W - r}" y="${H - 5}" text-anchor="end" font-size="11" fill="var(--muted)">${dataCurta(fim.data)} · ${fmt(fim.valor)} ${esc(unidade)}</text>
  </svg>`;
}

// ===== Exercício =====
let atual = null;   // id do exercício aberto
const exAtual = () => db.exercicios.find(e => e.id === atual);
telas.exercicio = () => {
  const e = exAtual(); if (!e) { voltar(); return; }
  e.ativo = variacaoAtiva(e);
  const v = e.variacoes[e.ativo], pos = db.exercicios.indexOf(e), u = ultimo(v.id);
  $('e-pos').textContent = (pos + 1) + '/' + db.exercicios.length;
  pintarTempo();
  $('e-pontos').innerHTML = db.exercicios.map((_, i) => `<i${i === pos ? ' class="on"' : ''}></i>`).join('');
  $('e-grupo').textContent = e.grupo;
  $('e-variacoes').innerHTML = e.variacoes.map((x, i) => x.nome ? `<button type="button" class="seg" role="radio" aria-checked="${i === e.ativo}" data-var="${i}"><span class="seg-k">${TIPOS[i]}</span><span class="seg-n">${esc(x.nome)}</span></button>` : '').join('');
  $('e-variacoes').hidden = e.variacoes.filter(x => x.nome).length < 2;
  $('e-nome').textContent = v.nome;
  $('e-presc').innerHTML = `<b>Pirâmide ${Array.from({ length: e.series }, (_, i) => repsSerie(e, i)).join(' → ')} reps</b> · descanso ${e.descanso} s`;
  $('e-youtube').href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent((v.nome + ' execução correta').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim());
  $('e-ultima').innerHTML = u
    ? `<span>Última: <b>${fmt(u.carga)} ${esc(v.unidade)}</b> · ${u.reps.join('/')} reps · ${quando(u.data)}</span>${completo(u, e) ? '<span class="chip warn">Completou: suba o peso inicial</span>' : ''}`
    : '<span class="muted">Primeiro registro desta variação. Comece leve.</span>';
  $('e-unidade').textContent = v.unidade;
  $('e-passo').textContent = `passo de ${fmt(passoCarga(v))} ${v.unidade}`;
  const rs = rascunho[v.id];   // valor digitado e ainda não salvo tem prioridade
  $('e-carga').value = rs ? rs.carga : u ? virgula(u.carga) : '';
  pintarDescanso(e);
  const lista = db.registros.filter(r => r.variacao === v.id).sort((a, b) => b.data.localeCompare(a.data));
  $('e-historico').innerHTML = lista.length
    ? lista.map(r => `<li><span class="h-d">${dataCurta(r.data)}</span><span class="h-v">${fmt(r.carga)} ${esc(v.unidade)} · ${r.reps.join('/')}</span><button type="button" class="del" data-apagar="${r.data}">Apagar</button></li>`).join('')
    : '<li class="empty">Nenhum registro ainda.</li>';
  grafico($('e-grafico'), lista.slice(0, 12).reverse().map(r => ({ data: r.data, valor: r.carga })), v.unidade, 'Evolução do peso inicial');
};
$('e-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const e = exAtual(), v = e.variacoes[e.ativo], carga = num($('e-carga').value), k = seriesDeTrabalho(e);
  if (!isFinite(carga) || carga <= 0) { toast('Informe o peso da 1ª série'); $('e-carga').focus(); return; }
  if (!k) { toast('Marque na pirâmide as séries que você fez'); return; }
  const reps = Array.from({ length: k }, (_, i) => (T.reps[e.id] || [])[i] ?? repsSerie(e, i));
  const h = hoje(), antes = estatisticas();
  let existia = false;
  const desfazer = alterar(() => {
    const r = db.registros.find(x => x.variacao === v.id && x.data === h); existia = !!r;
    if (r) { r.carga = carga; r.reps = reps; } else db.registros.push({ variacao: v.id, data: h, carga, reps });
  });
  delete rascunho[v.id]; salvarSessao(); marcarAtividade(); vibrar(40);
  toast([existia ? 'Registro de hoje atualizado' : `Salvo: ${fmt(carga)} ${v.unidade} · ${reps.join('/')}`, ...celebrar(antes)].join(' · '), desfazer);
  telas.exercicio();
});
const CAMPOS = { carga: 'e-carga', peso: 'c-peso', cintura: 'c-cintura' };
function passo(campo, dir) {
  const inp = $(CAMPOS[campo]), e = campo === 'carga' ? exAtual() : null;
  const d = campo === 'peso' ? .1 : campo === 'cintura' ? .5 : passoCarga(e.variacoes[e.ativo]);
  let n = num(inp.value); if (!isFinite(n)) n = 0;
  inp.value = virgula(Math.max(0, Math.round((n + dir * d) * 100) / 100));
  if (campo === 'carga') guardarRascunho();
}
function guardarRascunho() {
  const e = exAtual(); if (!e) return;
  rascunho[e.variacoes[e.ativo].id] = { carga: $('e-carga').value };
  salvarSessao(); pintarDescanso(e); marcarAtividade();
}
$('e-carga').addEventListener('input', guardarRascunho);

// ===== Peso corporal =====
const medidasOrdenadas = () => [...db.medidas].sort((a, b) => b.data.localeCompare(a.data));
function pintarCorpoInicio() {
  const L = medidasOrdenadas(), u = L[0], prim = L[L.length - 1], box = $('i-corpo');
  const atrasado = !u || diasDesde(u.data) >= 7;
  box.classList.toggle('on', atrasado);
  if (!u) { box.innerHTML = '<span>Peso corporal</span><b>Registrar 1ª pesagem ›</b>'; return; }
  const dif = Math.round((u.peso - prim.peso) * 10) / 10;
  box.innerHTML = `<span>Peso corporal · ${quando(u.data)}${atrasado ? ' · <em>hora de se pesar</em>' : ''}</span>
    <b>${fmt(u.peso)} kg</b><small>${L.length > 1 ? (dif > 0 ? '+' : '') + fmt(dif) + ' kg desde ' + dataCurta(prim.data) : 'primeira pesagem'}</small>`;
}
telas.corpo = () => {
  const L = medidasOrdenadas(), u = L[0];
  $('c-peso').value = u ? virgula(u.peso) : '';
  $('c-cintura').value = u?.cintura ? virgula(u.cintura) : '';
  $('c-historico').innerHTML = L.length
    ? L.map(m => `<li><span class="h-d">${dataCurta(m.data)}</span><span class="h-v">${fmt(m.peso)} kg${m.cintura ? ' · cintura ' + fmt(m.cintura) + ' cm' : ''}</span><button type="button" class="del" data-apagar-medida="${m.data}">Apagar</button></li>`).join('')
    : '<li class="empty">Nenhuma pesagem ainda.</li>';
  grafico($('c-grafico'), L.slice(0, 16).reverse().map(m => ({ data: m.data, valor: m.peso })), 'kg', 'Evolução do peso corporal');
};
$('c-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const peso = num($('c-peso').value), cintura = num($('c-cintura').value);
  if (!(peso >= 30 && peso <= 300)) { toast('Informe o peso em kg'); $('c-peso').focus(); return; }
  const h = hoje(), antes = estatisticas();
  const desfazer = alterar(() => {
    db.medidas = db.medidas.filter(m => m.data !== h);
    db.medidas.push({ data: h, peso, cintura: cintura > 0 ? cintura : null });
  });
  vibrar(40);
  toast(['Pesagem salva: ' + fmt(peso) + ' kg', ...celebrar(antes)].join(' · '), desfazer);
  telas.corpo();
});

// ===== Tempo de treino =====
// Começa no 1º toque dentro de um exercício. 30 min sem mexer = treino encerrado na última interação.
const INATIVO = 30 * 60 * 1000;
const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const duracao = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min'; };
const ultimoTreino = () => db.treinos[db.treinos.length - 1];
const emAndamento = t => !!t && Date.now() - t.fim <= INATIVO;
function marcarAtividade() {
  if (!db) return;
  const agora = Date.now(), t = ultimoTreino();
  if (emAndamento(t)) t.fim = agora; else db.treinos.push({ inicio: agora, fim: agora });
  gravar(); pintarTempo();
}
function pintarTempo() {
  if (!db) return;
  const t = ultimoTreino(), ativo = emAndamento(t), box = $('i-treino');
  $('e-tempo').textContent = ativo ? '⏱ ' + duracao(Date.now() - t.inicio) : '';
  box.classList.toggle('on', ativo);
  box.innerHTML = !t ? '<span class="muted">O tempo do treino começa no 1º toque dentro de um exercício.</span>'
    : ativo ? `<span>Treino em andamento desde ${hhmm(t.inicio)}</span><b>${duracao(Date.now() - t.inicio)}</b>`
    : `<span>Último treino: ${quando(iso(new Date(t.inicio)))}, ${hhmm(t.inicio)}–${hhmm(t.fim)}</span><b>${duracao(t.fim - t.inicio)}</b>`;
  const fechados = (ativo ? db.treinos.slice(0, -1) : db.treinos).slice(-5).reverse();
  $('i-hist-box').hidden = !fechados.length;
  $('i-treinos').innerHTML = fechados.map(x => { const d = new Date(x.inicio); return `<li><span class="h-d">${NOME_DIA[d.getDay()]} ${dataCurta(iso(d))}</span><span class="h-d">${hhmm(x.inicio)}–${hhmm(x.fim)}</span><span class="h-v">${duracao(x.fim - x.inicio)}</span></li>`; }).join('');
}
setInterval(pintarTempo, 15000);

// ===== Arrastar para o lado = próximo / anterior (sem dar a volta) =====
function podeTrocar(dir) { const j = db.exercicios.findIndex(e => e.id === atual) + dir; return j >= 0 && j < db.exercicios.length; }
function trocarExercicio(dir) {
  if (!podeTrocar(dir)) return;
  atual = db.exercicios[db.exercicios.findIndex(e => e.id === atual) + dir].id;
  telas.exercicio(); salvarSessao(); marcarAtividade(); tick(); window.scrollTo(0, 0);
  store.set('carga.arrastou', '1'); $('e-dica').hidden = true;
}
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
    if (ev.touches.length !== 1 || ev.target.closest('input,textarea,select,.segs,#mini,#toast')) return;
    ativo = true; x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; t0 = Date.now(); eixo = null; tela.classList.remove('slide');
  }, { passive: true });
  document.addEventListener('touchmove', ev => {
    if (!ativo) return;
    const dx = ev.touches[0].clientX - x0, dy = ev.touches[0].clientY - y0;
    if (!eixo && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) eixo = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
    if (eixo === 'x' && !semMovimento) { tela.style.transform = `translateX(${dx * (podeTrocar(dx < 0 ? 1 : -1) ? .5 : .15)}px)`; tela.style.opacity = String(1 - Math.min(Math.abs(dx) / 600, .4)); }
  }, { passive: true });
  document.addEventListener('touchend', ev => {
    if (!ativo) return; ativo = false;
    const dx = ev.changedTouches[0].clientX - x0, rapido = Date.now() - t0 < 300;
    const dir = dx < 0 ? 1 : -1, trocar = eixo === 'x' && (Math.abs(dx) > 80 || (rapido && Math.abs(dx) > 40)) && podeTrocar(dir);
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
// { dia, series: {exercicioId: n}, reps: {exercicioId: [reps por série]}, rascunho: {variacaoId: {carga}},
//   aquecimento: {regiao: exercicioId}, exercicio, fim, aberto }
const K_SESSAO = 'carga.sessao';
let rascunho = {};
function salvarSessao() {
  if (!db) return;
  store.set(K_SESSAO, JSON.stringify({ dia: T.dia, series: T.series, reps: T.reps, rascunho, aquecimento: T.aquecimento, exercicio: T.exercicio, fim: T.fim, aberto: $('v-exercicio').hidden ? null : atual }));
}
function restaurarSessao() {
  let s = null; try { s = JSON.parse(store.get(K_SESSAO)); } catch (e) {}
  const existe = id => db.exercicios.some(e => e.id === id);
  ir('inicio');
  if (!s || s.dia !== hoje()) return;
  T.dia = s.dia; T.series = s.series || {}; T.reps = s.reps || {}; rascunho = s.rascunho || {};
  T.aquecimento = {};
  if (s.aquecimento && typeof s.aquecimento === 'object') for (const [r, id] of Object.entries(s.aquecimento)) if (existe(id)) T.aquecimento[r] = id;
  if (s.fim > Date.now() && existe(s.exercicio)) { T.exercicio = s.exercicio; T.fim = s.fim; manterTela(true); T.intervalo = setInterval(tick, 250); }
  if (existe(s.aberto)) { atual = s.aberto; ir('exercicio'); }
  salvarSessao(); tick();
}

// ===== Séries, aquecimento e cronômetro de descanso (sem som; vibra) =====
const T = { exercicio: null, fim: 0, intervalo: null, series: {}, reps: {}, aquecimento: {}, dia: hoje() };
let telaLigada = null;
const relogio = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + pad(s % 60); };
function seriesFeitas(id) { if (T.dia !== hoje()) { T.series = {}; T.reps = {}; rascunho = {}; T.aquecimento = {}; T.dia = hoje(); } return T.series[id] || 0; }
// O 1º exercício começado de cada região (pernas / superior) ganha uma série de aquecimento
function temAquecimento(e) {
  seriesFeitas(e.id);
  if (T.aquecimento[e.regiao]) return T.aquecimento[e.regiao] === e.id;
  const h = hoje();
  return !db.exercicios.some(x => x.regiao === e.regiao && ((T.series[x.id] || 0) > 0 || x.variacoes.some(v => db.registros.some(r => r.variacao === v.id && r.data === h))));
}
const seriesDeTrabalho = e => Math.max(0, seriesFeitas(e.id) - (T.aquecimento[e.regiao] === e.id ? 1 : 0));
const descansoAquecimento = e => Math.min(45, e.descanso);
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
  let acabou = false;
  if (T.fim && Date.now() >= T.fim) {
    clearInterval(T.intervalo); T.intervalo = null; T.fim = 0; manterTela(false); salvarSessao(); acabou = true;
    vibrar([400, 150, 400, 150, 700]); toast('Descanso acabou: próxima série');
  }
  const naTela = !$('v-exercicio').hidden;
  if (db && naTela && exAtual()) acabou ? pintarDescanso(exAtual()) : pintarRelogio(exAtual());   // a lista só é redesenhada quando muda
  const mostrarMini = !!(T.fim && db && !(naTela && atual === T.exercicio));
  $('mini').hidden = !mostrarMini;
  if (mostrarMini) {
    const e = db.exercicios.find(x => x.id === T.exercicio);
    $('mini-t').textContent = relogio(T.fim - Date.now());
    $('mini-n').textContent = 'Descanso' + (e ? ' · ' + e.variacoes[variacaoAtiva(e)].nome : '');
  }
}
function planoAtual(e) { return plano(e, e.variacoes[e.ativo], num($('e-carga').value), temAquecimento(e)); }
const pesoTxt = (s, v) => s.carga ? fmt(s.carga) + ' ' + v.unidade : '—';
function pintarDescanso(e) {
  const v = e.variacoes[e.ativo], n = seriesFeitas(e.id), P = planoAtual(e), feitas = T.reps[e.id] || [];
  $('t-plano').innerHTML = P.map((s, k) => {
    const feito = k < n, classe = feito ? 'ok' : k === n ? 'cur' : '';
    if (s.aq) return `<li class="aq ${classe}"><span>${s.nome}</span><b>${esc(pesoTxt(s, v))} × ${s.reps}</b><span class="adj">${feito ? '✓' : ''}</span></li>`;
    const real = feitas[s.i] ?? s.reps;
    return `<li class="${classe}${feito && real < s.reps ? ' baixo' : ''}"><span>${s.nome}</span><b>${esc(pesoTxt(s, v))} × ${feito ? real : s.reps}</b><span class="adj">${feito
      ? `<button type="button" data-rep="${s.i}" data-d="-1" aria-label="${s.nome}: uma rep a menos">−</button><button type="button" data-rep="${s.i}" data-d="1" aria-label="${s.nome}: uma rep a mais">+</button>` : ''}</span></li>`;
  }).join('');
  $('t-zerar').hidden = n === 0;
  pintarRelogio(e, P);
}
function pintarRelogio(e, P = planoAtual(e)) {
  const v = e.variacoes[e.ativo], n = seriesFeitas(e.id), rodando = !!T.fim && T.exercicio === e.id, prox = P[n];
  $('t-relogio').textContent = relogio(rodando ? T.fim - Date.now() : (prox && prox.aq ? descansoAquecimento(e) : e.descanso) * 1000);
  $('t-relogio').classList.toggle('run', rodando);
  $('t-parado').hidden = rodando || n >= P.length;
  $('t-rodando').hidden = !rodando;
  $('t-feita').textContent = prox ? `${prox.nome} feita · descansar` : '';
  $('t-nota').textContent = n >= P.length ? 'Pirâmide feita. Não completou alguma série? Ajuste as reps com − e + e salve.'
    : !prox.carga ? 'Coloque o peso da 1ª série acima para calcular a pirâmide.'
    : (rodando ? 'Próxima: ' : 'Agora: ') + prox.nome.toLowerCase() + ' · ' + pesoTxt(prox, v) + ' × ' + prox.reps;
}
$('t-feita').addEventListener('click', () => {
  const e = exAtual(), aq = temAquecimento(e), n = seriesFeitas(e.id), ehAquecimento = aq && n === 0;
  if (aq) T.aquecimento[e.regiao] = e.id;
  T.series[e.id] = n + 1;
  if (!ehAquecimento) { const i = n - (aq ? 1 : 0); (T.reps[e.id] ||= [])[i] = repsSerie(e, i); }
  vibrar(40);
  iniciarDescanso(e, ehAquecimento ? descansoAquecimento(e) : e.descanso);   // salva a sessão
  pintarDescanso(e); marcarAtividade();
});
$('t-menos').addEventListener('click', () => { if (T.fim) { T.fim -= 15000; salvarSessao(); tick(); } marcarAtividade(); });
$('t-mais').addEventListener('click', () => { if (T.fim) { T.fim += 15000; salvarSessao(); tick(); } marcarAtividade(); });
$('t-pular').addEventListener('click', () => { pararDescanso(); marcarAtividade(); });
$('t-zerar').addEventListener('click', () => { const e = exAtual(); T.series[e.id] = 0; T.reps[e.id] = []; if (T.exercicio === e.id) pararDescanso(); salvarSessao(); pintarDescanso(e); marcarAtividade(); });
$('mini').addEventListener('click', () => { if (db && T.exercicio) { atual = T.exercicio; ir('exercicio'); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; pintarTempo(); if (T.fim) { manterTela(true); tick(); } });

// ===== Cliques gerais =====
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-ir],[data-voltar],[data-ex],[data-var],[data-passo],[data-apagar],[data-apagar-medida],[data-rep]');
  if (!b || !db) return;
  const d = b.dataset;
  if (d.ir) ir(d.ir);
  else if ('voltar' in d) voltar();
  else if (d.ex) { atual = d.ex; ir('exercicio'); }
  else if (d.var) { exAtual().ativo = +d.var; telas.exercicio(); marcarAtividade(); }
  else if (d.passo) passo(d.passo, +d.dir);
  else if (d.rep !== undefined) {
    const e = exAtual(), i = +d.rep, a = (T.reps[e.id] ||= []);
    a[i] = Math.max(0, Math.min(50, (a[i] ?? repsSerie(e, i)) + +d.d));
    vibrar(15); salvarSessao(); pintarDescanso(e); marcarAtividade();
  }
  else if (d.apagar) {
    if (!confirmar(b, 'Confirmar')) return;
    const e = exAtual(), vid = e.variacoes[e.ativo].id;
    const desfazer = alterar(() => { db.registros = db.registros.filter(r => !(r.variacao === vid && r.data === d.apagar)); });
    toast('Registro apagado', desfazer); telas.exercicio();
  }
  else if (d.apagarMedida) {
    if (!confirmar(b, 'Confirmar')) return;
    const desfazer = alterar(() => { db.medidas = db.medidas.filter(m => m.data !== d.apagarMedida); });
    toast('Pesagem apagada', desfazer); telas.corpo();
  }
});

// ===== Ajustes =====
let eventoInstalar = null;
telas.ajustes = async () => {
  $('a-instalar').hidden = !eventoInstalar;
  let info = `${db.registros.length} registro(s) e ${db.medidas.length} pesagem(ns) neste aparelho.`;
  try { if (navigator.storage?.persisted) info += (await navigator.storage.persisted()) ? ' Armazenamento persistente ativo.' : ' O navegador não garantiu armazenamento persistente: faça backup de vez em quando.'; } catch (e) {}
  $('a-info').textContent = info;
};
$('a-bloquear').addEventListener('click', () => { store.del(K_CHAVE); telaBloqueio('entrar'); });
addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); eventoInstalar = ev; $('a-instalar').hidden = false; });
$('a-instalar').addEventListener('click', async () => { if (!eventoInstalar) return; eventoInstalar.prompt(); try { await eventoInstalar.userChoice; } catch (e) {} eventoInstalar = null; $('a-instalar').hidden = true; });

// Editar exercícios
function editorExercicio(e) {
  return `<fieldset class="ed" data-id="${e.id || ''}">
    <div class="ed-head"><input class="ed-grupo" value="${esc(e.grupo)}" placeholder="Grupo (ex.: Peito)" aria-label="Grupo muscular">
      <button type="button" class="ed-mover" data-mv="-1" aria-label="Subir na lista">↑</button><button type="button" class="ed-mover" data-mv="1" aria-label="Descer na lista">↓</button>
      <button type="button" class="del ed-remover">Remover</button></div>
    <div class="ed-p">
      <label>Séries<input class="ed-series" inputmode="numeric" value="${e.series ?? 3}"></label>
      <label>Reps 1ª série<input class="ed-reps" value="${esc(e.reps ?? '12')}"></label>
      <label>Descanso (s)<input class="ed-descanso" inputmode="numeric" value="${e.descanso ?? 75}"></label>
      <label>Região<select class="ed-regiao">${REGIOES.map(r => `<option${e.regiao === r ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    </div>
    ${[0, 1, 2].map(i => { const v = (e.variacoes || [])[i] || {}; return `<div class="ed-v" data-id="${v.id || ''}">
      <span class="ed-k">${TIPOS[i]}${i === 0 ? ' (obrigatório)' : ''} · nome, passo, unidade</span>
      <input class="ed-nome" value="${esc(v.nome)}" placeholder="Nome do exercício" aria-label="${TIPOS[i]}: nome">
      <input class="ed-passo" inputmode="decimal" value="${virgula(v.passo ?? passoPadrao(i, v.unidade))}" aria-label="${TIPOS[i]}: passo de peso">
      <select class="ed-unidade" aria-label="${TIPOS[i]}: unidade"><option value="kg">kg</option><option value="nível"${v.unidade === 'nível' ? ' selected' : ''}>nível</option></select>
    </div>`; }).join('')}
  </fieldset>`;
}
telas.editar = () => { $('ed-lista').innerHTML = db.exercicios.map(editorExercicio).join(''); };
$('ed-novo').addEventListener('click', () => { $('ed-lista').insertAdjacentHTML('beforeend', editorExercicio({ grupo: '', regiao: 'Superior' })); $('ed-lista').lastElementChild.querySelector('.ed-grupo').focus(); });
$('ed-lista').addEventListener('click', ev => {
  const b = ev.target.closest('.ed-remover,.ed-mover'); if (!b) return;
  const f = b.closest('fieldset');
  if (b.classList.contains('ed-remover')) { if (confirmar(b, 'Apagar com histórico?')) f.remove(); return; }
  if (+b.dataset.mv < 0 && f.previousElementSibling) f.parentNode.insertBefore(f, f.previousElementSibling);
  else if (+b.dataset.mv > 0 && f.nextElementSibling) f.parentNode.insertBefore(f.nextElementSibling, f);
  b.focus(); f.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
$('ed-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const exercicios = [];
  for (const f of $('ed-lista').querySelectorAll('fieldset')) {
    const variacoes = [...f.querySelectorAll('.ed-v')].map(r => ({ id: r.dataset.id, nome: r.querySelector('.ed-nome').value, passo: r.querySelector('.ed-passo').value, unidade: r.querySelector('.ed-unidade').value }));
    if (!variacoes[0].nome.trim()) { toast('Preencha o exercício principal'); f.querySelector('.ed-nome').focus(); return; }
    const antigo = db.exercicios.find(e => e.id === f.dataset.id);
    exercicios.push({ id: f.dataset.id, grupo: f.querySelector('.ed-grupo').value, regiao: f.querySelector('.ed-regiao').value, series: f.querySelector('.ed-series').value, reps: f.querySelector('.ed-reps').value, descanso: f.querySelector('.ed-descanso').value, ativo: antigo?.ativo, variacoes });
  }
  const novo = preparar({ ...db, exercicios });
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
