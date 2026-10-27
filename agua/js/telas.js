'use strict';
// Tela de hoje: total e meta, lembretes, beber (bebida, campo de ml e botões das quantidades já usadas) e 7 dias.
let bebida = 'agua';   // a bebida do próximo lançamento; volta para água depois de cada outra bebida
const nomeBebida = a => BEBIDAS[a.bebida]?.nome.toLowerCase() || '';
// "10:00 · 300 ml" ou "10:00 · suco 300 ml (264 ml de água)"
const textoAgua = a => a.bebida ? `${a.hora} · ${nomeBebida(a)} ${inteiro(a.volume)} ml (${inteiro(a.ml)} ml de água)` : `${a.hora} · ${inteiro(a.ml)} ml`;

function desenhar() {
  const dia = hoje(), x = doDia(dia), total = totalMl(dia);
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
  $('b-lista').innerHTML = x.aguas.map((a, i) => `<li><button type="button" class="${a.bebida ? 'outra' : ''}" data-tirar-agua="${i}" title="Tirar (toque duplo)" aria-label="Tirar ${textoAgua(a)}">${textoAgua(a)} ×</button></li>`).join('');
  pintarSemana();
}

function pintarSemana() {
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(hoje(), -i));
  $('semana').innerHTML = `<ul class="sem-lista">${dias.map(d => {
    const ml = totalMl(d);
    return `<li><span>${d === hoje() ? 'Hoje' : d === somaDias(hoje(), -1) ? 'Ontem' : dataCurta(d)}</span> <span class="${ml >= META_ML ? 'ok' : ''}">${ml ? inteiro(ml) + ' ml' : '—'}</span></li>`;
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
  if (!(ml > 0 && ml <= ML_MAX)) { toast(`De 1 a ${inteiro(ML_MAX)} ml`, true); return; }
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
  if (b && confirmar(b)) mudarHoje(x => { x.aguas.splice(+b.dataset.tirarAgua, 1); });
});
// O app aberto acompanha o relógio: o lembrete da vez aparece sozinho (e o dia vira à meia-noite)
setInterval(() => { if (db && !$('v-agua').hidden) desenhar(); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && db) desenhar(); });
