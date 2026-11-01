// Asserts dos testes do Fin que olham o texto do código (JS, HTML, CSS, TS) sem depender do formato (Prettier):
// `match` e `doesNotMatch` tentam o texto como está e, se não casar, uma forma canônica dos dois lados
// (sem espaços e quebras ao redor de pontuação, aspas simples, sem vírgula final, sem parênteses
// em arrow de um parâmetro, atributos HTML sem aspas, `.5` como `0.5`). No `match`, a forma frouxa também
// ignora caixa e parênteses. O resto é o `node:assert/strict`.
const assert = require('node:assert/strict');

const cache = new Map();
const MARCA = '\u0001';

function canonico(texto, retirarParenteses = null) {
  const r = texto
    .replace(/\r/g, '')
    .replace(/\\?"/g, "'")
    .replace(/\\?\(([\w$]+)\\?\)\s*=>/g, '$1 =>')
    .replace(/\s+/g, ' ')
    .replace(/=(\\?)'([^'\s<>=`]+)'/g, '=$2')
    .replace(/ ?\\?\/>/g, '>')
    .replace(/(^|[^\d\\.\w])\.(\d)/g, '$10.$2')
    .replace(/(^|[^\d\\.\w])\\\.(\d)/g, '$10\\.$2')
    .replace(/ ?([^\w\s]) ?/g, '$1')
    .replace(/,(\\?[)\]}])/g, '$1');

  if (retirarParenteses === 'fonte') return r.replace(/[()]/g, '');

  if (retirarParenteses === 'regex') return r.replace(/\\[()]/g, '');

  return r;
}

function canonicoDaFonte(texto, frouxo = false) {
  const chave = `${frouxo ? 'f' : 'n'}${texto}`;

  if (!cache.has(chave)) cache.set(chave, canonico(texto, frouxo ? 'fonte' : null));

  return cache.get(chave);
}

function canonicoDaRegex(regex, frouxo) {
  const fonte = regex.source
    .replaceAll('[\\s\\S]', MARCA)
    .replace(/\\n(?: \{\d+\})?|\\s[*+]?|\\t/g, ' ');

  const flags =
    regex.flags.replace(/[mgi]/g, '') + (frouxo || regex.flags.includes('i') ? 'i' : '');

  try {
    const canonica = canonico(fonte, frouxo ? 'regex' : null).replace(
      frouxo ? /,$/ : /(?!)/,
      ''
    );

    return new RegExp(canonica.replaceAll(MARCA, '[\\s\\S]'), flags);
  } catch {
    return null;
  }
}

function casa(texto, regex, frouxo = false) {
  if (typeof texto !== 'string' || !(regex instanceof RegExp)) return null;
  const alternativa = canonicoDaRegex(regex, frouxo);

  return alternativa ? alternativa.test(canonicoDaFonte(texto, frouxo)) : false;
}

const tolerante = Object.assign((...args) => assert(...args), assert, {
  match(texto, regex, mensagem) {
    if (casa(texto, regex, true)) return;
    assert.match(texto, regex, mensagem);
  },
  doesNotMatch(texto, regex, mensagem) {
    assert.doesNotMatch(texto, regex, mensagem);

    if (casa(texto, regex))
      assert.fail(mensagem || `O texto casa com ${regex} (forma canônica)`);
  },
});

tolerante.canonico = canonicoDaFonte;
module.exports = tolerante;
