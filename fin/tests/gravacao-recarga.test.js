// Toda gravação confirmada pelo banco pede a recarga da tela; a carga anota quantas gravações já viu. As funções reais de
// js/supabase-api.js e js/data-ui.js rodam com um banco falso (tests/helpers/tela-sem-navegador.js), sem navegador.
const assert = require('node:assert/strict');
const test = require('node:test');
const { carregarTela } = require('./helpers/tela-sem-navegador');

const dados = () => ({ fin: [{ id: 7, nome: 'Café', data: '2026-10-16', valor: -12, categ: 'Besteira', cred: false, pago: true, fatura: null, freq: null }],
    fin_ciclo: [{ id: 1, inicio: '2026-10-15', fim: null }], fin_meta: [{ id: 3, nome: 'Mesa', valor: 1500, status: 'aberta' }] });
function comContador() {
    const t = carregarTela({ dados: dados() });
    t.ctx.recargas = 0;
    t.ctx.recarregarAposGravacao = () => t.ctx.recargas++;
    return t;
}

test('cada gravação confirmada pede uma recarga: inserir, atualizar, excluir, limite do ciclo e meta', async () => {
    const t = comContador();
    for (const chamada of ["inserirLancamentos([{ nome: 'x', valor: -1 }])", "atualizarLancamentos([7], { pago: false })", 'excluirLancamento(7)',
        "salvarLimiteDoCiclo(1, 'limite_besteira', 300)", "inserirMeta({ nome: 'Nova', valor: 1 })"]) {
        const antes = t.ctx.recargas;
        await t.bruto(chamada);
        assert.equal(t.ctx.recargas, antes + 1, chamada);
    }
});

test('numerar a série (rpc) não é gravação de linha: não pede recarga', async () => {
    const t = comContador();
    t.ctx.fetch = async () => ({ ok: true, status: 200, text: async () => '5' });
    assert.equal(await t.bruto('proximaRecorrencia()'), 5);
    assert.equal(t.ctx.recargas, 0);
});

test('INSERT sem resposta pode ter gravado: pede a recarga e avisa que pode ter salvo', async () => {
    const t = comContador();
    t.ctx.fetch = async () => { throw Error('Failed to fetch'); };
    await assert.rejects(t.bruto("inserirLancamentos([{ nome: 'x', valor: -1 }])"), /pode ter salvado/);
    assert.equal(t.ctx.recargas, 1);
});

test('a carga anota quantas gravações já viu e quantas cargas estão em andamento (durante e depois)', async () => {
    const t = carregarTela({ dados: dados() });
    t.ctx.desenhar = () => {};                                                   // o desenho em si (js/interactions.js) é testado em outro lugar
    let soltar;
    const fetchReal = t.ctx.fetch;
    t.ctx.fetch = (...a) => new Promise(ok => { soltar = () => ok(fetchReal(...a)); });
    t.bruto('(Estado.gravacoes = 3, Estado.gravacoesNaUltimaCarga = 0, Estado.cargasEmAndamento = 0)');
    const carga = t.bruto('load({ silencioso: true })');
    await new Promise(ok => setTimeout(ok, 0));
    assert.equal(t.rodar('Estado.cargasEmAndamento'), 1);                       // no ar
    t.ctx.fetch = fetchReal; soltar();
    assert.equal(await carga, true);
    assert.deepEqual(t.rodar('[Estado.cargasEmAndamento, Estado.gravacoesNaUltimaCarga]'), [0, 3]);
});

test('recarregar com a simulação ligada tira um retrato novo de antes, copiado linha a linha (mexer na tela não muda o retrato)', async () => {
    const t = carregarTela({ dados: dados() });
    await t.bruto('(Estado.simulando = true, carregarDados())');
    assert.deepEqual(t.rodar('Estado.retratoAntesDaSimulacao.lancamentos.map(r => [r.id, r.v])'), [[7, -12]]);
    t.bruto("(Estado.lancamentos[0].v = -99, Estado.metas[0].nome = 'Outra')");
    assert.deepEqual(t.rodar('[Estado.retratoAntesDaSimulacao.lancamentos[0].v, Estado.retratoAntesDaSimulacao.metas[0].nome]'), [-12, 'Mesa']);
    const sem = carregarTela({ dados: dados() });
    await sem.bruto('carregarDados()');
    assert.equal(sem.rodar('Estado.retratoAntesDaSimulacao ?? null'), null);     // sem simulação, nada
});
