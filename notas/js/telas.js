'use strict';
// Telas: a lista de notas e a nota aberta, no editor (PC, js/editor.js) ou como conversa (celular: um balão por parágrafo,
// js/markdown.js). A nota aberta fica no endereço (?nota=<id>): recarregar mantém, o Voltar do navegador volta para a lista.
// Favoritas: o card fixo no topo da lista abre a "nota" Favoritas (?nota=favoritas), calculada na hora com os parágrafos com
// " ★" de todas as notas; a estrela da barra de seleção (celular) e o botão do topo com Alt+S (editor do PC) põem e tiram a
// marca (js/markdown.js).
// Tudo grava pelo banco (salvarNota, criarNota, apagarNota, moverNota de js/banco.js), que envia à nuvem 0,8 s depois.

const SALVAR_MS = 800; // o editor grava 0,8 s depois de parar de digitar
const SEGURAR_MS = 500; // segurar um balão esse tempo seleciona

const ID_FAVORITAS = 'favoritas'; // a "nota" Favoritas no endereço (os ids de verdade têm 8 letras: nunca batem)

let aberta = null, // id da nota aberta (null: a lista ou a Favoritas)
  emFavoritas = false, // a Favoritas aberta
  favMostradas = [], // as favoritas como estão na tela: [{ notaId, titulo, i, texto }]
  favSel = new Set(), // índices de favMostradas selecionados
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

// Estrela: vazia (favoritar), cheia (o balão favorito) e riscada (tirar das favoritas)
const ESTRELA_D =
  'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z';

const estrela = (tam, cheia, riscada = false) =>
  `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="${cheia ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ESTRELA_D}"/>${riscada ? '<path d="M3 3l18 18"/>' : ''}</svg>`;

const ICONE_FAVORITAR = estrela(18, false),
  ICONE_DESFAVORITAR = estrela(18, false, true),
  ESTRELA_BALAO = `<span class="estrela" title="Favorita" aria-label="Favorita">${estrela(12, true)}</span>`;

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
      `<a class="oque" href="?nota=${esc(n.id)}"><b>${esc(n.titulo || 'Sem título')}</b></a>` +
      `<button type="button" class="bt-ic perigo" data-apagar="${esc(n.id)}" data-armavel="nota:${esc(n.id)}" title="Apagar (toque duas vezes)" aria-label="Apagar">${ICONE_LIXO}</button></li>`
  ).join('');
  $('n-vazio').hidden = L.length > 0;
  $('n-favs-qtd').textContent = contagemFavoritas(favoritas(L).length);
}

// O detalhe do card Favoritas
const contagemFavoritas = (n) =>
  n === 0 ? 'Nenhuma ainda' : n === 1 ? '1 mensagem' : n + ' mensagens';

