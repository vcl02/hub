// Uma regra só pra "é investimento" e pro ciclo do lançamento: carga, cadastro, edição,
// materialização e simulação classificam igual, então nada muda ao recarregar a página.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const compartilhado = fs.readFileSync('js/shared.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

function carregar() {
    const trecho = (inicio, fim) => compartilhado.slice(compartilhado.indexOf(inicio), compartilhado.indexOf(fim, compartilhado.indexOf(inicio)) + fim.length);
    const ctx = {
        Estado: { ciclos: [0, 1, 2] },
        categoriasSeparadas: v => String(v ?? '').split(',').map(c => c.trim()).filter(Boolean),
        dataISO: v => (v ? String(v).slice(0, 10) : ''),
        periodoDaFatura: f => (f ? ({ '2026-11-12': 1 })[f] ?? -1 : null),
        periodoDoDebito: d => ({ '2026-10-09': 0, '2026-11-20': 2 })[d] ?? -1,
        ehDebitoAtrasado: () => false,   // atrasado tem testes próprios (atrasados.test.js)
        cicloDeHoje: () => 0,
    };
    vm.runInNewContext(`${trecho('const ehCategoriaInvestimento', ';\n')}
${trecho('function periodoDoLancamento(r) {', '\n}\n')}
this.inv = ehCategoriaInvestimento; this.periodo = periodoDoLancamento;`, ctx);
    return ctx;
}

test('é investimento quando QUALQUER categoria da lista é exatamente Investimento', () => {
    const { inv } = carregar();
    assert.equal(inv('Investimento'), true);
    assert.equal(inv('Investimento, Reserva'), true);   // antes, cadastro/edição diziam false
    assert.equal(inv(' investimento '), true);
    assert.equal(inv('Investimentos'), false);
    assert.equal(inv(null), false);
});

test('ciclo: Crédito pela fatura (mesmo sem data), Débito pela data, sem nada = Backlog', () => {
    const { periodo } = carregar();
    assert.equal(periodo({ cred: true, data: null, fatura: '2026-11-12' }), 1);   // antes, o cadastro mandava pro Backlog
    assert.equal(periodo({ cred: false, data: '2026-10-09', fatura: '2026-11-12' }), 0);   // antecipação: pela data
    assert.equal(periodo({ cred: false, data: null, fatura: null }), null);
    assert.equal(periodo({ cred: false, data: '2026-01-01' }), null);   // fora dos ciclos
});

test('ninguém mais tem cópia própria das regras', () => {
    for (const arquivo of ['js/form.js', 'js/supabase-api.js', 'js/interactions.js']) {
        const fonte = fs.readFileSync(arquivo, 'utf8');
        assert.doesNotMatch(fonte, /\/\^investimento\$\/i/, arquivo);
        assert.doesNotMatch(fonte, /periodoIdx != null && periodoIdx >= 0/, arquivo);
    }
    assert.match(fs.readFileSync('js/supabase-api.js', 'utf8'), /inv: ehCategoriaInvestimento\(categ\),\s*\n\s*periodoIdx: periodoDoLancamento\(r\),/);
    assert.match(fs.readFileSync('js/interactions.js', 'utf8'), /function reclassificaPeriodo\(r\) \{\s*\n\s*r\.periodoIdx = periodoDoLancamento\(r\);/);
    assert.match(regras, /"é investimento" e o ciclo de um lançamento seguem uma regra só/);
});
