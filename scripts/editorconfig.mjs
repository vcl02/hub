// Confere os arquivos versionados contra o .editorconfig mais próximo de cada um (o da raiz, o do fin e o do tr):
// charset, fim de linha, newline final, espaço no fim da linha e indentação com espaço (sem tab).
// Sem dependências: roda no GitHub Actions e local (`npm run editorconfig`). O tamanho da indentação é do Prettier.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const BINARIOS = new Set([
  '.png',
  '.ico',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.woff',
  '.woff2',
]);

// Cópia de terceiros (UMD minificado do supabase-js): não é código do hub.
const DE_TERCEIROS = new Set(['supabase.js', 'tr/supabase.js']);
// Exportações do Tasker (XML com tab, gerado pelo app no celular): não se edita à mão.
const EXPORTADOS = ['fin/tasker/'];

const cache = new Map();

function secoes(arquivo) {
  if (!cache.has(arquivo)) {
    const lista = [];
    let atual = null;

    for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
      const texto = linha.trim();

      if (!texto || texto.startsWith('#') || texto.startsWith(';')) continue;

      const cabecalho = texto.match(/^\[(.+)\]$/);

      if (cabecalho) {
        atual = { glob: cabecalho[1], regras: {} };
        lista.push(atual);
      } else {
        const [chave, ...valor] = texto.split('=');
        const nome = chave.trim().toLowerCase();
        const conteudo = valor.join('=').trim().toLowerCase();

        // `root = true` fica antes de qualquer [seção]
        if (atual) atual.regras[nome] = conteudo;
        else if (nome === 'root') lista.root = conteudo === 'true';
      }
    }

    cache.set(arquivo, lista);
  }

  return cache.get(arquivo);
}

// Só o que os .editorconfig do hub usam: `*`, `**` e `{a,b}`.
function casa(glob, nome) {
  const regex = glob
    .replace(/[.+^$()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '@@')
    .replace(/\*/g, '[^/]*')
    .replace(/@@/g, '.*')
    .replace(/\{([^}]*)\}/g, (_, itens) => `(?:${itens.split(',').join('|')})`);

  return new RegExp(`^${glob.includes('/') ? '' : '(?:.*/)?'}${regex}$`).test(nome);
}

// A regra vem do .editorconfig mais próximo; as seções de baixo vencem as de cima.
function regrasDe(arquivo) {
  const regras = {};
  let pasta = path.posix.dirname(arquivo);

  while (true) {
    const config = path.posix.join(pasta === '.' ? '' : pasta, '.editorconfig');

    if (existsSync(config)) {
      const nome = path.posix.relative(pasta, arquivo);

      for (const secao of secoes(config))
        if (casa(secao.glob, nome))
          for (const [chave, valor] of Object.entries(secao.regras))
            if (!(chave in regras)) regras[chave] = valor;

      if (secoes(config).root) break;
    }

    if (pasta === '.') break;
    pasta = path.posix.dirname(pasta);
  }

  return regras;
}

const arquivos = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' }
)
  .split('\n')
  .filter((a) => a && existsSync(a) && !BINARIOS.has(path.extname(a).toLowerCase()))
  .filter((a) => !DE_TERCEIROS.has(a) && !EXPORTADOS.some((p) => a.startsWith(p)));

const erros = [];

for (const arquivo of arquivos) {
  const regras = regrasDe(arquivo);
  const bytes = readFileSync(arquivo);
  let texto;

  try {
    // ignoreBOM: o decodificador descarta o BOM por padrão, e aqui é justamente ele que se procura
    texto = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    erros.push(`${arquivo}: não é UTF-8`);
    continue;
  }

  if (regras.charset === 'utf-8' && texto.charCodeAt(0) === 0xfeff)
    erros.push(`${arquivo}: BOM no começo (charset = utf-8)`);

  if (regras.end_of_line === 'lf' && texto.includes('\r'))
    erros.push(`${arquivo}: CRLF (end_of_line = lf)`);

  if (regras.insert_final_newline === 'true' && texto && !texto.endsWith('\n'))
    erros.push(`${arquivo}: falta newline final`);
  texto.split('\n').forEach((linha, i) => {
    if (regras.trim_trailing_whitespace === 'true' && /[ \t]+\r?$/.test(linha))
      erros.push(`${arquivo}:${i + 1}: espaço no fim da linha`);

    if (regras.indent_style === 'space' && /^ *\t/.test(linha))
      erros.push(`${arquivo}:${i + 1}: tab na indentação (indent_style = space)`);
  });
}

if (erros.length) {
  console.error(erros.join('\n'));
  console.error(`\n${erros.length} problema(s) contra o .editorconfig.`);
  process.exit(1);
}

console.log(`EditorConfig ok em ${arquivos.length} arquivos.`);
