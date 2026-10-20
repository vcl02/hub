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
        TOLERANCIA_FINANCEIRA: 0.005, CARTAO_NUBANK: 'nubank',
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
        },
    },
};

test('desenho do cartão com a fatura de Hoje e o vencimento; Hoje e Futuro com Fatura/Usado/Livre', () => {
    const html = carrega()(dados, 'mp');
    assert.match(html, /<div class="cartaoArte cartao-mp" title="Arraste para os lados para trocar de fatura"><span class=cartaoMarcaDagua aria-hidden=true><span>MER<\/span><span>CADO<\/span><span>PAGO<\/span><\/span><span class=cartaoVisa aria-hidden=true>VISA<\/span>/);
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

test('modal limpo: sem lista de compras e sem botão de fechar', () => {
    const html = carrega()(dados, 'mp');
    assert.doesNotMatch(html, /cartaoCompras|Compras da fatura|<summary>/);
    assert.doesNotMatch(pagina, /id=fechaCartao/);
    // Sem o ×, o 1º foco seria o campo Aprovado (teclado no celular, Esc só desfaria o campo).
    assert.match(pagina, /<dialog id=modalCartao tabindex=-1>/);
    assert.match(interacoes, /el\('modalCartao'\)\.showModal\(\);\s*\n(\s*\/\/.*\n)*\s*el\('modalCartao'\)\.focus\(\);/);
    assert.doesNotMatch(interacoes, /fechaCartao/);
    assert.doesNotMatch(fs.readFileSync('css/forms.css', 'utf8'), /fechaCartao|cartaoCompras|#modalCartao \.modalHead/);
    // Continua fechando com Esc (nativo do <dialog>) e com o clique fora do cartão.
    assert.match(interacoes, /if \(e\.target == el\('modalCartao'\) && Date\.now\(\) - ultimoArrasteCartao > 300\) el\('modalCartao'\)\.close\(\);/);
    assert.match(regras, /sem botão de fechar: o cartão começa no topo do modal, que fecha com Esc ou tocando fora dele/);
    assert.match(regras, /a lista de compras não entra no modal, elas ficam só na tabela Crédito/);
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
    assert.match(pagina, /<dialog id=modalCartao tabindex=-1>/);
    // Sem título visível: o nome do cartão fica só pra leitor de tela.
    assert.match(pagina, /<h2 id=tituloCartao class=srOnly>Cartão<\/h2>/);
    assert.match(interacoes, /el\(id\)\.hidden = restrito;\s*\n\s*el\(id\)\.disabled = restrito \|\| !Estado\.cartoesDoCiclo\?\.cartoes\?\.\[cartao\];/);
    assert.match(interacoes, /if \(el\('modalCartao'\)\.open\) preencherModalCartao\(\);/);
    assert.match(interacoes, /Estado\.cartoesDoCiclo = null;/);
    assert.match(interacoes, /alinharResumosDosTitulos\(\);\s*\n\s*atualizarCartoes\(\);/);
    // Aprovado/Garantido gravam pelos mesmos handlers no modal (fora do #out).
    assert.match(interacoes, /ligarCamposDeLimite\(el\('out'\)\);\s*\n\s*ligarCamposDeLimite\(el\('modalCartao'\)\);/);
    assert.match(visoes, /Estado\.cartoesDoCiclo = modoRestrito\(\) \? null :/);
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
    assert.match(regras, /Os botões ficam desativados em Comparar, no Backlog e quando o cartão não existe no título; a conta restrita não os vê\./);
});

test('cartão Nubank no estilo do de verdade: círculos da bandeira e o "nu"; o MP não tem', () => {
    const f = (() => {
        const visoesFonte = fs.readFileSync('js/cycle-views.js', 'utf8');
        const contexto = {
            TOLERANCIA_FINANCEIRA: 0.005, CARTAO_NUBANK: 'nubank',
            brl: v => `R$ ${Number(v).toFixed(2)}`, dataBR: s => String(s).slice(0, 10).split('-').reverse().join('/'),
            timestamp: () => 0, escapeHtml: s => String(s), corSoma: () => '', corValor: () => '',
        };
        vm.createContext(contexto);
        vm.runInContext(`${visoesFonte.slice(visoesFonte.indexOf('function htmlModalCartao('))}\nglobalThis.f = htmlModalCartao;`, contexto);
        return contexto.f;
    })();
    const base = { teto: 100, campoAprovado: '', campoGarantia: '', vencimento: '2026-11-12',
        hoje: { fatura: -1, usado: 1, livre: 99, antecipado: 0 }, futuro: { fatura: -1, usado: 1, livre: 99, antecipado: 0 } };
    const nubank = f({ temHoje: true, cartoes: { nubank: { ...base, nome: 'Nubank' } } }, 'nubank');
    assert.match(nubank, /<svg class=cartaoBandeira /);
    assert.match(nubank, /<svg class=cartaoLogoNu /);
    // n e u com a mesma altura (5,5 a 23) e traço grosso.
    assert.match(nubank, /stroke-width=4\.2 [^>]*><path d="M4 23V12\.5a7 7 0 0 1 14 0V23M26 5\.5V16a7 7 0 0 0 14 0V5\.5"\/>/);
    assert.doesNotMatch(nubank, /cartaoVisa|cartaoMarcaDagua/);
    const mp = f({ temHoje: true, cartoes: { mp: { ...base, nome: 'Mercado Pago' } } }, 'mp');
    assert.doesNotMatch(mp, /cartaoBandeira|cartaoLogoNu/);
    assert.match(regras, /Nubank roxo com os círculos da bandeira e o "nu" em traço grosso, n e u da mesma altura; Mercado Pago grafite com "MER CADO PAGO" apagado na vertical e "VISA" em pé/);
});

test('ciclo passado: fatura fechada com compras brutas, pago/antecipado e o que restou, sem barra de uso', () => {
    const c = { ...dados.cartoes.mp, bruto: -54.48, futuro: { fatura: 0, usado: 0, livre: 1100, antecipado: 54.48 } };
    const html = carrega()({ temHoje: false, passado: true, cartoes: { mp: c } }, 'mp');
    assert.match(html, /<small>Fatura fechada<\/small><b>R\$ 54,48<\/b>/);
    assert.match(html, /<span class=cartaoLinhaRotulo>Fechada<\/span><span class=cartaoValor><small>Compras<\/small><b class="vm">R\$ 54,48<\/b><\/span><span class=cartaoValor><small>Pago\/antecipado<\/small><b>R\$ 54,48<\/b><\/span><span class=cartaoValor><small>Restou<\/small><b class="vd">R\$ 0,00<\/b>/);
    assert.doesNotMatch(html, /cartaoUso|cartaoLinhaRotulo>Hoje|cartaoLinhaRotulo>Futuro/);
});

// Roda deslizarFatura real com o combo De/Até simulado: a navegação é a de navegaCiclo.
function carregaDeslize(valores, atual) {
    const inicio = interacoes.indexOf('function animarCartao(');
    const fim = interacoes.indexOf('let arrasteCartao = null;');
    const chamadas = [], animacoes = [];
    const compDe = { value: atual, options: valores.map(value => ({ value })) };
    const contexto = {
        el: id => id === 'compDe' ? compDe : { querySelector: () => ({ classList: { add: c => animacoes.push(c), remove() {} }, addEventListener() {} }) },
        navegaCiclo: d => chamadas.push(d),
    };
    vm.createContext(contexto);
    vm.runInContext(`${interacoes.slice(inicio, fim)}\nglobalThis.f = deslizarFatura;`, contexto);
    return { deslizar: contexto.f, chamadas, animacoes };
}

test('deslizar anda um ciclo pelo navegaCiclo, nunca para o Backlog nem além do fim', () => {
    const meio = carregaDeslize(['', '-1', '0', '1', '2'], '1');
    meio.deslizar(1); meio.deslizar(-1);
    assert.deepEqual(meio.chamadas, [1, -1]);
    assert.deepEqual(meio.animacoes, ['cartaoVemDaDireita', 'cartaoVemDaEsquerda']);
    const primeiro = carregaDeslize(['', '-1', '0', '1'], '0');
    primeiro.deslizar(-1);   // antes do 1º ciclo só há o Backlog: não navega
    assert.deepEqual(primeiro.chamadas, []);
    assert.deepEqual(primeiro.animacoes, ['cartaoNoLimite']);
    const ultimo = carregaDeslize(['', '-1', '0', '1'], '1');
    ultimo.deslizar(1);
    assert.deepEqual(ultimo.chamadas, []);
});

test('gestos: arrasto (toque/mouse), trackpad e setas; arrasto não fecha o modal', () => {
    assert.match(interacoes, /const DISTANCIA_MINIMA_DESLIZE = 50;/);
    assert.match(interacoes, /Math\.abs\(dx\) >= DISTANCIA_MINIMA_DESLIZE && Math\.abs\(dx\) > Math\.abs\(dy\) \* 1\.5/);
    assert.match(interacoes, /deslizarFatura\(dx < 0 \? 1 : -1\);/);
    assert.match(interacoes, /if \(e\.pointerType == 'mouse' && !e\.target\.closest\('\.cartaoArte'\)\) return;/);
    assert.match(interacoes, /addEventListener\('wheel', e => \{[\s\S]*?deslizarFatura\(rolagemHorizontal > 0 \? 1 : -1\);[\s\S]*?\}, \{ passive: false \}\);/);
    assert.match(interacoes, /e\.key == 'ArrowRight' \|\| e\.key == 'ArrowLeft'/);
    assert.match(interacoes, /Date\.now\(\) - ultimoArrasteCartao > 300\) el\('modalCartao'\)\.close\(\);/);
    const formularios = fs.readFileSync('css/forms.css', 'utf8');
    assert.match(formularios, /#modalCartao \{\s*\n\s*touch-action: pan-y;/);
    assert.match(formularios, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(regras, /\*\*Deslizar troca de fatura:\*\* puxar o modal para a esquerda vai para a fatura seguinte/);
});

test('vencimento sem compra na fatura: o dia do cartão dentro do ciclo, nunca o fechamento do ciclo', () => {
    const inicio = visoes.indexOf('function vencimentoDoCartaoNoCiclo(');
    const fim = visoes.indexOf('\n}\n', inicio) + 3;
    const contexto = {
        Estado: { ciclos: [{ ini: '2026-10-05' }, { ini: '2026-11-20' }] },
        DIA_VENCIMENTO_CARTAO: { nubank: 12, mp: 13 },
        faturasDoCiclo: () => [], vencimentoDoCiclo: () => 'cadastrada',
        dataISO: s => String(s || '').slice(0, 10),
        somaMeses: (iso, n) => { const [a, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(a, m - 1 + n, d)); return t.toISOString().slice(0, 10); },
    };
    vm.createContext(contexto);
    vm.runInContext(`${visoes.slice(inicio, fim)}\nglobalThis.f = vencimentoDoCartaoNoCiclo;`, contexto);
    assert.equal(contexto.f(0, 'nubank'), '2026-10-12');
    assert.equal(contexto.f(0, 'mp'), '2026-10-13');
    assert.equal(contexto.f(1, 'nubank'), '2026-12-12');   // ciclo começa depois do dia 12
    assert.equal(contexto.f(5, 'nubank'), '');            // ciclo inexistente
    contexto.faturasDoCiclo = () => [{}];
    assert.equal(contexto.f(0, 'nubank'), 'cadastrada');
});

test('modal largo o bastante pra Teto, Aprovado e Garantido numa linha no desktop', () => {
    assert.match(fs.readFileSync('css/forms.css', 'utf8'), /dialog#modalCartao \{[\s\S]*?width: min\(34rem, 92vw\);/);
    assert.match(regras, /numa linha só no desktop \(o modal tem até 34rem de largura; no celular, 92% da tela, e a linha pode quebrar\)/);
});
