// Contrato de substituição das flags por categorias no front-end e na migration.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { etiquetas, elementoPorId } = require('./helpers/html');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');

const html = fs.readFileSync('index.html', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');

fs.readFileSync('js/supabase-api.js', 'utf8');

const migration = fs.readFileSync(
  'migrations/16-classificacoes-em-categorias.sql',
  'utf8'
);

const migrationCorretiva = fs.readFileSync(
  'migrations/17-normalizar-categoria-reserva.sql',
  'utf8'
);

// Dispara a salvaLancamentoParceladoNoBanco real (js/form.js) com o banco simulado e devolve o que ela mandou gravar.
async function payloadsGravados() {
  const tela = carregarTela({
    dados: {
      fin: [],
      fin_ciclo: [{ id: 1, inicio: '2026-10-15', fim: null }],
      fin_meta: [],
    },
  });

  await tela.bruto('carregarDados()');
  trazer(tela.ctx, 'js/form.js', ['salvaLancamentoParceladoNoBanco']);

  const enviados = [];

  // O banco simulado devolve o que recebeu (com id), como o PostgREST com return=representation
  const bancoFalso = tela.ctx.fetch;

  tela.ctx.fetch = async (url, opcoes = {}) => {
    if (opcoes.method !== 'POST') return bancoFalso(url, opcoes);
    const recebidos = JSON.parse(opcoes.body);

    enviados.push(...recebidos);

    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify(recebidos.map((p, i) => ({ ...p, id: 100 + i }))),
    };
  };

  await tela.bruto(`salvaLancamentoParceladoNoBanco({
    nome: 'Obra',
    categ: 'Casa',
    freq: null,
    data: '2026-10-20',
    cred: false,
    pago: false,
    reserva: true,
    comprometido: false,
    parcelas: 1,
    valores: [-10],
  })`);

  return JSON.parse(JSON.stringify(enviados));
}

test('front-end não mantém campos nem payloads das flags removidas', async () => {
  // A página não tem mais os campos das flags antigas (ISA, Reserva emergência e ativo)
  const ids = etiquetas(html).map((e) => e.attrs.id);

  // Positivo: a página foi lida (campos que continuam existindo), senão a ausência abaixo não prova nada
  for (const presente of ['fValor', 'fNome'])
    elementoPorId(html, presente, { obrigatorio: true });
  assert.ok(ids.length > 50);

  for (const removido of ['fIsa', 'fReservaEmergencia', 'fativo'])
    assert.ok(!ids.includes(removido), removido);

  // E o que o cadastro grava só tem as colunas de hoje: a Reserva é o bit próprio, sem isa nem ativo
  const [payload] = await payloadsGravados();

  assert.deepEqual(Object.keys(payload).sort(), [
    'categ',
    'comprometido',
    'cred',
    'data',
    'fatura',
    'freq',
    'nome',
    'pago',
    'recorrencia_id',
    'reserva',
    'valor',
  ]);
  assert.equal(payload.reserva, true);
});

test('Reserva é lida do bit próprio pela meta (migration 22 substituiu a categoria de texto)', () => {
  const inicio = graficos.indexOf('const MESES_META_RESERVA_EMERGENCIA = 9;');
  const fim = graficos.indexOf('\nfunction dadosMetaReservaEmergenciaCiclo(', inicio);
  const contexto = {};

  vm.createContext(contexto);
  vm.runInContext(graficos.slice(inicio, fim), contexto);

  const meta = (linhas) => contexto.dadosMetaReservaEmergencia(linhas, 4, 0).gastoMensal;

  // Vale a linha com o bit `reserva`, com ciclo; a categoria de texto "Reserva" não conta mais
  assert.equal(
    meta([{ periodoIdx: 4, nome: 'A', v: -100, categ: 'Casa', reserva: true }]),
    100
  );
  assert.equal(
    meta([{ periodoIdx: 4, nome: 'A', v: -100, categ: 'Reserva', reserva: false }]),
    0
  );
  assert.equal(
    meta([{ periodoIdx: null, nome: 'A', v: -100, categ: '', reserva: true }]),
    0
  ); // Backlog fica de fora
});

test('migration preserva classificações e remove as três colunas', () => {
  assert.match(migration, /where isa is true/);
  assert.match(migration, /where reserva is true/);
  assert.match(migration, /drop column if exists ativo/);
  assert.match(migration, /drop column if exists isa/);
  assert.match(migration, /drop column if exists reserva/);
});

test('migration corretiva normaliza Reserva emergência para Reserva sem duplicar categorias', () => {
  assert.match(migrationCorretiva, /then 'Reserva'/);
  assert.match(migrationCorretiva, /group by lower\(categoria\)/);
  assert.match(
    migrationCorretiva,
    /where lower\(trim\(categoria\)\) = lower\('Reserva emergência'\)/
  );
});
