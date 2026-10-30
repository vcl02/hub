'use strict';
// Cardio na esteira depois do treino: contagem regressiva em anel, pausa, +5 min e o registro no treino do dia.
// ===== Cardio (esteira) =====
// Feito: no treino do dia, cardio = { inicio, ms, vel, incl } (vai para tr_treino.cardio). Em andamento: só no aparelho
// (K_CARDIO), com o tempo feito até a última pausa e a hora da retomada: fechar o app ou apagar a tela não perde a contagem.
const K_CARDIO = 'carga.cardio';
const CARDIO = { min: [5, 120, 5], vel: [1, 20, 0.5], incl: [0, 15, 1] };   // [mínimo, máximo, passo] de cada ajuste
const CARDIO_PADRAO = { min: 20, vel: 6, incl: 0 };
// C = { dia, alvo, vel, incl, inicio, feito, desde }: alvo e feito em ms; desde = hora da retomada (0 = pausado)
let C = null, cIntervalo = null, cUltimoMinuto = false, cAjuste = null;
const treinoDoDia = dia => [...db.treinos].reverse().find(t => iso(new Date(t.inicio)) === dia);
const feitoCardio = (agora = Date.now()) => C.feito + (C.desde ? agora - C.desde : 0);
// Calorias pela esteira (kcalEsteira, ../corpo/perfil.js) com a pesagem mais recente até o dia; sem pesagem, null
function kcalCardio(c, dia) { const p = pesoNoDia(medidas, dia); return p ? kcalEsteira(p, dia, c.ms, c.vel, c.incl) : null; }
const cardioTxt = (c, dia) => { const k = kcalCardio(c, dia); return `${duracao(c.ms)} · ${virgula(c.vel)} km/h · ${virgula(c.incl)}%${k ? ` · ~${k} kcal` : ''}`; };
// Começa com os ajustes do último cardio (duração arredondada a 5 min); sem nenhum, 20 min a 6 km/h no plano
function ajustePadrao() {
  const u = [...db.treinos].reverse().find(t => t.cardio)?.cardio;
  if (!u) return { ...CARDIO_PADRAO };
  return { min: Math.min(CARDIO.min[1], Math.max(CARDIO.min[0], Math.round(u.ms / 3e5) * 5)), vel: u.vel, incl: u.incl };
}
const guardarCardio = () => { if (C) store.set(K_CARDIO, JSON.stringify(C)); else store.del(K_CARDIO); };

telas.cardio = () => { if (!C && !treinoHoje()?.cardio) cAjuste = cAjuste || ajustePadrao(); pintarCardio(); };
function pintarCardio() {
  if (!db || $('v-cardio').hidden) return;
  const feito = !C && treinoHoje()?.cardio;
  let alvo, resta, sub = '', info = '';
  if (C) {
    const f = feitoCardio(), k = kcalCardio({ ms: f, vel: C.vel, incl: C.incl }, C.dia);
    alvo = C.alvo; resta = Math.max(0, alvo - f); sub = C.desde ? 'de ' + duracao(alvo) : 'Pausado';
    info = `${virgula(C.vel)} km/h · ${virgula(C.incl)}%${k ? ` · ~${k} kcal` : ''}`;
  } else if (feito) { alvo = feito.ms; resta = feito.ms; sub = 'Feito'; info = cardioTxt(feito, hoje()); }
  else { alvo = resta = cAjuste.min * 6e4; }
  // O anel esvazia conforme o tempo passa; feito, fica cheio e verde
  $('cd-relogio').textContent = relogio(resta);
  $('cd-arco').style.strokeDashoffset = feito ? 0 : 100 - resta / alvo * 100;
  $('cd-anel').classList.toggle('pausado', !!C && !C.desde);
  $('cd-anel').classList.toggle('feito', !!feito);
  $('cd-sub').textContent = sub;
  $('cd-info').textContent = info; $('cd-info').hidden = !info;
  $('cd-ajustes').hidden = $('cd-parado').hidden = !!C || !!feito;
  $('cd-rodando').hidden = !C; $('cd-resumo').hidden = !feito;
  $('cd-pausar').textContent = C?.desde ? 'Pausar' : 'Continuar';
  if (!C && !feito) $('cd-ajustes').innerHTML = [['min', 'Duração', 'min'], ['vel', 'Velocidade', 'km/h'], ['incl', 'Inclinação', '%']].map(([k, nome, u]) =>
    `<div class="cd-aj"><span>${nome}</span><button type="button" data-cd="${k}" data-d="-1" aria-label="Menos ${nome.toLowerCase()}">−</button><b>${virgula(cAjuste[k])}<small>${u}</small></b><button type="button" data-cd="${k}" data-d="1" aria-label="Mais ${nome.toLowerCase()}">+</button></div>`).join('');
}
$('cd-ajustes').addEventListener('click', ev => {
  const b = ev.target.closest('[data-cd]'); if (!b || C) return;
  const k = b.dataset.cd, [min, max, passo] = CARDIO[k];
  cAjuste[k] = Math.min(max, Math.max(min, Math.round((cAjuste[k] + passo * +b.dataset.d) * 10) / 10));
  vibrar(15); pintarCardio();
});

