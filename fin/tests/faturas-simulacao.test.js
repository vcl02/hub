// Regressão: a fatura sugerida no cadastro/simulação é sempre a do MÊS SEGUINTE à data de
// cada prestação (Nubank por padrão), sem depender de existir fatura cadastrada; no
// cadastro e no Duplicar ela fica presa à data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const inicio = script.indexOf('function faturaDoMesSeguinte(');
const fim = script.indexOf('\n// Credito nao tem mais inferencia por fechamento', inicio);

if (inicio < 0 || fim < 0) throw Error('Não encontrou a regra de sugestão de faturas no script.');

const contexto = {
    CARTAO_NUBANK: 'nubank', DIA_VENCIMENTO_CARTAO: { nubank: 12, mp: 13 },
    dataISO: valor => String(valor).slice(0, 10),
    dataDaOcorrencia: (data, parcela, frequencia) => {
        const d = new Date(`${data}T00:00:00Z`);
        if (frequencia && frequencia !== 'Mensal') throw Error('O teste cobre prestações mensais.');
        d.setUTCMonth(d.getUTCMonth() + parcela);
        return d.toISOString().slice(0, 10);
    },
};
vm.createContext(contexto);
vm.runInContext(script.slice(inicio, fim), contexto);

const sugerir = (...args) => Array.from(contexto.faturasSugeridasParaParcelas(...args));

test('fatura do mês seguinte à data, no dia do cartão, qualquer que seja o dia da compra', () => {
    assert.equal(contexto.faturaDoMesSeguinte('2026-10-05'), '2026-11-12');
    assert.equal(contexto.faturaDoMesSeguinte('2026-10-30'), '2026-11-12');
    assert.equal(contexto.faturaDoMesSeguinte('2026-12-20'), '2027-01-12');   // virada de ano
    assert.equal(contexto.faturaDoMesSeguinte('2026-10-05', 'mp'), '2026-11-13');
});

test('cada prestação mensal vai pra fatura do mês seguinte à sua própria data', () => {
    assert.deepEqual(sugerir('2026-09-21', 3, 'Mensal'), ['2026-10-12', '2026-11-12', '2026-12-12']);
    assert.deepEqual(sugerir('2026-09-21', 2, null, 'mp'), ['2026-10-13', '2026-11-13']);
});

test('sem data não há sugestão', () => {
    assert.deepEqual(sugerir('', 2, 'Mensal'), [null, null]);
});

test('usa a sugestão também no cadastro real, sem depender da simulação', () => {
    assert.match(script, /const sugestoes = cred\s*\?/);
    assert.doesNotMatch(script, /Estado\.simulando && cred/);
});

test('cadastro e Duplicar: trocar a data refaz todas as faturas, mantendo só o cartão escolhido', () => {
    assert.match(script, /const atual = idsFaturasDoFormulario\(true\)\[0\];\s*\n\s*atualizarFaturasDoFormulario\(\[\], atual \? cartaoDaFatura\(atual\) : CARTAO_NUBANK\);/);
    // Editar continua respeitando a fatura gravada da própria linha.
    assert.match(script, /if \(modalNovo\.dataset\.editandoId\) \{\s*\n\s*atualizarFaturasDoFormulario\(idsFaturasDoFormulario\(false\)\);/);
    // Duplicar não copia a fatura do original.
    assert.match(script, /const fatRef = modoEdicao \? prefill\.fatura : null;/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /a fatura sugerida é sempre a do mês seguinte à data de cada prestação/);
    assert.match(regras, /Duplicar não copia a fatura do original/);
});

test('o botão Hoje troca a data como qualquer outra: a fatura acompanha', () => {
    assert.match(script, /el\('fDataHoje'\)\.onclick = \(\) => \{\s*\n\s*el\('fData'\)\.value = hojeISO\(\);\s*\n\s*el\('fData'\)\.dispatchEvent\(new Event\('change'\)\);/);
    assert.match(regras, /digitando, no calendário ou pelo botão \*\*Hoje\*\*/);
});
