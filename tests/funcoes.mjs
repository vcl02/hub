// Ajuda dos testes de funções (sem navegador): tira do código de um app só as declarações pedidas (function, const ou let
// de nível de arquivo) e roda num contexto isolado (node:vm), com o que elas usam de fora passado em `contexto`. Assim a função
// testada é a do próprio arquivo publicado, sem copiar código para o teste e sem abrir o app.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Do início da declaração até a linha em que os parênteses e chaves fecham. Pula strings, templates, comentários de linha e
// expressões regulares simples (o suficiente para o código dos apps; se a extração errar, o vm acusa erro de sintaxe).
function trecho(src, nome) {
  const m = new RegExp(`^(?:async )?(?:function ${nome}\\(|(?:const|let) ${nome}\\s*=)`, 'm').exec(src);
  if (!m) throw Error(`declaração ${nome} não encontrada`);
  let i = m.index, prof = 0, abriu = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '\n' && abriu && prof === 0) break;
    if (c === '/' && src[i + 1] === '/') { const fim = src.indexOf('\n', i); if (abriu && prof === 0) break; i = fim - 1; continue; }
    if (c === '\'' || c === '"' || c === '`') { for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++; continue; }
    if (c === '/' && /[(,=:!&|?;{}\s]/.test(src[i - 1] || ' ') && src[i + 1] !== ' ') {   // regex literal
      for (i++; i < src.length && src[i] !== '/'; i++) { if (src[i] === '\\') i++; else if (src[i] === '[') while (src[++i] !== ']') if (src[i] === '\\') i++; }
      continue;
    }
    if ('({['.includes(c)) { prof++; abriu = true; } else if (')}]'.includes(c)) prof--;
    if (c === ';' && prof === 0) { i++; break; }
  }
  return src.slice(m.index, i);
}

export function carregar(arquivo, nomes, contexto = {}) {
  const src = readFileSync(arquivo, 'utf8'), saida = {};
  vm.runInNewContext(`${nomes.map(n => trecho(src, n)).join('\n')}\n;Object.assign(__saida, { ${nomes.join(', ')} });`, { ...contexto, __saida: saida }, { filename: arquivo });
  return saida;
}

// Módulo inteiro (ex.: corpo/perfil.js e al/gasto.js, que já são só funções puras): roda os arquivos em ordem num contexto
// isolado e devolve as declarações pedidas.
export function carregarArquivos(arquivos, nomes, contexto = {}) {
  const saida = {};
  vm.runInNewContext(`${arquivos.map(a => readFileSync(a, 'utf8').replace(/^'use strict';/, '')).join('\n')}\n;Object.assign(__saida, { ${nomes.join(', ')} });`, { ...contexto, __saida: saida });
  return saida;
}
