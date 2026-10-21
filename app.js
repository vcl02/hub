'use strict';
/*
  Diário de Carga — tudo roda no navegador.

  Banco (um item no localStorage, criptografado com a senha mestra):
    db = {
      exercicios: [{ id, grupo, regiao, series, reps, descanso, modo, ativo,
                     variacoes: [{ id, nome, unidade, passo, lados, equip?, nota? }] }],
      registros:  [{ variacao, data, series: [{ kg, reps }] }],   // 1 por exercício por dia; kg na unidade da variação
      treinos:    [{ inicio, fim, fechado? }],                     // horários (ms); fim = última interação ou "Finalizar"
      medidas:    [{ data, hora, peso, cintura? }]                 // peso corporal (kg), horário e cintura (cm)
    }
  reps = reps da série mais leve (topo da faixa). modo = crescente | reta | invertida.
  variacoes[0] = principal, [1] = substituto (máquina), [2] = halter. "ativo" = variação em uso.
  unidade = kg | lb | nível. passo = quanto a pirâmide sobe (anilha/placa). lados = 2 quando o peso é por lado.
  Pontos, nível, conquistas e calorias são calculados a partir desses dados (nada extra é guardado).
  Fotos das máquinas ficam fora do banco: localStorage "carga.foto.<variação>".
*/

// ===== Configuração =====
const DIAS_FIXOS = [3, 4];   // quarta, quinta (Date.getDay)
const DIAS_EXTRA = [1];      // segunda (sugerido)
const TIPOS = ['Principal', 'Substituto', 'Halter'];
const REGIOES = ['Pernas', 'Superior'];
const UNIDADES = ['kg', 'lb', 'nível'];
const LB = 0.45359237;
const MET = 3.5;             // musculação, vários exercícios, 8–15 reps (Compendium of Physical Activities, código 02054)
const MODOS = { crescente: 'Crescente', reta: 'Mesma carga', invertida: 'Invertida' };
const PADRAO = [             // grupo, região, descanso (s), [principal, substituto, halter]
  ['Pernas · empurrar', 'Pernas', 90, ['Leg press 45°', 'Agachamento no Smith', 'Agachamento taça com halter']],
  ['Posterior de coxa', 'Pernas', 60, ['Cadeira flexora', 'Mesa flexora', 'Stiff com halteres']],
  ['Peito', 'Superior', 75, ['Supino máquina', 'Voador (peck deck)', 'Supino reto com halteres']],
  ['Costas · puxar de cima', 'Superior', 75, ['Puxada alta', 'Barra assistida (graviton)', 'Pullover com halter']],
  ['Costas · remar', 'Superior', 75, ['Remada sentada máquina', 'Remada baixa no cabo', 'Remada unilateral (serrote)']],
  ['Ombros', 'Superior', 60, ['Desenvolvimento máquina', 'Desenvolvimento no Smith', 'Desenvolvimento com halteres']]
];
const passoPadrao = (indice, unidade) => unidade === 'nível' ? 1 : indice === 2 && unidade === 'kg' ? 2 : 5;   // anilha 5, halter 2
// Descrição e posição de cada exercício (orientação geral; ajuste ao seu corpo e à máquina)
const GUIA = {
  'leg press 45°': ['Máquina inclinada com anilhas · quadríceps e glúteos', 'Costas e quadril colados no encosto. Pés na largura dos ombros, no meio da plataforma, joelhos na direção dos pés. Desça até uns 90° no joelho sem tirar o quadril do banco; em cima, não trave o joelho.'],
  'agachamento no smith': ['Barra guiada · quadríceps e glúteos', 'Barra no alto das costas, nunca no pescoço. Pés um pouco à frente da barra, na largura dos ombros. Desça até a coxa ficar paralela ao chão, coluna neutra.'],
  'agachamento taça com halter': ['Em pé, halter junto ao peito · quadríceps e glúteos', 'Halter em pé, colado ao peito. Pés um pouco além da largura dos ombros, pontas levemente para fora. Desça com o tronco ereto, cotovelos por dentro dos joelhos.'],
  'cadeira flexora': ['Máquina sentada · posterior de coxa', 'Joelho alinhado com o eixo de giro da máquina. Rolo logo acima do calcanhar. Prenda a coxa com a almofada de cima; dobre até onde der e volte devagar.'],
  'mesa flexora': ['Máquina deitada de bruços · posterior de coxa', 'Joelho logo depois da borda do banco, alinhado com o eixo. Rolo logo acima do calcanhar. Quadril colado no banco, sem levantar o bumbum.'],
  'stiff com halteres': ['Em pé, halteres · posterior de coxa e glúteos', 'Joelhos levemente dobrados e parados. Leve o quadril para trás com a coluna reta, halteres rente às pernas; desça até sentir alongar atrás da coxa.'],
  'supino máquina': ['Máquina sentada · peito, ombro e tríceps', 'Banco na altura em que a pegada fique na linha do meio do peito. Escápulas juntas e costas apoiadas; empurre sem travar o cotovelo.'],
  'voador (peck deck)': ['Máquina sentada (crucifixo) · peito', 'Banco na altura em que os braços fiquem na linha do peito, ombros um pouco abaixo das mãos. Cotovelos levemente dobrados e parados; feche à frente sem bater os pegadores.'],
  'supino reto com halteres': ['Banco reto e halteres · peito, ombro e tríceps', 'Pés no chão. Halteres na linha do meio do peito, cotovelos a uns 45° do tronco. Desça até a linha do peito e suba sem bater os halteres.'],
  'puxada alta': ['Polia alta · costas (dorsal) e bíceps', 'Ajuste o rolo para prender as coxas. Pegada um pouco mais aberta que os ombros. Puxe a barra até o alto do peito levando os cotovelos para baixo, sem jogar o tronco para trás.'],
  'barra assistida (graviton)': ['Máquina com contrapeso · costas e bíceps', 'Aqui mais peso = mais ajuda (fica mais fácil); para progredir, diminua o peso. Joelhos na plataforma, pegada na largura dos ombros; suba até o queixo passar a barra.'],
  'pullover com halter': ['Banco e 1 halter · costas e peito', 'Deitado, halter seguro com as duas mãos acima do peito. Leve para trás da cabeça com os cotovelos levemente dobrados e volte até em cima do peito.'],
  'remada sentada máquina': ['Máquina sentada com apoio no peito · costas e bíceps', 'Peito na almofada; banco na altura em que a pegada fique entre o peito e o abdômen. Puxe levando os cotovelos para trás e juntando as escápulas.'],
  'remada baixa no cabo': ['Polia baixa · costas e bíceps', 'Pés na plataforma, joelhos levemente dobrados, coluna reta. Puxe o triângulo até o abdômen sem balançar o tronco.'],
  'remada unilateral (serrote)': ['Banco e 1 halter · costas', 'Mão e joelho do mesmo lado apoiados no banco, costas retas. Puxe o halter até a lateral do abdômen, cotovelo rente ao corpo.'],
  'desenvolvimento máquina': ['Máquina sentada · ombros e tríceps', 'Banco na altura em que as pegadas fiquem na linha dos ombros. Costas apoiadas; empurre para cima sem arquear a lombar.'],
  'desenvolvimento no smith': ['Barra guiada · ombros e tríceps', 'Banco com encosto em pé; a barra desce até a altura do queixo, à frente do rosto. Abdômen firme, sem arquear.'],
  'desenvolvimento com halteres': ['Banco com encosto e halteres · ombros e tríceps', 'Costas apoiadas, halteres na altura das orelhas, cotovelos levemente à frente. Empurre para cima e desça devagar.']
};
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
const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
function dataCurta(d) { const [a, m, dia] = d.split('-'); return dia + '/' + m + (+a !== new Date().getFullYear() ? '/' + a.slice(2) : ''); }
function quando(d) {
  const t = new Date(), n = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - deIso(d)) / 864e5);
  return n === 0 ? 'hoje' : n === 1 ? 'ontem' : n > 1 && n < 7 ? 'há ' + n + ' dias' : dataCurta(d);
}
const diasDesde = d => Math.round((deIso(hoje()) - deIso(d)) / 864e5);
const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const minutos = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const comHora = (ms, h) => { const d = new Date(ms), [a, b] = h.split(':').map(Number); d.setHours(a, b, 0, 0); return d.getTime(); };
const duracao = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min'; };

