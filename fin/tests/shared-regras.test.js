// Utilitários financeiros compartilhados: datas, texto e distribuição de antecipações.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/shared.js', 'utf8');

function regrasCompartilhadas(estado = { ciclos: [], faturas: [] }) {
    const contexto = {
        Estado: estado,
        CARTAO_NUBANK: 'nubank', CARTAO_MERCADO_PAGO: 'mp', CARTOES: ['nubank', 'mp'],
        DIA_VENCIMENTO_CARTAO: { nubank: 12, mp: 13 },
        MESES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
        document: { getElementById: () => ({}) },
        setTimeout, clearTimeout,
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte}\nglobalThis.regras = { brl, corValor, dataISO, dataBR, semAcento, escapeHtml, valorValido, categoriasSeparadas, normalizaCategorias, ehAntecipacaoFatura, ehTransferenciaFatura, somaMeses, somaDias, dataDaOcorrencia, alocacaoAntecipacoes };`, contexto);
    return contexto.regras;
}

test('normaliza data e texto sem perder a intenção da busca', () => {
    const r = regrasCompartilhadas();
    assert.equal(r.dataISO('2026-09-21T18:30:00.000Z'), '2026-09-21');
    assert.equal(r.dataBR('2026-09-21'), '21/09/2026');
    assert.equal(r.semAcento('  Evolução ÓBRA '), '  evolucao obra ');
    assert.equal(r.escapeHtml('<Mercado & "Casa">'), '&lt;Mercado &amp; &quot;Casa&quot;&gt;');
});

test('não exibe sinal negativo em valores arredondados a zero', () => {
    const r = regrasCompartilhadas();
    assert.equal(r.brl(-0.004), 'R$ 0,00');
    assert.equal(r.corValor(-0.004), '');
    assert.equal(r.brl(-0.005), '-R$ 0,01');
});

test('rejeita valores textuais que representam ausência de categoria', () => {
    const r = regrasCompartilhadas();
    [null, undefined, '', ' null ', '<undefined>', 'N/A', 'NaN'].forEach(valor => assert.equal(r.valorValido(valor), false));
    ['Investimento', '0'].forEach(valor => assert.equal(r.valorValido(valor), true));
    assert.equal(r.valorValido(0), false, 'zero não é uma categoria preenchida');
});

test('separa e normaliza categorias salvas em uma única célula', () => {
    const r = regrasCompartilhadas();
    assert.deepEqual(Array.from(r.categoriasSeparadas(' Casa, Mercado , casa, , Saúde ')), ['Casa', 'Mercado', 'Saúde']);
    assert.equal(r.normalizaCategorias(' Casa, Mercado , casa, , Saúde '), 'Casa, Mercado, Saúde');
    assert.deepEqual(Array.from(r.categoriasSeparadas('null, undefined, N/A')), []);
});

test('soma meses preservando o dia e limita ao fim do mês de destino', () => {
    const r = regrasCompartilhadas();
    assert.equal(r.somaMeses('2026-01-31', 1), '2026-02-28');
    assert.equal(r.somaMeses('2024-01-31', 1), '2024-02-29');
    assert.equal(r.somaMeses('2024-02-29', 12), '2025-02-28');
    assert.equal(r.somaMeses('2026-08-15', 0), '2026-08-15');
});

test('calcula recorrências mensais, semanais, quinzenais, semestrais e anuais', () => {
    const r = regrasCompartilhadas();
    assert.equal(r.dataDaOcorrencia('2026-01-31', 1, 'Mensal'), '2026-02-28');
    assert.equal(r.dataDaOcorrencia('2026-09-21', 2, 'Semanal'), '2026-10-05');
    assert.equal(r.dataDaOcorrencia('2026-09-21', 2, 'Quinzenal'), '2026-10-19');
    assert.equal(r.dataDaOcorrencia('2026-01-31', 1, 'Semestral'), '2026-07-31');
    assert.equal(r.dataDaOcorrencia('2024-02-29', 1, 'Anual'), '2025-02-28');
});

test('frequência ausente usa mensal para não concentrar parcelas na mesma data', () => {
    const r = regrasCompartilhadas();
    assert.equal(r.dataDaOcorrencia('2026-03-10', 0, ''), '2026-03-10');
    assert.equal(r.dataDaOcorrencia('2026-03-10', 2, 'desconhecida'), '2026-05-10');
    assert.equal(r.somaDias('2026-12-31', 1), '2027-01-01');
});

test('reconhece antecipação sem confundir uma categoria apenas parecida', () => {
    const r = regrasCompartilhadas();
    assert.equal(r.ehAntecipacaoFatura('Antecipação Fatura'), true);
    assert.equal(r.ehAntecipacaoFatura('Antecipação de Fatura'), true);
    assert.equal(r.ehAntecipacaoFatura('ANTECIPACAO FATURA'), true);
    assert.equal(r.ehAntecipacaoFatura('Antecipação de aluguel'), false);
    assert.equal(r.ehTransferenciaFatura({ cred: false, categ: 'Antecipação de Fatura' }), true);
    assert.equal(r.ehTransferenciaFatura({ cred: false, nome: 'Antecipação de Fatura', categ: 'Fatura' }), true);
    assert.equal(r.ehTransferenciaFatura({ cred: true, categ: 'Antecipação de Fatura' }), false);
});

test('antecipa faturas com vínculo explícito sem consumir faturas anteriores', () => {
    const estado = {
        ciclos: [
            { ini: '2026-09-01', fat: '2026-09-30' },
            { ini: '2026-10-01', fat: '2026-10-31' },
        ],
        faturas: [{ vencimento: '2026-09-20' }, { vencimento: '2026-10-20' }],
    };
    const r = regrasCompartilhadas(estado);
    const abatido = r.alocacaoAntecipacoes([
        { cred: true, periodoIdx: 0, v: -100 },
        { cred: true, periodoIdx: 1, v: -200 },
        { cred: false, categ: 'Antecipação de Fatura', data: '2026-09-05', v: -80, fatura: '2026-10-20' },
    ]);
    assert.equal(abatido[0] || 0, 0);
    assert.equal(abatido[1], 80);
});

test('antecipa sem vínculo em ordem cronológica e nunca abate além do saldo', () => {
    const estado = {
        ciclos: [
            { ini: '2026-09-01', fat: '2026-09-30' },
            { ini: '2026-10-01', fat: '2026-10-31' },
        ],
        faturas: [{ vencimento: '2026-09-20' }, { vencimento: '2026-10-20' }],
    };
    const r = regrasCompartilhadas(estado);
    const abatido = r.alocacaoAntecipacoes([
        { cred: true, periodoIdx: 0, v: -100 },
        { cred: true, periodoIdx: 1, v: -50 },
        { cred: false, categ: 'Antecipação Fatura', data: '2026-09-05', v: -120 },
        { cred: false, categ: 'Antecipação Fatura', data: '2026-09-10', v: -100 },
    ]);
    assert.deepEqual({ ...abatido }, { 0: 100, 1: 50 });
});

test('dois vencimentos do mesmo cartão no mesmo ciclo: a antecipação abate a fatura que aponta', () => {
    // Ciclo de 07/10 a 14/11 contém duas faturas do Nubank (12/10 e 12/11). Antes, sem um
    // vencimento único, nada era abatido e o pagamento contava duas vezes no saldo.
    const estado = { ciclos: [{ ini: '2026-10-07', fat: '2026-11-14' }], faturas: [{ vencimento: '2026-10-12' }, { vencimento: '2026-11-12' }] };
    const r = regrasCompartilhadas(estado);
    const abatido = r.alocacaoAntecipacoes([
        { cred: true, periodoIdx: 0, v: -300, fatura: '2026-10-12' },
        { cred: true, periodoIdx: 0, v: -200, fatura: '2026-11-12' },
        { cred: false, categ: 'Antecipação Fatura', data: '2026-10-20', v: -150, fatura: '2026-11-12' },
        { cred: false, categ: 'Antecipação Fatura', data: '2026-10-21', v: -400, fatura: '2026-10-12' },
    ]);
    // 150 na de 12/11 (cabe) + 300 na de 12/10 (limitado ao saldo dela, nunca transborda).
    assert.equal(abatido[0], 450);
});

test('linha de débito com fatura esquecida não atrapalha o abatimento da antecipação', () => {
    // A data esquecida (25/10, dia de Nubank) entra em Estado.faturas e deixava o ciclo com
    // dois vencimentos do Nubank.
    const estado = { ciclos: [{ ini: '2026-10-07', fat: '2026-11-06' }], faturas: [{ vencimento: '2026-10-12' }, { vencimento: '2026-10-25' }] };
    const r = regrasCompartilhadas(estado);
    const abatido = r.alocacaoAntecipacoes([
        { cred: true, periodoIdx: 0, v: -500, fatura: '2026-10-12' },
        { cred: false, nome: 'Água', categ: 'Casa', data: '2026-10-10', v: -80, fatura: '2026-10-25' },
        { cred: false, categ: 'Antecipação Fatura', data: '2026-10-09', v: -500, fatura: '2026-10-12' },
    ]);
    assert.equal(abatido[0], 500);
});

test('regra do abatimento por vencimento documentada', () => {
    assert.match(fs.readFileSync('docs/REGRAS.md', 'utf8'), /A antecipação com `fatura` abate exatamente a fatura daquele vencimento/);
});
