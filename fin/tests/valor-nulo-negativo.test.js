// Regressão: pra um lançamento de verdade, zero conta como NEGATIVO na tela — tanto o "sem
// valor ainda" (NULL no banco) quanto um zero gravado de propósito. Só estritamente
// positivo pinta de verde. Cobre também o bug seguinte: editar o Valor de uma linha que a
// tela já mostrava vermelha (negativa ou zero) não pode salvar como positivo por engano.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const compartilhado = fs.readFileSync('js/shared.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Extrai corValorLancamento/celValorLancamento/celValorEditavel do arquivo real e roda num
// contexto isolado, com os poucos globais de que dependem simulados.
function carregaCelulasDeValor() {
    const inicio = compartilhado.indexOf('const valorMonetarioExibivel');
    const fim = compartilhado.indexOf('\n};', compartilhado.indexOf('const celValorSomenteLeitura')) + 3;
    if (inicio < 0 || fim < 3) throw Error('Não encontrou as células de valor em shared.js.');
    const contexto = { escapeHtml: v => String(v) };
    vm.createContext(contexto);
    vm.runInContext(`${compartilhado.slice(inicio, fim)}
globalThis.corValorLancamento = corValorLancamento;
globalThis.celValorLancamento = celValorLancamento;
globalThis.celValorEditavel = celValorEditavel;
globalThis.celValorSomenteLeitura = celValorSomenteLeitura;`, contexto);
    return {
        corValorLancamento: contexto.corValorLancamento,
        celValorLancamento: contexto.celValorLancamento,
        celValorEditavel: contexto.celValorEditavel,
        celValorSomenteLeitura: contexto.celValorSomenteLeitura,
    };
}

test('valor NULO (nunca definido) conta como negativo na célula não editável (Backlog incluso)', () => {
    const { corValorLancamento, celValorLancamento } = carregaCelulasDeValor();
    const semValor = { valor: null, v: 0 };
    assert.equal(corValorLancamento(semValor), 'vm');
    assert.match(celValorLancamento(semValor), /class="n vm"/);
    assert.match(celValorLancamento(semValor), />R\$\s?0,00$/);
});

test('valor realmente zero (gravado assim de propósito, não null) TAMBÉM conta como negativo', () => {
    const { corValorLancamento } = carregaCelulasDeValor();
    assert.equal(corValorLancamento({ valor: 0, v: 0 }), 'vm');
});

test('linha sintética (fat:/sal:/res:/sug:/abt:) mantém as 3 cores normais (corValor), não é forçada a negativo', () => {
    const { corValorLancamento } = carregaCelulasDeValor();
    assert.equal(corValorLancamento({ _sid: 'sal:0', v: 0 }), '');
    assert.equal(corValorLancamento({ _sid: 'sal:0', v: 50 }), 'vd');
    assert.equal(corValorLancamento({ _sid: 'sal:0', v: -50 }), 'vm');
});

test('valor negativo/positivo de verdade continuam vm/vd normalmente', () => {
    const { corValorLancamento } = carregaCelulasDeValor();
    assert.equal(corValorLancamento({ valor: -50, v: -50 }), 'vm');
    assert.equal(corValorLancamento({ valor: 50, v: 50 }), 'vd');
});

test('célula editável: sem valor (null) ou zero de verdade mostram "−" vermelho, nunca "+" verde', () => {
    const { celValorEditavel } = carregaCelulasDeValor();
    for (const r of [{ id: 7, valor: null, v: 0 }, { id: 7, valor: 0, v: 0 }]) {
        const html = celValorEditavel(r);
        assert.match(html, /class="n vm"/);
        assert.match(html, /class="sinalBt compacto"/);   // sem ' pos': fica vermelho/negativo
        assert.doesNotMatch(html, /class="sinalBt compacto pos"/);
        assert.match(html, />−</);
    }
});

test('célula editável: valor positivo de verdade continua mostrando "+" verde normalmente', () => {
    const { celValorEditavel } = carregaCelulasDeValor();
    const html = celValorEditavel({ id: 7, valor: 50, v: 50 });
    assert.match(html, /class="sinalBt compacto pos"/);
    assert.match(html, />\+</);
});

