import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import js from '@eslint/js';
import globals from 'globals';

// Os apps são scripts clássicos, sem módulos: cada um usa o que os outros arquivos da página
// declaram no topo. Em vez de desligar o no-undef, o que cada arquivo enxerga é a lista dos
// scripts que o index.html da página carrega (menos ele mesmo, por causa do no-redeclare).
const RAIZ = import.meta.dirname;
const PAGINAS = ['.', 'fin', 'tr', 'al', 'corpo', 'agua'];
// Bibliotecas que chegam por <script> de terceiros (não são arquivos do hub).
const DE_TERCEIROS = { supabase: 'readonly', Chart: 'readonly' };

const ler = (arquivo) => readFileSync(path.join(RAIZ, arquivo), 'utf8');

function scriptsDaPagina(pasta) {
  const html = ler(path.posix.join(pasta, 'index.html'));

  return [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
    .filter((m) => !m[1].startsWith('http'))
    .map((m) => path.posix.normalize(path.posix.join(pasta, m[1])))
    .filter((arquivo) => arquivo !== 'supabase.js');
}

function declaradosNoTopo(arquivo) {
  const nomes = new Set();
  let emDeclaracao = false;

  for (const linha of ler(arquivo).split('\n')) {
    // `let a = 1,` e `  b = 2;`: os demais nomes da declaração vêm na linha de baixo, com 2 espaços.
    const seguinte = emDeclaracao && linha.match(/^ {2}([\w$]+)\s*(?:=|,|;|$)/);

    if (seguinte) nomes.add(seguinte[1]);

    if (/^(?:const|let|var)\s/.test(linha)) emDeclaracao = true;

    if (emDeclaracao && /;\s*(?:\/\/.*)?$/.test(linha)) emDeclaracao = false;
    // `window.x = …` também vira global da página.
    const naJanela = linha.match(/^window\.([\w$]+)\s*=/);

    if (naJanela) nomes.add(naJanela[1]);

    const simples = linha.match(
      /^(?:async\s+)?function\s*\*?\s*([\w$]+)|^(?:const|let|var|class)\s+([\w$]+)/
    );

    if (simples) nomes.add(simples[1] ?? simples[2]);
    const desestrutura = linha.match(/^(?:const|let|var)\s+[{[]([^}\]=]*)[}\]]\s*=/);

    if (desestrutura)
      for (const parte of desestrutura[1].split(','))
        nomes.add(parte.split(':').pop().split('=')[0].trim());
  }

  nomes.delete('');

  return nomes;
}

const paginas = PAGINAS.map((pasta) => {
  const arquivos = scriptsDaPagina(pasta);

  return { arquivos, nomes: new Map(arquivos.map((a) => [a, declaradosNoTopo(a)])) };
});

const dosScriptsDaPagina = paginas.flatMap(({ arquivos, nomes }) =>
  arquivos.map((arquivo) => {
    const dosOutros = {};

    for (const [outro, declarados] of nomes)
      if (outro !== arquivo) for (const nome of declarados) dosOutros[nome] = 'writable';

    return {
      files: [arquivo],
      languageOptions: {
        sourceType: 'script',
        globals: { ...globals.browser, ...DE_TERCEIROS, ...dosOutros },
      },
      // Função de topo que só outro arquivo usa não é "sem uso".
      rules: {
        'no-unused-vars': ['warn', { vars: 'local', argsIgnorePattern: '^_' }],
        // A lista de globais vem de leitura do texto e pode incluir um nome que o arquivo declara.
        'no-redeclare': ['error', { builtinGlobals: false }],
      },
    };
  })
);

// Os testes de cada pasta rodam no Node, mas as funções do page.evaluate usam o que a página declara.
const testesDaPagina = PAGINAS.map((pasta, i) => {
  const daPagina = {};

  for (const declarados of paginas[i].nomes.values())
    for (const nome of declarados) daPagina[nome] = 'writable';
  const testes = pasta === '.' ? 'tests' : pasta + '/tests';

  // O teste também cria globais na página (`window.x = …` dentro do page.evaluate).
  for (const arquivo of readdirSync(path.join(RAIZ, testes), { recursive: true }))
    if (/\.m?js$/.test(arquivo))
      for (const m of ler(
        path.posix.join(testes, arquivo.replaceAll('\\', '/'))
      ).matchAll(/window\.([\w$]+)\s*=/g))
        daPagina[m[1]] = 'writable';

  return {
    files: [testes + '/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...daPagina } },
  };
});

export default [
  // Cópias minificadas de terceiros (UMD do supabase-js): não são código do hub.
  { ignores: ['supabase.js', 'tr/supabase.js', '**/node_modules/**'] },
  js.configs.recommended,
  {
    rules: {
      // Evita o uso de 'var', forçando 'const' ou 'let'
      'no-var': 'error',
      // Avisa se você criar uma variável e esquecer de usar
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      // A REGRA DE ESPAÇAMENTO QUE VOCÊ QUERIA:
      'padding-line-between-statements': [
        'error',
        // Sempre exige linha em branco ANTES de funções, retornos e blocos estruturais
        {
          blankLine: 'always',
          prev: '*',
          next: ['function', 'return', 'if', 'for', 'while', 'switch', 'try'],
        },
        // Sempre exige linha em branco DEPOIS de declarações de variáveis
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        // Abre uma exceção: permite variáveis coladas se a próxima linha também for uma variável
        {
          blankLine: 'any',
          prev: ['const', 'let', 'var'],
          next: ['const', 'let', 'var'],
        },
        // Sempre exige linha em branco DEPOIS de funções, classes e blocos (if, for, try...)
        { blankLine: 'always', prev: ['function', 'class', 'block-like'], next: '*' },
        // E em volta de const de várias linhas (objeto ou lista longa), mesmo entre variáveis
        { blankLine: 'always', prev: '*', next: 'multiline-const' },
        { blankLine: 'always', prev: 'multiline-const', next: '*' },
      ],
    },
  },
  // Node: testes, scripts e a própria configuração (os testes do Fin são CommonJS). Os testes
  // de navegador passam funções ao page.evaluate, que rodam na página: enxergam o browser.
  {
    files: ['**/*.mjs', 'scripts/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['fin/tests/**/*.js', 'fin/scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // Service workers.
  {
    files: ['sw.js', '*/sw.js', 'fin/service-worker.js'],
    languageOptions: { sourceType: 'script', globals: globals.serviceworker },
  },
  ...dosScriptsDaPagina,
  // Teste de navegador: o que vai ao page.evaluate enxerga os globais da página que ele abre.
  ...testesDaPagina,
];
