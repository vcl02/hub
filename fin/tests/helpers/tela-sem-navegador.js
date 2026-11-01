// Ajuda dos testes de função do Fin: carrega, sem navegador, os scripts que montam a tela sem mexer nela ao carregar
// (estado, regras, finanças, tabelas e visões do ciclo), num contexto isolado com o mínimo do navegador simulado. As
// funções de desenho rodam de verdade e devolvem o HTML, que o teste confere (regex na saída de função: permitida).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FIN = path.join(__dirname, '..', '..');
const FUNCOES_DO_FORM = ['formataMascaraDinheiro', 'valorMascaraParaNumero'];
const ARQUIVOS = ['js/app-state.js', 'js/shared.js', 'js/domain.js', 'js/finance.js', 'js/tables.js', 'js/cycle-views.js'];

// Devolve uma função `rodar(expressao)` que avalia no contexto carregado (as declarações dos scripts são de nível de
// script: só se alcançam de dentro dele) e o próprio contexto, para ajustar Estado antes.
function carregarTela() {
    const ctx = { console, Intl, Date, Math, JSON, setTimeout, clearTimeout, matchMedia: () => ({ matches: false }),
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: { querySelector: () => null }, navigator: {} };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(FIN, f), 'utf8'), ctx, { filename: f });
    // A máscara de dinheiro mora em js/form.js, que mexe na tela ao carregar: só as duas funções puras saem de lá
    const form = fs.readFileSync(path.join(FIN, 'js/form.js'), 'utf8');
    for (const nome of FUNCOES_DO_FORM) {
        const ini = form.indexOf(`function ${nome}(`), fim = form.indexOf('\n}\n', ini) + 3;
        if (ini < 0 || fim < 3) throw Error(`${nome} não encontrada em js/form.js`);
        vm.runInContext(form.slice(ini, fim), ctx, { filename: 'js/form.js' });
    }
    const rodar = expressao => JSON.parse(JSON.stringify(vm.runInContext(`(${expressao})`, ctx)) ?? 'null');
    return { rodar, ctx };
}

module.exports = { carregarTela };
