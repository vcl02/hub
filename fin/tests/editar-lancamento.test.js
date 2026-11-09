// Regressão: barra de seleção ganha "Editar" pra transformar Débito <-> Crédito (e
// escolher fatura/data) numa linha já existente, via UPDATE em vez de criar um lançamento
// novo. Cobre também o bug de reclassificaPeriodo que essa feature expôs: um Crédito sem
// 'data' (vindo do Backlog) precisa classificar certo só com a fatura.
// As funções de verdade rodam num contexto sem navegador; o fluxo na tela (clicar em Editar, salvar, corpo gravado, a
// seleção limpa ao fechar o modal) está em navegador-marcas.test.js.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');
const { declaracoes } = require('./helpers/regras-css');

const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

const CICLOS = [
  { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
  { id: 2, inicio: '2026-10-15', fim: null },
];

async function montar() {
  const tela = carregarTela({
    hoje: '2026-10-20',
    dados: { fin: [], fin_ciclo: CICLOS, fin_meta: [] },
  });

  const { ctx, bruto } = tela;

  await bruto('carregarDados()');
  trazer(ctx, 'js/form.js', [
    'submeteEdicaoLancamento',
    'submeteNovoLancamento',
    'abreModalNovo',
    'atualizaModoFrequencia',
  ]);
  trazer(ctx, 'js/interactions.js', [
    'reclassificaPeriodo',
    'atualizaBarraSelecao',
    'linhaDaChaveSelecao',
    'movimentoAporteOuResgateDoCiclo',
  ]);

  const chamadas = [];
  const el = (id) => ctx.document.getElementById(id);

  ctx.Option = function (texto, valor) {
    return { textContent: texto, value: valor, remove() {} };
  };

  el('formNovo').reset = () => {};

  el('fFaturasWrap').scrollIntoView = () => {};

  // O que a tela entrega à função: o modal, o sinal do valor, as faturas escolhidas e o banco (só registra a chamada)
  bruto(`(() => {
    globalThis.sinalPositivo = false;
    globalThis.modalNovo = { dataset: {}, open: false, showModal() { this.open = true; }, close() { this.open = false; } };
    globalThis.faturasEscolhidas = [];
    globalThis.indiceDoAjuste = (chave) => +String(chave).split(':')[1];
    idsFaturasDoFormulario = () => faturasEscolhidas;
    atualizarFaturasDoFormulario = () => {};
    animaTrocaDeEstado = () => {};
    popularCategoriasNoForm = () => {};
    popularNomesNoForm = () => {};
    atualizaSinalUI = () => {};
    sugereModoValorParcelas = () => {};
  })()`);

  // O banco falso: cada PATCH em fin vira uma chamada registrada (id e campos) e devolve a linha; ctx.falhar faz dar erro
  const fetchDosDados = ctx.fetch;

  ctx.fetch = async (url, opcoes = {}) => {
    if (opcoes.method !== 'PATCH') return fetchDosDados(url, opcoes);
    const id = Number(new URL(url).searchParams.get('id').slice(3));

    if (ctx.falhar) return { ok: false, status: 500, text: async () => 'sem rede' };
    chamadas.push({ id, campos: JSON.parse(opcoes.body) });

    return { ok: true, status: 200, text: async () => JSON.stringify([{ id }]) };
  };

  return { ctx, bruto, chamadas, el };
}

function preencher(el, campos) {
  const padrao = {
    fNome: 'Mercado',
    fCateg: 'Mercado',
    fData: '2026-10-20',
    fValor: '50,00',
    fFreq: '',
  };

  for (const [id, valor] of Object.entries({ ...padrao, ...campos }))
    el(id).value = valor;

  for (const id of ['fCred', 'fPago', 'fReserva', 'fComprometido', 'fPraSempre'])
    el(id).checked = !!campos[id];
}

const linha = (extra = {}) => ({
  id: 7,
  nome: 'Mercado',
  categ: 'Mercado',
  v: -10,
  data: '2026-10-20',
  cred: false,
  ...extra,
});

test('Editar só aparece com exatamente 1 linha real/simulada selecionada, nunca ajuste sintético nem fatura', async () => {
  const { bruto, el } = await montar();

  const escondido = (chaves) => {
    bruto(`Estado.selecionados = new Map(${JSON.stringify(chaves.map((c) => [c, 10]))})`);
    bruto(`Estado.lancamentos = [${JSON.stringify(linha({ id: '7' }))}]`);
    bruto('atualizaBarraSelecao()');

    return el('seledit').hidden;
  };

  assert.equal(escondido(['7']), false); // uma linha real
  assert.equal(escondido(['7', '8']), true); // várias: só soma
  assert.equal(escondido(['sug:2']), true); // ajuste sintético
  assert.equal(escondido(['fat:2026-11-10']), true); // fatura
});

test('abre o modal de cadastro em modo edição: título, id da linha e sem Vezes/Dividir', async () => {
  const { bruto, el, ctx } = await montar();
  const abre = bruto('abreModalNovo');
  const prefill = linha({ v: -50, fatura: null });

  abre(prefill, true);
  assert.equal(el('tituloNovo').textContent, 'Editar lançamento');
  assert.equal(ctx.modalNovo.dataset.editandoId, '7');
  assert.equal(ctx.modalNovo.open, true);
  assert.equal(el('parcelasLinha').hidden, true); // Vezes/Dividir somem
  assert.equal(el('fParcelas').value, 1);
  assert.equal(el('fNome').value, 'Mercado');
  assert.equal(el('fValor').value, '50,00');

  abre(prefill); // Duplicar: sem id de edição, Vezes/Dividir de volta
  assert.equal(el('tituloNovo').textContent, 'Duplicar lançamento');
  assert.equal(ctx.modalNovo.dataset.editandoId, undefined);
  assert.equal(el('parcelasLinha').hidden, false);

  abre(); // Novo
  assert.equal(el('tituloNovo').textContent, 'Novo lançamento');
});

test('Editar mantém a Frequência editável: com ela, Vezes vira a contagem da série e fica desativado', async () => {
  const { bruto, el, ctx } = await montar();
  const vezes = el('fParcelas');

  ctx.modalNovo.dataset.editandoId = '7';
  Object.assign(vezes, {
    value: '1',
    added: [],
    querySelector: () => null,
    add(o) {
      this.added.push(o);
    },
  });
  el('fData').value = '2026-10-15';
  el('fFreq').value = 'Mensal';
  bruto('atualizaModoFrequencia')();
  assert.equal(el('parcelasLinha').hidden, true);
  assert.equal(vezes.disabled, true);
  assert.equal(vezes.value, 'serie');
  assert.equal(vezes.added[0].textContent, '75x até 2032');
});

test('salvar com o modal em modo edição vai para a edição da linha, nunca cria lançamento novo', async () => {
  const { bruto, el, ctx, chamadas } = await montar();

  bruto(`Estado.lancamentos = [${JSON.stringify(linha())}]`);
  ctx.modalNovo.dataset.editandoId = '7';
  preencher(el, { fNome: 'Novo nome' });
  await bruto('submeteNovoLancamento')();
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].id, 7);
  assert.equal(chamadas[0].campos.nome, 'Novo nome');
});

