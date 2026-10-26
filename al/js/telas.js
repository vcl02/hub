'use strict';
// Tela do dia: saldo, macros, campo "o que comi" (sugestões, IA e prévia), lista do dia e os últimos 7 dias.
let diaVisto = hoje(), previa = null;

function desenhar() {
  if (diaVisto > hoje()) diaVisto = hoje();
  $('d-nome').textContent = nomeDoDia(diaVisto);
  $('d-prox').disabled = diaVisto >= hoje();
  $('f-texto').placeholder = diaVisto === hoje() ? 'O que você comeu?' : 'O que você comeu neste dia?';
  pintarSaldo(); pintarMacros(); pintarSugestoes(); pintarPrevia(); pintarLista(); pintarSemana();
}

function pintarSaldo() {
  const { gasto: g, comido: c, saldo } = saldoDoDia(diaVisto);
  $('saldo').className = 'cartao saldo' + (saldo == null ? '' : saldo <= 0 ? ' deficit' : ' superavit');
  $('s-valor').textContent = saldo == null ? '—' : (saldo > 0 ? '+' : saldo < 0 ? '−' : '') + inteiro(Math.abs(saldo));
  $('s-rotulo').textContent = saldo == null ? '' : saldo <= 0 ? 'déficit' : 'superávit';
  $('s-conta').textContent = g ? `Comi ${inteiro(c.kcal)} · Gastei ${inteiro(g.total)}` : `Comi ${inteiro(c.kcal)} · Sem peso no Treino para calcular o gasto`;
  $('s-gasto').textContent = g ? `Basal ${inteiro(g.basal)} × ${String(FATOR_ATIVIDADE).replace('.', ',')} = ${inteiro(g.rotina)}${g.treino ? ` · Treino +${inteiro(g.treino)}` : ''}${g.andou ? ` · Caminhada +${inteiro(g.caminhada)}` : ''} · ${umaCasa(g.peso)} kg` : '';
  $('andei').hidden = !g;
  if (g) {
    $('andei').setAttribute('aria-pressed', String(g.andou));
    $('andei').textContent = `${diaVisto === hoje() ? 'Andei hoje' : 'Andei neste dia'} · +${inteiro(g.caminhada)} kcal`;
  }
}

function pintarMacros() {
  const c = comidoNoDia(diaVisto), kc = { prot: c.prot * 4, carb: c.carb * 4, gord: c.gord * 9 }, soma = kc.prot + kc.carb + kc.gord;
  const pct = k => soma ? Math.round(kc[k] / soma * 100) : 0;
  const M = [['prot', 'Proteína'], ['carb', 'Carboidrato'], ['gord', 'Gordura']];
  $('macros').innerHTML = `<div class="m-cols">${M.map(([k, nome]) => `<p class="m-${k}"><b>${inteiro(c[k])}<small>g</small></b><span>${nome}</span><i>${pct(k)}%</i></p>`).join('')}</div>
    <div class="m-barra" aria-hidden="true">${soma ? M.map(([k]) => `<span class="m-${k}" style="width:${kc[k] / soma * 100}%"></span>`).join('') : ''}</div>`;
}

// Sugestões enquanto digita (comidas salvas parecidas); com o campo vazio, as mais usadas.
function pintarSugestoes() {
  const t = $('f-texto').value.trim(), L = previa ? [] : t ? sugestoes(t) : frequentes();
  $('f-sugestoes').innerHTML = L.map(i => `<li><button type="button" class="sug" data-item="${i.id}"><b>${esc(i.nome)}</b> <span>${esc(i.porcao)}</span> <i>${inteiro(i.kcal)} kcal</i></button></li>`).join('');
}

// Prévia editável: nome, porção, kcal e gramas de cada item antes de adicionar
const CAMPOS = [['kcal', 'kcal'], ['prot', 'P (g)'], ['carb', 'C (g)'], ['gord', 'G (g)']];
function pintarPrevia() {
  $('previa').hidden = !previa;
  if (!previa) { $('p-lista').innerHTML = ''; return; }
  $('p-lista').innerHTML = previa.map((x, i) => `<li data-i="${i}">
    <div class="p-nome"><input data-campo="nome" value="${esc(x.nome)}" maxlength="60" placeholder="Comida" aria-label="Comida"><input data-campo="porcao" value="${esc(x.porcao)}" maxlength="60" placeholder="Porção" aria-label="Porção">${btIcone('x', 'Tirar', `data-tirar="${i}"`)}</div>
    <div class="p-num">${CAMPOS.map(([k, r]) => `<label><span>${r}</span><input data-campo="${k}" inputmode="decimal" value="${String(x[k]).replace('.', ',')}" aria-label="${r}"></label>`).join('')}</div>
  </li>`).join('');
}
function lerPrevia() {
  $('p-lista').querySelectorAll('li').forEach(li => {
    const x = previa[+li.dataset.i];
    li.querySelectorAll('input').forEach(inp => {
      const k = inp.dataset.campo;
      x[k] = k === 'nome' || k === 'porcao' ? inp.value.trim().slice(0, 60) : Math.max(0, num(inp.value) || 0);
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

// Últimos 7 dias até hoje: comido e saldo de cada um (o dia mostrado em destaque), e a média dos dias com comida registrada
function pintarSemana() {
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(hoje(), -i));
  const S = dias.map(d => ({ d, ...saldoDoDia(d) }));
  const comDados = S.filter(s => s.comido.kcal > 0 && s.saldo != null);
  const media = comDados.length ? Math.round(comDados.reduce((t, s) => t + s.saldo, 0) / comDados.length) : null;
  const sinal = v => (v > 0 ? '+' : v < 0 ? '−' : '') + inteiro(Math.abs(v));
  $('semana').innerHTML = `<ul class="sem-lista">${S.map(s => `<li class="${s.d === diaVisto ? 'visto' : ''}"><button type="button" data-dia="${s.d}"><span>${nomeDoDia(s.d)}</span> <span>${s.comido.kcal ? inteiro(s.comido.kcal) + ' kcal' : '—'}</span> <b class="${s.saldo == null || !s.comido.kcal ? '' : s.saldo <= 0 ? 'bom' : 'ruim'}">${s.saldo == null || !s.comido.kcal ? '' : sinal(s.saldo)}</b></button></li>`).join('')}</ul>
    ${media == null ? '' : `<p class="sem-media">Média ${comDados.length === 1 ? 'de 1 dia' : `de ${comDados.length} dias`}: <b class="${media <= 0 ? 'bom' : 'ruim'}">${sinal(media)} kcal/dia</b></p>`}`;
}

// ===== Interações =====
function mudar(acao) { acao(); gravar(); desenhar(); }

$('d-ant').addEventListener('click', () => { diaVisto = somaDias(diaVisto, -1); previa = null; desenhar(); });
$('d-prox').addEventListener('click', () => { if (diaVisto < hoje()) { diaVisto = somaDias(diaVisto, 1); previa = null; desenhar(); } });
$('semana').addEventListener('click', ev => { const b = ev.target.closest('[data-dia]'); if (b) { diaVisto = b.dataset.dia; previa = null; desenhar(); } });

$('andei').addEventListener('click', () => mudar(() => {
  const d = db.dias.find(x => x.data === diaVisto);
  if (d) d.andou = !d.andou; else db.dias.push({ data: diaVisto, andou: true });
}));

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
  catch (e) { toast(e.message, true); previa = [{ nome: texto.slice(0, 60), porcao: '', kcal: 0, prot: 0, carb: 0, gord: 0 }]; }
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
  mudar(() => { for (const x of validos) comer(salvarItem(x), diaVisto); previa = null; });
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
