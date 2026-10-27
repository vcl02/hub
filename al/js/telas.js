'use strict';
// Tela do dia: saldo, macros, campo "o que comi" (sugestões, IA e prévia), lista do dia e os últimos 7 dias.
let diaVisto = hoje(), previa = null;
// 1º dia do app: o mais antigo com comida ou caminhada registrada (sem nada, hoje). Antes dele não há o que ver.
const inicio = () => [hoje(), ...db.registros.map(r => r.data), ...db.dias.map(x => x.data)].reduce((a, b) => b < a ? b : a);

function desenhar() {
  if (diaVisto > hoje()) diaVisto = hoje();
  if (diaVisto < inicio()) diaVisto = inicio();
  $('d-nome').textContent = nomeDoDia(diaVisto);
  $('d-ant').disabled = diaVisto <= inicio();
  $('d-prox').disabled = diaVisto >= hoje();
  $('f-texto').placeholder = diaVisto === hoje() ? 'O que você comeu?' : 'O que você comeu neste dia?';
  pintarSaldo(); pintarMacros(); pintarSugestoes(); pintarPrevia(); pintarLista(); pintarSemana();
}

// Hoje: quanto ainda cabe até a meta ("kcal restantes") ou quanto passou dela; o gasto só fecha no fim do dia.
// Dias passados: o saldo final (comido − gasto), de déficit ou de superávit.
// Embaixo, uma informação por linha: meta (com o déficit planejado, pequeno), comido e, nos dias passados, o gasto.
function pintarSaldo() {
  const { gasto: g, comido: c, saldo } = saldoDoDia(diaVisto), meta = metaDoDia(diaVisto), aberto = diaVisto === hoje();
  const resto = meta ? meta.kcal - c.kcal : null;
  const bom = aberto ? resto != null && resto >= 0 : saldo != null && saldo <= 0;
  const linha = (rotulo, v) => `<span>${rotulo} <b>${inteiro(v)} kcal</b></span>`;
  const linhaMeta = () => linha(`Meta <small>${inteiro(DEFICIT_META)} kcal déficit</small>`, meta.kcal);   // meta = gasto − déficit planejado
  $('saldo').className = 'cartao saldo' + (!g ? '' : bom ? ' deficit' : ' superavit');
  $('s-valor').textContent = !g ? '—' : inteiro(Math.abs(aberto ? resto : saldo));
  $('s-rotulo').textContent = !g ? 'kcal' : aberto ? (resto >= 0 ? 'kcal restantes' : 'kcal acima da meta') : saldo <= 0 ? 'kcal de déficit' : 'kcal de superávit';
  $('s-conta').innerHTML = !g ? `${linha('Comi', c.kcal)}<span>Sem pesagem no Corpo para calcular o gasto</span>`
    : aberto ? linhaMeta() + linha('Comi', c.kcal) : linha('Comi', c.kcal) + linha('Gastei', g.total) + linhaMeta();
  // Hoje é dia de treino e ainda não treinou: quanto a mais dá para comer depois do treino
  // Dia de treino opcional (extra) em que já passou da meta e ainda não treinou: o treino vira obrigatório. Alerta urgente
  // com o quanto o treino ajuda (volta para a meta ou só diminui o excesso), o risco de fechar em superávit e o botão do Treino.
  const urgente = aberto && g?.previsto?.extra && resto < 0;
  $('s-alerta').hidden = !urgente;
  if (urgente) {
    const p = g.previsto, passou = -resto, depois = passou - p.kcal, superavit = c.kcal - g.total, comTreino = c.kcal - g.total - p.kcal;
    $('s-alerta-txt').innerHTML = [
      `Passou <b>${inteiro(passou)} kcal</b> da meta.`,
      depois <= 0 ? `Se treinar, você ganha ${inteiro(p.kcal)} kcal e <b>volta para a meta</b>.`
        : `Se treinar, você ganha ${inteiro(p.kcal)} kcal e o excesso cai para <b>${inteiro(depois)} kcal</b>.`,
      superavit > 0 ? `Sem treino o dia fecha em <b>superávit de ${inteiro(superavit)} kcal</b>${comTreino <= 0 ? '; treinando, ainda fecha em déficit' : ''}.` : ''
    ].filter(Boolean).map(t => `<span>${t}</span>`).join('');
  }
  $('s-previsto').hidden = !(aberto && g?.previsto) || urgente;
  if (aberto && g?.previsto) $('s-previsto').textContent = `Você ganha ${inteiro(g.previsto.kcal)} kcal a mais para comer se treinar${g.previsto.extra ? ' (treino opcional)' : ''}`;
  // Andei: os trechos do dia ("12:10 · 20 min ×") e o total no saldo
  const cam = g?.caminhada, valor = v => String(v).replace('.', ',');
  $('andei').hidden = !g;
  $('c-kcal').textContent = cam ? `−${inteiro(cam.kcal)} kcal` : '';
  $('c-lista').innerHTML = (cam?.trechos || []).map((t, i) => {
    const quanto = [t.minutos && `${valor(t.minutos)} min`, t.km && `${valor(t.km)} km`].filter(Boolean).join(' · ') || `${CAMINHADA_MIN_PADRAO} min`;
    return `<li><button type="button" data-tirar-trecho="${i}" aria-label="Tirar trecho">${t.hora ? `${t.hora} · ` : ''}${quanto} ×</button></li>`;
  }).join('');
}

