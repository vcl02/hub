// Botão verde Recarregar (cabeçalho): recarrega, volta ao ciclo atual, limpa os filtros e
// consolida tudo, no lugar dos antigos botões Atual, Limpar filtros e Consolidar tudo.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { declaracoes } = require('./helpers/regras-css');

const graficos = fs.readFileSync('js/charts.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const inicializacao = fs.readFileSync('js/bootstrap.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

const trechoAte = (fonte, inicio, fim) => {
  const i = fonte.indexOf(inicio);

  assert.ok(i >= 0, `não achou: ${inicio}`);

  const j = fonte.indexOf(fim, i);

  assert.ok(j >= 0, `não achou o fim: ${fim}`);

  return fonte.slice(i, j + fim.length);
};

// Roda os códigos reais (limparFiltros, voltarAoCicloAtualELimpar e o clique do Recarregar)
// com um DOM mínimo. consolidarTudo é simulado no contrato dele: recarrega e, só se a carga
// der certo, chama depoisDaCarga antes de varrer.
function montaTela(idxHoje, { cargaOk = true } = {}) {
  const elementos = {};
  const etapas = [];

  const ctx = {
    el: (id) =>
      (elementos[id] ||= {
        value: 'x',
        disabled: false,
        classList: { add() {}, remove() {} },
      }),
    Estado: {
      idxHoje,
      filtroTexto: { nome: 'café' },
      fechados: { db: true },
      selecionados: new Set(['5']),
      ordenacaoPorTabela: { db: { k: 'valor', d: -1 } },
      ordComp: { k: 'nome', d: 1 },
    },
    CATEGORIA_EXCLUIDA_GRAFICO_PADRAO: 'Contabilidade',
    excluidasDoGrafico: [],
    etapas,
  };

  ctx.desenhar = () => etapas.push('desenhar');
  ctx.abrirBlocosFinanceiros = () => {
    ctx.Estado.fechados.db = false;
  };

  ctx.load = async () => {
    etapas.push('recarregar');

    return cargaOk;
  };

  ctx.consolidarTudo = async (botao, depoisDaCarga) => {
    etapas.push(`consolidarTudo(${botao === elementos.recarregar ? 'recarregar' : '?'})`);

    if (!(await ctx.load())) return;
    depoisDaCarga();
    etapas.push('consolidar');
  };

  const limpar = trechoAte(graficos, 'const FILTROS_PADRAO', '\n}\n');
  const voltar = trechoAte(interacoes, 'function voltarAoCicloAtualELimpar() {', '\n}\n');

  const clique = trechoAte(
    inicializacao,
    "el('recarregar').onclick = async () => {",
    '\n};'
  );

  vm.runInNewContext(
    `${limpar}\n${voltar}\n${clique}\nthis.clica = () => el('recarregar').onclick();\nthis.excluidas = () => excluidasDoGrafico;`,
    ctx
  );

  return { ctx, elementos, etapas };
}

test('Recarregar: recarrega, volta ao ciclo atual, limpa os filtros e consolida, nessa ordem', async () => {
  const { ctx, elementos, etapas } = montaTela(3);

  await ctx.clica();
  assert.deepEqual(etapas, [
    'consolidarTudo(recarregar)',
    'recarregar',
    'desenhar',
    'consolidar',
  ]);
  assert.equal(elementos.compDe.value, 3);
  assert.equal(elementos.compAte.value, 3);
  assert.equal(elementos.somenteDif.value, 'N');
  assert.deepEqual(Object.keys(ctx.Estado.filtroTexto), []);
  assert.equal(ctx.Estado.selecionados.size, 0);
  assert.deepEqual(Object.keys(ctx.Estado.ordenacaoPorTabela), []);
  assert.equal(ctx.Estado.ordComp.k, 'total');
  assert.equal(ctx.excluidas().join(), 'Contabilidade');
  assert.equal(ctx.Estado.fechados.db, false);
});

test('carga com falha para tudo: não navega, não limpa nem consolida', async () => {
  const { ctx, etapas, elementos } = montaTela(3, { cargaOk: false });

  await ctx.clica();
  assert.deepEqual(etapas, ['consolidarTudo(recarregar)', 'recarregar']);
  assert.equal(elementos.compDe, undefined);
  assert.deepEqual(Object.keys(ctx.Estado.filtroTexto), ['nome']);
});

test('sem ciclo atual: limpa os filtros e deixa De/Até vazios, como a página abre', async () => {
  const { ctx, elementos } = montaTela(-1);

  await ctx.clica();
  assert.equal(elementos.compDe.value, '');
  assert.equal(elementos.compAte.value, '');
  assert.deepEqual(Object.keys(ctx.Estado.filtroTexto), []);
});

test('consolidarTudo chama depoisDaCarga entre a recarga e a varredura', async () => {
  const funcao = trechoAte(formulario, 'async function consolidarTudo(', '\n}\n');

  const roda = async (idxHoje) => {
    const passos = [];

    const botao = {
      disabled: false,
      title: '',
      classList: { add() {}, remove() {} },
      getAttribute: () => '',
      setAttribute() {},
    };

    const ctx = {
      Estado: { idxHoje, simulando: false, gravandoAjuste: false, lancamentos: [] },
      mostrarToast() {},
      desenhar: () => passos.push('desenhar'),
      load: async () => {
        passos.push('recarga');

        return true;
      },
      // primeira etapa da varredura: para aqui, o que importa é a ordem até ela
      estenderPraSempre: async () => {
        passos.push('varredura');
        throw Error('fim do teste');
      },
    };

    vm.runInNewContext(`${funcao}\nthis.consolidarTudo = consolidarTudo;`, ctx);
    await ctx.consolidarTudo(botao, () => passos.push('depoisDaCarga'));

    return passos;
  };

  // Com ciclo atual: recarga, depoisDaCarga, varredura, nessa ordem (o desenhar final vem da falha forçada).
  assert.deepEqual(await roda(2), ['recarga', 'depoisDaCarga', 'varredura', 'desenhar']);
  // Hoje fora de qualquer ciclo: depoisDaCarga ainda roda, a varredura não.
  assert.deepEqual(await roda(-1), ['recarga', 'depoisDaCarga']);
});

test('recarga automática só lê: recarregarDados recarrega em silêncio; o relógio nunca clica no botão', async () => {
  const monta = ({ ultimaCarga, ultimaConsolidacao }) => {
    const chamadas = [];
    const classes = new Set();
    let tick;

    const bt = {
      disabled: false,
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      onclick: () => chamadas.push('CLIQUE-DO-BOTAO'),
    };

    const ctx = {
      Estado: {
        ultimaCarga,
        ultimaConsolidacao,
        selecionados: new Set(),
        simulando: false,
      },
      el: (id) => (id === 'recarregar' ? bt : { style: { display: '' } }),
      document: { hidden: false, querySelector: () => null, activeElement: null },
      load: async (opcoes) => chamadas.push(['load', { ...opcoes }]),
      consolidarTudo: (...args) => chamadas.push(['consolidarTudo', { ...args[2] }]),
      setInterval: (fn) => (tick = fn),
    };

    const codigo = [
      trechoAte(inicializacao, 'async function recarregarDados() {', '\n}\n'),
      trechoAte(
        inicializacao,
        'const INTERVALO_RECARGA_AUTOMATICA_MS',
        '\n}, 30 * 1000);'
      ),
    ].join('\n');

    vm.runInNewContext(`${codigo}\nthis.recarregarDados = recarregarDados;`, ctx);

    return { ctx, bt, chamadas, classes, tick };
  };

  // recarregarDados: carga silenciosa, com o botão girando e liberado no fim
  const a = monta({ ultimaCarga: 1 });

  await a.ctx.recarregarDados();
  assert.deepEqual(a.chamadas, [['load', { silencioso: true }]]);
  assert.equal(a.bt.disabled, false);
  assert.equal(a.classes.size, 0);

  // botão ocupado: não recarrega
  const ocupado = monta({ ultimaCarga: 1 });

  ocupado.bt.disabled = true;
  await ocupado.ctx.recarregarDados();
  assert.deepEqual(ocupado.chamadas, []);

  // relógio: com 5 min desde a última carga recarrega em silêncio; antes disso não faz nada
  const agora = Date.now();
  const velha = monta({ ultimaCarga: agora - 6 * 60 * 1000, ultimaConsolidacao: agora });

  velha.tick();
  assert.deepEqual(velha.chamadas, [['load', { silencioso: true }]]);

  const recente = monta({ ultimaCarga: agora - 60 * 1000, ultimaConsolidacao: agora });

  recente.tick();
  assert.deepEqual(recente.chamadas, []);

  // 15 min desde a consolidação: consolida em silêncio (que já recarrega), nunca o clique do botão
  const vencida = monta({
    ultimaCarga: agora - 6 * 60 * 1000,
    ultimaConsolidacao: agora - 16 * 60 * 1000,
  });

  vencida.tick();
  assert.deepEqual(vencida.chamadas, [['consolidarTudo', { silencioso: true }]]);

  assert.match(
    regras,
    /a recarga automática de 5 minutos só lê, e a consolidação automática de 15 minutos/
  );
});

test('o botão verde é o único: Atual, Limpar filtros e Consolidar tudo não existem mais; o Recarregar faz tudo', () => {
  // O comportamento (recarrega, volta ao ciclo atual, limpa filtros, consolida) está nos testes
  // acima, que rodam o clique do Recarregar; a ausência dos botões antigos no HTML/JS/CSS não
  // é mais conferida por texto. Os botões do cabeçalho, na ordem, estão em navegador-estilos.test.js.
  assert.match(
    regras,
    /O botão verde \*\*Recarregar\*\* do cabeçalho \(mesmo ícone de setas\) faz, num só clique e nesta ordem: recarrega os dados do banco, volta De\/Até ao ciclo atual, limpa os filtros/
  );
  assert.match(
    regras,
    /Não existem mais botões "Atual", "Limpar filtros" nem "Consolidar tudo" separados\./
  );
});

test('Todas/Diferentes, Gráfico e Visualizações ficam no bloco de botões, antes da simulação', () => {
  // A ordem dos botões no cabeçalho (e que nenhum deles fica fora do bloco) é medida no
  // navegador em navegador-estilos.test.js (BOTOES); aqui, o menu de Visualizações e a regra.
  const menu = declaracoes(estilos, '.menuIcone', '');

  assert.ok(menu.includes('position: absolute'));
  assert.ok(menu.includes('top: calc(100% + 0.45rem)'));
  assert.match(
    regras,
    /\*\*Visualizações\*\* é um ícone \(olho\) no bloco de botões do cabeçalho, logo depois do Gráfico/
  );
  assert.match(
    regras,
    /\*\*Gráfico\*\* \(ícone de barras\) é botão só de ícone[^.]*no bloco de botões à direita do cabeçalho, junto dos demais\./
  );
  assert.match(
    regras,
    /Os botões \(cartões Nubank e Mercado Pago, Todas\/Diferentes, Gráfico, Visualizações, simulação, cadastro, recarregar, diagnóstico, nessa ordem;/
  );
});

test('navegação de ciclo quebra linha em vez de sobrepor o cabeçalho (no celular, medida em navegador-estilos.test.js)', () => {
  const mobile = fs.readFileSync('css/mobile.css', 'utf8');
  const nav = declaracoes(estilos, '#navComparar', '');

  assert.ok(nav.includes('display: flex') && nav.includes('flex-wrap: wrap'));
  assert.ok(nav.includes('flex-direction: row'));

  const fate = declaracoes(mobile, '#fate');

  assert.ok(fate.includes('flex: 1 1 0') && fate.includes('min-width: 9rem'));
});

test('menu de Visualizações fecha ao escolher, ao clicar fora e com Esc, e não sai da tela', () => {
  const codigo = trechoAte(
    graficos,
    'const itensDoMenuVis = ',
    "el('fechaVisualizacao').onclick"
  ).replace("el('fechaVisualizacao').onclick", '');

  const monta = ({ direita = 100 } = {}) => {
    const eventos = {};
    const registro = [];
    const foco = [];
    const elementos = {};

    const elemento = (id) => ({
      id,
      hidden: true,
      style: {},
      setAttribute: (k, v) => registro.push([id, k, v]),
      getBoundingClientRect: () => ({ right: direita }),
      querySelectorAll: () => [{ focus: () => foco.push('item') }],
      focus: () => foco.push(id),
      contains: (alvo) => alvo === id,
      addEventListener() {},
    });

    const ctx = {
      el: (id) => (elementos[id] ||= elemento(id)),
      document: {
        addEventListener: (tipo, fn) => (eventos[tipo] = fn),
        activeElement: null,
      },
      window: { innerWidth: 400 },
      abrirVisualizacao: (id) => registro.push(['abrir', id]),
    };

    vm.runInNewContext(codigo, ctx);

    return { ctx, eventos, registro, foco, menu: ctx.el('visMenu') };
  };

  // escolher um item: fecha o menu e só então abre a visualização
  const a = monta();

  a.menu.hidden = false;
  a.menu.onclick({ target: { closest: () => ({ dataset: { vis: 'reserva' } }) } });
  assert.equal(a.menu.hidden, true);
  assert.deepEqual(a.registro.slice(-2), [
    ['btVis', 'aria-expanded', 'false'],
    ['abrir', 'reserva'],
  ]);

  // clicar fora fecha; clicar no próprio ícone não
  const b = monta();

  b.menu.hidden = false;
  b.eventos.click({ target: 'visIcone' });
  assert.equal(b.menu.hidden, false);
  b.eventos.click({ target: 'fora' });
  assert.equal(b.menu.hidden, true);

  // Esc: fecha, devolve o foco ao botão e não deixa o Esc sair do Fin (preventDefault)
  const c = monta();
  let impediu = false;

  c.menu.hidden = false;
  c.eventos.keydown({ key: 'Escape', preventDefault: () => (impediu = true) });
  assert.deepEqual([c.menu.hidden, impediu, c.foco.at(-1)], [true, true, 'btVis']);

  // com o menu fechado, o Esc segue para sair do app
  const fechado = monta();

  fechado.eventos.keydown({
    key: 'Escape',
    preventDefault: () => assert.fail('menu fechado'),
  });

  // perto da borda direita, o menu é puxado para dentro da tela
  const d = monta({ direita: 450 });

  d.ctx.el('btVis').onclick({ stopPropagation() {} });
  assert.equal(d.menu.hidden, false);
  assert.equal(d.menu.style.left, '-58px'); // 400 - 8 - 450

  const e = monta({ direita: 100 });

  e.ctx.el('btVis').onclick({ stopPropagation() {} });
  assert.equal(e.menu.style.left, '');
});

test('recarga automática é silenciosa: sem toast, e falha não troca a tela pelo erro', async () => {
  const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');

  const codigo = trechoAte(
    dadosUi,
    'async function load({ silencioso = false } = {}) {',
    '\n}\n'
  );

  const rodar = async (falhar, opcoes) => {
    const toasts = [];
    const out = { innerHTML: 'tabela antiga' };

    const ctx = {
      API: 'https://x',
      LIMIAR_CARGA_LENTA_MS: 0,
      Estado: { ciclos: [], lancamentos: [] },
      performance: { now: () => 0 },
      console: { info() {}, warn() {} },
      carregarDados: async () => {
        if (falhar) throw Error('sem rede');

        return { lancamentosCrus: [], diagnosticoDeDados: {} };
      },
      atualizarCombos() {},
      desenhar() {},
      desenharQuandoLivre() {},
      atualizarBotaoDiagnostico() {},
      escapeHtml: String,
      mostrarToast: (titulo) => toasts.push(titulo),
      el: (id) => (id === 'out' ? out : { textContent: '' }),
    };

    vm.runInNewContext(`${codigo}\nthis.load = load;`, ctx);
    const ok = await ctx.load(opcoes);

    return { ok, toasts, out: out.innerHTML };
  };

  // Limiar 0: toda carga conta como lenta, então o toast apareceria se não fosse silenciosa.
  assert.deepEqual(await rodar(false, { silencioso: true }), {
    ok: true,
    toasts: [],
    out: 'tabela antiga',
  });
  assert.deepEqual(await rodar(true, { silencioso: true }), {
    ok: false,
    toasts: [],
    out: 'tabela antiga',
  });
  // Clique manual continua avisando.
  assert.deepEqual((await rodar(false)).toasts, ['Carga lenta']);
  const falhaManual = await rodar(true);

  assert.deepEqual(falhaManual.toasts, ['Não foi possível carregar']);
  assert.match(falhaManual.out, /Falhou: sem rede/);
  assert.match(regras, /É silenciosa: não mostra toast nem toca som/);
});
