// Validação do hub inteiro: higiene e testes da raiz, depois a validação própria do fin, do tr, do al, do Corpo e da Água (juntas).
import { readdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const arquivos = ['index.html', 'hub.css', 'hub.js', 'habitos.js', 'sw.js', 'manifest.webmanifest', 'AGENTS.md', 'README.md', '.editorconfig', '.gitignore', '.mcp.json',
  '.claude/settings.json', '.claude/hooks/session-start.sh',
  ...readdirSync('docs').map(n => `docs/${n}`), ...readdirSync('tests').map(n => `tests/${n}`), ...readdirSync('scripts').map(n => `scripts/${n}`), ...readdirSync('migrations').map(n => `migrations/${n}`), ...readdirSync('base').map(n => `base/${n}`),
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

// Sintaxe da raiz primeiro; depois os testes da raiz e os apps ao mesmo tempo: cada um sobe o próprio servidor numa porta livre e o próprio
// Chromium, e a saída de cada um aparece inteira quando ele termina (sem misturar linhas). O total fica o do mais lento.
const raiz = [
  [process.execPath, ['--check', 'sw.js']],
  [process.execPath, ['--check', 'hub.js']],
  [process.execPath, ['--check', 'habitos.js']],
];
for (const [comando, args] of raiz) {
  const resultado = spawnSync(comando, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (resultado.status !== 0) process.exit(resultado.status || 1);
}
const tarefas = [['raiz', '.', ['--test', 'tests/hub.test.mjs', 'tests/documentacao.test.mjs', 'tests/habitos.test.mjs', 'tests/navegacao.test.mjs']],
  ...['fin', 'tr', 'al', 'corpo', 'agua'].map(app => [app, app, ['scripts/check.mjs']])];
const rodar = ([nome, cwd, args]) => new Promise(ok => {
  const inicio = Date.now(), filho = spawn(process.execPath, args, { cwd, shell: process.platform === 'win32' });
  let saida = '';
  filho.stdout.on('data', d => { saida += d; }); filho.stderr.on('data', d => { saida += d; });
  filho.on('close', status => ok({ nome, status, saida, s: Math.round((Date.now() - inicio) / 1000) }));
});
const resultados = await Promise.all(tarefas.map(rodar));
for (const r of resultados) process.stdout.write(`\n===== ${r.nome} (${r.s} s) =====\n${r.saida}`);
const falhou = resultados.filter(r => r.status !== 0);
if (falhou.length) { console.error(`\nFalhou: ${falhou.map(r => r.nome).join(', ')}`); process.exit(1); }
console.log(`Validação do hub concluída (${resultados.map(r => `${r.nome} ${r.s} s`).join(', ')}).`);
