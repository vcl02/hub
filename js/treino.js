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
  $('e-tempo').textContent = ativo ? '⏱ ' + duracao(Date.now() - t.inicio) : '';
  box.classList.toggle('on', ativo);
  const cal = t && !ativo ? kcal(t) : null;
  box.hidden = !t;
  box.innerHTML = !t ? ''
    : ativo ? `<span>Treino em andamento desde ${hhmm(t.inicio)}</span><b>${duracao(Date.now() - t.inicio)}</b><button type="button" class="btn sm" data-finalizar>Finalizar</button>`
    : `<span>Último treino <i>${quando(iso(new Date(t.inicio)))}, ${hhmm(t.inicio)}–${hhmm(t.fim)}${cal ? ` · ~${cal} kcal` : ''}</i></span><b>${duracao(t.fim - t.inicio)}</b>${travadoHoje() ? '<button type="button" class="btn sm" data-reabrir>Reabrir</button>' : ''}`;
  if (editTreino) return;   // não redesenha a lista enquanto um horário está sendo editado
  const fechados = (ativo ? db.treinos.slice(0, -1) : db.treinos).slice(-5).reverse();
  $('i-hist-box').hidden = !fechados.length;
  $('i-treinos').innerHTML = fechados.map(x => {
    const d = new Date(x.inicio), c = kcal(x);
    return x.inicio === editTreino ? '' : `<li data-dia="${iso(d)}"><i class="h-d">${NOME_DIA[d.getDay()]} ${dataCurta(iso(d))}</i><span class="h-d">${hhmm(x.inicio)}–${hhmm(x.fim)}${c ? ` · ~${c} kcal` : ''}</span><span class="ed-acoes"><span class="h-v">${duracao(x.fim - x.inicio)}</span><button type="button" class="del" data-editar-treino="${x.inicio}">Editar</button></span></li>`;
  }).join('');
}
function abrirEdicaoTreino(inicio) {
  const t = db.treinos.find(x => x.inicio === inicio); if (!t) return;
  editTreino = inicio;
  const li = document.querySelector(`[data-editar-treino="${inicio}"]`).closest('li');
  li.className = 'editando';
  li.innerHTML = `<i class="h-d">${NOME_DIA[new Date(t.inicio).getDay()]} ${dataCurta(iso(new Date(t.inicio)))}</i><span class="ed-inline"><input type="time" id="et-ini" value="${hhmm(t.inicio)}" aria-label="Início"> – <input type="time" id="et-fim" value="${hhmm(t.fim)}" aria-label="Fim"></span><span class="ed-acoes"><button type="button" class="del" data-excluir-treino="${inicio}">Excluir</button><button type="button" class="link" data-cancelar>Cancelar</button><button type="button" class="btn sm primary" data-salvar-treino="${inicio}">Salvar</button></span>`;
}
function finalizarTreino() {
  const t = ultimoTreino();
  if (emAndamento(t)) { t.fim = Date.now(); t.fechado = true; gravar(); }
  clearInterval(T.intervalo); T.intervalo = null; T.fim = 0; manterTela(false); salvarSessao();
  diaVisto = null; ir('fim');
}
setInterval(pintarTempo, 15000);

// ===== Resumo do treino: no fim do treino de hoje ou ao tocar num dia antigo =====
let diaVisto = null;   // null = treino que acabou de terminar
telas.fim = () => {
  const dia = diaVisto || hoje(), antigo = !!diaVisto, r = resumoDia(dia), { ex, va } = mapas(), t = r.treino;
  $('f-data').textContent = deIso(dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('f-titulo').textContent = antigo ? 'Resumo do treino' : 'Treino concluído!';
  $('f-msg').textContent = !r.regs.length ? 'Nenhum exercício registrado neste dia.' : r.recordes ? `${r.recordes} ${r.recordes === 1 ? 'recorde' : 'recordes'}${antigo ? '' : ' hoje. Mandou bem!'}` : antigo ? '' : 'Mais um treino na conta. Constância é o que dá resultado.';
  const tiles = [
    ['Duração', t ? duracao(t.fim - t.inicio) : '—', t ? `${hhmm(t.inicio)}–${hhmm(t.fim)}` : ''],
    ['Calorias', r.kcal != null ? '~' + r.kcal : '—', r.kcal != null ? 'kcal, estimativa' : ''],
    ['Exercícios', `${r.regs.length}/${db.exercicios.length}`, `${r.series} ${r.series === 1 ? 'série' : 'séries'}`],
    ['Volume', r.volume ? fmt(Math.round(r.volume)) : '—', r.volume ? 'kg levantados' : ''],
    ['Pontos', '+' + r.pontos, `${r.completas} pirâmides completas`]
  ];
  $('f-tiles').innerHTML = tiles.map(([k, v, s]) => `<li><span>${k}</span><b>${v}</b><small>${s}</small></li>`).join('');
  const rec = recordesAte(dia);
  $('f-lista').innerHTML = r.regs.map(x => { const v = va.get(x.variacao); return `<li><span class="h-v">${esc(v?.nome || '')}${rec.has(x) ? ' <span class="chip ok">Recorde</span>' : ''}</span><span class="h-d">${kgsTxt(x)} ${esc(v ? unidadeTxt(v) : '')} × ${repsTxt(x)}</span></li>`; }).join('') || '<li class="empty">Nada registrado.</li>';
  if (!antigo) parabens(dia, r, t);
};
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
telas.treinos = () => {
  const dias = [...diasTreinados()].sort().reverse();
  $('t-dias').innerHTML = dias.map(dia => {
    const r = resumoDia(dia), d = deIso(dia);
    return `<li data-dia="${dia}"><i class="h-d">${NOME_DIA[d.getDay()]} ${dataCurta(dia)}</i><span class="h-d">${r.regs.length} ${r.regs.length === 1 ? 'exercício' : 'exercícios'}${r.recordes ? ` · ${r.recordes} ${r.recordes === 1 ? 'recorde' : 'recordes'}` : ''}</span><span class="h-v">${r.treino ? duracao(r.treino.fim - r.treino.inicio) : ''} ›</span></li>`;
  }).join('') || '<li class="empty">Nenhum treino ainda.</li>';
};
