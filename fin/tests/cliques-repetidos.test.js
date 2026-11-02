// Clique duplo e rede lenta: Nova meta/Excluir meta gravam uma vez só, os selos (Pago, Reserva,
// Comprometido, Pra sempre) ignoram o clique com o PATCH no ar e a carga volta sozinha com a conexão.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { extrairTrecho } = require('./helpers/carregar-funcoes');
const { ouvinteDe } = require('./helpers/ouvintes');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

function carregaMetas() {
  const chamadas = [];
  const pendentes = [];

  const contexto = {
    Estado: { simulando: false, metas: [{ id: 7, nome: 'Mesa' }] },
    normalizarMeta: (m) => m,
    desenhar: () => {},
    mostrarToast: () => {},
    // Cada gravação fica no ar até o teste liberar (rede lenta).
    inserirMeta: (campos) => {
      chamadas.push(['inserir', campos.nome]);

      return new Promise((r) => pendentes.push(() => r({ id: 8, ...campos })));
    },
    excluirMeta: (id) => {
      chamadas.push(['excluir', id]);

      return new Promise((r) => pendentes.push(() => r({ id })));
    },
    atualizarMeta: async (id, campos) => {
      chamadas.push(['atualizar', id]);

      return { id, ...campos };
    },
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${extrairTrecho(interacoes, 'const metasNoAr', '// Botões de sugestão da meta')}\nglobalThis.gravar = gravarMudancaDaMeta;`,
    contexto
  );

  return {
    gravar: contexto.gravar,
    chamadas,
    liberar: () => pendentes.splice(0).forEach((r) => r()),
    Estado: contexto.Estado,
  };
}

test('Nova meta com clique duplo cria uma meta só; depois de gravada, o próximo clique cria outra', async () => {
  const { gravar, chamadas, liberar, Estado } = carregaMetas();
  const primeiro = gravar('inserir', null, { nome: 'Nova meta' });
  const segundo = gravar('inserir', null, { nome: 'Nova meta' }); // 2º clique com o 1º no ar

  liberar();
  await Promise.all([primeiro, segundo]);
  assert.deepEqual(chamadas, [['inserir', 'Nova meta']]);
  assert.equal(Estado.metas.length, 2);
  const terceiro = gravar('inserir', null, { nome: 'Nova meta' });

  liberar();
  await terceiro;
  assert.equal(chamadas.length, 2);
});

test('Excluir meta com o pedido no ar não manda outro DELETE; atualizar segue livre', async () => {
  const { gravar, chamadas, liberar } = carregaMetas();
  const um = gravar('excluir', 7);
  const dois = gravar('excluir', 7);

  await gravar('atualizar', 7, { nome: 'Mesa nova' });
  liberar();
  await Promise.all([um, dois]);
  assert.deepEqual(chamadas, [
    ['excluir', 7],
    ['atualizar', 7],
  ]);
});

// Os selos (Pago, Reserva, Comprometido, Pra sempre): o clique roda o ouvinte real de js/interactions.js com a gravação falsa,
// que fica no ar até o teste liberar (rede lenta) ou recusa (banco com erro).
function selos({ recusar = false } = {}) {
  const gravacoes = [];
  const pendentes = [];
  const toasts = [];

  const grava =
    (tipo) =>
    (...args) => {
      gravacoes.push([tipo, ...args]);

      return new Promise((resolve, reject) =>
        pendentes.push(() => (recusar ? reject(Error('sem rede')) : resolve({})))
      );
    };

  const linhas = [
    { id: 1, nome: 'Aluguel', categ: 'Casa', pago: false, cred: false, reserva: false },
  ];

  const dependencias = {
    Estado: { lancamentos: linhas, simulando: false },
    togglesNoAr: new Set(),
    ehDebitoAtrasado: () => false,
    hojeISO: () => '2026-10-20',
    dataISO: (v) => v,
    dataBR: (v) => v,
    periodoDoDebito: () => 2,
    confirm: () => true,
    semAcento: (v) => String(v ?? ''),
    categoriasSeparadas: (v) => String(v ?? '').split(','),
    COR_FLAG: { reserva: 'vd' },
    ROTULO_FLAG_TOGGLE: { reserva: 'Reserva' },
    atualizarLancamento: grava('pago'),
    atualizarLancamentos: grava('flag'),
    reclassificaPeriodo() {},
    desenhar() {},
    mostrarToast: (titulo, texto) => toasts.push([titulo, texto]),
  };

  const clique = (marcador, dataset) => {
    const { ouvinte } = ouvinteDe('js/interactions.js', marcador, dependencias);
    const selo = { dataset, classList: { toggle() {} }, style: {} };

    return ouvinte({ target: { closest: () => selo }, stopImmediatePropagation() {} });
  };

  return {
    gravacoes,
    toasts,
    noAr: () => dependencias.togglesNoAr.size,
    clicarPago: () => clique("closest('[data-tog-pago]')", { togPago: '1' }),
    clicarReserva: () => clique("closest('[data-tog-flag]')", { togFlag: 'reserva:1' }),
    liberar: () => pendentes.splice(0).forEach((resolve) => resolve()),
    dependencias,
  };
}

test('selo Pago ignora o clique com o PATCH daquele selo no ar e libera no fim', async () => {
  const s = selos();
  const primeiro = s.clicarPago();
  const segundo = s.clicarPago(); // 2º clique com o PATCH do 1º ainda no ar

  await new Promise((r) => setImmediate(r)); // deixa o 2º clique correr
  assert.equal(s.gravacoes.length, 1);
  assert.equal(s.noAr(), 1);
  s.liberar();
  await Promise.all([primeiro, segundo]);
  assert.equal(s.noAr(), 0);

  const terceiro = s.clicarPago(); // depois de gravado, o clique seguinte vale (desfaz)

  s.liberar();
  await terceiro;
  assert.equal(s.gravacoes.length, 2);
  assert.equal(s.gravacoes[1][2].pago, false);
});

test('selo Reserva/Comprometido ignora o clique com o PATCH no ar e libera no fim', async () => {
  const s = selos();
  const primeiro = s.clicarReserva();
  const segundo = s.clicarReserva();

  await new Promise((r) => setImmediate(r));
  assert.equal(s.gravacoes.length, 1);
  s.liberar();
  await Promise.all([primeiro, segundo]);
  assert.equal(s.noAr(), 0);
});

test('o selo é liberado também quando a gravação falha, e o erro vira aviso', async () => {
  const pago = selos({ recusar: true });
  const a = pago.clicarPago();

  pago.liberar();
  await a;
  assert.equal(pago.noAr(), 0);
  assert.deepEqual(pago.toasts, [['Falhou ao atualizar', 'sem rede']]);

  const flag = selos({ recusar: true });
  const b = flag.clicarReserva();

  flag.liberar();
  await b;
  assert.equal(flag.noAr(), 0);
  assert.deepEqual(flag.toasts, [['Falhou ao atualizar', 'sem rede']]);
});

// Voltou a conexão (evento `online`): roda o ouvinte real de js/bootstrap.js.
function voltouAConexao({
  ultimaCarga,
  telaLivre = true,
  appVisivel = true,
  cargas = 0,
}) {
  const chamadas = [];

  const { ouvinte } = ouvinteDe(
    'js/bootstrap.js',
    'if (!Estado.ultimaCarga) load();',
    {
      Estado: { ultimaCarga, cargasEmAndamento: cargas },
      el: () => ({ style: { display: appVisivel ? '' : 'none' } }),
      telaLivreParaRecarregar: () => telaLivre,
      load: () => chamadas.push('load'),
      recarregarDados: () => chamadas.push('recarregar'),
    },
    { evento: 'online' }
  );

  ouvinte();

  return chamadas;
}

test('voltou a conexão: carga que falhou é refeita sozinha; já carregada, recarrega em silêncio com a tela livre', () => {
  assert.deepEqual(voltouAConexao({ ultimaCarga: 0 }), ['load']);
  assert.deepEqual(voltouAConexao({ ultimaCarga: 123 }), ['recarregar']);
  assert.deepEqual(voltouAConexao({ ultimaCarga: 123, telaLivre: false }), []);
  // sem sessão (app escondido) ou com uma carga já em andamento, nada a refazer
  assert.deepEqual(voltouAConexao({ ultimaCarga: 0, appVisivel: false }), []);
  assert.deepEqual(voltouAConexao({ ultimaCarga: 0, cargas: 1 }), []);
});

test('regra documentada', () => {
  assert.match(regras, /Voltou a conexão/);
  assert.match(regras, /Clique duplo/);
});
