// Gráficos e as regras deles, sem navegador: as funções reais de js/charts.js rodam com um Chart.js falso que guarda a
// configuração montada (tests/helpers/tela-sem-navegador.js), e o teste confere o que o gráfico recebe e o que o toque faz.
const assert = require('./helpers/assert-tolerante');
const test = require('node:test');
const { carregarTela } = require('./helpers/tela-sem-navegador');

const l = (id, nome, data, valor, categ, extra = {}) => ({
  id,
  nome,
  data,
  valor,
  categ,
  cred: false,
  pago: true,
  fatura: null,
  freq: null,
  ...extra,
});

const dados = () => ({
  fin_ciclo: [{ id: 1, inicio: '2026-10-15', fim: null }],
  fin_meta: [],
  fin: [
    l(1, 'Salário', '2026-10-15', 9000, 'Salário'),
    l(2, 'Mercado', '2026-10-16', -300, 'Mercado'),
    l(3, 'Contador', '2026-10-16', -200, 'Contabilidade'),
  ],
});

async function pizza(opcoes = {}) {
  const t = carregarTela({ dados: dados(), ...opcoes });

  await t.bruto('carregarDados()');
  t.bruto('desenhaGraficoPizza(0)');

  return { t, config: t.ctx.graficos.at(-1) };
}

test('pizza de gastos: Contabilidade fica de fora por padrão; legenda à direita no computador e embaixo no celular', async () => {
  const { config } = await pizza();

  assert.ok(config.data.labels.includes('Mercado'));
  assert.ok(!config.data.labels.includes('Contabilidade'));
  assert.equal(config.options.plugins.legend.position, 'right');
  assert.equal(
    (await pizza({ celular: true })).config.options.plugins.legend.position,
    'bottom'
  );
});

test('tocar numa fatia abre o detalhe só com os lançamentos dela', async () => {
  const { t, config } = await pizza();

  config.options.onClick(null, [{ index: config.data.labels.indexOf('Mercado') }]);
  const el = t.ctx.document.getElementById;

  assert.equal(el('modalDetalheCel').open, true);
  assert.match(el('corpoDetalheCel').innerHTML, /Mercado/);
  assert.doesNotMatch(el('corpoDetalheCel').innerHTML, /Salário|Contador/);
  config.options.onClick(null, []); // fora de uma fatia: nada
});

test('Recarregar/Atual limpam os filtros: o gráfico volta a deixar só Contabilidade de fora, sem filtro de teto', () => {
  const t = carregarTela();

  t.bruto(
    "(excluidasDoGrafico = [], Estado.filtroTeto = 'besteira', Estado.filtroTexto = { db: { nome: 'x' } }, limparFiltros())"
  );
  assert.deepEqual(
    t.rodar('[excluidasDoGrafico, Estado.filtroTeto, Estado.filtroTexto]'),
    [['Contabilidade'], null, {}]
  );
});

test('regras de categoria: Isabella conta só a categoria inteira (sem fatura nem comprometido); antecipação de fatura é transferência', () => {
  const t = carregarTela();

  const isabella = (r) =>
    t.rodar(`ehGastoIsabella(${JSON.stringify({ nome: 'x', ...r })})`);

  assert.deepEqual(
    [
      isabella({ categ: 'Isabella' }),
      isabella({ categ: 'Lazer, Isabella' }),
      isabella({ categ: 'Isabella, Fatura' }),
      isabella({ categ: 'Isabella', nome: 'Fatura Isa' }),
      isabella({ categ: 'Isabella', comprometido: true }),
      isabella({ categ: 'Isabellas' }),
    ],
    [true, true, false, false, false, false]
  );
  const transferencia = (r) => t.rodar(`ehTransferenciaFatura(${JSON.stringify(r)})`);

  assert.deepEqual(
    [
      transferencia({ categ: 'Antecipação fatura' }),
      transferencia({ nome: 'antecipacao da fatura' }),
      transferencia({ categ: 'Antecipação fatura', cred: true }),
      transferencia({ categ: 'Fatura' }),
    ],
    [true, true, false, false]
  );
});

test('modal de metas: Valor total e Entrada com "R$" fixo na caixa e a máscara de dinheiro (sem a Entrada à vista)', async () => {
  const modal = async (forma) => {
    const t = carregarTela({
      dados: {
        fin_ciclo: [
          { id: 1, inicio: '2026-10-15', fim: '2026-11-14' },
          { id: 2, inicio: '2026-11-15', fim: null },
        ],
        fin: [],
        fin_meta: [
          {
            id: 7,
            nome: 'Mesa',
            valor: 1500,
            mes: '2026-11-01',
            forma,
            parcelas: 3,
            entrada: 200,
            meses_ate_parcela: 1,
            status: 'aberta',
          },
        ],
      },
    });

    await t.bruto('carregarDados()');

    return t.rodar('htmlModalMetas(planoDasMetas())');
  };

  const caixa = (campo) =>
    new RegExp(
      `<span class="dinheiro campo compacto"><span class=dinheiroPrefixo aria-hidden=true>R\\$</span><input data-campo=${campo} value="[\\d.,]+" inputmode=numeric data-dinheiro`
    );

  const parcelado = await modal('financiamento');

  assert.match(parcelado, caixa('valor'));
  assert.match(parcelado, caixa('entrada'));
  assert.match(parcelado, /data-campo=valor value="1\.500,00"/);
  assert.doesNotMatch(await modal('avista'), /data-campo=entrada/); // à vista: sem entrada
});
