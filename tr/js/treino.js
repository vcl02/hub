'use strict';
// Tempo de treino (um por dia) e resumo do treino, de hoje ou de um dia antigo.
// ===== Tempo de treino =====
// Começa no 1º toque dentro de um exercício. Termina em "Finalizar" ou após 30 min sem mexer (no horário da última interação).
const INATIVO = 30 * 60 * 1000;
const ultimoTreino = () => db.treinos[db.treinos.length - 1];
const emAndamento = t => !!t && !t.fechado && Date.now() - t.fim <= INATIVO;
let editTreino = null;
// Um treino por dia: depois de finalizado (ou 30 min parado) com exercícios feitos, o dia fica travado até reabrir
const treinoHoje = () => { const t = ultimoTreino(); return t && iso(new Date(t.inicio)) === hoje() ? t : null; };
const travadoHoje = () => { const t = treinoHoje(); return t && !emAndamento(t) && (t.fechado || db.registros.some(r => r.data === hoje())) ? t : null; };
function marcarAtividade() {
  if (!db || travadoHoje()) return;
  const agora = Date.now(), t = ultimoTreino();
  if (emAndamento(t)) t.fim = agora;
  else if (treinoHoje()) { t.inicio = agora; t.fim = agora; delete t.fechado; }   // abriu e não chegou a treinar: recomeça a contagem
  else db.treinos.push({ inicio: agora, fim: agora });
  gravar(); pintarTempo();
}
function reabrirTreino() {
  const t = treinoHoje(); if (!t) return;
  delete t.fechado; t.fim = Date.now(); gravar();
  telas.exercicio(); toast('Treino de hoje reaberto');
}
function pintarTempo() {
  if (!db) return;
  const t = ultimoTreino(), ativo = emAndamento(t), box = $('i-treino');
  if (C) {   // cardio rodando (ou pausado) depois do treino: o tempo que falta e o atalho de volta para o cronômetro
    $('e-tempo').textContent = ''; box.classList.add('on'); box.hidden = false;
    box.innerHTML = `<span>Cardio na esteira${C.desde ? '' : ' · pausado'}</span><b>${relogio(C.alvo - feitoCardio())}</b><button type="button" class="btn sm" data-ir="cardio">Abrir</button>`;
    return;
  }
  $('e-tempo').textContent = ativo ? '⏱ ' + duracao(Date.now() - t.inicio) : '';
  box.classList.toggle('on', ativo);
  // Só durante o treino: o último treino já aparece em "Últimos treinos", no fim da tela inicial
  box.hidden = !ativo;
  box.innerHTML = ativo ? `<span>Treino em andamento desde ${hhmm(t.inicio)}</span><b>${duracao(Date.now() - t.inicio)}</b><button type="button" class="btn sm" data-finalizar>Finalizar</button>` : '';
}
function abrirEdicaoTreino(inicio) {
  const t = db.treinos.find(x => x.inicio === inicio); if (!t) return;
  editTreino = inicio;
  const li = document.querySelector(`[data-editar-treino="${inicio}"]`).closest('li');
  li.className = 'editando';
  li.innerHTML = `<i class="h-d">${dataCurta(iso(new Date(t.inicio)))}</i><span class="ed-inline"><input type="time" id="et-ini" value="${hhmm(t.inicio)}" aria-label="Início">–<input type="time" id="et-fim" value="${hhmm(t.fim)}" aria-label="Fim"></span><span class="ed-acoes">${btIcone('lixo', 'Excluir treino', `data-excluir-treino="${inicio}"`, 'perigo')}${btIcone('x', 'Cancelar', 'data-cancelar')}${btIcone('ok', 'Salvar', `data-salvar-treino="${inicio}"`, 'ok')}</span>`;
}
function finalizarTreino() {
  const t = ultimoTreino();
  if (emAndamento(t)) { t.fim = Date.now(); t.fechado = true; gravar(); }
  clearInterval(T.intervalo); T.intervalo = null; T.fim = 0; manterTela(false); salvarSessao();
  diaVisto = null; parabensPendente = true; ir('fim');
}
setInterval(pintarTempo, 15000);

