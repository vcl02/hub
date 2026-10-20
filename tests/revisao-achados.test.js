// Regressão dos achados da revisão: consolidação nunca reescreve Aporte/Resgate pago e só
// grava um por vez; garantia Nubank e Livre Hoje só com o que já foi pago; recarga após
// gravar espera a simulação; teto Besteira por item inteiro; ciclo aberto sem 31/12/9999;
// saldo diário recortado com base e guardado próprios.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const inicializacao = fs.readFileSync('js/bootstrap.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const financas = fs.readFileSync('js/finance.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const compartilhado = fs.readFileSync('js/shared.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Extrai movimentoAporteOuResgateDoCiclo do arquivo real e roda com os globais mínimos.
function movimentoDoCiclo(lancamentos) {
    const inicio = interacoes.indexOf('function movimentoAporteOuResgateDoCiclo(');
    const fim = interacoes.indexOf('\n}\n', inicio) + 3;
    const contexto = {
        Estado: { lancamentos, ciclos: [{ ini: '2026-10-08', fat: '2026-11-08' }] },
        ehLinhaReal: r => +r.id > 0 && !r._sim,
        semAcento: v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
        dataISO: v => String(v || '').slice(0, 10),
        timestamp: v => Date.parse(String(v || '').slice(0, 10)) || 0,
        dataDeFechamentoDoCiclo: ciclo => ciclo.fat,
    };
    vm.createContext(contexto);
    vm.runInContext(`${interacoes.slice(inicio, fim)}\nglobalThis.f = movimentoAporteOuResgateDoCiclo;`, contexto);
    return contexto.f(0);
}

const aporte = (id, data, pago) => ({ id, data, pago, nome: 'Aporte', categ: 'Investimento', inv: true, cred: false, periodoIdx: 0, v: -100 });

test('consolidação nunca escolhe Aporte/Resgate já pago; com só pago no ciclo, materializa um novo', () => {
    assert.equal(movimentoDoCiclo([aporte(1, '2026-10-10', true)]), null);
    assert.equal(movimentoDoCiclo([aporte(1, '2026-10-10', true), aporte(2, '2026-10-20', false)]).id, 2);
});

test('entre os abertos, prefere o da data de fechamento (o que o app cria), senão o mais antigo', () => {
    assert.equal(movimentoDoCiclo([aporte(1, '2026-10-10', false), aporte(2, '2026-11-08', false)]).id, 2);
    assert.equal(movimentoDoCiclo([aporte(3, '2026-10-20', false), aporte(1, '2026-10-10', false)]).id, 1);
});

test('um Materializar/Consolidar por vez: o clique e o Consolidar tudo dividem a mesma trava', () => {
    assert.match(formulario, /if \(Estado\.gravandoAjuste\) \{ mostrarToast\('Aguarde', 'Há uma consolidação em andamento\.'\); return; \}\s*\n\s*\n\s*Estado\.gravandoAjuste = true;/);
    assert.match(formulario, /if \(Estado\.gravandoAjuste\) \{\s*\n\s*if \(!silencioso\) mostrarToast\('Aguarde', 'Há um Aporte\/Resgate sendo gravado\.'\);\s*\n\s*return;\s*\n\s*\}/);
    // Liberada no finally dos dois caminhos, com sucesso ou falha.
    assert.equal((formulario.match(/\} finally \{\s*\n\s*Estado\.gravandoAjuste = false;/g) || []).length, 2);
    assert.match(fs.readFileSync('js/app-state.js', 'utf8'), /gravandoAjuste: false,/);
});

