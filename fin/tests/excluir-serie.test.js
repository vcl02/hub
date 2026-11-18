// Excluir com escopo (só esta / esta e as próximas / todas): as contas da série (linhasDaSerie, js/finance.js), os textos do
// diálogo e da pergunta, a exclusão linha a linha (excluirLinhas) e o Excluir escolhendo entre o diálogo e o confirm().
// Tudo rodando a função de verdade, sem navegador; o caso na tela está em navegador-linhas.test.js.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const { ctx: telaCtx } = carregarTela();
const linhasDaSerie = (r, escopo, linhas) => telaCtx.linhasDaSerie(r, escopo, linhas);
const ids = (L) => Array.from(L, (x) => x.id);

const L = (id, data, extra = {}) => ({
  id,
  nome: 'Academia',
  categ: 'Saúde',
  data,
  v: -100,
  ...extra,
});

test('linhasDaSerie: mesmo lote, ordenada por data; lote número e texto são o mesmo', () => {
  const a = L(3, '2026-03-10', { recorrencia_id: 7 });
  const b = L(1, '2026-01-10', { recorrencia_id: '7' });
  const c = L(2, '2026-02-10', { recorrencia_id: 7 });
  const fora = L(4, '2026-04-10', { recorrencia_id: 8 });
  const todas = [a, fora, b, c];

  assert.deepEqual(ids(linhasDaSerie(a, 'todas', todas)), [1, 2, 3]);
  assert.deepEqual(ids(linhasDaSerie(b, 'todas', todas)), [1, 2, 3]);
});

test('linhasDaSerie: escopos esta, proximas, todas e inválido; a própria linha sempre dentro', () => {
  const s = [1, 2, 3, 4].map((i) => L(i, `2026-0${i}-10`, { recorrencia_id: 5 }));

  assert.deepEqual(ids(linhasDaSerie(s[1], 'esta', s)), [2]);
  assert.deepEqual(ids(linhasDaSerie(s[1], 'proximas', s)), [2, 3, 4]);
  assert.deepEqual(ids(linhasDaSerie(s[3], 'proximas', s)), [4]);
  assert.deepEqual(ids(linhasDaSerie(s[0], 'todas', s)), [1, 2, 3, 4]);
  assert.deepEqual(ids(linhasDaSerie(s[1], 'qualquer', s)), [2]);
  assert.deepEqual(ids(linhasDaSerie(s[1], undefined, s)), [2]);

  for (const escopo of ['esta', 'proximas', 'todas'])
    for (const r of s) assert.ok(linhasDaSerie(r, escopo, s).includes(r));
  // a própria linha entra mesmo fora da lista
  assert.deepEqual(ids(linhasDaSerie(s[0], 'todas', [])), [1]);
});

test('linhasDaSerie: empate de data decide pelo id (numérico, ou texto com número dentro); id maior ou igual entra em "próximas"', () => {
  const a = L(2, '2026-05-10', { recorrencia_id: 1 });
  const b = L(10, '2026-05-10', { recorrencia_id: 1 });
  const c = L(9, '2026-05-10', { recorrencia_id: 1 });
  const todas = [b, a, c];

  assert.deepEqual(ids(linhasDaSerie(a, 'todas', todas)), [2, 9, 10]);
  assert.deepEqual(ids(linhasDaSerie(c, 'proximas', todas)), [9, 10]);
  assert.deepEqual(ids(linhasDaSerie(b, 'proximas', todas)), [10]);

  const t = ['x2', 'x10', 'x9'].map((id) => L(id, '2026-05-10', { recorrencia_id: 1 }));

  assert.deepEqual(ids(linhasDaSerie(t[0], 'todas', t)), ['x2', 'x9', 'x10']);
});

