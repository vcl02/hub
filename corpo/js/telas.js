'use strict';
// Tela do corpo: peso atual (IMC, faixa, quanto falta, variação, barriga), perfil, nova medida, sono e evacuações, gráficos e histórico.
// IMC = peso / altura² · faixas da OMS para adultos, com os graus de magreza e de obesidade: [limite de cima (exclusivo), nome]
const imc = peso => Math.round(peso / PERFIL.altura ** 2 * 10) / 10;
const FAIXAS_IMC = [[16, 'Magreza III'], [17, 'Magreza II'], [18.5, 'Magreza I'], [25, 'Normal'], [30, 'Sobrepeso'],
  [35, 'Obesidade I'], [40, 'Obesidade II'], [Infinity, 'Obesidade III']];
const faixaImc = i => FAIXAS_IMC.find(([lim]) => i < lim)[1];
// Quanto falta para a faixa seguinte rumo ao normal (acima do normal, kg a perder · abaixo, kg a ganhar · normal, nada).
// Anda de 0,1 em 0,1 kg com o mesmo IMC arredondado da tela, para o número sempre bater com a faixa mostrada.
function rumoAoNormal(peso) {
  const atual = faixaImc(imc(peso)), k = FAIXAS_IMC.findIndex(f => f[1] === atual), normal = 3;
  if (k === normal) return '';
  const passo = k > normal ? -1 : 1;
  for (let d = 1; d <= 3000; d++) {
    const p = Math.round((peso + passo * d / 10) * 10) / 10, f = faixaImc(imc(p));
    if (f !== atual) return `${fmt(d / 10)} kg até ${f}`;   // sem sinal: a faixa seguinte já diz se é perder ou ganhar
  }
  return '';
}
const sinal = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const recentes = () => [...db.medidas].reverse();   // mais recente primeiro
const horaHabitual = () => recentes().find(m => m.peso && m.hora)?.hora || '';
let editando = null;

function desenhar() {
  const L = recentes(), P = L.filter(m => m.peso), C = L.filter(m => m.cintura), u = P[0], prim = P[P.length - 1];
  // Card do peso atual: número grande, IMC, faixa, quanto falta, variação desde a 1ª pesagem e barriga
  $('c-resumo').hidden = !u && !C.length;
  const dif = u ? Math.round((u.peso - prim.peso) * 10) / 10 : 0, falta = u ? rumoAoNormal(u.peso) : '';
  const dc = C.length > 1 ? Math.round((C[0].cintura - C[C.length - 1].cintura) * 10) / 10 : 0;
  $('c-resumo').innerHTML = `${u ? `<b>${fmt(u.peso)}<small>kg</small></b>` : ''}<span class="pc-lado">
    ${u && u.data !== hoje() ? `<span><i>${quando(u.data)}</i></span>` : ''}
    ${u ? `<span>IMC <b>${fmt(imc(u.peso))}</b> · <b>${faixaImc(imc(u.peso))}</b></span>` : ''}
    ${falta ? `<span class="falta">${falta}</span>` : ''}
    ${P.length > 1 && dif ? `<span class="${dif < 0 ? 'bom' : 'ruim'}">${sinal(dif)} kg desde ${dataCurta(prim.data)}</span>` : ''}
    ${C.length ? `<span>Barriga <b>${fmt(C[0].cintura)} cm</b>${dc ? ` · <span class="${dc < 0 ? 'bom' : 'ruim'}">${sinal(dc)} cm</span>` : ''}</span>` : ''}
  </span>`;
  $('c-perfil').textContent = `${idadeEm(hoje())} anos · ${virgula(PERFIL.altura)} m${u ? ` · basal ~${tmb(u.peso, hoje()).toLocaleString('pt-BR')} kcal/dia` : ''}`;
  // Formulário: o dia escolhido (hoje por padrão) já com o que foi medido nele
  const m = db.medidas.find(x => x.data === $('c-data').value);
  if (document.activeElement !== $('c-peso')) $('c-peso').value = m?.peso ? virgula(m.peso) : '';
  if (document.activeElement !== $('c-cintura')) $('c-cintura').value = m?.cintura ? virgula(m.cintura) : '';
  // Campo vazio mostra, apagada, a última medida (é dela que o − / + parte)
  $('c-peso').placeholder = u ? virgula(u.peso) : '—';
  $('c-cintura').placeholder = C.length ? virgula(C[0].cintura) : '—';
  avisoHorario();
  pintarEvacuacao();
  // Evolução: só os últimos 90 dias (até hoje)
  const desde = somaDias(hoje(), -(DIAS_GRAFICO - 1)), janela = L => L.filter(x => x.data >= desde).reverse();
  grafico($('c-grafico'), janela(P).map(x => ({ data: x.data, valor: x.peso })), 'kg', 'Evolução do peso');
  grafico($('c-grafico-cint'), janela(C).map(x => ({ data: x.data, valor: x.cintura })), 'cm', 'Evolução da barriga');
  pintarHistorico();
}

