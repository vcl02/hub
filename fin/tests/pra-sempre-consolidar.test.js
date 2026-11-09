// Pra sempre até o limite no Consolidar tudo: a mesma regra da migration 33
// (ocorrenciasPraSempreQueFaltam em form.js), só no clique e nunca na simulação.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = (arquivo) => fs.readFileSync(arquivo, 'utf8');
const formulario = ler('js/form.js');
const regras = ler('docs/REGRAS.md');

function carrega() {
  const contexto = vm.createContext({ MESES: [], Estado: {} });

  vm.runInContext(ler('js/domain.js') + ler('js/shared.js'), contexto);
  const inicio = formulario.indexOf('function ocorrenciasPraSempreQueFaltam(');

  vm.runInContext(
    formulario.slice(inicio, formulario.indexOf('\n}\n', inicio) + 3) +
      'globalThis.f = ocorrenciasPraSempreQueFaltam;',
    contexto
  );

  return (linhas, limite) => JSON.parse(JSON.stringify(contexto.f(linhas, limite)));
}

const linha = (extra) => ({
  id: 1,
  nome: 'Condomínio',
  categ: 'Apartamento',
  data: '2028-09-15',
  valor: -500,
  v: -500,
  freq: 'Mensal',
  cred: false,
  pago: false,
  pra_sempre: true,
  recorrencia_id: 56,
  reserva: false,
  comprometido: true,
  canal: 'pix',
  prio: null,
  obs: 'só desta',
  ...extra,
});

test('modelo = a mais recente do grupo; novas só depois dela e até o limite', () => {
  const f = carrega();

  const grupos = f(
    [
      linha({ id: 10, data: '2028-11-15', valor: -480 }),
      linha({ id: 11, data: '2028-12-15', valor: -500, nome: ' condomínio ' }), // mesmo grupo (caixa/espaço)
      linha({ id: 12, data: '2028-10-15' }),
    ],
    '2029-03-31'
  );

  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].modelo.id, 11);
  assert.deepEqual(
    grupos[0].novas.map((n) => [
      n.data,
      n.valor,
      n.recorrencia_id,
      n.pago,
      n.obs,
      n.comprometido,
      n.pra_sempre,
      n.canal,
    ]),
    [
      ['2029-01-15', -500, 56, false, null, true, true, 'pix'],
      ['2029-02-15', -500, 56, false, null, true, true, 'pix'],
      ['2029-03-15', -500, 56, false, null, true, true, 'pix'],
    ]
  );
  // Já no limite: nada a criar (repetir não duplica).
  assert.deepEqual(f([linha({ data: '2029-03-15' })], '2029-03-31'), []);
});

test('Frequência, Crédito e o que fica de fora', () => {
  const f = carrega();

  // Anual; dia 31 no Crédito: a fatura anda pelos meses de calendário a partir do modelo.
  const [anual] = f(
    [
      linha({
        nome: 'IPVA',
        freq: 'Anual',
        data: '2028-01-31',
        cred: true,
        fatura: '2028-02-12',
      }),
    ],
    '2030-12-31'
  );

  assert.deepEqual(
    anual.novas.map((n) => [n.data, n.fatura]),
    [
      ['2029-01-31', '2029-02-12'],
      ['2030-01-31', '2030-02-12'],
    ]
  );

  // Frequência da ocorrência mais recente que tem uma; sem nenhuma, o grupo fica como está.
  const [quinzenal] = f(
    [
      linha({ id: 1, freq: 'Quinzenal', data: '2028-12-01' }),
      linha({ id: 2, freq: null, data: '2028-12-10' }),
    ],
    '2028-12-31'
  );

  assert.deepEqual(
    quinzenal.novas.map((n) => n.data),
    ['2028-12-24']
  );
  assert.deepEqual(f([linha({ freq: null })], '2030-12-31'), []);
  // Só linhas reais pra sempre.
  assert.deepEqual(
    f(
      [linha({ pra_sempre: false }), linha({ id: -5 }), linha({ _sim: true })],
      '2030-12-31'
    ),
    []
  );
});

// Roda a estenderPraSempre real (js/form.js) com a busca das ocorrências e o banco simulados; anota cada passo.
async function estender({ simulando = false, temPraSempre = true, grupos }) {
  const eventos = [];
  let proxima = 100;

  const ctx = {
    Estado: { simulando, temPraSempre, lancamentos: [{ id: 1 }] },
    ocorrenciasPraSempreQueFaltam: () => grupos,
    proximaRecorrencia: async () => {
      eventos.push('proximaRecorrencia');

      return proxima++;
    },
    atualizarLancamentos: async (ids, campos) => eventos.push(['atualiza', ids, campos]),
    inserirLancamentos: async (linhas) => {
      eventos.push(['insere', linhas.map((n) => [n.data, n.recorrencia_id])]);

      return linhas.map((n, i) => ({ ...n, id: 900 + i, valor: -500 }));
    },
    ehCategoriaInvestimento: () => false,
    periodoDoLancamento: () => 4,
    limparCachesFinanceiros: () => eventos.push('limpaCaches'),
    nomePeriodoAbrev: ({ ini }) => ini.slice(0, 7),
  };

  vm.createContext(ctx);
  vm.runInContext(
    `${formulario.slice(formulario.indexOf('async function estenderPraSempre('), formulario.indexOf('async function consolidarTudo('))}\nthis.estenderPraSempre = estenderPraSempre;`,
    ctx
  );

  const retorno = await ctx.estenderPraSempre();

  return {
    retorno: JSON.parse(JSON.stringify(retorno)),
    eventos: JSON.parse(JSON.stringify(eventos)),
    ctx,
  };
}

const grupoSemLote = () => ({
  modelo: { id: 11, nome: 'Condomínio', recorrencia_id: null },
  novas: [
    { data: '2029-01-15', recorrencia_id: null },
    { data: '2029-02-15', recorrencia_id: null },
  ],
});

test('Pra sempre no Consolidar tudo: nunca na simulação nem sem lançamento pra sempre; o lote vem antes do INSERT único', async () => {
  // O encaixe no Consolidar tudo (só no clique, antes do Aporte/Resgate) está em consolidar-tudo.test.js.
  for (const parametros of [{ simulando: true }, { temPraSempre: false }]) {
    const nada = await estender({ ...parametros, grupos: [grupoSemLote()] });

    assert.deepEqual(nada.retorno, { criadas: 0, log: [] });
    assert.deepEqual(nada.eventos, []); // nem número de lote, nem INSERT
  }

  assert.deepEqual((await estender({ grupos: [] })).retorno, { criadas: 0, log: [] });

  // Modelo sem lote: próximo número da sequência pra ele e pras novas, antes do INSERT único.
  const r = await estender({ grupos: [grupoSemLote()] });

  assert.deepEqual(r.eventos, [
    'proximaRecorrencia',
    ['atualiza', [11], { recorrencia_id: 100 }],
    [
      'insere',
      [
        ['2029-01-15', 100],
        ['2029-02-15', 100],
      ],
    ],
    'limpaCaches',
  ]);
  assert.deepEqual(r.retorno, {
    criadas: 2,
    log: ['Pra sempre: Condomínio — 2 ocorrência(s), de 2029-01 a 2029-02.'],
  });
  assert.equal(r.ctx.Estado.lancamentos.length, 3); // 1 + 2 criadas, já na tela
  assert.match(regras, /\*\*Pra sempre até o limite:\*\* o Consolidar tudo pelo clique/);
  assert.match(
    regras,
    /Nunca roda na consolidação automática de 15 minutos nem na simulação\./
  );
});
