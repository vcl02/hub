// Regressão da comparação: Reserva é marca da meta e não cria categoria financeira na matriz.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/cycle-views.js', 'utf8');
const regrasDocumentadas = fs.readFileSync('docs/REGRAS.md', 'utf8');
const inicio = fonte.indexOf('function categoriaDaComparacao(');
const fim = fonte.indexOf('function vComp()', inicio);
const codigo = fonte.slice(inicio, fim);

function regrasDaComparacao() {
    const normalizar = valor => String(valor ?? '').trim().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const contexto = {
        ehDebitoAtrasado: () => false,   // atrasado tem testes próprios (atrasados.test.js)
        categoriasSeparadas: valor => String(valor ?? '').split(',').map(c => c.trim()).filter(Boolean),
        ehCategoria: (valor, procurada) => normalizar(valor) === normalizar(procurada),
        ehAntecipacaoFatura: valor => {
            const texto = normalizar(valor);
            return texto.includes('antecipacao') && texto.includes('fatura');
        },
        ehTransferenciaFatura: r => !r.cred && [r.categ, r.nome].some(v => {
            const texto = normalizar(v);
            return texto.includes('antecipacao') && texto.includes('fatura');
        }),
        semAcento: normalizar,
        ehLinhaReal: linha => Number.isInteger(+linha.id) && +linha.id > 0 && !linha._sid && !linha._sim,
        dataISO: valor => String(valor || '').slice(0, 10),
        textoOuTraco: valor => String(valor || '-'),
    };
    vm.runInNewContext(`${codigo}; this.regras = { categoriaDaComparacao, ehLinhaExcluidaDaComparacao, filtrarLinhasDaComparacao, temRecorrenciaDuplicadaEntreMeses, todasRecorrenciasDaMudancaSaoExplicadas, estadoDaComparacaoPorCiclos };`, contexto);
    return contexto.regras;
}

test('categoriaDaComparacao é um passthrough: Reserva já não existe em categ (bit próprio, migration 22)', () => {
    const regras = regrasDaComparacao();
    assert.equal(regras.categoriaDaComparacao('Casa'), 'Casa');
    assert.equal(regras.categoriaDaComparacao('Casa, Saúde'), 'Casa, Saúde');
    assert.equal(regras.categoriaDaComparacao(''), '-');
    assert.equal(regras.categoriaDaComparacao(null), '-');
});

test('linha só-Reserva (bit, sem nenhuma outra categoria) sai da comparação; coexistindo com outra, entra normalmente', () => {
    const { ehLinhaExcluidaDaComparacao } = regrasDaComparacao();
    assert.equal(ehLinhaExcluidaDaComparacao({ categ: '', reserva: true, nome: 'Evolução Obra' }), true);
    assert.equal(ehLinhaExcluidaDaComparacao({ categ: 'Casa', reserva: true, nome: 'Condomínio' }), false);
    assert.equal(ehLinhaExcluidaDaComparacao({ categ: 'Casa', reserva: false, nome: 'Mercado' }), false);
});

test('confirma acabou, começou e único somente com dois ciclos futuros', () => {
    const { estadoDaComparacaoPorCiclos } = regrasDaComparacao();
    const estado = (...args) => JSON.parse(JSON.stringify(estadoDaComparacaoPorCiclos(...args)));
    assert.deepEqual(
        estado(new Set([0, 1]), 1, 2, 5),
        { acabou: true, comecou: false, unico: false },
    );
    assert.deepEqual(
        estado(new Set([1, 2, 3]), 0, 1, 4),
        { acabou: false, comecou: true, unico: false },
    );
    assert.deepEqual(
        estado(new Set([1]), 0, 1, 4),
        { acabou: false, comecou: false, unico: true },
    );
    assert.deepEqual(
        estado(new Set([0]), 0, 1, 3),
        { acabou: false, comecou: false, unico: false },
    );
    assert.deepEqual(
        estado(new Set([1]), 1, 2, 5),
        { acabou: false, comecou: false, unico: false },
    );
});

test('comparar exclui transferências e não cria abatimento de fatura', () => {
    assert.match(fonte, /filtrarLinhasDaComparacao\(reais, sinteticas\)/);
    assert.match(fonte, /mudancaInteiramenteExplicadaPorDuplicidade\(chave, estado\)/);
    assert.doesNotMatch(fonte, /nome: 'Abatimento de fatura'/);
    assert.match(fonte, /const totalDoPeriodo = i => Object\.values\(matriz\)/);
});

test('comparar aplica exclusões depois de unir linhas reais e sintéticas', () => {
    const { filtrarLinhasDaComparacao } = regrasDaComparacao();
    const filtradas = filtrarLinhasDaComparacao(
        [{ id: 1, categ: 'Casa', nome: 'Condomínio' }],
        [{ id: -1, categ: 'Saldo', nome: 'Saldo do mês anterior' }],
    );
    assert.deepEqual(Array.from(filtradas, linha => linha.id), [1]);
});