// O dia do formulário: horas de sono e evacuações (quantas e os horários) e há quanto tempo foi a última evacuação.
// 3 dias ou mais sem evacuar desde a última: em vermelho (prisão de ventre é comum em dieta: fibra e água).
const SEM_EVACUAR_ALERTA = 3;
const diaDoForm = () => db.dias.find(d => d.data === $('c-data').value);
function pintarEvacuacao() {
  $('ev-cartao').hidden = semCorpoDia;
  const x = diaDoForm(), ev = x?.evacuacoes || [];
  if (document.activeElement !== $('d-sono')) $('d-sono').value = x?.sono != null ? virgula(x.sono) : '';
  $('ev-total').textContent = ev.length;
  $('ev-horas').innerHTML = ev.map((h, i) => `<li><button type="button" data-tirar-ev="${i}" title="Tirar (toque duplo)" aria-label="Tirar evacuação ${h || 'sem horário'}">${h || 'sem horário'} ×</button></li>`).join('');
  const ultima = [...db.dias].reverse().find(d => d.evacuacoes.length && d.data <= hoje());
  // Só avisa quando faz 3 dias ou mais desde a última evacuação (prisão de ventre é comum em dieta: fibra e água)
  const n = ultima ? Math.round((deIso(hoje()) - deIso(ultima.data)) / 864e5) : 0;
  $('ev-ultima').hidden = !ultima || n < SEM_EVACUAR_ALERTA;
  if (!$('ev-ultima').hidden) $('ev-ultima').textContent = `${n} dias sem evacuar (última em ${dataCurta(ultima.data)})`;
}
// Muda o registro do dia do formulário; dia que fica sem evacuação nem sono sai (preparar)
function mudarDia(acao) {
  const dia = $('c-data').value;
  if (!dataOk(dia) || dia > hoje()) { toast('Data inválida', true); return; }
  mudar(() => {
    let x = db.dias.find(d => d.data === dia);
    if (!x) { x = { data: dia, evacuacoes: [] }; db.dias.push(x); }
    acao(x); db = preparar(db);
  });
}

function avisoHorario() {   // só recomenda o horário de sempre: qualquer horário é aceito
  const hab = horaHabitual(), h = $('c-hora').value, longe = hab && h && Math.abs(minutos(h) - minutos(hab)) > 60;
  $('c-aviso').hidden = !longe;
  $('c-aviso').innerHTML = longe ? `Fora do seu horário de sempre (<b>${hab}</b>): para comparar os dias, prefira pesar perto dele.` : '';
}

function pintarHistorico() {
  const L = recentes();
  $('c-historico').innerHTML = L.length ? L.map(m => m.data === editando
    ? `<li class="editando"><span class="ed-inline"><input type="date" id="em-data" value="${m.data}" max="${hoje()}" aria-label="Data"><input type="time" id="em-hora" value="${m.hora}" aria-label="Horário"><input id="em-peso" inputmode="decimal" value="${m.peso ? virgula(m.peso) : ''}" placeholder="kg" title="Peso (kg)" aria-label="Peso em kg"><input id="em-cint" inputmode="decimal" value="${m.cintura ? virgula(m.cintura) : ''}" placeholder="cm" title="Barriga (cm, linha do umbigo)" aria-label="Barriga em cm"></span><span class="ed-acoes">${btIcone('x', 'Cancelar', 'data-cancelar')}${btIcone('ok', 'Salvar', `data-salvar="${m.data}"`, 'ok')}</span></li>`
    : `<li class="medida"><i class="h-d">${dataCurta(m.data)}${m.hora ? ' <br>' + m.hora : ''}</i> <span class="h-v">${[m.peso && fmt(m.peso) + '\u00a0kg', m.cintura && fmt(m.cintura) + '\u00a0cm'].filter(Boolean).join(' · ')}${m.peso ? `<small class="h-sub"> · IMC ${fmt(imc(m.peso))}</small>` : ''}</span> <span class="ed-acoes">${btIcone('lapis', 'Editar', `data-editar="${m.data}"`)}${btIcone('lixo', 'Apagar', `data-apagar="${m.data}"`, 'perigo')}</span></li>`).join('')
    : '<li class="vazio">Nenhuma medida ainda.</li>';
}

// Peso e barriga válidos: peso de 30 a 300 kg, barriga > 0; vazio = não medido. Pelo menos um dos dois.
function lerValores(peso, cintura) {
  const p = String(peso).trim() ? num(peso) : null, c = String(cintura).trim() ? num(cintura) : null;
  if (p != null && !(p >= PESO_MIN && p <= PESO_MAX)) return { erro: 'Peso entre 30 e 300 kg' };
  if (c != null && !(c > 0 && c <= CINTURA_MAX)) return { erro: 'Barriga em cm' };
  if (p == null && c == null) return { erro: 'Informe o peso ou a barriga' };
  return { ...(p != null && { peso: p }), ...(c != null && { cintura: c }) };
}

