// Regressão: débito em aberto e fatura sem pagar de um ciclo que já acabou (desde SALDO_DESDE)
// são atrasados: contam no ciclo de hoje (não no da data), aparecem na tabela dele com a marca
// e no aviso da faixa Hoje; pagar o débito traz a data pra hoje. Roda o código real de
// domain/shared/finance com hoje fixo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const regras = ler('docs/REGRAS.md');

// Agosto e setembro já acabaram; outubro é o de hoje (28/10/2026); novembro vem depois.
const CICLOS = [
    { id: 'c:0', cicloId: 0, ini: '2026-08-05', fat: '2026-09-04' },
    { id: 'c:1', cicloId: 1, ini: '2026-09-05', fat: '2026-10-04' },
    { id: 'c:2', cicloId: 2, ini: '2026-10-05', fat: '2026-11-04' },
    { id: 'c:3', cicloId: 3, ini: '2026-11-05', fat: '2026-12-04' },
];
function carrega(crus, hoje = '2026-10-28') {
    const contexto = { Estado: { ciclos: CICLOS.map(c => ({ ...c })), lancamentos: [], faturas: [], limitesPorCiclo: new Map() }, SALDO_DESDE: '2026-08-07', MESES: [], document: { getElementById: () => ({}) }, setTimeout, clearTimeout };
    vm.createContext(contexto);
    // hojeISO vira var pra o teste fixar o dia.
    vm.runInContext(ler('js/domain.js'), contexto);
    vm.runInContext(ler('js/shared.js').replace('const hojeISO = () =>', 'var hojeISO = () =>'), contexto);
    contexto.hojeISO = () => hoje;
    vm.runInContext(ler('js/finance.js'), contexto);
    contexto.Estado.lancamentos = crus.map(r => ({ ...r, v: +r.valor || 0, periodoIdx: contexto.periodoDoLancamento(r) }));
    return contexto;
}
const debito = extra => ({ id: 1, nome: 'Contabilidade', categ: 'Contabilidade', valor: -350, cred: false, pago: false, data: '2026-09-20', fatura: null, ...extra });

test('débito em aberto de um ciclo que já acabou é atrasado e conta no ciclo de hoje', () => {
    const c = carrega([]);
    assert.equal(c.ehDebitoAtrasado(debito()), true);
    assert.equal(c.periodoDoLancamento(debito()), 2);
    // Não é atrasado: pago, status vazio, crédito, investimento, linha calculada, antes de
    // SALDO_DESDE, no ciclo de hoje ou depois, sem data.
    for (const extra of [{ pago: true }, { pago: null }, { cred: true, fatura: '2026-09-12' }, { categ: 'Investimento' },
        { _sid: 'fat:1' }, { data: '2026-08-06' }, { data: '2026-10-10' }, { data: '2026-11-20' }, { data: null }]) {
        assert.equal(c.ehDebitoAtrasado(debito(extra)), false, JSON.stringify(extra));
    }
    assert.equal(c.periodoDoLancamento(debito({ pago: true })), 1);
});

