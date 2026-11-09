// Toda gravação real (INSERT, UPDATE, DELETE, limites do ciclo) confirmada pelo banco
// recarrega a tela sozinha, sem atropelar edição em curso nem repetir carga já feita. As gravações e a carga rodando de
// verdade estão em gravacao-recarga.test.js; aqui, o agendamento da recarga (bootstrap.js) e a regra documentada.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');

const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('nenhuma gravação do banco escapa da recarga: cada escrita pede uma, a numeração da série (rpc) não', async () => {
  // Cada chamada de escrita das funções reais (js/supabase-api.js), com o banco falso anotando o que foi enviado.
  const dados = {
    fin: [{ id: 7, nome: 'Café', data: '2026-10-16', valor: -12, categ: 'Besteira' }],
    fin_ciclo: [{ id: 1, inicio: '2026-10-15', fim: null }],
    fin_meta: [{ id: 3, nome: 'Mesa', valor: 1500, status: 'aberta' }],
  };

  const t = carregarTela({ dados });
  const escritas = [];

  t.ctx.recargas = 0;
  t.ctx.recarregarAposGravacao = () => t.ctx.recargas++;

  const fetchDoBanco = t.ctx.fetch;

  t.ctx.fetch = async (url, opcoes = {}) => {
    const u = new URL(url);

    if (opcoes.method && opcoes.method !== 'GET')
      escritas.push(`${opcoes.method} ${u.pathname.split('/').pop()}`);

    if (u.pathname.endsWith('/proxima_recorrencia'))
      return { ok: true, status: 200, text: async () => '5' };

    if (opcoes.method && opcoes.method !== 'GET')
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: 7, nome: 'x', valor: -1 }]),
      };

    return fetchDoBanco(url, opcoes);
  };

  const chamadas = [
    ["inserirLancamentos([{ nome: 'x', valor: -1 }])", 'POST fin'],
    ['atualizarLancamentos([7], { pago: false })', 'PATCH fin'],
    ['excluirLancamento(7)', 'DELETE fin'],
    ["salvarLimiteDoCiclo(1, 'limite_besteira', 300)", 'PATCH fin_ciclo'],
    ["inserirMeta({ nome: 'Nova', valor: 1 })", 'POST fin_meta'],
    ["atualizarMeta(3, { nome: 'Mesa nova' })", 'PATCH fin_meta'],
    ['excluirMeta(3)', 'DELETE fin_meta'],
  ];

  for (const [chamada, escrita] of chamadas) {
    const antes = { recargas: t.ctx.recargas, escritas: escritas.length };

    await t.bruto(chamada);
    assert.equal(t.ctx.recargas, antes.recargas + 1, `${chamada}: uma recarga`);
    assert.equal(escritas[antes.escritas], escrita, chamada);
  }

  // Todo pedido de escrita feito por essas funções foi coberto por uma recarga (um para um)
  assert.equal(escritas.length, chamadas.length);
  assert.equal(t.ctx.recargas, chamadas.length);

  // A numeração da série não grava linha: não recarrega
  await t.bruto('proximaRecorrencia()');
  assert.equal(t.ctx.recargas, chamadas.length);
  // Uma escrita nova no código entra aqui (lista acima) e em gravacao-recarga.test.js.
});