// Quando o peso do dia foi lançado (pesoEm, relógio do celular): o primeiro lançamento fica, corrigir o valor depois não muda;
// sem peso, nada. O hábito do peso na página inicial do hub só conta pesagem lançada no próprio dia.
const pesoLancado = (antes, v) => !v.peso ? {} : antes?.peso ? (antes.pesoEm ? { pesoEm: antes.pesoEm } : {}) : { pesoEm: new Date().toISOString() };

// ===== Interações =====
function mudar(acao) { acao(); gravar(); desenhar(); }

$('c-hora').addEventListener('input', avisoHorario);
// +1: evacuação com o horário de agora (o do celular, fuso de São Paulo); tocar num horário (duas vezes) tira
$('ev-mais').addEventListener('click', () => {
  const h = agoraHHMM();
  mudarDia(x => { x.evacuacoes.push(h); });
  toast(`Evacuação${h ? ' às ' + h : ''}`);
});
$('ev-horas').addEventListener('click', ev => {
  const b = ev.target.closest('[data-tirar-ev]');
  if (b && confirmar(b)) mudarDia(x => { x.evacuacoes.splice(+b.dataset.tirarEv, 1); });
});
// Sono: horas (0 a 24, vírgula aceita); vazio tira
$('d-sono').addEventListener('change', () => {
  const v = String($('d-sono').value).trim() ? num($('d-sono').value) : null;
  if (v != null && !(v >= 0 && v <= 24)) { toast('Sono em horas, de 0 a 24', true); return; }
  // sonoEm: quando o sono do dia foi lançado (corrigir as horas depois mantém o primeiro lançamento)
  mudarDia(x => { if (v == null) { delete x.sono; delete x.sonoEm; } else { if (x.sono == null) x.sonoEm = new Date().toISOString(); x.sono = v; } });
});
$('c-data').addEventListener('change', () => { $('c-peso').value = ''; $('c-cintura').value = ''; desenhar(); });
document.querySelectorAll('[data-passo]').forEach(b => b.addEventListener('click', () => {   // − / +: peso de 0,1 em 0,1 kg, barriga de 0,5 cm
  const inp = $(b.dataset.passo === 'peso' ? 'c-peso' : 'c-cintura'), d = b.dataset.passo === 'peso' ? .1 : .5;
  const atual = num(inp.value), ref = isFinite(atual) ? atual : num(inp.placeholder) || 0;
  inp.value = virgula(Math.max(0, Math.round((ref + +b.dataset.dir * d) * 100) / 100));
}));

$('c-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const data = $('c-data').value, v = lerValores($('c-peso').value, $('c-cintura').value);
  if (!dataOk(data) || data > hoje()) { toast('Data inválida', true); return; }
  if (v.erro) { toast(v.erro, true); return; }
  mudar(() => {
    const antes = db.medidas.find(m => m.data === data);
    db.medidas = db.medidas.filter(m => m.data !== data);
    db.medidas.push({ data, hora: $('c-hora').value, ...v, ...pesoLancado(antes, v) });
    db = preparar(db);
  });
  toast(`Salvo${v.peso ? ': ' + fmt(v.peso) + ' kg' : ''}${v.cintura ? (v.peso ? ' · ' : ': ') + fmt(v.cintura) + ' cm' : ''}`);
});

$('c-historico').addEventListener('click', ev => {
  const b = ev.target.closest('[data-editar],[data-salvar],[data-cancelar],[data-apagar]');
  if (!b) return;
  const d = b.dataset;
  if (d.editar) { editando = d.editar; pintarHistorico(); }
  else if ('cancelar' in d) { editando = null; pintarHistorico(); }
  else if (d.salvar) {
    const data = $('em-data').value, v = lerValores($('em-peso').value, $('em-cint').value);
    if (!dataOk(data) || data > hoje()) { toast('Data inválida', true); return; }
    if (v.erro) { toast(v.erro, true); return; }
    if (data !== d.salvar && db.medidas.some(x => x.data === data)) { toast('Já tem medida em ' + dataCurta(data), true); return; }   // 1 por dia
    editando = null;
    const antes = data === d.salvar ? db.medidas.find(m => m.data === data) : null;   // mudou de dia: é um lançamento novo nele
    mudar(() => { db.medidas = db.medidas.filter(m => m.data !== d.salvar); db.medidas.push({ data, hora: $('em-hora').value, ...v, ...pesoLancado(antes, v) }); db = preparar(db); });
    toast('Medida atualizada');
  }
  else if (d.apagar && confirmar(b)) mudar(() => { db.medidas = db.medidas.filter(m => m.data !== d.apagar); });
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && editando) { editando = null; pintarHistorico(); } });
