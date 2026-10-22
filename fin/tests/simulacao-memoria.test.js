// Contrato de simulação: edição e ocultação locais jamais chamam escrita no Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');

test('simulação mantém update e exclusão de linhas reais somente em memória', () => {
    assert.match(formulario, /const exclusaoEhSimulada = r => Estado\.simulando \|\| r\._sim;/);
    assert.match(formulario, /if \(!exclusaoEhSimulada\(r\)\) await excluirLancamento\(r\.id\);/);
    assert.match(formulario, /Ocultar .* só nesta simulação/);
    assert.match(formulario, /Volta ao recarregar ou sair da simulação/);
    // Pago, Reserva/Comprometido (um único handler pras duas — data-tog-flag), Valor
    // (texto), sinal (botão +/-), Data, Nome, Categoria, Frequência, Prio, Obs, Canal e
    // corrigir recorrência duplicada (botão "↷" ao lado da Data): 12 pontos de edição
    // inline, todos passando pela mesma guarda antes de chamar o Supabase.
    // 6 editores com regra própria (Valor, Data…) + 1 registrador genérico (Nome, Categoria,
    // Frequência, Prio, Obs, Canal): todo UPDATE inline respeita a simulação.
    assert.equal((interacoes.match(/!Estado\.simulando && !\w+\._sim\) await atualizarLancamento/g) || []).length, 6);
    // Reserva/Comprometido/Pra sempre: um PATCH em lote só com as linhas reais, fora da simulação.
    assert.match(interacoes, /const reais = simulando \? \[\] : mesmoNome\.filter\(linha => !linha\._sim\);/);
    // Limites por ciclo (fin_ciclo) passam pela mesma guarda: simulação só altera a memória.
    assert.match(interacoes, /!Estado\.simulando \? await salvarLimiteDoCiclo\(/);
    assert.doesNotMatch(graficos, /atualizarLancamento|inserirLancamento|excluirLancamento/);
});

test('ajuste materializado na simulação vira linha local', () => {
    assert.match(formulario, /if \(Estado\.simulando\) \{\s+simulaLancamentoParcelado/);
    assert.match(interacoes, /Estado\.simulando \? 'Simular' :/);
});
