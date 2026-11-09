// Contrato de edição: EditorConfig e validação nativa preservam um estilo leve e previsível.
const assert = require('./helpers/assert-tolerante');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorconfig = fs.readFileSync('.editorconfig', 'utf8');
const checagem = fs.readFileSync('scripts/check.mjs', 'utf8');
const higiene = path.resolve('scripts/check-style.mjs');

test('define espaços, UTF-8, newline final e regras próprias para CSS/HTML/SQL/Markdown', () => {
  assert.match(editorconfig, /charset = utf-8/);
  assert.match(editorconfig, /end_of_line = lf/);
  assert.match(editorconfig, /insert_final_newline = true/);
  assert.match(editorconfig, /trim_trailing_whitespace = true/);
  assert.match(editorconfig, /indent_style = space/);
  assert.match(editorconfig, /\[\*\.\{css,html,sql,md\}\]/);
});

// Monta uma cópia mínima do projeto numa pasta temporária e roda a higiene de verdade (o script lê a partir da pasta atual).
function projetoComArquivo(conteudoDoJs) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-higiene-'));

  for (const dir of ['css', 'docs', 'js', 'migrations', 'scripts', 'tests'])
    fs.mkdirSync(path.join(pasta, dir));

  for (const arquivo of ['.editorconfig', 'AGENTS.md', 'docs/REGRAS.md', 'index.html'])
    fs.writeFileSync(path.join(pasta, arquivo), 'ok\n');
  fs.writeFileSync(path.join(pasta, 'js', 'a.js'), conteudoDoJs);

  return pasta;
}

test('comando único executa a higiene textual sem formatter externo', () => {
  assert.match(checagem, /scripts\/check-style\.mjs/); // faz parte da validação do Fin

  const limpa = projetoComArquivo('const a = 1;\n');

  const saida = execFileSync(process.execPath, [higiene], {
    cwd: limpa,
    encoding: 'utf8',
  });

  assert.match(saida, /Higiene textual aprovada\./);

  // tab, espaço no fim e falta de newline final: cada um é apontado com arquivo e linha
  const suja = projetoComArquivo('\tconst a = 1;\nconst b = 2; \nconst c = 3;');
  const r = spawnSync(process.execPath, [higiene], { cwd: suja, encoding: 'utf8' });

  assert.equal(r.status, 1);
  assert.match(r.stderr, /js[\\/]a\.js:1: tab não permitido/);
  assert.match(r.stderr, /js[\\/]a\.js:2: espaço no fim da linha/);
  assert.match(r.stderr, /js[\\/]a\.js: falta newline final/);
});
