'use strict';
// Sessão do dia, séries, aquecimento e cronômetro de descanso.
// ===== Sessão do dia (fora do banco, sobrevive a fechar o app) =====
// { dia, series: {exercicio: n}, feitas: {exercicio: [{reps, kg?, falha?}]}, ajuste: {exercicio: {i: {kg?, reps?}}},
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
let avisouAjuste = false;   // "Se ajuste" já vibrou neste descanso
function iniciarDescanso(e, segundos) {
  T.exercicio = e.id; T.fim = Date.now() + segundos * 1000; avisouAjuste = false;
  manterTela(true); clearInterval(T.intervalo); T.intervalo = setInterval(tick, 250); salvarSessao(); tick();
}
function pararDescanso() { clearInterval(T.intervalo); T.intervalo = null; T.fim = 0; manterTela(false); salvarSessao(); tick(); }
function tick() {
  let acabou = false;
  if (T.fim && Date.now() >= T.fim) {
    clearInterval(T.intervalo); T.intervalo = null; T.fim = 0; manterTela(false); salvarSessao(); acabou = true;
    vibrar([400, 150, 400, 150, 700]);
  }
  // Faltando AVISO_AJUSTE (7 s): "Se ajuste" na tela e na faixa de baixo, com uma vibração, para se ajeitar na máquina
  const resta = T.fim ? T.fim - Date.now() : 0, ajuste = resta > 0 && resta <= AVISO_AJUSTE;
  if (ajuste && !avisouAjuste) { avisouAjuste = true; vibrar([120, 80, 120]); }
  if (resta > AVISO_AJUSTE) avisouAjuste = false;   // +15 s depois do aviso: avisa de novo
  $('t-ajuste').hidden = !(ajuste && atual === T.exercicio);
  $('mini').classList.toggle('ajuste', ajuste);
  const naTela = db && !$('v-exercicio').hidden && exAtual();
  if (acabou && naTela && atual === T.exercicio && terminouExercicio(exAtual())) { avancar(); return; }
  if (acabou) toast('Descanso acabou: próxima série');
  if (naTela) acabou ? pintarDescanso(exAtual()) : pintarRelogio(exAtual());   // a lista só é redesenhada quando muda
  const mostrarMini = !!(T.fim && db && !(naTela && atual === T.exercicio));
  $('mini').hidden = !mostrarMini;
  if (mostrarMini) {
    const e = db.exercicios.find(x => x.id === T.exercicio);
    $('mini-t').textContent = relogio(T.fim - Date.now());
    $('mini-n').textContent = (ajuste ? 'Se ajuste' : 'Descanso') + (e ? ' · ' + e.variacoes[variacaoAtiva(e)].nome : '');
  }
}
function planoAtual(e) { return plano(e, e.variacoes[e.ativo], num($('e-carga').value), temAquecimento(e), T.ajuste[e.id]); }
function pintarDescanso(e) {
  const v = e.variacoes[e.ativo], n = seriesFeitas(e.id), P = planoAtual(e), f = T.feitas[e.id] || [];
  $('t-modos').innerHTML = Object.entries(MODOS).map(([k, nome]) => `<button type="button" role="radio" aria-checked="${e.modo === k}" data-modo="${k}">${nome}</button>`).join('');
  $('t-plano').innerHTML = P.map((s, k) => {
    const feito = k < n, classe = feito ? 'ok' : k === n ? 'cur' : '';
    if (s.aq) return `<li class="aq ${classe}"><span>${s.nome}</span><b>${esc(pesoTxt(s.kg, v))} × ${s.reps}</b><span class="st">${feito ? '✓' : ''}</span></li>`;
    const kg = feito ? f[s.i]?.kg ?? s.kg : s.kg, reps = feito ? f[s.i]?.reps ?? s.reps : s.reps, aberta = editando === s.i, falhou = feito && f[s.i]?.falha;
    const outra = outraUnidade(v);
    return `<li class="${classe}${feito && reps < s.reps ? ' baixo' : ''}${falhou ? ' falhou' : ''}${aberta ? ' aberta' : ''}" data-linha="${s.i}"><span>${s.nome}</span><b>${esc(pesoTxt(kg, v))} × ${reps}</b><span class="st">${falhou ? '✗' : feito ? '✓' : '✎'}</span>${aberta ? `
      <div class="linha-ed">
        <span>Peso <button type="button" data-aj="kg" data-d="-1" aria-label="Menos 1">−</button><input data-aj-in="kg" inputmode="decimal" value="${kg > 0 ? virgula(kg) : ''}" aria-label="Peso da ${s.nome}"><button type="button" data-aj="kg" data-d="1" aria-label="Mais 1">+</button></span>
        ${outra ? `<span>≈ <button type="button" data-aj="conv" data-d="-1" aria-label="Menos 1 ${outra}">−</button><input data-aj-in="conv" inputmode="decimal" value="${kg > 0 ? virgula(naOutra(kg, v)) : ''}" aria-label="Peso da ${s.nome} em ${outra}"><button type="button" data-aj="conv" data-d="1" aria-label="Mais 1 ${outra}">+</button> ${outra}</span>` : ''}
        <span>Reps <button type="button" data-aj="reps" data-d="-1" aria-label="Menos 1 rep">−</button><input data-aj-in="reps" inputmode="numeric" value="${reps}" aria-label="Reps da ${s.nome}"><button type="button" data-aj="reps" data-d="1" aria-label="Mais 1 rep">+</button></span>
        ${feito ? `<button type="button" class="tog falha" data-aj="falha" aria-pressed="${!!falhou}" title="Não completou a série (as reps ficam como o alvo)">${falhou ? '✗ Falhei' : 'Falhei'}</button>` : ''}
      </div>` : ''}</li>`;
  }).join('');
  $('t-zerar').hidden = n === 0;
  $('t-desfazer').hidden = n === 0;
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
    : !prox.kg ? ''
    : (rodando ? 'Próxima: ' : 'Agora: ') + prox.nome.toLowerCase() + ' · ' + pesoTxt(prox.kg, v) + ' × ' + prox.reps;
}
// Ajuste de uma série: feita → muda o que foi feito; ainda não feita → muda o plano.
// campo: kg | reps | conv (peso na outra unidade, convertido) | falha (só série feita: liga/desliga)
function ajustarSerie(e, i, campo, valor) {
  const feita = i < seriesDeTrabalho(e);
  if (campo === 'falha' && !feita) return;
  const alvo = feita ? ((T.feitas[e.id] ||= [])[i] ||= { reps: planoAtual(e).find(s => s.i === i)?.reps }) : (((T.ajuste[e.id] ||= {})[i]) ||= {});
  if (campo === 'conv') { campo = 'kg'; valor = daOutra(valor, e.variacoes[e.ativo]); }
  if (campo === 'falha') { if (valor) alvo.falha = true; else delete alvo.falha; }
  else alvo[campo] = campo === 'reps' ? Math.max(0, Math.min(50, Math.round(valor))) : Math.max(0, Math.round(valor * 100) / 100);
  salvarSessao(); pintarDescanso(e); marcarAtividade();
  if (seriesDeTrabalho(e)) autoSalvar(e);
}
$('t-feita').addEventListener('click', () => {
  if (travadoHoje()) return;
  const e = exAtual(), aq = temAquecimento(e), n = seriesFeitas(e.id), ehAquecimento = aq && n === 0;
  const s = planoAtual(e)[n]; if (!s) return;
  if (!(s.kg > 0)) { toast('Coloque o peso antes de marcar a série: sem peso não salva', null, true); $('e-carga').focus(); return; }
  if (aq) T.aquecimento[e.regiao] = e.id;
  T.series[e.id] = n + 1; editando = null;
  if (!ehAquecimento) (T.feitas[e.id] ||= [])[s.i] = { reps: s.reps, ...(T.ajuste[e.id]?.[s.i]?.kg != null && { kg: T.ajuste[e.id][s.i].kg }) };
  vibrar(40);
  iniciarDescanso(e, ehAquecimento ? descansoAquecimento(e) : e.descanso);   // salva a sessão
  const msgs = autoSalvar(e);
  pintarDescanso(e); marcarAtividade();
  toast([s.nome + (ehAquecimento ? ' feito' : ' feita'), ...msgs].join(' · '), () => desfazerSerie(e.id));
  // Última série: o descanso que sobra vai para a faixa de baixo e a tela já mostra o próximo exercício
  if (terminouExercicio(e) && proximoQueFalta()) { const prox = proximoQueFalta(); atual = prox.id; telas.exercicio(); salvarSessao(); tick(); window.scrollTo(0, 0); }
});
function desfazerSerie(id) {
  const e = db.exercicios.find(x => x.id === id); if (!e) return;
  const n = seriesFeitas(id); if (!n) return;
  T.series[id] = n - 1;
  const aqDele = T.aquecimento[e.regiao] === id;
  if (aqDele && n === 1) delete T.aquecimento[e.regiao];
  else (T.feitas[id] ||= []).length = n - 1 - (aqDele ? 1 : 0);
  if (T.exercicio === id) pararDescanso();
  // Desfez a última série depois de já ter ido para o próximo exercício: volta para o dela antes de
  // salvar, porque o peso das séries sai do campo da tela (planoAtual)
  const naTela = !$('v-exercicio').hidden;
  if (naTela && atual !== id) { atual = id; telas.exercicio(); window.scrollTo(0, 0); }
  autoSalvar(e);
  if (naTela) telas.exercicio();
  salvarSessao();
  toast('Série desmarcada');
}
$('t-desfazer').addEventListener('click', () => { const e = exAtual(); if (e && !travadoHoje()) { desfazerSerie(e.id); marcarAtividade(); } });
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