test('linhasDaSerie: sem data (Backlog) vai pro fim e conta como "o que ainda vem"', () => {
  const a = L(1, '2026-01-10', { recorrencia_id: 3 });
  const b = L(2, null, { recorrencia_id: 3 });
  const c = L(3, '2026-02-10', { recorrencia_id: 3 });

  assert.deepEqual(ids(linhasDaSerie(a, 'todas', [b, c, a])), [1, 3, 2]);
  assert.deepEqual(ids(linhasDaSerie(c, 'proximas', [b, c, a])), [3, 2]);
  assert.deepEqual(ids(linhasDaSerie(b, 'proximas', [b, c, a])), [2]);
});

test('linhasDaSerie: sem lote, a série é mesmo compromisso e mesma Frequência; Mensal não mistura com Anual; linha com lote nunca entra', () => {
  const m1 = L(1, '2026-01-10', { freq: 'Mensal' });
  const m2 = L(2, '2026-02-10', { freq: 'Mensal', nome: 'Academia (2/12)' });
  const anual = L(3, '2026-03-10', { freq: 'Anual' });
  const comLote = L(4, '2026-04-10', { freq: 'Mensal', recorrencia_id: 9 });
  const outro = L(5, '2026-05-10', { freq: 'Mensal', nome: 'Netflix' });
  const todas = [m1, m2, anual, comLote, outro];

  assert.deepEqual(ids(linhasDaSerie(m1, 'todas', todas)), [1, 2]);
  assert.deepEqual(ids(linhasDaSerie(anual, 'todas', todas)), [3]);
  // a relação vale nos dois sentidos: a linha com lote só tem as do lote
  assert.deepEqual(ids(linhasDaSerie(comLote, 'todas', todas)), [4]);
});

test('linhasDaSerie: avulsa (sem lote nem Frequência) é série de uma só, mesmo com nome igual', () => {
  const a = L(1, '2026-01-10');
  const b = L(2, '2026-02-10');

  for (const escopo of ['esta', 'proximas', 'todas'])
    assert.deepEqual(ids(linhasDaSerie(a, escopo, [a, b])), [1]);
});

test('linhasDaSerie: linhas _sid (previstas, faturas, ajustes) nunca entram na série', () => {
  const a = L(1, '2026-01-10', { recorrencia_id: 4 });
  const prevista = L(2, '2026-02-10', { recorrencia_id: 4, _sid: 'prev-2' });
  const f1 = L(3, '2026-01-12', { freq: 'Mensal' });
  const f2 = L(4, '2026-02-12', { freq: 'Mensal', _sid: 'x' });

  assert.deepEqual(ids(linhasDaSerie(a, 'todas', [a, prevista])), [1]);
  assert.deepEqual(ids(linhasDaSerie(f1, 'todas', [f1, f2])), [3]);
});

test('lote sim- (compra simulada parcelada) não colide com lote real: o 10 da simulação não é o lote 10', () => {
  const real = [1, 2].map((i) => L(i, `2026-0${i}-10`, { recorrencia_id: 10 }));

  const sim = [3, 4].map((i) =>
    L(`sim-10-${i}`, `2026-0${i}-10`, { _sim: true, recorrencia_id: 'sim-10' })
  );

  const todas = [...real, ...sim];

  assert.deepEqual(ids(linhasDaSerie(real[0], 'todas', todas)), [1, 2]);
  assert.deepEqual(ids(linhasDaSerie(sim[0], 'todas', todas)), ['sim-10-3', 'sim-10-4']);
  // a função que monta a compra simulada é quem dá o lote: 'sim-N' nas parcelas, sem lote numa compra de uma só
  const { ctx, rodar, bruto } = carregarTela();
  const Estado = bruto('Estado');

  trazer(ctx, 'js/form.js', ['simulaLancamentoParcelado']);
  Estado.lancamentos = [];
  Estado._proxIdSimulado = 9;

  const base = {
    nome: 'TV',
    categ: 'Casa',
    freq: '',
    data: '2026-10-20',
    cred: false,
    pago: false,
  };

  ctx.simulaLancamentoParcelado({ ...base, parcelas: 3, valores: [-10, -10, -10] });
  ctx.simulaLancamentoParcelado({ ...base, parcelas: 1, valores: [-30] });
  const lotes = rodar('Estado.lancamentos.map((l) => l.recorrencia_id)');

  assert.deepEqual(lotes, ['sim-10', 'sim-10', 'sim-10', null]);
  // e com um lote real de mesmo número na lista, as duas séries seguem separadas
  const reais = [L(1, '2026-01-10', { recorrencia_id: 10 })];
  const todasJuntas = [...reais, ...Array.from(Estado.lancamentos)];

  assert.equal(linhasDaSerie(todasJuntas[1], 'todas', todasJuntas).length, 3);
  assert.deepEqual(ids(linhasDaSerie(reais[0], 'todas', todasJuntas)), [1]);
});

