// Validação única (como no fin): sintaxe, higiene textual, suíte de testes e diffs com whitespace inválido.
// A suíte usa Playwright: rode antes `npm install` (e, fora de máquina com Chromium, `npx playwright install chromium`).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const testes = readdirSync('tests').filter(nome => nome.endsWith('.test.mjs')).map(nome => `tests/${nome}`);
const comandos = [
  ...['app.js', 'sw.js'].map(arquivo => [process.execPath, ['--check', arquivo]]),
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