// ===== Pesos, unidades e pirâmide =====
const unidadeTxt = v => v.unidade + (v.lados === 2 ? '/lado' : '');
const pesoTxt = (kg, v) => kg > 0 ? fmt(kg) + ' ' + unidadeTxt(v) : '—';
const emKg = (kg, v) => v.unidade === 'nível' ? 0 : kg * (v.unidade === 'lb' ? LB : 1) * (v.lados || 1);   // total real em kg
const arred = (x, p) => Math.max(p, Math.round(x / p) * p);
// Reps-alvo da série i: crescente 12→10→8 · mesma carga 12→12→12 · invertida 8→10→12
const alvoReps = (e, i) => Math.max(1, e.modo === 'reta' ? e.reps : e.modo === 'invertida' ? e.reps - 2 * (e.series - 1 - i) : e.reps - 2 * i);
// Peso da série i a partir do peso da 1ª série: sobe (ou desce, na invertida) ~10%, arredondado ao passo
function alvoKg(e, v, base, i) {
  if (!(base > 0)) return null;
  const inc = arred(base * .1, v.passo), k = e.modo === 'reta' ? base : e.modo === 'invertida' ? base - inc * i : base + inc * i;
  return Math.max(v.passo, Math.round(k * 100) / 100);
}
function plano(e, v, base, comAquecimento, ajuste = {}) {
  const s = [];
  if (comAquecimento) s.push({ nome: 'Aquecimento', kg: base > 0 ? arred(base * .5, v.passo) : null, reps: 15, aq: true });
  for (let i = 0; i < e.series; i++) s.push({ nome: 'Série ' + (i + 1), i, kg: ajuste[i]?.kg ?? alvoKg(e, v, base, i), reps: ajuste[i]?.reps ?? alvoReps(e, i) });
  return s;
}
const topo = r => Math.max(...r.series.map(s => s.kg));
const repsTxt = r => r.series.map(s => s.reps).join('/');
const kgsTxt = r => [...new Set(r.series.map(s => fmt(s.kg)))].join('/');
// Pirâmide completa = bateu as reps-alvo de todas as séries
const completo = (r, e) => !!r && !!e && r.series.length >= e.series && r.series.slice(0, e.series).every((s, i) => s.reps >= alvoReps(e, i));

// ===== Avisos (com "Desfazer") =====
let tToast, desfazerFn = null;
function toast(msg, desfazer, erro = false) {
  $('toast-msg').textContent = msg; desfazerFn = desfazer || null; $('toast-desfazer').hidden = !desfazer;
  $('toast').classList.toggle('erro', erro);
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
  if (!store.set(K_DADOS, JSON.stringify({ it: iter, salt: b64(sal), iv: b64(iv), ct: b64(ct) }))) toast('Não consegui gravar no aparelho. Faça um backup.', null, true);
}
let fila = Promise.resolve();
const gravar = () => (fila = fila.then(fechar).catch(() => toast('Erro ao gravar', null, true)));
async function manterChave(sim) { if (sim) store.set(K_CHAVE, b64(await crypto.subtle.exportKey('raw', chave))); else store.del(K_CHAVE); }
// Executa uma mudança, grava e devolve a função que desfaz
function alterar(acao) {
  const antes = JSON.stringify(db);
  acao(); gravar();
  return () => { db = JSON.parse(antes); gravar(); mostrar(pilha[pilha.length - 1]); toast('Desfeito'); };
}

