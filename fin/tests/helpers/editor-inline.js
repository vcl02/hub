// Helper de testes: roda o registrarEditorInline real (interactions.js) num DOM falso e
// devolve o que o editor gravou, sem navegador nem Supabase.
const fs = require('node:fs');
const vm = require('node:vm');
const { carregarFuncoes } = require('./carregar-funcoes');

const fonte = fs.readFileSync('js/interactions.js', 'utf8');
const inicio = fonte.indexOf('function registrarEditorInline(');
const fim = fonte.indexOf('\n});', fonte.indexOf("atributo: 'data-tog-canal'")) + 4;
if (inicio < 0 || fim < 4) throw Error('Não encontrou registrarEditorInline em interactions.js.');
const compartilhado = carregarFuncoes('js/shared.js', ['escapeHtml', 'normalizaCategorias', 'RECORRENCIAS']);

// Campo falso: guarda os ouvintes pra o teste disparar Enter/Esc/change/blur.
function criarCampo(tipo) {
    const ouvintes = {};
    return {
        tipo, value: '', disabled: false, ouvintes,
        addEventListener: (nome, f) => { (ouvintes[nome] ||= []).push(f); },
        disparar: (nome, ev = {}) => (ouvintes[nome] || []).forEach(f => f({ preventDefault() {}, stopImmediatePropagation() {}, ...ev })),
        focus() {}, select() {},
    };
}

async function editar(atributo, dados, texto, { evento = 'enter', simulando = false, falhar = false } = {}) {
    const lancamento = { id: 7, ...dados };
    const resultado = { gravado: null, toasts: [], controle: null, html: '', parouPropagacao: false, lancamento };
    const cliques = [];
    let campo = null;
    const classes = new Set();
    const span = {
        classList: { contains: c => classes.has(c), add: c => classes.add(c) },
        getAttribute: nome => (nome === atributo ? '7' : null),
        set innerHTML(html) { resultado.html = html; campo = criarCampo(html.startsWith('<select') ? 'select' : 'input'); },
        querySelector: () => campo,
    };
    const ctx = {
        ...compartilhado,
        Estado: { lancamentos: [lancamento], simulando },
        desenhar() {},
        mostrarToast: (titulo, msg) => resultado.toasts.push([titulo, msg]),
        atualizarLancamento: async (id, campos) => { if (falhar) throw Error('RLS'); resultado.gravado = { ...campos }; },
        el: () => ({ addEventListener: (nome, f) => cliques.push(f) }),
    };
    vm.runInNewContext(fonte.slice(inicio, fim), ctx);
    const e = { target: { closest: sel => (sel === `[${atributo}]` ? span : null) }, stopImmediatePropagation: () => { resultado.parouPropagacao = true; } };
    cliques.forEach(f => f(e));
    if (!campo) return resultado;
    resultado.controle = campo.tipo;
    campo.value = texto;
    if (evento === 'enter') campo.disparar('keydown', { key: 'Enter' });
    else if (evento === 'escape') campo.disparar('keydown', { key: 'Escape' });
    else if (evento === 'change') campo.disparar('change');
    campo.disparar('blur');   // sair do campo depois não grava de novo
    await new Promise(resolve => setImmediate(resolve));
    return resultado;
}

module.exports = { editar };
