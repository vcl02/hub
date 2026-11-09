// Regressão: a fatura sugerida no cadastro/simulação é sempre a do MÊS SEGUINTE à data de
// cada prestação (Nubank por padrão), sem depender de existir fatura cadastrada; no
// cadastro e no Duplicar ela fica presa à data.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');
const { ouvinteDe } = require('./helpers/ouvintes');
const { abrirCadastro } = require('./helpers/cadastro');
const { extrairTrecho } = require('./helpers/carregar-funcoes');

const plano = (valor) => JSON.parse(JSON.stringify(valor));

const script = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const inicio = script.indexOf('function faturaDoMesSeguinte(');
const fim = script.indexOf('\n// Credito nao tem mais inferencia por fechamento', inicio);

if (inicio < 0 || fim < 0)
  throw Error('Não encontrou a regra de sugestão de faturas no script.');

const contexto = {
  CARTAO_NUBANK: 'nubank',
  DIA_VENCIMENTO_CARTAO: { nubank: 12, mp: 13 },
  dataISO: (valor) => String(valor).slice(0, 10),
  dataDaOcorrencia: (data, parcela, frequencia) => {
    const d = new Date(`${data}T00:00:00Z`);

    if (frequencia && frequencia !== 'Mensal')
      throw Error('O teste cobre prestações mensais.');
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
  assert.equal(contexto.faturaDoMesSeguinte('2026-12-20'), '2027-01-12'); // virada de ano
  assert.equal(contexto.faturaDoMesSeguinte('2026-10-05', 'mp'), '2026-11-13');
});

test('cada prestação mensal vai pra fatura do mês seguinte à sua própria data', () => {
  assert.deepEqual(sugerir('2026-09-21', 3, 'Mensal'), [
    '2026-10-12',
    '2026-11-12',
    '2026-12-12',
  ]);
  assert.deepEqual(sugerir('2026-09-21', 2, null, 'mp'), ['2026-10-13', '2026-11-13']);
});

test('sem data não há sugestão', () => {
  assert.deepEqual(sugerir('', 2, 'Mensal'), [null, null]);
});

// O seletor de fatura de verdade (atualizarFaturasDoFormulario, de js/form.js) com os scripts do app carregados e a tela falsa.
function desenharFaturas({ simulando, data = '2026-09-21', parcelas = '1' }) {
  const t = carregarTela();

  t.ctx.modalNovo = { open: false };
  trazer(t.ctx, 'js/form.js', [
    'nomeFatura',
    'tituloDaPrimeiraFatura',
    'vencimentosPrevistosDosCartoes',
    'seletoresDeFatura',
    'idsFaturasDoFormulario',
    'opcoesFaturasDisponiveis',
    'faturaDoMesSeguinte',
    'faturasSugeridasParaParcelas',
    'animaTrocaDeEstado',
    'atualizarFaturasDoFormulario',
  ]);
  vm.runInContext(
    extrairTrecho(
      fs.readFileSync('js/form.js', 'utf8'),
      'const rotuloFaturaComCartao',
      'function tituloDaPrimeiraFatura'
    ),
    t.ctx
  );

  const el = t.ctx.document.getElementById;

  t.bruto(`Estado.simulando = ${simulando}`);
  el('fCred').checked = true;
  el('fData').value = data;
  el('fParcelas').value = parcelas;
  t.bruto('atualizarFaturasDoFormulario()');

  return el('faturaPrincipal').innerHTML;
}

test('usa a sugestão também no cadastro real, sem depender da simulação', () => {
  // a mesma 1ª fatura (a do mês seguinte, 12/10) marcada como sugerida, com a simulação ligada ou desligada
  for (const simulando of [false, true]) {
    const seletor = desenharFaturas({ simulando });

    assert.match(seletor, /data-fatura-sugerida="1"/);
    assert.match(seletor, /<option value="2026-10-12">/);
  }

  // sem data, nada é sugerido
  assert.match(
    desenharFaturas({ simulando: false, data: '' }),
    /data-fatura-sugerida="0"/
  );
});

