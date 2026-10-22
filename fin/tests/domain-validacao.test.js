// Contrato de domínio: valida dados carregados sem mutar ou descartar registros históricos.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { carregarFuncoes } = require('./helpers/carregar-funcoes');

const categoriasSeparadas = valor => {
    const vistas = new Set();
    return String(valor ?? '').split(',')
        .map(categoria => categoria.trim())
        .filter(Boolean)
        .filter(categoria => {
            const chave = categoria.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (vistas.has(chave)) return false;
            vistas.add(chave);
            return true;
        });
};

const dominio = carregarFuncoes('js/domain.js', [
    'validarLancamentosCarregados', 'ciclosDeFinCiclo', 'CATEGORIA_INVESTIMENTO',
    'TOLERANCIA_FINANCEIRA', 'PREFIXO_LINHA_SINTETICA', 'definirLimiteCartao', 'limiteCartaoContratado',
], { categoriasSeparadas });

// "Hoje" (pago sem olhar data, ver REGRAS.md) só faz sentido se o diagnóstico conseguir
// avisar quando um pago cair fora do ciclo atual — por isso esse grupo injeta hojeISO.
const dominioComHoje = carregarFuncoes('js/domain.js', [
    'validarLancamentosCarregados',
], { categoriasSeparadas, hojeISO: () => '2026-09-26' });

test('centraliza nomes e tolerância usados pelas regras financeiras', () => {
    assert.equal(dominio.CATEGORIA_INVESTIMENTO, 'Investimento');
    assert.equal(dominio.TOLERANCIA_FINANCEIRA, 0.005);
    assert.equal(dominio.PREFIXO_LINHA_SINTETICA.test('sug:4'), true);
});

test('aceita apenas limite contratado não negativo', () => {
    assert.equal(dominio.definirLimiteCartao(4123.456), true);
    assert.equal(dominio.limiteCartaoContratado(), 4123.46);
    assert.equal(dominio.definirLimiteCartao(-1), false);
});

test('aceita lançamento persistido completo sem avisos', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 10, data: '2026-09-21', valor: '-42.50', nome: 'Mercado', categ: 'Casa', cred: false, pago: true },
        { id: 13, data: '2026-09-22', valor: '-30.00', nome: 'Luz', categ: 'Casa', cred: false, pago: false },
    ]);
    assert.deepEqual(Array.from(diagnostico.inconsistencias), []);
    assert.deepEqual(Array.from(diagnostico.avisos), []);
});

test('avisa categoria com uma única ocorrência sem confundir caixa ou acento', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 20, data: '2026-09-21', valor: -10, nome: 'Único', categ: 'Viagem', cred: false, pago: false },
        { id: 21, data: '2026-09-21', valor: -10, nome: 'Casa A', categ: 'Casa', cred: false, pago: false },
        { id: 22, data: '2026-09-21', valor: -10, nome: 'Casa B', categ: 'cása ', cred: false, pago: false },
    ]);
    assert.deepEqual(Array.from(diagnostico.inconsistencias), []);
    assert.ok(diagnostico.avisos.some(aviso => aviso.includes('Categoria "Viagem" aparece em apenas um lançamento: "Único" (id 20).')));
    assert.ok(!diagnostico.avisos.some(aviso => aviso.includes('Categoria "Casa"')));
});

test('categoria única só avisa em lançamento negativo; positivo nunca', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 40, data: '2026-09-21', valor: -10, nome: 'Saída', categ: 'Viagem', cred: false, pago: false },
        { id: 41, data: '2026-09-21', valor: 300, nome: 'Venda bike', categ: 'Venda', cred: false, pago: true },
        { id: 42, data: '2026-09-21', valor: 0, nome: 'Zerado', categ: 'Zero', cred: false, pago: true },
    ]);
    assert.ok(diagnostico.avisos.some(aviso => aviso.includes('Categoria "Viagem" aparece em apenas um lançamento')));
    assert.ok(!diagnostico.avisos.some(aviso => aviso.includes('Categoria "Venda"')));
    assert.ok(!diagnostico.avisos.some(aviso => aviso.includes('Categoria "Zero"')));
    assert.match(fs.readFileSync('docs/REGRAS.md', 'utf8'), /e só quando esse lançamento é negativo \(saída\); com valor positivo ou zero, nunca avisa/);
});

