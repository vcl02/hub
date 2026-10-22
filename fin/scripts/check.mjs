// Validação única e sem dependências: sintaxe, suíte Node e diffs com whitespace inválido.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const js = readdirSync('js').filter(nome => nome.endsWith('.js')).map(nome => `js/${nome}`);
const testes = readdirSync('tests').filter(nome => nome.endsWith('.test.js')).map(nome => `tests/${nome}`);
const comandos = [
  ...js.map(arquivo => [process.execPath, ['--check', arquivo]]),
  [process.execPath, ['scripts/check-style.mjs']],
  [process.execPath, ['--test', ...testes]],
  ['git', ['diff', '--check']],
  ['git', ['diff', '--cached', '--check']],
];

for (const [comando, args] of comandos) {
  const resultado = spawnSync(comando, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (resultado.status !== 0) process.exit(resultado.status || 1);
}

console.log('Validação local concluída.');
