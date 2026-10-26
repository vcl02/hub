// Validação do al: sintaxe, higiene textual, testes (os de navegador usam o Playwright do tr) e diffs com whitespace inválido.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const extensoes = new Set(['.js', '.mjs', '.ts', '.css', '.html', '.sql', '.md', '.json', '.webmanifest', '.svg']);
const arquivos = ['AGENTS.md', 'README.md', 'index.html', 'sw.js', 'gasto.js', 'manifest.webmanifest'];
const coletar = pasta => readdirSync(pasta, { withFileTypes: true }).forEach(e => {
  const caminho = join(pasta, e.name);
  if (e.isDirectory()) coletar(caminho);
  else if (extensoes.has(caminho.slice(caminho.lastIndexOf('.')))) arquivos.push(caminho);
});
['css', 'docs', 'icons', 'js', 'migrations', 'scripts', 'supabase', 'tests'].forEach(coletar);
const erros = [];
for (const arquivo of arquivos) {
  const texto = readFileSync(arquivo, 'utf8');
  if (!texto.endsWith('\n')) erros.push(`${arquivo}: falta newline final`);
  texto.split('\n').forEach((linha, i) => {
    if (/\t/.test(linha)) erros.push(`${arquivo}:${i + 1}: tab não permitido`);
    if (/[ \t]+$/.test(linha)) erros.push(`${arquivo}:${i + 1}: espaço no fim da linha`);
  });
}
if (erros.length) { console.error(erros.join('\n')); process.exit(1); }

const testes = readdirSync('tests').filter(n => n.endsWith('.test.mjs')).map(n => `tests/${n}`);
const comandos = [
  ...['sw.js', 'gasto.js', ...readdirSync('js').map(n => `js/${n}`)].map(arquivo => [process.execPath, ['--check', arquivo]]),
  [process.execPath, ['--test', ...testes]],
  ['git', ['diff', '--check', '--', '.']],
  ['git', ['diff', '--cached', '--check', '--', '.']],
];
for (const [comando, args] of comandos) {
  const resultado = spawnSync(comando, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (resultado.status !== 0) process.exit(resultado.status || 1);
}
console.log('Validação do al concluída.');
