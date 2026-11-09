// Regressão: indicadores de limite por categoria (Besteira, Isabella) no título Débito do
// ciclo atual — somam Débito e Crédito do mesmo ciclo (pela DATA da compra) contra um teto
// fixo em código, cada um com o seu. Na tela (Hoje só o pago, Futuro com o em aberto, Ultrapassado e quanto passou, a dica
// e o filtro pelo nome): telas-por-funcao.test.js.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { etiquetas } = require('./helpers/html');
const { declaracoes } = require('./helpers/regras-css');
const { carregarTela } = require('./helpers/tela-sem-navegador');

fs.readFileSync('js/domain.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

// Extrai dadosLimiteCategoriaDoCiclo E ehGastoIsabella do arquivo real (não reescreve a
// regra à mão) e roda num contexto isolado, com os globais de que dependem simulados.
function carregaDadosLimiteCategoriaDoCiclo() {
  const inicio = graficos.indexOf('// Base do percentual');
  const fim = graficos.indexOf('function dadosCompromissosCiclo(');

  if (inicio < 0 || fim < 0)
    throw Error('Não encontrou a regra de limite por categoria.');

  const contexto = {
    semAcento: (valor) =>
      String(valor ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase(),
    ehTransferenciaFatura: (r) =>
      String(r.categ || '')
        .toLowerCase()
        .includes('antecipação fatura'),
    categoriasSeparadas: (valor) =>
      String(valor ?? '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
  };

  // Mesma regra de js/shared.js: item inteiro da lista, sem acento/caixa.
  contexto.ehCategoria = (categ, procurada) =>
    contexto
      .categoriasSeparadas(categ)
      .some((c) => contexto.semAcento(c) === contexto.semAcento(procurada).trim());
  vm.createContext(contexto);
  vm.runInContext(
    `${graficos.slice(inicio, fim)}
globalThis.dadosLimiteCategoriaDoCiclo = dadosLimiteCategoriaDoCiclo;
globalThis.ehGastoIsabella = ehGastoIsabella;`,
    contexto
  );

  return {
    dadosLimiteCategoriaDoCiclo: contexto.dadosLimiteCategoriaDoCiclo,
    ehGastoIsabella: contexto.ehGastoIsabella,
  };
}

test('soma Débito e Crédito do mesmo ciclo contra o teto da categoria, separando pago de total', () => {
  const { dadosLimiteCategoriaDoCiclo } = carregaDadosLimiteCategoriaDoCiclo();

  const linhas = [
    { v: -50, categ: 'Besteira', pago: true, cred: false }, // café pago no débito
    { v: -80, categ: 'Besteira, Lazer', pago: true, cred: true }, // milkshake pago no crédito
    { v: -40, categ: 'Besteira', pago: false, cred: true }, // uber aberto no crédito
    { v: -100, categ: 'Casa', pago: true, cred: false }, // outra categoria: não entra
    { v: 30, categ: 'Besteira', pago: true, cred: false }, // positivo: não é gasto, não entra
  ];

  const resultado = dadosLimiteCategoriaDoCiclo(linhas, 'Besteira', 250);

  assert.equal(resultado.valorPago, 130);
  assert.equal(resultado.valorTotal, 170);
  assert.equal(resultado.percentualPago, 52);
  assert.equal(Math.round(resultado.percentualTotal * 10) / 10, 68);
});

test('Besteira solo e Isabella usam cada um o próprio limite, sem misturar com outro', () => {
  const { dadosLimiteCategoriaDoCiclo, ehGastoIsabella } =
    carregaDadosLimiteCategoriaDoCiclo();

  const linhas = [
    { v: -50, categ: 'Besteira', pago: true, cred: false },
    { v: -120, categ: 'Lazer, Isabella', pago: true, cred: false },
  ];

  const besteira = dadosLimiteCategoriaDoCiclo(linhas, 'Besteira', 250);
  const isabella = dadosLimiteCategoriaDoCiclo(linhas, ehGastoIsabella, 700);

  assert.equal(besteira.valorPago, 50);
  assert.equal(besteira.percentualPago, 20);
  assert.equal(isabella.valorPago, 120);
  assert.ok(Math.abs(isabella.percentualPago - (120 / 700) * 100) < 1e-9);
});

test('a categoria descontinuada "Besteira Isabella" não conta em nenhum teto: Besteira é item inteiro, não substring', () => {
  const { dadosLimiteCategoriaDoCiclo, ehGastoIsabella } =
    carregaDadosLimiteCategoriaDoCiclo();

  const linhas = [
    { v: -350, categ: 'Besteira Isabella', pago: true, cred: false },
    { v: -20, categ: 'Besteiras', pago: true, cred: false },
    { v: -30, categ: 'Lazer, besteira', pago: true, cred: false }, // item inteiro, outra caixa: conta
  ];

  const besteira = dadosLimiteCategoriaDoCiclo(linhas, 'Besteira', 250);
  const isabella = dadosLimiteCategoriaDoCiclo(linhas, ehGastoIsabella, 700);

  assert.equal(besteira.valorPago, 30);
  assert.equal(isabella.valorPago, 0);
});

test('exclui antecipação de fatura, igual às demais leituras de orçamento', () => {
  const { dadosLimiteCategoriaDoCiclo } = carregaDadosLimiteCategoriaDoCiclo();

  const resultado = dadosLimiteCategoriaDoCiclo(
    [{ v: -200, categ: 'Besteira, Antecipação Fatura', pago: true, cred: false }],
    'Besteira',
    250
  );

  assert.equal(resultado.valorPago, 0);
  assert.equal(resultado.valorTotal, 0);
});

test('indicador Isabella soma tudo com a categoria Isabella (com Lazer ou sozinha), menos a fatura do cartão dela e o Comprometido', () => {
  const { dadosLimiteCategoriaDoCiclo, ehGastoIsabella } =
    carregaDadosLimiteCategoriaDoCiclo();

  const linhas = [
    { v: -80, categ: 'Lazer, Isabella', pago: true, cred: false }, // saíram juntos: conta
    { v: -60, categ: 'Isabella', pago: false, cred: true }, // presente/mimo: conta
    { v: -25, categ: 'Isabella', comprometido: true, pago: true, cred: false }, // parcela fixa (Comprometido): fica de fora
    { v: -15, categ: 'Lazer, Isabella', comprometido: true, pago: true, cred: false }, // idem, mesmo com Lazer
    { v: -40, categ: 'Isabella, Fatura', pago: true, cred: false }, // fatura do cartão dela: fica de fora
    { v: -900, nome: 'Fatura Isabella', categ: 'Isabella', pago: false, cred: false }, // idem, pelo nome
    { v: -30, categ: 'Lazer', pago: true, cred: false }, // sem Isabella: não conta
    { v: -10, categ: 'Lazer, Presentes', pago: true, cred: false },
  ];

  const resultado = dadosLimiteCategoriaDoCiclo(linhas, ehGastoIsabella, 700);

  assert.equal(resultado.valorPago, 80);
  assert.equal(resultado.valorTotal, 140);
});

test('aparece no título Débito de qualquer ciclo (inclusive passados), com o Crédito pela MESMA prévia da tabela Crédito (fatura de i+1)', async () => {
  // A compra prevista (_prev) é justamente o que falta até o teto: nunca entra no indicador.
  // Com hoje no ciclo 1, as previstas de Besteira/Isabella caem no Crédito exibido no ciclo 1 e
  // o indicador continua mostrando só o que foi gasto de verdade (R$ 50 de Besteira, R$ 120 de Isabella).
  const lanc = (id, nome, data, valor, categ) => ({
    id,
    nome,
    data,
    valor,
    categ,
    cred: false,
    pago: true,
    fatura: null,
    freq: null,
  });

  const tela = carregarTela({
    dados: {
      fin_ciclo: [
        { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
        { id: 2, inicio: '2026-10-15', fim: '2026-11-14' },
        { id: 3, inicio: '2026-11-15', fim: null },
      ],
      fin: [
        lanc(1, 'Faturamento', '2026-10-15', 10000, 'Renda'),
        lanc(2, 'Café', '2026-10-16', -50, 'Besteira'),
        lanc(3, 'Cinema', '2026-10-17', -120, 'Lazer, Isabella'),
      ],
      fin_meta: [],
    },
  });

  tela.ctx.recolherBloco = () => {}; // vem de js/interactions.js, fora da tela sem navegador

  await tela.bruto('carregarDados()');
  tela.bruto('Estado.idxHoje = 1');
  assert.equal(tela.rodar('lancamentosComPrevistas().filter(l => l._prev).length'), 2);

  const { texto } = await tela.desenharCiclo(1);

  assert.match(texto, /Besteira Usado 20% · Livre R\$ 200,00/);
  assert.match(texto, /Isabella Usado 17% · Livre R\$ 580,00/);
  // Ciclo seguinte (sem gasto real): usado 0%, não os 100% das previstas.
  assert.match(
    (await tela.desenharCiclo(2)).texto,
    /Besteira Usado 0% · Livre R\$ 250,00/
  );
});

test('regra documentada em REGRAS.md', () => {
  assert.match(
    regras,
    /cada um com seu próprio teto fixo em código \(`js\/domain\.js`, não editável pela tela\)/
  );
  assert.match(
    regras,
    /No título Débito de qualquer ciclo \(atual, seguintes e passados\)/
  );
  // Passado mostra o fechamento do ciclo: pago + aberto, como Saldo e Guardado da mesma linha.
  assert.match(regras, /`creditosExibidosNoCiclo`, fatura de `i\+1`/);
  assert.match(
    regras,
    /ciclo que começa em outubro conta, no Crédito, o que vai entrar na fatura de novembro/
  );
  assert.match(regras, /o rótulo `Isabella` contra `LIMITE_ISABELLA`, R\$ 700/);
  assert.match(
    regras,
    /`Besteira Isabella`.*foi descontinuada e substituída por `Lazer`\+`Isabella`/
  );
  assert.match(regras, /não há mais rastro dela em código/);
  assert.match(
    regras,
    /Convenção de categorização: todo lançamento com a categoria `Isabella` \(comparada como item inteiro da lista de categorias\) conta pro teto dela/
  );
  assert.match(
    regras,
    /Ficam de fora a fatura do cartão dela — lançamento com `Fatura` na categoria ou no nome/
  );
  assert.match(
    regras,
    /e todo lançamento marcado \*\*Comprometido\*\* \(parcelas e compromissos fixos, como Iphone e Senac\)/
  );
  assert.match(
    regras,
    /`Lazer` sozinho nunca conta, pois pode ser lazer com qualquer outra pessoa/
  );
  assert.match(
    regras,
    /Besteira \(café, milkshake, lanche sozinho\) é só o teto `Besteira` — nunca combina com `Isabella`/
  );
  assert.match(
    regras,
    /Passar o mouse no rótulo Categorias do cadastro resume esse guia num hover \(`title`\), sem botão nem modal de ajuda\./
  );

  assert.match(
    regras,
    /categoria `Isabella` \(nunca entra no indicador `Isabella`, porque o nome ou a categoria têm `Fatura`/
  );
});

test('guia de categorias só no hover do rótulo Categorias: Besteira solo, Isabella com Lazer ou sozinha, fatura dela e Comprometido fora', () => {
  const dica =
    'Besteira: seus caprichos, sozinho (só o seu teto). Isabella: com Lazer, o que fizer com ela; sozinha, presente ou mimo (teto dela). Fora do teto dela: fatura do cartão dela e o Comprometido.';

  // A dica é o title do rótulo (um span dentro do label), sem botão nem modal de ajuda
  assert.deepEqual(
    etiquetas(html).filter((e) => e.attrs.title === dica),
    [{ tag: 'span', attrs: { title: dica } }]
  );
});

test('cor do indicador: verde com folga, laranja a partir de 70%, vermelho acima do teto', () => {
  const graficos = fs.readFileSync('js/charts.js', 'utf8');
  const inicio = graficos.indexOf('function corDoLimiteCategoria(');
  const fim = graficos.indexOf('\n}\n', inicio) + 3;
  const contexto = {};

  require('node:vm').createContext(contexto);
  require('node:vm').runInContext(
    `${graficos.slice(inicio, fim)}\nglobalThis.cor = corDoLimiteCategoria;`,
    contexto
  );
  assert.equal(contexto.cor(0), 'vd');
  assert.equal(contexto.cor(69.9), 'vd');
  assert.equal(contexto.cor(70), 'am');
  assert.equal(contexto.cor(100), 'am');
  assert.equal(contexto.cor(100.1), 'vm');
  assert.ok(
    estilos.length > 0 && declaracoes(estilos, '.am', '').includes('color: var(--aviso)')
  );
  assert.match(regras, /verde até 70%, laranja de 70% a 100% e vermelho acima do teto/);
  assert.match(
    regras,
    /cada número vem com o próprio rótulo logo antes dele, como Saldo\/Fatura\/Livre no resto das faixas: `Besteira Usado 74% · Livre R\$ 64,02 de R\$ 250,00`/
  );
  assert.match(regras, /`Isabella Ultrapassado 27% · Acima R\$ 13,41 dos R\$ 50,00`/);
});

test('nome de Besteira e Isabella no título explica o que entra no teto (tooltip)', () => {
  fs.readFileSync('js/domain.js', 'utf8');
  fs.readFileSync('js/cycle-views.js', 'utf8');
  const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

  // O nome continua com a dica no hover, agora num botão (toggle do filtro de teto).
  assert.match(
    regras,
    /Passar o mouse no nome \*\*Besteira\*\* ou \*\*Isabella\*\* do indicador mostra o que entra naquele teto/
  );
});

test('em Besteira/Isabella o valor fica colado no rótulo (regra geral das faixas)', () => {
  assert.deepEqual(declaracoes(estilos, '.resumoDados b', ''), [
    'display: inline-block',
    'text-align: left',
  ]);
});
