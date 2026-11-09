// Regressão: dois cartões de crédito sem coluna nova no banco — o dia do vencimento da
// fatura decide o cartão (dia 13 = Mercado Pago; qualquer outro = Nubank, todo o histórico).
// Roda as regras reais de js/domain.js, js/shared.js e js/finance.js no mesmo contexto e, sem navegador, o ciclo desenhado de
// verdade (carregarTela) com os dois cartões: a faixa Total do título do Crédito, uma fatura por cartão no Débito, no saldo por dia
// e no gráfico. O Aprovado por cartão e as faturas do cadastro também estão em telas-por-funcao.test.js.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { extrairTrecho } = require('./helpers/carregar-funcoes');
const { declaracoes } = require('./helpers/regras-css');
const { carregarTela } = require('./helpers/tela-sem-navegador');

const ler = (arquivo) => fs.readFileSync(arquivo, 'utf8');
const formulario = ler('js/form.js');
const interacoes = ler('js/interactions.js');
const regras = ler('docs/REGRAS.md');
const decisoes = ler('docs/DECISOES.md');

function carregaRegras(estado = { ciclos: [], faturas: [] }) {
  const contexto = {
    Estado: estado,
    MESES: [],
    document: { getElementById: () => ({}) },
    setTimeout,
    clearTimeout,
    nomeFatura: (f) => f.vencimento.split('-').reverse().join('/'),
  };

  vm.createContext(contexto);
  ['js/domain.js', 'js/shared.js', 'js/finance.js'].forEach((arquivo) =>
    vm.runInContext(ler(arquivo), contexto)
  );
  vm.runInContext(
    `globalThis.r = { cartaoDaFatura, alocacaoAntecipacoes, abatimentoDoCartao, faturasLiquidasDoCiclo,
        vencimentoDoCiclo, limiteCartaoOcupado, limiteCartaoTotal, limiteCartaoLivre,
        definirLimiteCartao, limiteCartaoContratado };`,
    contexto
  );

  return contexto.r;
}

// Um ciclo de novembro com fatura Nubank (12/11) e Mercado Pago (13/11).
const estadoDoisCartoes = () => ({
  ciclos: [{ ini: '2026-11-01', fat: '2026-11-30' }],
  faturas: [{ vencimento: '2026-11-12' }, { vencimento: '2026-11-13' }],
});

test('o dia do vencimento decide o cartão; sem fatura é Nubank', () => {
  const r = carregaRegras();

  assert.equal(r.cartaoDaFatura('2026-11-13'), 'mp');
  assert.equal(r.cartaoDaFatura('2026-11-13T00:00:00'), 'mp');
  assert.equal(r.cartaoDaFatura('2026-11-12'), 'nubank');
  assert.equal(r.cartaoDaFatura('2026-11-20'), 'nubank');
  assert.equal(r.cartaoDaFatura(null), 'nubank');
});

test('antecipação abate só a fatura do próprio cartão; o total por ciclo continua a soma', () => {
  const r = carregaRegras(estadoDoisCartoes());

  const abatido = r.alocacaoAntecipacoes([
    { cred: true, periodoIdx: 0, v: -300, fatura: '2026-11-12' },
    { cred: true, periodoIdx: 0, v: -100, fatura: '2026-11-13' },
    // Antecipação do Mercado Pago maior que a fatura dele: não transborda pro Nubank.
    {
      cred: false,
      categ: 'Antecipação Fatura',
      data: '2026-11-05',
      v: -150,
      fatura: '2026-11-13',
    },
    // Sem fatura: fallback cronológico, só no Nubank.
    { cred: false, categ: 'Antecipação Fatura', data: '2026-11-06', v: -50 },
  ]);

  assert.deepEqual({ ...abatido }, { 0: 150 });
  assert.deepEqual({ ...r.abatimentoDoCartao(abatido, 'mp') }, { 0: 100 });
  assert.deepEqual({ ...r.abatimentoDoCartao(abatido, 'nubank') }, { 0: 50 });
  // Mapa montado à mão (sem detalhe por cartão) continua inteiro do Nubank.
  assert.deepEqual({ ...r.abatimentoDoCartao({ 0: 10 }, 'nubank') }, { 0: 10 });
  assert.deepEqual({ ...r.abatimentoDoCartao({ 0: 10 }, 'mp') }, {});
});

