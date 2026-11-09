// Uma regra só pra "é investimento" e pro ciclo do lançamento: carga, cadastro, edição,
// materialização e simulação classificam igual, então nada muda ao recarregar a página.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');

const compartilhado = fs.readFileSync('js/shared.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

function carregar() {
  const trecho = (inicio, fim) =>
    compartilhado.slice(
      compartilhado.indexOf(inicio),
      compartilhado.indexOf(fim, compartilhado.indexOf(inicio)) + fim.length
    );

  const ctx = {
    Estado: { ciclos: [0, 1, 2] },
    categoriasSeparadas: (v) =>
      String(v ?? '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    dataISO: (v) => (v ? String(v).slice(0, 10) : ''),
    periodoDaFatura: (f) => (f ? ({ '2026-11-12': 1 }[f] ?? -1) : null),
    periodoDoDebito: (d) => ({ '2026-10-09': 0, '2026-11-20': 2 })[d] ?? -1,
    ehDebitoAtrasado: () => false, // atrasado tem testes próprios (atrasados.test.js)
    cicloDeHoje: () => 0,
  };

  vm.runInNewContext(
    `${trecho('const ehCategoriaInvestimento', ';\n')}
${trecho('function periodoDoLancamento(r) {', '\n}\n')}
this.inv = ehCategoriaInvestimento; this.periodo = periodoDoLancamento;`,
    ctx
  );

  return ctx;
}

test('é investimento quando QUALQUER categoria da lista é exatamente Investimento', () => {
  const { inv } = carregar();

  assert.equal(inv('Investimento'), true);
  assert.equal(inv('Investimento, Reserva'), true); // antes, cadastro/edição diziam false
  assert.equal(inv(' investimento '), true);
  assert.equal(inv('Investimentos'), false);
  assert.equal(inv(null), false);
});

test('ciclo: Crédito pela fatura (mesmo sem data), Débito pela data, sem nada = Backlog', () => {
  const { periodo } = carregar();

  assert.equal(periodo({ cred: true, data: null, fatura: '2026-11-12' }), 1); // antes, o cadastro mandava pro Backlog
  assert.equal(periodo({ cred: false, data: '2026-10-09', fatura: '2026-11-12' }), 0); // antecipação: pela data
  assert.equal(periodo({ cred: false, data: null, fatura: null }), null);
  assert.equal(periodo({ cred: false, data: '2026-01-01' }), null); // fora dos ciclos
});

test('ninguém mais tem cópia própria das regras: a carga e a reclassificação concordam com a regra única', async () => {
  const linha = (id, extra) => ({
    id,
    nome: `L${id}`,
    data: '2026-10-17',
    valor: -10,
    categ: 'Compras',
    cred: false,
    pago: true,
    fatura: null,
    freq: null,
    ...extra,
  });

  const tela = carregarTela({
    dados: {
      fin: [
        linha(1, { categ: 'Investimento, Reserva', data: '2026-10-16' }), // lista: um item é Investimento
        linha(2, { categ: ' investimento ' }),
        linha(3, { categ: 'Investimentos' }), // item inteiro: não é
        linha(4, { cred: true, data: null, fatura: '2026-11-12' }), // Crédito sem data: pela fatura
        linha(5, { data: null }), // sem nada: Backlog
      ],
      fin_ciclo: [
        { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
        { id: 2, inicio: '2026-10-15', fim: null },
      ],
      fin_meta: [],
    },
  });

  await tela.bruto('carregarDados()');
  trazer(tela.ctx, 'js/interactions.js', ['reclassificaPeriodo']);

  const lancamentos = tela.rodar('Estado.lancamentos.filter(l => l.id > 0)');

  assert.equal(lancamentos.length, 5);

  for (const l of lancamentos) {
    // Mesma conta que a regra única faz sobre a linha
    tela.ctx.l = l;
    assert.equal(l.inv, tela.bruto('ehCategoriaInvestimento(l.categ)'), l.nome);
    assert.equal(l.periodoIdx, tela.bruto('periodoDoLancamento(l)'), l.nome);

    // Reclassificar na tela (editar data, fatura ou Crédito) dá o mesmo ciclo da carga
    tela.ctx.copia = { ...l, periodoIdx: 'velho' };
    tela.bruto('reclassificaPeriodo(copia)');
    assert.equal(tela.ctx.copia.periodoIdx, l.periodoIdx, l.nome);
  }

  assert.deepEqual(
    lancamentos.map((l) => l.inv),
    [true, true, false, false, false]
  );
  assert.deepEqual(
    lancamentos.map((l) => l.periodoIdx),
    [1, 1, 1, 1, null]
  );
  assert.match(regras, /"é investimento" e o ciclo de um lançamento seguem uma regra só/);
});
