// Ajuda dos testes de CSS do Fin: lê o arquivo como regras (seletores + declarações), em vez de procurar o texto com regex.
// `declaracoes(css, seletor)` junta as declarações ("prop: valor", espaços normalizados) de todas as regras que listam o
// seletor, em qualquer contexto (também dentro de @media); `declaracoes(css, seletor, '@media (min-width: 700px)')` olha só dentro daquele @media.
// `declaracoes(css, seletor, '')` (contexto vazio) olha só as regras da base, fora de qualquer @media: use quando a regra deve valer em toda largura.
const junta = (texto) => texto.split(/\s+/).filter(Boolean).join(' ');

function semComentarios(css) {
  let saida = '';
  let i = 0;

  while (i < css.length) {
    const fim = css.startsWith('/*', i) ? css.indexOf('*/', i) : -1;

    if (fim >= 0) i = fim + 2;
    else saida += css[i++];
  }

  return saida;
}

function regras(css) {
  const lista = [];
  const pilha = [];
  let atual = '';

  for (const c of semComentarios(css)) {
    if (c === '{') {
      pilha.push(junta(atual));
      atual = '';
    } else if (c === '}') {
      const seletor = pilha.pop();

      if (atual.trim())
        lista.push({
          contexto: pilha.join(' '),
          seletores: seletor.split(',').map((s) => junta(s)),
          declaracoes: atual
            .split(';')
            .map((d) => junta(d).replace(/\s*:\s*/, ': '))
            .filter(Boolean),
        });
      atual = '';
    } else atual += c;
  }

  return lista;
}

function declaracoes(css, seletor, contexto) {
  return regras(css)
    .filter(
      (r) =>
        (contexto === undefined || r.contexto === contexto) &&
        r.seletores.includes(seletor)
    )
    .flatMap((r) => r.declaracoes);
}

module.exports = { declaracoes, regras };
