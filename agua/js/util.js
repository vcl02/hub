'use strict';
// Utilidades: datas, números, armazenamento local, avisos e confirmação com toque duplo (armado pela chave do item).
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
};

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

const deIso = (d) => {
  const [a, m, dia] = d.split('-').map(Number);

  return new Date(a, m - 1, dia);
};

const hoje = () => iso(new Date());

// ?dia=AAAA-MM-DD: a página inicial abriu o app num dia anterior, só leitura (hoje, futuro ou inválido: o app normal)
const diaDaUrl = () => {
  const d = new URLSearchParams(location.search).get('dia');

  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < hoje() ? d : null;
};

// O dia no endereço, como o ?ciclo do Fin: ?dia=AAAA-MM-DD num dia anterior, nada em hoje. Trocar de dia empilha no histórico
// (o Voltar do navegador volta ao dia visto antes); empilhar = false só substitui. Os outros parâmetros ficam.
// Nome do dia na barra ‹ ›, como no al: Hoje, Ontem ou "quarta, 21/10"
const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function nomeDoDia(d) {
  const n = Math.round((deIso(hoje()) - deIso(d)) / 864e5);

  if (n === 0) return 'Hoje';

  if (n === 1) return 'Ontem';
  const [, m, dia] = d.split('-');

  return NOME_DIA[deIso(d).getDay()] + ', ' + dia + '/' + m;
}

function diaNaUrl(dia, empilhar = true) {
  const url = new URL(location.href);

  if (dia && dia < hoje()) url.searchParams.set('dia', dia);
  else url.searchParams.delete('dia');
  const destino = url.pathname + url.search + url.hash;

  if (destino === location.pathname + location.search + location.hash) return;

  if (empilhar) history.pushState(history.state, '', destino);
  else history.replaceState(history.state, '', destino);
}

const dataOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);

const agoraHHMM = () => {
  const d = new Date();

  return pad(d.getHours()) + ':' + pad(d.getMinutes());
};

const minutos = (h) => {
  const [a, b] = h.split(':').map(Number);

  return a * 60 + b;
};

const num = (s) => parseFloat(String(s ?? '').replace(',', '.'));
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('pt-BR');
const virgula = (n) => String(n).replace('.', ',');

function dataCurta(d) {
  const [a, m, dia] = d.split('-');

  return dia + '/' + m + (+a !== new Date().getFullYear() ? '/' + a.slice(2) : '');
}

function quando(d) {
  const t = new Date(),
    n = Math.round(
      (new Date(t.getFullYear(), t.getMonth(), t.getDate()) - deIso(d)) / 864e5
    );

  return n === 0
    ? 'hoje'
    : n === 1
      ? 'ontem'
      : n > 1 && n < 7
        ? 'há ' + n + ' dias'
        : dataCurta(d);
}

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

// Botões só com ícone: title e aria-label obrigatórios
const ICONES = {
  lixo: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lapis: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
};

const btIcone = (icone, titulo, attrs, classe = '') =>
  `<button type="button" class="bt-ic ${classe}" ${attrs} title="${titulo}" aria-label="${titulo}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[icone]}</svg></button>`;

// ===== Toque duplo para confirmar (tirar, apagar, jogar fora) =====
// O 1º toque arma o item (o botão fica vermelho por 3 s) e o 2º confirma. O armado fica guardado pela chave do item
// (data-armavel no botão), não no botão: a lista redesenhada no meio (a nuvem que chega) devolve o vermelho ao botão novo do
// mesmo item, e o 2º toque tira esse item, nunca o vizinho que ficou no lugar. Mesma regra em todos os apps.
const ARMADO_MS = 3000;
let armados = {}; // chave do item → até quando (ms)

const estaArmado = (chave) => armados[chave] > Date.now();

function armar(chave) {
  armados[chave] = Date.now() + ARMADO_MS;
  setTimeout(pintarArmados, ARMADO_MS); // o prazo acabou: o vermelho sai
}

function desarmar(chave) {
  delete armados[chave];
}

// Cada botão com data-armavel fica vermelho só enquanto o item dele está armado; o prazo vencido sai da lista
function pintarArmados() {
  document
    .querySelectorAll('[data-armavel]')
    .forEach((b) => b.classList.toggle('armado', estaArmado(b.dataset.armavel)));

  for (const k of Object.keys(armados)) if (!estaArmado(k)) delete armados[k];
}