// Macros do dia contra a meta: gramas comidas / meta, quanto falta ou quanto passou, e a barra de cada um
function pintarMacros() {
  const c = comidoNoDia(diaVisto), meta = metaDoDia(diaVisto);
  const M = [['prot', 'Proteína'], ['carb', 'Carboidrato'], ['gord', 'Gordura']];
  $('macros').innerHTML = M.map(([k, nome]) => {
    const alvo = meta?.[k], dif = alvo != null ? alvo - c[k] : null;
    return `<div class="m-linha m-${k}">
      <p><span>${nome}</span> <b>${inteiro(c[k])}${alvo != null ? ` <small>/ ${inteiro(alvo)} g</small>` : ' <small>g</small>'}</b> ${dif == null ? '' : `<i class="${dif >= 0 ? '' : 'ruim'}">${dif >= 0 ? `faltam ${inteiro(dif)} g` : `passou ${inteiro(-dif)} g`}</i>`}</p>
      ${alvo ? `<div class="m-barra" aria-hidden="true"><span style="width:${Math.min(100, c[k] / alvo * 100)}%"></span></div>` : ''}
    </div>`;
  }).join('');
}

// Sugestões enquanto digita (comidas salvas parecidas); com o campo vazio, as mais usadas.
function pintarSugestoes() {
  const t = $('f-texto').value.trim(), L = previa ? [] : t ? sugestoes(t) : frequentes();
  $('f-sugestoes').innerHTML = L.map(i => `<li><button type="button" class="sug" data-item="${i.id}"><b>${esc(i.nome)}</b> <span>${esc(i.porcao)}</span> <i>${inteiro(i.kcal)} kcal</i></button></li>`).join('');
}

// Prévia editável: nome, quantas porções × a porção, e o total comido (kcal e gramas) de cada item antes de adicionar
const CAMPOS = [['kcal', 'kcal'], ['prot', 'P (g)'], ['carb', 'C (g)'], ['gord', 'G (g)']];
function pintarPrevia() {
  $('previa').hidden = !previa;
  if (!previa) { $('p-lista').innerHTML = ''; return; }
  $('p-lista').innerHTML = previa.map((x, i) => `<li data-i="${i}">
    <div class="p-nome"><input data-campo="nome" value="${esc(x.nome)}" maxlength="60" placeholder="Comida" aria-label="Comida">${btIcone('x', 'Tirar', `data-tirar="${i}"`)}<span class="p-porcao"><input data-campo="qtd" inputmode="decimal" value="${String(x.qtd ?? 1).replace('.', ',')}" aria-label="Quantas porções"><small>×</small><input data-campo="porcao" value="${esc(x.porcao)}" maxlength="60" placeholder="1 porção" aria-label="Uma porção"></span></div>
    <div class="p-num">${CAMPOS.map(([k, r]) => `<label><span>${r}</span><input data-campo="${k}" inputmode="decimal" value="${String(x[k]).replace('.', ',')}" aria-label="${r}"></label>`).join('')}</div>
  </li>`).join('');
}
function lerPrevia() {
  $('p-lista').querySelectorAll('li').forEach(li => {
    const x = previa[+li.dataset.i];
    li.querySelectorAll('input').forEach(inp => {
      const k = inp.dataset.campo;
      x[k] = k === 'nome' || k === 'porcao' ? inp.value.trim().slice(0, 60) : Math.max(0, num(inp.value) || 0);
      if (k === 'qtd') x.qtd = x.qtd > 0 ? Math.min(x.qtd, 20) : 1;   // quantas porções: vazio ou zero = 1, até 20 (o limite do al_registro)
    });
  });
}

