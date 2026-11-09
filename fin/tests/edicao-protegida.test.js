// Recarga silenciosa não redesenha por cima de uma célula em edição, e desligar a simulação
// só sai do modo simulação depois que a recarga der certo.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');

const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

function montarEspera() {
  const inicio = dadosUi.indexOf('const edicaoNaTabelaEmCurso');

  const fim =
    dadosUi.indexOf('\n}\n', dadosUi.indexOf('function desenharQuandoLivre()')) + 3;

  const timers = [];
  const out = { contains: (e) => e.dentroDaTabela };

  const ctx = {
    Estado: { redesenhoPendente: false },
    desenhos: 0,
    document: { activeElement: null },
    el: () => out,
    setTimeout: (f) => timers.push(f),
  };

  ctx.desenhar = () => {
    ctx.desenhos++;
    ctx.Estado.redesenhoPendente = false;
  };

  vm.runInNewContext(
    `${dadosUi.slice(inicio, fim)}\nthis.desenharQuandoLivre = desenharQuandoLivre;`,
    ctx
  );
  const rodarTimers = () => timers.splice(0).forEach((f) => f());

  const editando = () => {
    ctx.document.activeElement = { matches: () => true, dentroDaTabela: true };
  };

  const livre = () => {
    ctx.document.activeElement = null;
  };

  return { ctx, rodarTimers, editando, livre };
}

test('sem edição em curso, redesenha na hora', () => {
  const { ctx } = montarEspera();

  ctx.desenharQuandoLivre();
  assert.equal(ctx.desenhos, 1);
});

test('com uma célula da tabela em edição, espera e redesenha quando ela acaba', () => {
  const { ctx, rodarTimers, editando, livre } = montarEspera();

  editando();
  ctx.desenharQuandoLivre();
  assert.equal(ctx.desenhos, 0);
  rodarTimers();
  assert.equal(ctx.desenhos, 0); // ainda editando
  livre();
  rodarTimers();
  assert.equal(ctx.desenhos, 1);
});

test('se a própria edição já redesenhou ao confirmar, não redesenha de novo', () => {
  const { ctx, rodarTimers, editando, livre } = montarEspera();

  editando();
  ctx.desenharQuandoLivre();
  ctx.desenhar(); // a edição confirmou e redesenhou com os dados novos
  livre();
  rodarTimers();
  assert.equal(ctx.desenhos, 1);
});

test('campo fora da tabela (ex.: busca no cadastro) não segura o redesenho', () => {
  const { ctx } = montarEspera();

  ctx.document.activeElement = { matches: () => true, dentroDaTabela: false };
  ctx.desenharQuandoLivre();
  assert.equal(ctx.desenhos, 1);
});

// A recarga silenciosa (load) e a consolidação automática chamam desenharQuandoLivre: gravacao-recarga.test.js (load) e
// consolidar-tudo.test.js (consolidarTudo). O clique, a edição confirmada e o resto chamam desenhar() direto, que é o
// desenho de verdade (js/interactions.js, com os desenhos auxiliares de tela trocados por funções vazias):
test('o desenho direto (clique) pinta o ciclo e apaga o redesenho pendente', async () => {
  const l = (id, nome, data, valor, categ) => ({
    id,
    nome,
    data,
    valor,
    categ,
    cred: false,
    pago: true,
    fatura: null,
    freq: null,
  });

  const t = carregarTela({
    dados: {
      fin_ciclo: [
        { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
        { id: 2, inicio: '2026-10-15', fim: null },
      ],
      fin: [l(1, 'Salário', '2026-10-15', 9000, 'Salário')],
      fin_meta: [],
    },
  });

  await t.bruto('carregarDados()');

  for (const nome of [
    'sincronizarCicloNaUrl',
    'popularAlvosVisualizacao',
    'atualizarIndicadoresFinanceiros',
    'encaixarIndicadoresNoDebito',
    'alinharResumosDosTitulos',
    'atualizarCartoes',
    'atualizarMetas',
    'atualizarBotaoSomenteDif',
    'recolherBloco',
  ])
    t.ctx[nome] = () => {};

  trazer(t.ctx, 'js/interactions.js', ['desenhar']);

  const el = t.ctx.document.getElementById;

  el('compDe').value = '1';
  el('compAte').value = '1';
  t.bruto('Estado.idxHoje = 1');
  t.bruto('Estado.redesenhoPendente = true'); // uma recarga silenciosa ficou esperando a edição acabar
  t.bruto('desenhar()');
  assert.equal(t.rodar('Estado.redesenhoPendente'), false);
  assert.match(el('out').innerHTML, /Salário/);
});

async function desligarSimulacao({ recargaOk }) {
  const inicio = formulario.indexOf("el('toggleSimulacao').onclick = async () => {");
  const fim = formulario.indexOf('\n};\n', inicio) + 4;
  const bt = { disabled: false };
  const toasts = [];

  const ctx = {
    Estado: { simulando: true },
    desenhos: 0,
    el: () => bt,
    load: async (opcoes) => {
      ctx.opcoesDaCarga = opcoes;

      return recargaOk;
    },
    atualizaBotaoSimulacao() {},
    desenhar() {
      ctx.desenhos++;
    },
    mostrarToast: (titulo) => toasts.push(titulo),
  };

  vm.runInNewContext(`${formulario.slice(inicio, fim)}`, ctx);
  await bt.onclick();

  return { ctx, toasts, bt };
}

test('desligar a simulação: com a recarga ok, sai do modo simulação', async () => {
  const { ctx, toasts, bt } = await desligarSimulacao({ recargaOk: true });

  assert.equal(ctx.Estado.simulando, false);
  assert.equal(ctx.opcoesDaCarga.silencioso, true); // falha não troca a tela pelo erro
  assert.deepEqual(toasts, []);
  assert.equal(bt.disabled, false);
});

test('desligar a simulação: se a recarga falhar, continua simulando e avisa', async () => {
  const { ctx, toasts, bt } = await desligarSimulacao({ recargaOk: false });

  assert.equal(ctx.Estado.simulando, true);
  assert.deepEqual(toasts, ['A simulação continua']);
  assert.equal(bt.disabled, false);
});

test('regras documentadas', () => {
  assert.match(
    regras,
    /Recarga silenciosa[^\n]*nunca redesenha por cima de uma célula da tabela em edição/
  );
  assert.match(
    regras,
    /Desligar a simulação só sai do modo simulação depois que a recarga do banco der certo/
  );
});
