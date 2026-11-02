// Ajuda dos testes do Fin: lê o index.html como elementos (nome da etiqueta + atributos), em vez de procurar o texto com regex.
// `etiquetas(html)` devolve cada etiqueta de abertura como { tag, attrs }, com atributos entre aspas ou sem elas
// (o Prettier escreve de um jeito, o HTML mínimo de outro); atributo sem valor (hidden) vale ''. Comentários e o
// corpo de <script> e <style> ficam de fora; atributo repetido vale o primeiro (como no HTML) e as entidades básicas
// (&quot; &amp; &lt; &gt; &#39; &nbsp;) saem decodificadas.
// `elementoPorId(html, id)` devolve a etiqueta com aquele id (ou undefined; com { obrigatorio: true }, lança erro).
function varrer(html, comFechos = false) {
  const lista = [];
  let i = 0;

  while (i < html.length) {
    const abre = html.indexOf('<', i);

    if (abre < 0) break;

    if (html.startsWith('<!--', abre)) {
      const fimComentario = html.indexOf('-->', abre);

      i = fimComentario < 0 ? html.length : fimComentario + 3;
      continue;
    }

    const primeira = html[abre + 1] || '';

    if (comFechos && primeira === '/') {
      const fimFecho = html.indexOf('>', abre);
      const nome = html.slice(abre + 2, fimFecho < 0 ? html.length : fimFecho).trim();

      lista.push({
        tag: nome.toLowerCase(),
        fecho: true,
        attrs: {},
        ini: abre,
        fim: fimFecho + 1,
      });
      i = fimFecho < 0 ? html.length : fimFecho + 1;
      continue;
    }

    if (!(primeira >= 'a' && primeira <= 'z') && !(primeira >= 'A' && primeira <= 'Z')) {
      i = abre + 1;
      continue;
    }

    // Lê até o '>' que fecha a etiqueta, ignorando os que aparecem dentro de aspas
    let j = abre + 1;
    let aspas = '';

    for (; j < html.length; j++) {
      const c = html[j];

      if (aspas) {
        if (c === aspas) aspas = '';
      } else if (c === '"' || c === "'") aspas = c;
      else if (c === '>') break;
    }

    const etiqueta = lerEtiqueta(html.slice(abre + 1, j));

    lista.push({ ...etiqueta, autoFecha: html[j - 1] === '/', ini: abre, fim: j + 1 });
    i = j + 1;

    // O corpo de <script> e <style> é código, não marcação: pula até o fecho
    if (etiqueta.tag === 'script' || etiqueta.tag === 'style') {
      const fecho = html.toLowerCase().indexOf('</' + etiqueta.tag, i);

      i = fecho < 0 ? html.length : fecho;
    }
  }

  return lista;
}

const etiquetas = (html) => varrer(html).map(({ tag, attrs }) => ({ tag, attrs }));

const ENTIDADES = { quot: '"', amp: '&', lt: '<', gt: '>', '#39': "'", nbsp: ' ' };