test('valida cada categoria separada por vírgula', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 30, data: '2026-09-21', valor: -10, nome: 'Mercado A', categ: 'Casa, Mercado', cred: false, pago: true },
        { id: 31, data: '2026-09-22', valor: -20, nome: 'Mercado B', categ: 'Mercado, Saúde', cred: false, pago: true },
    ]);
    assert.ok(!diagnostico.avisos.some(aviso => aviso.includes('Categoria "Mercado"')));
    assert.ok(diagnostico.avisos.some(aviso => aviso.includes('Categoria "Casa" aparece em apenas um lançamento: "Mercado A" (id 30).')));
    assert.ok(diagnostico.avisos.some(aviso => aviso.includes('Categoria "Saúde" aparece em apenas um lançamento: "Mercado B" (id 31).')));
});

test('avisa sobre contrato inválido sem alterar os dados recebidos', () => {
    const entrada = [{ id: 11, data: '21/09/2026', valor: 'abc', nome: '', cred: true, pago: 'sim' }];
    const antes = JSON.stringify(entrada);
    const diagnostico = dominio.validarLancamentosCarregados(entrada);
    assert.equal(JSON.stringify(entrada), antes);
    assert.ok(diagnostico.inconsistencias.some(aviso => aviso.includes('nome ausente')));
    assert.ok(diagnostico.inconsistencias.some(aviso => aviso.includes('valor não numérico')));
    assert.ok(diagnostico.inconsistencias.some(aviso => aviso.includes('crédito sem fatura vinculada')));
    assert.ok(diagnostico.inconsistencias.some(aviso => aviso.includes('pago precisa ser booleano')));
});

test('avisa quando o mesmo mês de fatura usa mais de um dia de vencimento', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 40, data: '2026-10-05', valor: -90, nome: 'Compra A', categ: 'Casa', cred: true, pago: true, fatura: '2026-10-12' },
        { id: 41, data: '2026-10-06', valor: -50, nome: 'Compra B', categ: 'Casa', cred: true, pago: true, fatura: '2026-10-14' },
        { id: 42, data: '2026-11-05', valor: -90, nome: 'Compra C', categ: 'Casa', cred: true, pago: true, fatura: '2026-11-12' },
    ]);
    assert.ok(diagnostico.avisos.some(aviso => aviso.includes('Fatura Nubank de 2026-10 tem vencimento em mais de um dia')));
    assert.ok(!diagnostico.avisos.some(aviso => aviso.includes('de 2026-11')));
});

test('Nubank dia 12 e Mercado Pago dia 13 no mesmo mês não geram aviso (um dia por cartão)', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 60, data: '2026-10-05', valor: -90, nome: 'Compra A', categ: 'Casa', cred: true, pago: true, fatura: '2026-11-12' },
        { id: 61, data: '2026-10-06', valor: -50, nome: 'Compra B', categ: 'Casa', cred: true, pago: true, fatura: '2026-11-13' },
    ]);
    assert.ok(!diagnostico.avisos.some(aviso => aviso.includes('vencimento em mais de um dia')));
});

test('débito avisa pago no ciclo seguinte, mas crédito só avisa dois ciclos à frente (a prévia normal é 1)', () => {
    // Os ciclos vêm de fin_ciclo (início de cada um), nunca de um lançamento.
    const ciclos = ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01'].map(ini => ({ ini }));
    const diagnostico = dominioComHoje.validarLancamentosCarregados([
        // entrada paga no início do próximo ciclo também é "pago no futuro": avisa como qualquer outra
        { id: 4, data: '2026-10-01', nome: 'Faturamento PJ', categ: '', cred: false, pago: true, valor: 1 },
        // dentro do ciclo atual (01/09 a 30/09): não deve avisar
        { id: 50, data: '2026-09-20', valor: -100, nome: 'Mercado', categ: 'Casa', cred: false, pago: true },
        // débito pago com data no ciclo seguinte (a partir de 01/10): deve avisar
        { id: 51, data: '2026-10-10', valor: -250, nome: 'Água', categ: 'Casa', cred: false, pago: true },
        // débito aberto no futuro: não deve avisar (não está pago)
        { id: 52, data: '2026-10-12', valor: -250, nome: 'Água', categ: 'Casa', cred: false, pago: false },
        // crédito confirmado com fatura no ciclo seguinte (N+1): é a prévia normal, não avisa
        { id: 53, data: '2026-09-25', valor: -80, nome: 'Compra cartão', categ: 'Casa', cred: true, pago: true, fatura: '2026-10-12' },
        // crédito confirmado com fatura dois ciclos à frente (N+2): foge da prévia, deve avisar
        { id: 54, data: '2026-09-26', valor: -60, nome: 'Compra cartão 2', categ: 'Casa', cred: true, pago: true, fatura: '2026-11-12' },
    ], ciclos);
    assert.equal(diagnostico.avisos.filter(a => a.includes('marcado como pago')).length, 3);
    // Identifica pelo id, nome e data; a posição na lista carregada não aparece mais.
    assert.ok(diagnostico.avisos.some(a => a.startsWith('id 4 — "Faturamento PJ", 01/10/2026: marcado como pago')));
    assert.ok(diagnostico.avisos.some(a => a.startsWith('id 51 — "Água", 10/10/2026:') && a.includes('data em 10/10/2026') && a.includes('um ciclo futuro, fora do atual')));
    assert.ok(diagnostico.avisos.some(a => a.startsWith('id 54 — "Compra cartão 2", 26/09/2026:') && a.includes('vencimento de fatura em 12/11/2026') && a.includes('dois ciclos à frente')));
    assert.ok(!diagnostico.avisos.some(a => /Lançamento \d/.test(a)));
    assert.ok(!diagnostico.avisos.some(a => a.includes('id 50')));
    assert.ok(!diagnostico.avisos.some(a => a.includes('id 52')));
    assert.ok(!diagnostico.avisos.some(a => a.includes('id 53')));
});

