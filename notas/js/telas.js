'use strict';
// Telas: a lista de notas e a nota aberta, no editor (PC, js/editor.js) ou como conversa (celular: um balão por parágrafo,
// js/markdown.js). A nota aberta fica no endereço (?nota=<id>): recarregar mantém, o Voltar do navegador volta para a lista.
// Tudo grava pelo banco (salvarNota, criarNota, apagarNota, moverNota de js/banco.js), que envia à nuvem 0,8 s depois.

const SALVAR_MS = 800; // o editor grava 0,8 s depois de parar de digitar
const SEGURAR_MS = 500; // segurar um balão esse tempo seleciona

let aberta = null, // id da nota aberta (null: a lista)
  modo = 'conversa', // 'editor' ou 'conversa', na nota aberta
  carregado = false, // a nuvem já respondeu (ou falhou): nota que não existe agora não existe mesmo
  tSalvar = null, // gravação do editor esperando a digitação parar
  tSalvarTitulo = null,
  mostrado = '', // o texto da nota como está na tela (editor ou balões)
  tituloMostrado = '',
  selecionados = new Set(), // índices dos parágrafos selecionados na conversa
  editando = null; // índice do parágrafo sendo editado no campo de baixo (null: o campo acrescenta)

const ICONE_MODO = {
  // no botão, o modo para onde ele leva
  editor:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>',
  conversa:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z"/></svg>',
};

const ICONE_LIXO =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>';

// Alça da linha (⠿): 6 pontos, 2 colunas de 3
const ICONE_ALCA =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';

