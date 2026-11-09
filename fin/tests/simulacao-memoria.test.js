// Contrato de simulação: edição e ocultação locais jamais chamam escrita no Supabase. Os editores inline (Pago, sinal,
// Valor, Data), o ajuste materializado, a barra de seleção e as contas dos gráficos rodam de verdade, com o banco
// simulado anotando toda escrita; o mesmo cenário com a linha real, fora da simulação, grava (a prova de que o teste enxerga).
// Já conferidos em outros testes: o editor genérico (Nome, Categoria, Frequência, Prio, Obs, Canal) em
// edicao-inline-nome-categ-freq.test.js, Reserva/Comprometido em reserva-comprometido-toggle.test.js, o botão de corrigir
// recorrência duplicada em recorrencia-duplicada.test.js, a exclusão em diagnosticos-interface.test.js, os limites do ciclo
// em gasto-previsto.test.js e as metas em telas-por-funcao.test.js.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');

// Campo (input) falso: guarda os ouvintes para o teste disparar Enter
const campoFalso = (valor) => {
  const campo = {
    value: valor,
    ouvintes: {},
    addEventListener: (tipo, fn) => (campo.ouvintes[tipo] = fn),
    focus() {},
    select() {},
    setSelectionRange() {},
  };

  return campo;
};

// Monta a tela sem navegador com uma linha e o banco simulado; `escritas` anota todo pedido que não é leitura.
async function montar({ simulando, simulada }) {
  const linha = {
    id: 5,
    nome: 'Água',
    data: '2026-10-20',
    valor: -10,
    v: -10,
    categ: 'Casa',
    cred: false,
    pago: false,
    ...(simulada ? { _sim: true } : {}),
  };

  const tela = carregarTela({
    dados: {
      fin: [],
      fin_ciclo: [{ id: 1, inicio: '2026-09-15', fim: null }],
      fin_meta: [],
    },
  });

  await tela.bruto('carregarDados()');
  trazer(tela.ctx, 'js/interactions.js', ['reclassificaPeriodo']);

  const escritas = [];

  tela.ctx.fetch = async (url, opcoes = {}) => {
    if (opcoes.method && opcoes.method !== 'GET') escritas.push(opcoes.method);

    return { ok: true, status: 200, text: async () => JSON.stringify([{ id: 5 }]) };
  };

  tela.ctx.togglesNoAr = new Set();
  tela.ctx.desenhar = () => {};

  tela.ctx.mostrarToast = () => {};

  tela.ctx.confirm = () => true;
  const lista = tela.bruto('Estado.lancamentos');

  lista.length = 0;
  lista.push(linha);
  tela.bruto(`Estado.simulando = ${simulando}`);

  // O ouvinte de clique de #out que começa naquele trecho de js/interactions.js
  const ouvinte = (comeco) => {
    const inicio = interacoes.indexOf(comeco);
    let achado;

    tela.ctx.document.getElementById('out').addEventListener = (tipo, fn) => {
      achado = fn;
    };

    vm.runInContext(
      interacoes.slice(inicio, interacoes.indexOf('\n});\n', inicio) + 5),
      tela.ctx
    );

    return achado;
  };

  return { tela, linha, escritas, ouvinte };
}

const clique = (alvo) => ({
  target: { closest: () => alvo },
  stopImmediatePropagation() {},
});