function mostrarLista() {
  aberta = null;
  emFavoritas = false;
  favSel.clear();
  document.title = 'Notas';
  document.body.classList.remove('aberta');
  $('v-nota').hidden = true;
  $('v-fav').hidden = true;
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

// O card Favoritas: tocar em qualquer parte abre a "nota" (Ctrl/Shift+clique no link: o navegador abre à parte)
$('n-favs').addEventListener('click', (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button) return;
  ev.preventDefault();
  notaNaUrl(ID_FAVORITAS);
  mostrarFavoritas();
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
  emFavoritas = false;
  favSel.clear();
  $('v-fav').hidden = true;
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
  $('n-favorito').hidden = modo !== 'editor';
  mostrado = n.texto;
  limparSelecao();
  cancelarEdicao();

  if (modo === 'editor') {
    abrirNoEditor($('editor'), n.texto, aoDigitar, pintarEstrelaDoEditor);

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

// A estrela do topo (editor): acesa com os parágrafos dos cursores já favoritos; desativada se nenhum pode ser (bloco de
// código, linha em branco)
function pintarEstrelaDoEditor(estado) {
  const ligar = estrelaNoEditor(estado),
    bt = $('n-favorito'),
    acao = ligar === false ? 'Tirar das favoritas' : 'Favoritar o parágrafo';

  bt.disabled = ligar === null;
  bt.setAttribute('aria-pressed', String(ligar === false));
  bt.title = acao + ' (Alt+S)';
  bt.setAttribute('aria-label', acao);
}

function estrelaDoEditor() {
  if (!aberta || modo !== 'editor') return;
  const ligou = favoritarNoEditor();

  if (ligou !== null) toast(ligou ? 'Nas favoritas.' : 'Fora das favoritas.');
}

$('n-favorito').addEventListener('click', () => {
  estrelaDoEditor();
  editor?.focus();
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

// A tela pelo endereço: ?nota=<id> abre a nota (?nota=favoritas, a Favoritas); sem, a lista. Nota que não existe (apagada,
// de outra conta) volta para a lista, mas só depois de a nuvem responder (antes disso ela pode estar chegando).
function rotear() {
  const id = notaDaUrl();

  if (id === ID_FAVORITAS) {
    if (!emFavoritas) mostrarFavoritas();
    else if (!favSel.size) desenharFavoritas(); // com seleção (índices da tela), redesenha ao desmarcar

    return;
  }

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
      `<li class="balao${ehFavorito(b.texto) ? ' favorito' : ''}${selecionados.has(i) ? ' sel' : ''}${editando === i ? ' editando' : ''}" data-i="${i}">` +
      (ehFavorito(b.texto) ? ESTRELA_BALAO : '') +
      `${markdownHtml(semMarca(b.texto))}</li>`
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

  // a estrela: tira se todos os selecionados já são favoritos; senão, favorita; desativada se nenhum pode ser (código)
  const ligar = qtd ? ligarFavorito(mostrado, [...selecionados]) : null,
    acao = ligar === false ? 'Tirar das favoritas' : 'Favoritar';

  $('s-favoritar').disabled = ligar === null;
  $('s-favoritar').innerHTML = ligar === false ? ICONE_DESFAVORITAR : ICONE_FAVORITAR;
  $('s-favoritar').title = acao;
  $('s-favoritar').setAttribute('aria-label', acao);
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

// Segurar seleciona, numa lista de balões (a conversa e a Favoritas): selecionar(b) liga o balão, temSelecao() diz se há
// algo selecionado (aí um toque alterna, alternarBalao(b)), tocar(b, ev) é o toque sem seleção (sem ele, o link abre)
function segurarParaSelecionar(lista, { selecionar, temSelecao, alternarBalao, tocar }) {
  let tSegurar = null,
    segurou = false,
    toque0 = null;

  const soltar = () => {
    clearTimeout(tSegurar);
    tSegurar = null;
    toque0 = null;
  };

  lista.addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest('.balao');

    segurou = false;

    if (!b || ev.button > 0) return;
    toque0 = [ev.clientX, ev.clientY];
    clearTimeout(tSegurar);
    tSegurar = setTimeout(() => {
      tSegurar = null;
      segurou = true;
      selecionar(b);
      navigator.vibrate?.(15);
    }, SEGURAR_MS);
  });
  lista.addEventListener('pointermove', (ev) => {
    if (toque0 && Math.hypot(ev.clientX - toque0[0], ev.clientY - toque0[1]) > 10)
      soltar(); // rolou: não é segurar
  });

  for (const tipo of ['pointerup', 'pointercancel', 'pointerleave'])
    lista.addEventListener(tipo, soltar);

  // O menu do toque longo (Android) e o do botão direito não aparecem sobre os balões: segurar é selecionar
  lista.addEventListener('contextmenu', (ev) => {
    if (ev.target.closest('.balao')) ev.preventDefault();
  });

  lista.addEventListener('click', (ev) => {
    const b = ev.target.closest('.balao');

    if (segurou) {
      // o clique que vem no fim do toque longo: já selecionou
      segurou = false;
      ev.preventDefault();

      return;
    }

    if (!b) return;

    if (temSelecao()) {
      ev.preventDefault();
      alternarBalao(b);
    } else tocar?.(b, ev); // sem seleção, o link do balão abre normalmente
  });
}

segurarParaSelecionar($('c-baloes'), {
  selecionar: (b) => alternar(+b.dataset.i, true),
  temSelecao: () => selecionados.size > 0,
  alternarBalao: (b) => alternar(+b.dataset.i),
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
  $('c-texto').value = semMarca(blocos(mostrado)[i]?.texto ?? ''); // a marca volta sozinha ao enviar
  $('c-editando').hidden = false;
  crescer();
  desenharConversa();
  $('c-texto').focus();
});

$('s-favoritar').addEventListener('click', () => {
  const indices = [...selecionados],
    ligar = ligarFavorito(mostrado, indices);

  if (ligar === null) return;
  limparSelecao();
  gravarConversa(favoritarBlocos(mostrado, indices, ligar));
  toast(ligar ? 'Nas favoritas.' : 'Fora das favoritas.');
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

    const favorito = ehFavorito(blocos(mostrado)[i]?.texto),
      trocado = trocarBloco(mostrado, i, novo);

    editando = null;
    $('c-editando').hidden = true;
    // o parágrafo favorito continua favorito depois de editado (se não foi apagado)
    gravarConversa(
      favorito && limparParagrafo(novo) ? favoritarBlocos(trocado, [i], true) : trocado
    );
  } else {
    if (!limparParagrafo(novo)) return;
    // acrescenta ao texto mais novo da nota (o que chegou da nuvem enquanto se digitava não se perde)
    gravarConversa(acrescentarBloco(notaPorId(aberta)?.texto ?? mostrado, novo), true);
  }

  $('c-texto').value = '';
  crescer();
  $('c-texto').focus();
});

// ===== Favoritas (?nota=favoritas) =====
// Os parágrafos favoritos de todas as notas (favoritas, js/markdown.js), calculados na hora (sempre o texto atual da nota de
// origem), como a conversa também no PC: o mais novo embaixo, abre no fim, cada balão com o título da nota em cima. Tocar
// abre a nota naquele parágrafo; segurar seleciona (Copiar e tirar das favoritas).
function mostrarFavoritas() {
  aberta = null;
  emFavoritas = true;
  favSel.clear();
  document.title = 'Favoritas · Notas';
  document.body.classList.add('aberta');
  $('w-lista').hidden = true;
  $('v-nota').hidden = true;
  $('v-fav').hidden = false;
  $('v-fav').append($('sync'));
  pintarSelecaoFav();
  desenharFavoritas(true);
}

function desenharFavoritas(irProFim = false) {
  const el = $('f-baloes'),
    noFim = el.scrollHeight - el.scrollTop - el.clientHeight < 40;

  favMostradas = favoritas(db?.notas || []);
  el.innerHTML = favMostradas
    .map(
      (f, k) =>
        `<li class="balao favorito${favSel.has(k) ? ' sel' : ''}" data-k="${k}">${ESTRELA_BALAO}` +
        `<small class="de">${esc(f.titulo || 'Sem título')}</small>${markdownHtml(f.texto)}</li>`
    )
    .join('');
  $('f-vazio').hidden = favMostradas.length > 0;

  if (irProFim || noFim) el.scrollTop = el.scrollHeight;
}

function pintarSelecaoFav() {
  const qtd = favSel.size;

  $('f-topo').hidden = qtd > 0;
  $('f-barra').hidden = qtd === 0;
  $('f-qtd').textContent = qtd;

  for (const b of $('f-baloes').children)
    b.classList.toggle('sel', favSel.has(+b.dataset.k));
}

function alternarFav(k, ligar = !favSel.has(k)) {
  if (ligar) favSel.add(k);
  else favSel.delete(k);
  pintarSelecaoFav();
}

// Desmarcou: o que mudou enquanto havia seleção entra agora
function limparSelecaoFav() {
  favSel.clear();
  pintarSelecaoFav();
  desenharFavoritas();
}

function voltarDasFavoritas() {
  if (history.state?.notas) history.back();
  else {
    notaNaUrl(null, false);
    mostrarLista();
  }
}

// Abre a nota da favorita no parágrafo dela: rolado até ele, com um destaque breve (conversa) ou o cursor no começo (editor)
function abrirNoParagrafo(id, i) {
  abrirNota(id);

  if (aberta !== id) return;

  if (modo === 'editor') {
    irAoParagrafoNoEditor(i);

    return;
  }

  const b = $('c-baloes').querySelector(`.balao[data-i="${i}"]`);

  if (!b) return;
  b.scrollIntoView({ block: 'center' });
  b.classList.add('destaque');
  setTimeout(() => b.classList.remove('destaque'), 1500);
}

segurarParaSelecionar($('f-baloes'), {
  selecionar: (b) => alternarFav(+b.dataset.k, true),
  temSelecao: () => favSel.size > 0,
  alternarBalao: (b) => alternarFav(+b.dataset.k),
  tocar: (b, ev) => {
    const f = favMostradas[+b.dataset.k];

    if (!f || ev.target.closest('a')) return; // o link do balão abre normalmente
    ev.preventDefault();
    abrirNoParagrafo(f.notaId, f.i);
  },
});

$('f-voltar').addEventListener('click', voltarDasFavoritas);
$('f-fechar').addEventListener('click', limparSelecaoFav);
$('f-desfavoritar').innerHTML = ICONE_DESFAVORITAR;

$('f-copiar').addEventListener('click', async () => {
  const texto = [...favSel]
    .sort((a, b) => a - b)
    .map((k) => favMostradas[k]?.texto)
    .filter(Boolean)
    .join('\n\n');

  limparSelecaoFav();

  try {
    await navigator.clipboard.writeText(texto);
    toast('Copiado.');
  } catch {
    toast('Não consegui copiar.', true);
  }
});

// Tira das favoritas: em cada nota de origem, a marca dos parágrafos selecionados (o resto do texto fica igual)
$('f-desfavoritar').addEventListener('click', () => {
  const porNota = new Map();

  for (const k of favSel) {
    const f = favMostradas[k];

    if (f) porNota.set(f.notaId, [...(porNota.get(f.notaId) || []), f.i]);
  }

  for (const [id, indices] of porNota) {
    const n = notaPorId(id);

    if (n) salvarNota(id, favoritarBlocos(n.texto, indices, false));
  }

  limparSelecaoFav();
  toast('Fora das favoritas.');
});

// ===== Esc dentro da nota (e Alt+S no editor) =====
// Na Favoritas: desmarca a seleção; sem seleção, volta para a lista. Na nota, na ordem: desmarca a seleção; cancela a edição de um parágrafo; no editor, só tira o foco; sem nada, volta para a lista.
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

  // Alt+S no editor: a estrela nos parágrafos dos cursores (pelo código da tecla: no Mac, Alt+S digita "ß")
  if (
    aberta &&
    modo === 'editor' &&
    ev.altKey &&
    !ev.ctrlKey &&
    !ev.metaKey &&
    !ev.shiftKey &&
    ev.code === 'KeyS'
  ) {
    ev.preventDefault();
    estrelaDoEditor();

    return;
  }

  if (ev.key === 'Escape' && !ev.defaultPrevented && !ev.isComposing && emFavoritas) {
    if (favSel.size) limparSelecaoFav();
    else voltarDasFavoritas();
    ev.preventDefault();

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
