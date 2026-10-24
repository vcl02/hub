// Depois de salvar no cadastro, fechar o modal roda o Consolidar tudo em silêncio (quando a tela fica livre).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const form = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Roda o trecho real (flag + espera + listener de close) com DOM e relógio falsos.
function cenario({ simulando = false, ocupadoPor = 0 } = {}) {
    const inicio = form.indexOf('let consolidarAoFecharCadastro');
    const fim = form.indexOf('});', form.indexOf("modalNovo.addEventListener('close'", inicio)) + 3;
    const ctx = {
        chamadas: [], timers: [], ouvintes: {}, ocupado: ocupadoPor,
        Estado: { simulando, gravandoAjuste: false },
        document: { querySelector: () => (ctx.ocupado-- > 0 ? {} : null) },
        el: id => ({ id, disabled: false }),
        setTimeout: f => ctx.timers.push(f),
        consolidarTudo: (bt, depois, op) => ctx.chamadas.push([bt.id, op]),
        modalNovo: { addEventListener: (ev, f) => { ctx.ouvintes[ev] = f; } },
    };
    vm.runInNewContext(form.slice(inicio, fim) + '\nthis.marcar = () => { consolidarAoFecharCadastro = true; };', ctx);
    return ctx;
}

test('fechar o cadastro depois de salvar consolida em silêncio; sem salvar, não', () => {
    const c = cenario();
    c.ouvintes.close(); assert.equal(c.chamadas.length, 0);                  // fechou sem salvar
    c.marcar(); c.ouvintes.close();
    assert.equal(JSON.stringify(c.chamadas), JSON.stringify([['recarregar', { silencioso: true }]]));   // objetos de outro contexto (vm)
    c.ouvintes.close(); assert.equal(c.chamadas.length, 1);                  // uma vez por salvamento
});

test('espera a tela ficar livre e nunca roda na simulação', () => {
    const c = cenario({ ocupadoPor: 2 });
    c.marcar(); c.ouvintes.close();
    assert.equal(c.chamadas.length, 0);
    while (c.timers.length) c.timers.shift()();
    assert.equal(c.chamadas.length, 1);
    const s = cenario({ simulando: true });
    s.marcar(); s.ouvintes.close(); assert.equal(s.chamadas.length, 0);
});

test('o salvamento real liga a consolidação e a regra está documentada', () => {
    assert.match(form, /if \(!Estado\.simulando\) consolidarAoFecharCadastro = true;/);
    assert.match(regras, /\*\*Consolidar depois do cadastro:\*\*/);
});
