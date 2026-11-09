// Ajuda dos testes do Fin, complemento de html.js: o index.html como ÁRVORE de elementos (quem está dentro de quem, a ordem
// e o texto de cada um), sem regex. `dom(html)` devolve { nos, porId, texto }:
//   nos       todos os elementos, na ordem do documento; cada um é { tag, attrs, classes, pai, filhos, ini, fim }
//   porId(id) o elemento com aquele id (ou undefined)
//   texto(no) o texto visível dentro do elemento (sem etiquetas nem comentários)
// `textoVisivel(html)` junta o texto de todo o documento e `mencionaNoHtml(html, nome)` diz se o nome aparece em algum valor
// de atributo (id, class, title...) ou no texto visível. Comentários ficam de fora, como no html.js.
const { etiquetas } = require('./html');

const SEM_FECHO = new Set(['input', 'br', 'img', 'meta', 'link', 'hr', 'source', 'col']);
const letra = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

// Percorre o HTML e devolve os eventos em ordem: abertura de etiqueta, fecho e pedaço de texto
function eventos(html) {
  const lista = [];
  let i = 0;

  while (i < html.length) {
    const abre = html.indexOf('<', i);

    if (abre < 0) break;

    if (abre > i) lista.push({ tipo: 'texto', texto: html.slice(i, abre) });

    if (html.startsWith('<!--', abre)) {
      const fim = html.indexOf('-->', abre);

      i = fim < 0 ? html.length : fim + 3;
      continue;
    }

    const proxima = html[abre + 1] || '';

    if (!letra(proxima) && proxima !== '/') {
      lista.push({ tipo: 'texto', texto: '<' });
      i = abre + 1;
      continue;
    }

    let j = abre + 1;
    let aspas = '';

    for (; j < html.length; j++) {
      const c = html[j];

      if (aspas) {
        if (c === aspas) aspas = '';
      } else if (c === '"' || c === "'") aspas = c;
      else if (c === '>') break;
    }

    if (proxima === '/') {
      lista.push({
        tipo: 'fecha',
        tag: html
          .slice(abre + 2, j)
          .trim()
          .toLowerCase(),
        ini: abre,
      });
    } else {
      const { tag, attrs } = etiquetas(html.slice(abre, j + 1))[0];

      lista.push({
        tipo: 'abre',
        tag,
        attrs,
        ini: abre,
        fim: j + 1,
        autoFechada: html[j - 1] === '/',
      });
    }

    i = j + 1;
  }

  if (i < html.length) lista.push({ tipo: 'texto', texto: html.slice(i) });

  return lista;
}

function dom(html) {
  const nos = [];
  const pilha = [];

  for (const ev of eventos(html)) {
    if (ev.tipo === 'abre') {
      const no = {
        tag: ev.tag,
        attrs: ev.attrs,
        classes: (ev.attrs.class || '').split(' ').filter(Boolean),
        pai: pilha[pilha.length - 1],
        filhos: [],
        ini: ev.ini,
        fim: ev.fim,
        fimDoConteudo: ev.fim,
      };

      no.pai?.filhos.push(no);
      nos.push(no);

      if (!ev.autoFechada && !SEM_FECHO.has(ev.tag)) pilha.push(no);
    } else if (ev.tipo === 'fecha') {
      const posicao = pilha.map((n) => n.tag).lastIndexOf(ev.tag);

      if (posicao >= 0) {
        pilha[posicao].fimDoConteudo = ev.ini;
        pilha.length = posicao;
      }
    }
  }

  return {
    nos,
    porId: (id) => nos.find((n) => n.attrs.id === id),
    texto: (no) => textoVisivel(html.slice(no.fim, no.fimDoConteudo)),
  };
}

const textoVisivel = (html) =>
  eventos(html)
    .filter((e) => e.tipo === 'texto')
    .map((e) => e.texto)
    .join(' ');

function mencionaNoHtml(html, nome) {
  return (
    etiquetas(html).some((e) => Object.values(e.attrs).some((v) => v.includes(nome))) ||
    textoVisivel(html).includes(nome)
  );
}

module.exports = { dom, textoVisivel, mencionaNoHtml };