// ---- form.js: textos, exclusão e o botão, com o trecho de verdade rodando ----
function trecho(ini, fim) {
  const i = formulario.indexOf(ini);

  assert.ok(i >= 0, ini);

  return formulario.slice(i, formulario.indexOf(fim, i));
}

function montar({
  simulando = false,
  lancamentos = [],
  selecionados = [],
  falharEm = [],
} = {}) {
  const botoes = [{ disabled: false }, { disabled: false }];

  const modal = {
    open: false,
    querySelectorAll: () => botoes,
    close() {
      this.open = false;
    },
  };

  const seldel = { disabled: false, textContent: 'Excluir' };
  const titulo = { textContent: '' };
  const el = { seldel, modalExcluirSerie: modal, tituloExcluirSerie: titulo };

  const reg = {
    deletes: [],
    desenhos: 0,
    toasts: [],
    perguntas: [],
    aberturas: [],
    confirma: true,
  };

  let liberar;
  const porta = new Promise((ok) => (liberar = ok));

  const c = {
    Estado: {
      simulando,
      lancamentos,
      selecionados: new Map(selecionados.map((id) => [String(id), true])),
    },
    el: (id) => el[id],
    brl: (v) => `R$ ${v}`,
    linhasDaSerie,
    desenhar: () => reg.desenhos++,
    mostrarToast: (t, m) => reg.toasts.push([t, m]),
    confirm: (p) => (reg.perguntas.push(p), reg.confirma),
    abrirExclusaoDaSerie: (r) => reg.aberturas.push(r.id),
    excluirLancamento: async (id) => {
      reg.deletes.push(id);
      await porta;

      if (falharEm.includes(id)) throw Error('sem sinal');
    },
  };

  vm.createContext(c);
  vm.runInContext(
    `${trecho('const exclusaoEhSimulada', '// Aceita quantas')}
${trecho("el('seldel').onclick = async", '\n};\n')}\n};
${trecho('function avisoDoEscopo', '// Uma linha de série selecionada')}
globalThis.api = { perguntaDaExclusao, excluirLinhas, avisoDoEscopo, rotuloDoEscopo, onclick: el('seldel').onclick };`,
    c
  );

  return { api: c.api, c, reg, el, botoes, modal, liberar };
}

const real = (id, extra = {}) => ({ id, nome: `Conta ${id}`, v: -10 * id, ...extra });
const simulada = (id) => real(id, { _sim: true });

test('rotuloDoEscopo: Só esta, Esta e as próximas (N), Todas (N) e Todas (N, M já paga(s))', () => {
  const { api } = montar();
  const tres = [real(1), real(2), real(3)];

  assert.equal(api.rotuloDoEscopo('esta', [tres[0]]), 'Só esta');
  assert.equal(api.rotuloDoEscopo('proximas', tres.slice(1)), 'Esta e as próximas (2)');
  assert.equal(api.rotuloDoEscopo('todas', tres), 'Todas (3)');
  assert.equal(
    api.rotuloDoEscopo('todas', [real(1, { pago: true }), real(2), real(3)]),
    'Todas (3, 1 já paga)'
  );
  assert.equal(
    api.rotuloDoEscopo('todas', [real(1, { pago: true }), real(2, { pago: true })]),
    'Todas (2, 2 já pagas)'
  );
});

