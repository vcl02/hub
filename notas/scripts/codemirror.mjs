// Gera notas/vendor/codemirror.js: o CodeMirror 6 num arquivo só (IIFE minificado, global CM), guardado no repositório como
// o supabase.js, porque o hub não tem build. Roda uma vez, à mão, só para trocar de versão:
//   node notas/scripts/codemirror.mjs [pasta-temporária]
// A pasta temporária (padrão: a do sistema) recebe um package.json com as versões EXATAS abaixo e o esbuild; nada entra no
// package.json da raiz. Versões novas: só as publicadas há pelo menos 2 semanas, e as dependências indiretas fixadas em
// INDIRETAS (o npm escolheria a mais nova, que pode ter saído ontem). Confira com `npm ls --all` na pasta temporária.
// Escolhidas em 24/11/2026 (todas publicadas até 10/11/2026).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const VERSOES = {
  '@codemirror/state': '6.7.6',
  '@codemirror/view': '6.43.15',
  '@codemirror/commands': '6.11.1',
  '@codemirror/language': '6.13.1',
  '@codemirror/lang-markdown': '6.5.2',
  '@codemirror/search': '6.7.2',
  '@lezer/highlight': '1.2.5',
};

// As que vêm por baixo e teriam versão de menos de 2 semanas sem isto (as outras indiretas já são antigas)
const INDIRETAS = {
  '@codemirror/lint': '6.9.7',
  '@lezer/common': '1.5.5',
  '@lezer/lr': '1.4.12',
  'style-mod': '4.1.4',
};

const ESBUILD = '0.28.2';

// O que o app usa (js/editor.js), exposto no global CM
const ENTRADA = `
export { EditorState, EditorSelection, Compartment, Prec } from '@codemirror/state';
export {
  EditorView, keymap, drawSelection, dropCursor, highlightActiveLine, highlightSpecialChars, rectangularSelection,
  crosshairCursor, placeholder
} from '@codemirror/view';
export { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
export { LanguageSupport, syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';
export { markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown';
export { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
export { tags } from '@lezer/highlight';
`;

const RAIZ = path.join(import.meta.dirname, '..');
const pasta = path.resolve(process.argv[2] || path.join(tmpdir(), 'notas-codemirror'));

mkdirSync(pasta, { recursive: true });
writeFileSync(
  path.join(pasta, 'package.json'),
  JSON.stringify(
    {
      private: true,
      dependencies: { ...VERSOES, esbuild: ESBUILD },
      overrides: INDIRETAS,
    },
    null,
    2
  )
);
writeFileSync(path.join(pasta, 'entrada.js'), ENTRADA);
execFileSync('npm', ['install', '--no-audit', '--no-fund'], {
  cwd: pasta,
  stdio: 'inherit',
});

const instaladas = (nome) =>
  JSON.parse(readFileSync(path.join(pasta, 'node_modules', nome, 'package.json'), 'utf8'))
    .version;

for (const [nome, versao] of Object.entries({ ...VERSOES, ...INDIRETAS }))
  if (instaladas(nome) !== versao)
    throw new Error(`${nome}: instalou ${instaladas(nome)}, esperava ${versao}`);

const { build } = await import(path.join(pasta, 'node_modules/esbuild/lib/main.js'));
const saida = path.join(RAIZ, 'vendor/codemirror.js');

await build({
  entryPoints: [path.join(pasta, 'entrada.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'CM',
  target: 'es2020',
  legalComments: 'none',
  outfile: saida,
  banner: {
    js: `/* CodeMirror 6 e Lezer, MIT License, Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others (codemirror.net). Gerado por notas/scripts/codemirror.mjs com esbuild ${ESBUILD}: ${Object.entries(
      VERSOES
    )
      .map(([n, v]) => n + '@' + v)
      .join(', ')} */`,
  },
});
console.log(`${path.relative(process.cwd(), saida)}: ${statSync(saida).size} bytes`);