// ===== Lista =====
// A 1ª linha não vazia do corpo, como prévia (sem as marcas do começo)
const previaDe = (texto) =>
  (
    String(texto || '')
      .split('\n')
      .find((l) => l.trim()) || ''
  )
    .replace(/^[\s#>*+-]+/, '')
    .trim();

// A lista na ordem do banco (db.notas, pela ordem que o dono definiu arrastando a alça). Durante um arraste não redesenha
// (a linha está na mão): fica para quando soltar.
function desenharLista() {
  if (arraste) {
    arraste.redesenhar = true;

    return;
  }

  const L = db?.notas || [];

  $('n-lista').innerHTML = L.map(
    (n) =>
      `<li data-id="${esc(n.id)}"><button type="button" class="alca" title="Arrastar para reordenar (Alt+↑/↓)" aria-label="Arrastar para reordenar">${ICONE_ALCA}</button>` +
      `<span class="hora">${esc(quandoFoi(n.editadaEm))}</span>` +
      `<a class="oque" href="?nota=${esc(n.id)}"><b>${esc(n.titulo || 'Sem título')}</b>` +
      `<small>${esc(previaDe(n.texto))}</small></a>` +
      `<button type="button" class="bt-ic perigo" data-apagar="${esc(n.id)}" data-armavel="nota:${esc(n.id)}" title="Apagar (toque duas vezes)" aria-label="Apagar">${ICONE_LIXO}</button></li>`
  ).join('');
  $('n-vazio').hidden = L.length > 0;
}

function mostrarLista() {
  aberta = null;
  document.title = 'Notas';
  document.body.classList.remove('aberta');
  $('v-nota').hidden = true;
  $('w-lista').hidden = false;
  $('v-login').hidden = true;
  $('v-lista').hidden = false;
  $('w-lista').append($('sync'));
  desenharLista();
}

$('n-lista').addEventListener('click', (ev) => {
  const apagar = ev.target.closest('[data-apagar]');

  if (apagar) {
    if (!confirmar(apagar)) return;
    apagarNota(apagar.dataset.apagar);
    desenharLista();

    return;
  }

  const link = ev.target.closest('a.oque');

  if (!link || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button) return;
  ev.preventDefault();
  abrirNota(link.closest('li').dataset.id);
});

// ===== Ordem da lista: arrastar pela alça (⠿) =====
// Pointer Events (mouse e toque iguais) só na alça (touch-action: none nela): a linha segue o ponteiro e as outras abrem
// espaço; soltar leva a nota para onde ela ficou (moverNota de js/banco.js). Esc ou pointercancel cancelam (volta ao lugar).
let arraste = null; // { id, li, i, ponteiro, y0, centros, passo, linhas, ids, pos, redesenhar } enquanto uma linha está na mão

function comecarArraste(ev) {
  const alca = ev.target.closest('.alca');

  if (!alca || arraste || ev.button > 0 || !ev.isPrimary) return;

  const linhas = [...$('n-lista').children],
    li = alca.closest('li'),
    i = linhas.indexOf(li),
    gap = parseFloat(getComputedStyle($('n-lista')).rowGap) || 0;

  arraste = {
    id: li.dataset.id,
    li,
    i,
    pos: i, // posição final (0-based) se soltar agora
    ponteiro: ev.pointerId,
    y0: ev.pageY,
    // centro de cada linha no começo (na página, para valer mesmo com a página rolada)
    centros: linhas.map((l) => {
      const r = l.getBoundingClientRect();

      return r.top + scrollY + r.height / 2;
    }),
    passo: li.getBoundingClientRect().height + gap, // quanto as outras andam para abrir espaço
    linhas,
    ids: linhas.map((l) => l.dataset.id), // a ordem da tela no começo
    redesenhar: false,
  };
  alca.setPointerCapture(ev.pointerId);
  li.classList.add('arrastando');
  document.body.classList.add('arrastando-lista');
}

// A linha na mão segue o ponteiro; a posição final é quantas das outras têm o centro acima do centro dela agora
function moverArraste(ev) {
  if (!arraste) return;

  const { li, i, linhas, centros, passo } = arraste,
    dy = ev.pageY - arraste.y0,
    centro = centros[i] + dy;

  let pos = 0;

  for (let j = 0; j < linhas.length; j++) if (j !== i && centros[j] < centro) pos++;
  arraste.pos = pos;
  li.style.transform = `translateY(${dy}px)`;

  // as de cima que ficam abaixo dela descem um passo; as de baixo que ficam acima sobem
  for (let j = 0; j < linhas.length; j++) {
    if (j === i) continue;
    const anda = j < i && j >= pos ? passo : j > i && j <= pos ? -passo : 0;

    linhas[j].style.transform = anda ? `translateY(${anda}px)` : '';
  }
}

// Termina o arraste: soltar (cancelar = false) grava a ordem nova; cancelar volta tudo ao lugar
function terminarArraste(cancelar) {
  if (!arraste) return;

  const { id, i, pos, ids, li, linhas, ponteiro, redesenhar } = arraste,
    alca = li.querySelector('.alca');

  let mudou = false;

  arraste = null;
  document.body.classList.remove('arrastando-lista');

  if (!cancelar && pos !== i) {
    // a posição pela vizinha de cima na tela (se a lista mudou durante o arraste, a nota fica logo abaixo dela)
    const antes = ids.filter((x) => x !== id)[pos - 1],
      atual = (db?.notas || []).filter((n) => n.id !== id),
      k = antes ? atual.findIndex((n) => n.id === antes) : -1;

    mudou = moverNota(id, antes && k >= 0 ? k + 1 : antes ? pos : 0);
  }

  if (mudou || redesenhar) {
    desenharLista();
    $('n-lista')
      .querySelector(`li[data-id="${CSS.escape(id)}"] .alca`)
      ?.focus();
  } else {
    for (const l of linhas) l.style.transform = '';
    li.classList.remove('arrastando');

    if (alca?.hasPointerCapture(ponteiro)) alca.releasePointerCapture(ponteiro); // Esc com o ponteiro ainda na alça
  }
}

$('n-lista').addEventListener('pointerdown', comecarArraste);
$('n-lista').addEventListener('pointermove', moverArraste);
$('n-lista').addEventListener('pointerup', () => terminarArraste(false));
$('n-lista').addEventListener('pointercancel', () => terminarArraste(true));
// perdeu o ponteiro sem soltar (a alça saiu da página): cancela; depois de soltar, o arraste já terminou
$('n-lista').addEventListener('lostpointercapture', () => terminarArraste(true));

// O menu do toque longo (Android) e o do botão direito não aparecem sobre a alça: segurar é arrastar
$('n-lista').addEventListener('contextmenu', (ev) => {
  if (ev.target.closest('.alca')) ev.preventDefault();
});

// Teclado: com a alça em foco, Alt+↑ e Alt+↓ movem uma posição (o foco fica na alça da mesma nota)
$('n-lista').addEventListener('keydown', (ev) => {
  const alca = ev.target.closest?.('.alca');

  if (
    !alca ||
    !ev.altKey ||
    ev.ctrlKey ||
    ev.metaKey ||
    ev.shiftKey ||
    (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')
  )
    return;
  ev.preventDefault();

  if (arraste) return;

  const id = alca.closest('li').dataset.id,
    i = (db?.notas || []).findIndex((n) => n.id === id);

  if (i < 0 || !moverNota(id, i + (ev.key === 'ArrowUp' ? -1 : 1))) return;
  desenharLista();
  $('n-lista')
    .querySelector(`li[data-id="${CSS.escape(id)}"] .alca`)
    ?.focus();
});

// Esc durante o arraste: só cancela (não sai do app, js/util.js)
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || ev.defaultPrevented || !arraste) return;
  ev.preventDefault();
  terminarArraste(true);
});

