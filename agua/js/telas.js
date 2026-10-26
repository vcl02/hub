'use strict';
// Tela de hoje: total e meta, lembretes, beber (campo de ml e botões das quantidades já usadas), xixi, bexiga e 7 dias.
const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + pad(m % 60) : ''}` : `${m} min`;

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
  $('b-lista').innerHTML = x.aguas.map((a, i) => `<li><button type="button" data-tirar-agua="${i}" title="Tirar (toque duplo)" aria-label="Tirar ${a.ml} ml das ${a.hora}">${a.hora} · ${inteiro(a.ml)} ml ×</button></li>`).join('');
  // Xixi
  $('x-total').textContent = x.xixis.length;
  $('x-lista').innerHTML = x.xixis.map((h, i) => `<li><button type="button" data-tirar-xixi="${i}" title="Tirar (toque duplo)" aria-label="Tirar xixi das ${h}">${h} ×</button></li>`).join('');
  pintarBexiga(); pintarSemana();
}

function pintarBexiga() {
  const b = bexiga();
  $('bexiga').innerHTML = !b ? '<p class="vazio">Registre os xixis para ver aqui.</p>' : `<ul class="numeros">
    <li><b>${b.porDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</b> <span>xixis por dia</span></li>
    <li><b>${b.intervalo != null ? fmtMin(b.intervalo) : '—'}</b> <span>entre um e outro</span></li>
    <li><b>${inteiro(b.mlPorXixi)} ml</b> <span>bebidos por xixi</span></li>
  </ul><p class="nota">Média de ${b.dias === 1 ? '1 dia' : b.dias + ' dias'} com xixi registrado.</p>`;
}

function pintarSemana() {
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(hoje(), -i));
  $('semana').innerHTML = `<ul class="sem-lista">${dias.map(d => {
    const ml = totalMl(d), xx = doDia(d).xixis.length;
    return `<li><span>${d === hoje() ? 'Hoje' : d === somaDias(hoje(), -1) ? 'Ontem' : dataCurta(d)}</span> <span class="${ml >= META_ML ? 'ok' : ''}">${ml ? inteiro(ml) + ' ml' : '—'}</span> <span>${xx ? xx + ' xixi' + (xx > 1 ? 's' : '') : ''}</span></li>`;
  }).join('')}</ul>`;
}

// ===== Interações =====
function mudarHoje(acao) {
  let x = db.dias.find(d => d.data === hoje());
  if (!x) { x = { data: hoje(), aguas: [], xixis: [] }; db.dias.push(x); }
  acao(x); db = preparar(db); gravar(); desenhar();
}
function beber(ml) {
  if (!(ml > 0 && ml <= ML_MAX)) { toast(`De 1 a ${inteiro(ML_MAX)} ml`, true); return; }
  const hora = agoraHHMM();
  mudarHoje(x => { x.aguas.push({ hora, ml }); });
  toast(`${inteiro(ml)} ml às ${hora}`);
}
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
$('x-mais').addEventListener('click', () => { const h = agoraHHMM(); mudarHoje(x => { x.xixis.push(h); }); toast(`Xixi às ${h}`); });
$('x-lista').addEventListener('click', ev => {
  const b = ev.target.closest('[data-tirar-xixi]');
  if (b && confirmar(b)) mudarHoje(x => { x.xixis.splice(+b.dataset.tirarXixi, 1); });
});
// O app aberto acompanha o relógio: o lembrete da vez aparece sozinho (e o dia vira à meia-noite)
setInterval(() => { if (db && !$('v-agua').hidden) desenhar(); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && db) desenhar(); });
