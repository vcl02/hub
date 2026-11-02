// As telas do Fin conferidas por função, sem navegador (antes cada uma subia o app inteiro no Playwright): os scripts de
// verdade rodam com um banco falso (`carregarTela`), o HTML que o desenho devolve e o que o diagnóstico, as metas e o
// cadastro calculam são conferidos com números fixos. O que depende de toque, foco ou banco de verdade continua nos
// testes de navegador (navegador-cartao, -marcas, -metas, -consolidar, -estilos).
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');

const FIN = path.join(__dirname, '..');

const l = (id, nome, valor, extra = {}) => ({
  id: String(id),
  nome,
  data: '2026-10-17',
  valor,
  categ: 'Compras',
  cred: false,
  pago: true,
  fatura: null,
  freq: null,
  ...extra,
});

const cicloAberto = () => [
  { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
  { id: 2, inicio: '2026-10-15', fim: null },
];

// Os dados de exemplo do navegador: salário, mercado e o aluguel do ciclo anterior
const exemplo = (...mais) => ({
  fin_ciclo: cicloAberto(),
  fin: [
    l(1, 'Salário', 9000, { data: '2026-10-15', categ: 'Salário' }),
    l(2, 'Mercado', -320.5, { data: '2026-10-16', categ: 'Mercado' }),
    l(3, 'Aluguel', -2000, { data: '2026-09-20', categ: 'Moradia' }),
    ...mais,
  ],
  fin_meta: [],
});

// Carrega do arquivo publicado as funções de nível de script que a página só alcança com o DOM inteiro
function trazer(tela, arquivo, nomes) {
  const fonte = fs.readFileSync(path.join(FIN, arquivo), 'utf8');

  for (const nome of nomes) {
    // `const nome = (…) => …;` (função de seta) termina no primeiro `;` no fim de linha; função declarada, em `\n}\n`
    const iniConst = fonte.indexOf(`\nconst ${nome} = (`);

    const ini = Math.max(
      fonte.indexOf(`\nasync function ${nome}(`),
      fonte.indexOf(`\nfunction ${nome}(`),
      iniConst
    );

    assert.ok(ini >= 0, `${nome} não está em ${arquivo}`);

    const fim =
      ini === iniConst ? fonte.indexOf(';\n', ini) + 2 : fonte.indexOf('\n}\n', ini) + 3;

    vm.runInContext(fonte.slice(ini, fim), tela.ctx, { filename: arquivo });
  }
}

// ---------- Tetos de Besteira e Isabella no título do Débito ----------

const comTetos = () =>
  exemplo(
    l(40, 'Café', -50, { categ: 'Besteira' }),
    l(42, 'Sorvete', -20, { categ: 'Besteira', pago: false }),
    l(43, 'Cinema', -800, { categ: 'Isabella' })
  );

test('tetos: Hoje conta só o pago (R$ 50 de 250 = 20%), Futuro soma o em aberto (R$ 70 = 28%)', async () => {
  const { texto } = await carregarTela({ dados: comTetos() }).desenharCiclo(1);

  const usados = [...texto.matchAll(/Besteira Usado (\d+)%/g)].map((m) => m[1]);

  assert.deepEqual(usados, ['20', '28']);
});

test('tetos: Isabella acima do teto (R$ 800 de 700) diz Ultrapassado, nos dois, e quanto passou', async () => {
  const { texto } = await carregarTela({ dados: comTetos() }).desenharCiclo(1);

  assert.equal([...texto.matchAll(/Isabella Ultrapassado/g)].length, 2);
  assert.match(texto, /Acima R\$\s100,00/);
});

test('tetos: o nome explica o que entra (dica) e é o botão que filtra pelo teto', async () => {
  const { html } = await carregarTela({ dados: comTetos() }).desenharCiclo(1);

  const dica = (chave) =>
    html.match(new RegExp(`data-filtro-teto="${chave}"[^>]*title="([^"]*)"`))?.[1];

  assert.match(dica('besteira'), /café/);
  assert.match(dica('isabella'), /Lazer/);
  assert.match(dica('besteira'), /Clique para mostrar só o que conta neste teto/);
});

// ---------- Cartões: botão, faturas do débito e vencimentos do cadastro ----------

const compraNoCartao = (id, nome, fatura, valor) =>
  l(id, nome, valor, { data: '2026-10-18', cred: true, fatura });

// Roda atualizarCartoes (interactions.js) de verdade e devolve o `disabled` dos dois botões do cabeçalho
function botoesDosCartoes(t) {
  const fonte = fs.readFileSync(path.join(FIN, 'js/interactions.js'), 'utf8');
  const ini = fonte.indexOf('const BOTAO_DO_CARTAO = {');
  const fim = fonte.indexOf('\n}\n', fonte.indexOf('function atualizarCartoes(')) + 3;

  vm.runInContext(fonte.slice(ini, fim), t.ctx, { filename: 'js/interactions.js' });
  vm.runInContext(
    'function preencherModalCartao() {}', // o modal fica fechado: não é chamada
    t.ctx
  );
  t.bruto('atualizarCartoes')();
  const el = t.ctx.document.getElementById;

  return { nubank: el('btNubank').disabled, mp: el('btMercadoPago').disabled };
}

test('cartões: o botão do Mercado Pago só é ativado com compra nele; o do Nubank sempre que há fatura', async () => {
  let t = carregarTela({
    dados: exemplo(compraNoCartao(20, 'Livro', '2026-11-12', -80)),
  });

  await t.desenharCiclo(1);
  assert.deepEqual(botoesDosCartoes(t), { nubank: false, mp: true });
  t = carregarTela({
    dados: exemplo(
      compraNoCartao(20, 'Livro', '2026-11-12', -80),
      compraNoCartao(21, 'Fone', '2026-11-13', -150)
    ),
  });
  await t.desenharCiclo(1);
  assert.deepEqual(botoesDosCartoes(t), { nubank: false, mp: false });
});

test('cartões: o débito tem uma linha de fatura por cartão; o Mercado Pago só aparece depois da 1ª compra nele', async () => {
  const sem = await carregarTela({ dados: exemplo() }).desenharCiclo(1);

  assert.doesNotMatch(sem.texto, /Mercado Pago/);

  const com = await carregarTela({
    dados: exemplo(
      compraNoCartao(20, 'Livro', '2026-11-12', -80),
      compraNoCartao(21, 'Fone', '2026-11-13', -150)
    ),
  }).desenharCiclo(1);

  assert.match(com.texto, /Fatura Nubank\s*−R\$\s80,00/);
  assert.match(com.texto, /Fatura Mercado Pago\s*−R\$\s150,00/);
});

test('cartões: o Aprovado digitado no modal vai para a coluna do cartão (Mercado Pago: limite_aprovado_mp)', () => {
  const t = carregarTela({ dados: exemplo() });

  trazer(t, 'js/interactions.js', ['colunaDoCampoDeLimite']);

  const coluna = (dataset) =>
    t.rodar(`colunaDoCampoDeLimite({ dataset: ${JSON.stringify(dataset)} })`);

  assert.equal(coluna({ limiteCartao: 'mp' }), 'limite_aprovado_mp');
  assert.equal(coluna({ limiteCartao: 'nubank' }), 'limite_aprovado_nubank');
  assert.equal(coluna({ garantiaCartao: '' }), 'limite_garantia_nubank');
});

test('cadastro: as faturas oferecidas dizem o cartão; escolher o Mercado Pago na 1ª leva as outras parcelas para o dia 13', () => {
  const t = carregarTela({ dados: exemplo(), hoje: '2026-10-20' });

  trazer(t, 'js/form.js', [
    'nomeFatura',
    'vencimentosPrevistosDosCartoes',
    'opcoesFaturasDisponiveis',
    'faturaDoMesSeguinte',
    'faturasSugeridasParaParcelas',
    'rotuloFaturaComCartao', // a const de verdade do form.js
  ]);
  const opcoes = t.rodar('opcoesFaturasDisponiveis()');

  assert.ok(opcoes.some((o) => o.vencimento.endsWith('-12') && /Nubank/.test(o.rotulo)));
  assert.ok(
    opcoes.some((o) => o.vencimento.endsWith('-13') && /Mercado Pago/.test(o.rotulo))
  );
  assert.equal(opcoes[0].vencimento.slice(0, 7), '2026-09'); // do mês passado
  assert.equal(opcoes.at(-1).vencimento.slice(0, 7), '2032-12'); // até dez/2032
  assert.deepEqual(t.rodar("faturasSugeridasParaParcelas('2026-10-20', 3, 'Mensal')"), [
    '2026-11-12',
    '2026-12-12',
    '2027-01-12',
  ]); // Nubank por padrão
  const cartao = t.rodar("cartaoDaFatura('2026-11-13')"); // a 1ª escolhida à mão

  assert.equal(cartao, 'mp');
  assert.deepEqual(
    t.rodar(
      `faturasSugeridasParaParcelas('2026-10-20', 3, 'Mensal', ${JSON.stringify(cartao)})`
    ),
    ['2026-11-13', '2026-12-13', '2027-01-13']
  );
});

test('cadastro: o título do 1º seletor de fatura (Frequência, parcelado ou parcela única) e o rótulo com o cartão', () => {
  const t = carregarTela({ dados: exemplo() });

  trazer(t, 'js/form.js', [
    'nomeFatura',
    'tituloDaPrimeiraFatura',
    'rotuloFaturaComCartao',
  ]);
  const titulo = t.bruto('tituloDaPrimeiraFatura');

  assert.equal(titulo('Mensal', 1), '1ª fatura');
  assert.equal(titulo('Mensal', 5), '1ª fatura'); // Frequência vence o número de parcelas
  assert.equal(titulo('', 3), 'Fatura da parcela 1');
  assert.equal(titulo('', 1), 'Parcela única');
  assert.equal(titulo('', 2), 'Fatura da parcela 1');
  assert.equal(t.rodar("rotuloFaturaComCartao('2026-11-12')"), '12/11/2026 · Nubank');
  assert.equal(
    t.rodar("rotuloFaturaComCartao('2026-11-13')"),
    '13/11/2026 · Mercado Pago'
  );
});

// ---------- Marcas Reserva e Comprometido: o cabeçalho ----------

test('tabela: o cabeçalho de Reserva e de Comprometido tem a pergunta que decide a marca', async () => {
  const { html } = await carregarTela({ dados: exemplo() }).desenharCiclo(1);

  assert.ok(html.includes('Se eu perder o emprego, preciso continuar pagando isso?'));
  assert.ok(html.includes('Começou o mês, isso já é obrigatório pagar?'));
});

// ---------- Diagnóstico ----------

const comInconsistencia = () => {
  const d = exemplo(l(30, 'Sem fatura', -50, { cred: true }));

  d.fin_ciclo = [{ id: 1, inicio: '2026-08-01', fim: '2026-08-31' }, ...cicloAberto()]; // buraco entre 31/08 e 15/09

  return d;
};

async function diagnosticar(dados) {
  const t = carregarTela({ dados });
  const classes = new Set();
  const botao = t.ctx.document.getElementById('btDiagnostico');

  botao.classList.toggle = (c, ligado) => (ligado ? classes.add(c) : classes.delete(c));
  const { diagnosticoDeDados } = await t.bruto('carregarDados()');

  t.bruto('atualizarBotaoDiagnostico').call(null, diagnosticoDeDados);

  return { diagnostico: diagnosticoDeDados, classes, botao };
}

test('diagnóstico: dado inconsistente acende o botão; inconsistências e avisos vêm em listas separadas', async () => {
  const { diagnostico, classes, botao } = await diagnosticar(comInconsistencia());

  assert.ok(classes.has('temInconsistencia'));
  assert.match(botao.title, /1 inconsistência na última carga/);
  assert.ok(
    diagnostico.inconsistencias.some((m) => /crédito sem fatura vinculada/.test(m)),
    JSON.stringify(diagnostico)
  );
  assert.ok(diagnostico.avisos.some((m) => /Sem ciclo entre 2026-09-01/.test(m)));
  assert.ok(!diagnostico.avisos.some((m) => /crédito sem fatura/.test(m)));
});

test('diagnóstico: sem nada errado, o botão fica apagado', async () => {
  const { diagnostico, classes, botao } = await diagnosticar(exemplo());

  assert.deepEqual(Array.from(diagnostico.inconsistencias), []);
  assert.ok(!classes.has('temInconsistencia'));
  assert.equal(botao.title, 'Sem inconsistências na última carga');
});

test('diagnóstico: o modal preenche as duas listas e esconde a seção que está vazia', () => {
  const casos = [
    { inconsistencias: ['i1', 'i2'], avisos: [], escondeInc: false, escondeAv: true },
    { inconsistencias: [], avisos: ['a1'], escondeInc: true, escondeAv: false },
    {
      inconsistencias: ['i1'],
      avisos: ['a1', 'a2'],
      escondeInc: false,
      escondeAv: false,
    },
    { inconsistencias: [], avisos: [], escondeInc: true, escondeAv: true },
  ];

  for (const c of casos) {
    const t = carregarTela({ dados: exemplo() });
    const el = t.ctx.document.getElementById;

    t.bruto('mostrarDiagnostico')('Título', 'Texto', {
      inconsistencias: c.inconsistencias,
      avisos: c.avisos,
    });
    const texto = (id) => el(id).filhos.map((f) => f.textContent);

    assert.deepEqual(texto('listaInconsistencias'), c.inconsistencias);
    assert.deepEqual(texto('listaAvisos'), c.avisos);
    assert.equal(el('secaoInconsistencias').hidden, c.escondeInc);
    assert.equal(el('secaoAvisos').hidden, c.escondeAv);
    assert.equal(el('tituloDiagnostico').textContent, 'Título');
    assert.equal(el('textoDiagnostico').textContent, 'Texto');
    assert.equal(el('modalDiagnostico').open, true);
  }

  // Campos ausentes valem como listas vazias
  const t = carregarTela({ dados: exemplo() });

  t.bruto('mostrarDiagnostico')('T', 'x', {});
  assert.equal(t.ctx.document.getElementById('secaoAvisos').hidden, true);
  assert.equal(t.ctx.document.getElementById('secaoInconsistencias').hidden, true);
});

// A carga de verdade (load): o relógio e o console são trocados para o teste controlar o tempo e ler o que sai
function prepararCarga(dados, { relogio = [0, 0] } = {}) {
  const t = carregarTela({ dados });
  const toasts = [];
  const consola = [];
  const marcas = [...relogio];

  t.ctx.console = {
    info: (...a) => consola.push(['info', a.join(' ')]),
    warn: (...a) => consola.push(['warn', a.join(' ')]),
    error: (...a) => consola.push(['error', a.join(' ')]),
    log() {},
  };
  t.ctx.performance = { now: () => marcas.shift() ?? 0 };
  trazer(t, 'js/data-ui.js', ['load']);
  vm.runInContext(
    'desenhar = () => {}; atualizarCombos = () => {}; mostrarToast = (titulo, texto) => toasts.push([titulo, texto]);',
    Object.assign(t.ctx, { toasts })
  );

  return { t, toasts, consola };
}

test('carga lenta (1 s ou mais): toast "Carga lenta" e uma linha só de métricas no Console', async () => {
  const { t, toasts, consola } = prepararCarga(exemplo(), {
    relogio: [0, 100, 200, 1500], // início, após dados, após combos, após o desenho
  });

  await t.bruto('load()');
  assert.deepEqual(
    toasts.map(([titulo]) => titulo),
    ['Carga lenta']
  );
  assert.match(toasts[0][1], /1,5 s/);
  const diag = consola.filter(([, texto]) => texto.startsWith('[diag]'));

  assert.equal(diag.length, 1, JSON.stringify(consola));
  assert.match(diag[0][1], /^\[diag\] carga 1500ms/);
  assert.ok(!consola.some(([tipo]) => tipo === 'error'));
});

test('carga rápida: só a linha de métricas, sem toast', async () => {
  const { t, toasts, consola } = prepararCarga(exemplo(), { relogio: [0, 10, 20, 300] });

  await t.bruto('load()');
  assert.deepEqual(toasts, []);
  assert.equal(consola.filter(([, texto]) => texto.startsWith('[diag]')).length, 1);
});

test('falha de carga: toast, e a tela diz que pode tentar de novo sem duplicar', async () => {
  const { t, toasts } = prepararCarga(exemplo());

  t.rodar('ESPERA_ENTRE_TENTATIVAS_MS.fill(0)'); // sem esperar entre as tentativas
  t.ctx.fetch = async () => {
    throw new TypeError('Failed to fetch'); // sem rede
  };

  assert.equal(await t.bruto('load()'), false);
  assert.deepEqual(
    toasts.map(([titulo]) => titulo),
    ['Não foi possível carregar']
  );
  assert.match(t.ctx.document.getElementById('out').innerHTML, /Falhou: /);
  assert.match(
    t.ctx.document.getElementById('out').innerHTML,
    /repetir não duplica nada/
  );
});

// ---------- Metas ----------

const meta = (extra = {}) => ({
  id: 7,
  nome: 'Mesa',
  valor: 1500,
  mes: '2026-11-01',
  forma: 'avista',
  parcelas: null,
  entrada: null,
  meses_ate_parcela: null,
  status: 'aberta',
  ...extra,
});

// Ciclos de setembro/2026 a dezembro/2027 (o último aberto)
function ciclosAteDezembro() {
  return Array.from({ length: 16 }, (_, i) => ({
    id: i + 1,
    inicio: new Date(Date.UTC(2026, 8 + i, 15)).toISOString().slice(0, 10),
    fim: i === 15 ? null : new Date(Date.UTC(2026, 9 + i, 14)).toISOString().slice(0, 10),
  }));
}

// Uma meta que não cabe: R$ 60.000 em 3× no débito em dezembro, com o salário de cada mês lançado
function dadosQueNaoCabe() {
  return {
    fin_ciclo: ciclosAteDezembro(),
    fin_meta: [
      meta({
        nome: 'Carro',
        valor: 60000,
        mes: '2026-12-01',
        forma: 'financiamento',
        parcelas: 3,
      }),
    ],
    fin: [
      l(1, 'Salário', 9000, { data: '2026-10-15', categ: 'Salário' }),
      ...Array.from({ length: 15 }, (_, i) =>
        l(100 + i, 'Salário', 9000, {
          data: new Date(Date.UTC(2026, 10 + i, 15)).toISOString().slice(0, 10),
          categ: 'Salário',
          pago: false,
        })
      ),
    ],
  };
}

async function modalDasMetas(dados) {
  const t = carregarTela({ dados });

  await t.bruto('carregarDados()');

  return { t, html: t.bruto('htmlModalMetas(planoDasMetas())') };
}

test('meta que não cabe: o modal diz que não cabe, as formas são só À vista e os dois parcelados, e há Mínimo e "Cabe começando em"', async () => {
  const { html } = await modalDasMetas(dadosQueNaoCabe());

  assert.match(html.replace(/<[^>]+>/g, ' '), /Não cabe/);

  const formas = [
    ...html.matchAll(/<option value=\w+(?: selected)?>([^<]+)<\/option>/g),
  ].map((m) => m[1].trim());

  assert.deepEqual(formas, ['À vista', 'Parcelado Crédito', 'Parcelado Débito']);
  const vezes = +html.match(/data-acao=usarVezes data-vezes=(\d+)/)[1];
  const mes = html.match(/data-acao=usarMes data-mes=(\d{4}-\d{2}-\d{2})/)[1];

  assert.ok(vezes > 3, `vezes ${vezes}`);
  assert.ok(mes > '2026-12-01', mes);
});

test('meta: valores digitados de cada campo (mês só completo, valor total maior que zero, vezes de 1 a 120)', () => {
  const t = carregarTela({ dados: exemplo() });

  trazer(t, 'js/interactions.js', ['valorDoCampoDaMeta']);
  t.ctx.numeroDoLimiteDigitado = (texto) =>
    Number(String(texto).replace(/\./g, '').replace(',', '.'));

  const v = (campo, texto) =>
    t.rodar(`valorDoCampoDaMeta('${campo}', ${JSON.stringify(texto)})`);

  assert.equal(v('nome', 'Mesa de jantar'), 'Mesa de jantar');
  assert.equal(v('nome', '  '), null); // inválido (undefined sai como null do JSON)
  assert.equal(v('mes', '2027-01'), '2027-01-01');
  assert.equal(v('mes', '0202-01'), '0202-01-01'); // o navegador manda o ano a cada dígito: quem barra é o handler
  assert.equal(v('mes', '2027'), null);
  assert.equal(v('valor', '0,00'), null); // valor total zero não vale
  assert.equal(v('valor', '1.500,00'), 1500);
  assert.equal(v('entrada', ''), null);
  assert.equal(v('entrada', '1.000,00'), 1000);
  assert.equal(v('parcelas', '20'), 20);
  assert.equal(v('parcelas', '121'), null);
  assert.equal(v('parcelas', ''), null);
  assert.equal(v('forma', 'cartao'), 'cartao');
  assert.equal(v('forma', 'juros'), null);
});

test('meta: "Mínimo/Ideal/Em Nx" grava as vezes e "Cabe começando em …" muda o mês e põe a entrada 1 mês antes', async () => {
  const t = carregarTela({ dados: dadosQueNaoCabe() });

  await t.bruto('carregarDados()');
  trazer(t, 'js/interactions.js', ['ajustarMeta']);
  const gravou = [];

  t.ctx.gravarMudancaDaMeta = (...a) => gravou.push(a);
  t.bruto('ajustarMeta')(7, { dataset: { acao: 'usarVezes', vezes: '5' } });
  t.bruto('ajustarMeta')(7, { dataset: { acao: 'usarMes', mes: '2027-02-01' } });
  const plano = () => JSON.parse(JSON.stringify(gravou));

  assert.deepEqual(plano(), [
    ['atualizar', 7, { parcelas: 5 }],
    ['atualizar', 7, { mes: '2027-02-01' }],
  ]);
  vm.runInContext(
    'Estado.metas[0].entrada = 1000; Estado.metas[0].meses_ate_parcela = 3',
    t.ctx
  );
  t.bruto('ajustarMeta')(7, { dataset: { acao: 'usarMes', mes: '2027-02-01' } });
  assert.deepEqual(plano()[2], [
    'atualizar',
    7,
    { mes: '2027-02-01', meses_ate_parcela: 1 },
  ]);
});

test('meta: na simulação nada vai ao banco (só a memória); fora dela, grava e a tela redesenha', async () => {
  // Contexto à parte: as gravações do supabase-api.js são const e não se trocam; aqui são espiões
  const banco = [];
  let desenhos = 0;

  const ctx = vm.createContext({
    Estado: { simulando: true, metas: [{ id: 7, parcelas: 3 }], _proxIdSimulado: 0 },
    desenhar: () => desenhos++,
    mostrarToast: () => {},
    normalizarMeta: (m) => m,
    atualizarMeta: async (id, campos) => (
      banco.push(['PATCH', id, campos]),
      { id, ...campos }
    ),
    excluirMeta: async (id) => banco.push(['DELETE', id]),
    inserirMeta: async (campos) => (banco.push(['POST', campos]), { id: 99, ...campos }),
  });

  const fonte = fs.readFileSync(path.join(FIN, 'js/interactions.js'), 'utf8');
  const ini = fonte.indexOf('const metasNoAr = new Set();');

  const fim =
    fonte.indexOf('\n}\n', fonte.indexOf('async function gravarMudancaDaMeta(')) + 3;

  vm.runInContext(fonte.slice(ini, fim), ctx);
  const grava = (...a) => vm.runInContext('gravarMudancaDaMeta', ctx)(...a);
  const veja = (x) => JSON.parse(JSON.stringify(x));

  await grava('atualizar', 7, { parcelas: 5 });
  assert.deepEqual(veja(banco), []); // simulando: nada no banco
  assert.equal(vm.runInContext('Estado.metas[0].parcelas', ctx), 5); // mas a tela já reflete
  await grava('excluir', 7);
  assert.deepEqual(veja(banco), []);
  assert.equal(vm.runInContext('Estado.metas.length', ctx), 0);
  vm.runInContext(
    'Estado.simulando = false; Estado.metas = [{ id: 7, parcelas: 3 }]',
    ctx
  );
  await grava('atualizar', 7, { parcelas: 5 });
  await grava('excluir', 7);
  assert.deepEqual(veja(banco), [
    ['PATCH', 7, { parcelas: 5 }],
    ['DELETE', 7],
  ]);
  assert.equal(desenhos, 4); // cada gravação redesenha a tela
});

test('sem a tabela de metas (antes da migration 36) a carga segue, sem metas, e o botão Metas fica escondido', async () => {
  const dados = exemplo();

  delete dados.fin_meta;
  const t = carregarTela({ dados });

  await t.bruto('carregarDados()');
  assert.equal(t.rodar('Estado.temMetas'), false); // o botão só aparece com Estado.temMetas (atualizarMetas)
  assert.equal(t.rodar('Estado.metas.length'), 0);
  assert.ok(t.rodar('Estado.lancamentos.length') > 0);
});

// ---------- Débito recolhido quando Hoje e Futuro dizem o mesmo (resumoDebitoIgual, dentro de vCiclo) ----------

async function recolhidosNoCicloAtual(lancamentos) {
  const t = carregarTela({ dados: { ...exemplo(), fin: lancamentos } });
  const recolhidos = [];

  await t.bruto('carregarDados()');
  t.bruto('atualizarCombos()');
  vm.runInContext(
    'var recolherBloco = (bloco) => recolhidos.push(bloco);',
    Object.assign(t.ctx, { recolhidos })
  );
  t.ctx.document.getElementById('ciclo').value = String(t.rodar('Estado.idxHoje'));
  t.bruto('vCiclo()');

  return { recolhidos, marca: t.rodar('Estado.cicloQuitadoRecolhido') };
}

test('débito: Hoje e Futuro iguais (tudo pago, sobra zero, sem Aporte sugerido) recolhem o Débito; com um aberto, não', async () => {
  const igual = await recolhidosNoCicloAtual([
    l(1, 'Salário', 1000, { data: '2026-10-16', categ: 'Salário' }),
    l(2, 'Mercado', -1000, { data: '2026-10-16', categ: 'Mercado' }),
  ]);

  assert.ok(igual.recolhidos.includes('db'), JSON.stringify(igual));
  assert.match(igual.marca, /:db/);

  const aberto = await recolhidosNoCicloAtual([
    l(1, 'Salário', 1000, { data: '2026-10-16', categ: 'Salário' }),
    l(2, 'Mercado', -1000, { data: '2026-10-16', categ: 'Mercado', pago: false }),
  ]);

  assert.ok(!aberto.recolhidos.includes('db'), JSON.stringify(aberto));

  // Dois abertos que se anulam: o valor fecha igual, mas há débito por pagar
  const compensado = await recolhidosNoCicloAtual([
    l(1, 'Salário', 1000, { data: '2026-10-16', categ: 'Salário' }),
    l(2, 'Mercado', -1000, { data: '2026-10-16', categ: 'Mercado' }),
    l(3, 'Extra', 100, { data: '2026-10-16', categ: 'Salário', pago: false }),
    l(4, 'Conta', -100, { data: '2026-10-16', categ: 'Moradia', pago: false }),
  ]);

  assert.ok(!compensado.recolhidos.includes('db'), JSON.stringify(compensado));

  // Tudo pago, mas sobrou dinheiro (o Aporte sugerido entra no Futuro): Hoje e Futuro diferem
  const sobra = await recolhidosNoCicloAtual([
    l(1, 'Salário', 1000, { data: '2026-10-16', categ: 'Salário' }),
    l(2, 'Mercado', -400, { data: '2026-10-16', categ: 'Mercado' }),
  ]);

  assert.ok(!sobra.recolhidos.includes('db'), JSON.stringify(sobra));
});
