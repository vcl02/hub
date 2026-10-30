'use strict';
// Tela de hoje: total e meta, lembretes, beber (bebida, campo de ml e botões das quantidades já usadas) e 7 dias.
let bebida = 'agua';   // a bebida do próximo lançamento; volta para água depois de cada outra bebida
// Dia anterior (tocado nos Últimos 7 dias ou aberto pelo ?dia=, que acompanha o dia visto como o ?ciclo do Fin): a tela é daquele
// dia, só leitura (sem lembretes, beber nem tirar). null = hoje.
let DIA = diaDaUrl();
// ‹ › e arrastar de lado: para trás até o 1º dia com água (ou o pedido pelo ?dia ao abrir), para frente até hoje, como no al
const DIA_PEDIDO = DIA;
const primeiroDia = () => [hoje(), DIA_PEDIDO || hoje(), ...db.dias.map(x => x.data)].reduce((a, b) => b < a ? b : a);
function verDia(dia, empilhar = true) { DIA = dia && dia < hoje() ? dia : null; diaNaUrl(DIA, empilhar); desenhar(); window.scrollTo(0, 0); }
const nomeBebida = a => BEBIDAS[a.bebida]?.nome.toLowerCase() || '';
// "10:00 · 300 ml" ou "10:00 · suco 300 ml (264 ml de água · 120 kcal)": as kcal entram no Alimentação
const textoAgua = a => a.bebida ? `${a.hora} · ${nomeBebida(a)} ${inteiro(a.volume)} ml (${inteiro(a.ml)} ml de água · ${inteiro(nutrientesBebida(a).kcal)} kcal)` : `${a.hora} · ${inteiro(a.ml)} ml`;

function desenhar() {
  const dia = DIA || hoje(), x = doDia(dia), total = totalMl(dia);
  $('d-nome').textContent = nomeDoDia(dia);
  $('d-ant').disabled = dia <= primeiroDia();
  $('d-prox').disabled = dia >= hoje();
  $('dia-visto').hidden = !DIA;
  if (DIA) $('dia-nome').textContent = deIso(DIA).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  for (const id of ['lembretes', 'b-tipos', 'b-form', 'b-botoes']) $(id).hidden = !!DIA;
  // Total e meta
  $('t-ml').textContent = inteiro(total);
  $('t-meta').textContent = `/ ${inteiro(META_ML)} ml`;
  $('t-bateu').hidden = total < META_ML;
  $('total').classList.toggle('ok', total >= META_ML);
  $('t-barra').style.width = Math.min(100, total / META_ML * 100) + '%';
  // Lembretes
  const L = lembretes(dia), vez = lembreteAgora(dia);
  $('l-agora').hidden = !vez;
  if (vez) $('l-agora').textContent = `Hora de beber água (${vez.hora})`;
  $('l-horas').innerHTML = L.map(l => `<li class="${l.estado}${vez && l.hora === vez.hora ? ' vez' : ''}" title="${l.estado === 'feito' ? 'Bebeu' : l.estado === 'atrasado' ? 'Não bebeu' : 'Ainda não chegou'}">${l.hora}${l.estado === 'feito' ? ' ✓' : ''}</li>`).join('');
  // Beber: botões das quantidades já usadas e a lista de hoje
  $('b-botoes').innerHTML = botoesMl().map(ml => `<li><button type="button" class="ml-bt" data-ml="${ml}">${inteiro(ml)} ml</button></li>`).join('');
  $('b-tipos').querySelectorAll('[data-bebida]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bebida === bebida)));
  $('b-lista').innerHTML = DIA ? x.aguas.map(a => `<li><span class="${a.bebida ? 'outra' : ''}">${textoAgua(a)}</span></li>`).join('')
    : x.aguas.map((a, i) => `<li><button type="button" class="${a.bebida ? 'outra' : ''}" data-tirar-agua="${i}" title="Tirar (toque duplo)" aria-label="Tirar ${textoAgua(a)}">${textoAgua(a)} ×</button></li>`).join('');
  pintarSemana();
}

function pintarSemana() {
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(hoje(), -i));
  $('semana').innerHTML = `<ul class="sem-lista">${dias.map(d => {
    const ml = totalMl(d);
    return `<li class="${d === (DIA || hoje()) ? 'visto' : ''}"><button type="button" data-dia="${d}"><span>${d === hoje() ? 'Hoje' : d === somaDias(hoje(), -1) ? 'Ontem' : dataCurta(d)}</span> <span class="${ml >= META_ML ? 'ok' : ''}">${ml ? inteiro(ml) + ' ml' : '—'}</span></button></li>`;
  }).join('')}</ul>`;
}

// ===== Interações =====
function mudarHoje(acao) {
  let x = db.dias.find(d => d.data === hoje());
  if (!x) { x = { data: hoje(), aguas: [] }; db.dias.push(x); }
  acao(x); db = preparar(db); gravar(); desenhar();
}
// Bebe ml da bebida escolhida: água conta inteira; as outras, só a parte que é água (e ficam marcadas na lista)
function beber(ml) {
  if (DIA) return;
  if (!(ml > 0 && ml <= ML_MAX)) { toast(`De 1 a ${inteiro(ML_MAX)} ml`, true); return; }
  if (repetido('beber ' + bebida + ' ' + ml)) return;
  const hora = agoraHHMM(), a = bebida === 'agua' ? { hora, ml } : { hora, ml: Math.round(ml * BEBIDAS[bebida].agua), bebida, volume: ml };
  bebida = 'agua';
  mudarHoje(x => { x.aguas.push(a); });
  toast(a.bebida ? `${BEBIDAS[a.bebida].nome} ${inteiro(ml)} ml: ${inteiro(a.ml)} ml de água às ${hora}` : `${inteiro(ml)} ml às ${hora}`);
}
$('b-tipos').addEventListener('click', ev => {
  const b = ev.target.closest('[data-bebida]');
  if (b) { bebida = b.dataset.bebida; desenhar(); $('b-ml').focus(); }
});
$('b-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const ml = Math.round(num($('b-ml').value));
  if (!$('b-ml').value.trim()) return;
  beber(ml);
  if (ml > 0 && ml <= ML_MAX) $('b-ml').value = '';
});
$('b-botoes').addEventListener('click', ev => { const b = ev.target.closest('[data-ml]'); if (b) beber(+b.dataset.ml); });
$('b-lista').addEventListener('click', ev => {
  const b = ev.target.closest('[data-tirar-agua]');
  if (b && !DIA && confirmar(b)) mudarHoje(x => { x.aguas.splice(+b.dataset.tirarAgua, 1); });
});
// Tocar num dia dos Últimos 7 dias abre ele (anterior: só leitura); Hoje e o Voltar do navegador voltam
$('semana').addEventListener('click', ev => { const b = ev.target.closest('[data-dia]'); if (b) verDia(b.dataset.dia); });
$('dia-hoje').addEventListener('click', () => verDia(null));
$('d-ant').addEventListener('click', () => { const d = DIA || hoje(); if (d > primeiroDia()) verDia(somaDias(d, -1)); });
$('d-prox').addEventListener('click', () => { const d = DIA || hoje(); if (d < hoje()) verDia(somaDias(d, 1)); });
arrastarDias($('v-agua'), dir => $(dir < 0 ? 'd-ant' : 'd-prox').click());
addEventListener('popstate', () => { if (db) verDia(diaDaUrl(), false); });
// O app aberto acompanha o relógio: o lembrete da vez aparece sozinho (e o dia vira à meia-noite)
setInterval(() => { if (db && !$('v-agua').hidden) desenhar(); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && db) desenhar(); });
