// Modal de um cartão (botões Nubank/Mercado Pago do cabeçalho): roda o htmlModalCartao real
// de js/cycle-views.js sobre os dados que vCiclo guarda em Estado.cartoesDoCiclo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const pagina = fs.readFileSync('index.html', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

function carrega() {
    const inicio = visoes.indexOf('function htmlModalCartao(');
    const contexto = {
        TOLERANCIA_FINANCEIRA: 0.005,
        brl: v => `R$ ${Number(v).toFixed(2).replace('.', ',')}`,
        dataBR: s => String(s).slice(0, 10).split('-').reverse().join('/'),
        timestamp: s => Date.parse(String(s || '').slice(0, 10)) || 0,
        escapeHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        corSoma: v => v < 0 ? 'vm' : 'vd',
        corValor: v => v < 0 ? 'vm' : v > 0 ? 'vd' : '',
    };
    vm.createContext(contexto);
    vm.runInContext(`${visoes.slice(inicio)}\nglobalThis.f = htmlModalCartao;`, contexto);
    return contexto.f;
}

const dados = {
    temHoje: true,
    cartoes: {
        mp: {
            cartao: 'mp', nome: 'Mercado Pago', vencimento: '2026-11-13', teto: 1100, aprovado: 1100, garantido: null,
            campoAprovado: '<input data-limite-cartao="mp">', campoGarantia: '',
            hoje: { fatura: -54.48, usado: 54.48, livre: 1045.52, antecipado: 0 },
            futuro: { fatura: -1200, usado: 1200, livre: -100, antecipado: 30 },
            compras: [
                { id: 1, data: '2026-10-14', nome: 'Meli+', v: -9.9, pago: true },
                { id: 2, data: '2026-10-19', nome: 'Livro <b>', v: -44.58, pago: false },
                { id: -6, data: '2026-11-04', nome: 'Besteira prevista', v: -10, pago: false, _prev: 1 },
            ],
        },
    },
};

test('desenho do cartão com a fatura de Hoje e o vencimento; Hoje e Futuro com Fatura/Usado/Livre', () => {
    const html = carrega()(dados, 'mp');
    assert.match(html, /<div class="cartaoArte cartao-mp">/);
    assert.match(html, /<small>Fatura hoje<\/small><b>R\$ 54,48<\/b>/);
    assert.match(html, /<small>Vence<\/small><b>13\/11<\/b>/);
    assert.match(html, /<span class=cartaoLinhaRotulo>Hoje<\/span>.*<small>Fatura<\/small><b class="vm">R\$ 54,48<\/b>.*<small>Usado<\/small><b>R\$ 54,48<\/b>.*<small>Livre<\/small><b class="vd">R\$ 1045,52<\/b>/s);
    assert.match(html, /<span class=cartaoLinhaRotulo>Futuro<\/span>/);
});

test('barra de uso: proporção do teto, cheia e vermelha acima do teto; antecipado só quando houver', () => {
    const html = carrega()(dados, 'mp');
    assert.match(html, /<span class="cartaoUso" title="5% do teto"><span style="width:5\.0%">/);
    assert.match(html, /<span class="cartaoUso acima" title="100% do teto"><span style="width:100\.0%">/);
    assert.equal((html.match(/Já antecipado/g) || []).length, 1);
    assert.match(html, /Já antecipado R\$ 30,00/);
});

test('limite com Aprovado editável e sem Garantido no Mercado Pago', () => {
    const html = carrega()(dados, 'mp');
    assert.match(html, /Teto <b>R\$ 1100,00<\/b>/);
    assert.match(html, /Aprovado R\$ <input data-limite-cartao="mp">/);
    assert.doesNotMatch(html, /Garantido/);
});

