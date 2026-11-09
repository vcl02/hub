// Reserva/Comprometido como bits do lançamento (migration 22): checkbox no cadastro,
// coluna clicável na tabela, PATCH imediato — mesmo padrão de Crédito/Pago. O comportamento na tela (cadastro, toque na
// célula, simulação, Duplicar/Editar, a pergunta do cabeçalho) está em navegador-marcas.test.js; aqui, as cores e o resto.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');

const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

const migration = fs.readFileSync(
  'migrations/22-reserva-comprometido-colunas-bool.sql',
  'utf8'
);

const { carregarTela } = require('./helpers/tela-sem-navegador');
const { declaracoes } = require('./helpers/regras-css');

// Roda o handler de clique de verdade (o trecho de js/interactions.js que o registra em #out), com o banco falso: cada PATCH
// em fin vira uma chamada registrada, e `falhar` faz o banco responder erro.
async function montarToggle(lancamentos, { simulando = false } = {}) {
  const tela = carregarTela({
    hoje: '2026-10-20',
    dados: {
      fin: [],
      fin_ciclo: [{ id: 1, inicio: '2026-09-20', fim: null }],
      fin_meta: [],
    },
  });

  const { ctx, bruto } = tela;
  const patches = [];
  const toasts = [];
  const estado = { falhar: false, desenhos: 0 };
  const fetchDosDados = ctx.fetch;

  ctx.fetch = async (url, opcoes = {}) => {
    if (opcoes.method !== 'PATCH') return fetchDosDados(url, opcoes);

    if (estado.falhar) return { ok: false, status: 500, text: async () => 'sem rede' };

    const ids = new URL(url).searchParams
      .get('id')
      .replace(/^in\.\(|\)$|^eq\./g, '')
      .split(',');

    patches.push({ ids, campos: JSON.parse(opcoes.body) });

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(ids.map((id) => ({ id }))),
    };
  };

  await bruto('carregarDados()');
  ctx.lancamentos = lancamentos;
  ctx.toasts = toasts;
  ctx.estado = estado;
  ctx.cliqueDoOut = [];
  ctx.document.getElementById('out').addEventListener = (tipo, fn) => {
    if (tipo === 'click') ctx.cliqueDoOut.push(fn);
  };

  bruto(`(() => {
    Estado.lancamentos = lancamentos;
    Estado.simulando = ${simulando};
    globalThis.togglesNoAr = new Set();
    globalThis.COR_FLAG = { reserva: 'flagReserva', comprometido: 'flagComprometido', pra_sempre: 'flagPraSempre' };
    globalThis.desenhar = () => { estado.desenhos++; };
    globalThis.mostrarToast = (titulo, texto) => { toasts.push(titulo + "|" + texto); };
  })()`);

  const fs = require('node:fs');
  const fonte = fs.readFileSync('js/interactions.js', 'utf8');
  const inicio = fonte.indexOf('const ROTULO_FLAG_TOGGLE = {');
  const fim = fonte.indexOf('\n});\n', inicio) + 5;

  require('node:vm').runInContext(fonte.slice(inicio, fim), ctx);

  // Clica no selo `campo` da linha `id`; devolve o selo (classes, texto) depois do clique
  const clicar = async (campo, id) => {
    const classes = new Set();

    const selo = {
      dataset: { togFlag: `${campo}:${id}` },
      classList: { toggle: (c, ligado) => (ligado ? classes.add(c) : classes.delete(c)) },
      style: {},
      textContent: '',
      classes,
    };

    await ctx.cliqueDoOut[0]({
      target: { closest: () => selo },
      stopImmediatePropagation() {},
    });

    return selo;
  };

  return { clicar, patches, toasts, estado, lancamentos };
}

const linhaFlag = (id, nome, categ, extra = {}) => ({
  id,
  nome,
  categ,
  v: -10,
  ...extra,
});

test('clique no selo Reserva/Comprometido faz um só PATCH em todas as linhas reais do compromisso e atualiza a memória', async () => {
  const t = await montarToggle([
    linhaFlag(1, 'Iphone', 'Isabella'),
    linhaFlag(2, ' iphone ', 'ISABELLA'), // mesmo nome (sem acento/caixa) e categoria
    linhaFlag(3, 'Iphone', 'Isabella', { _sim: true }), // simulada: só na memória
    linhaFlag(4, 'Iphone', 'Lazer'), // outra categoria: outro compromisso
    linhaFlag(5, 'Iphone 15', 'Isabella'), // outro nome
  ]);

  const selo = await t.clicar('reserva', '1');

  assert.deepEqual(t.patches, [{ ids: ['1', '2'], campos: { reserva: true } }]);
  assert.deepEqual(
    t.lancamentos.map((l) => !!l.reserva),
    [true, true, true, false, false]
  );
  assert.equal(selo.textContent, 'Reserva');
  assert.ok(selo.classes.has('flagReserva'));
  assert.equal(t.estado.desenhos, 1);
  assert.deepEqual(t.toasts, ['Atualizado|Reserva marcado em 3 lançamentos "Iphone".']);
});

test('a ordem das categorias não importa para ser o mesmo compromisso; desmarcar volta para "—"', async () => {
  const t = await montarToggle([
    linhaFlag(1, 'Cinema', 'Lazer, Isabella', { comprometido: true }),
    linhaFlag(2, 'Cinema', 'Isabella, Lazer', { comprometido: true }),
  ]);

  const selo = await t.clicar('comprometido', '1');

  assert.deepEqual(t.patches, [{ ids: ['1', '2'], campos: { comprometido: false } }]);
  assert.equal(selo.textContent, '—');
  assert.deepEqual(
    t.lancamentos.map((l) => l.comprometido),
    [false, false]
  );
  assert.deepEqual(t.toasts, [
    'Atualizado|Comprometido desmarcado em 2 lançamentos "Cinema".',
  ]);
});