function pintarLista() {
  const L = db.registros.filter(r => r.data === diaVisto).sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99'));
  $('h-comidas').hidden = !L.length;
  $('lista').innerHTML = L.map(r => `<li>
    <span class="l-hora">${r.hora || ''}</span>
    <span class="l-txt"><b>${esc(r.nome)}</b> <small>${r.qtd !== 1 ? fmtQtd(r.qtd) + ' × ' : ''}${esc(r.porcao)}</small> <small class="l-mac">P ${umaCasa(r.prot * r.qtd)} · C ${umaCasa(r.carb * r.qtd)} · G ${umaCasa(r.gord * r.qtd)}</small></span>
    <span class="l-kcal">${inteiro(r.kcal * r.qtd)} <small>kcal</small></span>
    <span class="l-acoes"><select data-qtd="${r.id}" title="Porções" aria-label="Porções">${[...new Set([...QTDS, r.qtd])].sort((a, b) => a - b).map(q => `<option value="${q}"${q === r.qtd ? ' selected' : ''}>${fmtQtd(q)}×</option>`).join('')}</select>${btIcone('lixo', 'Apagar', `data-apagar="${r.id}"`, 'perigo')}</span>
  </li>`).join('');
}

// Últimos 7 dias até hoje (desde o 1º dia do app): comido e saldo de cada um (o dia mostrado em destaque). Hoje ainda não
// fechou: sem saldo e fora da média, que é só dos dias fechados com comida registrada.
function pintarSemana() {
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(hoje(), -i)).filter(d => d >= inicio());
  const S = dias.map(d => ({ d, ...saldoDoDia(d) })).map(s => s.d === hoje() ? { ...s, saldo: null } : s);
  const comDados = S.filter(s => s.comido.kcal > 0 && s.saldo != null);
  const media = comDados.length ? Math.round(comDados.reduce((t, s) => t + s.saldo, 0) / comDados.length) : null;
  const sinal = v => (v > 0 ? '+' : v < 0 ? '−' : '') + inteiro(Math.abs(v));
  $('semana').innerHTML = `<ul class="sem-lista">${S.map(s => `<li class="${s.d === diaVisto ? 'visto' : ''}"><button type="button" data-dia="${s.d}"><span>${nomeDoDia(s.d)}</span> <span>${s.comido.kcal ? inteiro(s.comido.kcal) + ' kcal' : '—'}</span> <b class="${s.saldo == null || !s.comido.kcal ? '' : s.saldo <= 0 ? 'bom' : 'ruim'}">${s.saldo == null || !s.comido.kcal ? '' : sinal(s.saldo)}</b></button></li>`).join('')}</ul>
    ${media == null ? '' : `<p class="sem-media">Média ${comDados.length === 1 ? 'de 1 dia fechado' : `de ${comDados.length} dias fechados`}: <b class="${media <= 0 ? 'bom' : 'ruim'}">${sinal(media)} kcal/dia</b></p>`}`;
}

// ===== Interações =====
function mudar(acao) { acao(); gravar(); desenhar(); }

$('d-ant').addEventListener('click', () => { if (diaVisto > inicio()) { diaVisto = somaDias(diaVisto, -1); previa = null; desenhar(); } });
$('d-prox').addEventListener('click', () => { if (diaVisto < hoje()) { diaVisto = somaDias(diaVisto, 1); previa = null; desenhar(); } });
$('semana').addEventListener('click', ev => { const b = ev.target.closest('[data-dia]'); if (b) { diaVisto = b.dataset.dia; previa = null; desenhar(); } });

