// Link de volta ao hub no cabeçalho: último ícone, apontando pra página inicial (../); sem Sair no fin.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('ícone Hub é o último do cabeçalho e leva à página inicial do hub; não há Sair', () => {
    const acoes = pagina.slice(pagina.indexOf('<div class=acoesCabecalho>'));
    assert.match(acoes, /<a id=voltarHub class=btIcone href="\.\.\/" title="Hub" aria-label="Hub">[\s\S]*?<\/a>\s*<\/div>/);
    assert.doesNotMatch(pagina, /id=sair\b/);
    assert.match(regras, /O ícone do hub \(\*\*Hub\*\*, a marca do hub em traço\), o último do cabeçalho, volta à página inicial do hub/);
});

test('sem sessão dentro do hub, vai pro login do hub levando o ?ciclo; fora do hub, login próprio', () => {
    const vm = require('node:vm');
    const boot = fs.readFileSync('js/bootstrap.js', 'utf8');
    const inicio = boot.indexOf('function irParaLoginDoHub() {');
    const codigo = boot.slice(inicio, boot.indexOf('\n}\n', inicio) + 3);
    const roda = (pathname, search = '', hash = '') => {
        const ctx = { window: { location: { pathname, search, hash, replace(u) { ctx.destino = u; } } } };
        vm.runInNewContext(`${codigo}\nthis.foi = irParaLoginDoHub();`, ctx);
        return ctx;
    };
    const noHub = roda('/hub/fin/', '?ciclo=2026-10');
    assert.equal(noHub.foi, true);
    assert.equal(noHub.destino, '../?volta=fin%2F%3Fciclo%3D2026-10');
    assert.equal(roda('/hub/fin/index.html').foi, true);
    const fora = roda('/');
    assert.equal(fora.foi, false);
    assert.equal(fora.destino, undefined);
    assert.match(boot, /\} else if \(!irParaLoginDoHub\(\)\) \{\s*\n\s*mostraTela\(0\);/);
    assert.match(regras, /sem sessão, o fin vai direto para `\.\.\/\?volta=fin\/…`/);
});
