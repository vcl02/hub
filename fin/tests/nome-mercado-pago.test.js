// Compra do Mercado Pago na tabela de Crédito: a linha inteira ganha um fundo azul bem
// apagado com contorno, no lugar do selo "MP"; Nubank e débito ficam como estão.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Roda ehCompraMercadoPago e celNome do arquivo real (fatura dia 13 = Mercado Pago).
const funcoes = (() => {
    const inicio = tabelas.indexOf('const ehCompraMercadoPago = r =>');
    const fim = tabelas.indexOf('\n};\n', tabelas.indexOf('const celNome = r => {')) + 4;
    const contexto = {
        ehDebitoAtrasado: () => false,   // atrasado tem testes próprios (atrasados.test.js)
        CARTAO_MERCADO_PAGO: 'mp', TOLERANCIA_FINANCEIRA: 0.005,
        escapeHtml: s => String(s), textoOuTraco: s => s || '—',
        cartaoDaFatura: f => (String(f).endsWith('-13') ? 'mp' : 'nubank'),
        ehTransferenciaFatura: r => r.categ == 'Antecipação Fatura',
        nomePeriodoAbrev: () => 'Nov/26', ehLinhaReal: r => +r.id > 0,
        guardadoAte: () => 100,
    };
    vm.createContext(contexto);
    vm.runInContext(`${tabelas.slice(inicio, fim)}\nglobalThis.f = { ehCompraMercadoPago, celNome };`, contexto);
    return contexto.f;
})();

test('só compra de crédito do Mercado Pago marca a linha', () => {
    assert.equal(funcoes.ehCompraMercadoPago({ cred: true, fatura: '2026-11-13' }), true);
    assert.equal(funcoes.ehCompraMercadoPago({ cred: true, fatura: '2026-11-12' }), false);
    assert.equal(funcoes.ehCompraMercadoPago({ cred: false, fatura: '2026-11-13' }), false);   // antecipação
    assert.equal(funcoes.ehCompraMercadoPago({ cred: true, fatura: null }), false);
    assert.match(tabelas, /\$\{ehCompraMercadoPago\(r\) \? 'mp ' : ''\}\$\{marcada \? 'on' : ''\}/);
});

test('sem selo MP no nome; antecipação do MP mantém o MP na tag de fatura', () => {
    const compra = funcoes.celNome({ id: 7, nome: 'Meli+', cred: true, fatura: '2026-11-13' });
    assert.doesNotMatch(compra, />MP<|tagCartao|nomeMp/);
    const antecipacao = funcoes.celNome({ id: 9, nome: 'Antecipação', categ: 'Antecipação Fatura', cred: false, fatura: '2026-11-13' });
    assert.match(antecipacao, /↳ Fat\. Nov\/26 MP/);
});

test('estilo: azul do cartão quase transparente com contorno, antes da seleção; REGRAS', () => {
    const mp = estilos.indexOf('  tbody tr.mp td {');
    assert.ok(mp > 0 && mp < estilos.indexOf('  tbody tr.on td {'));   // o verde do clique sobressai
    assert.match(estilos, /tbody tr\.mp td \{\s*\n\s*background: rgba\(108, 197, 238, \.06\);/);
    assert.match(estilos, /tbody tr\.mp \{\s*\n\s*outline: 1px solid rgba\(108, 197, 238, \.22\);\s*\n\s*outline-offset: -1px;/);
    assert.doesNotMatch(estilos + fs.readFileSync('css/mobile.css', 'utf8'), /tagCartao|nomeMp/);
    assert.match(regras, /compra do Mercado Pago tem a linha inteira num fundo azul \(o do cartão\) bem claro e apagado, com contorno suave/);
});