// Andei +: cada caminhada do dia é um trecho (horário de agora; em dia passado, sem horário) com tempo e/ou distância
// opcionais (vazios = 20 min). Toque duplo no trecho tira; sem trecho, o dia sai (nem conta como dia com registro).
function marcarCaminhada() {
  const campo = id => { const t = $(id).value.trim(); return t ? num(t) : null; };
  const minutos = campo('c-min'), km = campo('c-km');
  if ((minutos != null && !(minutos > 0 && minutos <= 600)) || (km != null && !(km > 0 && km <= 60))) { toast('Até 600 min e 60 km por trecho', true); return; }
  let d = db.dias.find(x => x.data === diaVisto);
  if (d && d.caminhadas.length >= TRECHOS_MAX) { toast(`No máximo ${TRECHOS_MAX} trechos por dia`, true); return; }
  mudar(() => {
    if (!d) { d = { data: diaVisto, caminhadas: [] }; db.dias.push(d); }
    d.caminhadas.push({ hora: diaVisto === hoje() ? agoraHHMM() : '', ...(minutos && { minutos }), ...(km && { km }) });
    d.caminhadas.sort((a, b) => a.hora.localeCompare(b.hora));
  });
  $('c-min').value = ''; $('c-km').value = '';
}
$('c-mais').addEventListener('click', marcarCaminhada);
for (const id of ['c-min', 'c-km']) $(id).addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); marcarCaminhada(); } });
$('c-lista').addEventListener('click', ev => {
  const b = ev.target.closest('[data-tirar-trecho]'), d = db.dias.find(x => x.data === diaVisto);
  if (!b || !d || !confirmar(b)) return;
  mudar(() => {
    d.caminhadas.splice(+b.dataset.tirarTrecho, 1);
    if (!d.caminhadas.length) db.dias = db.dias.filter(x => x !== d);
  });
});

$('f-texto').addEventListener('input', pintarSugestoes);
$('f-sugestoes').addEventListener('click', ev => {
  const b = ev.target.closest('[data-item]'), item = b && db.itens.find(i => i.id === b.dataset.item);
  if (!item) return;
  mudar(() => comer(item, diaVisto));
  $('f-texto').value = ''; pintarSugestoes();
  toast(`${item.nome} adicionado`);
});

let perguntando = false;
$('f-comer').addEventListener('submit', async ev => {
  ev.preventDefault();
  const texto = $('f-texto').value.trim();
  if (!texto || perguntando) return;
  const igual = itemIgual(texto);
  if (igual) { mudar(() => comer(igual, diaVisto)); $('f-texto').value = ''; pintarSugestoes(); toast(`${igual.nome} adicionado`); return; }
  perguntando = true; $('f-carregando').hidden = false; $('f-enviar').disabled = true;
  try { previa = (await perguntarIA(texto)).map(x => ({ ...x })); }
  catch (e) { toast(e.message, true); previa = [{ nome: texto.slice(0, 60), porcao: '', qtd: 1, kcal: 0, prot: 0, carb: 0, gord: 0 }]; }
  finally { perguntando = false; $('f-carregando').hidden = true; $('f-enviar').disabled = false; }
  desenhar();
  $('p-lista').querySelector('input')?.focus();
});

$('p-lista').addEventListener('click', ev => {
  const b = ev.target.closest('[data-tirar]');
  if (!b) return;
  lerPrevia(); previa.splice(+b.dataset.tirar, 1);
  if (!previa.length) previa = null;
  desenhar();
});
$('p-cancelar').addEventListener('click', () => { previa = null; desenhar(); });
$('p-adicionar').addEventListener('click', () => {
  lerPrevia();
  const validos = previa.filter(x => x.nome);
  if (!validos.length) { toast('Dê um nome à comida.', true); return; }
  // Hoje entra o total comido (porção × qtd); a comida salva para as próximas vezes fica por 1 porção (o total ÷ qtd)
  mudar(() => { for (const x of validos) { const q = x.qtd > 0 ? x.qtd : 1; comer(salvarItem(porPorcao(x, q)), diaVisto, q); } previa = null; });
  $('f-texto').value = ''; pintarSugestoes();
  toast(validos.length === 1 ? `${validos[0].nome} adicionado` : `${validos.length} itens adicionados`);
});

$('lista').addEventListener('change', ev => {
  const s = ev.target.closest('[data-qtd]'), r = s && db.registros.find(x => x.id === s.dataset.qtd);
  if (r) mudar(() => { r.qtd = num(s.value); });
});
$('lista').addEventListener('click', ev => {
  const b = ev.target.closest('[data-apagar]');
  if (!b || !confirmar(b)) return;
  mudar(() => { db.registros = db.registros.filter(r => r.id !== b.dataset.apagar); });
});
