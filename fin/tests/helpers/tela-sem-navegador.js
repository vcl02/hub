// Ajuda dos testes de função do Fin: carrega, sem navegador, os scripts de verdade (estado, regras, finanças, carga do
// banco, tabelas, contas dos gráficos e visões do ciclo), num contexto isolado com o mínimo da página simulado e um relógio
// fixo. Dá para chamar uma função solta (`rodar`) ou carregar dados como o app carrega (`carregarDados` com um fetch falso)
// e desenhar um ciclo inteiro (`vCiclo`), conferindo o HTML que sai (regex na saída de função: permitida).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FIN = path.join(__dirname, '..', '..');
const ARQUIVOS = ['js/app-state.js', 'js/shared.js', 'js/domain.js', 'js/finance.js', 'js/supabase-api.js', 'js/data-ui.js', 'js/tables.js', 'js/charts.js', 'js/cycle-views.js'];
// A máscara de dinheiro mora em js/form.js, que mexe na tela ao carregar: só as funções puras saem de lá
const FUNCOES_DO_FORM = ['formataMascaraDinheiro', 'valorMascaraParaNumero', 'guardarRetratoAntesDaSimulacao'];

// Elemento falso: guarda valor e aceita o que os scripts fazem com ele ao carregar (ganchos de evento, classes)
function elementoFalso(id) {
    return { id, value: '', checked: false, hidden: false, disabled: false, dataset: {}, style: {}, options: [], innerHTML: '', textContent: '',
        classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, setAttribute() {}, getAttribute() {}, addEventListener() {},
        querySelector: () => null, querySelectorAll: () => [], closest: () => null, append() {}, appendChild() {}, contains: () => false,
        open: false, showModal() { this.open = true; }, close() { this.open = false; }, filhos: [], replaceChildren(...f) { this.filhos = f; } };
}

// hoje: 'AAAA-MM-DD' (meio-dia, horário de São Paulo); dados: { fin, fin_ciclo, fin_meta } como o banco devolve
function carregarTela({ hoje = '2026-10-20', dados = {} } = {}) {
    const agora = new Date(`${hoje}T12:00:00-03:00`).getTime();
    class Relogio extends Date { constructor(...a) { super(...(a.length ? a : [agora])); } static now() { return agora; } }
    const elementos = {};
    const ctx = { console, Intl, Math, JSON, setTimeout, clearTimeout, AbortController, Date: Relogio, navigator: {}, performance: { now: () => 0 }, URL, URLSearchParams,
        location: { search: '', href: 'http://x/hub/fin/' }, history: { replaceState() {}, pushState() {} },
        matchMedia: () => ({ matches: false }), addEventListener() {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        document: { getElementById: id => elementos[id] || (elementos[id] = elementoFalso(id)), createElement: tag => elementoFalso(tag), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
        supabase: { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), refreshSession: async () => {} } }) },
        Chart: Object.assign(function () {}, { register() {} }),
        // O banco falso: GET devolve a tabela (a página seguinte da paginação, vazia)
        fetch: async url => {
            const u = new URL(url), t = u.pathname.split('/').pop();
            const corpo = /^gt\./.test(u.searchParams.get('id') || '') ? [] : dados[t] ?? [];
            return { ok: t in dados, status: t in dados ? 200 : 404, text: async () => JSON.stringify(t in dados ? corpo : { message: 'tabela?' }) };
        } };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(FIN, f), 'utf8'), ctx, { filename: f });
    const form = fs.readFileSync(path.join(FIN, 'js/form.js'), 'utf8');
    for (const nome of FUNCOES_DO_FORM) {
        const ini = form.indexOf(`function ${nome}(`), fim = form.indexOf('\n}\n', ini) + 3;
        if (ini < 0 || fim < 3) throw Error(`${nome} não encontrada em js/form.js`);
        vm.runInContext(form.slice(ini, fim), ctx, { filename: 'js/form.js' });
    }
    // As declarações dos scripts são de nível de script: só se alcançam de dentro dele
    const bruto = expressao => vm.runInContext(`(${expressao})`, ctx);
    const rodar = expressao => JSON.parse(JSON.stringify(bruto(expressao)) ?? 'null');
    // Desenha o ciclo de índice i (o mesmo que o seletor #ciclo) depois de carregar os dados; devolve o HTML e o texto
    async function desenharCiclo(i) {
        await bruto('carregarDados()');
        ctx.document.getElementById('ciclo').value = String(i);
        const html = bruto('vCiclo()');
        return { html, texto: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
    }
    // Compara os ciclos de índice de a ate (os seletores De/Até) depois de carregar os dados; somenteDif: 'N' (Todas) ou 'D'
    async function desenharComparacao(de, ate, somenteDif = 'N') {
        await bruto('carregarDados()');
        const el = ctx.document.getElementById;
        el('compDe').value = String(de); el('compAte').value = String(ate); el('somenteDif').value = somenteDif;
        const html = bruto('vComp()');
        return { html, texto: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
    }
    return { rodar, bruto, ctx, desenharCiclo, desenharComparacao };
}

module.exports = { carregarTela };
