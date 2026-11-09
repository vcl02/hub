// Regressão: ao MARCAR como pago um Débito real (nunca ao desmarcar, nunca Crédito), a data
// é ajustada automaticamente pra hoje quando o vencimento ainda não chegou mas cai no MESMO
// ciclo; fora do ciclo atual, pede confirmação antes em vez de aplicar direto.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('a confirmação ao marcar pago fora do ciclo é a 2ª caixa nativa permitida, documentada em REGRAS.md', () => {
  assert.match(regras, /As únicas caixas nativas (`confirm()`) permitidas são:/);
  assert.match(
    regras,
    /a confirmação ao marcar como pago um Débito cuja data cai fora do ciclo atual/
  );
});

// O clique inteiro no selo Pago/Aberto (js/interactions.js), com a tela e a gravação falsas: o que vai no PATCH e
// o que muda na linha depois dele. A decisão da data (acima) é conferida em `criaDecideAjustePago`.
function clicaNoSelo({ hoje, periodoPorData, linha }) {
  const inicio = interacoes.indexOf("el('out').addEventListener('click', async (e) => {");
  const fim = interacoes.indexOf('\n});\n', inicio) + 5;
  const patches = [];
  const reclassificadas = [];
  let ouvinte;

  const selo = {
    dataset: { togPago: String(linha.id) },
    classList: { toggle() {} },
    style: {},
  };

  const contexto = {
    el: () => ({
      addEventListener: (_, f) => {
        ouvinte = f;
      },
    }),
    Estado: { lancamentos: [linha], simulando: false },
    togglesNoAr: new Set(),
    ehDebitoAtrasado: () => false,
    hojeISO: () => hoje,
    dataISO: (v) => v,
    dataBR: (v) => v,
    periodoDoDebito: (data) => periodoPorData[data] ?? -1,
    cicloDeHoje: () => periodoPorData[hoje] ?? -1,
    confirm: () => true,
    atualizarLancamento: async (id, campos) => patches.push([id, { ...campos }]),
    reclassificaPeriodo: (r) => reclassificadas.push(r.id),
    desenhar() {},
    mostrarToast() {},
  };

  vm.createContext(contexto);
  vm.runInContext(interacoes.slice(inicio, fim), contexto);

  return {
    patches,
    reclassificadas,
    clicar: () =>
      ouvinte({ target: { closest: () => selo }, stopImmediatePropagation() {} }),
  };
}

test('PATCH só inclui "data" quando ela realmente mudou, e reclassificaPeriodo roda junto', async () => {
  const mudou = { id: 5, pago: false, cred: false, data: '2026-10-20', nome: 'Água' };

  const a = clicaNoSelo({
    hoje: '2026-10-09',
    periodoPorData: { '2026-10-09': 2, '2026-10-20': 2 },
    linha: mudou,
  });

  await a.clicar();
  assert.deepEqual(a.patches, [[5, { pago: true, data: '2026-10-09' }]]);
  assert.equal(mudou.data, '2026-10-09');
  assert.equal(mudou.pago, true);
  assert.deepEqual(a.reclassificadas, [5]);

  const igual = { id: 6, pago: false, cred: false, data: '2026-10-09', nome: 'Luz' };

  const b = clicaNoSelo({
    hoje: '2026-10-09',
    periodoPorData: { '2026-10-09': 2 },
    linha: igual,
  });

  await b.clicar();
  assert.deepEqual(b.patches, [[6, { pago: true }]]);
  assert.equal(igual.data, '2026-10-09');
  assert.deepEqual(b.reclassificadas, []);
});

// Extrai só a lógica de decisão (sem tocar DOM/Estado real) e roda num contexto isolado com
// hojeISO/periodoDoDebito/confirm simulados, pra testar o comportamento de verdade.
function criaDecideAjustePago({ hoje, periodoPorData, confirmResposta = true }) {
  const inicio = interacoes.indexOf('const novoPago = !r.pago;');
  const fim = interacoes.indexOf('badge.classList.toggle');

  if (inicio < 0 || fim < 0)
    throw Error('Não encontrou o ajuste automático de data no toggle de Pago.');
  const corpo = interacoes.slice(inicio, fim);
  const chamadasConfirm = [];

  const contexto = {
    ehDebitoAtrasado: () => false, // atrasado tem testes próprios (atrasados.test.js)
    hojeISO: () => hoje,
    dataISO: (v) => v,
    dataBR: (v) => v,
    periodoDoDebito: (data) => periodoPorData[data] ?? -1,
    cicloDeHoje: () => periodoPorData[hoje] ?? -1,
    confirm: (msg) => {
      chamadasConfirm.push(msg);

      return confirmResposta;
    },
  };

  vm.createContext(contexto);
  vm.runInContext(
    `function decide(r) {\n${corpo}\n    return { novoPago, novaData };\n}\nglobalThis.decide = decide;`,
    contexto
  );

  return { decide: contexto.decide, chamadasConfirm };
}

test('mesma data: segue direto, sem ajuste nem confirmação', () => {
  const { decide, chamadasConfirm } = criaDecideAjustePago({
    hoje: '2026-10-09',
    periodoPorData: { '2026-10-09': 2 },
  });

  const resultado = decide({
    pago: false,
    cred: false,
    data: '2026-10-09',
    nome: 'Água',
  });

  assert.deepEqual({ ...resultado }, { novoPago: true, novaData: '2026-10-09' });
  assert.equal(chamadasConfirm.length, 0);
});