test('avisoDoEscopo: real não volta, simulada volta ao recarregar, mista diz as duas coisas', () => {
  const { api } = montar();

  assert.equal(api.avisoDoEscopo([real(1), real(2)]), 'Não dá pra desfazer');
  assert.equal(
    api.avisoDoEscopo([simulada(1), simulada(2)]),
    'Só nesta simulação, volta ao recarregar'
  );
  assert.equal(
    api.avisoDoEscopo([real(1), simulada(2)]),
    'Não dá pra desfazer; as simuladas voltam ao recarregar'
  );
});

test('perguntaDaExclusao: uma linha (real e simulada) e várias (reais, simuladas, mistas) com os textos de cada caso', () => {
  const { api } = montar();

  assert.equal(
    api.perguntaDaExclusao([real(1)]),
    'Excluir "Conta 1" (R$ -10)?\n\nNão dá pra desfazer.'
  );
  assert.equal(
    api.perguntaDaExclusao([simulada(1)]),
    'Ocultar "Conta 1" só nesta simulação?\n\nVolta ao recarregar ou sair da simulação.'
  );

  const reais = api.perguntaDaExclusao([real(1), real(2)]);

  assert.ok(reais.startsWith('Excluir estes 2 lançamentos (R$ -30 no total)?'));
  assert.ok(reais.includes('- Conta 1 (R$ -10)\n- Conta 2 (R$ -20)'));
  assert.ok(reais.endsWith('Não dá pra desfazer.'));

  const sims = api.perguntaDaExclusao([simulada(1), simulada(2)]);

  assert.ok(sims.startsWith('Ocultar estes 2 lançamentos'));
  assert.ok(sims.endsWith('Volta ao recarregar ou sair da simulação.'));

  const mista = api.perguntaDaExclusao([real(1), simulada(2)]);

  assert.ok(mista.startsWith('Excluir estes 2 lançamentos'));
  assert.ok(
    mista.endsWith(
      'Os marcados só desta simulação voltam ao recarregar; os demais não dá pra desfazer.'
    )
  );
});

test('excluirLinhas: um DELETE por linha real, na ordem; tira do Estado e da seleção, redesenha uma vez e destrava', async () => {
  const linhas = [real(1), real(2), real(3)];

  const { api, reg, el, botoes, liberar, c } = montar({
    lancamentos: [...linhas, real(9)],
    selecionados: [2],
  });

  const andamento = api.excluirLinhas(linhas);

  assert.equal(el.seldel.disabled, true);
  assert.equal(el.seldel.textContent, 'Excluindo…');
  assert.ok(botoes.every((b) => b.disabled));
  liberar();
  await andamento;
  assert.deepEqual(reg.deletes, [1, 2, 3]);
  assert.deepEqual(ids(c.Estado.lancamentos), [9]);
  assert.equal(c.Estado.selecionados.size, 0);
  assert.equal(reg.desenhos, 1);
  assert.equal(el.seldel.disabled, false);
  assert.equal(el.seldel.textContent, 'Excluir');
  assert.ok(botoes.every((b) => !b.disabled));
});

test('excluirLinhas: toque duplo com o DELETE no ar não exclui de novo', async () => {
  const linhas = [real(1), real(2)];
  const { api, reg, liberar } = montar({ lancamentos: [...linhas] });

  const a = api.excluirLinhas(linhas);
  const b = api.excluirLinhas(linhas);

  liberar();
  await Promise.all([a, b]);
  assert.deepEqual(reg.deletes, [1, 2]);
});

