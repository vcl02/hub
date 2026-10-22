// Contrato de edição: EditorConfig e validação nativa preservam um estilo leve e previsível.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const editorconfig = fs.readFileSync('.editorconfig', 'utf8');
const checagem = fs.readFileSync('scripts/check.mjs', 'utf8');
const higiene = fs.readFileSync('scripts/check-style.mjs', 'utf8');

test('define espaços, UTF-8, newline final e regras próprias para CSS/HTML/SQL/Markdown', () => {
    assert.match(editorconfig, /charset = utf-8/);
    assert.match(editorconfig, /end_of_line = lf/);
    assert.match(editorconfig, /insert_final_newline = true/);
    assert.match(editorconfig, /trim_trailing_whitespace = true/);
    assert.match(editorconfig, /indent_style = space/);
    assert.match(editorconfig, /\[\*\.\{css,html,sql,md\}\]/);
});

test('comando único executa a higiene textual sem formatter externo', () => {
    assert.match(checagem, /scripts\/check-style\.mjs/);
    assert.match(higiene, /tab não permitido/);
    assert.match(higiene, /espaço no fim da linha/);
    assert.match(higiene, /falta newline final/);
});