test('Livre Hoje do cartão só libera limite com antecipação já paga; Futuro só com as da fatura exibida', () => {
    assert.match(visoes, /const abatidoPagoDoCartao = alocacaoAntecipacoes\(Estado\.lancamentos\.filter\(r => !ehTransferenciaFatura\(r\) \|\| r\.pago\)\);/);
    assert.match(visoes, /limiteLivreFuturo: limiteCartaoLivreFuturo\(\s*\n\s*Estado\.lancamentos, garantidoDoCartao, idxCreditoExibido,/);
    assert.doesNotMatch(visoes, /abatidoNoCartao|abatidoDoCartao/);
});

test('garantia Nubank só com investimento pago; Liberdade financeira segue com os abertos', () => {
    assert.match(financas, /\.filter\(r => r\.inv && r\.pago && r\.periodoIdx != null && r\.periodoIdx <= idx\)/);
    assert.match(graficos, /guardadoRealAte\(Estado\.lancamentos, idxPeriodo\),/);
    assert.doesNotMatch(graficos, /guardadoGarantidoAte/);
});

test('recarga após gravar espera a simulação acabar (a carga apagaria os simulados)', () => {
    assert.match(inicializacao, /const telaSemEdicaoEmCurso = \(\) =>\s*\n\s*el\('app'\)\.style\.display !== 'none' && !Estado\.simulando &&/);
});

test('teto Besteira compara item inteiro da categoria, sem substring', () => {
    assert.match(graficos, /x => ehCategoria\(x\.categ, categoria\)/);
    assert.doesNotMatch(graficos, /categoriaContemCompromisso/);
});

test('ciclo aberto nunca usa 31/12/9999 em datas exibidas ou calculadas', () => {
    assert.doesNotMatch(financas, /ajustes\.push\(\{ data: dataISO\(per\.fat\)/);
    assert.match(financas, /ajustes\.push\(\{ data: dataDeFechamentoDoCiclo\(per\), v: ajuste\.v \}\)/);
    assert.match(financas, /data: dataDeFechamentoDoCiclo\(ciclo\), nome: c\.nome/);
    assert.match(graficos, /data: dataDeFechamentoDoCiclo\(Estado\.ciclos\[i\]\), nome: ajuste\.nome/);
    assert.match(visoes, /data: dataDeFechamentoDoCiclo\(per\), cred: false, v: ajuste\.v/);
    assert.match(visoes, /a \$\{dataBR\(dataDeFechamentoDoCiclo\(periodo\)\)\}/);
    assert.match(visoes, /a \$\{dataBR\(dataDeFechamentoDoCiclo\(fimPeriodo\)\)\}/);
    assert.match(compartilhado, /: dataDeFechamentoDoCiclo\(Estado\.ciclos\[idx\]\);/);
});

test('saldo diário recortado calcula o guardado com os ajustes do próprio recorte', () => {
    const inicio = financas.indexOf('function ajusteDoCicloParaSaldoDiario(');
    const trecho = financas.slice(inicio, financas.indexOf('\n}\n', inicio));
    assert.match(trecho, /saldoDoCiclo\(i\);[^\n]*\n\s*if \(ajustes\[i\]\) hipotetico -= ajustes\[i\]\.v;/);
    assert.doesNotMatch(trecho, /ajusteDoCiclo\(i\)/);
});

test('REGRAS.md documenta cada correção', () => {
    assert.match(regras, /Aporte\/Resgate já \*\*pago\*\* é dinheiro que de fato se moveu e nunca é reescrito/);
    assert.match(regras, /Só um Materializar\/Consolidar grava por vez/);
    assert.match(regras, /antecipação \*\*já paga\*\* alocada à mesma fatura libera somente o que ela abate/);
    assert.match(regras, /Aportes e resgates reais de `Investimento` \*\*já pagos\*\* até o ciclo definem essa garantia/);
    assert.match(regras, /`Besteira` também é comparada como \*\*item inteiro\*\*/);
    assert.match(regras, /uma gravação real que termina depois de ligar a simulação espera/);
    assert.match(regras, /As linhas reais vão num único `UPDATE` \(tudo ou nada/);
    assert.match(regras, /um termo que não tira nenhuma linha deixa o saldo cinza igual ao sem filtro/);
});