const decodificar = (valor) =>
  valor.replace(/&(quot|amp|lt|gt|#39|nbsp);/g, (_, nome) => ENTIDADES[nome]);

function lerEtiqueta(texto) {
  let i = 0;
  const espaco = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r';

  while (i < texto.length && !espaco(texto[i]) && texto[i] !== '/') i++;
  const tag = texto.slice(0, i).toLowerCase();
  const attrs = {};

  // Atributo repetido vale o primeiro, como no HTML
  const guardar = (nome, valor) => {
    if (!Object.hasOwn(attrs, nome)) attrs[nome] = decodificar(valor);
  };

  while (i < texto.length) {
    while (i < texto.length && (espaco(texto[i]) || texto[i] === '/')) i++;

    if (i >= texto.length) break;
    let ini = i;

    while (i < texto.length && !espaco(texto[i]) && texto[i] !== '=' && texto[i] !== '/')
      i++;
    const nome = texto.slice(ini, i);

    while (i < texto.length && espaco(texto[i])) i++;

    if (texto[i] !== '=') {
      guardar(nome, '');
      continue;
    }

    i++;

    while (i < texto.length && espaco(texto[i])) i++;

    if (texto[i] === '"' || texto[i] === "'") {
      const aspasDoValor = texto[i++];

      ini = i;

      while (i < texto.length && texto[i] !== aspasDoValor) i++;
      guardar(nome, texto.slice(ini, i));
      i++;
    } else {
      ini = i;

      while (i < texto.length && !espaco(texto[i])) i++;
      guardar(nome, texto.slice(ini, i));
    }
  }

  return { tag, attrs };
}

// Texto de uma etiqueta simples (ex.: o <title>): do fim da abertura até o fecho da mesma etiqueta.
// Casa a etiqueta inteira (<titlex> não é <title>); sem a etiqueta devolve undefined, sem o fecho lança erro.
function textoDaEtiqueta(html, tag) {
  const abre = varrer(html).find((e) => e.tag === tag);

  if (!abre) return undefined;
  const minusculo = html.toLowerCase();
  let fecho = abre.fim;

  for (;;) {
    fecho = minusculo.indexOf('</' + tag, fecho);

    if (fecho < 0) throw new Error(`<${tag}> sem o fecho </${tag}>`);
    const depois = minusculo[fecho + tag.length + 2];

    if (depois === '>' || depois === ' ' || depois === '\n' || depois === '\t') break;
    fecho++;
  }

  return html.slice(abre.fim, fecho);
}

// Só o texto de um trecho de HTML: sem etiquetas, comentários, <script> e <style>; entidades decodificadas.
function soTexto(trecho) {
  let saida = '';
  let i = 0;

  while (i < trecho.length) {
    const abre = trecho.indexOf('<', i);

    if (abre < 0) {
      saida += trecho.slice(i);
      break;
    }

    saida += trecho.slice(i, abre);

    if (trecho.startsWith('<!--', abre)) {
      const fim = trecho.indexOf('-->', abre);

      i = fim < 0 ? trecho.length : fim + 3;
      continue;
    }

    const prox = trecho[abre + 1] || '';
    const letra = (prox >= 'a' && prox <= 'z') || (prox >= 'A' && prox <= 'Z');

    if (!letra && prox !== '/') {
      saida += '<';
      i = abre + 1;
      continue;
    }

    let j = abre + 1;
    let aspas = '';

    for (; j < trecho.length; j++) {
      const c = trecho[j];

      if (aspas) {
        if (c === aspas) aspas = '';
      } else if (c === '"' || c === "'") aspas = c;
      else if (c === '>') break;
    }

    i = j + 1;

    if (prox !== '/') {
      const nome = lerEtiqueta(trecho.slice(abre + 1, j)).tag;

      if (nome === 'script' || nome === 'style') {
        const fecho = trecho.toLowerCase().indexOf('</' + nome, i);

        i = fecho < 0 ? trecho.length : fecho;
      }
    }
  }

  let plano = decodificar(saida);

  for (const quebra of ['\n', '\r', '\t', ' ']) plano = plano.split(quebra).join(' ');

  return plano.split(' ').filter(Boolean).join(' ');
}

// Texto visível de CADA elemento daquela etiqueta (na ordem da página), sem as etiquetas internas, espaços
// normalizados. Elemento sem fecho (ou void) devolve ''.
function textosDasEtiquetas(html, tag) {
  const itens = varrer(html, true);
  const textos = [];

  itens.forEach((abre, idx) => {
    if (abre.fecho || abre.tag !== tag) return;
    let fundo = 1;
    let fim = -1;

    if (abre.autoFecha || VOID.has(tag)) {
      textos.push('');

      return;
    }

    for (let k = idx + 1; k < itens.length; k++) {
      if (itens[k].tag !== tag) continue;
      fundo += itens[k].fecho ? -1 : itens[k].autoFecha ? 0 : 1;

      if (fundo === 0) {
        fim = itens[k].ini;
        break;
      }
    }

    textos.push(soTexto(html.slice(abre.fim, fim < 0 ? html.length : fim)));
  });

  return textos;
}

// Com { obrigatorio: true }, id que não existe lança erro: o teste não passa em silêncio com a página vazia.
function elementoPorId(html, id, { obrigatorio = false } = {}) {
  const achado = etiquetas(html).find((e) => e.attrs.id === id);

  if (!achado && obrigatorio) throw new Error(`elemento #${id} não está no HTML`);

  return achado;
}

// Balanceamento de uma etiqueta (ex.: div) pela lista de aberturas e fechamentos, sem regex: { abertas, fechadas, soltos, pendentes }.
// "soltos" são fechamentos sem abertura antes; "pendentes", aberturas sem fechamento. Fechamento de outra etiqueta é ignorado.
function balanceamento(html, tag) {
  let abertas = 0;
  let fechadas = 0;
  let soltos = 0;
  let pendentes = 0;

  for (const e of varrer(html, true)) {
    if (e.tag !== tag) continue;

    if (e.fecho) {
      fechadas++;

      if (pendentes > 0) pendentes--;
      else soltos++;
    } else {
      abertas++;
      pendentes++;
    }
  }

  return { abertas, fechadas, soltos, pendentes };
}

// Aninhamento de todas as etiquetas, com pilha, sem regex: devolve a lista de violações (vazia = bem aninhado).
// Fechamento que não casa com o topo da pilha ("</span> fecha <div>"), fechamento sem abertura e abertura sem fecho
// ("<div> sem fecho") entram na lista. Ficam de fora as etiquetas sem fecho (VOID: br, img, input, meta, link, hr…) e as
// que se fecham sozinhas (<path />); comentários e o corpo de <script>/<style> já não aparecem na varredura.
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

// Filhos de <svg> que se fecham com "/>" (em HTML, "<div/>" NÃO fecha: a barra é ignorada e o elemento fica aberto).
const SVG_FILHOS = new Set([
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'ellipse',
  'use',
  'stop',
]);

// Etiquetas de fecho opcional no HTML5: o fim de outra etiqueta (ou do pai) as fecha sem "</x>" explícito.
const OPCIONAIS = new Set([
  'li',
  'p',
  'option',
  'optgroup',
  'dt',
  'dd',
  'tr',
  'td',
  'th',
  'thead',
  'tbody',
  'tfoot',
]);

// "/>" solto no fim da etiqueta (a barra fora de qualquer valor): "<a href=/x/>" é valor sem aspas, não auto-fecho.
function terminaEmBarraSolta(texto) {
  const espaco = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r';
  let i = 0;
  let barra = false;

  while (i < texto.length && !espaco(texto[i]) && texto[i] !== '/') i++;

  while (i < texto.length) {
    if (espaco(texto[i])) {
      i++;
    } else if (texto[i] === '/') {
      barra = true;
      i++;
    } else {
      barra = false;

      while (
        i < texto.length &&
        !espaco(texto[i]) &&
        texto[i] !== '=' &&
        texto[i] !== '/'
      )
        i++;

      while (i < texto.length && espaco(texto[i])) i++;

      if (texto[i] !== '=') continue;
      i++;

      while (i < texto.length && espaco(texto[i])) i++;

      if (texto[i] === '"' || texto[i] === "'") {
        const aspas = texto[i++];

        while (i < texto.length && texto[i] !== aspas) i++;
        i++;
      } else {
        while (i < texto.length && !espaco(texto[i])) i++;
      }
    }
  }

  return barra;
}

function aninhamento(html) {
  const pilha = [];
  const violacoes = [];

  for (const e of varrer(html, true)) {
    if (e.fecho) {
      // Só atravessa etiquetas opcionais (o fim do pai as fecha); qualquer outra no meio é mal aninhada
      let k = pilha.length - 1;

      while (k >= 0 && pilha[k] !== e.tag && OPCIONAIS.has(pilha[k])) k--;

      if (k >= 0 && pilha[k] === e.tag) pilha.length = k;
      else if (pilha.length === 0) violacoes.push(`</${e.tag}> sem abertura`);
      else violacoes.push(`</${e.tag}> fecha com <${pilha[pilha.length - 1]}> aberto`);

      continue;
    }

    const sozinha =
      VOID.has(e.tag) ||
      (SVG_FILHOS.has(e.tag) && terminaEmBarraSolta(html.slice(e.ini + 1, e.fim - 1)));

    if (!sozinha) pilha.push(e.tag);
  }

  for (const tag of pilha) if (!OPCIONAIS.has(tag)) violacoes.push(`<${tag}> sem fecho`);

  return violacoes;
}

module.exports = {
  aninhamento,
  balanceamento,
  etiquetas,
  elementoPorId,
  textoDaEtiqueta,
  textosDasEtiquetas,
};
