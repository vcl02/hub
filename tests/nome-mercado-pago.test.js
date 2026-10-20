// Compra do Mercado Pago na tabela de Crédito: o nome ganha um fundo azul bem apagado com
// contorno, no lugar do selo "MP"; Nubank e débito ficam como estão.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Roda celNome do arquivo real com os globais mínimos (fatura dia 13 = Mercado Pago).
const celNome = (() => {
    const inicio = tabelas.indexOf('const celNome = r => {');
    const fim = tabelas.indexOf('\n};\n', inicio) + 4;
    const contexto = {
        CARTAO_MERCADO_PAGO: 'mp', TOLERANCIA_FINANCEIRA: 0.005,
        escapeHtml: s => String(s), textoOuTraco: s => s || '—',
        cartaoDaFatura: f => (String(f).endsWith('-13') ? 'mp' : 'nubank'),
        ehTransferenciaFatura: r => r.categ == 'Antecipação Fatura',
        nomePeriodoAbrev: () => 'Nov/26', ehLinhaReal: r => +r.id > 0, modoRestrito: () => false,
        guardadoAte: () => 100,
    };
    vm.createContext(contexto);
    vm.runInContext(`${tabelas.slice(inicio, fim)}\nglobalThis.f = celNome;`, contexto);
    return contexto.f;
})();

test('compra do Mercado Pago: fundo no nome, sem selo MP', () => {
    const html = celNome({ id: 7, nome: 'Meli+', cred: true, fatura: '2026-11-13' });
    assert.match(html, /<span class="nomeTexto togNome nomeMp" title="Mercado Pago" data-tog-nome="7">Meli\+<\/span>/);
    assert.doesNotMatch(html, />MP<|tagCartao/);
});

test('Nubank e débito sem marca; antecipação do MP mantém o MP na tag de fatura', () => {
    assert.doesNotMatch(celNome({ id: 8, nome: 'Café', cred: true, fatura: '2026-11-12' }), /nomeMp/);
    const antecipacao = celNome({ id: 9, nome: 'Antecipação', categ: 'Antecipação Fatura', cred: false, fatura: '2026-11-13' });
    assert.doesNotMatch(antecipacao, /nomeMp/);
    assert.match(antecipacao, /↳ Fat\. Nov\/26 MP/);
});

test('estilo: azul do cartão quase transparente, com contorno; REGRAS atualizado', () => {
    assert.match(estilos, /\.nomeLinha > \.nomeTexto\.nomeMp \{\s*\n\s*padding: 0 \.35rem;\s*\n\s*background: rgba\(108, 197, 238, \.07\);\s*\n\s*border: 1px solid rgba\(108, 197, 238, \.3\);/);
    assert.doesNotMatch(estilos + fs.readFileSync('css/mobile.css', 'utf8'), /tagCartao/);
    assert.match(regras, /compra do Mercado Pago tem o próprio nome num fundo azul \(o do cartão\) bem claro e apagado, com contorno suave/);
    assert.doesNotMatch(regras, /ganha a marca \*\*MP\*\*/);
});