// true no 2º toque no mesmo item dentro do prazo; o 1º só arma. Botão sem data-armavel nunca arma nem confirma: sem a
// chave, todos dividiriam uma só ("undefined") e o 2º toque num botão confirmaria o 1º de outro (erro no console, sem quebrar).
function confirmar(btn) {
  const k = btn.dataset.armavel;

  if (!k) {
    console.error('confirmar: botão sem data-armavel', btn);

    return false;
  }

  if (estaArmado(k)) {
    desarmar(k);
    pintarArmados();

    return true;
  }

  armar(k);
  pintarArmados();

  return false;
}

// Chave de item sem id (copo de água): o conteúdo e, entre iguais, a vez dele (#1, #2…); nunca a posição na lista,
// que muda quando a nuvem traz um item antes
function chavesDosItens(L, texto) {
  const vez = {};

  return L.map((x) => {
    const t = texto(x);

    vez[t] = (vez[t] || 0) + 1;

    return `${t}#${vez[t]}`;
  });
}

// Lista redesenhada (innerHTML novo, de qualquer desenho): os botões novos dos itens armados voltam vermelhos
new MutationObserver(() => {
  if (Object.keys(armados).length) pintarArmados();
}).observe(document.documentElement, { childList: true, subtree: true });

// Toque repetido sem querer (o dedo que bate duas vezes, o clique duplo): a mesma ação de novo em menos de 0,5 s é ignorada
const REPETIDO_MS = 500;
let ultimaAcao = { k: '', em: 0 };

function repetido(k) {
  const agora = Date.now(),
    r = ultimaAcao.k === k && agora - ultimaAcao.em < REPETIDO_MS;

  ultimaAcao = { k, em: agora };

  return r;
}

const somaDias = (d, n) => {
  const x = deIso(d);

  x.setDate(x.getDate() + n);

  return iso(x);
};

const inteiro = (n) => Math.round(n).toLocaleString('pt-BR');

// Arrastar de lado (celular) e ← → (computador) trocam o dia, como ‹ ›, no mesmo sentido de todo o hub: para a direita (ou ←),
// o dia anterior. Só gesto claramente horizontal, longo ou rápido (80 px, ou 40 px rápido); campo (e o que estiver em fora, ex.:
// gráfico) não arrasta, e as setas dentro de um campo andam no texto. trocar(-1) = dia anterior · trocar(1) = o seguinte.
function arrastarDias(tela, trocar, fora = 'input,textarea,select') {
  let x0 = 0,
    y0 = 0,
    t0 = 0,
    ativo = false,
    eixo = null;

  tela.addEventListener(
    'touchstart',
    (ev) => {
      ativo = ev.touches.length === 1 && !ev.target.closest(fora);
      eixo = null;

      if (ativo) {
        x0 = ev.touches[0].clientX;
        y0 = ev.touches[0].clientY;
        t0 = Date.now();
      }
    },
    { passive: true }
  );
  tela.addEventListener(
    'touchmove',
    (ev) => {
      if (!ativo || eixo) return;

      const dx = ev.touches[0].clientX - x0,
        dy = ev.touches[0].clientY - y0;

      if (Math.abs(dx) > 10 || Math.abs(dy) > 10)
        eixo = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
    },
    { passive: true }
  );
  tela.addEventListener('touchend', (ev) => {
    if (!ativo) return;
    ativo = false;

    const dx = ev.changedTouches[0].clientX - x0,
      rapido = Date.now() - t0 < 300;

    if (eixo === 'x' && (Math.abs(dx) > 80 || (rapido && Math.abs(dx) > 40)))
      trocar(dx > 0 ? -1 : 1);
  });
  tela.addEventListener('touchcancel', () => {
    ativo = false;
  });
  document.addEventListener('keydown', (ev) => {
    if (
      tela.hidden ||
      !['ArrowLeft', 'ArrowRight'].includes(ev.key) ||
      ev.altKey ||
      ev.ctrlKey ||
      ev.metaKey ||
      ev.target.closest?.('input,textarea,select')
    )
      return;
    ev.preventDefault();
    trocar(ev.key === 'ArrowLeft' ? -1 : 1);
  });
}

// ===== Esc =====
// Esc sai do app (volta para a página inicial do hub, ../) quando nada mais usou a tecla: o que está aberto (prévia, edição na
// linha) trata antes e chama preventDefault; num campo de texto, o 1º Esc só tira o foco. Mesma regra em todos os apps.
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
