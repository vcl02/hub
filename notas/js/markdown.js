'use strict';
// A nota como conversa, só funções puras (sem tela): os parágrafos do texto (cada um um balão), acrescentar, trocar, apagar e
// copiar parágrafos sem mexer no resto do texto, e o Markdown de um parágrafo em HTML.
// Parágrafo = linhas seguidas não vazias; linha em branco separa (menos dentro de um bloco de código ``` ou ~~~, que fica
// inteiro num balão só). O texto que não foi tocado continua byte a byte igual: só o trecho do parágrafo muda.

const CERCA = /^ {0,3}(`{3,}|~{3,})/; // abre ou fecha um bloco de código

// Os parágrafos do texto: [{ ini, fim, texto }] com as posições no texto (fim exclusivo, sem a quebra do fim).
function blocos(texto) {
  const t = String(texto ?? ''),
    R = [];

  let pos = 0,
    atual = null,
    cerca = null;

  for (const linha of t.split('\n')) {
    const vazia = !linha.trim() && !cerca;

    if (vazia) {
      if (atual) R.push(atual);
      atual = null;
    } else {
      if (!atual) atual = { ini: pos, fim: pos };
      atual.fim = pos + linha.length;
      const m = linha.match(CERCA);

      if (m && !cerca) cerca = m[1];
      else if (
        m &&
        cerca &&
        m[1][0] === cerca[0] &&
        m[1].length >= cerca.length &&
        !linha.trim().slice(m[1].length).trim()
      )
        cerca = null;
    }

    pos += linha.length + 1;
  }

  if (atual) R.push(atual);

  return R.map((b) => ({ ...b, texto: t.slice(b.ini, b.fim) }));
}

// O que se digitou no campo, sem as linhas em branco do começo e os espaços do fim
const limparParagrafo = (novo) =>
  String(novo ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/\s+$/, '');

// Um parágrafo novo no fim (separado por uma linha em branco). Vazio: o texto fica igual.
function acrescentarBloco(texto, novo) {
  const p = limparParagrafo(novo),
    t = String(texto ?? '').replace(/\s+$/, '');

  if (!p) return String(texto ?? '');

  return t ? t + '\n\n' + p : p;
}

// Troca o parágrafo i (o texto em volta fica igual). Vazio: apaga o parágrafo.
function trocarBloco(texto, i, novo) {
  const t = String(texto ?? ''),
    b = blocos(t)[i],
    p = limparParagrafo(novo);

  if (!b) return t;

  if (!p) return apagarBlocos(t, [i]);

  return t.slice(0, b.ini) + p + t.slice(b.fim);
}

// Apaga os parágrafos dos índices, cada um com a linha em branco que o separava do seguinte (o último, a do anterior)
function apagarBlocos(texto, indices) {
  let t = String(texto ?? '');

  for (const i of [...new Set(indices)].sort((a, b) => b - a)) {
    const B = blocos(t),
      b = B[i];

    if (!b) continue;

    if (B[i + 1]) t = t.slice(0, b.ini) + t.slice(B[i + 1].ini);
    else if (B[i - 1]) t = t.slice(0, B[i - 1].fim) + t.slice(b.fim);
    else t = t.slice(0, b.ini) + t.slice(b.fim);
  }

  return t.trim() ? t : '';
}

// Os parágrafos dos índices, na ordem do texto, separados por uma linha em branco (o que o Copiar põe na área de transferência)
function copiarBlocos(texto, indices) {
  const B = blocos(texto);

  return [...new Set(indices)]
    .sort((a, b) => a - b)
    .filter((i) => B[i])
    .map((i) => B[i].texto)
    .join('\n\n');
}

// ===== Markdown → HTML (pequeno, só o que uma anotação usa) =====
// Títulos (#), negrito (** ou __), itálico (* ou _), riscado (~~), código (`x` e blocos ``` ou ~~~), listas (-, *, +, 1.),
// tarefas ([ ] e [x]), citação (>), linha (---) e links ([texto](https://…) e endereços soltos). Todo texto do usuário é
// escapado ANTES de virar HTML; link só com http(s), mailto ou tel, e sempre em outra aba com rel="noopener noreferrer".
const escHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const linkOk = (url) => /^(?:https?:\/\/|mailto:|tel:)/i.test(url);

const abreLink = (url) =>
  `<a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">`;

// Negrito, itálico e riscado num texto já escapado
const enfase = (h) =>
  h
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
    .replace(/(^|[^*])\*(?=[^\s*])([^*]*?[^\s*])\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=[^\s_])([^_]*?[^\s_])_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');