test('vencimento futuro no MESMO ciclo: ajusta a data pra hoje, sem perguntar', () => {
  const { decide, chamadasConfirm } = criaDecideAjustePago({
    hoje: '2026-10-09',
    periodoPorData: { '2026-10-09': 2, '2026-10-20': 2 },
  });

  const resultado = decide({
    pago: false,
    cred: false,
    data: '2026-10-20',
    nome: 'Água',
  });

  assert.deepEqual({ ...resultado }, { novoPago: true, novaData: '2026-10-09' });
  assert.equal(chamadasConfirm.length, 0);
});

test('data já passada no MESMO ciclo: vira hoje, sem perguntar', () => {
  const { decide, chamadasConfirm } = criaDecideAjustePago({
    hoje: '2026-10-09',
    periodoPorData: { '2026-10-09': 2, '2026-10-01': 2 },
  });

  const resultado = decide({
    pago: false,
    cred: false,
    data: '2026-10-01',
    nome: 'Água',
  });

  assert.deepEqual({ ...resultado }, { novoPago: true, novaData: '2026-10-09' });
  assert.equal(chamadasConfirm.length, 0);
});

test('data em ciclo diferente do de hoje: pede confirmação; confirmando, mantém a data original', () => {
  const { decide, chamadasConfirm } = criaDecideAjustePago({
    hoje: '2026-10-09',
    periodoPorData: { '2026-10-09': 2, '2026-11-05': 3 },
    confirmResposta: true,
  });

  const resultado = decide({
    pago: false,
    cred: false,
    data: '2026-11-05',
    nome: 'Água',
  });

  assert.deepEqual({ ...resultado }, { novoPago: true, novaData: '2026-11-05' });
  assert.equal(chamadasConfirm.length, 1);
  assert.equal(
    chamadasConfirm[0],
    '"Água" está datado 2026-11-05, fora do ciclo atual. Marcar como pago mesmo assim?'
  );
});

test('data em ciclo diferente e usuário cancela a confirmação: aborta sem marcar pago', () => {
  const { decide, chamadasConfirm } = criaDecideAjustePago({
    hoje: '2026-10-09',
    periodoPorData: { '2026-10-09': 2, '2026-11-05': 3 },
    confirmResposta: false,
  });

  const resultado = decide({
    pago: false,
    cred: false,
    data: '2026-11-05',
    nome: 'Água',
  });

  assert.equal(resultado, undefined);
  assert.equal(chamadasConfirm.length, 1);
});

test('ciclo não encontrado (periodoDoDebito devolve -1) conta como fora do ciclo, nunca como "mesmo ciclo"', () => {
  const { decide, chamadasConfirm } = criaDecideAjustePago({
    hoje: '2026-10-09',
    periodoPorData: { '2026-10-09': -1, '2099-01-01': -1 }, // nenhuma das duas datas cai em ciclo cadastrado
    confirmResposta: true,
  });

  decide({ pago: false, cred: false, data: '2099-01-01', nome: 'Teste' });
  assert.equal(chamadasConfirm.length, 1);
});

test('Crédito no ciclo atual (pela fatura) vira hoje, sem perguntar', () => {
  const { decide, chamadasConfirm } = criaDecideAjustePago({
    hoje: '2026-10-09',
    periodoPorData: { '2026-10-09': 2, '2026-10-20': 2 },
  });

  const resultado = decide({
    pago: false,
    cred: true,
    data: '2026-10-20',
    periodoIdx: 2,
    nome: 'Compra cartão',
  });

  assert.deepEqual({ ...resultado }, { novoPago: true, novaData: '2026-10-09' });
  assert.equal(chamadasConfirm.length, 0);
});

test('Crédito fora do ciclo atual não muda a data e não pergunta', () => {
  const { decide, chamadasConfirm } = criaDecideAjustePago({
    hoje: '2026-10-09',
    periodoPorData: { '2026-10-09': 2, '2026-12-01': 5 },
  });

  const resultado = decide({
    pago: false,
    cred: true,
    data: '2026-12-01',
    periodoIdx: 5,
    nome: 'Compra cartão',
  });

  assert.deepEqual({ ...resultado }, { novoPago: true, novaData: '2026-12-01' });
  assert.equal(chamadasConfirm.length, 0);
});

test('desmarcar (já pago) nunca entra nessa regra, mesmo com data fora do ciclo', () => {
  const { decide, chamadasConfirm } = criaDecideAjustePago({
    hoje: '2026-10-09',
    periodoPorData: { '2026-10-09': 2, '2026-12-01': 5 },
  });

  const resultado = decide({ pago: true, cred: false, data: '2026-12-01', nome: 'Água' });

  assert.deepEqual({ ...resultado }, { novoPago: false, novaData: '2026-12-01' });
  assert.equal(chamadasConfirm.length, 0);
});

test('regra documentada em REGRAS.md', () => {
  assert.match(
    regras,
    /Clicar no badge Pago\/Aberto de um lançamento real \(Débito ou Crédito\) para MARCAR como pago/
  );
  assert.match(
    regras,
    /Datas diferentes mas dentro do MESMO ciclo ajustam a data para hoje automaticamente, sem perguntar/
  );
  assert.match(
    regras,
    /Em qualquer ciclo diferente do de hoje \(incluindo um já encerrado\), a data nunca é tocada/
  );
  assert.match(regras, /No Crédito, a data é a da compra e o ciclo vem da fatura/);
});
