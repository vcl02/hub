'use strict';
// Peso corporal: pesagens, horário habitual, IMC e taxa basal.
// ===== Peso corporal =====
// IMC = peso / altura² · faixas da OMS (adultos)
const imc = peso => Math.round(peso / ALTURA ** 2 * 10) / 10;
const faixaImc = i => i < 18.5 ? 'abaixo do peso' : i < 25 ? 'normal' : i < 30 ? 'sobrepeso' : 'obesidade';
const medidasOrdenadas = () => [...db.medidas].sort((a, b) => b.data.localeCompare(a.data));
const horaHabitual = () => medidasOrdenadas().find(m => m.hora)?.hora || '';
let editMedida = null;
function pintarCorpoInicio() {
  const Ls = medidasOrdenadas(), u = Ls[0], prim = Ls[Ls.length - 1], box = $('i-corpo'), hab = horaHabitual();
  const atrasado = !u || u.data !== hoje();   // pesagem diária: destaca enquanto não pesou hoje
  box.classList.toggle('on', atrasado);
  if (!u) { box.innerHTML = '<span>Peso corporal</span><b>Registrar ›</b><small>1ª pesagem</small>'; return; }
  const dif = Math.round((u.peso - prim.peso) * 10) / 10, cls = dif < 0 ? 'bom' : dif > 0 ? 'ruim' : '';
  box.innerHTML = `<span>Peso corporal <i>${quando(u.data)}</i>${atrasado ? ` · <em>hora de se pesar${hab ? ' às ' + hab : ''}</em>` : ''}</span>
    <b>${fmt(u.peso)} kg</b><small class="${cls}">${Ls.length > 1 ? (dif > 0 ? '+' : '') + fmt(dif) + ' kg desde ' + dataCurta(prim.data) + ' · ' : ''}IMC ${fmt(imc(u.peso))} (${faixaImc(imc(u.peso))})</small>`;
}
function avisoHorario() {   // só recomenda o horário de sempre: qualquer horário é aceito
  const hab = horaHabitual(), h = $('c-hora').value, box = $('c-aviso');
  const longe = hab && h && Math.abs(minutos(h) - minutos(hab)) > 60;
  box.hidden = !longe;
  box.innerHTML = longe ? `Fora do seu horário de sempre (<b>${hab}</b>): para comparar os dias, prefira pesar perto dele.` : '';
}
$('c-hora').addEventListener('input', avisoHorario);
telas.corpo = () => {
  const Ls = medidasOrdenadas(), u = Ls[0];
  $('c-peso').value = u ? virgula(u.peso) : '';
  $('c-cintura').value = u?.cintura ? virgula(u.cintura) : '';
  $('c-hora').value = horaHabitual() || hhmm(Date.now());
  $('c-perfil').textContent = `${idadeEm(hoje())} anos · ${virgula(ALTURA)} m${u ? ` · basal ~${tmb(u.peso, hoje()).toLocaleString('pt-BR')} kcal/dia` : ''}`;
  avisoHorario(); pintarMedidas();
};
function pintarMedidas() {
  const Ls = medidasOrdenadas();
  $('c-historico').innerHTML = Ls.length ? Ls.map(m => m.data === editMedida
    ? `<li class="editando"><i class="h-d">${dataCurta(m.data)}</i><span class="ed-inline"><input type="date" id="em-data" value="${m.data}" max="${hoje()}" aria-label="Data"><input type="time" id="em-hora" value="${m.hora}" aria-label="Horário"><input id="em-peso" inputmode="decimal" value="${virgula(m.peso)}" aria-label="Peso em kg"> kg</span><span class="ed-acoes"><button type="button" class="btn sm primary" data-salvar-medida="${m.data}">Salvar</button><button type="button" class="link" data-cancelar>Cancelar</button></span></li>`
    : `<li><i class="h-d">${dataCurta(m.data)}${m.hora ? ' ' + m.hora : ''}</i><span class="h-v">${fmt(m.peso)} kg <small>IMC ${fmt(imc(m.peso))}</small>${m.cintura ? ` <small>cintura ${fmt(m.cintura)} cm</small>` : ''}</span><span class="ed-acoes"><button type="button" class="del" data-editar-medida="${m.data}">Editar</button><button type="button" class="del" data-apagar-medida="${m.data}">Apagar</button></span></li>`).join('')
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