test('crédito exige fatura (e antecipação, a fatura quitada); sem ela nada é gravado', async () => {
  const { bruto, el, ctx, chamadas } = await montar();
  const r = linha({ data: null });

  preencher(el, { fCred: true });
  ctx.faturasEscolhidas = [];
  await bruto('submeteEdicaoLancamento')(r);
  assert.equal(el('erroNovo').textContent, 'Escolha a fatura dessa compra.');
  assert.equal(chamadas.length, 0);
  assert.equal(el('salvaNovo').disabled, false);

  preencher(el, { fCateg: 'Antecipação de fatura' });
  await bruto('submeteEdicaoLancamento')(r);
  assert.equal(
    el('erroNovo').textContent,
    'Escolha a fatura que esta antecipação está quitando.'
  );
  assert.equal(chamadas.length, 0);
});

test('vira Crédito com fatura: grava a fatura, atualiza a linha, reclassifica e fecha o modal', async () => {
  const { bruto, el, ctx, chamadas } = await montar();
  const r = linha();

  preencher(el, { fCred: true });
  ctx.faturasEscolhidas = ['2026-11-10'];
  ctx.modalNovo.open = true;
  await bruto('submeteEdicaoLancamento')(r);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].campos.cred, true);
  assert.equal(chamadas[0].campos.fatura, '2026-11-10');
  assert.equal(chamadas[0].campos.valor, -50);
  assert.equal(r.cred, true);
  assert.equal(r.fatura, '2026-11-10');
  assert.equal(r.v, -50);
  assert.equal(r.periodoIdx, 1); // fatura de 10/11 cai no ciclo aberto
  assert.equal(ctx.modalNovo.open, false);
});