$('n-nova').addEventListener('click', () => {
  if (!db || repetido('nova')) return;
  abrirNota(criarNota('').id);

  if (modo === 'conversa') $('c-texto').focus(); // nota nova: já pronta para escrever (o editor já recebe o foco)
});

// ===== Nota aberta =====
function abrirNota(id, empilhar = true) {
  const n = notaPorId(id);

  if (!n) return;
  notaNaUrl(id, empilhar);
  aberta = id;
  mostrado = n.texto;
  tituloMostrado = n.titulo;
  selecionados.clear();
  editando = null;
  $('c-texto').value = '';
  document.body.classList.add('aberta');
  $('w-lista').hidden = true;
  $('v-nota').hidden = false;
  $('v-nota').append($('sync'));
  trocarModo(modoAtual(), true, false);
}

function trocarModo(novo, focar = false, salvar = true) {
  if (salvar) {
    salvarTituloAgora();
    salvarAgora();
  }

  modo = novo;

  const n = notaPorId(aberta),
    outro = modo === 'editor' ? 'conversa' : 'editor';

  $('n-modo').innerHTML = ICONE_MODO[outro];
  $('n-modo').title = outro === 'editor' ? 'Editor' : 'Conversa';
  $('n-modo').setAttribute('aria-label', $('n-modo').title);
  $('editor').hidden = modo !== 'editor';
  $('conversa').hidden = modo !== 'conversa';
  mostrado = n.texto;
  limparSelecao();
  cancelarEdicao();

  if (modo === 'editor') {
    abrirNoEditor($('editor'), n.texto, aoDigitar);

    if (focar) editor.focus();
  } else {
    desenharConversa(true);
  }

  desenharTitulo();
}

$('n-modo').addEventListener('click', () => {
  if (!aberta) return;
  const novo = modo === 'editor' ? 'conversa' : 'editor';

  store.set(K_MODO, novo);
  trocarModo(novo, true);
});

function desenharTitulo() {
  const n = notaPorId(aberta);
  const titulo = n?.titulo ?? '';

  if (!tSalvarTitulo) $('n-titulo').value = titulo;
  tituloMostrado = titulo;
  document.title = (titulo || 'Nota') + ' · Notas';
}

