'use strict';
// Tela inicial: lista de exercícios e semana.
// ===== Início =====
function ultimo(variacaoId) { let u = null; for (const r of db.registros) if (r.variacao === variacaoId && (!u || r.data > u.data)) u = r; return u; }
const registroHoje = e => db.registros.find(r => r.data === hoje() && e.variacoes.some(v => v.id === r.variacao));
// Dia mostrado na lista: null = hoje. Arrastar a lista (ou o progresso) troca o dia, só entre dias treinados, sem sair da tela.
let diaInicio = null;
const registroDe = (e, dia) => db.registros.find(r => r.data === dia && e.variacoes.some(v => v.id === r.variacao));
telas.inicio = () => { diaInicio = null; pintarInicio(); };
function pintarInicio() {
  const dia = diaInicio || hoje(), passado = !!diaInicio;
  let feitos = 0; const trav = !passado && travadoHoje();
  $('i-lista').innerHTML = db.exercicios.map(e => {
    e.ativo = variacaoAtiva(e);
    const rDia = passado ? registroDe(e, dia) : null, iv = rDia ? e.variacoes.findIndex(x => x.id === rDia.variacao) : e.ativo;
    const v = e.variacoes[iv], u = passado ? rDia : ultimo(v.id), feito = passado ? !!rDia : !!registroHoje(e); if (feito) feitos++;
    const chips = passado
      ? (feito ? '<span class="chip ok">✓ Feito</span>' : '<span class="chip">Não feito</span>')
      : (feito ? '<span class="chip ok">✓ Feito hoje</span>' : trav ? '<span class="chip">Sem séries salvas hoje</span>' : '') + (completo(u, e) ? '<span class="chip acao">↑ Subir carga</span>' : '');
    return `<li><button type="button" class="slot" data-ex="${e.id}">
      <span class="slot-main"><span class="eyebrow">${esc(e.grupo)}${iv > 0 ? ` · <i>${TIPOS[iv].toLowerCase()}</i>` : ''}${v.equip ? ` · nº ${esc(v.equip)}` : ''}</span>
      <span class="name">${esc(v.nome)}</span><span class="r">${Array.from({ length: e.series }, (_, i) => alvoReps(e, i)).join(' → ')} reps · ${e.descanso} s</span>
      <span class="chips">${chips}${u?.series.some(s => s.falha) ? `<span class="chip falha">✗ Falhou${passado ? '' : ' na última'}</span>` : ''}</span></span>
      <span class="slot-load">${u ? `<span class="w">${fmt(topo(u))}<small>${esc(unidadeTxt(v))}</small></span><span class="r">${repsTxt(u)} · <i>${passado ? dataCurta(u.data) : quando(u.data)}</i></span>` : `<span class="r">${passado ? '—' : 'sem registro'}</span>`}</span>
    </button></li>`;
  }).join('');
  $('i-lista').classList.toggle('travado', !!trav);
  $('i-lista').classList.toggle('passado', passado);
  $('i-cont-l').textContent = passado ? `${NOME_DIA[deIso(dia).getDay()]}, ${dataCurta(dia)}` : 'Registrados hoje';
  $('i-hoje').hidden = !passado;
  $('i-cont').textContent = trav ? '✓ Treino feito' : feitos + '/' + db.exercicios.length;
  $('i-barra').style.width = (trav ? 100 : db.exercicios.length ? feitos / db.exercicios.length * 100 : 0) + '%';
  semana(); pintarTempo(); pintarJogo(estatisticas()); pintarCorpoInicio();
}
// Mostra um dia na lista: a semana acompanha (a do dia mostrado) e o dia fica marcado nela
function mostrarDia(dia) {
  diaInicio = dia && dia < hoje() ? dia : null;
  semanasAtras = Math.round((deIso(semanaDe(hoje())) - deIso(semanaDe(diaInicio || hoje()))) / (7 * 864e5));
  pintarInicio();
}
// Para a esquerda: o treino anterior ao dia mostrado · para a direita: o seguinte, até hoje
const arrastarDia = dir => { const d = diaVizinho(dir, diaInicio || hoje()); if (d) mostrarDia(d); else if (dir > 0 && diaInicio) mostrarDia(null); };
arrastarLado($('i-lista'), arrastarDia); arrastarLado(document.querySelector('#v-inicio .progress'), arrastarDia);
$('i-hoje').addEventListener('click', () => mostrarDia(null));
// Semana mostrada: 0 = atual; ‹ volta até a semana do 1º dia treinado, › avança até a atual
let semanasAtras = 0;
function semana() {
  const agora = new Date(), h = hoje(), dias = diasTreinados(), primeiro = [...dias].sort()[0];
  const seg = deIso(somaDias(semanaDe(h), -7 * semanasAtras));
  let fixos = 0, extra = false, html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + i), wd = d.getDay(), k = iso(d), feito = dias.has(k);
    const tipo = DIAS_FIXOS.includes(wd) ? 'fix' : DIAS_EXTRA.includes(wd) ? 'sug' : 'off';
    if (feito && tipo === 'fix') fixos++; if (feito && tipo === 'sug') extra = true;
    html += `<li class="day ${tipo}${k === h ? ' today' : ''}${feito ? ' done' : ''}${k === diaInicio ? ' sel' : ''}"${feito ? ` data-dia="${k}"` : ''}><span class="dn">${NOME_DIA[wd]}</span><span class="dd">${d.getDate()}</span><span class="dm">${feito ? '✓' : tipo === 'fix' ? 'fixo' : tipo === 'sug' ? 'extra' : ''}</span></li>`;
  }
  $('i-semana').innerHTML = html;
  $('i-sem-ant').disabled = !primeiro || iso(seg) <= semanaDe(primeiro);
  $('i-sem-prox').disabled = semanasAtras === 0;
  const wd = agora.getDay(), treino = d => DIAS_FIXOS.includes(d) || DIAS_EXTRA.includes(d);
  let msg;
  if (semanasAtras) msg = `${dataCurta(iso(seg))} a ${dataCurta(somaDias(iso(seg), 6))}`;
  else if (DIAS_FIXOS.includes(wd)) msg = 'Hoje é dia de treino fixo.';
  else if (DIAS_EXTRA.includes(wd)) msg = 'Hoje é o treino extra sugerido (opcional).';
  else { let n = 1; while (!treino((wd + n) % 7)) n++; const p = (wd + n) % 7; msg = `Descanso. Próximo: ${n === 1 ? 'amanhã (' + DIA_LONGO[p] + ')' : DIA_LONGO[p]}${DIAS_EXTRA.includes(p) ? ', extra' : ''}.`; }
  $('i-msg').textContent = msg;
  $('i-cont-semana').textContent = `${fixos}/${DIAS_FIXOS.length} fixos${extra ? ' + extra' : ''}`;
}
$('i-sem-ant').addEventListener('click', () => { semanasAtras++; semana(); });
$('i-sem-prox').addEventListener('click', () => { semanasAtras = Math.max(0, semanasAtras - 1); semana(); });
// Arrastar a linha da semana: para a esquerda volta uma semana, para a direita avança (mesmos limites do ‹ ›)
const arrastarSemana = dir => { const b = dir > 0 ? $('i-sem-prox') : $('i-sem-ant'); if (!b.disabled) b.click(); };
arrastarLado($('i-semana'), arrastarSemana); arrastarLado(document.querySelector('.week-msg'), arrastarSemana);
