// Compra nova no Crédito: o cadastro mostra o Livre Hoje do cartão antes → depois dela,
// com a mesma regra do título (limiteLivreHojeDoCartao, regra única em finance.js).
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { elementoPorId } = require('./helpers/html');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const financas = fs.readFileSync('js/finance.js', 'utf8');
const pagina = fs.readFileSync('index.html', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

const trecho = (fonte, assinatura) => {
  const inicio = fonte.indexOf(assinatura);

  return fonte.slice(inicio, fonte.indexOf('\n}\n', inicio) + 3);
};

// Roda conferirLimiteNoCadastro com um formulário falso e Livre Hoje fixo por cartão.
function conferir({
  valor = 'R$ 1.000,00',
  cred = true,
  positivo = false,
  fatura = '2026-11-12',
  freq = '',
  vezes = '1',
  dividir = true,
  editando = false,
  livre = { nubank: 2000, mp: 500 },
} = {}) {
  const aviso = { hidden: true, className: '', title: '', innerHTML: '' };

  const campos = {
    fLimiteCartao: aviso,
    fValor: { value: valor },
    fFreq: { value: freq },
    fParcelas: { value: vezes },
    fCred: { checked: cred },
    fDivide: { checked: dividir },
    modalNovo: { dataset: editando ? { editandoId: '9' } : {} },
  };

  const chamadas = [];

  const ctx = {
    el: (id) => campos[id],
    sinalPositivo: positivo,
    TOLERANCIA_FINANCEIRA: 0.005,
    Estado: { idxHoje: 3, lancamentos: [] },
    NOME_CARTAO: { nubank: 'Nubank', mp: 'Mercado Pago' },
    idsFaturasDoFormulario: () => [fatura],
    cartaoDaFatura: (f) => (String(f).endsWith('-13') ? 'mp' : 'nubank'),
    limiteLivreHojeDoCartao: (linhas, idx, cartao) => {
      chamadas.push([idx, cartao]);

      return livre[cartao];
    },
    brl: (v) => `R$ ${v.toFixed(2)}`,
    corValor: (v) => (v < 0 ? 'vm' : v > 0 ? 'vd' : ''),
  };

  vm.runInNewContext(
    [
      trecho(formulario, 'function valorMascaraParaNumero(textoMascarado) {'),
      trecho(formulario, 'function conferirLimiteNoCadastro() {'),
      'conferirLimiteNoCadastro();',
    ].join('\n'),
    ctx
  );

  return { aviso, chamadas };
}

test('mostra o Livre Hoje do cartão da 1ª fatura antes → depois, no ciclo atual', () => {
  const { aviso, chamadas } = conferir();

  assert.equal(aviso.hidden, false);
  assert.deepEqual(JSON.parse(JSON.stringify(chamadas)), [[3, 'nubank']]);
  assert.equal(aviso.innerHTML, 'Livre Nubank R$ 2000.00 → <b class="vd">R$ 1000.00</b>');
  assert.doesNotMatch(aviso.className, /semLimite/);
});

test('o banco bloqueia o total: dividido é o valor; sem dividir, valor × Vezes; com Frequência, uma ocorrência', () => {
  assert.match(
    conferir({ vezes: '10', dividir: true }).aviso.innerHTML,
    /→ <b class="vd">R\$ 1000\.00<\/b>/
  );
  const repetido = conferir({ vezes: '3', dividir: false, valor: 'R$ 500,00' }).aviso; // 1.500 de 2.000

  assert.match(repetido.innerHTML, /→ <b class="vd">R\$ 500\.00<\/b>/);
  assert.match(
    conferir({ freq: 'Mensal', vezes: '1', dividir: false, valor: 'R$ 500,00' }).aviso
      .innerHTML,
    /→ <b class="vd">R\$ 1500\.00<\/b>/
  );
});

test('sem limite: vermelho e "sem limite"; cartão pelo dia da fatura (13 = Mercado Pago)', () => {
  const { aviso } = conferir({ fatura: '2026-11-13' });

  assert.match(aviso.className, /semLimite/);
  assert.equal(
    aviso.innerHTML,
    'Livre Mercado Pago R$ 500.00 → <b class="vm">R$ -500.00</b> · sem limite'
  );
});

test('escondido fora de compra nova no Crédito', () => {
  assert.equal(conferir({ cred: false }).aviso.hidden, true);
  assert.equal(conferir({ positivo: true }).aviso.hidden, true);
  assert.equal(conferir({ valor: '' }).aviso.hidden, true);
  assert.equal(conferir({ fatura: null }).aviso.hidden, true);
  assert.equal(conferir({ editando: true }).aviso.hidden, true);
});

// A conta única do Livre Hoje: a função real, com as peças de que depende simuladas, recebe o que cada cartão pede.
function livreHoje(cartao) {
  const chamadas = [];

  const ctx = {
    CARTAO_NUBANK: 'nubank',
    guardadoGarantidoAte: (linhas, idx) => `guardado@${idx}`,
    garantiaDoCiclo: (idx, guardado) => ({
      efetiva: guardado === 'guardado@4' ? 700 : -1,
    }),
    ehTransferenciaFatura: (r) => r.antecipacao === true,
    alocacaoAntecipacoes: (linhas) => ({ pagas: linhas.map((r) => r.id) }),
    abatimentoDoCartao: (abatido, c) => `abate:${c}:${abatido.pagas.join('+')}`,
    aprovadoDoCiclo: (idx, c) => `aprovado:${idx}:${c}`,
    limiteCartaoLivre: (...args) => {
      chamadas.push(args);

      return 123;
    },
  };

  const linhas = [
    { id: 1 },
    { id: 2, antecipacao: true, pago: false }, // antecipação em aberto: fica de fora
    { id: 3, antecipacao: true, pago: true },
  ];

  vm.runInNewContext(
    `${trecho(financas, 'function limiteLivreHojeDoCartao(linhas, idx, cartao) {')}\nthis.r = limiteLivreHojeDoCartao(linhas, 4, cartao);`,
    Object.assign(ctx, { linhas, cartao })
  );

  return { retorno: ctx.r, chamadas: JSON.parse(JSON.stringify(chamadas)), linhas };
}

test('regra única do Livre Hoje: o Nubank conta a garantia do ciclo, o Mercado Pago não', () => {
  const nubank = livreHoje('nubank');

  assert.equal(nubank.retorno, 123);
  assert.deepEqual(nubank.chamadas, [
    [nubank.linhas, 'abate:nubank:1+3', 700, null, 'nubank', 'aprovado:4:nubank'],
  ]);

  const mp = livreHoje('mp');

  assert.deepEqual(mp.chamadas, [
    [mp.linhas, 'abate:mp:1+3', 0, null, 'mp', 'aprovado:4:mp'],
  ]);
});

test('os gatilhos do aviso: valor, Crédito/Vezes/Dividir e qualquer mudança do formulário', () => {
  const conferir = () => chamadas.push('conferir');
  let chamadas = [];

  // atualizaSinalUI (todo lugar que muda o valor passa por ela) atualiza as parcelas e confere o limite
  const sinal = { disabled: null, classList: { toggle() {} }, textContent: '' };

  vm.runInNewContext(
    `${trecho(formulario, 'function atualizaSinalUI() {')}\natualizaSinalUI();`,
    {
      el: (id) => (id === 'fSinal' ? sinal : { value: '50' }),
      valorMascaraParaNumero: () => 50,
      sinalPositivo: false,
      atualizarParcelaNasVezes: () => chamadas.push('parcelas'),
      conferirLimiteNoCadastro: conferir,
    }
  );
  assert.deepEqual(chamadas, ['parcelas', 'conferir']);

  // trocar Crédito/Dividir (sugereModoValorParcelas) também confere
  chamadas = [];
  vm.runInNewContext(
    `${trecho(formulario, 'function sugereModoValorParcelas() {')}\nsugereModoValorParcelas();`,
    {
      el: () => ({ checked: true }),
      atualizarParcelaNasVezes: () => chamadas.push('parcelas'),
      conferirLimiteNoCadastro: conferir,
    }
  );
  assert.deepEqual(chamadas, ['parcelas', 'conferir']);

  // o formulário inteiro: qualquer change nele (Fatura, Frequência…) refaz a conferência
  chamadas = [];
  const ouvintes = [];
  const linha = "el('formNovo').addEventListener('change'";
  const inicio = formulario.indexOf(linha);

  vm.runInNewContext(formulario.slice(inicio, formulario.indexOf('\n', inicio)), {
    el: (id) => ({
      addEventListener: (tipo, fn) => ouvintes.push([id, tipo, fn]),
    }),
    conferirLimiteNoCadastro: conferir,
  });
  assert.deepEqual(
    ouvintes.map(([id, tipo]) => [id, tipo]),
    [['formNovo', 'change']]
  );
  ouvintes[0][2]();
  assert.deepEqual(chamadas, ['conferir']);
  assert.match(regras, /\*\*Limite na hora da compra:\*\* num cadastro novo no Crédito/);
});

test('o aviso do limite existe na página, escondido até a conta decidir mostrar', () => {
  assert.deepEqual(elementoPorId(pagina, 'fLimiteCartao'), {
    tag: 'small',
    attrs: { id: 'fLimiteCartao', class: 'limiteNoCadastro', hidden: '' },
  });
});
