// Recarga silenciosa não redesenha por cima de uma célula em edição, e desligar a simulação
// só sai do modo simulação depois que a recarga der certo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

function montarEspera() {
    const inicio = dadosUi.indexOf('const edicaoNaTabelaEmCurso');
    const fim = dadosUi.indexOf('\n}\n', dadosUi.indexOf('function desenharQuandoLivre()')) + 3;
    const timers = [];
    const out = { contains: e => e.dentroDaTabela };
    const ctx = {
        Estado: { redesenhoPendente: false }, desenhos: 0,
        document: { activeElement: null },
        el: () => out,
        setTimeout: f => timers.push(f),
    };
    ctx.desenhar = () => { ctx.desenhos++; ctx.Estado.redesenhoPendente = false; };
    vm.runInNewContext(`${dadosUi.slice(inicio, fim)}\nthis.desenharQuandoLivre = desenharQuandoLivre;`, ctx);
    const rodarTimers = () => timers.splice(0).forEach(f => f());
    const editando = () => { ctx.document.activeElement = { matches: () => true, dentroDaTabela: true }; };
    const livre = () => { ctx.document.activeElement = null; };
    return { ctx, rodarTimers, editando, livre };
}

test('sem edição em curso, redesenha na hora', () => {
    const { ctx } = montarEspera();
    ctx.desenharQuandoLivre();
    assert.equal(ctx.desenhos, 1);
});

test('com uma célula da tabela em edição, espera e redesenha quando ela acaba', () => {
    const { ctx, rodarTimers, editando, livre } = montarEspera();
    editando();
    ctx.desenharQuandoLivre();
    assert.equal(ctx.desenhos, 0);
    rodarTimers();
    assert.equal(ctx.desenhos, 0);   // ainda editando
    livre();
    rodarTimers();
    assert.equal(ctx.desenhos, 1);
});

test('se a própria edição já redesenhou ao confirmar, não redesenha de novo', () => {
    const { ctx, rodarTimers, editando, livre } = montarEspera();
    editando();
    ctx.desenharQuandoLivre();
    ctx.desenhar();   // a edição confirmou e redesenhou com os dados novos
    livre();
    rodarTimers();
    assert.equal(ctx.desenhos, 1);
});

test('campo fora da tabela (ex.: busca no cadastro) não segura o redesenho', () => {
    const { ctx } = montarEspera();
    ctx.document.activeElement = { matches: () => true, dentroDaTabela: false };
    ctx.desenharQuandoLivre();
    assert.equal(ctx.desenhos, 1);
});

test('load e consolidação silenciosos usam a espera; o clique redesenha direto', () => {
    assert.match(dadosUi, /if \(silencioso\) desenharQuandoLivre\(\); else desenhar\(\);/);
    assert.match(formulario, /\/\/ Automática: nunca redesenha por cima de uma célula em edição[^\n]*\n\s*if \(silencioso\) desenharQuandoLivre\(\); else desenhar\(\);/);
    assert.match(fs.readFileSync('js/interactions.js', 'utf8'), /function desenhar\(\) \{\s*\n\s*Estado\.redesenhoPendente = false;/);
});

async function desligarSimulacao({ recargaOk }) {
    const inicio = formulario.indexOf("el('toggleSimulacao').onclick = async () => {");
    const fim = formulario.indexOf('\n};\n', inicio) + 4;
    const bt = { disabled: false };
    const toasts = [];
    const ctx = {
        Estado: { simulando: true }, desenhos: 0,
        el: () => bt,
        load: async opcoes => { ctx.opcoesDaCarga = opcoes; return recargaOk; },
        atualizaBotaoSimulacao() {}, desenhar() { ctx.desenhos++; },
        mostrarToast: titulo => toasts.push(titulo),
    };
    vm.runInNewContext(`${formulario.slice(inicio, fim)}`, ctx);
    await bt.onclick();
    return { ctx, toasts, bt };
}

test('desligar a simulação: com a recarga ok, sai do modo simulação', async () => {
    const { ctx, toasts, bt } = await desligarSimulacao({ recargaOk: true });
    assert.equal(ctx.Estado.simulando, false);
    assert.equal(ctx.opcoesDaCarga.silencioso, true);   // falha não troca a tela pelo erro
    assert.deepEqual(toasts, []);
    assert.equal(bt.disabled, false);
});

test('desligar a simulação: se a recarga falhar, continua simulando e avisa', async () => {
    const { ctx, toasts, bt } = await desligarSimulacao({ recargaOk: false });
    assert.equal(ctx.Estado.simulando, true);
    assert.deepEqual(toasts, ['A simulação continua']);
    assert.equal(bt.disabled, false);
});

test('regras documentadas', () => {
    assert.match(regras, /Recarga silenciosa[^\n]*nunca redesenha por cima de uma célula da tabela em edição/);
    assert.match(regras, /Desligar a simulação só sai do modo simulação depois que a recarga do banco der certo/);
});