test('excluirLinhas: erro no meio do laço avisa, mantém o que falhou, deixa fora o que já saiu e redesenha', async () => {
  const linhas = [real(1), real(2), real(3)];

  const { api, reg, el, liberar, c } = montar({
    lancamentos: [...linhas],
    falharEm: [2],
  });

  liberar();
  await api.excluirLinhas(linhas);
  assert.deepEqual(reg.deletes, [1, 2]); // a 3ª nem foi tentada
  assert.deepEqual(ids(c.Estado.lancamentos), [2, 3]);
  assert.deepEqual(reg.toasts, [['Falhou ao excluir', 'sem sinal']]);
  assert.equal(reg.desenhos, 1);
  assert.equal(el.seldel.disabled, false);
});

test('excluirLinhas: simulada nunca chama o banco (nem numa seleção mista, só a real chama); modal aberto fecha no fim', async () => {
  const sims = [simulada(1), simulada(2)];
  const a = montar({ simulando: true, lancamentos: [...sims] });

  a.liberar();
  await a.api.excluirLinhas(sims);
  assert.deepEqual(a.reg.deletes, []);
  assert.deepEqual(a.c.Estado.lancamentos, []);
  assert.equal(a.el.seldel.textContent, 'Ocultar');

  const mista = [real(1), simulada(2)];
  const b = montar({ lancamentos: [...mista] });

  b.modal.open = true;
  b.liberar();
  await b.api.excluirLinhas(mista);
  assert.deepEqual(b.reg.deletes, [1]);
  assert.equal(b.modal.open, false);
  assert.equal(b.el.tituloExcluirSerie.textContent, 'Excluindo…');
});

test('Excluir: uma linha de série abre o diálogo e não usa o confirm(); nada é excluído ainda', async () => {
  const s = [1, 2, 3].map((i) => real(i, { data: `2026-0${i}-10`, recorrencia_id: 5 }));
  const { api, reg } = montar({ lancamentos: s, selecionados: [2] });

  await api.onclick();
  assert.deepEqual(reg.aberturas, [2]);
  assert.deepEqual(reg.perguntas, []);
  assert.deepEqual(reg.deletes, []);
});

test('Excluir: várias linhas, avulsa e série de uma só usam o confirm(); recusado não exclui, aceito exclui', async () => {
  const s = [1, 2, 3].map((i) => real(i, { data: `2026-0${i}-10`, recorrencia_id: 5 }));
  const avulsa = real(7, { data: '2026-01-10' });
  const solo = real(8, { data: '2026-01-10', recorrencia_id: 99 });

  // várias linhas da mesma série
  let m = montar({ lancamentos: [...s], selecionados: [1, 2] });

  m.liberar();
  await m.api.onclick();
  assert.equal(m.reg.perguntas.length, 1);
  assert.deepEqual(m.reg.aberturas, []);

  // avulsa e série de 1, recusando e depois aceitando
  for (const linha of [avulsa, solo]) {
    m = montar({ lancamentos: [...s, linha], selecionados: [linha.id] });
    m.reg.confirma = false;
    await m.api.onclick();
    assert.equal(m.reg.perguntas.length, 1);
    assert.deepEqual(m.reg.aberturas, []);
    assert.deepEqual(m.reg.deletes, []);
    m.reg.confirma = true;
    m.liberar();
    await m.api.onclick();
    assert.deepEqual(m.reg.deletes, [linha.id]);
  }
});

test('linhasDaSerie: "próximas" é maior ou igual: outra linha com a mesma data e o mesmo id (sem desempate) também entra', () => {
  const a = L(5, '2026-05-10', { recorrencia_id: 2, nome: 'a' });
  const b = L(5, '2026-05-10', { recorrencia_id: 2, nome: 'b' });
  const antes = L(1, '2026-04-10', { recorrencia_id: 2 });

  const dep = linhasDaSerie(a, 'proximas', [antes, a, b]);

  assert.equal(dep.length, 2);
  assert.ok(dep.includes(a) && dep.includes(b));
});