// Cada editor inline: o que faz na linha e como o teste o aciona. `aposEditar` devolve o que mudou na memória.
const editores = {
  'selo Pago': async ({ ouvinte, linha }) => {
    const selo = {
      dataset: { togPago: '5' },
      classList: { toggle() {} },
      style: {},
      textContent: '',
    };

    await ouvinte(
      "el('out').addEventListener('click', async (e) => {\n  const badge = e.target.closest('[data-tog-pago]');"
    )(clique(selo));

    return { pago: linha.pago };
  },
  'botão ± do Valor': async ({ ouvinte, linha }) => {
    const botao = {
      dataset: { togSinal: '5' },
      classList: { toggle() {} },
      textContent: '',
    };

    await ouvinte(
      "el('out').addEventListener('click', async (e) => {\n  const botao = e.target.closest('[data-tog-sinal]');"
    )(clique(botao));

    return { valor: linha.valor };
  },
  'edição do Valor': async ({ ouvinte, linha }) => {
    const campo = campoFalso('');

    const span = {
      classList: { contains: () => false, add() {} },
      dataset: { togValor: '5' },
      querySelector: () => campo,
    };

    ouvinte(
      "el('out').addEventListener('click', (e) => {\n  const span = e.target.closest('[data-tog-valor]');"
    )(clique(span));
    campo.value = '5,00';
    campo.ouvintes.keydown({ key: 'Enter', preventDefault() {} });
    await new Promise((ok) => setImmediate(ok));

    return { valor: linha.valor };
  },
  'edição da Data': async ({ ouvinte, linha }) => {
    const campo = campoFalso('');

    const span = {
      classList: { contains: () => false, add() {} },
      dataset: { togData: '5' },
      querySelector: () => campo,
    };

    ouvinte(
      "el('out').addEventListener('click', (e) => {\n  const span = e.target.closest('[data-tog-data]');"
    )(clique(span));
    campo.value = '2026-11-01';
    campo.ouvintes.keydown({ key: 'Enter', preventDefault() {} });
    await new Promise((ok) => setImmediate(ok));

    return { data: linha.data };
  },
};

const mudou = {
  'selo Pago': { pago: true },
  'botão ± do Valor': { valor: 10 },
  'edição do Valor': { valor: -5 },
  'edição da Data': { data: '2026-11-01' },
};

test('simulação mantém update e exclusão de linhas reais somente em memória', async () => {
  for (const [nome, editar] of Object.entries(editores)) {
    // Fora da simulação, linha real: grava (é o que prova que o teste enxerga uma escrita)
    const real = await montar({ simulando: false, simulada: false });

    assert.deepEqual(await editar(real), mudou[nome], `${nome}: real`);
    assert.deepEqual(real.escritas, ['PATCH'], `${nome}: real grava`);

    // Na simulação: a linha muda na memória e nada vai ao banco
    const simulacao = await montar({ simulando: true, simulada: false });

    assert.deepEqual(await editar(simulacao), mudou[nome], `${nome}: simulando`);
    assert.deepEqual(simulacao.escritas, [], `${nome}: simulando não grava`);

    // Linha criada na simulação (_sim) também fica só na memória
    const soSimulada = await montar({ simulando: false, simulada: true });

    assert.deepEqual(await editar(soSimulada), mudou[nome], `${nome}: _sim`);
    assert.deepEqual(soSimulada.escritas, [], `${nome}: _sim não grava`);
  }
});

