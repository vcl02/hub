// fin.pra_sempre (migration 31): recorrência sem data pra acabar, no mesmo padrão de
// Reserva/Comprometido — checkbox, coluna com toggle propagado, filtro por clique — e
// escondida enquanto o banco não tem a coluna.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');
const { declaracoes, regras: regrasCss } = require('./helpers/regras-css');

const pagina = fs.readFileSync('index.html', 'utf8');
const estado = fs.readFileSync('js/app-state.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const migration = fs.readFileSync('migrations/31-pra-sempre.sql', 'utf8');

function colunas({ temPraSempre }) {
  const inicio = estado.indexOf('const COLS = [');
  const fim = estado.indexOf('\nconst isMobile');
  const ctx = { Estado: { temPraSempre } };

  vm.runInNewContext(
    `${estado.slice(inicio, fim)}\nthis.colunasAtivas = colunasAtivas;`,
    ctx
  );

  return (id) => ctx.colunasAtivas(id).map(([chave]) => chave);
}

test('coluna aparece depois de Comprometido só quando o banco já tem fin.pra_sempre', () => {
  const com = colunas({ temPraSempre: true })('db');

  assert.equal(com[com.indexOf('comprometido') + 1], 'pra_sempre');
  assert.ok(colunas({ temPraSempre: true })('bk').includes('pra_sempre'));
  assert.ok(!colunas({ temPraSempre: false })('db').includes('pra_sempre'));
});

// O cadastro de verdade (js/form.js) sem navegador: a tela entrega o modal e as faturas, e o banco só registra o que a função manda gravar.
async function montarCadastro({ temPraSempre }) {
  const { ctx, bruto } = carregarTela({
    hoje: '2026-10-20',
    dados: {
      fin: [],
      fin_ciclo: [{ id: 1, inicio: '2026-09-15', fim: null }],
      fin_meta: [],
    },
  });

  await bruto('carregarDados()');
  trazer(ctx, 'js/form.js', [
    'submeteEdicaoLancamento',
    'submeteNovoLancamento',
    'abreModalNovo',
    'atualizaModoFrequencia',
  ]);
  trazer(ctx, 'js/interactions.js', ['reclassificaPeriodo']);

  const el = (id) => ctx.document.getElementById(id);
  const patches = [];

  ctx.Option = function (texto, valor) {
    return { textContent: texto, value: valor, remove() {} };
  };

  Object.assign(el('fParcelas'), { value: '1', querySelector: () => null, add() {} });
  // O reset do formulário volta o checkbox ao padrão do HTML (desmarcado, conferido no teste do cadastro)
  el('formNovo').reset = () => {
    el('fPraSempre').checked = false;
  };

  el('fData').focus = () => {};

  el('fFaturasWrap').scrollIntoView = () => {};

  bruto(`(() => {
    Estado.temPraSempre = ${temPraSempre};
    globalThis.sinalPositivo = false;
    globalThis.modalNovo = { dataset: {}, open: false, showModal() { this.open = true; }, close() { this.open = false; } };
    globalThis.salvas = [];
    idsFaturasDoFormulario = () => [];
    atualizarFaturasDoFormulario = () => {};
    salvaLancamentoParceladoNoBanco = async (pedido) => { salvas.push(pedido); return ''; };
    animaTrocaDeEstado = () => {};
    popularCategoriasNoForm = () => {};
    popularNomesNoForm = () => {};
    atualizaSinalUI = () => {};
    sugereModoValorParcelas = () => {};
  })()`);

  const fetchDosDados = ctx.fetch;

  ctx.fetch = async (url, opcoes = {}) => {
    if (opcoes.method !== 'PATCH') return fetchDosDados(url, opcoes);
    const id = Number(new URL(url).searchParams.get('id').slice(3));

    patches.push(JSON.parse(opcoes.body));

    return { ok: true, status: 200, text: async () => JSON.stringify([{ id }]) };
  };

  const preencher = (praSempre) => {
    const campos = {
      fNome: 'Spotify',
      fCateg: 'Assinatura',
      fData: '2026-10-20',
      fValor: '20,00',
      fFreq: '',
    };

    for (const [id, valor] of Object.entries(campos)) el(id).value = valor;

    for (const id of ['fCred', 'fPago', 'fReserva', 'fComprometido'])
      el(id).checked = false;
    el('fPraSempre').checked = praSempre;
  };

  return { ctx, bruto, el, patches, preencher };
}

const spotify = () => ({
  id: 7,
  nome: 'Spotify',
  categ: 'Assinatura',
  v: -10,
  data: '2026-10-20',
  cred: false,
});

test('cadastro: checkbox desmarcado, herdado por Editar/Duplicar, escondido sem a coluna', async () => {
  const com = await montarCadastro({ temPraSempre: true });

  com.el('fPraSempre').checked = true; // sobra do cadastro anterior
  com.bruto('abreModalNovo')();
  assert.equal(com.el('fPraSempreRotulo').hidden, false);
  assert.equal(com.el('fPraSempre').checked, false); // cadastro novo recomeça desmarcado

  com.bruto('abreModalNovo')({ ...spotify(), pra_sempre: true }); // Duplicar herda
  assert.equal(com.el('fPraSempre').checked, true);
  com.bruto('abreModalNovo')({ ...spotify(), pra_sempre: false }, true); // Editar herda
  assert.equal(com.el('fPraSempre').checked, false);

  const sem = await montarCadastro({ temPraSempre: false });

  sem.bruto('abreModalNovo')();
  assert.equal(sem.el('fPraSempreRotulo').hidden, true);

  // O checkbox nasce sem o atributo "checked" no HTML (a tag lida como texto; o resto do rótulo está em preferencias-interface.test.js)
  const posicao = pagina.indexOf('id="fPraSempre"');

  assert.ok(posicao >= 0, 'checkbox fPraSempre não está em index.html');

  const tag = pagina.slice(
    pagina.lastIndexOf('<input', posicao),
    pagina.indexOf('>', posicao)
  );

  assert.ok(tag.includes('type="checkbox"') && !tag.includes('checked'), tag);
});

test('cadastro novo manda pra_sempre ao lote; Editar grava no PATCH; sem a coluna o campo nem vai', async () => {
  const com = await montarCadastro({ temPraSempre: true });

  com.preencher(true);
  await com.bruto('submeteNovoLancamento')();
  com.preencher(false);
  await com.bruto('submeteNovoLancamento')();
  assert.deepEqual(
    JSON.parse(JSON.stringify(com.bruto('salvas'))).map((p) => p.praSempre),
    [true, false]
  );

  com.preencher(true);
  await com.bruto('submeteEdicaoLancamento')(spotify());
  assert.equal(com.patches[0].pra_sempre, true);

  const sem = await montarCadastro({ temPraSempre: false });

  sem.preencher(true);
  await sem.bruto('submeteEdicaoLancamento')(spotify());
  assert.equal(sem.patches.length, 1);
  assert.ok(!('pra_sempre' in sem.patches[0]));
});

test('lote real grava pra_sempre em todas as parcelas só quando a coluna existe', async () => {
  const inicio = formulario.indexOf('async function salvaLancamentoParceladoNoBanco(');
  const fim = formulario.indexOf('\n}\n', inicio) + 3;

  const rodar = async (temPraSempre) => {
    const inserts = [];

    const ctx = {
      Estado: { lancamentos: [], ciclos: [], temPraSempre },
      ehAntecipacaoFatura: () => false,
      dataISO: (v) => v,
      dataDaOcorrencia: (d, p) => `2026-1${p}-15`,
      periodoDaFatura: () => -1,
      periodoDoLancamento: () => null,
      ehCategoriaInvestimento: () => false,
      periodoDoDebito: () => -1,
      inserirLancamentos: async (payloads) => {
        inserts.push(...payloads);

        return payloads.map((p, i) => ({ ...p, id: 10 + i }));
      },
      proximaRecorrencia: async () => 80,
      atualizarLancamentos: async () => {},
    };

    vm.runInNewContext(
      `${formulario.slice(inicio, fim)}\nthis.salvar = salvaLancamentoParceladoNoBanco;`,
      ctx
    );
    await ctx.salvar({
      nome: 'Spotify',
      categ: 'Assinatura',
      freq: 'Mensal',
      data: '2026-10-07',
      cred: true,
      pago: false,
      reserva: false,
      comprometido: false,
      praSempre: true,
      parcelas: 2,
      valores: [-20, -20],
    });

    return inserts;
  };

  assert.ok((await rodar(true)).every((p) => p.pra_sempre === true));
  assert.ok((await rodar(false)).every((p) => !('pra_sempre' in p)));
});

test('tabela: filtro Sempre/Com fim, tooltip e toggle propagado com o rótulo Pra sempre', async () => {
  const t = carregarTela();

  assert.deepEqual(
    JSON.parse(JSON.stringify(t.bruto('ESTADOS_FILTRO_CLIQUE').pra_sempre)),
    [
      ['S', 'Sempre', 'Só os pra sempre', 'flagPraSempre'],
      ['N', 'Com fim', 'Só os que têm fim', ''],
    ]
  );
  assert.equal(
    t.bruto('PERGUNTA_DA_COLUNA').pra_sempre,
    'Isso se repete sem data pra acabar?'
  );

  // O clique no selo (js/interactions.js) alterna o bit em todo o compromisso e o aviso diz "Pra sempre"
  const inicio = interacoes.indexOf('const ROTULO_FLAG_TOGGLE = {');
  const fim = interacoes.indexOf('\n});\n', inicio) + 5;
  const gravados = [];
  const toasts = [];

  const lancamentos = [
    { id: 1, nome: 'Spotify', categ: 'Assinatura' },
    { id: 2, nome: 'Spotify', categ: 'Assinatura' },
  ];

  let ouvinte;

  const contexto = {
    el: () => ({
      addEventListener: (_, f) => {
        ouvinte = f;
      },
    }),
    Estado: { lancamentos, simulando: false },
    togglesNoAr: new Set(),
    COR_FLAG: { pra_sempre: 'flagPraSempre' },
    semAcento: (v) => String(v).toLowerCase(),
    categoriasSeparadas: (c) => [c],
    atualizarLancamentos: async (ids, campos) => gravados.push([ids, { ...campos }]),
    desenhar() {},
    mostrarToast: (...args) => toasts.push(args.join('|')),
  };

  vm.runInNewContext(interacoes.slice(inicio, fim), contexto);

  const classes = new Set();

  const selo = {
    dataset: { togFlag: 'pra_sempre:1' },
    classList: { toggle: (c, ligado) => (ligado ? classes.add(c) : classes.delete(c)) },
    style: {},
  };

  await ouvinte({ target: { closest: () => selo }, stopImmediatePropagation() {} });
  assert.equal(selo.textContent, 'Pra sempre');
  assert.deepEqual([...classes], ['flagPraSempre']);
  assert.deepEqual(JSON.parse(JSON.stringify(gravados)), [
    [[1, 2], { pra_sempre: true }],
  ]);
  assert.deepEqual(toasts, ['Atualizado|Pra sempre marcado em 2 lançamentos "Spotify".']);
});

test('tabela: cor azul, largura da coluna e o filtro ligado que não pinta por cima da cor', () => {
  assert.ok(declaracoes(estilos, '.flagPraSempre').includes('color: #6cb8f0'));
  assert.ok(declaracoes(estilos, '.col-pra_sempre').includes('width: 7rem'));
  assert.ok(
    regrasCss(estilos).some(
      (r) =>
        r.seletores.some(
          (seletor) =>
            seletor.startsWith('.filtroEstado.ligado:not(') &&
            seletor.includes('.flagPraSempre')
        ) && r.declaracoes.includes('color: var(--fg)')
    )
  );
});

test('migration 31: coluna bool falsa por padrão e marca só séries com Frequência até dez/2029', () => {
  assert.match(
    migration,
    /alter table public\.fin add column if not exists pra_sempre boolean not null default false;/
  );
  assert.match(
    migration,
    /having max\(data\) between date '2029-12-01' and date '2029-12-31'\s*\n\s*and count\(freq\) > 0/
  );
  assert.match(migration, /!~\* '\(investimento\|antecipa\|pagamento fatura\|ajuste\)'/);
  assert.doesNotMatch(migration.replace(/--[^\n]*/g, ''), /\$\$/);
  assert.ok(!migration.split('\n').some((l) => /^\s*--.*;/.test(l)));
  assert.match(
    regras,
    /\*\*Pra sempre\*\* \(`fin\.pra_sempre`, migration 31\) separa a recorrência \*\*sem data pra acabar\*\*/
  );
  assert.match(regras, /`migrations\/31-pra-sempre\.sql` cria `fin\.pra_sempre`/);
});