function salvarTituloAgora() {
  clearTimeout(tSalvarTitulo);
  tSalvarTitulo = null;

  if (!aberta) return;

  salvarTituloNota(aberta, $('n-titulo').value);
  desenharTitulo();
}

$('n-titulo').addEventListener('input', () => {
  const titulo = $('n-titulo').value.trim();

  document.title = (titulo || 'Nota') + ' · Notas';
  clearTimeout(tSalvarTitulo);
  tSalvarTitulo = setTimeout(salvarTituloAgora, SALVAR_MS);
});
$('n-titulo').addEventListener('blur', salvarTituloAgora);
$('n-titulo').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  ev.currentTarget.blur();
});

// O editor mudou: grava quando a digitação parar
function aoDigitar(texto) {
  mostrado = texto;
  clearTimeout(tSalvar);
  tSalvar = setTimeout(salvarAgora, SALVAR_MS);
}

// Grava já o que está no editor (sair da nota, trocar de modo, esconder a página)
function salvarAgora() {
  clearTimeout(tSalvar);
  tSalvar = null;

  if (!aberta || modo !== 'editor' || !editor) return;

  if (salvarNota(aberta, textoDoEditor())) desenharTitulo();
}

function salvarTudoAgora() {
  salvarTituloAgora();
  salvarAgora();
}

// Sai da nota para a lista. Nota que ficou vazia (a nova que não recebeu nada, ou a que teve tudo apagado) some.
function fecharNota() {
  salvarTudoAgora();
  const n = notaPorId(aberta);

  if (n && !n.titulo.trim() && !n.texto.trim()) apagarNota(n.id);
  aberta = null;
}

function voltarParaLista() {
  fecharNota();

  if (history.state?.notas) history.back();
  else {
    notaNaUrl(null, false);
    mostrarLista();
  }
}

$('n-voltar').addEventListener('click', voltarParaLista);

// Voltar e avançar do navegador: a tela segue o endereço
addEventListener('popstate', () => {
  if (aberta && notaDaUrl() !== aberta) fecharNota();
  rotear();
});

// A tela pelo endereço: ?nota=<id> abre a nota; sem, a lista. Nota que não existe (apagada, de outra conta) volta para a
// lista, mas só depois de a nuvem responder (antes disso ela pode estar chegando).
function rotear() {
  const id = notaDaUrl();

  if (id && notaPorId(id)) {
    if (aberta !== id) abrirNota(id, false);

    return;
  }

  if (id && carregado) {
    notaNaUrl(null, false);
    toast('Nota não encontrada.');
  }

  mostrarLista();
}

// Chamado pelo banco (carregar) com a cópia local e de novo com a nuvem, e depois de cada mudança vinda de fora
function mostrar() {
  if (!aberta) return rotear();
  const n = notaPorId(aberta);

  if (!n) {
    // apagada em outro aparelho enquanto estava aberta
    aberta = null;
    notaNaUrl(null, false);
    toast('A nota foi apagada em outro aparelho.');
    mostrarLista();

    return;
  }

  if (n.texto === mostrado) {
    if (n.titulo !== tituloMostrado && !tSalvarTitulo) desenharTitulo();

    return;
  }

  // Chegou um texto novo da nuvem: entra na tela se aqui não há nada digitado esperando para gravar
  if (modo === 'editor') {
    if (tSalvar || textoDoEditor() !== mostrado) return;
    mostrado = n.texto;
    trocarTextoDoEditor(n.texto);
  } else {
    // na conversa, "digitado esperando" é o campo com texto, um parágrafo em edição ou balões selecionados (os índices
    // são do texto da tela): a tela fica como está e o texto novo entra quando isso acabar (cancelar, desmarcar, enviar)
    if (editando !== null || $('c-texto').value.trim() || selecionados.size) return;
    mostrado = n.texto;
    desenharConversa();
  }

  desenharTitulo();
}

