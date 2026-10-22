// Regressão: no cadastro, trocar Frequência não esconde Vezes — ele fica desativado
// mostrando a contagem da série ("75x até 2032") e, ao tirar a Frequência, volta ao valor
// que tinha. Roda a atualizaModoFrequencia real (js/form.js) com um <select> simulado.
// A troca ativo <-> desativado é animada e o desativado tem visual próprio, bem distinto.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const estilos = fs.readFileSync('css/forms.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');

function selectSimulado(valores) {
    const select = {
        options: [], dataset: {}, disabled: false, _valor: valores[0],
        get value() { return this._valor; },
        set value(v) { if (this.options.some(o => o.value === v)) this._valor = v; },
        add(opcao) { opcao.parent = this; this.options.push(opcao); },
        querySelector(seletor) {
            const valor = seletor.match(/value=(\w+)/)[1];
            return this.options.find(o => o.value === valor) || null;
        },
    };
    valores.forEach(v => select.add(new Opcao(v, v)));
    return select;
}

function Opcao(texto, valor) {
    this.textContent = texto;
    this.value = valor;
    this.remove = () => { this.parent.options = this.parent.options.filter(o => o !== this); };
}

function carregaModoFrequencia({ freq, data, editando }) {
    const inicio = formulario.indexOf('function atualizaModoFrequencia() {');
    const fim = formulario.indexOf('\n}\n', inicio) + 3;
    if (inicio < 0) throw Error('Não encontrou atualizaModoFrequencia.');
    const campos = {
        fParcelas: selectSimulado(['1', '2', '3']),
        fFreq: { value: freq },
        fData: { value: data },
        parcelasLinha: { hidden: false },
    };
    const animados = [];
    const contexto = {
        animaTrocaDeEstado: s => animados.push(s),
        el: id => campos[id],
        modalNovo: { dataset: editando ? { editandoId: '7' } : {} },
        Option: Opcao,
        DATA_LIMITE_RECORRENCIA: '2032-12-31',
        ocorrenciasAteLimite: () => 75,
    };
    vm.createContext(contexto);
    vm.runInContext(`${formulario.slice(inicio, fim)}\nglobalThis.atualizaModoFrequencia = atualizaModoFrequencia;`, contexto);
    return { campos, animados, atualizaModoFrequencia: contexto.atualizaModoFrequencia };
}

test('com Frequência, Vezes continua visível, desativado, mostrando a contagem até o limite', () => {
    const { campos, atualizaModoFrequencia } = carregaModoFrequencia({ freq: 'Mensal', data: '2026-10-15' });
    campos.fParcelas.value = '3';
    atualizaModoFrequencia();
    assert.equal(campos.parcelasLinha.hidden, false);
    assert.equal(campos.fParcelas.disabled, true);
    assert.equal(campos.fParcelas.value, 'serie');
    assert.equal(campos.fParcelas.querySelector('option[value=serie]').textContent, '75x até 2032');
});

test('sem Data, a contagem pede a data em vez de um número', () => {
    const { campos, atualizaModoFrequencia } = carregaModoFrequencia({ freq: 'Mensal', data: '' });
    atualizaModoFrequencia();
    assert.equal(campos.fParcelas.querySelector('option[value=serie]').textContent, 'Escolha a data');
});

test('tirar a Frequência devolve o Vezes anterior, editável, e remove a opção da série', () => {
    const { campos, atualizaModoFrequencia } = carregaModoFrequencia({ freq: 'Mensal', data: '2026-10-15' });
    campos.fParcelas.value = '3';
    atualizaModoFrequencia();
    atualizaModoFrequencia();   // chamada repetida (ex.: troca de data) não perde o anterior
    campos.fFreq.value = '';
    atualizaModoFrequencia();
    assert.equal(campos.fParcelas.disabled, false);
    assert.equal(campos.fParcelas.value, '3');
    assert.equal(campos.fParcelas.querySelector('option[value=serie]'), null);
});