test('contas dos gráficos e dos indicadores não gravam nada', async () => {
  const tela = carregarTela({
    dados: {
      fin: [
        {
          id: 1,
          nome: 'Obra',
          data: '2026-10-16',
          valor: -100,
          categ: 'Casa',
          cred: false,
          pago: true,
          fatura: null,
          freq: null,
          reserva: true,
        },
      ],
      fin_ciclo: [
        { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
        { id: 2, inicio: '2026-10-15', fim: null },
      ],
      fin_meta: [],
    },
  });

  const escritas = [];
  const banco = tela.ctx.fetch;

  tela.ctx.fetch = async (url, opcoes = {}) => {
    if (opcoes.method && opcoes.method !== 'GET') escritas.push(opcoes.method);

    return banco(url, opcoes);
  };

  tela.ctx.recolherBloco = () => {}; // vem de js/interactions.js, fora da tela sem navegador

  await tela.bruto('carregarDados()');
  tela.bruto('Estado.idxHoje = 1');
  tela.bruto('Estado.simulando = true');
  tela.bruto('atualizarIndicadoresFinanceiros(1)');
  tela.bruto('dadosMetaReservaEmergenciaCiclo(1)');
  await tela.desenharCiclo(1);
  assert.deepEqual(escritas, []);
});

test('ajuste materializado na simulação vira linha local, sem INSERT nem UPDATE', async () => {
  const roda = async ({ existente }) => {
    const eventos = [];

    const ctx = {
      Estado: { simulando: true, ciclos: [{}] },
      dataDeFechamentoDoCiclo: () => '2026-10-14',
      movimentoAporteOuResgateDoCiclo: () => existente,
      consolidarAjusteExistente: (linha, valor) => ({
        nome: 'Aporte somado',
        valor: linha.valor + valor,
      }),
      simulaLancamentoParcelado: (dados) =>
        eventos.push(['simula', dados.nome, dados.valores]),
      inserirLancamento: async () => eventos.push('INSERT'),
      atualizarLancamento: async () => eventos.push('UPDATE'),
    };

    vm.runInNewContext(
      `${formulario.slice(formulario.indexOf('async function materializaOuConsolidaAjuste('), formulario.indexOf('// A mesma posicao da barra tem duas acoes'))}\nthis.f = materializaOuConsolidaAjuste;`,
      ctx
    );

    const retorno = await ctx.f(0, true, 'Investimento', -50);

    return { retorno, eventos: JSON.parse(JSON.stringify(eventos)), existente };
  };

  // Sem Aporte no ciclo: a linha nova entra só na simulação
  const nova = await roda({ existente: null });

  assert.equal(nova.retorno, 'materializado');
  assert.deepEqual(nova.eventos, [['simula', 'Aporte', [-50]]]);

  // Com Aporte em aberto: o valor é consolidado na própria linha, em memória
  const linha = { id: 9, nome: 'Aporte', valor: -100, v: -100 };
  const consolidada = await roda({ existente: linha });

  assert.equal(consolidada.retorno, 'consolidado');
  assert.deepEqual(consolidada.eventos, []);
  assert.deepEqual([linha.nome, linha.valor, linha.v], ['Aporte somado', -150, -150]);
});

test('barra de seleção: na simulação o ajuste vira "Simular" e Excluir vira "Ocultar"', () => {
  const roda = ({ simulando, chaves }) => {
    const elementos = {};

    const ctx = {
      Estado: {
        simulando,
        selecionados: new Map(chaves.map((c) => [c, -10])),
        linhasVisiveis: {},
        lancamentos: [{ id: 5, nome: 'Água', v: -10 }],
      },
      PREFIXO_LINHA_SINTETICA: /^(sug|res|fat):/,
      movimentoAporteOuResgateDoCiclo: () => null,
      chaveSelecao: (r) => String(r.id),
      corValor: () => '',
      corSoma: () => '',
      escapeHtml: (s) => s,
      brl: (v) => String(v),
      el: (id) =>
        (elementos[id] ||= { style: {}, hidden: false, textContent: '', innerHTML: '' }),
    };

    vm.runInNewContext(
      `${interacoes.slice(interacoes.indexOf('function atualizaBarraSelecao() {'), interacoes.indexOf('// Uma sugestao so'))}
      atualizaBarraSelecao();`,
      ctx
    );

    return {
      duplicar: elementos.seldup.textContent,
      excluir: elementos.seldel.textContent,
    };
  };

  assert.deepEqual(roda({ simulando: true, chaves: ['sug:1'] }).duplicar, 'Simular');
  assert.deepEqual(
    roda({ simulando: false, chaves: ['sug:1'] }).duplicar,
    'Materializar'
  );
  assert.equal(roda({ simulando: true, chaves: ['5'] }).excluir, 'Ocultar');
  assert.equal(roda({ simulando: false, chaves: ['5'] }).excluir, 'Excluir');
  assert.equal(roda({ simulando: true, chaves: ['5'] }).duplicar, 'Duplicar');
});

test('ocultar vários na simulação explica que volta ao recarregar ou sair da simulação', async () => {
  const perguntas = [];
  const botao = { disabled: false, textContent: '' };

  const ctx = {
    Estado: {
      simulando: true,
      selecionados: new Map([
        ['1', true],
        ['2', true],
      ]),
      lancamentos: [
        { id: 1, nome: 'A', v: -1 },
        { id: 2, nome: 'B', v: -2 },
      ],
    },
    el: () => botao,
    brl: (v) => `R$ ${v}`,
    confirm: (pergunta) => {
      perguntas.push(pergunta);

      return false;
    },
    excluirLancamento: async () => assert.fail('simulação não exclui no banco'),
  };

  const ini = formulario.indexOf('const exclusaoEhSimulada');
  const simulada = formulario.slice(ini, formulario.indexOf('\n', ini));
  const fim = formulario.indexOf("el('seldel').onclick");

  vm.runInNewContext(
    `${simulada}\n${formulario.slice(fim, formulario.indexOf('\n};\n', fim) + 4)}`,
    ctx
  );
  await botao.onclick();
  assert.equal(perguntas.length, 1);
  assert.ok(perguntas[0].startsWith('Ocultar estes 2 lançamentos'));
  assert.ok(perguntas[0].endsWith('Volta ao recarregar ou sair da simulação.'));
});