// ===== Conversa =====
function desenharConversa(irProFim = false) {
  const el = $('c-baloes'),
    noFim = el.scrollHeight - el.scrollTop - el.clientHeight < 40,
    B = blocos(mostrado);

  el.innerHTML = B.map(
    (b, i) =>
      `<li class="balao${selecionados.has(i) ? ' sel' : ''}${editando === i ? ' editando' : ''}" data-i="${i}">${markdownHtml(b.texto)}</li>`
  ).join('');
  $('c-vazio').hidden = B.length > 0;

  if (irProFim || noFim) el.scrollTop = el.scrollHeight;
}

// Grava o texto novo vindo da conversa (cada ação grava na hora) e redesenha
function gravarConversa(texto, irProFim = false) {
  salvarNota(aberta, texto);
  mostrado = notaPorId(aberta)?.texto ?? texto;
  desenharConversa(irProFim);
  desenharTitulo();
}

// Seleção: segurar ~0,5 s um balão seleciona; com algo selecionado, um toque seleciona ou desseleciona outro
function pintarSelecao() {
  const qtd = selecionados.size;

  $('n-topo').hidden = qtd > 0;
  $('s-barra').hidden = qtd === 0;
  $('s-qtd').textContent = qtd;
  $('s-editar').disabled = qtd !== 1;
  // a chave do toque duplo é a seleção: mudou a seleção, o 1º toque não vale para a nova
  $('s-apagar').dataset.armavel =
    'apagar:' + [...selecionados].sort((a, b) => a - b).join(',');

  for (const b of $('c-baloes').children)
    b.classList.toggle('sel', selecionados.has(+b.dataset.i));
}

function alternar(i, ligar = !selecionados.has(i)) {
  if (ligar) selecionados.add(i);
  else selecionados.delete(i);
  pintarSelecao();
}

function limparSelecao() {
  selecionados.clear();
  pintarSelecao();
}

let tSegurar = null,
  segurou = false,
  toque0 = null;

const soltar = () => {
  clearTimeout(tSegurar);
  tSegurar = null;
  toque0 = null;
};

$('c-baloes').addEventListener('pointerdown', (ev) => {
  const b = ev.target.closest('.balao');

  segurou = false;

  if (!b || ev.button > 0) return;
  toque0 = [ev.clientX, ev.clientY];
  clearTimeout(tSegurar);
  tSegurar = setTimeout(() => {
    tSegurar = null;
    segurou = true;
    alternar(+b.dataset.i, true);
    navigator.vibrate?.(15);
  }, SEGURAR_MS);
});
$('c-baloes').addEventListener('pointermove', (ev) => {
  if (toque0 && Math.hypot(ev.clientX - toque0[0], ev.clientY - toque0[1]) > 10) soltar(); // rolou: não é segurar
});

for (const tipo of ['pointerup', 'pointercancel', 'pointerleave'])
  $('c-baloes').addEventListener(tipo, soltar);

// O menu do toque longo (Android) e o do botão direito não aparecem sobre os balões: segurar é selecionar
$('c-baloes').addEventListener('contextmenu', (ev) => {
  if (ev.target.closest('.balao')) ev.preventDefault();
});

$('c-baloes').addEventListener('click', (ev) => {
  const b = ev.target.closest('.balao');

  if (segurou) {
    // o clique que vem no fim do toque longo: já selecionou
    segurou = false;
    ev.preventDefault();

    return;
  }

  if (!b || !selecionados.size) return; // sem seleção, o link do balão abre normalmente
  ev.preventDefault();
  alternar(+b.dataset.i);
});

// Desmarcou: o texto que chegou da nuvem enquanto havia seleção entra agora (mostrar)
$('s-fechar').addEventListener('click', () => {
  limparSelecao();
  mostrar();
});

$('s-copiar').addEventListener('click', async () => {
  const texto = copiarBlocos(mostrado, [...selecionados]);

  limparSelecao();

  try {
    await navigator.clipboard.writeText(texto);
    toast('Copiado.');
  } catch {
    toast('Não consegui copiar.', true);
  }
});

