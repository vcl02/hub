// Máscara de R$ nos campos de dinheiro: "R$" fixo dentro da caixa (cadastro, edição do Valor
// na tabela, metas) e a mesma máscara de caixa eletrônico do cadastro (formataMascaraDinheiro).
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { etiquetas } = require('./helpers/html');
const { declaracoes } = require('./helpers/regras-css');
const { carregarTela } = require('./helpers/tela-sem-navegador');

const ler = (arquivo) => fs.readFileSync(arquivo, 'utf8');
const pagina = ler('index.html');
const interacoes = ler('js/interactions.js');

assert.ok(ler('js/cycle-views.js'), 'js/cycle-views.js existe');
const formularios = ler('css/forms.css');
const regras = ler('docs/REGRAS.md');

// Pega o ouvinte que um trecho de js/interactions.js registra em `el(id).addEventListener(tipo, …)`, rodando o trecho
// de verdade dentro da tela sem navegador (as funções da máscara vêm do js/form.js real).
function ouvinteDe(tela, inicioDoTrecho, id, tipo) {
  const inicio = interacoes.indexOf(inicioDoTrecho);
  const fim = interacoes.indexOf('\n});\n', inicio) + 5;
  const alvo = tela.ctx.document.getElementById(id);
  let ouvinte;

  alvo.addEventListener = (t, fn) => {
    if (t === tipo) ouvinte = fn;
  };

  vm.runInContext(interacoes.slice(inicio, fim), tela.ctx);

  return ouvinte;
}

const campoFalso = (valor) => {
  const campo = {
    value: valor,
    selectionEnd: valor.length, // cursor no fim
    posicoes: [],
    ouvintes: {},
    addEventListener: (tipo, fn) => (campo.ouvintes[tipo] = fn),
    setSelectionRange: (a, b) => campo.posicoes.push([a, b]),
    focus() {},
    select() {},
  };

  return campo;
};

test('cadastro: "R$" fixo dentro da caixa do Valor, antes do campo', () => {
  const tags = etiquetas(pagina);
  const caixa = tags.findIndex((t) => t.attrs.class === 'moneyWrap');

  assert.deepEqual(tags.slice(caixa, caixa + 3), [
    { tag: 'div', attrs: { class: 'moneyWrap' } },
    { tag: 'span', attrs: { class: 'dinheiroPrefixo', 'aria-hidden': 'true' } },
    {
      tag: 'input',
      attrs: {
        type: 'text',
        inputmode: 'numeric',
        id: 'fValor',
        placeholder: '0,00',
        autocomplete: 'off',
      },
    },
  ]);
  assert.ok(
    declaracoes(formularios, '.moneyWrap .dinheiroPrefixo').includes('align-self: center')
  );
});

test('edição do Valor na tabela: caixa .dinheiro com "R$" e a máscara do cadastro', async () => {
  const tela = carregarTela();

  const ouvinte = ouvinteDe(
    tela,
    "el('out').addEventListener('click', (e) => {\n  const span = e.target.closest('[data-tog-valor]');",
    'out',
    'click'
  );

  tela.bruto('Estado').lancamentos = [{ id: '5', v: -1234.5, valor: -1234.5 }];

  const campo = campoFalso('');

  const span = {
    classList: { contains: () => false, add() {} },
    dataset: { togValor: '5' },
    innerHTML: '',
    querySelector: () => campo,
  };

  ouvinte({ target: { closest: () => span }, stopImmediatePropagation() {} });

  // O valor entra mascarado (centavos) dentro da caixa .dinheiro, com o "R$" fixo na frente
  assert.equal(
    span.innerHTML,
    '<span class="inpValor dinheiro"><span class=dinheiroPrefixo aria-hidden=true>R$</span>' +
      '<input type=text inputmode=numeric aria-label="Valor" value="1.234,50" placeholder="0,00"></span>'
  );

  // Digitando, o campo mantém a máscara de caixa eletrônico e o cursor no fim
  campo.value = '123456';
  campo.selectionEnd = campo.value.length;
  campo.ouvintes.input();
  assert.equal(campo.value, '1.234,56');
  assert.deepEqual(campo.posicoes, [[8, 8]]);

  // A caixa é o span; o input fica transparente dentro, e o foco aparece na caixa.
  assert.ok(
    declaracoes(formularios, '.dinheiro > input').includes('background: transparent')
  );
  assert.ok(declaracoes(formularios, '.dinheiro > input').includes('border: 0'));
  assert.deepEqual(declaracoes(formularios, '.dinheiro:focus-within'), [
    'outline: 2px solid var(--fg)',
    'outline-offset: -1px',
  ]);
});

test('metas: Valor total e Entrada com "R$" e máscara de caixa eletrônico; vazio fica vazio', () => {
  const tela = carregarTela();

  const ouvinte = ouvinteDe(
    tela,
    "el('corpoMetas').addEventListener('input', (e) => {",
    'corpoMetas',
    'input'
  );

  const digita = (digitado) => {
    const campo = campoFalso(digitado);

    // só o campo de dinheiro responde a closest('[data-dinheiro]'); o de Vezes não é este
    ouvinte({ target: { closest: (sel) => (sel === '[data-dinheiro]' ? campo : null) } });

    return campo;
  };

  assert.equal(digita('150000').value, '1.500,00');
  assert.deepEqual(digita('150000').posicoes, [[8, 8]]);
  assert.equal(digita('0,5').value, '0,05');
  assert.equal(digita('abc').value, ''); // apagar tudo deixa vazio (sem entrada), nunca "0,00"
  assert.equal(digita('').value, '');

  // Fora de um campo de dinheiro, nada acontece
  assert.equal(ouvinte({ target: { closest: () => null } }), undefined);

  // O valor mascarado ("1.500,00") volta a número pela mesma leitura dos limites.
  const trecho = interacoes.slice(
    interacoes.indexOf('function numeroDoLimiteDigitado('),
    interacoes.indexOf('\n}\n', interacoes.indexOf('function numeroDoLimiteDigitado(')) +
      3
  );

  const numeroDoLimiteDigitado = new Function(
    `${trecho}; return numeroDoLimiteDigitado;`
  )();

  assert.equal(numeroDoLimiteDigitado('1.500,00'), 1500);
  assert.equal(numeroDoLimiteDigitado('0,50'), 0.5);
});

test('REGRAS.md documenta a máscara de R$', () => {
  assert.match(
    regras,
    /Todo campo de dinheiro tem \*\*máscara de R\$\*\*: o "R\$" fixo à esquerda, dentro da própria caixa/
  );
  assert.match(regras, /no Valor total e na Entrada das metas/);
});
