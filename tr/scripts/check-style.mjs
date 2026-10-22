// Higiene textual sem dependências: detecta tabs, espaços finais e arquivo sem newline final.
// supabase.js fica de fora: é o pacote do supabase-js copiado byte a byte.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const extensoes = new Set(['.js', '.mjs', '.css', '.html', '.sql', '.md', '.yml', '.json', '.webmanifest']);
const raizes = ['css', 'docs', 'js', 'migrations', 'scripts', 'tests', '.github'];
const arquivos = ['.editorconfig', 'AGENTS.md', 'README.md', 'index.html', 'sw.js', 'manifest.webmanifest', 'package.json'];

function coletar(pasta) {
  readdirSync(pasta, { withFileTypes: true }).forEach(entrada => {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) coletar(caminho);
    else if (extensoes.has(caminho.slice(caminho.lastIndexOf('.')))) arquivos.push(caminho);
  });
}

raizes.forEach(coletar);
const erros = [];
arquivos.forEach(arquivo => {
  const texto = readFileSync(arquivo, 'utf8');
  if (!texto.endsWith('\n')) erros.push(`${arquivo}: falta newline final`);
  texto.split(/\r?\n/).forEach((linha, indice) => {
    if (/\t/.test(linha)) erros.push(`${arquivo}:${indice + 1}: tab não permitido`);
    if (/[ \t]+$/.test(linha)) erros.push(`${arquivo}:${indice + 1}: espaço no fim da linha`);
  });
});

if (erros.length) {
  console.error(erros.join('\n'));
  process.exit(1);
}
console.log('Higiene textual aprovada.');
