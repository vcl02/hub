'use strict';
// Cliques gerais (delegação por data-*).
// ===== Cliques gerais =====
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-ir],[data-voltar],[data-ex],[data-var],[data-passo],[data-apagar],[data-modo],[data-aj],[data-linha],[data-finalizar],[data-reabrir],[data-editar-treino],[data-salvar-treino],[data-excluir-treino],[data-cancelar],[data-dia]');
  if (!b || !db) return;
  const d = b.dataset;
  if (travadoHoje() && !$('v-exercicio').hidden && (d.var || d.passo === 'carga' || d.modo || d.aj || d.linha !== undefined)) return;   // dia travado
  if (d.dia) { if (editTreino) return; diaVisto = d.dia; ir('fim'); }
  else if (d.ir) ir(d.ir);
  else if ('voltar' in d) voltar();
  else if (d.ex) { atual = d.ex; ir('exercicio'); }
  else if (d.var) { const e = exAtual(); e.ativo = +d.var; gravar(); telas.exercicio(); if (seriesDeTrabalho(e)) autoSalvar(e); marcarAtividade(); }
  else if (d.passo) passo(d.passo, +d.dir);
  else if (d.modo) { const e = exAtual(); e.modo = d.modo; delete T.ajuste[e.id]; gravar(); salvarSessao(); pintarPeso(e); pintarDescanso(e); if (seriesDeTrabalho(e)) autoSalvar(e); telas.exercicio(); }
  else if (d.aj) {
    const e = exAtual(), li = b.closest('[data-linha]'), i = +li.dataset.linha, inp = li.querySelector(`[data-aj-in="${d.aj}"]`);
    if (d.aj === 'falha') ajustarSerie(e, i, 'falha', b.getAttribute('aria-pressed') !== 'true');
    else if (d.aj === 'conv') ajustarSerie(e, i, 'conv', umAUm(num(inp.value), +d.d));   // 22,7 → 23 → 24
    else ajustarSerie(e, i, d.aj, (num(inp.value) || 0) + +d.d);
    vibrar(15);
  }
  else if (d.linha !== undefined) {
    if (ev.target.closest('.linha-ed')) return;
    editando = editando === +d.linha ? null : +d.linha; pintarDescanso(exAtual());
  }
  else if ('finalizar' in d) finalizarTreino();
  else if ('reabrir' in d) reabrirTreino();
  else if (d.excluirTreino) {
    if (!confirmar(b)) return;
    const t = db.treinos.find(x => x.inicio === +d.excluirTreino), dia = iso(new Date(t.inicio));
    const desfazer = alterar(() => { db.treinos = db.treinos.filter(x => x !== t); db.registros = db.registros.filter(r => r.data !== dia); });
    if (dia === hoje()) { T.series = {}; T.feitas = {}; T.ajuste = {}; T.aquecimento = {}; pararDescanso(); }
    editTreino = null; ir('inicio'); toast('Treino excluído', desfazer);
  }
  else if (d.editarTreino) abrirEdicaoTreino(+d.editarTreino);
  else if (d.salvarTreino) {
    const t = db.treinos.find(x => x.inicio === +d.salvarTreino), ini = $('et-ini').value, fim = $('et-fim').value;
    if (!t || !ini || !fim || minutos(fim) <= minutos(ini)) { toast('O fim precisa ser depois do início', null, true); return; }
    const desfazer = alterar(() => { const base = t.inicio; t.inicio = comHora(base, ini); t.fim = comHora(base, fim); t.fechado = true; });
    editTreino = null; pintarLinhaTreino(t); toast('Horário do treino salvo', desfazer);
  }
  else if ('cancelar' in d) { editTreino = null; if (!$('v-fim').hidden) pintarLinhaTreino(resumoDia(diaVisto || hoje()).treino); }
  else if (d.apagar) {
    if (!confirmar(b)) return;
    const e = exAtual(), vid = e.variacoes[e.ativo].id;
    const desfazer = alterar(() => { db.registros = db.registros.filter(r => !(r.variacao === vid && r.data === d.apagar)); });
    toast('Registro apagado', desfazer); telas.exercicio();
  }
});

// Esc: fecha a tela cheia aberta (garrafinha como o X, parabéns como "Ver resumo"), cancela a edição na linha ou volta uma tela
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape' || !db) return;
  if (!$('agua').hidden) $('agua-x').click();
  else if (!$('parabens').hidden) $('parabens-ok').click();
  else if (document.querySelector('[data-cancelar]')) document.querySelector('[data-cancelar]').click();
  else if (pilha[pilha.length - 1] !== 'inicio') voltar();
  else return;
  ev.preventDefault();
});

// ← → no computador fazem o que os ‹ › (e o arrastar de lado no celular) fazem na tela aberta, no mesmo sentido de todo o hub
// (← = o anterior): semana na tela inicial, treino anterior ou seguinte no resumo e exercício anterior ou seguinte no exercício.
// Com tela cheia aberta, edição na linha ou foco num campo, nada (as setas andam no texto).
document.addEventListener('keydown', ev => {
  if (!db || !['ArrowLeft', 'ArrowRight'].includes(ev.key) || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  if (ev.target.closest?.('input,textarea,select') || !$('agua').hidden || !$('parabens').hidden || editTreino) return;
  const dir = ev.key === 'ArrowLeft' ? -1 : 1, tela = pilha[pilha.length - 1];
  if (tela === 'inicio') { const b = $(dir < 0 ? 'i-sem-ant' : 'i-sem-prox'); if (!b.disabled) b.click(); }
  else if (tela === 'fim') irParaDia(dir);
  else if (tela === 'exercicio') trocarExercicio(dir);
  else return;
  ev.preventDefault();
});
