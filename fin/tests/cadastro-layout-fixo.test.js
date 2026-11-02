// Regressão: no cadastro, trocar Frequência não esconde Vezes — ele fica desativado
// mostrando a contagem da série ("75x até 2032") e, ao tirar a Frequência, volta ao valor
// que tinha. Roda a atualizaModoFrequencia real (js/form.js) com um <select> simulado.
// A troca ativo <-> desativado é animada e o desativado tem visual próprio, bem distinto.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { declaracoes } = require('./helpers/regras-css');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const estilos = fs.readFileSync('css/forms.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');

function selectSimulado(valores) {
  const select = {
    options: [],
    dataset: {},
    disabled: false,
    _valor: valores[0],
    get value() {
      return this._valor;
    },
    set value(v) {
      if (this.options.some((o) => o.value === v)) this._valor = v;
    },
    add(opcao) {
      opcao.parent = this;
      this.options.push(opcao);
    },
    querySelector(seletor) {
      const valor = seletor.match(/value=(\w+)/)[1];

      return this.options.find((o) => o.value === valor) || null;
    },
  };

  valores.forEach((v) => select.add(new Opcao(v, v)));

  return select;
}

function Opcao(texto, valor) {
  this.textContent = texto;
  this.value = valor;
  this.remove = () => {
    this.parent.options = this.parent.options.filter((o) => o !== this);
  };
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
    animaTrocaDeEstado: (s) => animados.push(s),
    el: (id) => campos[id],
    modalNovo: { dataset: editando ? { editandoId: '7' } : {} },
    Option: Opcao,
    DATA_LIMITE_RECORRENCIA: '2032-12-31',
    ocorrenciasAteLimite: () => 75,
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${formulario.slice(inicio, fim)}\nglobalThis.atualizaModoFrequencia = atualizaModoFrequencia;`,
    contexto
  );

  return { campos, animados, atualizaModoFrequencia: contexto.atualizaModoFrequencia };
}

test('com Frequência, Vezes continua visível, desativado, mostrando a contagem até o limite', () => {
  const { campos, atualizaModoFrequencia } = carregaModoFrequencia({
    freq: 'Mensal',
    data: '2026-10-15',
  });

  campos.fParcelas.value = '3';
  atualizaModoFrequencia();
  assert.equal(campos.parcelasLinha.hidden, false);
  assert.equal(campos.fParcelas.disabled, true);
  assert.equal(campos.fParcelas.value, 'serie');
  assert.equal(
    campos.fParcelas.querySelector('option[value=serie]').textContent,
    '75x até 2032'
  );
});

test('sem Data, a contagem pede a data em vez de um número', () => {
  const { campos, atualizaModoFrequencia } = carregaModoFrequencia({
    freq: 'Mensal',
    data: '',
  });

  atualizaModoFrequencia();
  assert.equal(
    campos.fParcelas.querySelector('option[value=serie]').textContent,
    'Escolha a data'
  );
});

test('tirar a Frequência devolve o Vezes anterior, editável, e remove a opção da série', () => {
  const { campos, atualizaModoFrequencia } = carregaModoFrequencia({
    freq: 'Mensal',
    data: '2026-10-15',
  });

  campos.fParcelas.value = '3';
  atualizaModoFrequencia();
  atualizaModoFrequencia(); // chamada repetida (ex.: troca de data) não perde o anterior
  campos.fFreq.value = '';
  atualizaModoFrequencia();
  assert.equal(campos.fParcelas.disabled, false);
  assert.equal(campos.fParcelas.value, '3');
  assert.equal(campos.fParcelas.querySelector('option[value=serie]'), null);
});

test('depois de um reset (série já não selecionada), o valor do reset prevalece', () => {
  const { campos, atualizaModoFrequencia } = carregaModoFrequencia({
    freq: 'Mensal',
    data: '2026-10-15',
  });

  campos.fParcelas.value = '3';
  atualizaModoFrequencia();
  campos.fParcelas.value = '1'; // formNovo.reset() volta à 1ª opção
  campos.fFreq.value = '';
  atualizaModoFrequencia();
  assert.equal(campos.fParcelas.value, '1');
});

test('Editar continua escondendo Vezes e Dividir', () => {
  const { campos, atualizaModoFrequencia } = carregaModoFrequencia({
    freq: '',
    data: '2026-10-15',
    editando: true,
  });

  atualizaModoFrequencia();
  assert.equal(campos.parcelasLinha.hidden, true);
});

test('a contagem acompanha a Data', () => {
  // O ouvinte de mudança da Data (js/form.js) roda com a tela falsa: ele refaz o modo de Vezes antes de qualquer outra coisa.
  const inicio = formulario.indexOf("el('fData').addEventListener('change', () => {");
  const fim = formulario.indexOf('\n});\n', inicio) + 5;
  const chamadas = [];
  let ouvinte;

  vm.runInNewContext(formulario.slice(inicio, fim), {
    el: (id) =>
      id === 'fData'
        ? {
            addEventListener: (_, f) => {
              ouvinte = f;
            },
          }
        : { checked: false },
    atualizaModoFrequencia: () => chamadas.push('modo'),
  });
  ouvinte();
  assert.deepEqual(chamadas, ['modo']);
});

test('exceção pontual registrada em DECISOES.md, sem mudar a direção minimalista', () => {
  assert.match(
    decisoes,
    /## Cadastro com layout fixo\s*\n\s*\nExceção pontual, sem mudar a direção minimalista: no cadastro, trocar Crédito ou Frequência desativa campos em vez de escondê-los/
  );
  assert.match(
    decisoes,
    /Os demais formulários seguem a regra geral de mostrar só o necessário\./
  );
});

test('anima Vezes só quando ele realmente troca entre ativo e desativado', () => {
  const { campos, animados, atualizaModoFrequencia } = carregaModoFrequencia({
    freq: 'Mensal',
    data: '2026-10-15',
  });

  atualizaModoFrequencia();
  atualizaModoFrequencia(); // mesma Frequência, só a data mudou: não anima de novo
  assert.equal(animados.length, 1);
  campos.fFreq.value = '';
  atualizaModoFrequencia();
  assert.equal(animados.length, 2);
});

// O seletor da Fatura (#faturaPrincipal) é recriado a cada chamada: só a troca real entre desativado e ativo anima.
// Roda atualizarFaturasDoFormulario e animaTrocaDeEstado de js/form.js com a tela falsa.
function atualizaFatura({ desativadaAntes, cred, modalAberto = true }) {
  const trecho = (nome) => {
    const inicio = formulario.indexOf('function ' + nome + '(');

    return formulario.slice(inicio, formulario.indexOf('\n}\n', inicio) + 3);
  };

  const novoSelect = (desativado) => {
    const select = {
      desativado,
      classes: new Set(),
      ouvintes: {},
      offsetWidth: 1,
      classList: {
        add: (c) => select.classes.add(c),
        remove: (c) => select.classes.delete(c),
      },
      addEventListener: (tipo, f) => {
        select.ouvintes[tipo] = f;
      },
    };

    return select;
  };

  const principal = {
    select: novoSelect(desativadaAntes),
    set innerHTML(html) {
      this.select = novoSelect(html.startsWith('<select disabled'));
    },
    querySelector(seletor) {
      return seletor === 'select:disabled' && !this.select.desativado
        ? null
        : this.select;
    },
  };

  const campos = {
    faturaPrincipal: principal,
    faturasPorParcela: {},
    fFaturasMais: { classList: { toggle() {} } },
    fCred: { checked: cred },
    fCateg: { value: '' },
    fFreq: { value: '' },
    fParcelas: { value: '1' },
    fData: { value: '2026-10-15' },
  };

  const contexto = {
    el: (id) => campos[id],
    modalNovo: { open: modalAberto },
    CARTAO_NUBANK: 'nubank',
    idsFaturasDoFormulario: () => [],
    ehAntecipacaoFatura: () => false,
    opcoesFaturasDisponiveis: () => [],
    faturasSugeridasParaParcelas: () => [],
    cartaoDaFatura: () => 'nubank',
    tituloDaPrimeiraFatura: () => '',
    seletoresDeFatura: () => [],
    dataISO: (v) => v,
    timestamp: () => 0,
  };

  vm.runInNewContext(
    trecho('animaTrocaDeEstado') +
      trecho('atualizarFaturasDoFormulario') +
      'atualizarFaturasDoFormulario();',
    contexto
  );

  return principal.select;
}

test('Fatura anima só na troca real: recriar o seletor no mesmo estado não pisca', () => {
  const anima = (config) => atualizaFatura(config).classes.has('trocaEstado');

  // Débito comum: o seletor vira desativado; só anima se antes estava ativo
  assert.equal(anima({ desativadaAntes: false, cred: false }), true);
  assert.equal(anima({ desativadaAntes: true, cred: false }), false);
  // Crédito: o seletor vira ativo; só anima se antes estava desativado
  assert.equal(anima({ desativadaAntes: true, cred: true }), true);
  assert.equal(anima({ desativadaAntes: false, cred: true }), false);
  // Com o cadastro fechado (abrindo), o estado inicial aparece direto
  assert.equal(anima({ desativadaAntes: false, cred: false, modalAberto: false }), false);
});

test('a classe da animação sai no fim dela, pra não reanimar ao reabrir o cadastro', () => {
  const select = atualizaFatura({ desativadaAntes: false, cred: false });

  assert.equal(select.classes.has('trocaEstado'), true);
  select.ouvintes.animationend();
  assert.equal(select.classes.has('trocaEstado'), false);
});

test('desativado tem visual próprio (mais escuro, tracejado, sem setinha) e a animação respeita movimento reduzido', () => {
  const base = '.fm select.trocaEstado';

  assert.deepEqual(declaracoes(estilos, `${base}:disabled`, ''), [
    'animation: desativaCampo 0.35s ease-out',
  ]);
  assert.deepEqual(declaracoes(estilos, `${base}:enabled`, ''), [
    'animation: ativaCampo 0.35s ease-out',
  ]);
  // Movimento reduzido desliga a animação dos dois estados
  const reduzido = '@media (prefers-reduced-motion: reduce)';

  assert.deepEqual(declaracoes(estilos, `${base}:disabled`, reduzido), [
    'animation: none',
  ]);
  assert.deepEqual(declaracoes(estilos, `${base}:enabled`, reduzido), [
    'animation: none',
  ]);
  assert.match(
    regras,
    /Campo desativado pelo modo fica mais escuro que o painel, com texto apagado, borda tracejada e sem a setinha/
  );
});
