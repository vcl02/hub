// Regressão: Frequência no cadastro gera a série da 1ª ocorrência até 31/12/2032 (Vezes
// fica desativado mostrando a contagem) e, no Crédito, só pede a 1ª fatura — as seguintes
// avançam mês a mês a partir dela. Sem Frequência, Vezes volta a ser editável e cada
// parcela escolhe sua fatura. Na tela (Vezes desativado e só a 1ª fatura, data exigida, a série até dez/2032 e o cadastro
// voltando ao normal): navegador-marcas.test.js.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');
const { etiquetas } = require('./helpers/html');
const { declaracoes, regras: regrasCss } = require('./helpers/regras-css');

const compartilhado = fs.readFileSync('js/shared.js', 'utf8');
const pagina = fs.readFileSync('index.html', 'utf8');
const estilos = fs.readFileSync('css/forms.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

function regrasDaSerie() {
  const contexto = {
    Estado: { ciclos: [], faturas: [] },
    MESES: [],
    document: { getElementById: () => ({}) },
    setTimeout,
    clearTimeout,
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${compartilhado}\nglobalThis.r = { ocorrenciasAteLimite, faturaDaOcorrencia, dataDaOcorrencia };`,
    contexto
  );

  return contexto.r;
}

test('conta as ocorrências da 1ª data até o limite, inclusive, conforme a Frequência', () => {
  const r = regrasDaSerie();

  assert.equal(r.ocorrenciasAteLimite('2026-10-15', 'Mensal', '2032-12-31'), 75); // out/2026..dez/2032
  assert.equal(r.ocorrenciasAteLimite('2029-12-31', 'Mensal', '2029-12-31'), 1); // o próprio limite conta
  assert.equal(r.ocorrenciasAteLimite('2029-12-01', 'Semanal', '2029-12-31'), 5); // 01, 08, 15, 22, 29
  assert.equal(r.ocorrenciasAteLimite('2029-01-31', 'Semestral', '2029-12-31'), 2); // jan e jul
  assert.equal(r.ocorrenciasAteLimite('2027-03-10', 'Anual', '2029-12-31'), 3); // 2027, 2028, 2029
});

test('a 1ª ocorrência sempre é gravada, mesmo se já passar do limite', () => {
  const r = regrasDaSerie();

  assert.equal(r.ocorrenciasAteLimite('2030-02-01', 'Mensal', '2029-12-31'), 1);
});

test('fatura de cada ocorrência = 1ª fatura avançada pelos meses de calendário entre as datas', () => {
  const r = regrasDaSerie();
  const dataInicial = '2026-10-15';

  const faturas = [0, 1, 2, 3].map((p) =>
    r.faturaDaOcorrencia(
      '2026-11-12',
      dataInicial,
      r.dataDaOcorrencia(dataInicial, p, 'Mensal')
    )
  );

  assert.deepEqual(Array.from(faturas), [
    '2026-11-12',
    '2026-12-12',
    '2027-01-12',
    '2027-02-12',
  ]);
  // Semanal: só troca de fatura quando a data da ocorrência vira o mês.
  assert.equal(
    r.faturaDaOcorrencia('2026-11-12', '2026-10-25', '2026-10-31'),
    '2026-11-12'
  );
  assert.equal(
    r.faturaDaOcorrencia('2026-11-12', '2026-10-25', '2026-11-01'),
    '2026-12-12'
  );
  // Sempre a partir da 1ª: vencimento dia 31 não vai encurtando depois de passar por fevereiro.
  assert.equal(
    r.faturaDaOcorrencia('2027-01-31', '2026-12-05', '2027-01-05'),
    '2027-02-28'
  );
  assert.equal(
    r.faturaDaOcorrencia('2027-01-31', '2026-12-05', '2027-02-05'),
    '2027-03-31'
  );
});

const CICLOS = [{ id: 1, inicio: '2026-09-15', fim: null }];

// O cadastro de verdade (form.js) sem navegador: o que a tela entrega (modal, sinal, faturas escolhidas) é simulado e o
// banco só registra o que a função manda gravar.
async function montarCadastro() {
  const { ctx, bruto } = carregarTela({
    hoje: '2026-10-20',
    dados: { fin: [], fin_ciclo: CICLOS, fin_meta: [] },
  });

  await bruto('carregarDados()');
  trazer(ctx, 'js/form.js', [
    'submeteNovoLancamento',
    'abreModalNovo',
    'atualizaModoFrequencia',
  ]);

  const el = (id) => ctx.document.getElementById(id);
  const vezes = el('fParcelas');

  ctx.Option = function (texto, valor) {
    return { textContent: texto, value: valor, remove() {} };
  };

  Object.assign(vezes, { value: '1', querySelector: () => null, add() {} });
  el('formNovo').reset = () => {};

  el('fData').focus = () => {};

  el('fFaturasWrap').scrollIntoView = () => {};

  bruto(`(() => {
    globalThis.sinalPositivo = false;
    globalThis.modalNovo = { dataset: {}, open: false, showModal() { this.open = true; }, close() { this.open = false; } };
    globalThis.faturasEscolhidas = [];
    globalThis.salvas = [];
    globalThis.chamadasFaturas = [];
    idsFaturasDoFormulario = () => faturasEscolhidas;
    atualizarFaturasDoFormulario = (ids) => chamadasFaturas.push({ ids, vezes: el('fParcelas').value });
    salvaLancamentoParceladoNoBanco = async (pedido) => { salvas.push(pedido); return ''; };
    animaTrocaDeEstado = () => {};
    popularCategoriasNoForm = () => {};
    popularNomesNoForm = () => {};
    atualizaSinalUI = () => {};
    sugereModoValorParcelas = () => {};
  })()`);

  return { ctx, bruto, el };
}

function preencherCadastro(el, campos) {
  const padrao = {
    fNome: 'Escola',
    fCateg: 'Mercado',
    fData: '2026-10-15',
    fValor: '',
    fFreq: 'Mensal',
  };

  for (const [id, valor] of Object.entries({ ...padrao, ...campos }))
    el(id).value = valor;

  for (const id of [
    'fCred',
    'fPago',
    'fReserva',
    'fComprometido',
    'fPraSempre',
    'fDivide',
  ])
    el(id).checked = !!campos[id];
}

test('Frequência vem antes de Vezes e os dois ficam fora do grid dos demais campos, em linha fixa', () => {
  const elementos = etiquetas(pagina);
  const posicao = (id) => elementos.findIndex((e) => e.attrs.id === id);
  const ordem = ['fFreqWrap', 'parcelasLinha', 'fParcelasWrap'].map(posicao);

  assert.ok(posicao('fFreq') >= 0 && posicao('fFreq') < posicao('fParcelas'));
  assert.ok(ordem[0] >= 0 && ordem[0] < ordem[1] && ordem[1] < ordem[2], String(ordem));

  for (const alvo of ['fFreq', 'fCateg'])
    assert.ok(
      elementos.some((e) => e.tag === 'label' && e.attrs.for === alvo),
      alvo
    );
  assert.deepEqual(declaracoes(estilos, '.parcelasLinha', ''), [
    'display: flex',
    'gap: 0.6rem',
    'align-items: end',
  ]);
  // sem a antiga área "freq" do grid nem regra que mudasse a linha conforme o conteúdo
  assert.ok(
    regrasCss(estilos).every(
      (r) =>
        !r.seletores.some((s) => s.startsWith('.parcelasLinha:has(')) &&
        !r.declaracoes.some(
          (d) => d.startsWith('grid-template-areas') && d.includes('freq')
        )
    )
  );
});

test('a regra fica só num hover do rótulo: nenhum botão nem modal de ajuda no cadastro', () => {
  const nomes = ['ajudaFrequencia', 'ajudaCategorias', 'btAjudaMini', 'modalAjuda'];
  const elementos = etiquetas(pagina);
  const classesDe = (e) => (e.attrs.class || '').split(' ');

  // Controle positivo: o leitor enxerga elementos com id e classe (senão a ausência abaixo não provaria nada).
  assert.ok(elementos.some((e) => e.attrs.id === 'fFreq'));
  assert.ok(elementos.some((e) => classesDe(e).includes('parcelasLinha')));

  for (const nome of nomes) {
    assert.ok(!elementos.some((e) => e.attrs.id === nome), `id ${nome} no index.html`);
    assert.ok(
      !elementos.some((e) => classesDe(e).includes(nome)),
      `classe ${nome} no index.html`
    );
    assert.ok(
      !regrasCss(estilos).some((r) =>
        r.seletores.some((s) => s.includes('#' + nome) || s.includes('.' + nome))
      ),
      `seletor ${nome} no css/forms.css`
    );
  }
});

test('Vezes não muda mais a Frequência: sem Frequência escolhida, o campo fica vazio', async () => {
  const { bruto, el } = await montarCadastro();

  el('fParcelas').value = '12';
  el('fFreq').value = '';
  bruto('atualizaModoFrequencia')();
  assert.equal(el('fFreq').value, '');
  assert.equal(el('fParcelas').disabled, false);
});

test('Duplicar/Editar herdam a Frequência: Vezes já vem como série e as faturas são refeitas depois disso', async () => {
  const { bruto, ctx, el } = await montarCadastro();

  ctx.faturasEscolhidas = ['2026-11-12'];
  bruto('abreModalNovo')({
    id: 7,
    nome: 'Escola',
    categ: 'Mercado',
    v: -100,
    data: '2026-10-15',
    cred: true,
    freq: 'Mensal',
  });
  assert.equal(el('fFreq').value, 'Mensal');
  assert.equal(el('fParcelas').disabled, true);
  assert.equal(el('fParcelas').value, 'serie');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.chamadasFaturas.at(-1))), {
    ids: ['2026-11-12'],
    vezes: 'serie',
  });
});

test('ao salvar com Frequência: exige a data, conta a série até o limite e, sem valor, grava cada linha vazia', async () => {
  const { bruto, ctx, el } = await montarCadastro();
  const salvar = bruto('submeteNovoLancamento');

  preencherCadastro(el, { fData: '' });
  await salvar();
  assert.equal(el('erroNovo').textContent, 'Escolha a data da 1ª ocorrência.');
  assert.equal(ctx.salvas.length, 0);

  preencherCadastro(el, {});
  await salvar();
  assert.equal(ctx.salvas.length, 1);
  assert.equal(ctx.salvas[0].freq, 'Mensal');
  assert.equal(ctx.salvas[0].parcelas, 75); // out/2026 a dez/2032
  assert.equal(ctx.salvas[0].valores.length, 75);
  assert.ok(ctx.salvas[0].valores.every((v) => v === null));
});

test('ao salvar com Frequência no Crédito: só a 1ª fatura é pedida e as seguintes avançam mês a mês', async () => {
  const { bruto, ctx, el } = await montarCadastro();
  const salvar = bruto('submeteNovoLancamento');

  preencherCadastro(el, { fCred: true, fValor: '100,00' });
  ctx.faturasEscolhidas = [];
  await salvar();
  assert.equal(el('erroNovo').textContent, 'Escolha a 1ª fatura.');
  assert.equal(ctx.salvas.length, 0);

  ctx.faturasEscolhidas = ['2026-11-12'];
  await salvar();
  assert.equal(ctx.salvas.length, 1);

  const { faturaIds, valores } = ctx.salvas[0];

  assert.equal(faturaIds.length, 75);
  assert.deepEqual(Array.from(faturaIds.slice(0, 3)), [
    '2026-11-12',
    '2026-12-12',
    '2027-01-12',
  ]);
  assert.equal(faturaIds.at(-1), '2033-01-12');
  assert.deepEqual(Array.from(new Set(valores)), [-100]); // sem Dividir, repete o valor em cada ocorrência
});

test('regra documentada em REGRAS.md', () => {
  assert.match(
    regras,
    /No cadastro, \*\*Frequência\*\* vem antes de \*\*Vezes\*\*, e as duas são modos excludentes/
  );
  assert.match(
    regras,
    /até `DATA_LIMITE_RECORRENCIA` \(31\/12\/2032, inclusive; em `js\/domain\.js`\)/
  );
  assert.match(
    regras,
    /a fatura de cada ocorrência é a 1ª fatura avançada pelo mesmo número de meses de calendário/
  );
  assert.match(regras, /Dividir continua valendo/);
  assert.match(
    regras,
    /Duplicar herda a Frequência do original — salvar um duplicado de algo Mensal gera a série inteira/
  );
  assert.match(
    regras,
    /Passar o mouse no rótulo Frequência resume essa regra num hover \(`title`\); não há botão nem modal de ajuda/
  );
});

test('rótulos Frequência e Categorias apontam pro próprio campo (for=), documentado em REGRAS.md', () => {
  assert.match(
    regras,
    /Os rótulos Frequência e Categorias apontam explicitamente pro próprio campo \(`for=`\): tocar no texto do rótulo foca o campo\./
  );
});

test('depois de salvar, a Frequência volta a "sem recorrência" e Vezes volta a ser editável', () => {
  assert.match(
    regras,
    /Depois de salvar, a Frequência volta a "sem recorrência" \(e Vezes volta a ser editável, com o valor que tinha antes da Frequência\)/
  );
  assert.match(
    regras,
    /abre marcado no Crédito, desmarcado no Débito, sempre alternável/
  );
});

test('AGENTS.md: o app é pessoal, sem dicas na tela; no máximo um hover', () => {
  assert.match(
    fs.readFileSync('AGENTS.md', 'utf8'),
    /O app é só do mantenedor: nada de dicas, guias, instruções na tela nem botões ou modais de ajuda\. Quando uma explicação for útil, no máximo um hover \(`title`\)\./
  );
});