test('uma fatura líquida por cartão, cada uma no seu vencimento', () => {
  const r = carregaRegras(estadoDoisCartoes());

  const base = [
    { cred: true, periodoIdx: 0, v: -300, fatura: '2026-11-12' },
    { cred: true, periodoIdx: 0, v: -100, fatura: '2026-11-13' },
    {
      cred: false,
      categ: 'Antecipação Fatura',
      data: '2026-11-05',
      v: -40,
      fatura: '2026-11-13',
    },
  ];

  // JSON: arrays criados no contexto do vm não passam no deepEqual entre realms.
  const faturas = JSON.parse(
    JSON.stringify(
      r
        .faturasLiquidasDoCiclo(base, r.alocacaoAntecipacoes(base), 0)
        .map((f) => [f.cartao, f.liquido, f.vencimento])
    )
  );

  assert.deepEqual(faturas, [
    ['nubank', -300, '2026-11-12'],
    ['mp', -60, '2026-11-13'],
  ]);
  assert.equal(r.vencimentoDoCiclo(0, 'mp'), '2026-11-13');
});

test('só Nubank no ciclo: uma fatura', () => {
  const r = carregaRegras({
    ciclos: [{ ini: '2026-11-01', fat: '2026-11-30' }],
    faturas: [{ vencimento: '2026-11-12' }],
  });

  const base = [{ cred: true, periodoIdx: 0, v: -300, fatura: '2026-11-12' }];

  assert.equal(r.faturasLiquidasDoCiclo(base, r.alocacaoAntecipacoes(base), 0).length, 1);
});

test('cada cartão ocupa o próprio limite; Mercado Pago sem garantia', () => {
  const r = carregaRegras(estadoDoisCartoes());

  const linhas = [
    { cred: true, pago: true, periodoIdx: 0, v: -300, fatura: '2026-11-12' },
    { cred: true, pago: true, periodoIdx: 0, v: -200, fatura: '2026-11-13' },
    { cred: true, pago: false, periodoIdx: 0, v: -999, fatura: '2026-11-13' }, // aberto: projeção
  ];

  assert.equal(r.limiteCartaoOcupado(linhas, {}, -Infinity, 'nubank'), 300);
  assert.equal(r.limiteCartaoOcupado(linhas, {}, -Infinity, 'mp'), 200);
  assert.equal(r.limiteCartaoTotal(600, 'nubank'), 3350 + 600);
  assert.equal(r.limiteCartaoTotal(600, 'mp'), 1100); // garantia não vale no Mercado Pago
  assert.equal(r.limiteCartaoLivre(linhas, {}, 0, -Infinity, 'mp'), 900);
  assert.equal(r.limiteCartaoLivre(linhas, {}, 0), 3050); // padrão continua sendo o Nubank
});

test('o limite do Mercado Pago é editável sem mexer no do Nubank', () => {
  const r = carregaRegras();

  assert.equal(r.limiteCartaoContratado('mp'), 1100);
  assert.equal(r.definirLimiteCartao('1500,5'.replace(',', '.'), 'mp'), true);
  assert.equal(r.limiteCartaoContratado('mp'), 1500.5);
  assert.equal(r.limiteCartaoContratado(), 3350);
  assert.equal(r.definirLimiteCartao(-1, 'mp'), false);
});

// Três ciclos (o de hoje é o do meio, 20/10/2026) e, no Crédito do ciclo de hoje, compras cujas faturas vencem em dezembro:
// o Nubank vence dia 12 e o Mercado Pago dia 13.
const l = (id, nome, data, valor, extra = {}) => ({
  id,
  nome,
  data,
  valor,
  categ: 'Casa',
  cred: false,
  pago: true,
  fatura: null,
  freq: null,
  ...extra,
});