test('fatura sem pagar de ciclo passado sai do ciclo dela e entra no de hoje; paga não', () => {
    const compra = { id: 2, nome: 'Mercado', categ: 'Alimentação', valor: -500, cred: true, pago: true, data: '2026-08-20', fatura: '2026-09-12' };
    let c = carrega([compra]);
    const base = c.Estado.lancamentos, abat = c.alocacaoAntecipacoes(base);
    assert.equal(c.faturasLiquidasDoCiclo(base, abat, 1).length, 0);
    const deHoje = c.faturasLiquidasDoCiclo(base, abat, 2);
    assert.equal(deHoje.length, 1);
    assert.equal(deHoje[0].liquido, -500);
    assert.equal(deHoje[0].atrasada, true);
    assert.equal(deHoje[0].cicloOrigem, 1);
    // Saldo: o mesmo total, só que no ciclo de hoje.
    assert.equal(c.totalBaseDoCiclo(1, base, abat, () => 0), 0);
    assert.equal(c.totalBaseDoCiclo(2, base, abat, () => 0), -500);

    // Antecipação apontando pra ela (paga hoje): quitada, fica no ciclo dela, sem atrasada.
    const pagamento = { id: 3, nome: 'Pagamento fatura', categ: 'Antecipação Fatura', valor: -500, cred: false, pago: true, data: '2026-10-28', fatura: '2026-09-12' };
    c = carrega([compra, pagamento]);
    const base2 = c.Estado.lancamentos, abat2 = c.alocacaoAntecipacoes(base2);
    assert.equal(c.faturasLiquidasDoCiclo(base2, abat2, 2).filter(f => f.atrasada).length, 0);
    assert.equal(c.faturasLiquidasDoCiclo(base2, abat2, 1)[0].liquido, 0);
});

test('atrasado sai hoje no saldo por dia', () => {
    const fonte = ler('js/finance.js');
    assert.match(fonte, /data: ehDebitoAtrasado\(r\) \? hojeISO\(\) : dataISO\(r\.data\)/);
    assert.match(fonte, /data: f\.atrasada \? hojeISO\(\) : f\.vencimento/);
});

test('recorrência duplicada ignora o atrasado (não move a conta do mês)', () => {
    const visoes = ler('js/cycle-views.js');
    assert.match(visoes, /linhas\.filter\(ehLinhaReal\)\.filter\(r => !ehTransferenciaFatura\(r\) && !ehDebitoAtrasado\(r\)\)/);
    assert.match(visoes, /!ehTransferenciaFatura\(r\) && !ehDebitoAtrasado\(r\) && r\.v <= 0 && ehDeSerie\(r\)/);
});

test('aviso na faixa Hoje, marca no nome e alinhamento sem o aviso', () => {
    const visoes = ler('js/cycle-views.js');
    assert.match(visoes, /const atrasadosDoCiclo = cicloAtual \? linhasDebito\.filter\(r => r\._atrasado \|\| ehDebitoAtrasado\(r\)\) : \[\];/);
    assert.match(visoes, /`Atrasado <b class=vm>\$\{brl\(atrasadosDoCiclo\.reduce/);
    assert.match(ler('js/tables.js'), /const badgeAtrasado = r\._atrasado \|\| ehDebitoAtrasado\(r\)/);
    assert.match(ler('js/interactions.js'), /!c\.classList\.contains\('resumoAtrasado'\)/);
});

test('pagar o atrasado traz a data pra hoje, sem perguntar', () => {
    const interacoes = ler('js/interactions.js');
    const corpo = interacoes.slice(interacoes.indexOf('    const novoPago = !r.pago;'), interacoes.indexOf('    badge.classList.toggle'));
    const confirmacoes = [];
    const contexto = {
        ehDebitoAtrasado: r => r.data === '2026-09-20', hojeISO: () => '2026-10-28', dataISO: v => v, dataBR: v => v,
        periodoDoDebito: () => -1, confirm: msg => { confirmacoes.push(msg); return true; },
    };
    vm.createContext(contexto);
    vm.runInContext(`function decide(r) {\n${corpo}\n    return { novoPago, novaData, dataDoAtraso };\n}\nglobalThis.decide = decide;`, contexto);
    const r = contexto.decide({ pago: false, cred: false, data: '2026-09-20', nome: 'Contabilidade' });
    assert.equal(r.novaData, '2026-10-28');
    assert.equal(r.dataDoAtraso, '2026-09-20');
    assert.equal(confirmacoes.length, 0);
    assert.match(interacoes, /if \(dataDoAtraso\) mostrarToast\('Atrasado pago hoje'/);
});

test('regra documentada', () => {
    assert.match(regras, /### Atrasados/);
    assert.match(regras, /conta no ciclo de hoje/);
});
