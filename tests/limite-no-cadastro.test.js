// Compra nova no Crédito: o cadastro mostra o Livre Hoje do cartão antes → depois dela,
// com a mesma regra do título (limiteLivreHojeDoCartao, regra única em finance.js).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const financas = fs.readFileSync('js/finance.js', 'utf8');
const pagina = fs.readFileSync('index.html', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const trecho = (fonte, assinatura) => {
    const inicio = fonte.indexOf(assinatura);
    return fonte.slice(inicio, fonte.indexOf('\n}\n', inicio) + 3);
};

// Roda conferirLimiteNoCadastro com um formulário falso e Livre Hoje fixo por cartão.
function conferir({ valor = 'R$ 1.000,00', cred = true, positivo = false, fatura = '2026-11-12', freq = '', vezes = '1',
    dividir = true, editando = false, livre = { nubank: 2000, mp: 500 } } = {}) {
    const aviso = { hidden: true, className: '', title: '', innerHTML: '' };
    const campos = {
        fLimiteCartao: aviso, fValor: { value: valor }, fFreq: { value: freq }, fParcelas: { value: vezes },
        fCred: { checked: cred }, fDivide: { checked: dividir }, modalNovo: { dataset: editando ? { editandoId: '9' } : {} },
    };
    const chamadas = [];
    const ctx = {
        el: id => campos[id], sinalPositivo: positivo, TOLERANCIA_FINANCEIRA: 0.005,
        Estado: { idxHoje: 3, lancamentos: [] }, NOME_CARTAO: { nubank: 'Nubank', mp: 'Mercado Pago' },
        idsFaturasDoFormulario: () => [fatura],
        cartaoDaFatura: f => (String(f).endsWith('-13') ? 'mp' : 'nubank'),
        limiteLivreHojeDoCartao: (linhas, idx, cartao) => { chamadas.push([idx, cartao]); return livre[cartao]; },
        brl: v => `R$ ${v.toFixed(2)}`, corValor: v => (v < 0 ? 'vm' : v > 0 ? 'vd' : ''),
    };
    vm.runInNewContext([trecho(formulario, 'function valorMascaraParaNumero(textoMascarado) {'),
        trecho(formulario, 'function conferirLimiteNoCadastro() {'), 'conferirLimiteNoCadastro();'].join('\n'), ctx);
    return { aviso, chamadas };
}

test('mostra o Livre Hoje do cartão da 1ª fatura antes → depois, no ciclo atual', () => {
    const { aviso, chamadas } = conferir();
    assert.equal(aviso.hidden, false);
    assert.deepEqual(JSON.parse(JSON.stringify(chamadas)), [[3, 'nubank']]);
    assert.equal(aviso.innerHTML, 'Livre Nubank R$ 2000.00 → <b class="vd">R$ 1000.00</b>');
    assert.doesNotMatch(aviso.className, /semLimite/);
});

test('o banco bloqueia o total: dividido é o valor; sem dividir, valor × Vezes; com Frequência, uma ocorrência', () => {
    assert.match(conferir({ vezes: '10', dividir: true }).aviso.innerHTML, /→ <b class="vd">R\$ 1000\.00<\/b>/);
    const repetido = conferir({ vezes: '3', dividir: false, valor: 'R$ 500,00' }).aviso;   // 1.500 de 2.000
    assert.match(repetido.innerHTML, /→ <b class="vd">R\$ 500\.00<\/b>/);
    assert.match(conferir({ freq: 'Mensal', vezes: '1', dividir: false, valor: 'R$ 500,00' }).aviso.innerHTML, /→ <b class="vd">R\$ 1500\.00<\/b>/);
});

test('sem limite: vermelho e "sem limite"; cartão pelo dia da fatura (13 = Mercado Pago)', () => {
    const { aviso } = conferir({ fatura: '2026-11-13' });
    assert.match(aviso.className, /semLimite/);
    assert.equal(aviso.innerHTML, 'Livre Mercado Pago R$ 500.00 → <b class="vm">R$ -500.00</b> · sem limite');
});

test('escondido fora de compra nova no Crédito', () => {
    assert.equal(conferir({ cred: false }).aviso.hidden, true);
    assert.equal(conferir({ positivo: true }).aviso.hidden, true);
    assert.equal(conferir({ valor: '' }).aviso.hidden, true);
    assert.equal(conferir({ fatura: null }).aviso.hidden, true);
    assert.equal(conferir({ editando: true }).aviso.hidden, true);
});

test('regra única do Livre Hoje, gatilhos e documentação', () => {
    assert.match(trecho(financas, 'function limiteLivreHojeDoCartao(linhas, idx, cartao) {'),
        /return limiteCartaoLivre\(linhas, abatimentoDoCartao\(abatidoPago, cartao\), garantido, -Infinity, cartao, aprovadoDoCiclo\(idx, cartao\)\);/);
    assert.match(pagina, /<small id=fLimiteCartao class=limiteNoCadastro hidden><\/small>/);
    assert.match(trecho(formulario, 'function atualizaSinalUI() {'), /conferirLimiteNoCadastro\(\);/);
    assert.match(trecho(formulario, 'function sugereModoValorParcelas() {'), /conferirLimiteNoCadastro\(\);/);
    assert.match(formulario, /el\('formNovo'\)\.addEventListener\('change', \(\) => conferirLimiteNoCadastro\(\)\);/);
    assert.match(regras, /\*\*Limite na hora da compra:\*\* num cadastro novo no Crédito/);
});