test('uma linha só: sem aviso de propagação', async () => {
  const t = await montarToggle([linhaFlag(1, 'Uber', 'Transporte')]);

  await t.clicar('pra_sempre', '1');
  assert.deepEqual(t.patches, [{ ids: ['1'], campos: { pra_sempre: true } }]);
  assert.deepEqual(t.toasts, []);
});

test('na simulação nada vai ao banco: o compromisso muda só na memória', async () => {
  const t = await montarToggle(
    [linhaFlag(1, 'Uber', 'Transporte'), linhaFlag(2, 'Uber', 'Transporte')],
    { simulando: true }
  );

  await t.clicar('reserva', '1');
  assert.deepEqual(t.patches, []);
  assert.deepEqual(
    t.lancamentos.map((l) => l.reserva),
    [true, true]
  );
});

test('falha na gravação: tudo ou nada (a memória não muda), avisa o erro e libera o selo', async () => {
  const t = await montarToggle([
    linhaFlag(1, 'Uber', 'Transporte'),
    linhaFlag(2, 'Uber', 'Transporte'),
  ]);

  t.estado.falhar = true;
  await t.clicar('reserva', '1');
  assert.deepEqual(
    t.lancamentos.map((l) => l.reserva),
    [undefined, undefined]
  );
  assert.deepEqual(t.toasts, ['Falhou ao atualizar|atualizar: 500 sem rede']);

  t.estado.falhar = false;
  await t.clicar('reserva', '1'); // liberado: dá para tentar de novo
  assert.equal(t.patches.length, 1);
});

test('clique repetido enquanto o PATCH está no ar é ignorado', async () => {
  const t = await montarToggle([linhaFlag(1, 'Uber', 'Transporte')]);
  const [a, b] = await Promise.all([t.clicar('reserva', '1'), t.clicar('reserva', '1')]);

  assert.equal(t.patches.length, 1);
  assert.ok(a && b);
});

test('migration 22 cria os dois bits e extrai dos tokens exatos em categ, sem deixar o texto', () => {
  assert.match(
    migration,
    /add column if not exists reserva boolean not null default false;/
  );
  assert.match(
    migration,
    /add column if not exists comprometido boolean not null default false;/
  );
  assert.match(migration, /lower\(trim\(token\)\) not in \('reserva', 'comprometido'\)/);
});

test('regra documentada em REGRAS.md', () => {
  assert.match(regras, /checkbox.*Reserva.*Comprometido|Reserva.*Comprometido.*checkbox/);
});

test('Comprometido marcado em laranja escuro e Reserva em amarelo claro, inclusive ao alternar e em linha só leitura', () => {
  const vm = require('node:vm');
  const inicio = tabelas.indexOf('const ROTULO_FLAG = {');
  const fim = tabelas.indexOf('\n};', tabelas.indexOf('const celFlag =')) + 3;
  const ctx = { escapeHtml: String };

  vm.runInNewContext(`${tabelas.slice(inicio, fim)}\nthis.celFlag = celFlag;`, ctx);
  assert.match(
    ctx.celFlag({ id: 5, comprometido: true }, 'comprometido'),
    /^<span class="flagComprometido togFlag"[^>]*>Comprometido<\/span>$/
  );
  assert.match(
    ctx.celFlag({ id: 5, reserva: true }, 'reserva'),
    /^<span class="flagReserva togFlag"[^>]*>Reserva<\/span>$/
  );
  // Desmarcado: "—" sem cor.
  assert.match(
    ctx.celFlag({ id: 5, reserva: false }, 'reserva'),
    /^<span class=" togFlag"[^>]*>—<\/span>$/
  );
  // Linha calculada: mesma cor, sem toggle.
  assert.equal(
    ctx.celFlag({ id: -3, _sid: 'fat:1', comprometido: true }, 'comprometido'),
    '<span class=flagComprometido>Comprometido</span>'
  );
  assert.equal(
    ctx.celFlag({ id: -6, _sid: 'prev:1', reserva: true }, 'reserva'),
    '<span class=flagReserva>Reserva</span>'
  );
  // O clique troca a mesma classe da marca, nunca o verde de Pago.
  const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
  const tons = declaracoes(fs.readFileSync('css/base.css', 'utf8'), ':root');

  // a cor de cada marca é um tom do Fin (também o do filtro ligado), escrito uma vez só
  assert.ok(
    tons.includes('--comprometido: #d9741e') && tons.includes('--reserva: #f6e58d')
  );
  assert.ok(
    declaracoes(estilos, '.flagComprometido').includes('color: var(--comprometido)')
  );
  assert.ok(declaracoes(estilos, '.flagReserva').includes('color: var(--reserva)'));
  assert.match(
    regras,
    /\*\*Comprometido em laranja escuro\*\* e \*\*Reserva em amarelo claro\*\*/
  );
});

test('cabeçalho de Reserva e Comprometido tem a pergunta que decide a marca', () => {
  assert.match(
    regras,
    /a pergunta que decide a marca: \*\*Reserva\*\* — "Se eu perder o emprego, preciso continuar pagando isso\?"/
  );
});
