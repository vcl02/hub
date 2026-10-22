'use strict';
// Tela do exercício: foto da máquina, variação, peso, histórico, salvamento e arrastar para trocar.
// ===== Foto da máquina (só aparece quando você tira uma) =====
function foto(v) { const f = store.get('carga.foto.' + v.id); return f ? `<img src="${f}" alt="Foto da máquina">` : ''; }
$('e-foto').addEventListener('change', async ev => {
  const f = ev.target.files[0], v = varAtual(); ev.target.value = ''; if (!f || !v) return;
  try {
    const img = await createImageBitmap(f), k = Math.min(1, 480 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    if (!store.set('carga.foto.' + v.id, c.toDataURL('image/jpeg', .7))) throw new Error('espaço');
    toast('Foto salva'); telas.exercicio();
  } catch (e) { toast('Não consegui salvar a foto', null, true); }
});
$('e-foto-rm').addEventListener('click', () => { store.del('carga.foto.' + varAtual().id); toast('Foto removida'); telas.exercicio(); });

// Lembrete da garrafinha: ao abrir o 1º exercício do dia, até "Já peguei" ou o dia contar como treinado (fica só no aparelho)
const K_AGUA = 'carga.agua';
function pintarAgua(trav = travadoHoje()) { $('agua').hidden = !!trav || store.get(K_AGUA) === hoje() || diasTreinados().has(hoje()); }
$('agua-ok').addEventListener('click', () => { store.set(K_AGUA, hoje()); pintarAgua(); });

// ===== Exercício =====
let atual = null, editando = null;   // id do exercício aberto · série aberta para edição
const exAtual = () => db.exercicios.find(e => e.id === atual);
const varAtual = () => { const e = exAtual(); return e?.variacoes[e.ativo]; };
telas.exercicio = () => {
  const e = exAtual(); if (!e) { voltar(); return; }
  const trav = travadoHoje();
  $('v-exercicio').classList.toggle('travado', !!trav);
  $('e-travado').hidden = !trav;
  pintarAgua(trav);
  if (trav) $('e-travado-msg').textContent = `O treino de hoje foi finalizado às ${hhmm(trav.fim)}. Um treino por dia.`;
  e.ativo = variacaoAtiva(e); editando = null;
  const v = e.variacoes[e.ativo], pos = db.exercicios.indexOf(e), u = ultimo(v.id), guia = GUIA[v.nome.toLowerCase()];
  $('e-pos').textContent = (pos + 1) + '/' + db.exercicios.length;
  pintarTempo(); pintarTrilha();
  $('e-grupo').textContent = e.grupo;
  $('e-variacoes').innerHTML = e.variacoes.map((x, i) => x.nome ? `<button type="button" class="seg" role="radio" aria-checked="${i === e.ativo}" data-var="${i}"><span class="seg-k">${TIPOS[i]}</span><span class="seg-n">${esc(x.nome)}</span></button>` : '').join('');
  $('e-variacoes').hidden = e.variacoes.filter(x => x.nome).length < 2;
  $('e-fig').innerHTML = foto(v); $('e-fig').hidden = !$('e-fig').innerHTML;
  $('e-nome').textContent = v.nome;
  $('e-desc').textContent = guia?.[0] || ''; $('e-desc').hidden = !guia;
  $('e-equip').value = v.equip || '';
  $('e-presc').innerHTML = `<b>${Array.from({ length: e.series }, (_, i) => alvoReps(e, i)).join(' → ')} reps</b> · descanso ${e.descanso} s`;
  $('e-guia').innerHTML = guia ? `<b>Posição:</b> ${esc(guia[1])}` : ''; $('e-guia').hidden = !guia;
  $('e-nota').value = v.nota || '';
  $('e-youtube').href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent((v.nome + ' execução correta').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim());
  $('e-foto-l').textContent = store.get('carga.foto.' + v.id) ? 'Trocar foto' : 'Foto da máquina';
  $('e-foto-rm').hidden = !store.get('carga.foto.' + v.id);
  $('e-ultima').innerHTML = u
    ? `<span>Última vez: <b>${kgsTxt(u)} ${esc(unidadeTxt(v))}</b> × ${repsTxt(u)} · <i>${quando(u.data)}</i></span>${completo(u, e) ? '<span class="chip acao">↑ Completou: suba a carga</span>' : ''}`
    : '';
  const rs = rascunho[v.id];   // valor digitado e ainda não salvo tem prioridade
  $('e-carga').value = rs ? rs.carga : u ? virgula(u.series[0].kg) : '';
  pintarPeso(e); pintarDescanso(e); pintarSalvo(e); pintarHistorico(e);
};
function pintarPeso(e) {   // rótulo, unidade, por lado/total e conversão
  const v = e.variacoes[e.ativo], kg = num($('e-carga').value);
  $('e-carga-l').textContent = e.modo === 'reta' ? 'Peso das séries' : e.modo === 'invertida' ? 'Peso da 1ª série (a mais pesada)' : 'Peso da 1ª série';
  $('e-unidade').textContent = unidadeTxt(v);
  $('e-lados').setAttribute('aria-pressed', v.lados === 2); $('e-lados').textContent = v.lados === 2 ? 'por lado ✓' : 'por lado';
  $('e-lados').hidden = v.unidade === 'nível';
  const partes = [];
  if (kg > 0 && v.lados === 2) partes.push(`= <b>${fmt(kg * 2)} ${v.unidade}</b> no total (sem contar a barra/plataforma)`);
  if (kg > 0 && v.unidade === 'lb') partes.push(`≈ <b>${fmt(Math.round(kg * LB * (v.lados || 1) * 10) / 10)} kg</b>${v.lados === 2 ? ' no total' : ''}`);
  $('e-conv').innerHTML = partes.join(' · '); $('e-conv').hidden = !partes.length;
}
function pintarTrilha() {   // barra do treino de hoje: cada exercício enche conforme as séries
  $('e-trilha').innerHTML = db.exercicios.map(x => {
    const r = registroHoje(x), k = Math.max(seriesDeTrabalho(x), r ? r.series.length : 0);
    return `<i class="${x.id === atual ? 'on' : ''}"><b style="width:${Math.min(1, k / x.series) * 100}%"></b></i>`;
  }).join('');
}
function pintarHistorico(e) {
  const v = e.variacoes[e.ativo], lista = db.registros.filter(r => r.variacao === v.id).sort((a, b) => b.data.localeCompare(a.data));
  $('e-historico').innerHTML = lista.length
    ? lista.map(r => `<li><i class="h-d">${dataCurta(r.data)}</i><span class="h-v">${kgsTxt(r)} ${esc(unidadeTxt(v))} <small>× ${repsTxt(r)}</small></span><button type="button" class="del" data-apagar="${r.data}">Apagar</button></li>`).join('')
    : '<li class="empty">Nenhum registro ainda.</li>';
  grafico($('e-grafico'), lista.slice(0, 12).reverse().map(r => ({ data: r.data, valor: topo(r) })), unidadeTxt(v), 'Evolução da carga máxima');
}
// Séries de trabalho já feitas hoje (peso manual ou o calculado pela pirâmide)
function seriesHoje(e) {
  const P = planoAtual(e).filter(s => !s.aq), f = T.feitas[e.id] || [];
  return Array.from({ length: seriesDeTrabalho(e) }, (_, i) => ({ kg: f[i]?.kg ?? P[i]?.kg, reps: f[i]?.reps ?? P[i]?.reps }));
}
// Salva sozinho: a cada série marcada, ajuste, peso ou troca de variação. 1 registro por exercício por dia.
function autoSalvar(e) {
  const v = e.variacoes[e.ativo], k = seriesDeTrabalho(e), h = hoje(), doExercicio = new Set(e.variacoes.map(x => x.id)), antes = estatisticas();
  if (!k) db.registros = db.registros.filter(r => !(r.data === h && doExercicio.has(r.variacao)));          // séries zeradas
  else {
    const series = seriesHoje(e);
    if (series.every(s => s.kg > 0)) {                                                                       // sem peso: não mexe no que já está salvo
      db.registros = db.registros.filter(r => !(r.data === h && doExercicio.has(r.variacao) && r.variacao !== v.id));   // trocou de variação
      const r = db.registros.find(x => x.variacao === v.id && x.data === h);
      if (r) r.series = series; else db.registros.push({ variacao: v.id, data: h, series });
    }
  }
  gravar(); pintarSalvo(e); pintarHistorico(e); pintarTrilha();
  return celebrar(antes);
}
function pintarSalvo(e) {
  const v = e.variacoes[e.ativo], r = db.registros.find(x => x.variacao === v.id && x.data === hoje()), k = seriesDeTrabalho(e);
  const falta = !r && k > 0;
  $('e-salvo').classList.toggle('ok', !!r); $('e-salvo').classList.toggle('erro', falta);
  $('e-salvo').innerHTML = r ? `✓ Salvo: <b>${kgsTxt(r)} ${esc(unidadeTxt(v))}</b> × ${repsTxt(r)}`
    : falta ? 'Sem peso: não salvo.' : '';
  $('e-finalizar').hidden = !emAndamento(ultimoTreino());
}
const CAMPOS = { carga: 'e-carga', peso: 'c-peso', cintura: 'c-cintura' };
function passo(campo, dir) {   // peso do exercício muda de 1 em 1
  const inp = $(CAMPOS[campo]), d = campo === 'peso' ? .1 : campo === 'cintura' ? .5 : 1;
  let n = num(inp.value); if (!isFinite(n)) n = 0;
  inp.value = virgula(Math.max(0, Math.round((n + dir * d) * 100) / 100));
  if (campo === 'carga') guardarRascunho();
}
function guardarRascunho() {
  const e = exAtual(); if (!e || travadoHoje()) return;
  rascunho[e.variacoes[e.ativo].id] = { carga: $('e-carga').value };
  salvarSessao(); pintarPeso(e); pintarDescanso(e); marcarAtividade();
  if (seriesDeTrabalho(e)) autoSalvar(e);
}
$('e-carga').addEventListener('input', guardarRascunho);
function mudarVariacao(campo, valor) { varAtual()[campo] = valor; gravar(); }   // unidade e por lado
$('e-unidade').addEventListener('click', () => {
  const v = varAtual(), u = UNIDADES[(UNIDADES.indexOf(v.unidade) + 1) % UNIDADES.length];
  mudarVariacao('unidade', u); if (u === 'nível') mudarVariacao('lados', 1);
  const e = exAtual(); pintarPeso(e); pintarDescanso(e); toast('Unidade: ' + u);
});
$('e-lados').addEventListener('click', () => { const e = exAtual(); mudarVariacao('lados', varAtual().lados === 2 ? 1 : 2); pintarPeso(e); pintarDescanso(e); pintarSalvo(e); pintarHistorico(e); });
// nº do aparelho e anotações: salvam 0,5 s depois de parar de digitar e ao sair do campo
for (const [id, campo, max] of [['e-equip', 'equip', 8], ['e-nota', 'nota', 500]]) {
  let t, pendente = null;   // { variação, texto } — preso ao exercício em que foi digitado
  const salvar = () => {
    clearTimeout(t); if (!pendente || !db) return;
    const { v, texto } = pendente; pendente = null;
    if (texto) v[campo] = texto; else delete v[campo];
    gravar();
  };
  $(id).addEventListener('input', () => { pendente = { v: varAtual(), texto: $(id).value.trim().slice(0, max) }; clearTimeout(t); t = setTimeout(salvar, 500); });
  $(id).addEventListener('change', salvar);
  $(id).addEventListener('blur', salvar);
}

// ===== Arrastar para o lado = próximo / anterior (sem dar a volta) =====
function podeTrocar(dir) { const j = db.exercicios.findIndex(e => e.id === atual) + dir; return j >= 0 && j < db.exercicios.length; }
function trocarExercicio(dir) {
  if (!podeTrocar(dir)) return;
  atual = db.exercicios[db.exercicios.findIndex(e => e.id === atual) + dir].id;
  telas.exercicio(); salvarSessao(); marcarAtividade(); tick(); window.scrollTo(0, 0);
}
// Depois do último descanso (ou de pular), vai sozinho para o próximo exercício que falta; se não falta nenhum, fim.
function avancar() {
  const i = db.exercicios.findIndex(x => x.id === atual);
  const falta = x => !registroHoje(x) && !seriesFeitas(x.id);
  const prox = [...db.exercicios.slice(i + 1), ...db.exercicios.slice(0, i)].find(falta);
  if (!prox) { finalizarTreino(); return; }
  atual = prox.id; telas.exercicio(); salvarSessao(); tick(); window.scrollTo(0, 0);
  toast('Próximo: ' + prox.variacoes[variacaoAtiva(prox)].nome);
}
const terminouExercicio = e => seriesFeitas(e.id) >= e.series + (T.aquecimento[e.regiao] === e.id ? 1 : 0);
(() => {
  const tela = $('v-exercicio'), semMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let x0 = 0, y0 = 0, t0 = 0, ativo = false, eixo = null, pendente = null;
  const soltar = () => { tela.classList.add('slide'); tela.style.transform = ''; tela.style.opacity = ''; };
  const concluir = () => {     // novo toque durante a animação: termina a troca na hora
    if (!pendente) return;
    clearTimeout(pendente.t); const d = pendente.dir; pendente = null;
    trocarExercicio(d); tela.classList.remove('slide'); tela.style.transform = ''; tela.style.opacity = '';
  };
  document.addEventListener('touchstart', ev => {
    ativo = false;
    if (tela.hidden || !db) return;
    concluir();
    if (ev.touches.length !== 1 || ev.target.closest('input,textarea,select,.segs,.modos,#mini,#toast,#agua')) return;
    ativo = true; x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; t0 = Date.now(); eixo = null; tela.classList.remove('slide');
  }, { passive: true });
  document.addEventListener('touchmove', ev => {
    if (!ativo) return;
    const dx = ev.touches[0].clientX - x0, dy = ev.touches[0].clientY - y0;
    if (!eixo && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) eixo = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
    if (eixo === 'x' && !semMovimento) { tela.style.transform = `translateX(${dx * (podeTrocar(dx < 0 ? 1 : -1) ? .5 : .15)}px)`; tela.style.opacity = String(1 - Math.min(Math.abs(dx) / 600, .4)); }
  }, { passive: true });
  document.addEventListener('touchend', ev => {
    if (!ativo) return; ativo = false;
    const dx = ev.changedTouches[0].clientX - x0, rapido = Date.now() - t0 < 300;
    const dir = dx < 0 ? 1 : -1, trocar = eixo === 'x' && (Math.abs(dx) > 80 || (rapido && Math.abs(dx) > 40)) && podeTrocar(dir);
    if (!trocar || semMovimento) { soltar(); if (trocar) trocarExercicio(dir); return; }
    tela.classList.add('slide'); tela.style.transform = `translateX(${-dir * 40}%)`; tela.style.opacity = '0';
    pendente = { dir, t: setTimeout(() => {
      pendente = null; trocarExercicio(dir);
      tela.classList.remove('slide'); tela.style.transform = `translateX(${dir * 30}%)`;
      requestAnimationFrame(() => requestAnimationFrame(soltar));
    }, 170) };
  });
  document.addEventListener('touchcancel', () => { if (ativo) { ativo = false; soltar(); } });
})();
