// Validação do hub inteiro: higiene e testes da raiz, depois a validação própria do fin, do tr e do al.
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const arquivos = ['index.html', 'hub.css', 'hub.js', 'perfil.js', 'sw.js', 'manifest.webmanifest', 'AGENTS.md', 'README.md', '.editorconfig', '.gitignore', '.mcp.json',
  '.claude/settings.json', '.claude/hooks/session-start.sh',
  ...readdirSync('tests').map(n => `tests/${n}`), ...readdirSync('scripts').map(n => `scripts/${n}`),
  ...readdirSync('.github/workflows').map(n => `.github/workflows/${n}`)];
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

const comandos = [
  [process.execPath, ['--check', 'sw.js'], '.'],
  [process.execPath, ['--check', 'hub.js'], '.'],
  [process.execPath, ['--check', 'perfil.js'], '.'],
  [process.execPath, ['--test', 'tests/hub.test.mjs', 'tests/navegacao.test.mjs'], '.'],
  [process.execPath, ['scripts/check.mjs'], 'fin'],
  [process.execPath, ['scripts/check.mjs'], 'tr'],
  [process.execPath, ['scripts/check.mjs'], 'al'],
];
for (const [comando, args, cwd] of comandos) {
  const resultado = spawnSync(comando, args, { stdio: 'inherit', cwd, shell: process.platform === 'win32' });
  if (resultado.status !== 0) process.exit(resultado.status || 1);
}
console.log('Validação do hub concluída.');
