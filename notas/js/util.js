'use strict';
// Utilidades: armazenamento local, avisos, a nota no endereço (?nota=), o jeito de abrir a nota (editor ou conversa), a data
// da lista e o Esc. O toque duplo para confirmar e o toque repetido vêm do núcleo comum (../base/nucleo.js, carregado antes).
const $ = (id) => document.getElementById(id);

const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);

      return true;
    } catch {
      return false;
    }
  },
  del: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // sem armazenamento (aba privada): nada a apagar
    }
  },
};

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const pad = (n) => String(n).padStart(2, '0');

let tToast;

function toast(msg, erro = false) {
  $('toast').textContent = msg;
  $('toast').classList.toggle('erro', erro);
  $('toast').hidden = false;
  clearTimeout(tToast);
  tToast = setTimeout(() => {
    $('toast').hidden = true;
  }, 2800);
}

// ===== A nota no endereço, como o ?ciclo do Fin: ?nota=<id> com a nota aberta, nada na lista =====
// O id tem o formato da tabela (letras, números, _ e -); outro texto vale como lista.
const notaDaUrl = () => {
  const id = new URLSearchParams(location.search).get('nota');

  return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
};

// Abrir uma nota empilha no histórico (o Voltar do navegador volta para a lista); empilhar = false só substitui.
// O estado { notas: true } marca a entrada que este app empilhou: voltar por ela é history.back().
function notaNaUrl(id, empilhar = true) {
  const url = new URL(location.href);

  if (id) url.searchParams.set('nota', id);
  else url.searchParams.delete('nota');
  const destino = url.pathname + url.search + url.hash;

  if (destino === location.pathname + location.search + location.hash) return;

  if (empilhar) history.pushState({ notas: true }, '', destino);
  else history.replaceState(history.state, '', destino);
}

// ===== Editor ou conversa =====
// Pelo aparelho: mouse (ponteiro fino) e tela larga (≥ 900 px) abrem o editor; o resto (celular, tablet), a conversa.
// O botão do canto troca e a escolha fica no aparelho (notas.modo); sem escolha, vale o aparelho.
const LARGURA_EDITOR = 900,
  K_MODO = 'notas.modo';

const modoDoAparelho = (fino, largura) =>
  fino && largura >= LARGURA_EDITOR ? 'editor' : 'conversa';

function modoAtual() {
  const escolhido = store.get(K_MODO);

  if (escolhido === 'editor' || escolhido === 'conversa') return escolhido;

  return modoDoAparelho(matchMedia('(pointer: fine)').matches, innerWidth);
}

// ===== Data da última edição, na lista =====
// Hoje: a hora ("14:05"); ontem: "ontem"; neste ano: "19/11"; antes: "19/11/25". Na hora local do aparelho.
function quandoFoi(isoTexto, agora = new Date()) {
  const d = new Date(isoTexto);

  if (!Number.isFinite(d.getTime())) return '';

  const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(),
    dias = Math.round((dia(agora) - dia(d)) / 864e5);

  if (dias === 0) return pad(d.getHours()) + ':' + pad(d.getMinutes());

  if (dias === 1) return 'ontem';

  return (
    pad(d.getDate()) +
    '/' +
    pad(d.getMonth() + 1) +
    (d.getFullYear() !== agora.getFullYear()
      ? '/' + String(d.getFullYear()).slice(2)
      : '')
  );
}

// ===== Esc =====
// Esc sai do app (volta para a página inicial do hub, ../) quando nada mais usou a tecla: o que está aberto (a nota, a seleção,
// a edição de um parágrafo, a busca do editor) trata antes e chama preventDefault; num campo de texto, o 1º Esc só tira o
// foco. Mesma regra em todos os apps.
function sairDoApp() {
  location.href = '../';
}

addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || ev.defaultPrevented || ev.isComposing) return;

  if (ev.target.closest?.('input,textarea,select')) {
    ev.target.blur();

    return;
  }

  if (document.querySelector('dialog[open]')) return;
  sairDoApp();
});
