'use strict';
// Cliques gerais (delegação por data-*).
// ===== Cliques gerais =====
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-ir],[data-voltar],[data-ex],[data-var],[data-passo],[data-apagar],[data-apagar-medida],[data-modo],[data-aj],[data-linha],[data-finalizar],[data-reabrir],[data-editar-treino],[data-salvar-treino],[data-excluir-treino],[data-editar-medida],[data-salvar-medida],[data-cancelar],[data-dia]');
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
    ajustarSerie(e, i, d.aj, (num(inp.value) || 0) + +d.d); vibrar(15);
  }
  else if (d.linha !== undefined) {
    if (ev.target.closest('.linha-ed')) return;
    editando = editando === +d.linha ? null : +d.linha; pintarDescanso(exAtual());
  }
  else if ('finalizar' in d) finalizarTreino();
  else if ('reabrir' in d) reabrirTreino();
  else if (d.excluirTreino) {
    if (!confirmar(b, 'Excluir treino e exercícios do dia?')) return;
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
  else if (d.editarMedida) { editMedida = d.editarMedida; pintarMedidas(); }
  else if (d.salvarMedida) {
    const peso = num($('em-peso').value), hora = $('em-hora').value, data = $('em-data').value;
    if (!(peso >= 30 && peso <= 300)) { toast('Informe o peso em kg', null, true); return; }
    if (!dataOk(data) || data > hoje()) { toast('Data inválida', null, true); return; }
    if (data !== d.salvarMedida && db.medidas.some(x => x.data === data)) { toast('Já tem pesagem em ' + dataCurta(data), null, true); return; }   // 1 pesagem por dia
    const desfazer = alterar(() => { const m = db.medidas.find(x => x.data === d.salvarMedida); m.peso = peso; m.hora = hora; m.data = data; });
    editMedida = null; telas.corpo(); toast('Pesagem atualizada', desfazer);
  }
  else if ('cancelar' in d) { editTreino = null; editMedida = null; if (!$('v-fim').hidden) pintarLinhaTreino(resumoDia(diaVisto || hoje()).treino); if (!$('v-corpo').hidden) pintarMedidas(); }
  else if (d.apagar) {
    if (!confirmar(b, 'Confirmar')) return;
    const e = exAtual(), vid = e.variacoes[e.ativo].id;
    const desfazer = alterar(() => { db.registros = db.registros.filter(r => !(r.variacao === vid && r.data === d.apagar)); });
    toast('Registro apagado', desfazer); telas.exercicio();
  }
  else if (d.apagarMedida) {
    if (!confirmar(b, 'Confirmar')) return;
    const desfazer = alterar(() => { db.medidas = db.medidas.filter(m => m.data !== d.apagarMedida); });
    toast('Pesagem apagada', desfazer); telas.corpo();
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