// Trocar a data (evento change do campo Data) refaz as faturas: o ouvinte real de js/form.js com a tela falsa.
function trocarData({ cred = true, editando = false, escolhida = null }) {
  const chamadas = [];

  const { ouvinte } = ouvinteDe(
    'js/form.js',
    'const atual = idsFaturasDoFormulario(true)[0];',
    (registra) => ({
      el: () => ({ addEventListener: registra, checked: cred }),
      atualizaModoFrequencia: () => chamadas.push(['modo']),
      modalNovo: { dataset: editando ? { editandoId: '5' } : {} },
      CARTAO_NUBANK: 'nubank',
      cartaoDaFatura: (fatura) => (fatura.endsWith('-13') ? 'mp' : 'nubank'),
      idsFaturasDoFormulario: (comSugestoes) => [comSugestoes ? escolhida : null],
      atualizarFaturasDoFormulario: (ids, cartao) =>
        chamadas.push(['faturas', ids, cartao]),
    }),
    { evento: 'change' }
  );

  ouvinte();

  return JSON.parse(JSON.stringify(chamadas, (_, v) => (v === undefined ? null : v)));
}

test('cadastro e Duplicar: trocar a data refaz todas as faturas, mantendo só o cartão escolhido', () => {
  // sem escolha: volta ao Nubank; com a 1ª fatura escolhida no Mercado Pago, fica no Mercado Pago (nada escolhido é mantido)
  assert.deepEqual(trocarData({}), [['modo'], ['faturas', [], 'nubank']]);
  assert.deepEqual(trocarData({ escolhida: '2026-11-13' }), [
    ['modo'],
    ['faturas', [], 'mp'],
  ]);
  // débito comum: só a contagem da série muda
  assert.deepEqual(trocarData({ cred: false }), [['modo']]);
  // Editar continua respeitando a fatura gravada da própria linha (sem sugestões novas)
  assert.deepEqual(trocarData({ editando: true }), [['modo'], ['faturas', [null], null]]);
});

test('Duplicar não copia a fatura do original; Editar mantém a da própria linha', () => {
  const original = {
    id: 7,
    nome: 'Sofá',
    categ: 'Casa',
    data: '2026-09-21',
    cred: true,
    fatura: '2026-10-12',
    v: -300,
  };

  const duplicar = abrirCadastro({ prefill: original, modoEdicao: false });
  const editar = abrirCadastro({ prefill: original, modoEdicao: true });

  assert.deepEqual(plano(duplicar.atualizacoesDeFatura[0]), []); // recomeça pela fatura do mês seguinte à data
  assert.deepEqual(plano(editar.atualizacoesDeFatura[0]), ['2026-10-12']);
});

test('regra documentada em REGRAS.md', () => {
  assert.match(
    regras,
    /a fatura sugerida é sempre a do mês seguinte à data de cada prestação/
  );
  assert.match(regras, /Duplicar não copia a fatura do original/);
});

// "Hoje" é uma troca de data como outra qualquer: grava a data de hoje e dispara o mesmo `change` do campo (o ouvinte acima
// refaz a fatura e a contagem da série).
test('o botão Hoje troca a data como qualquer outra: a fatura acompanha', () => {
  const fonte = script;
  const ini = fonte.indexOf("el('fDataHoje').onclick = () => {");
  const fim = fonte.indexOf('\n};\n', ini) + 4;
  const eventos = [];

  const campos = {
    fDataHoje: {},
    fData: { value: '', dispatchEvent: (e) => eventos.push(e.type) },
  };

  const ctx = {
    el: (id) => campos[id],
    hojeISO: () => '2026-10-20',
    Event: class {
      constructor(tipo) {
        this.type = tipo;
      }
    },
  };

  vm.runInNewContext(fonte.slice(ini, fim), ctx);
  ctx.el('fDataHoje').onclick();
  assert.equal(campos.fData.value, '2026-10-20');
  assert.deepEqual(eventos, ['change']);
  assert.match(regras, /digitando, no calendário ou pelo botão \*\*Hoje\*\*/);
});
