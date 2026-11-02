// Leitores de HTML e CSS para os testes ESM (raiz, tr, al, corpo, agua). São os mesmos do Fin (fin/tests/helpers),
// em CommonJS; aqui só viram import. Em vez de procurar texto com regex, o teste lê o `index.html` como elementos
// (`etiquetas`, `elementoPorId`, `textoDaEtiqueta`, `balanceamento`) e o CSS como regras (`declaracoes`, `regras`).
import { createRequire } from 'node:module';

const exigir = createRequire(import.meta.url);
const html = exigir('../fin/tests/helpers/html.js');
const css = exigir('../fin/tests/helpers/regras-css.js');

export const {
  etiquetas,
  elementoPorId,
  textoDaEtiqueta,
  textosDasEtiquetas,
  balanceamento,
  aninhamento,
} = html;
export const { declaracoes, regras } = css;

// Chaves do CSS fora dos comentários: { abertas, fechadas, aberta } (aberta = a profundidade nunca ficou negativa). Sem regex:
// anda caractere a caractere e pula /* ... */. Serve para conferir que o arquivo não tem chave sobrando nem faltando.
export function chavesDoCss(css) {
  let abertas = 0,
    fechadas = 0,
    nivel = 0,
    nuncaNegativo = true;

  for (let i = 0; i < css.length; i++) {
    if (css[i] === '/' && css[i + 1] === '*') {
      const fim = css.indexOf('*/', i + 2);

      i = fim < 0 ? css.length : fim + 1;
      continue;
    }

    if (css[i] === '{') {
      abertas++;
      nivel++;
    } else if (css[i] === '}') {
      fechadas++;
      nivel--;

      if (nivel < 0) nuncaNegativo = false;
    }
  }

  return { abertas, fechadas, nuncaNegativo };
}
