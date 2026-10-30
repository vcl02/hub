// Esc sai do Fin para a página inicial do hub (../) quando nada mais usou a tecla, como em todos os apps: roda o trecho real de
// js/bootstrap.js com window e document falsos (modal aberto, campo de texto, tecla já usada).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const boot = fs.readFileSync('js/bootstrap.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

function carrega(dialogoAberto = false) {
    const inicio = boot.indexOf('function sairDoApp()'), fim = boot.indexOf('});', inicio) + 3;
    const ctx = { saiu: 0, ouvinte: null, location: {}, document: { querySelector: s => s === 'dialog[open]' && dialogoAberto ? {} : null } };
    ctx.window = { addEventListener: (tipo, f) => { if (tipo == 'keydown') ctx.ouvinte = f; } };
    vm.runInNewContext(boot.slice(inicio, fim) + '\nsairDoApp = () => { saiu++; };', ctx);
    return ctx;
}
const tecla = (extra = {}) => ({ key: 'Escape', defaultPrevented: false, target: { closest: () => null, blur() { this.saiuDoCampo = true; } }, ...extra });

test('Esc sem nada aberto volta para o hub; com modal aberto, tecla já usada ou outra tecla, não', () => {
    const c = carrega();
    c.ouvinte(tecla()); assert.equal(c.saiu, 1);
    c.ouvinte(tecla({ defaultPrevented: true })); assert.equal(c.saiu, 1);     // menu, edição na célula
    c.ouvinte(tecla({ key: 'Enter' })); assert.equal(c.saiu, 1);
    const m = carrega(true);
    m.ouvinte(tecla()); assert.equal(m.saiu, 0);                               // o <dialog> fecha sozinho com Esc
    assert.match(boot, /function sairDoApp\(\) \{ location\.href = '\.\.\/'; \}/);
    assert.match(regras, /Esc/);
});

test('Esc num campo de texto só tira o foco', () => {
    const c = carrega(), t = tecla({ target: { closest: () => ({}), blur() { this.fora = true; } } });
    c.ouvinte(t);
    assert.equal(c.saiu, 0);
    assert.equal(t.target.fora, true);
});