// Uma linha (ou o texto de um item): o código e os links primeiro, guardados à parte, para a ênfase não mexer dentro deles
function inline(s) {
  const guardados = [];
  const guardar = (html) => '\uE000' + (guardados.push(html) - 1) + '\uE000';

  let t = String(s).replace(/\uE000/g, '');

  t = t.replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (_, _c, cod) =>
    guardar('<code>' + escHtml(cod.replace(/^ (.*) $/, '$1')) + '</code>')
  );
  t = t.replace(/\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?\s*\)/g, (m, txt, url) =>
    linkOk(url) ? guardar(abreLink(url) + enfase(escHtml(txt)) + '</a>') : m
  );
  t = t.replace(/\b(?:https?:\/\/|www\.)[^\s<]*[^\s<.,;:!?)\]'"*_~]/gi, (url) =>
    guardar(
      abreLink(/^www\./i.test(url) ? 'https://' + url : url) + escHtml(url) + '</a>'
    )
  );
  t = enfase(escHtml(t));

  // o que foi guardado pode ter guardado dentro (o código no texto de um link): troca até não sobrar nenhum
  while (/\uE000\d+\uE000/.test(t))
    t = t.replace(/\uE000(\d+)\uE000/g, (_, i) => guardados[i]);

  return t;
}

const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

// Item de lista com tarefa: [ ] ou [x] no começo
const tarefa = (txt) => {
  const m = txt.match(/^\[([ xX])\]\s+(.*)$/);

  if (!m) return inline(txt);

  return (
    `<span class="tarefa${m[1] === ' ' ? '' : ' feita'}" aria-hidden="true">${m[1] === ' ' ? '☐' : '☑'}</span> ` +
    inline(m[2])
  );
};

function markdownHtml(md) {
  const L = String(md ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  const H = [];
  let par = [];

  const fecharPar = () => {
    if (par.length) H.push('<p>' + par.map(inline).join('<br>') + '</p>');
    par = [];
  };

  for (let i = 0; i < L.length; i++) {
    const linha = L[i];
    const cerca = linha.match(CERCA);

    if (cerca) {
      fecharPar();
      const codigo = [];

      for (i++; i < L.length; i++) {
        const fim = L[i].match(CERCA);

        if (
          fim &&
          fim[1][0] === cerca[1][0] &&
          fim[1].length >= cerca[1].length &&
          !L[i].trim().slice(fim[1].length).trim()
        )
          break;
        codigo.push(L[i]);
      }

      H.push('<pre><code>' + escHtml(codigo.join('\n')) + '</code></pre>');
      continue;
    }

    if (!linha.trim()) {
      fecharPar();
      continue;
    }

    const titulo = linha.match(/^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/);

    if (titulo) {
      fecharPar();
      const n = titulo[1].length;

      H.push(`<h${n}>${inline(titulo[2])}</h${n}>`);
      continue;
    }

    if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(linha)) {
      fecharPar();
      H.push('<hr>');
      continue;
    }

    if (/^ {0,3}>/.test(linha)) {
      fecharPar();
      const citacao = [];

      for (; i < L.length && /^ {0,3}>/.test(L[i]); i++)
        citacao.push(L[i].replace(/^ {0,3}> ?/, ''));
      i--;
      H.push('<blockquote>' + markdownHtml(citacao.join('\n')) + '</blockquote>');
      continue;
    }

    const item = linha.match(ITEM);

    if (item) {
      fecharPar();

      const numerada = /\d/.test(item[2]),
        itens = [];

      for (; i < L.length; i++) {
        const m = L[i].match(ITEM);

        if (m && /\d/.test(m[2]) === numerada) itens.push(m[3]);
        else if (!m && L[i].trim() && /^\s/.test(L[i]) && itens.length)
          itens[itens.length - 1] += '\n' + L[i].trim(); // continuação do item, recuada
        else break;
      }

      i--;

      const inicio = numerada ? parseInt(item[2], 10) : 1,
        tag = numerada ? 'ol' : 'ul';

      H.push(
        `<${tag}${numerada && inicio !== 1 ? ` start="${inicio}"` : ''}>` +
          itens
            .map((x) => '<li>' + x.split('\n').map(tarefa).join('<br>') + '</li>')
            .join('') +
          `</${tag}>`
      );
      continue;
    }

    par.push(linha.trim());
  }

  fecharPar();

  return H.join('');
}