test('compras da fatura: mais recente primeiro, aberta e prevista marcadas, nome escapado', () => {
    const html = carrega()(dados, 'mp');
    assert.match(html, /<summary>Compras da fatura <span>3<\/span><\/summary>/);
    const ordem = [...html.matchAll(/<span class=cartaoCompraNome>([^<]*)/g)].map(m => m[1].trim());
    assert.deepEqual(ordem, ['Besteira prevista', 'Livro &lt;b&gt;', 'Meli+']);
    assert.match(html, /<li class=prevista><span class=cartaoCompraData>04\/11<\/span><span class=cartaoCompraNome>Besteira prevista<\/span>/);
    assert.match(html, /Livro &lt;b&gt; <small>aberto<\/small>/);
});

test('ciclo futuro (sem Hoje): o cartão destaca a fatura e só há a linha Futuro', () => {
    const html = carrega()({ ...dados, temHoje: false }, 'mp');
    assert.match(html, /<small>Fatura<\/small><b>R\$ 1200,00<\/b>/);
    assert.doesNotMatch(html, /cartaoLinhaRotulo>Hoje/);
});

test('sem dados do cartão no ciclo exibido, o modal avisa em vez de quebrar', () => {
    assert.match(carrega()(null, 'nubank'), /Sem compras deste cartão no ciclo exibido/);
});

test('botões no cabeçalho, desativados sem dados, escondidos na conta restrita; modal refeito a cada desenho', () => {
    assert.match(pagina, /<button type=button id=btNubank class="btIcone btCartao cartao-nubank" data-cartao=nubank title="Nubank"\s*\n\s*aria-label="Cartão Nubank" disabled>/);
    assert.match(pagina, /<button type=button id=btMercadoPago class="btIcone btCartao cartao-mp" data-cartao=mp title="Mercado Pago"\s*\n\s*aria-label="Cartão Mercado Pago" disabled>/);
    assert.match(pagina, /<dialog id=modalCartao>/);
    assert.match(interacoes, /el\(id\)\.hidden = restrito;\s*\n\s*el\(id\)\.disabled = restrito \|\| !Estado\.cartoesDoCiclo\?\.cartoes\?\.\[cartao\];/);
    assert.match(interacoes, /if \(el\('modalCartao'\)\.open\) preencherModalCartao\(\);/);
    assert.match(interacoes, /Estado\.cartoesDoCiclo = null;/);
    assert.match(interacoes, /alinharResumosDosTitulos\(\);\s*\n\s*atualizarCartoes\(\);/);
    // Aprovado/Garantido gravam pelos mesmos handlers no modal (fora do #out).
    assert.match(interacoes, /ligarCamposDeLimite\(el\('out'\)\);\s*\n\s*ligarCamposDeLimite\(el\('modalCartao'\)\);/);
    assert.match(visoes, /Estado\.cartoesDoCiclo = cicloDebitoPassado \|\| modoRestrito\(\) \? null :/);
});

test('Hoje/Futuro com o rótulo em cima e as três colunas na largura toda; cabeçalho quebra no celular', () => {
    const formularios = fs.readFileSync('css/forms.css', 'utf8');
    assert.match(formularios, /\.cartaoLinha \{\s*\n\s*display: grid;\s*\n\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    assert.match(formularios, /\.cartaoLinhaRotulo \{\s*\n\s*grid-column: 1 \/ -1;/);
    assert.match(fs.readFileSync('css/mobile.css', 'utf8'), /\.acoesCabecalho \{\s*\n\s*flex-wrap: wrap;/);
    assert.match(regras, /Só no celular, quando o bloco não cabe nem sozinho na largura da tela, ele quebra entre os botões/);
});

test('REGRAS.md documenta o modal do cartão', () => {
    assert.match(regras, /\*\*Modal do cartão:\*\* dois botões no cabeçalho, junto dos demais ícones — \*\*Nubank\*\* \(cartão roxo\) e \*\*Mercado Pago\*\* \(cartão azul\)/);
    assert.match(regras, /Os botões ficam desativados em Comparar, no Backlog, num ciclo passado e quando o cartão não tem compra no ciclo; a conta restrita não os vê\./);
});