function bancoNovo() {
  return {
    exercicios: PADRAO.map(([grupo, regiao, descanso, nomes]) => ({ grupo, regiao, series: 3, reps: 12, descanso, variacoes: nomes.map(nome => ({ nome })) })),
    registros: [], treinos: [], medidas: []
  };
}
// reps aceitam o formato antigo em texto ("10–12" → 12)
const repsDe = r => intEntre(Math.max(0, ...(String(r ?? '').match(/\d+/g) || [0]).map(Number)), 1, 50, 12);
function variacaoAtiva(e) { if (e.variacoes[e.ativo]?.nome) return e.ativo; const i = e.variacoes.findIndex(v => v.nome); return i < 0 ? 0 : i; }
function preparar(d) {           // valida, completa campos e migra formatos antigos
  if (d && d.slots) d = {
    exercicios: d.slots.map(s => ({ id: s.id, grupo: s.g, series: s.sets, reps: s.reps, descanso: s.rest, ativo: s.a, variacoes: (s.vs || []).map(v => ({ id: v.id, nome: v.pt, unidade: v.u })) })),
    registros: (d.logs || []).map(l => ({ variacao: l.v, data: l.d, carga: l.w, reps: l.r }))
  };
  if (!d || !Array.isArray(d.exercicios) || !Array.isArray(d.registros)) throw new Error('formato');
  const exercicios = d.exercicios.map((e, i) => {
    const vs = (e.variacoes || []).slice(0, 3).map((v, j) => {
      const unidade = UNIDADES.includes(v.unidade) ? v.unidade : 'kg', p = num(v.passo);
      const equip = String(v.equip ?? '').trim().slice(0, 8), nota = String(v.nota ?? '').slice(0, 500);
      return { id: v.id || novoId(), nome: String(v.nome || '').trim(), unidade, passo: p > 0 && p <= 50 ? p : passoPadrao(j, unidade), lados: v.lados === 2 ? 2 : 1, ...(equip && { equip }), ...(nota.trim() && { nota }) };
    });
    while (vs.length < 3) vs.push({ id: novoId(), nome: '', unidade: 'kg', passo: passoPadrao(vs.length, 'kg'), lados: 1 });
    const grupo = String(e.grupo || vs[0].nome);
    const regiao = REGIOES.includes(e.regiao) ? e.regiao : /perna|coxa|gl[uú]t|panturr|agach|leg/i.test(grupo + ' ' + vs[0].nome) ? 'Pernas' : 'Superior';
    const ex = { id: e.id || novoId(), grupo, regiao, series: intEntre(e.series, 1, 10, 3), reps: repsDe(e.reps), descanso: intEntre(e.descanso, 10, 600, PADRAO[i]?.[2] || 75), modo: MODOS[e.modo] ? e.modo : 'crescente', ativo: e.ativo || 0, variacoes: vs };
    ex.ativo = variacaoAtiva(ex);
    return ex;
  });
  const exDe = new Map(), varDe = new Map();
  exercicios.forEach(e => e.variacoes.forEach(v => { exDe.set(v.id, e); varDe.set(v.id, v); }));
  const registros = d.registros.filter(r => r && r.variacao && dataOk(r.data)).map(r => {
    let series = r.series;
    if (!Array.isArray(series)) {   // formato antigo: carga (peso da 1ª série) + reps → pirâmide crescente
      const e = exDe.get(r.variacao), v = varDe.get(r.variacao), reps = Array.isArray(r.reps) ? r.reps : Array(e?.series || 3).fill(r.reps);
      series = reps.map((n, i) => ({ kg: e && v ? alvoKg({ ...e, modo: 'crescente' }, v, +r.carga, i) : +r.carga, reps: n }));
    }
    return { variacao: r.variacao, data: r.data, series: series.map(s => ({ kg: Math.max(0, num(s.kg) || 0), reps: Math.max(0, parseInt(s.reps, 10) || 0) })) };
  }).filter(r => r.series.length && r.series.every(s => s.kg > 0));
  const treinos = (d.treinos || []).filter(t => t && t.inicio > 0 && t.fim >= t.inicio).map(t => ({ inicio: +t.inicio, fim: +t.fim, ...(t.fechado && { fechado: true }) }));
  const medidas = (d.medidas || []).filter(m => m && dataOk(m.data) && num(m.peso) > 0)
    .map(m => ({ data: m.data, hora: /^\d{2}:\d{2}$/.test(m.hora) ? m.hora : '', peso: num(m.peso), ...(num(m.cintura) > 0 && { cintura: num(m.cintura) }) }));
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
  aplicarAtualizacao();
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

// ===== Pontos, nível, conquistas e resumo (calculados dos dados) =====
const PONTOS = [['treino', 50, 'por dia de treino'], ['exercicio', 10, 'por exercício feito'], ['piramide', 10, 'por pirâmide completa'],
  ['recorde', 25, 'por recorde de carga'], ['extra', 20, 'por treino extra na segunda'], ['pesagem', 10, 'por pesagem semanal']];
const PTS_NIVEL = 300;
const semanaDe = d => { const x = deIso(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };
const somaDias = (d, n) => { const x = deIso(d); x.setDate(x.getDate() + n); return iso(x); };
const mapas = () => { const ex = new Map(), va = new Map(); db.exercicios.forEach(e => e.variacoes.forEach(v => { ex.set(v.id, e); va.set(v.id, v); })); return { ex, va }; };
const ordemCronologica = () => [...db.registros].sort((a, b) => a.data.localeCompare(b.data));
function recordesAte(fim) {   // registros que bateram a maior carga anterior da mesma variação
  const melhor = {}, rec = new Set();
  for (const r of ordemCronologica()) {
    if (fim && r.data > fim) break;
    if (r.variacao in melhor && topo(r) > melhor[r.variacao]) rec.add(r);
    melhor[r.variacao] = Math.max(melhor[r.variacao] ?? -Infinity, topo(r));
  }
  return rec;
}
function estatisticas() {
  const { ex } = mapas(), dias = new Set(db.registros.map(r => r.data));
  const s = { treino: dias.size, exercicio: db.registros.length, piramide: 0, recorde: recordesAte().size, extra: 0, pesagem: 0, perda: 0, rapido: false };
  s.piramide = db.registros.filter(r => completo(r, ex.get(r.variacao))).length;
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
  ['Primeiro treino', 'Faça o 1º exercício', s => s.treino >= 1],
  ['Semana batida', '2 treinos na mesma semana', s => s.semanasMeta >= 1],
  ['Semana cheia', '3 treinos na mesma semana (com o extra)', s => s.semanasCheias >= 1],
  ['Pirâmide perfeita', 'Bata todas as reps de uma pirâmide', s => s.piramide >= 1],
  ['Primeiro recorde', 'Suba a carga de um exercício', s => s.recorde >= 1],
  ['Na balança', '4 pesagens em semanas diferentes', s => s.pesagem >= 4],
  ['Rápido e completo', 'Treino de até 45 min com 4+ exercícios', s => s.rapido],
  ['4 semanas seguidas', 'Meta de 2 treinos por 4 semanas seguidas', s => s.melhorSequencia >= 4],
  ['10 treinos', '10 dias de treino', s => s.treino >= 10],
  ['−2 kg', 'Perca 2 kg desde a 1ª pesagem', s => s.perda >= 2],
  ['10 recordes', '10 recordes de carga', s => s.recorde >= 10],
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
// Calorias: MET × peso corporal (kg) × horas. Usa a pesagem mais recente até o dia do treino.
function pesoEm(dia) { const L = [...db.medidas].sort((a, b) => b.data.localeCompare(a.data)); return (L.find(m => m.data <= dia) || L[L.length - 1])?.peso; }
const kcal = t => { const p = pesoEm(iso(new Date(t.inicio))); return p ? Math.round(MET * p * (t.fim - t.inicio) / 36e5) : null; };
function resumoDia(dia) {
  const { ex, va } = mapas(), regs = db.registros.filter(r => r.data === dia), rec = recordesAte(dia);
  const r = { regs, series: 0, volume: 0, recordes: regs.filter(x => rec.has(x)).length, completas: regs.filter(x => completo(x, ex.get(x.variacao))).length };
  regs.forEach(x => { r.series += x.series.length; const v = va.get(x.variacao); if (v) x.series.forEach(s => { r.volume += emKg(s.kg, v) * s.reps; }); });
  r.treino = [...db.treinos].reverse().find(t => iso(new Date(t.inicio)) === dia);
  r.kcal = r.treino ? kcal(r.treino) : null;
  r.pontos = regs.length ? 50 + 10 * regs.length + 10 * r.completas + 25 * r.recordes + (DIAS_EXTRA.includes(deIso(dia).getDay()) ? 20 : 0) : 0;
  return r;
}

// ===== Início =====
function ultimo(variacaoId) { let u = null; for (const r of db.registros) if (r.variacao === variacaoId && (!u || r.data > u.data)) u = r; return u; }
const registroHoje = e => db.registros.find(r => r.data === hoje() && e.variacoes.some(v => v.id === r.variacao));
telas.inicio = () => {
  let feitos = 0;
  $('i-lista').innerHTML = db.exercicios.map(e => {
    e.ativo = variacaoAtiva(e);
    const v = e.variacoes[e.ativo], u = ultimo(v.id), feito = !!registroHoje(e); if (feito) feitos++;
    return `<li><button type="button" class="slot" data-ex="${e.id}">
      <span class="slot-main"><span class="eyebrow">${esc(e.grupo)}${e.ativo > 0 ? ` · <i>${TIPOS[e.ativo].toLowerCase()}</i>` : ''}${v.equip ? ` · nº ${esc(v.equip)}` : ''}</span>
      <span class="name">${esc(v.nome)}</span><span class="r">${Array.from({ length: e.series }, (_, i) => alvoReps(e, i)).join(' → ')} reps · ${e.descanso} s</span>
      <span class="chips">${feito ? '<span class="chip ok">✓ Feito hoje</span>' : ''}${completo(u, e) ? '<span class="chip acao">↑ Subir carga</span>' : ''}</span></span>
      <span class="slot-load">${u ? `<span class="w">${fmt(topo(u))}<small>${esc(unidadeTxt(v))}</small></span><span class="r">${repsTxt(u)} · <i>${quando(u.data)}</i></span>` : '<span class="r">sem registro</span>'}</span>
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
    <path d="M${x(0)},${H - b} L${pts.join(' L')} L${x(P.length - 1)},${H - b} Z" fill="var(--blue)" fill-opacity=".12"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(P.length - 1)}" cy="${y(fim.valor)}" r="4.5" fill="var(--blue)"/>
    <text x="${l}" y="${H - 5}" font-size="11" fill="var(--muted)">${dataCurta(P[0].data)}</text>
    <text x="${W - r}" y="${H - 5}" text-anchor="end" font-size="11" fill="var(--muted)">${dataCurta(fim.data)} · ${fmt(fim.valor)} ${esc(unidade)}</text>
  </svg>`;
}

// ===== Desenho do exercício (ou foto da máquina) =====
const L = (a, b, c, d) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`, C = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const DESENHOS = {   // [máquina, corpo]
  legpress: [L(18, 34, 34, 64) + L(34, 64, 58, 64) + L(84, 8, 100, 32) + L(48, 74, 106, 18), C(24, 27, 5) + L(28, 33, 40, 60) + L(40, 60, 62, 42) + L(62, 42, 90, 22) + L(32, 42, 44, 58)],
  agachamento: [L(20, 74, 100, 74), C(54, 10, 5) + L(54, 16, 48, 40) + L(48, 40, 66, 50) + L(66, 50, 60, 72) + L(60, 72, 70, 72) + L(52, 24, 62, 30)],
  flexora: [L(24, 58, 20, 18) + L(24, 58, 62, 58) + L(30, 58, 30, 76) + L(44, 46, 64, 46) + C(70, 72, 4), C(22, 12, 5) + L(23, 18, 27, 56) + L(27, 56, 62, 54) + L(62, 54, 68, 68) + L(25, 30, 40, 44)],
  stiff: [L(20, 74, 100, 74), C(78, 26, 5) + L(73, 30, 46, 38) + L(46, 38, 48, 72) + L(48, 72, 58, 72) + L(66, 33, 66, 58)],
  supino: [L(28, 14, 28, 60) + L(28, 60, 52, 60) + L(30, 60, 30, 76) + L(84, 8, 84, 76) + L(78, 22, 78, 36), C(34, 12, 5) + L(34, 18, 36, 56) + L(36, 56, 58, 58) + L(58, 58, 60, 76) + L(36, 28, 56, 30) + L(56, 30, 78, 29)],
  puxada: [L(40, 60, 64, 60) + L(52, 60, 52, 76) + L(60, 46, 72, 46) + L(20, 3, 92, 3) + L(56, 3, 56, 10) + L(30, 11, 82, 11), C(52, 30, 5) + L(52, 36, 52, 58) + L(52, 58, 68, 56) + L(68, 56, 70, 76) + L(52, 40, 40, 26) + L(40, 26, 38, 11) + L(52, 40, 64, 26) + L(64, 26, 72, 11)],
  remada: [L(30, 62, 56, 62) + L(40, 62, 40, 76) + L(74, 28, 74, 52) + L(94, 14, 94, 76) + L(88, 38, 88, 50), C(66, 22, 5) + L(64, 28, 50, 60) + L(50, 60, 70, 62) + L(70, 62, 72, 76) + L(62, 36, 76, 44) + L(76, 44, 88, 44)],
  desenvolvimento: [L(28, 18, 28, 62) + L(28, 62, 52, 62) + L(30, 62, 30, 76) + L(38, 5, 64, 5), C(34, 14, 5) + L(34, 20, 36, 58) + L(36, 58, 56, 60) + L(56, 60, 58, 76) + L(35, 28, 46, 24) + L(46, 24, 50, 6)]
};
function tipoDesenho(e, v) {
  const t = (e.grupo + ' ' + v.nome).toLowerCase();
  return /stiff/.test(t) ? 'stiff' : /agach/.test(t) ? 'agachamento' : /leg|perna/.test(t) ? 'legpress' : /flexor|posterior/.test(t) ? 'flexora'
    : /remad|remar/.test(t) ? 'remada' : /puxad|puxar|graviton|pullover|barra/.test(t) ? 'puxada' : /desenvol|ombro/.test(t) ? 'desenvolvimento'
    : /supino|voador|peito|crucifixo/.test(t) ? 'supino' : null;
}
function desenho(e, v) {
  const foto = store.get('carga.foto.' + v.id);
  if (foto) return `<img src="${foto}" alt="Foto da máquina">`;
  const d = DESENHOS[tipoDesenho(e, v)]; if (!d) return '';
  const halter = /halter/i.test(v.nome) ? `<g class="halter">${L(94, 66, 110, 66)}${L(95, 60, 95, 72)}${L(109, 60, 109, 72)}</g>` : '';
  return `<svg viewBox="0 0 120 80" class="desenho" role="img" aria-label="Desenho do exercício"><g class="maq">${d[0]}</g><g class="corpo">${d[1]}</g>${halter}</svg>`;
}
$('e-foto').addEventListener('change', async ev => {
  const f = ev.target.files[0], v = varAtual(); ev.target.value = ''; if (!f || !v) return;
  try {
    const img = await createImageBitmap(f), k = Math.min(1, 480 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    if (!store.set('carga.foto.' + v.id, c.toDataURL('image/jpeg', .7))) throw new Error('espaço');
    toast('Foto salva'); telas.exercicio();
  } catch (e) { toast('Não consegui salvar a foto', null, true); }
});
$('e-foto-rm').addEventListener('click', () => { store.del('carga.foto.' + varAtual().id); toast('Foto removida'); telas.exercicio(); });

// ===== Exercício =====
let atual = null, editando = null;   // id do exercício aberto · série aberta para edição
const exAtual = () => db.exercicios.find(e => e.id === atual);
const varAtual = () => { const e = exAtual(); return e?.variacoes[e.ativo]; };
telas.exercicio = () => {
  const e = exAtual(); if (!e) { voltar(); return; }
  const trav = travadoHoje();
  $('v-exercicio').classList.toggle('travado', !!trav);
  $('e-travado').hidden = !trav;
  if (trav) $('e-travado-msg').textContent = `O treino de hoje foi finalizado às ${hhmm(trav.fim)}. Um treino por dia.`;
  e.ativo = variacaoAtiva(e); editando = null;
  const v = e.variacoes[e.ativo], pos = db.exercicios.indexOf(e), u = ultimo(v.id), guia = GUIA[v.nome.toLowerCase()];
  $('e-pos').textContent = (pos + 1) + '/' + db.exercicios.length;
  pintarTempo(); pintarTrilha();
  $('e-grupo').textContent = e.grupo;
  $('e-variacoes').innerHTML = e.variacoes.map((x, i) => x.nome ? `<button type="button" class="seg" role="radio" aria-checked="${i === e.ativo}" data-var="${i}"><span class="seg-k">${TIPOS[i]}</span><span class="seg-n">${esc(x.nome)}</span></button>` : '').join('');
  $('e-variacoes').hidden = e.variacoes.filter(x => x.nome).length < 2;
  $('e-fig').innerHTML = desenho(e, v); $('e-fig').hidden = !$('e-fig').innerHTML;
  $('e-nome').textContent = v.nome;
  $('e-desc').textContent = guia?.[0] || ''; $('e-desc').hidden = !guia;
  $('e-equip').value = v.equip || '';
  $('e-presc').innerHTML = `<b>${Array.from({ length: e.series }, (_, i) => alvoReps(e, i)).join(' → ')} reps</b> · descanso ${e.descanso} s`;
  $('e-guia').innerHTML = guia ? `<b>Posição:</b> ${esc(guia[1])}` : ''; $('e-guia').hidden = !guia;
  $('e-nota').value = v.nota || '';
  $('e-youtube').href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent((v.nome + ' execução correta').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim());
  $('e-foto-l').textContent = store.get('carga.foto.' + v.id) ? 'Trocar foto' : 'Foto da máquina';
  $('e-foto-rm').hidden = !store.get('carga.foto.' + v.id);
  $('e-ultima').innerHTML = u
    ? `<span>Última vez: <b>${kgsTxt(u)} ${esc(unidadeTxt(v))}</b> × ${repsTxt(u)} · <i>${quando(u.data)}</i></span>${completo(u, e) ? '<span class="chip acao">↑ Completou: suba a carga</span>' : ''}`
    : '<i class="muted">Primeiro registro desta variação. Comece leve.</i>';
  const rs = rascunho[v.id];   // valor digitado e ainda não salvo tem prioridade
  $('e-carga').value = rs ? rs.carga : u ? virgula(u.series[0].kg) : '';
  pintarPeso(e); pintarDescanso(e); pintarSalvo(e); pintarHistorico(e);
};
function pintarPeso(e) {   // rótulo, unidade, por lado/total e conversão
  const v = e.variacoes[e.ativo], kg = num($('e-carga').value);
  $('e-carga-l').textContent = e.modo === 'reta' ? 'Peso das séries' : e.modo === 'invertida' ? 'Peso da 1ª série (a mais pesada)' : 'Peso da 1ª série';
  $('e-unidade').textContent = unidadeTxt(v);
  $('e-lados').setAttribute('aria-pressed', v.lados === 2); $('e-lados').textContent = v.lados === 2 ? 'por lado ✓' : 'por lado';
  $('e-lados').hidden = v.unidade === 'nível';
  const partes = [];
  if (kg > 0 && v.lados === 2) partes.push(`= <b>${fmt(kg * 2)} ${v.unidade}</b> no total (sem contar a barra/plataforma)`);
  if (kg > 0 && v.unidade === 'lb') partes.push(`≈ <b>${fmt(Math.round(kg * LB * (v.lados || 1) * 10) / 10)} kg</b>${v.lados === 2 ? ' no total' : ''}`);
  $('e-conv').innerHTML = partes.join(' · '); $('e-conv').hidden = !partes.length;
}
function pintarTrilha() {   // barra do treino de hoje: cada exercício enche conforme as séries
  $('e-trilha').innerHTML = db.exercicios.map(x => {
    const r = registroHoje(x), k = Math.max(seriesDeTrabalho(x), r ? r.series.length : 0);
    return `<i class="${x.id === atual ? 'on' : ''}"><b style="width:${Math.min(1, k / x.series) * 100}%"></b></i>`;
  }).join('');
}
function pintarHistorico(e) {
  const v = e.variacoes[e.ativo], lista = db.registros.filter(r => r.variacao === v.id).sort((a, b) => b.data.localeCompare(a.data));
  $('e-historico').innerHTML = lista.length
    ? lista.map(r => `<li><i class="h-d">${dataCurta(r.data)}</i><span class="h-v">${kgsTxt(r)} ${esc(unidadeTxt(v))} <small>× ${repsTxt(r)}</small></span><button type="button" class="del" data-apagar="${r.data}">Apagar</button></li>`).join('')
    : '<li class="empty">Nenhum registro ainda.</li>';
  grafico($('e-grafico'), lista.slice(0, 12).reverse().map(r => ({ data: r.data, valor: topo(r) })), unidadeTxt(v), 'Evolução da carga máxima');
}
// Séries de trabalho já feitas hoje (peso manual ou o calculado pela pirâmide)
function seriesHoje(e) {
  const P = planoAtual(e).filter(s => !s.aq), f = T.feitas[e.id] || [];
  return Array.from({ length: seriesDeTrabalho(e) }, (_, i) => ({ kg: f[i]?.kg ?? P[i]?.kg, reps: f[i]?.reps ?? P[i]?.reps }));
}
// Salva sozinho: a cada série marcada, ajuste, peso ou troca de variação. 1 registro por exercício por dia.
function autoSalvar(e) {
  const v = e.variacoes[e.ativo], k = seriesDeTrabalho(e), h = hoje(), doExercicio = new Set(e.variacoes.map(x => x.id)), antes = estatisticas();
  if (!k) db.registros = db.registros.filter(r => !(r.data === h && doExercicio.has(r.variacao)));          // séries zeradas
  else {
    const series = seriesHoje(e);
    if (series.every(s => s.kg > 0)) {                                                                       // sem peso: não mexe no que já está salvo
      db.registros = db.registros.filter(r => !(r.data === h && doExercicio.has(r.variacao) && r.variacao !== v.id));   // trocou de variação
      const r = db.registros.find(x => x.variacao === v.id && x.data === h);
      if (r) r.series = series; else db.registros.push({ variacao: v.id, data: h, series });
    }
  }
  gravar(); pintarSalvo(e); pintarHistorico(e); pintarTrilha();
  return celebrar(antes);
}
function pintarSalvo(e) {
  const v = e.variacoes[e.ativo], r = db.registros.find(x => x.variacao === v.id && x.data === hoje()), k = seriesDeTrabalho(e);
  const falta = !r && k > 0;
  $('e-salvo').classList.toggle('ok', !!r); $('e-salvo').classList.toggle('erro', falta);
  $('e-salvo').innerHTML = r ? `✓ Salvo: <b>${kgsTxt(r)} ${esc(unidadeTxt(v))}</b> × ${repsTxt(r)}`
    : falta ? 'Coloque o peso da 1ª série para salvar.' : '<i>Salva sozinho a cada série marcada.</i>';
  $('e-finalizar').hidden = !emAndamento(ultimoTreino());
}
const CAMPOS = { carga: 'e-carga', peso: 'c-peso', cintura: 'c-cintura' };
function passo(campo, dir) {   // peso do exercício muda de 1 em 1
  const inp = $(CAMPOS[campo]), d = campo === 'peso' ? .1 : campo === 'cintura' ? .5 : 1;
  let n = num(inp.value); if (!isFinite(n)) n = 0;
  inp.value = virgula(Math.max(0, Math.round((n + dir * d) * 100) / 100));
  if (campo === 'carga') guardarRascunho();
}
function guardarRascunho() {
  const e = exAtual(); if (!e || travadoHoje()) return;
  rascunho[e.variacoes[e.ativo].id] = { carga: $('e-carga').value };
  salvarSessao(); pintarPeso(e); pintarDescanso(e); marcarAtividade();
  if (seriesDeTrabalho(e)) autoSalvar(e);
}
$('e-carga').addEventListener('input', guardarRascunho);
function mudarVariacao(campo, valor) { varAtual()[campo] = valor; gravar(); }   // unidade e por lado
$('e-unidade').addEventListener('click', () => {
  const v = varAtual(), u = UNIDADES[(UNIDADES.indexOf(v.unidade) + 1) % UNIDADES.length];
  mudarVariacao('unidade', u); if (u === 'nível') mudarVariacao('lados', 1);
  const e = exAtual(); pintarPeso(e); pintarDescanso(e); toast('Unidade: ' + u);
});
$('e-lados').addEventListener('click', () => { const e = exAtual(); mudarVariacao('lados', varAtual().lados === 2 ? 1 : 2); pintarPeso(e); pintarDescanso(e); pintarSalvo(e); pintarHistorico(e); });
// nº do aparelho e anotações: salvam 0,5 s depois de parar de digitar e ao sair do campo
for (const [id, campo, max] of [['e-equip', 'equip', 8], ['e-nota', 'nota', 500]]) {
  let t, pendente = null;   // { variação, texto } — preso ao exercício em que foi digitado
  const salvar = () => {
    clearTimeout(t); if (!pendente || !db) return;
    const { v, texto } = pendente; pendente = null;
    if (texto) v[campo] = texto; else delete v[campo];
    gravar();
  };
  $(id).addEventListener('input', () => { pendente = { v: varAtual(), texto: $(id).value.trim().slice(0, max) }; clearTimeout(t); t = setTimeout(salvar, 500); });
  $(id).addEventListener('change', salvar);
  $(id).addEventListener('blur', salvar);
}

// ===== Peso corporal =====
const medidasOrdenadas = () => [...db.medidas].sort((a, b) => b.data.localeCompare(a.data));
const horaHabitual = () => medidasOrdenadas().find(m => m.hora)?.hora || '';
let editMedida = null;
function pintarCorpoInicio() {
  const Ls = medidasOrdenadas(), u = Ls[0], prim = Ls[Ls.length - 1], box = $('i-corpo'), hab = horaHabitual();
  const atrasado = !u || diasDesde(u.data) >= 7;
  box.classList.toggle('on', atrasado);
  if (!u) { box.innerHTML = '<span>Peso corporal</span><b>Registrar ›</b><small>1ª pesagem</small>'; return; }
  const dif = Math.round((u.peso - prim.peso) * 10) / 10, cls = dif < 0 ? 'bom' : dif > 0 ? 'ruim' : '';
  box.innerHTML = `<span>Peso corporal <i>${quando(u.data)}</i>${atrasado ? ` · <em>hora de se pesar${hab ? ' às ' + hab : ''}</em>` : ''}</span>
    <b>${fmt(u.peso)} kg</b><small class="${cls}">${Ls.length > 1 ? (dif > 0 ? '+' : '') + fmt(dif) + ' kg desde ' + dataCurta(prim.data) : 'primeira pesagem'}</small>`;
}
function avisoHorario() {   // reforça pesar sempre no mesmo horário
  const hab = horaHabitual(), h = $('c-hora').value, box = $('c-aviso');
  const longe = hab && h && Math.abs(minutos(h) - minutos(hab)) > 60;
  box.classList.toggle('erro', !!longe);
  box.innerHTML = !hab ? '<b>Escolha um horário e mantenha toda semana.</b> O peso muda ao longo do dia (água, comida), então só dá para comparar pesagens feitas no mesmo horário.'
    : longe ? `<b>Fora do seu horário.</b> Você costuma se pesar às <b>${hab}</b>. Pesando às ${h}, a diferença pode ser só de horário, não de gordura.`
    : `<b>Mesmo horário de sempre: ${hab}.</b> Assim dá para comparar uma semana com a outra.`;
}
$('c-hora').addEventListener('input', avisoHorario);
telas.corpo = () => {
  const Ls = medidasOrdenadas(), u = Ls[0];
  $('c-peso').value = u ? virgula(u.peso) : '';
  $('c-cintura').value = u?.cintura ? virgula(u.cintura) : '';
  $('c-hora').value = horaHabitual() || hhmm(Date.now());
  avisoHorario(); pintarMedidas();
};
function pintarMedidas() {
  const Ls = medidasOrdenadas();
  $('c-historico').innerHTML = Ls.length ? Ls.map(m => m.data === editMedida
    ? `<li class="editando"><i class="h-d">${dataCurta(m.data)}</i><span class="ed-inline"><input type="time" id="em-hora" value="${m.hora}" aria-label="Horário"><input id="em-peso" inputmode="decimal" value="${virgula(m.peso)}" aria-label="Peso em kg"> kg</span><span class="ed-acoes"><button type="button" class="btn sm primary" data-salvar-medida="${m.data}">Salvar</button><button type="button" class="link" data-cancelar>Cancelar</button></span></li>`
    : `<li><i class="h-d">${dataCurta(m.data)}${m.hora ? ' ' + m.hora : ''}</i><span class="h-v">${fmt(m.peso)} kg${m.cintura ? ` <small>cintura ${fmt(m.cintura)} cm</small>` : ''}</span><span class="ed-acoes"><button type="button" class="del" data-editar-medida="${m.data}">Editar</button><button type="button" class="del" data-apagar-medida="${m.data}">Apagar</button></span></li>`).join('')
    : '<li class="empty">Nenhuma pesagem ainda.</li>';
  grafico($('c-grafico'), Ls.slice(0, 16).reverse().map(m => ({ data: m.data, valor: m.peso })), 'kg', 'Evolução do peso corporal');
}
$('c-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const peso = num($('c-peso').value), cintura = num($('c-cintura').value), hora = $('c-hora').value;
  if (!(peso >= 30 && peso <= 300)) { toast('Informe o peso em kg', null, true); $('c-peso').focus(); return; }
  const h = hoje(), antes = estatisticas();
  const desfazer = alterar(() => {
    db.medidas = db.medidas.filter(m => m.data !== h);
    db.medidas.push({ data: h, hora, peso, ...(cintura > 0 && { cintura }) });
  });
  vibrar(40);
  toast(['Pesagem salva: ' + fmt(peso) + ' kg', ...celebrar(antes)].join(' · '), desfazer);
  telas.corpo();
});

// ===== Tempo de treino =====
// Começa no 1º toque dentro de um exercício. Termina em "Finalizar" ou após 30 min sem mexer (no horário da última interação).
const INATIVO = 30 * 60 * 1000;
const ultimoTreino = () => db.treinos[db.treinos.length - 1];
const emAndamento = t => !!t && !t.fechado && Date.now() - t.fim <= INATIVO;
let editTreino = null;
// Um treino por dia: depois de finalizado (ou 30 min parado) com exercícios feitos, o dia fica travado até reabrir
const treinoHoje = () => { const t = ultimoTreino(); return t && iso(new Date(t.inicio)) === hoje() ? t : null; };
const travadoHoje = () => { const t = treinoHoje(); return t && !emAndamento(t) && db.registros.some(r => r.data === hoje()) ? t : null; };
function marcarAtividade() {
  if (!db || travadoHoje()) return;
  const agora = Date.now(), t = ultimoTreino();
  if (emAndamento(t)) t.fim = agora;
  else if (treinoHoje()) { t.inicio = agora; t.fim = agora; delete t.fechado; }   // abriu e não chegou a treinar: recomeça a contagem
  else db.treinos.push({ inicio: agora, fim: agora });
  gravar(); pintarTempo();
}
function reabrirTreino() {
  const t = treinoHoje(); if (!t) return;
  delete t.fechado; t.fim = Date.now(); gravar();
  telas.exercicio(); toast('Treino de hoje reaberto');
}
function pintarTempo() {
  if (!db) return;
  const t = ultimoTreino(), ativo = emAndamento(t), box = $('i-treino');
  $('e-tempo').textContent = ativo ? '⏱ ' + duracao(Date.now() - t.inicio) : '';
  box.classList.toggle('on', ativo);
  const cal = t && !ativo ? kcal(t) : null;
  box.innerHTML = !t ? '<i class="muted">O tempo do treino começa no 1º toque dentro de um exercício.</i>'
    : ativo ? `<span>Treino em andamento desde ${hhmm(t.inicio)}</span><b>${duracao(Date.now() - t.inicio)}</b><button type="button" class="btn sm" data-finalizar>Finalizar</button>`
    : `<span>Último treino <i>${quando(iso(new Date(t.inicio)))}, ${hhmm(t.inicio)}–${hhmm(t.fim)}${cal ? ` · ~${cal} kcal` : ''}</i></span><b>${duracao(t.fim - t.inicio)}</b>${travadoHoje() ? '<button type="button" class="btn sm" data-reabrir>Reabrir</button>' : ''}`;
  if (editTreino) return;   // não redesenha a lista enquanto um horário está sendo editado
  const fechados = (ativo ? db.treinos.slice(0, -1) : db.treinos).slice(-5).reverse();
  $('i-hist-box').hidden = !fechados.length;
  $('i-treinos').innerHTML = fechados.map(x => {
    const d = new Date(x.inicio), c = kcal(x);
    return x.inicio === editTreino ? '' : `<li><i class="h-d">${NOME_DIA[d.getDay()]} ${dataCurta(iso(d))}</i><span class="h-d">${hhmm(x.inicio)}–${hhmm(x.fim)}${c ? ` · ~${c} kcal` : ''}</span><span class="ed-acoes"><span class="h-v">${duracao(x.fim - x.inicio)}</span><button type="button" class="del" data-editar-treino="${x.inicio}">Editar</button></span></li>`;
  }).join('');
}
function abrirEdicaoTreino(inicio) {
  const t = db.treinos.find(x => x.inicio === inicio); if (!t) return;
  editTreino = inicio;
  const li = document.querySelector(`[data-editar-treino="${inicio}"]`).closest('li');
  li.className = 'editando';
  li.innerHTML = `<i class="h-d">${NOME_DIA[new Date(t.inicio).getDay()]} ${dataCurta(iso(new Date(t.inicio)))}</i><span class="ed-inline"><input type="time" id="et-ini" value="${hhmm(t.inicio)}" aria-label="Início"> – <input type="time" id="et-fim" value="${hhmm(t.fim)}" aria-label="Fim"></span><span class="ed-acoes"><button type="button" class="del" data-excluir-treino="${inicio}">Excluir</button><button type="button" class="link" data-cancelar>Cancelar</button><button type="button" class="btn sm primary" data-salvar-treino="${inicio}">Salvar</button></span>`;
}
function finalizarTreino() {
  const t = ultimoTreino();
  if (emAndamento(t)) { t.fim = Date.now(); t.fechado = true; gravar(); }
  clearInterval(T.intervalo); T.intervalo = null; T.fim = 0; manterTela(false); salvarSessao();
  ir('fim');
}
setInterval(pintarTempo, 15000);

// ===== Tela de fim de treino =====
telas.fim = () => {
  const dia = hoje(), r = resumoDia(dia), { ex, va } = mapas(), t = r.treino;
  $('f-data').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('f-msg').textContent = r.recordes ? `${r.recordes} ${r.recordes === 1 ? 'recorde' : 'recordes'} hoje. Mandou bem!` : r.regs.length ? 'Mais um treino na conta. Constância é o que dá resultado.' : 'Nenhum exercício registrado hoje.';
  const tiles = [
    ['Duração', t ? duracao(t.fim - t.inicio) : '—', t ? `${hhmm(t.inicio)}–${hhmm(t.fim)}` : ''],
    ['Calorias', r.kcal != null ? '~' + r.kcal : '—', r.kcal != null ? 'kcal, estimativa' : 'registre seu peso para estimar'],
    ['Exercícios', `${r.regs.length}/${db.exercicios.length}`, `${r.series} ${r.series === 1 ? 'série' : 'séries'}`],
    ['Volume', r.volume ? fmt(Math.round(r.volume)) : '—', r.volume ? 'kg levantados' : ''],
    ['Pontos', '+' + r.pontos, `${r.completas} pirâmides completas`]
  ];
  $('f-tiles').innerHTML = tiles.map(([k, v, s]) => `<li><span>${k}</span><b>${v}</b><small>${s}</small></li>`).join('');
  const rec = recordesAte(dia);
  $('f-lista').innerHTML = r.regs.map(x => { const v = va.get(x.variacao); return `<li><span class="h-v">${esc(v?.nome || '')}${rec.has(x) ? ' <span class="chip ok">Recorde</span>' : ''}</span><span class="h-d">${kgsTxt(x)} ${esc(v ? unidadeTxt(v) : '')} × ${repsTxt(x)}</span></li>`; }).join('') || '<li class="empty">Nada registrado.</li>';
  vibrar([60, 80, 60]);
};

// ===== Arrastar para o lado = próximo / anterior (sem dar a volta) =====
function podeTrocar(dir) { const j = db.exercicios.findIndex(e => e.id === atual) + dir; return j >= 0 && j < db.exercicios.length; }
function trocarExercicio(dir) {
  if (!podeTrocar(dir)) return;
  atual = db.exercicios[db.exercicios.findIndex(e => e.id === atual) + dir].id;
  telas.exercicio(); salvarSessao(); marcarAtividade(); tick(); window.scrollTo(0, 0);
  store.set('carga.arrastou', '1'); $('e-dica').hidden = true;
}
// Depois do último descanso (ou de pular), vai sozinho para o próximo exercício que falta; se não falta nenhum, fim.
function avancar() {
  const i = db.exercicios.findIndex(x => x.id === atual);
  const falta = x => !registroHoje(x) && !seriesFeitas(x.id);
  const prox = [...db.exercicios.slice(i + 1), ...db.exercicios.slice(0, i)].find(falta);
  if (!prox) { finalizarTreino(); return; }
  atual = prox.id; telas.exercicio(); salvarSessao(); tick(); window.scrollTo(0, 0);
  toast('Próximo: ' + prox.variacoes[variacaoAtiva(prox)].nome);
}
const terminouExercicio = e => seriesFeitas(e.id) >= e.series + (T.aquecimento[e.regiao] === e.id ? 1 : 0);
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
    if (ev.touches.length !== 1 || ev.target.closest('input,textarea,select,.segs,.modos,#mini,#toast')) return;
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
  if (store.get('carga.arrastou')) $('e-dica').hidden = true;
})();

// ===== Sessão do dia (fora do banco, sobrevive a fechar o app) =====
// { dia, series: {exercicio: n}, feitas: {exercicio: [{reps, kg?}]}, ajuste: {exercicio: {i: {kg?, reps?}}},
//   rascunho: {variacao: {carga}}, aquecimento: {regiao: exercicio}, exercicio, fim, aberto }
const K_SESSAO = 'carga.sessao';
let rascunho = {};
function salvarSessao() {
  if (!db) return;
  store.set(K_SESSAO, JSON.stringify({ dia: T.dia, series: T.series, feitas: T.feitas, ajuste: T.ajuste, rascunho, aquecimento: T.aquecimento, exercicio: T.exercicio, fim: T.fim, aberto: $('v-exercicio').hidden ? null : atual }));
}
function restaurarSessao() {
  let s = null; try { s = JSON.parse(store.get(K_SESSAO)); } catch (e) {}
  const existe = id => db.exercicios.some(e => e.id === id);
  ir('inicio');
  if (!s || s.dia !== hoje()) return;
  T.dia = s.dia; T.series = s.series || {}; T.ajuste = s.ajuste || {}; rascunho = s.rascunho || {};
  T.feitas = s.feitas || Object.fromEntries(Object.entries(s.reps || {}).map(([id, a]) => [id, a.map(reps => ({ reps }))]));   // versão anterior guardava só reps
  T.aquecimento = {};
  if (s.aquecimento && typeof s.aquecimento === 'object') for (const [r, id] of Object.entries(s.aquecimento)) if (existe(id)) T.aquecimento[r] = id;
  if (s.fim > Date.now() && existe(s.exercicio)) { T.exercicio = s.exercicio; T.fim = s.fim; manterTela(true); T.intervalo = setInterval(tick, 250); }
  if (existe(s.aberto)) { atual = s.aberto; ir('exercicio'); }
  salvarSessao(); tick();
}

// ===== Séries, aquecimento e cronômetro de descanso (sem som; vibra) =====
const T = { exercicio: null, fim: 0, intervalo: null, series: {}, feitas: {}, ajuste: {}, aquecimento: {}, dia: hoje() };
let telaLigada = null;
const relogio = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + pad(s % 60); };
function seriesFeitas(id) { if (T.dia !== hoje()) { T.series = {}; T.feitas = {}; T.ajuste = {}; rascunho = {}; T.aquecimento = {}; T.dia = hoje(); } return T.series[id] || 0; }
// O 1º exercício começado de cada região (pernas / superior) ganha uma série de aquecimento
function temAquecimento(e) {
  seriesFeitas(e.id);
  if (T.aquecimento[e.regiao]) return T.aquecimento[e.regiao] === e.id;
  return !db.exercicios.some(x => x.regiao === e.regiao && ((T.series[x.id] || 0) > 0 || registroHoje(x)));
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
    vibrar([400, 150, 400, 150, 700]);
  }
  const naTela = db && !$('v-exercicio').hidden && exAtual();
  if (acabou && naTela && atual === T.exercicio && terminouExercicio(exAtual())) { avancar(); return; }
  if (acabou) toast('Descanso acabou: próxima série');
  if (naTela) acabou ? pintarDescanso(exAtual()) : pintarRelogio(exAtual());   // a lista só é redesenhada quando muda
  const mostrarMini = !!(T.fim && db && !(naTela && atual === T.exercicio));
  $('mini').hidden = !mostrarMini;
  if (mostrarMini) {
    const e = db.exercicios.find(x => x.id === T.exercicio);
    $('mini-t').textContent = relogio(T.fim - Date.now());
    $('mini-n').textContent = 'Descanso' + (e ? ' · ' + e.variacoes[variacaoAtiva(e)].nome : '');
  }
}
function planoAtual(e) { return plano(e, e.variacoes[e.ativo], num($('e-carga').value), temAquecimento(e), T.ajuste[e.id]); }
function pintarDescanso(e) {
  const v = e.variacoes[e.ativo], n = seriesFeitas(e.id), P = planoAtual(e), f = T.feitas[e.id] || [];
  $('t-modos').innerHTML = Object.entries(MODOS).map(([k, nome]) => `<button type="button" role="radio" aria-checked="${e.modo === k}" data-modo="${k}">${nome}</button>`).join('');
  $('t-plano').innerHTML = P.map((s, k) => {
    const feito = k < n, classe = feito ? 'ok' : k === n ? 'cur' : '';
    if (s.aq) return `<li class="aq ${classe}"><span>${s.nome}</span><b>${esc(pesoTxt(s.kg, v))} × ${s.reps}</b><span class="st">${feito ? '✓' : ''}</span></li>`;
    const kg = feito ? f[s.i]?.kg ?? s.kg : s.kg, reps = feito ? f[s.i]?.reps ?? s.reps : s.reps, aberta = editando === s.i;
    return `<li class="${classe}${feito && reps < s.reps ? ' baixo' : ''}${aberta ? ' aberta' : ''}" data-linha="${s.i}"><span>${s.nome}</span><b>${esc(pesoTxt(kg, v))} × ${reps}</b><span class="st">${feito ? '✓' : '✎'}</span>${aberta ? `
      <div class="linha-ed">
        <span>Peso <button type="button" data-aj="kg" data-d="-1" aria-label="Menos 1">−</button><input data-aj-in="kg" inputmode="decimal" value="${kg > 0 ? virgula(kg) : ''}" aria-label="Peso da ${s.nome}"><button type="button" data-aj="kg" data-d="1" aria-label="Mais 1">+</button></span>
        <span>Reps <button type="button" data-aj="reps" data-d="-1" aria-label="Menos 1 rep">−</button><input data-aj-in="reps" inputmode="numeric" value="${reps}" aria-label="Reps da ${s.nome}"><button type="button" data-aj="reps" data-d="1" aria-label="Mais 1 rep">+</button></span>
      </div>` : ''}</li>`;
  }).join('');
  $('t-zerar').hidden = n === 0;
  pintarRelogio(e, P);
}
function pintarRelogio(e, P = planoAtual(e)) {
  const v = e.variacoes[e.ativo], n = seriesFeitas(e.id), rodando = !!T.fim && T.exercicio === e.id, prox = P[n];
  $('t-relogio').textContent = relogio(rodando ? T.fim - Date.now() : (prox && prox.aq ? descansoAquecimento(e) : e.descanso) * 1000);
  $('t-relogio').classList.toggle('run', rodando);
  $('t-parado').hidden = n >= P.length;
  $('t-rodando').hidden = !rodando;
  $('t-feita').textContent = prox ? `${prox.nome} feita · descansar` : '';
  $('t-nota').textContent = n >= P.length ? (rodando ? 'Último descanso: depois vai para o próximo exercício.' : 'Exercício feito e salvo.')
    : !prox.kg ? 'Coloque o peso acima para calcular a pirâmide.'
    : (rodando ? 'Próxima: ' : 'Agora: ') + prox.nome.toLowerCase() + ' · ' + pesoTxt(prox.kg, v) + ' × ' + prox.reps;
}
// Ajuste de uma série: feita → muda o que foi feito; ainda não feita → muda o plano
function ajustarSerie(e, i, campo, valor) {
  const alvo = i < seriesDeTrabalho(e) ? ((T.feitas[e.id] ||= [])[i] ||= { reps: planoAtual(e).find(s => s.i === i)?.reps }) : (((T.ajuste[e.id] ||= {})[i]) ||= {});
  alvo[campo] = campo === 'reps' ? Math.max(0, Math.min(50, Math.round(valor))) : Math.max(0, Math.round(valor * 100) / 100);
  salvarSessao(); pintarDescanso(e); marcarAtividade();
  if (seriesDeTrabalho(e)) autoSalvar(e);
}
$('t-feita').addEventListener('click', () => {
  if (travadoHoje()) return;
  const e = exAtual(), aq = temAquecimento(e), n = seriesFeitas(e.id), ehAquecimento = aq && n === 0;
  const s = planoAtual(e)[n]; if (!s) return;
  if (aq) T.aquecimento[e.regiao] = e.id;
  T.series[e.id] = n + 1; editando = null;
  if (!ehAquecimento) (T.feitas[e.id] ||= [])[s.i] = { reps: s.reps, ...(T.ajuste[e.id]?.[s.i]?.kg != null && { kg: T.ajuste[e.id][s.i].kg }) };
  vibrar(40);
  iniciarDescanso(e, ehAquecimento ? descansoAquecimento(e) : e.descanso);   // salva a sessão
  const msgs = autoSalvar(e);
  pintarDescanso(e); marcarAtividade();
  toast([s.nome + (ehAquecimento ? ' feito' : ' feita'), ...msgs].join(' · '), () => desfazerSerie(e.id));
});
function desfazerSerie(id) {
  const e = db.exercicios.find(x => x.id === id); if (!e) return;
  const n = seriesFeitas(id); if (!n) return;
  T.series[id] = n - 1;
  const aqDele = T.aquecimento[e.regiao] === id;
  if (aqDele && n === 1) delete T.aquecimento[e.regiao];
  else (T.feitas[id] ||= []).length = n - 1 - (aqDele ? 1 : 0);
  if (T.exercicio === id) pararDescanso();
  autoSalvar(e); salvarSessao();
  if (atual === id && !$('v-exercicio').hidden) telas.exercicio();
  toast('Série desmarcada');
}
$('t-menos').addEventListener('click', () => { if (T.fim) { T.fim -= 15000; salvarSessao(); tick(); } marcarAtividade(); });
$('t-mais').addEventListener('click', () => { if (T.fim) { T.fim += 15000; salvarSessao(); tick(); } marcarAtividade(); });
$('t-pular').addEventListener('click', () => { const e = exAtual(); pararDescanso(); marcarAtividade(); if (e && terminouExercicio(e)) avancar(); });
$('t-zerar').addEventListener('click', () => { const e = exAtual(); T.series[e.id] = 0; T.feitas[e.id] = []; delete T.ajuste[e.id]; if (T.exercicio === e.id) pararDescanso(); salvarSessao(); autoSalvar(e); pintarDescanso(e); marcarAtividade(); });
$('mini').addEventListener('click', () => { if (db && T.exercicio) { atual = T.exercicio; ir('exercicio'); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; pintarTempo(); if (T.fim) { manterTela(true); tick(); } });
document.addEventListener('change', ev => {   // peso/reps digitados no editor da série
  const inp = ev.target.closest('[data-aj-in]'); if (!inp || !db) return;
  const e = exAtual(), i = +inp.closest('[data-linha]').dataset.linha, val = num(inp.value);
  if (isFinite(val)) ajustarSerie(e, i, inp.dataset.ajIn, val);
});

// ===== Cliques gerais =====
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-ir],[data-voltar],[data-ex],[data-var],[data-passo],[data-apagar],[data-apagar-medida],[data-modo],[data-aj],[data-linha],[data-finalizar],[data-reabrir],[data-editar-treino],[data-salvar-treino],[data-excluir-treino],[data-editar-medida],[data-salvar-medida],[data-cancelar]');
  if (!b || !db) return;
  const d = b.dataset;
  if (travadoHoje() && !$('v-exercicio').hidden && (d.var || d.passo === 'carga' || d.modo || d.aj || d.linha !== undefined)) return;   // dia travado
  if (d.ir) ir(d.ir);
  else if ('voltar' in d) voltar();
  else if (d.ex) { atual = d.ex; ir('exercicio'); }
  else if (d.var) { const e = exAtual(); e.ativo = +d.var; gravar(); telas.exercicio(); if (seriesDeTrabalho(e)) autoSalvar(e); marcarAtividade(); }
  else if (d.passo) passo(d.passo, +d.dir);
  else if (d.modo) { const e = exAtual(); e.modo = d.modo; delete T.ajuste[e.id]; gravar(); salvarSessao(); pintarPeso(e); pintarDescanso(e); if (seriesDeTrabalho(e)) autoSalvar(e); telas.exercicio(); }
  else if (d.aj) {
    const e = exAtual(), li = b.closest('[data-linha]'), i = +li.dataset.linha, inp = li.querySelector(`[data-aj-in="${d.aj}"]`);
    ajustarSerie(e, i, d.aj, (num(inp.value) || 0) + +d.d); vibrar(15);
  }
  else if (d.linha !== undefined) {
    if (ev.target.closest('.linha-ed')) return;
    editando = editando === +d.linha ? null : +d.linha; pintarDescanso(exAtual());
  }
  else if ('finalizar' in d) finalizarTreino();
  else if ('reabrir' in d) reabrirTreino();
  else if (d.excluirTreino) {
    if (!confirmar(b, 'Excluir treino e exercícios do dia?')) return;
    const t = db.treinos.find(x => x.inicio === +d.excluirTreino), dia = iso(new Date(t.inicio));
    const desfazer = alterar(() => { db.treinos = db.treinos.filter(x => x !== t); db.registros = db.registros.filter(r => r.data !== dia); });
    if (dia === hoje()) { T.series = {}; T.feitas = {}; T.ajuste = {}; T.aquecimento = {}; pararDescanso(); }
    editTreino = null; mostrar(pilha[pilha.length - 1]); toast('Treino excluído', desfazer);
  }
  else if (d.editarTreino) abrirEdicaoTreino(+d.editarTreino);
  else if (d.salvarTreino) {
    const t = db.treinos.find(x => x.inicio === +d.salvarTreino), ini = $('et-ini').value, fim = $('et-fim').value;
    if (!t || !ini || !fim || minutos(fim) <= minutos(ini)) { toast('O fim precisa ser depois do início', null, true); return; }
    const desfazer = alterar(() => { const base = t.inicio; t.inicio = comHora(base, ini); t.fim = comHora(base, fim); t.fechado = true; });
    editTreino = null; pintarTempo(); toast('Horário do treino salvo', desfazer);
  }
  else if (d.editarMedida) { editMedida = d.editarMedida; pintarMedidas(); }
  else if (d.salvarMedida) {
    const peso = num($('em-peso').value), hora = $('em-hora').value;
    if (!(peso >= 30 && peso <= 300)) { toast('Informe o peso em kg', null, true); return; }
    const desfazer = alterar(() => { const m = db.medidas.find(x => x.data === d.salvarMedida); m.peso = peso; m.hora = hora; });
    editMedida = null; telas.corpo(); toast('Pesagem atualizada', desfazer);
  }
  else if ('cancelar' in d) { editTreino = null; editMedida = null; pintarTempo(); if (!$('v-corpo').hidden) pintarMedidas(); }
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
  let info = `Versão ${versaoAtual || '—'}. ${db.registros.length} registro(s) e ${db.medidas.length} pesagem(ns) neste aparelho.`;
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
      <label>Reps (máx.)<input class="ed-reps" inputmode="numeric" value="${e.reps ?? 12}"></label>
      <label>Descanso (s)<input class="ed-descanso" inputmode="numeric" value="${e.descanso ?? 75}"></label>
      <label>Região<select class="ed-regiao">${REGIOES.map(r => `<option${e.regiao === r ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    </div>
    ${[0, 1, 2].map(i => { const v = (e.variacoes || [])[i] || {}; return `<div class="ed-v" data-id="${v.id || ''}">
      <span class="ed-k">${TIPOS[i]}${i === 0 ? ' (obrigatório)' : ''} · nome, passo, unidade</span>
      <input class="ed-nome" value="${esc(v.nome)}" placeholder="Nome do exercício" aria-label="${TIPOS[i]}: nome">
      <input class="ed-passo" inputmode="decimal" value="${virgula(v.passo ?? passoPadrao(i, v.unidade || 'kg'))}" aria-label="${TIPOS[i]}: passo de peso">
      <select class="ed-unidade" aria-label="${TIPOS[i]}: unidade">${UNIDADES.map(u => `<option${(v.unidade || 'kg') === u ? ' selected' : ''}>${u}</option>`).join('')}</select>
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
    const antigo = db.exercicios.find(e => e.id === f.dataset.id);
    const variacoes = [...f.querySelectorAll('.ed-v')].map((r, j) => {
      const velho = antigo?.variacoes.find(v => v.id === r.dataset.id) || {};
      return { ...velho, id: r.dataset.id, nome: r.querySelector('.ed-nome').value, passo: r.querySelector('.ed-passo').value, unidade: r.querySelector('.ed-unidade').value };
    });
    if (!variacoes[0].nome.trim()) { toast('Preencha o exercício principal', null, true); f.querySelector('.ed-nome').focus(); return; }
    exercicios.push({ ...antigo, id: f.dataset.id, grupo: f.querySelector('.ed-grupo').value, regiao: f.querySelector('.ed-regiao').value, series: f.querySelector('.ed-series').value, reps: f.querySelector('.ed-reps').value, descanso: f.querySelector('.ed-descanso').value, variacoes });
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

// ===== Sempre a última versão =====
// Ao abrir, ao voltar para o app e a cada 10 min, compara os arquivos publicados com os que estão rodando.
// Se mudaram, recarrega sozinho (a sessão do dia está salva). Espera o treino acabar e não age em telas com formulário.
const ARQUIVOS_APP = ['index.html', 'app.js', 'style.css'];
const TELAS_SEGURAS = ['inicio', 'exercicio', 'conquistas', 'ajustes', 'fim'];
let versaoAtual = null, atualizacaoPendente = false, ultimaChecagem = 0;
const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
async function checarAtualizacao(forcar = false) {
  if (!navigator.onLine || (!forcar && Date.now() - ultimaChecagem < 60000)) return;
  ultimaChecagem = Date.now();
  try {
    const textos = await Promise.all(ARQUIVOS_APP.map(a => fetch(a + '?v=' + Date.now(), { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })));
    const v = hash(textos.join('\n'));
    if (!versaoAtual) versaoAtual = v;          // 1ª checagem = versão que está rodando
    else if (v !== versaoAtual) { atualizacaoPendente = true; aplicarAtualizacao(); }
  } catch (e) {}
}
function aplicarAtualizacao() {
  if (!atualizacaoPendente || !TELAS_SEGURAS.includes(pilha[pilha.length - 1])) return;
  if (!db || T.fim || emAndamento(ultimoTreino())) return;   // nunca no meio do treino: espera ele acabar
  atualizacaoPendente = false; salvarSessao();
  toast('Atualizando para a versão nova…');
  setTimeout(() => location.reload(), 900);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checarAtualizacao(); });
addEventListener('online', () => checarAtualizacao(true));
setInterval(() => { checarAtualizacao(); aplicarAtualizacao(); }, 10 * 60 * 1000);

// ===== Início do app =====
(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  checarAtualizacao(true);
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