test('Débito/Crédito (linha não editável) e o detalhamento de categoria do gráfico usam celValorLancamento, não a antiga celValor genérica', () => {
    // Conta restrita: texto puro. Fora dela, real edita e calculada/simulada fica só leitura.
    assert.match(tabelas, /\? \(modoRestrito\(\)\s*\n\s*\? \(r\._sug != null \? `<td class="n \$\{corValor\(r\._sug\)\}">\$\{brl\(r\._sug\)\}` : celValorLancamento\(r\)\)/);
    assert.match(tabelas, /: ehLinhaReal\(r\) \? celValorEditavel\(r\) : celValorSomenteLeitura\(r\)\)/);
    assert.match(graficos, /\$\{celNome\(r\)\}\$\{celValorLancamento\(r\)\}/);
    assert.doesNotMatch(compartilhado, /const celValor = /);
});

// Extrai só a decisão de sinal (sem tocar DOM/Estado real) do handler de clique no Valor:
// dado r.v, "negativo" decide se o número digitado entra como negativo ao confirmar.
function decideSinalEdicaoValor(v) {
    const inicio = interacoes.indexOf('    const bruto = Math.abs(r.v || 0);');
    const fim = interacoes.indexOf("span.classList.add('editando');", inicio);
    if (inicio < 0 || fim < 0) throw Error('Não encontrou o cálculo de "negativo" no toggle de Valor.');
    const corpo = interacoes.slice(inicio, fim);
    const contexto = { valorMonetarioExibivel: x => (Math.abs(Number(x) || 0) < 0.005 ? 0 : Number(x)) };
    vm.createContext(contexto);
    vm.runInContext(`function decide(r) {\n${corpo}\n    return negativo;\n}\nglobalThis.decide = decide;`, contexto);
    return contexto.decide({ v });
}

test('editar o Valor de uma linha negativa ou zero/nula (tela já vermelha) mantém negativo ao confirmar, sem usar o botão de sinal', () => {
    assert.equal(decideSinalEdicaoValor(0), true);     // zero/nulo (r.v já virou 0 nos dois casos)
    assert.equal(decideSinalEdicaoValor(-50), true);   // já negativo
    assert.equal(decideSinalEdicaoValor(50), false);   // estritamente positivo: continua positivo
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /zero conta como negativo na aparência/);
    assert.match(regras, /só estritamente positivo \(`> 0`\) pinta de verde; negativo ou zero ficam vermelhos/);
    assert.match(regras, /confirmar sem usar o botão de sinal mantém negativo, nunca vira positivo por engano/);
});

test('linha calculada mostra o botão de sinal desabilitado e o valor sem edição', () => {
    const { celValorSomenteLeitura } = carregaCelulasDeValor();
    const fatura = celValorSomenteLeitura({ id: -3, _sid: 'fat:1', v: -500 });
    assert.match(fatura, /^<td class="n vm"><span class=valorLinha><button type=button class="sinalBt compacto" disabled title="Somente leitura" aria-label="Sinal \(somente leitura\)">−<\/button><span class=valorFixo>/);
    assert.doesNotMatch(fatura, /data-tog-/);
    // Aporte sugerido usa o próprio valor sugerido e a cor que a tela já dava a ele.
    const sugerido = celValorSomenteLeitura({ id: -5, _sid: 'sug:1', _sug: 300 }, 300, 'vd');
    assert.match(sugerido, /^<td class="n vd">.*class="sinalBt compacto pos" disabled[^>]*>\+<\/button>/);
    assert.doesNotMatch(sugerido, /data-tog-/);
});

test('ao lado do botão de sinal o número aparece sem "-"; sem botão, o sinal continua', () => {
    const { celValorEditavel, celValorSomenteLeitura, celValorLancamento } = carregaCelulasDeValor();
    const despesa = { id: 7, valor: -1500, v: -1500 };
    const editavel = celValorEditavel(despesa);
    assert.match(editavel, />−<\/button>/);
    assert.match(editavel, /title="Editar valor">R\$\s?1\.500,00<\/span>/);
    assert.match(celValorSomenteLeitura({ id: -3, _sid: 'fat:1', v: -500 }), /<span class=valorFixo>R\$\s?500,00<\/span>/);
    // Só apresentação: a linha segue negativa, e sem botão (conta restrita) o "-" fica.
    assert.equal(despesa.v, -1500);
    assert.match(celValorLancamento(despesa), />-R\$\s?1\.500,00$/);
});
