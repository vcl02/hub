// Os XMLs do Tasker ficam num repositório público (e no GitHub Pages): o token da Edge Function
// captura-nubank nunca pode estar neles. O cabeçalho usa a variável global %FINTOKEN, definida
// só no celular.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const arquivos = fs.readdirSync('tasker').filter(n => n.endsWith('.xml')).map(n => [n, fs.readFileSync(`tasker/${n}`, 'utf8')]);

test('todo cabeçalho x-fin-token usa variável do Tasker, nunca o valor', () => {
    let cabecalhos = 0;
    for (const [nome, xml] of arquivos) {
        for (const [, valor] of xml.matchAll(/x-fin-token:([^\s<]*)/g)) {
            cabecalhos++;
            assert.equal(valor, '%FINTOKEN', nome);
        }
    }
    assert.ok(cabecalhos > 0, 'nenhum cabeçalho x-fin-token encontrado');
});

test('nenhum segredo com cara de token (hex longo, chave JWT ou service_role) nos XMLs', () => {
    for (const [nome, xml] of arquivos) {
        assert.doesNotMatch(xml, /\b[0-9a-f]{32,}\b/i, nome);
        assert.doesNotMatch(xml, /eyJ[A-Za-z0-9_-]{10,}\./, nome);
        assert.doesNotMatch(xml, /service_role|sb_secret_/i, nome);
    }
});