$('s-editar').addEventListener('click', () => {
  if (selecionados.size !== 1) return;
  const [i] = selecionados;

  limparSelecao();
  editando = i;
  $('c-texto').value = blocos(mostrado)[i]?.texto ?? '';
  $('c-editando').hidden = false;
  crescer();
  desenharConversa();
  $('c-texto').focus();
});

$('s-apagar').addEventListener('click', (ev) => {
  if (!confirmar(ev.currentTarget)) return;
  const indices = [...selecionados];

  limparSelecao();
  cancelarEdicao();
  gravarConversa(apagarBlocos(mostrado, indices));
  toast(
    indices.length > 1 ? `${indices.length} parágrafos apagados.` : 'Parágrafo apagado.'
  );
});

function cancelarEdicao() {
  const estava = editando !== null;

  editando = null;
  $('c-editando').hidden = true;

  if (estava) {
    $('c-texto').value = '';
    crescer();
    desenharConversa();
  }
}

$('c-cancelar').addEventListener('click', () => {
  cancelarEdicao();
  mostrar(); // o texto que chegou da nuvem durante a edição entra agora
});

// O campo cresce com o texto (até o máximo do CSS, depois rola)
function crescer() {
  const t = $('c-texto');

  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 2 + 'px';
}

$('c-texto').addEventListener('input', crescer);

// Enter manda no PC (Shift+Enter quebra a linha); no celular, Enter quebra a linha e manda o botão. Ctrl+Enter manda sempre.
$('c-texto').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || ev.isComposing || ev.shiftKey) return;

  if (ev.ctrlKey || ev.metaKey || matchMedia('(pointer: fine)').matches) {
    ev.preventDefault();
    $('c-form').requestSubmit();
  }
});

$('c-form').addEventListener('submit', (ev) => {
  ev.preventDefault();

  if (!aberta || repetido('enviar')) return;
  const novo = $('c-texto').value;

  if (editando !== null) {
    const i = editando;

    editando = null;
    $('c-editando').hidden = true;
    gravarConversa(trocarBloco(mostrado, i, novo));
  } else {
    if (!limparParagrafo(novo)) return;
    // acrescenta ao texto mais novo da nota (o que chegou da nuvem enquanto se digitava não se perde)
    gravarConversa(acrescentarBloco(notaPorId(aberta)?.texto ?? mostrado, novo), true);
  }

  $('c-texto').value = '';
  crescer();
  $('c-texto').focus();
});

// ===== Esc dentro da nota =====
// Na ordem: desmarca a seleção; cancela a edição de um parágrafo; no editor, só tira o foco; sem nada, volta para a lista.
// (A busca e os vários cursores do editor tratam o Esc antes, no próprio CodeMirror.) Na lista, o Esc sai do app (js/util.js).
document.addEventListener('keydown', (ev) => {
  if (
    aberta &&
    (ev.ctrlKey || ev.metaKey) &&
    !ev.shiftKey &&
    !ev.altKey &&
    ev.key.toLowerCase() === 's'
  ) {
    ev.preventDefault();

    if (modo === 'editor') salvarTudoAgora();
    else {
      salvarTituloAgora();
      salvarNota(aberta, mostrado);
    }

    return;
  }

  if (ev.key !== 'Escape' || ev.defaultPrevented || ev.isComposing || !aberta) return;

  if (selecionados.size) limparSelecao();
  else if (editando !== null) cancelarEdicao();
  else if (ev.target.closest?.('.cm-editor')) editor.contentDOM.blur();
  else if (ev.target.closest?.('input,textarea,select'))
    return; // o 1º Esc no campo só tira o foco (js/util.js)
  else voltarParaLista();

  ev.preventDefault();
});

// Página escondida (trocou de app, fechou a aba): o que foi digitado grava já
addEventListener('pagehide', salvarTudoAgora);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') salvarTudoAgora();
});