// Cardio é depois do treino: começar encerra o tempo de musculação (e o descanso que sobrava)
$('cd-comecar').addEventListener('click', () => {
  const t = treinoHoje(); if (!t || C) return;
  if (emAndamento(t)) { t.fim = Date.now(); t.fechado = true; gravar(); }
  if (T.fim) { clearInterval(T.intervalo); T.intervalo = null; T.fim = 0; salvarSessao(); tick(); }
  const agora = Date.now();
  C = { dia: hoje(), alvo: cAjuste.min * 6e4, vel: cAjuste.vel, incl: cAjuste.incl, inicio: agora, feito: 0, desde: agora };
  guardarCardio(); vibrar(40); rodarCardio();
});
function rodarCardio() { clearInterval(cIntervalo); cIntervalo = setInterval(tickCardio, 250); manterTela(true); tickCardio(); }
function tickCardio() {
  if (!C) return;
  const resta = C.alvo - feitoCardio();
  if (resta <= 0) { concluirCardio(); return; }
  if (resta <= 60000 && C.desde && !cUltimoMinuto) { cUltimoMinuto = true; vibrar([120, 80, 120]); }   // falta 1 min
  if (resta > 60000) cUltimoMinuto = false;
  pintarCardio();
  if (!$('v-inicio').hidden) pintarTempo();
}
$('cd-pausar').addEventListener('click', () => {
  if (!C) return;
  const agora = Date.now();
  if (C.desde) { C.feito += agora - C.desde; C.desde = 0; clearInterval(cIntervalo); cIntervalo = null; manterTela(false); }
  else { C.desde = agora; rodarCardio(); }
  guardarCardio(); pintarCardio();
});
$('cd-mais').addEventListener('click', () => { if (!C) return; C.alvo = Math.min(C.alvo + 5 * 6e4, 240 * 6e4); guardarCardio(); pintarCardio(); });
$('cd-encerrar').addEventListener('click', ev => { if (C && confirmar(ev.currentTarget)) concluirCardio(); });
$('cd-resumo').addEventListener('click', () => { if (pilha[pilha.length - 2] === 'fim') voltar(); else { diaVisto = null; ir('fim'); } });
// Fim do tempo ou Encerrar: grava o tempo feito no treino do dia (menos de 1 min não conta)
function concluirCardio() {
  const dia = C.dia, t = treinoDoDia(dia), c = { inicio: C.inicio, ms: Math.round(Math.min(C.alvo, feitoCardio()) / 1000) * 1000, vel: C.vel, incl: C.incl };
  clearInterval(cIntervalo); cIntervalo = null; C = null; guardarCardio(); manterTela(false);
  if (t && c.ms >= 60000) { t.cardio = c; gravar(); vibrar([400, 150, 400, 150, 700]); toast('Cardio salvo: ' + cardioTxt(c, dia)); }
  else toast('Cardio com menos de 1 min: não salvo', null, true);
  pintarCardio(); pintarTempo();
}
// Ao abrir o app: continua o cardio que estava rodando (ou conclui, se o tempo acabou com o app fechado)
function retomarCardio() {
  try { C = JSON.parse(store.get(K_CARDIO)); } catch (e) { C = null; }
  if (!C || !(C.alvo > 0) || !(C.inicio > 0)) { C = null; guardarCardio(); return; }
  if (C.desde) rodarCardio(); else pintarTempo();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && C?.desde) { manterTela(true); tickCardio(); } });

// ===== No resumo: o cardio feito no dia (com lixeira) ou, no treino de hoje, o botão que abre o cronômetro =====
// Hoje = ao finalizar ou tocando no dia de hoje na semana. Na segunda (dia extra, o do cardio) o botão vem em destaque.
function pintarCardioResumo(dia, t) {
  const c = t?.cardio, pode = dia === hoje() && !!t && !c && (!!C || !!travadoHoje() || emAndamento(t));
  $('f-cardio').hidden = !c && !pode;
  $('f-cardio').innerHTML = c
    ? `<ul class="hist"><li><span class="h-v">Cardio</span><span class="h-d">${cardioTxt(c, dia)}</span><span class="ed-acoes">${SO_LEITURA && dia !== hoje() ? '' : btIcone('lixo', 'Apagar cardio', `data-apagar-cardio="${t.inicio}"`, 'perigo')}</span></li></ul>`
    : pode ? `<button type="button" class="btn${DIAS_EXTRA.includes(deIso(dia).getDay()) ? ' primario' : ''} big wide" data-ir="cardio">${C ? 'Voltar ao cardio' : 'Cardio na esteira'}</button>` : '';
}
$('f-cardio').addEventListener('click', ev => {
  const b = ev.target.closest('[data-apagar-cardio]'); if (!b || !confirmar(b)) return;
  const t = db.treinos.find(x => x.inicio === +b.dataset.apagarCardio); if (!t?.cardio) return;
  const antes = t.cardio;
  delete t.cardio; gravar(); pintarResumo();
  toast('Cardio apagado', () => { t.cardio = antes; gravar(); if (!$('v-fim').hidden) pintarResumo(); toast('Desfeito'); });
});