test('recorrência duplicada usa nome e categoria, mesmo quando o valor muda', () => {
    const {
        temRecorrenciaDuplicadaEntreMeses,
        todasRecorrenciasDaMudancaSaoExplicadas,
    } = regrasDaComparacao();
    const duplicadas = [
        { id: 1, nome: 'Trybe', categ: 'Dívida, Reserva', data: '2027-07-08', v: -250 },
        { id: 2, nome: 'Trybe', categ: 'Dívida, Reserva', data: '2027-08-08', v: -700 },
    ];
    assert.equal(temRecorrenciaDuplicadaEntreMeses([
        ...duplicadas,
    ]), true);
    assert.equal(todasRecorrenciasDaMudancaSaoExplicadas([
        { id: 3, nome: 'Trybe', categ: 'Dívida, Reserva', data: '2027-09-08', v: -700 },
    ], [duplicadas]), true);
    assert.equal(temRecorrenciaDuplicadaEntreMeses([
        { id: 1, nome: 'Trybe', categ: 'Dívida', data: '2027-07-08', v: -250 },
        { id: 2, nome: 'Trybe', categ: 'Curso', data: '2027-08-08', v: -250 },
        { id: 3, nome: 'Outro', categ: 'Dívida', data: '2027-08-08', v: -250 },
    ]), false);
});

test('um nome duplicado não esconde outros nomes que fizeram a categoria começar', () => {
    const { todasRecorrenciasDaMudancaSaoExplicadas } = regrasDaComparacao();
    const ammiDuplicada = [
        { id: 1, nome: 'Ammi', categ: 'Isabella', data: '2026-08-07', v: 36.98 },
        { id: 2, nome: 'Ammi', categ: 'Isabella', data: '2026-09-04', v: 50 },
    ];
    const inicioDeIsabella = [
        ...ammiDuplicada,
        { id: 3, nome: 'Sabonete', categ: 'Isabella', data: '2026-08-08', v: -99.30 },
    ];
    assert.equal(todasRecorrenciasDaMudancaSaoExplicadas(inicioDeIsabella, [inicioDeIsabella]), false);
});

test('comparar exclui categorias financeiras, técnicas e escolhidas, inclusive compartilhadas', () => {
    const { ehLinhaExcluidaDaComparacao } = regrasDaComparacao();
    assert.equal(ehLinhaExcluidaDaComparacao({ categ: 'Rendimento', nome: 'Juros' }), true);
    assert.equal(ehLinhaExcluidaDaComparacao({ categ: 'Casa, Reembolso', nome: 'Estorno' }), true);
    assert.equal(ehLinhaExcluidaDaComparacao({ categ: 'Teste', nome: 'Rascunho' }), true);
    ['Alimentação', 'Transporte', 'Besteira', 'Presente', 'Presemte', 'Saldo'].forEach(categoria => {
        assert.equal(ehLinhaExcluidaDaComparacao({ categ: categoria, nome: categoria }), true);
    });
    assert.equal(ehLinhaExcluidaDaComparacao({ categ: 'Casa', nome: 'Moradia' }), false);
});

test('linha Total preserva a grade das colunas dinâmicas sem células aninhadas', () => {
    assert.match(fonte, /const celTotalPeriodo = i => celSoma\(totalDoPeriodo\(i\)\);/);
    assert.match(fonte, /const totalGeral = chavesFiltradas\.reduce/);
    assert.match(fonte, /<td class="n colDif"><\/td><td class="n colDif"><\/td><td class="n colDif"><\/td>/);
    assert.doesNotMatch(fonte, /<td class=n>\$\{celSoma/);
});

test('regras documentam as exclusões específicas de Comparar, gráficos e Visualizações', () => {
    assert.match(regrasDocumentadas, /## Escopo e exclusões das visões/);
    assert.match(regrasDocumentadas, /\*\*Comparar:\*\*[\s\S]*Rendimento[\s\S]*Alimentação[\s\S]*Saldo[\s\S]*Antecipação Fatura/);
    assert.match(regrasDocumentadas, /\*\*Gráfico — pizza do ciclo:\*\*[\s\S]*Compras de Crédito[\s\S]*Reserva/);
    assert.match(regrasDocumentadas, /\*\*Gráfico — evolução ao comparar ciclos:\*\*[\s\S]*Não há exclusão nominal/);
    assert.match(regrasDocumentadas, /\*\*Visualizações:\*\*[\s\S]*categoria contendo `Roberta`[\s\S]*Banco do Brasil/);
});
