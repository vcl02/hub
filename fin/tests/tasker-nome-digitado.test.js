// Regressão: a confirmação final do Tasker mostra o nome digitado no diálogo Nome, não o
// estabelecimento da notificação; vazio volta pro estabelecimento, como na Edge Function.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const arquivos = ['tasker/Nubank_B.tsk.xml', 'tasker/Nubank_Click.prf.xml'];

test('mensagem de sucesso usa %nome, nunca %estab', () => {
    for (const arquivo of arquivos) {
        const xml = fs.readFileSync(arquivo, 'utf8');
        // O flash final mostra %fim, montado com o nome digitado (ver tasker-atalho.test.js).
        assert.match(xml, /<Str sr="arg0" ve="3">%fim<\/Str>/, arquivo);
        assert.match(xml, /var t = local\("nome"\) \+ " R\$ " \+ local\("valor"\);/, arquivo);
        assert.doesNotMatch(xml, /%estab R\$ %valor/, arquivo);
        assert.doesNotMatch(xml, /local\("estab"\) \+ " R\$ "/, arquivo);
    }
});

test('nome vazio ou variável não preenchida cai no estabelecimento antes do envio', () => {
    for (const arquivo of arquivos) {
        const xml = fs.readFileSync(arquivo, 'utf8');
        assert.match(xml, /if \(!nome \|\| nome\.charAt\(0\) === "%"\) nome = local\("estab"\);\s*\nsetLocal\("nome", nome\);\s*\nsetLocal\("body"/, arquivo);
    }
});