// ===== Resumo do treino: no fim do treino de hoje ou ao tocar num dia antigo =====
let diaVisto = null;   // null = treino que acabou de terminar
// Aberto pela página inicial num dia anterior (?dia=): começa no resumo daquele dia, e os dias antigos ficam só leitura (sem Editar)
const SO_LEITURA = diaDaUrl();
let parabensPendente = false;   // só ao finalizar: voltar ao resumo (do cardio, por exemplo) não mostra os parabéns de novo
telas.fim = () => {
  const { dia, r, t } = pintarResumo();
  if (parabensPendente && !diaVisto) parabens(dia, r, t);
  parabensPendente = false;
};
function pintarResumo() {
  const dia = diaVisto || hoje(), antigo = !!diaVisto, r = resumoDia(dia), { ex, va } = mapas(), t = r.treino;
  $('f-data').textContent = deIso(dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  // ‹ treino anterior · › treino seguinte, ou a lista de hoje depois do mais recente
  $('f-ant').disabled = !diaVizinho(-1);
  const rotulo = diaVizinho(1) ? 'Próximo treino' : 'Hoje';
  $('f-prox').title = rotulo; $('f-prox').setAttribute('aria-label', rotulo);
  $('f-titulo').textContent = antigo ? 'Resumo do treino' : 'Treino concluído!';
  $('f-msg').textContent = !r.regs.length ? 'Nenhum exercício registrado neste dia.' : r.recordes ? `${r.recordes} ${r.recordes === 1 ? 'recorde' : 'recordes'}${antigo ? '' : ' hoje. Mandou bem!'}` : antigo ? '' : 'Mais um treino na conta. Constância é o que dá resultado.';
  const tiles = [
    ['Duração', t ? duracao(t.fim - t.inicio) : '—', t ? `${hhmm(t.inicio)}–${hhmm(t.fim)}` : ''],
    ['Calorias', r.kcal != null ? '~' + (r.kcal + (r.kcalCardio || 0)) : '—', r.kcal != null ? (r.kcalCardio ? 'kcal, com o cardio' : 'kcal, estimativa') : ''],
    ['Exercícios', `${r.regs.length}/${db.exercicios.length}`, `${r.series} ${r.series === 1 ? 'série' : 'séries'}`],
    ['Volume', r.volume ? fmt(Math.round(r.volume)) : '—', r.volume ? 'kg levantados' : ''],
    ['Pontos', '+' + r.pontos, `${r.completas} pirâmides completas`]
  ];
  $('f-tiles').innerHTML = tiles.map(([k, v, s]) => `<li><span>${k}</span><b>${v}</b><small>${s}</small></li>`).join('');
  // Finalizou antes de fazer todos: o que ficou de fora aparece logo abaixo dos números
  const feitas = new Set(r.regs.map(x => x.variacao));
  const faltou = db.exercicios.filter(e => !e.variacoes.some(v => feitas.has(v.id))).map(e => e.variacoes[variacaoAtiva(e)].nome);
  $('f-faltou').hidden = !r.regs.length || !faltou.length;
  $('f-faltou').innerHTML = `Ficou de fora: <b>${faltou.map(esc).join(', ')}</b>.`;
  const rec = recordesAte(dia);
  $('f-lista').innerHTML = r.regs.map(x => { const v = va.get(x.variacao); return `<li><span class="h-v">${esc(v?.nome || '')}${rec.has(x) ? ' <span class="selo ok">Recorde</span>' : ''}</span><span class="h-d">${v ? registroTxt(x, v).replace(/<\/?b>/g, '') : ''}</span></li>`; }).join('') || '<li class="empty">Nada registrado.</li>';
  pintarLinhaTreino(t);
  pintarCardioResumo(dia, t);
  diaNaUrl(diaVisto, false);   // o dia do resumo no endereço (só substitui: as telas já usam o histórico do navegador)
  return { dia, r, t };
}
// Dia treinado anterior / seguinte a partir de um dia (o mostrado no resumo, por padrão), ou null nas pontas
function diaVizinho(dir, de = diaVisto || hoje()) {
  const dias = [...diasTreinados()].sort();
  return (dir < 0 ? dias.filter(d => d < de).pop() : dias.find(d => d > de)) || null;
}
// Anterior: o treino de antes · seguinte: o de depois; depois do mais recente, volta para a lista de hoje
function irParaDia(dir, de) {
  if (editTreino) return;
  const d = diaVizinho(dir, de);
  if (d) { diaVisto = d; if ($('v-fim').hidden) ir('fim'); else { telas.fim(); window.scrollTo(0, 0); } }
  else if (dir > 0 && !$('v-fim').hidden) ir('inicio');
}
$('f-ant').addEventListener('click', () => irParaDia(-1));
$('f-prox').addEventListener('click', () => irParaDia(1));
arrastarLado($('v-fim'), irParaDia);
// Linha do horário no resumo, com Editar (horário ou excluir o treino do dia)
function pintarLinhaTreino(t) {
  $('f-treino').hidden = !t;
  const editar = !(SO_LEITURA && diaVisto) ? `<button type="button" class="del" data-editar-treino="${t.inicio}">Editar</button>` : '';
  if (t) $('f-treino').innerHTML = `<li><i class="h-d">${dataCurta(iso(new Date(t.inicio)))}</i><span class="h-d">${hhmm(t.inicio)}–${hhmm(t.fim)}${kcal(t) ? ` · ~${kcal(t)} kcal` : ''}</span><span class="ed-acoes"><span class="h-v">${duracao(t.fim - t.inicio)}</span>${editar}</span></li>`;
}
// Tela cheia de parabéns ao finalizar o treino de hoje, com as conquistas e o nível ganhos no dia; "Ver resumo" fecha
function parabens(dia, r, t) {
  const g = ganhosDoDia(dia);
  $('parabens-info').textContent = [t && duracao(t.fim - t.inicio), r.regs.length && `${r.regs.length} ${r.regs.length === 1 ? 'exercício' : 'exercícios'}`, r.recordes && `${r.recordes} ${r.recordes === 1 ? 'recorde' : 'recordes'}`, '+' + r.pontos + ' pts'].filter(Boolean).join(' · ');
  $('parabens-ganhos').innerHTML = [...(g.nivel ? [`<li><b>Nível ${g.nivel}!</b></li>`] : []), ...g.conquistas.map(c => `<li><b>★ ${esc(c.nome)}</b><small>${esc(c.desc)}</small></li>`)].join('');
  $('parabens-ganhos').hidden = !g.nivel && !g.conquistas.length;
  $('parabens').hidden = false;
  vibrar([60, 80, 60, 80, 200]);
}
$('parabens-ok').addEventListener('click', () => { $('parabens').hidden = true; });