test('parcelas seguintes de compra parcelada não avisam quando a 1ª está na prévia normal', () => {
    const ciclos = ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01'].map(ini => ({ ini }));
    const parcela = (id, data, fatura, lote) => ({ id, data, fatura, valor: -133.33, nome: 'Tênis', categ: 'Vestuário', cred: true, pago: true, freq: 'Mensal', recorrencia_id: lote });
    const diagnostico = dominioComHoje.validarLancamentosCarregados([
        // lote 70: 1ª fatura em N+1 (prévia normal) → 2ª e 3ª parcelas não avisam
        parcela(70, '2026-09-12', '2026-10-12', 70), parcela(71, '2026-10-12', '2026-11-12', 70), parcela(72, '2026-11-12', '2026-12-12', 70),
        // lote 80: já começa em N+2 → todas avisam
        parcela(80, '2026-10-20', '2026-11-12', 80), parcela(81, '2026-11-20', '2026-12-12', 80),
        // avulso dois ciclos à frente, sem lote → avisa
        { id: 90, data: '2026-10-25', valor: -60, nome: 'Avulso', categ: 'Casa', cred: true, pago: true, fatura: '2026-11-12', recorrencia_id: null },
    ], ciclos);
    const avisados = diagnostico.avisos.filter(a => a.includes('marcado como pago')).map(a => +a.match(/^id (\d+)/)[1]).sort((x, y) => x - y);
    assert.deepEqual([...avisados], [80, 81, 90]);
    assert.match(fs.readFileSync('docs/REGRAS.md', 'utf8'), /Também não avisa nas parcelas seguintes de uma compra parcelada \(mesmo `recorrencia_id`\) cuja 1ª fatura/);
});

test('ciclos vêm de fin_ciclo: ordenados pelo início, fim vazio = aberto, buraco vira aviso', () => {
    const { ciclos, avisos } = dominio.ciclosDeFinCiclo([
        { id: 9, inicio: '2026-11-05', fim: null },
        { id: 7, inicio: '2026-09-05', fim: '2026-10-04' },
        { id: 8, inicio: '2026-10-10', fim: '2026-11-04' },   // 05 a 09/10 sem ciclo
        { id: 10, inicio: null, fim: null },                  // sem início: ignorado
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(ciclos)), [
        { id: 'c:7', cicloId: 7, ini: '2026-09-05', fat: '2026-10-04' },
        { id: 'c:8', cicloId: 8, ini: '2026-10-10', fat: '2026-11-04' },
        { id: 'c:9', cicloId: 9, ini: '2026-11-05', fat: '9999-12-31' },
    ]);
    assert.deepEqual(Array.from(avisos), ['Sem ciclo entre 2026-10-05 e a véspera de 2026-10-10: lançamentos nessas datas vão pro Backlog.']);
});

test('mensagens identificam pelo id com nome e data; sem id, pela posição na carga', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 7, data: '2026-10-05', valor: 'x', nome: 'Netflix', categ: 'Casa', cred: false, pago: false },
        { data: '2026-10-05', valor: 'y', nome: 'Sem id', categ: 'Casa', cred: false, pago: false },
    ]);
    assert.ok(diagnostico.inconsistencias.includes('id 7 — "Netflix", 05/10/2026: valor não numérico.'));
    assert.ok(diagnostico.inconsistencias.includes('Registro 2 da carga (sem id): valor não numérico.'));
});