// Guarda contra escrita nova esquecida: lista, pela árvore do código (sem regex), toda função declarada no nível do
// script de js/supabase-api.js, chama cada uma com argumentos fictícios e um fetch espião, e quem faz pedido que não é
// GET precisa estar entre as escritas testadas acima ou na lista de exceções, com o motivo.
test('toda função de js/supabase-api.js que escreve no banco está coberta pelo teste da recarga', async () => {
  const { parse } = require('espree');

  const escritasTestadas = [
    'inserirLancamentos',
    'atualizarLancamentos',
    'excluirLancamento',
    'salvarLimiteDoCiclo',
    'inserirMeta',
    'atualizarMeta',
    'excluirMeta',
  ];

  const excecoes = {
    proximaRecorrencia: 'numera a série (rpc), não grava linha: não recarrega',
    inserirLancamento: 'só chama inserirLancamentos (testada)',
    atualizarLancamento: 'só chama atualizarLancamentos (testada)',
    gravarMeta: 'núcleo de inserirMeta, atualizarMeta e excluirMeta (testadas)',
  };

  const arvore = parse(fs.readFileSync('js/supabase-api.js', 'utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  });

  const funcoes = [];

  for (const no of arvore.body) {
    if (no.type === 'FunctionDeclaration') funcoes.push(no.id.name);

    if (no.type === 'VariableDeclaration')
      for (const d of no.declarations)
        if (
          d.id.type === 'Identifier' &&
          ['ArrowFunctionExpression', 'FunctionExpression'].includes(d.init?.type)
        )
          funcoes.push(d.id.name);
  }

  // Sanidade da descoberta: as escritas conhecidas aparecem (senão o guarda estaria olhando para nada)
  assert.ok(funcoes.length > 15);

  for (const nome of [...escritasTestadas, ...Object.keys(excecoes)])
    assert.ok(funcoes.includes(nome), `${nome} deveria estar em js/supabase-api.js`);

  const t = carregarTela({ dados: { fin: [], fin_ciclo: [], fin_meta: [] } });
  let pedidos = [];

  t.ctx.recarregarAposGravacao = () => {};

  t.ctx.fetch = async (url, opcoes = {}) => {
    pedidos.push(opcoes.method || 'GET');

    const proxima = new URL(url).pathname.endsWith('/proxima_recorrencia');

    return {
      ok: true,
      status: 200,
      text: async () =>
        proxima ? '5' : JSON.stringify([{ id: 7, nome: 'x', valor: -1 }]),
    };
  };

  const argumentos = [
    [],
    [7],
    [[7], { pago: false }],
    [[{ nome: 'x', valor: -1 }]],
    [{ nome: 'x', valor: -1 }],
    [1, 'limite_besteira', 300],
    ['POST', null, { nome: 'x', valor: 1 }],
    ['PATCH', 3, { nome: 'y' }],
    ['DELETE', 3, null],
  ];

  const escrevem = [];

  for (const nome of funcoes) {
    if (t.bruto(`typeof ${nome}`) !== 'function') continue;
    pedidos = [];

    for (const args of argumentos) {
      try {
        await t.bruto(`${nome}(...${JSON.stringify(args)})`);
      } catch {
        // argumento que a função não aceita: tenta o próximo
      }
    }

    if (pedidos.some((m) => m !== 'GET')) escrevem.push(nome);
  }

  // As sete conhecidas realmente escrevem (o espião enxerga o pedido) e nenhuma outra está fora das listas
  for (const nome of escritasTestadas)
    assert.ok(escrevem.includes(nome), `${nome} deveria fazer um pedido de escrita`);

  const novas = escrevem.filter((n) => !escritasTestadas.includes(n) && !(n in excecoes));

  assert.deepEqual(
    novas,
    [],
    `função(ões) de escrita sem teste da recarga: ${novas.join(', ')}. Acrescente em "nenhuma gravação do banco escapa da recarga" (e em gravacao-recarga.test.js) ou, se não grava linha, em excecoes com o motivo`
  );
});

function montar() {
  const inicio = bootstrap.indexOf('const ESPERA_RECARGA_APOS_GRAVACAO_MS');

  const fim =
    bootstrap.indexOf('\n}\n', bootstrap.indexOf('function recarregarAposGravacao()')) +
    3;

  const timers = [];
  const tela = { focado: null, dialogo: null, recarregarDesabilitado: false, app: '' };

  const ctx = {
    Estado: { gravacoes: 0, gravacoesNaUltimaCarga: 0, cargasEmAndamento: 0 },
    recargas: 0,
    recarregarDados() {
      ctx.recargas++;
    },
    setTimeout: (f) => {
      timers.push(f);

      return timers.length;
    },
    clearTimeout: (id) => {
      if (id) timers[id - 1] = null;
    },
    el: (id) =>
      id === 'app'
        ? { style: { display: tela.app } }
        : { disabled: tela.recarregarDesabilitado },
    document: {
      querySelector: () => tela.dialogo,
      get activeElement() {
        return tela.focado;
      },
    },
  };

  vm.runInNewContext(
    `${bootstrap.slice(inicio, fim)}\nthis.gravou = recarregarAposGravacao;`,
    ctx
  );

  const rodarTimers = () => {
    const pendentes = timers.splice(0).filter(Boolean);

    pendentes.forEach((f) => f());
  };

  return { ctx, tela, rodarTimers, timers };
}

test('grava → recarrega uma vez; várias gravações seguidas viram uma carga só', () => {
  const { ctx, rodarTimers } = montar();

  ctx.gravou();
  ctx.gravou();
  ctx.gravou();
  rodarTimers();
  assert.equal(ctx.recargas, 1);
});

test('espera campo em edição, modal ou carga em andamento; depois recarrega', () => {
  const { ctx, tela, rodarTimers } = montar();

  tela.focado = { matches: () => true }; // editando uma célula
  ctx.gravou();
  rodarTimers();
  assert.equal(ctx.recargas, 0);
  tela.focado = null;
  tela.dialogo = {}; // modal aberto
  rodarTimers();
  assert.equal(ctx.recargas, 0);
  tela.dialogo = null;
  ctx.Estado.cargasEmAndamento = 1;
  rodarTimers();
  assert.equal(ctx.recargas, 0);
  ctx.Estado.cargasEmAndamento = 0;
  rodarTimers();
  assert.equal(ctx.recargas, 1);
});

test('não repete quando uma carga começou depois da gravação (o fluxo já recarregou)', () => {
  const { ctx, rodarTimers } = montar();

  ctx.gravou();
  ctx.Estado.gravacoesNaUltimaCarga = ctx.Estado.gravacoes; // carga começou depois de gravar
  rodarTimers();
  assert.equal(ctx.recargas, 0);
  // Carga que começou ANTES desta gravação não conta: recarrega.
  ctx.gravou();
  rodarTimers();
  assert.equal(ctx.recargas, 1);
  assert.equal(ctx.Estado.gravacoes, 2); // cada gravação se numera
});

test('regra documentada', () => {
  assert.match(
    regras,
    /\*\*Recarga após gravar:\*\* toda mudança real que o banco confirma[^\n]*recarrega os dados da tela do banco automaticamente, em silêncio/
  );
  assert.match(
    regras,
    /Várias gravações seguidas viram uma só carga; se o próprio fluxo já recarregou depois de gravar, não repete/
  );
});