const dadosDeCartoes = (...compras) => ({
  fin_ciclo: [
    { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
    { id: 2, inicio: '2026-10-15', fim: '2026-11-14' },
    { id: 3, inicio: '2026-11-15', fim: null },
  ],
  fin: [l(1, 'Salário', '2026-10-15', 9000, { categ: 'Salário' }), ...compras],
  fin_meta: [],
});

const nubankPago = l(7, 'Antigo', '2026-10-17', -500, {
  cred: true,
  fatura: '2026-11-12',
});

const nubankAberto = l(6, 'Livro', '2026-11-17', -80, {
  cred: true,
  pago: false,
  fatura: '2026-12-12',
});

const mercadoPagoPago = l(5, 'Fone', '2026-11-16', -150, {
  cred: true,
  fatura: '2026-12-13',
});

// Só o Nubank: o título do Crédito não diz o nome do cartão
const umCartao = () => dadosDeCartoes(nubankPago, nubankAberto);
// Nubank e Mercado Pago: o título vira uma faixa Total
const doisCartoes = () => dadosDeCartoes(nubankPago, nubankAberto, mercadoPagoPago);

// O título do Crédito do ciclo (de `Crédito` até a tabela): o HTML e o texto das faixas Hoje e Futuro
async function tituloDoCredito(dados, ciclo = 1) {
  const { html } = await carregarTela({ dados }).desenharCiclo(ciclo);
  const ini = html.indexOf('Crédito<span class="alertaTitulo');
  const titulo = html.slice(ini, html.indexOf('<table', ini));

  return {
    html: titulo,
    texto: titulo.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '),
    // cada faixa de cartão (o `<span class="limiteCartao temPedacos">` inteiro), na ordem: Hoje, Futuro
    faixas: titulo.split('<span class="limiteCartao temPedacos">').slice(1),
  };
}

test('preferência local separada por cartão; a do Nubank mantém a chave antiga', () => {
  const contexto = vm.createContext({ CARTAO_NUBANK: 'nubank' });

  vm.runInContext(
    `${extrairTrecho(interacoes, 'const CHAVE_LIMITE_CARTAO_LOCAL', ';\n')};\n${extrairTrecho(interacoes, 'const chaveLimiteCartaoLocal', ';\n\n')};\nglobalThis.chave = chaveLimiteCartaoLocal;`,
    contexto
  );
  assert.equal(contexto.chave('nubank'), 'fin.limite-cartao');
  assert.equal(contexto.chave('mp'), 'fin.limite-cartao.mp');
  // Em qual coluna do ciclo o Aprovado de cada cartão grava (limite_aprovado_mp, ...): telas-por-funcao.test.js.
});

test('o campo Aprovado leva o cartão dele (data-limite-cartao), no título e no modal', async () => {
  const t = carregarTela({ dados: doisCartoes() });

  await t.desenharCiclo(1);
  assert.ok(
    t
      .rodar('Estado.cartoesDoCiclo.cartoes.mp.campoAprovado')
      .includes('data-limite-cartao="mp"')
  );
  assert.ok(
    t
      .rodar('Estado.cartoesDoCiclo.cartoes.nubank.campoAprovado')
      .includes('data-limite-cartao="nubank"')
  );
  // Com um cartão só, o campo está no próprio título (o teto É o Aprovado)
  const um = await tituloDoCredito(umCartao());

  assert.equal((um.html.match(/data-limite-cartao="nubank"/g) || []).length, 1);
});

test('Mercado Pago só entra no título depois da 1ª compra nele; com um cartão só o título não diz o nome', async () => {
  const sem = await tituloDoCredito(umCartao());

  assert.doesNotMatch(sem.html, /limiteCartaoNome|Mercado Pago/);
  // 1 cartão: uma faixa completa por linha (Hoje e Futuro), com o próprio Usado e Livre
  assert.equal(sem.faixas.length, 2);
  assert.match(
    sem.texto,
    /Hoje Fatura R\$\s0,00 Usado R\$\s500,00 Livre R\$\s2\.850,00 de/
  );
  assert.match(
    sem.texto,
    /Futuro Fatura R\$\s80,00 Usado R\$\s80,00 Livre R\$\s3\.270,00/
  );
  // 2 cartões: o título tem só a faixa Total (o nome de cada cartão fica no modal dele)
  const com = await tituloDoCredito(doisCartoes());

  assert.equal(com.faixas.length, 2);
  assert.equal(
    (com.html.match(/limiteCartaoNome cartao-total">Total</g) || []).length,
    2
  );
  assert.doesNotMatch(com.html, /cartao-nubank|cartao-mp|Mercado Pago|Nubank/);
});

test('Débito, saldo diário e gráfico usam uma linha de fatura por cartão, cada uma no seu vencimento', async () => {
  const t = carregarTela({ dados: doisCartoes() });

  // Débito: "Fatura Nubank" e "Fatura Mercado Pago" no ciclo e nunca a antiga "Fatura do cartão"
  // (as duas linhas no Débito já estão conferidas em telas-por-funcao.test.js)
  const { texto } = await t.desenharCiclo(2);

  assert.match(texto, /Fatura Nubank/);
  assert.match(texto, /Fatura Mercado Pago/);
  assert.doesNotMatch(texto, /Fatura do cartão/);

  // Saldo por dia: a de 12/12 (Nubank, R$ 80 aberta) e a de 13/12 (Mercado Pago, R$ 150 paga) saem cada uma no dia delas
  t.ctx.document.getElementById('ciclo').value = '2';
  const saldo = t.rodar('saldoPorDia()');

  const dias = Object.keys(saldo).sort(); // só os dias com movimento
  const antes = dias[dias.indexOf('2026-12-12') - 1];

  assert.equal(saldo['2026-12-12'] - saldo[antes], -80);
  assert.equal(saldo['2026-12-13'] - saldo['2026-12-12'], -150);

  // Gráfico de evolução: uma barra de Gasto por fatura, com o nome do cartão
  const [ciclo] = t.rodar('dadosEvolucao(2, 2)');

  assert.deepEqual(
    ciclo.linhasDe.Gasto.filter((g) => g.categ == 'Fatura').map((g) => [
      g.nome,
      g.v,
      g.data,
    ]),
    [
      ['Fatura Nubank', -80, '2026-12-12'],
      ['Fatura Mercado Pago', -150, '2026-12-13'],
    ]
  );
});

test('tabela única marca só o que é do Mercado Pago: a linha da compra e o selo MP na antecipação dela', async () => {
  const antecipacaoMp = l(9, 'Antecipação', '2026-10-18', -100, {
    categ: 'Antecipação fatura',
    fatura: '2026-12-13',
  });

  const antecipacaoNubank = l(10, 'Antecipação', '2026-10-18', -100, {
    categ: 'Antecipação fatura',
    fatura: '2026-12-12',
  });

  const t = carregarTela({
    dados: dadosDeCartoes(mercadoPagoPago, antecipacaoMp, antecipacaoNubank),
  });

  await t.bruto('carregarDados()');

  const tabela = (filtro) =>
    t.rodar(`renderTabela(Estado.lancamentos.filter(r => ${filtro}), 'cr', true)`);

  const credito = tabela('r.cred');

  assert.match(credito, /<tr class="mp [^"]*"[^>]*data-sid="5"/);
  const debito = tabela('r.id == 9 || r.id == 10');

  assert.match(debito, /title="Abate fatura do Mercado Pago">↳ Fat\. [^<]* MP<\/span>/);
  assert.equal((debito.match(/class="tagFatura"/g) || []).length, 2);
  assert.equal((debito.match(/ MP<\/span>/g) || []).length, 1); // a do Nubank fica sem selo
});

function carregaVencimentosPrevistos() {
  const inicio = formulario.indexOf('function vencimentosPrevistosDosCartoes(');
  const fim = formulario.indexOf('\n}\n', inicio) + 3;

  const contexto = {
    CARTOES: ['nubank', 'mp'],
    DIA_VENCIMENTO_CARTAO: { nubank: 12, mp: 13 },
    DATA_LIMITE_RECORRENCIA: '2032-12-31',
    hojeISO: () => '2026-10-16',
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${formulario.slice(inicio, fim)}\nglobalThis.f = vencimentosPrevistosDosCartoes;`,
    contexto
  );

  return contexto.f;
}

test('cadastro oferece os vencimentos dos dois cartões, do mês passado até dez/2032', () => {
  const vencimentos = Array.from(carregaVencimentosPrevistos()('2026-10-16'));

  assert.deepEqual(vencimentos.slice(0, 4), [
    '2026-09-12',
    '2026-09-13',
    '2026-10-12',
    '2026-10-13',
  ]);
  assert.deepEqual(vencimentos.slice(-2), ['2032-12-12', '2032-12-13']);
  // Virada de ano no mês anterior.
  assert.deepEqual(Array.from(carregaVencimentosPrevistos()('2027-01-05')).slice(0, 2), [
    '2026-12-12',
    '2026-12-13',
  ]);
});

test('regra e decisão documentadas', () => {
  assert.match(
    regras,
    /Dois cartões de crédito, sem coluna nova: o dia do vencimento da `fatura` decide o cartão/
  );
  assert.match(
    regras,
    /O Mercado Pago tem limite contratado próprio \(`LIMITE_CARTAO_MP`, inicialmente \*\*R\$ 1\.100,00\*\*\), editável no modal dele igual ao do Nubank, e nunca tem garantia/
  );
  assert.match(decisoes, /## Fatura e Crédito/);
  assert.match(decisoes, /Regra provisória: o cartão sai do dia do vencimento da fatura/);
  assert.doesNotMatch(regras, /O único cartão atual é o Nubank/);
});

test('com dois cartões, Hoje e Futuro começam pelo Total somado dos dois, e o título não mostra nada de cada cartão (nem a fatura)', async () => {
  const { texto, html } = await tituloDoCredito(doisCartoes());

  // Teto 3.350 + 1.100; Hoje: 500 (Nubank pago) + 150 (Mercado Pago pago) usados e só a fatura paga do MP; Futuro: 80 + 150
  assert.match(
    texto,
    /Hoje Total Fatura R\$\s150,00 Usado R\$\s650,00 Livre R\$\s3\.800,00 de R\$\s4\.450,00 Futuro Total Fatura R\$\s230,00 Usado R\$\s230,00 Livre R\$\s4\.220,00/
  );
  assert.doesNotMatch(html, /data-limite-cartao|data-garantia-cartao/); // o Aprovado e a Garantia ficam no modal de cada cartão
  assert.match(
    regras,
    /\*\*No título\*\*, com dois cartões, Hoje e Futuro ficam enxutos: só a faixa \*\*Total\*\*/
  );
  assert.match(regras, /o próprio campo editável fica depois de "de"/);
});

test('cada faixa mostra Fatura, Usado e Livre do mesmo teto (Usado = teto − Livre), nas duas linhas, mesmo quando coincidem', async () => {
  for (const dados of [umCartao(), doisCartoes()]) {
    const { faixas } = await tituloDoCredito(dados);

    assert.equal(faixas.length, 2); // Hoje e Futuro têm a mesma estrutura

    for (const faixa of faixas) {
      const rotulos = [...faixa.matchAll(/class=limiteRotulo>([^<]*)</g)].map(
        (m) => m[1]
      );

      assert.deepEqual(rotulos, ['Fatura', 'Usado', 'Livre']);
    }
  }

  // Usado = teto − Livre, e o Livre muda de cor (verde/vermelho) com o sinal
  const { html } = await tituloDoCredito(umCartao());

  assert.match(
    html,
    /<span class=limiteRotulo>Usado<\/span> <b class=limiteUsado>R\$\s500,00<\/b>/
  );
  assert.match(
    html,
    /<span class=limiteRotulo>Livre<\/span> <b class="vd">R\$\s2\.850,00<\/b>/
  );
  assert.match(
    regras,
    /Usado = teto − Livre: em Hoje, as compras confirmadas que ainda ocupam o cartão/
  );
});

test('a fatura não fica solta no começo da linha: é o 1º pedaço de cada faixa, com rótulo', async () => {
  const um = await tituloDoCredito(umCartao());

  for (const faixa of um.faixas)
    assert.match(faixa, /^<span class=pedaco><span class=limiteRotulo>Fatura</);
  const dois = await tituloDoCredito(doisCartoes());

  // com dois cartões o 1º pedaço é o nome Total e o 2º, a fatura
  for (const faixa of dois.faixas)
    assert.match(
      faixa,
      /^<span class=pedaco><span class="limiteCartaoNome cartao-total">Total<\/span><\/span><span class=pedaco><span class=limiteRotulo>Fatura</
    );
  assert.match(regras, /Não há valor solto no começo de Hoje\/Futuro\./);
});

test('o teto ("de R$ …") e o Aprovado/Garantido só na primeira faixa: Futuro não repete', async () => {
  // Ciclo de hoje: o teto vai na faixa Hoje, não na Futuro
  const hoje = await tituloDoCredito(doisCartoes());

  assert.match(hoje.faixas[0], /limiteTeto">de R\$\s4\.450,00</);
  assert.doesNotMatch(hoje.faixas[1], /limiteTeto|de R\$/);
  // Ciclo futuro (sem Hoje): a única faixa, a Futuro, é a que leva o teto
  const futuro = await tituloDoCredito(doisCartoes(), 2);

  assert.equal(futuro.faixas.length, 1);
  assert.match(futuro.faixas[0], /limiteTeto">de R\$\s4\.450,00</);
  // Um cartão só, sem garantia: o campo Aprovado ocupa o lugar do "de" e só em Hoje
  const um = await tituloDoCredito(umCartao());

  assert.match(
    um.faixas[0],
    /limiteTeto">de <span class=limiteCartaoBase>R\$ <input[^>]*data-limite-cartao="nubank"/
  );
  assert.doesNotMatch(um.faixas[1], /<input|limiteTeto/);

  // Com garantia (guardado no Nubank), Aprovado e Garantido vêm só na Hoje
  const comGarantia = await tituloDoCredito(
    dadosDeCartoes(
      nubankPago,
      nubankAberto,
      l(8, 'Aporte', '2026-10-16', -500, { categ: 'Investimento' })
    )
  );

  assert.match(comGarantia.faixas[0], /Aprovado<\/span>/);
  assert.match(
    comGarantia.faixas[0],
    /limiteGarantido">\+ R\$ <input[^>]*data-garantia-cartao/
  );
  assert.doesNotMatch(comGarantia.faixas[1], /Aprovado|Garantido|<input/);
  assert.match(
    regras,
    /O teto \("de R\$ 5\.020,00", e com ele Aprovado\/Garantido\) é o mesmo em Hoje e Futuro, então aparece só na primeira faixa/
  );
});

test('faixas separadas por divisor, nome do cartão em cor própria, teto em itálico (CSS)', () => {
  const estilos = ler('css/dashboard.css');

  const faixa = declaracoes(estilos, '.resumoDados > *');

  assert.ok(faixa.includes('padding-left: 0.8rem'));
  assert.ok(faixa.includes('border-left: 1px solid transparent'));
  assert.ok(declaracoes(estilos, '.limiteCartaoNome.cartao-nubank').length > 0);
  assert.ok(declaracoes(estilos, '.limiteCartaoNome.cartao-mp').length > 0);
  assert.ok(declaracoes(estilos, '.limiteTeto', '').includes('font-style: italic')); // na base, fora de @media
  assert.ok(declaracoes(estilos, '.limiteGarantido', '').includes('font-style: italic'));
});

test('nas faixas do Crédito o valor fica colado no próprio rótulo, com respiro entre os pares (CSS)', () => {
  const estilos = ler('css/dashboard.css');

  const valor = declaracoes(estilos, '.resumoDados b');

  assert.ok(valor.includes('display: inline-block'));
  assert.ok(valor.includes('text-align: left'));
  assert.ok(
    declaracoes(estilos, '.resumoDados > .limiteCartao.temPedacos').includes(
      'column-gap: 0.9em'
    )
  );
  assert.match(regras, /Cada valor fica colado no próprio rótulo \("Fatura R\$ 54,48"\)/);
});