test('desmarcar Crédito reenvia "fatura" como null, pra apagar a antiga no banco', async () => {
  const { bruto, el, ctx, chamadas } = await montar();
  const r = linha({ cred: true, fatura: '2026-11-10' });

  preencher(el, { fCred: false });
  ctx.faturasEscolhidas = ['2026-11-10'];
  await bruto('submeteEdicaoLancamento')(r);
  assert.equal(chamadas[0].campos.cred, false);
  assert.ok('fatura' in chamadas[0].campos);
  assert.equal(chamadas[0].campos.fatura, null);
  assert.equal(r.fatura, null);
});

test('na simulação a linha muda só na memória: nenhuma gravação no banco', async () => {
  const { bruto, el, chamadas } = await montar();
  const r = linha({ _sim: true });

  preencher(el, { fNome: 'Simulado' });
  await bruto('submeteEdicaoLancamento')(r);
  assert.equal(chamadas.length, 0);
  assert.equal(r.nome, 'Simulado');
});

test('falha ao gravar mostra o erro e deixa o modal aberto e o botão liberado', async () => {
  const { bruto, el, ctx } = await montar();
  const r = linha();

  ctx.falhar = true;
  preencher(el, {});
  ctx.modalNovo.open = true;
  await bruto('submeteEdicaoLancamento')(r);
  assert.equal(el('erroNovo').textContent, 'Falhou ao salvar: atualizar: 500 sem rede');
  assert.equal(ctx.modalNovo.open, true);
  assert.equal(el('salvaNovo').disabled, false);
  assert.equal(r.nome, 'Mercado'); // a linha local não mudou
});

// reclassificaPeriodo real, com os ciclos reais da carga (nada reescrito à mão).
test('Crédito sem "data" mas com "fatura" (ex.: veio do Backlog) classifica pelo vencimento, não cai no Backlog', async () => {
  const { bruto } = await montar();
  const r = { cred: true, data: null, fatura: '2026-10-20' };

  bruto('reclassificaPeriodo')(r);
  assert.equal(r.periodoIdx, 1);
});

test('sem "data" nem "fatura": continua no Backlog (periodoIdx null)', async () => {
  const { bruto } = await montar();
  const r = { cred: true, data: null, fatura: null };

  bruto('reclassificaPeriodo')(r);
  assert.equal(r.periodoIdx, null);
});

test('Débito continua classificando só pela própria "data", ignorando fatura', async () => {
  const { bruto } = await montar();
  const r = { cred: false, data: '2026-10-09', fatura: '2026-10-20' };

  bruto('reclassificaPeriodo')(r);
  assert.equal(r.periodoIdx, 0);
});

test('estilo do botão Editar reaproveita o visual discreto do Duplicar', () => {
  for (const estado of ['', ':hover', ':disabled']) {
    const editar = declaracoes(estilos, `#selbar #seledit${estado}`);

    assert.ok(editar.length > 0, estado);
    assert.deepEqual(editar, declaracoes(estilos, `#selbar #seldup${estado}`), estado);
  }
});

test('regra documentada em REGRAS.md', () => {
  assert.match(
    regras,
    /a barra de seleção ganha \*\*Editar\*\*, ao lado de Duplicar\/Excluir/
  );
  assert.match(regras, /sem campo Vezes\/Dividir, que só serve pra gerar parcelas novas/);
  assert.match(regras, /marcar Crédito exige escolher a fatura/);
  assert.match(
    regras,
    /então funciona igual para um lançamento vindo do Backlog, sem data, ou de qualquer ciclo/
  );
  assert.match(regras, /desmarcar Crédito limpa a fatura da linha \(`fatura: null`\)/);
  assert.match(regras, /mesmo Editar\/Duplicar\/Excluir na barra de seleção/);
});