test('depois de um reset (série já não selecionada), o valor do reset prevalece', () => {
    const { campos, atualizaModoFrequencia } = carregaModoFrequencia({ freq: 'Mensal', data: '2026-10-15' });
    campos.fParcelas.value = '3';
    atualizaModoFrequencia();
    campos.fParcelas.value = '1';   // formNovo.reset() volta à 1ª opção
    campos.fFreq.value = '';
    atualizaModoFrequencia();
    assert.equal(campos.fParcelas.value, '1');
});

test('Editar continua escondendo Vezes e Dividir', () => {
    const { campos, atualizaModoFrequencia } = carregaModoFrequencia({ freq: '', data: '2026-10-15', editando: true });
    atualizaModoFrequencia();
    assert.equal(campos.parcelasLinha.hidden, true);
});

test('a contagem acompanha a Data', () => {
    assert.match(formulario, /el\('fData'\)\.addEventListener\('change', \(\) => \{\s*\n\s*atualizaModoFrequencia\(\);/);
});

test('exceção pontual registrada em DECISOES.md, sem mudar a direção minimalista', () => {
    assert.match(decisoes, /## Cadastro com layout fixo\s*\n\s*\nExceção pontual, sem mudar a direção minimalista: no cadastro, trocar Crédito ou Frequência desativa campos em vez de escondê-los/);
    assert.match(decisoes, /Os demais formulários seguem a regra geral de mostrar só o necessário\./);
});

test('anima Vezes só quando ele realmente troca entre ativo e desativado', () => {
    const { campos, animados, atualizaModoFrequencia } = carregaModoFrequencia({ freq: 'Mensal', data: '2026-10-15' });
    atualizaModoFrequencia();
    atualizaModoFrequencia();   // mesma Frequência, só a data mudou: não anima de novo
    assert.equal(animados.length, 1);
    campos.fFreq.value = '';
    atualizaModoFrequencia();
    assert.equal(animados.length, 2);
});

test('Fatura anima só na troca real: recriar o seletor no mesmo estado não pisca', () => {
    assert.match(formulario, /const estavaDesativada = !!principal\.querySelector\('select:disabled'\);/);
    assert.match(formulario, /if \(!estavaDesativada\) animaTrocaDeEstado\(principal\.querySelector\('select'\)\);/);
    assert.match(formulario, /if \(estavaDesativada\) animaTrocaDeEstado\(principal\.querySelector\('select'\)\);/);
    // Sem animar ao abrir o cadastro, e a classe sai no fim pra não reanimar ao reabrir.
    assert.match(formulario, /if \(!modalNovo\.open \|\| !select\) return;/);
    assert.match(formulario, /select\.addEventListener\('animationend', \(\) => select\.classList\.remove\('trocaEstado'\), \{ once: true \}\);/);
});

test('desativado tem visual próprio (mais escuro, tracejado, sem setinha) e a animação respeita movimento reduzido', () => {
    assert.match(estilos, /\.fm select:disabled \{\s*\n\s*color: var\(--mu\);\s*\n\s*background-color: var\(--bg\);\s*\n\s*background-image: none;\s*\n\s*border-style: dashed;\s*\n\s*opacity: \.7;\s*\n\s*\}/);
    assert.match(estilos, /\.fm select\.trocaEstado:disabled \{\s*\n\s*animation: desativaCampo \.35s ease-out;/);
    assert.match(estilos, /\.fm select\.trocaEstado:enabled \{\s*\n\s*animation: ativaCampo \.35s ease-out;/);
    assert.match(estilos, /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.fm select\.trocaEstado:disabled,\s*\n\s*\.fm select\.trocaEstado:enabled \{\s*\n\s*animation: none;/);
    assert.match(regras, /Campo desativado pelo modo fica mais escuro que o painel, com texto apagado, borda tracejada e sem a setinha/);
});
