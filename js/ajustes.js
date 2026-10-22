'use strict';
// Ajustes (engrenagem), edição de exercícios e sair.
// ===== Ajustes =====
let eventoInstalar = null;
telas.ajustes = async () => {
  $('a-instalar').hidden = !eventoInstalar;
  $('a-info').textContent = `Conta: ${usuario?.email || '—'}. ${pintarSync()} ${db.registros.length} registro(s) e ${db.medidas.length} pesagem(ns). Versão ${versaoAtual || '—'}.`;
};
// Sair (canto superior direito). Com dados sem enviar, o 1º toque só avisa e arma; o 2º, em até 3 s, sai.
$('sair').addEventListener('click', async ev => {
  const p = temPendente(), btn = ev.currentTarget;
  if (p && !btn.classList.contains('armed')) {
    btn.classList.add('armed'); toast('Há dados sem enviar. Toque de novo para sair.', null, true);
    setTimeout(() => btn.classList.remove('armed'), 3000); return;
  }
  btn.classList.remove('armed');
  const id = usuario.id;
  if (!p) { store.del(K_LOCAL(id)); store.del(K_BASE(id)); }   // pendente fica no aparelho e envia no próximo login
  try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
  telaLogin();
});
addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); eventoInstalar = ev; $('a-instalar').hidden = false; });
$('a-instalar').addEventListener('click', async () => { if (!eventoInstalar) return; eventoInstalar.prompt(); try { await eventoInstalar.userChoice; } catch (e) {} eventoInstalar = null; $('a-instalar').hidden = true; });

// Editar exercícios
function editorExercicio(e) {
  return `<fieldset class="ed" data-id="${e.id || ''}">
    <div class="ed-head"><input class="ed-grupo" value="${esc(e.grupo)}" placeholder="Grupo (ex.: Peito)" aria-label="Grupo muscular">
      <button type="button" class="ed-mover" data-mv="-1" aria-label="Subir na lista">↑</button><button type="button" class="ed-mover" data-mv="1" aria-label="Descer na lista">↓</button>
      <button type="button" class="del ed-remover">Remover</button></div>
    <div class="ed-p">
      <label>Séries<input class="ed-series" inputmode="numeric" value="${e.series ?? 3}"></label>
      <label>Reps (máx.)<input class="ed-reps" inputmode="numeric" value="${e.reps ?? 12}"></label>
      <label>Descanso (s)<input class="ed-descanso" inputmode="numeric" value="${e.descanso ?? 75}"></label>
      <label>Região<select class="ed-regiao">${REGIOES.map(r => `<option${e.regiao === r ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    </div>
    ${[0, 1, 2].map(i => { const v = (e.variacoes || [])[i] || {}; return `<div class="ed-v" data-id="${v.id || ''}">
      <span class="ed-k">${TIPOS[i]}${i === 0 ? ' (obrigatório)' : ''} · nome, passo, unidade</span>
      <input class="ed-nome" value="${esc(v.nome)}" placeholder="Nome do exercício" aria-label="${TIPOS[i]}: nome">
      <input class="ed-passo" inputmode="decimal" value="${virgula(v.passo ?? passoPadrao(i, v.unidade || 'kg'))}" aria-label="${TIPOS[i]}: passo de peso">
      <select class="ed-unidade" aria-label="${TIPOS[i]}: unidade">${UNIDADES.map(u => `<option${(v.unidade || 'kg') === u ? ' selected' : ''}>${u}</option>`).join('')}</select>
    </div>`; }).join('')}
  </fieldset>`;
}
telas.editar = () => { $('ed-lista').innerHTML = db.exercicios.map(editorExercicio).join(''); };
$('ed-novo').addEventListener('click', () => { $('ed-lista').insertAdjacentHTML('beforeend', editorExercicio({ grupo: '', regiao: 'Superior' })); $('ed-lista').lastElementChild.querySelector('.ed-grupo').focus(); });
$('ed-lista').addEventListener('click', ev => {
  const b = ev.target.closest('.ed-remover,.ed-mover'); if (!b) return;
  const f = b.closest('fieldset');
  if (b.classList.contains('ed-remover')) { if (confirmar(b, 'Apagar com histórico?')) f.remove(); return; }
  if (+b.dataset.mv < 0 && f.previousElementSibling) f.parentNode.insertBefore(f, f.previousElementSibling);
  else if (+b.dataset.mv > 0 && f.nextElementSibling) f.parentNode.insertBefore(f.nextElementSibling, f);
  b.focus(); f.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
$('ed-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const exercicios = [];
  for (const f of $('ed-lista').querySelectorAll('fieldset')) {
    const antigo = db.exercicios.find(e => e.id === f.dataset.id);
    const variacoes = [...f.querySelectorAll('.ed-v')].map((r, j) => {
      const velho = antigo?.variacoes.find(v => v.id === r.dataset.id) || {};
      return { ...velho, id: r.dataset.id, nome: r.querySelector('.ed-nome').value, passo: r.querySelector('.ed-passo').value, unidade: r.querySelector('.ed-unidade').value };
    });
    if (!variacoes[0].nome.trim()) { toast('Preencha o exercício principal', null, true); f.querySelector('.ed-nome').focus(); return; }
    exercicios.push({ ...antigo, id: f.dataset.id, grupo: f.querySelector('.ed-grupo').value, regiao: f.querySelector('.ed-regiao').value, series: f.querySelector('.ed-series').value, reps: f.querySelector('.ed-reps').value, descanso: f.querySelector('.ed-descanso').value, variacoes });
  }
  const novo = preparar({ ...db, exercicios });
  const ids = new Set(novo.exercicios.flatMap(e => e.variacoes.map(v => v.id)));
  novo.registros = novo.registros.filter(r => ids.has(r.variacao));   // remove histórico de exercício removido
  db = novo; gravar(); toast('Exercícios salvos'); voltar();
});
