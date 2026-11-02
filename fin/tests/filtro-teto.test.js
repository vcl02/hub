// Clique no nome Besteira/Isabella do título do Débito filtra Débito e Crédito do ciclo pelo
// que conta naquele teto — mesma regra do indicador (contaNoTeto), sem as previstas.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { ouvinteDe } = require('./helpers/ouvintes');

const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Roda o filtro real (tables.js) com a regra real (charts.js: contaNoTeto e ehGastoIsabella).
function carregaFiltro() {
  const semAcento = (v) =>
    String(v ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();

  const categoriasSeparadas = (v) =>
    String(v ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

  const contexto = {
    Estado: { filtroTeto: null },
    CATEGORIA_BESTEIRA: 'Besteira',
    semAcento,
    categoriasSeparadas,
    ehCategoria: (categ, procurada) =>
      categoriasSeparadas(categ).some(
        (c) => semAcento(c) === semAcento(procurada).trim()
      ),
    ehTransferenciaFatura: (r) => !r.cred && /antecipa/i.test(r.categ || ''),
  };

  vm.createContext(contexto);

  const trecho = (fonte, de, ate) =>
    fonte.slice(fonte.indexOf(de), fonte.indexOf(ate, fonte.indexOf(de)));

  vm.runInContext(
    [
      trecho(graficos, 'const ehGastoIsabella', '\n// Regra única pros indicadores'),
      trecho(graficos, 'function contaNoTeto(', 'function dadosLimiteCategoriaDoCiclo('),
      trecho(graficos, 'function dadosLimiteCategoriaDoCiclo(', '\n// Cor do indicador'),
      trecho(tabelas, 'const criterioDoTeto', '// renderiza uma tabela completa'),
      'globalThis.r = { passaFiltroTeto, dadosLimiteCategoriaDoCiclo, criterioDoTeto };',
    ].join('\n'),
    contexto
  );

  return contexto;
}

const linhas = [
  { id: 1, categ: 'Besteira', v: -20, pago: true },
  { id: 2, categ: 'Lazer, Besteira', v: -30, pago: false, cred: true },
  { id: 3, categ: 'Besteira Isabella', v: -40, pago: true }, // categoria antiga: não conta
  { id: 4, categ: 'Besteira', v: 15, pago: true }, // entrada: não é gasto
  { id: 5, categ: 'Lazer, Isabella', v: -80, pago: true },
  { id: 6, categ: 'Isabella', v: -50, pago: true, comprometido: true }, // Comprometido: fora do teto Isabella
  { id: 7, nome: 'Fatura Nu', categ: 'Isabella, Fatura', v: -500, pago: true },
  { id: -6, categ: 'Besteira', v: -200, _prev: 1, cred: true }, // prevista: o indicador ignora
  { id: 8, categ: 'Casa', v: -900, pago: true },
  { id: -3, nome: 'Fatura Nubank', categ: 'Fatura', v: -300, _fat: 1 },
];

test('sem filtro, nada muda; com filtro, Débito e Crédito mostram só o que conta no teto', () => {
  const c = carregaFiltro();

  assert.equal(linhas.filter((l) => c.r.passaFiltroTeto(l, 'db')).length, linhas.length);
  c.Estado.filtroTeto = 'besteira';
  assert.deepEqual(
    linhas.filter((l) => c.r.passaFiltroTeto(l, 'db')).map((l) => l.id),
    [1, 2]
  );
  assert.deepEqual(
    linhas.filter((l) => c.r.passaFiltroTeto(l, 'cr')).map((l) => l.id),
    [1, 2]
  );
  c.Estado.filtroTeto = 'isabella';
  assert.deepEqual(
    linhas.filter((l) => c.r.passaFiltroTeto(l, 'db')).map((l) => l.id),
    [5]
  );
});

test('outras tabelas (Backlog, Comparar) não obedecem ao filtro de teto', () => {
  const c = carregaFiltro();

  c.Estado.filtroTeto = 'besteira';
  assert.equal(linhas.filter((l) => c.r.passaFiltroTeto(l, 'bk')).length, linhas.length);
});

test('a soma das linhas filtradas é o valor do indicador (pago + aberto)', () => {
  const c = carregaFiltro();

  for (const chave of ['besteira', 'isabella']) {
    c.Estado.filtroTeto = chave;
    const reais = linhas.filter((l) => !l._prev);

    const soma = linhas
      .filter((l) => c.r.passaFiltroTeto(l, 'db'))
      .reduce((s, l) => s - l.v, 0);

    assert.equal(
      soma,
      c.r.dadosLimiteCategoriaDoCiclo(reais, c.r.criterioDoTeto(chave), 100).valorTotal,
      chave
    );
  }
});

// O clique no nome do teto: o ouvinte real de js/interactions.js com o Estado e o desenho falsos. Qualquer gravação falha o teste.
function cliqueNoTeto({
  filtroAtual = null,
  chave = 'besteira',
  foraDoNome = false,
} = {}) {
  const Estado = {
    filtroTeto: filtroAtual,
    fechados: { db: true, cr: true, outro: true },
  };

  let desenhos = 0;
  let paradas = 0;
  const proibida = () => assert.fail('o filtro só lê: não pode gravar');

  const { ouvinte } = ouvinteDe('js/interactions.js', "closest('[data-filtro-teto]')", {
    Estado,
    desenhar: () => desenhos++,
    atualizarLancamento: proibida,
    inserirLancamento: proibida,
    excluirLancamento: proibida,
  });

  ouvinte({
    target: {
      closest: () => (foraDoNome ? null : { dataset: { filtroTeto: chave } }),
    },
    stopImmediatePropagation: () => paradas++,
  });

  return { Estado, desenhos, paradas };
}

test('clique no nome liga, desliga ou troca o teto e reabre os blocos', () => {
  const liga = cliqueNoTeto();

  assert.equal(liga.Estado.filtroTeto, 'besteira');
  assert.deepEqual(Object.keys(liga.Estado.fechados), ['outro']); // Débito e Crédito reabrem; os outros ficam como estavam
  assert.equal(liga.desenhos, 1);
  assert.equal(liga.paradas, 1); // o clique não vaza para a seleção da linha

  const desliga = cliqueNoTeto({ filtroAtual: 'besteira' });

  assert.equal(desliga.Estado.filtroTeto, null);
  assert.equal(desliga.desenhos, 1);

  const troca = cliqueNoTeto({ filtroAtual: 'besteira', chave: 'isabella' });

  assert.equal(troca.Estado.filtroTeto, 'isabella');
  assert.equal(Object.keys(troca.Estado.fechados).length, 1);

  const fora = cliqueNoTeto({ foraDoNome: true }); // clique em outra coisa: o ouvinte não faz nada

  assert.equal(fora.Estado.filtroTeto, null);
  assert.equal(fora.desenhos, 0);
  assert.equal(fora.paradas, 0);
});

test('começa sem filtro de teto, e Recarregar (limparFiltros) o limpa', () => {
  const t = carregarTela();

  assert.equal(t.rodar('Estado.filtroTeto'), null);
  t.bruto("Estado.filtroTeto = 'isabella'");
  t.bruto('limparFiltros()');
  assert.equal(t.rodar('Estado.filtroTeto'), null);
});

test('REGRAS.md documenta o toggle', () => {
  assert.match(
    regras,
    /\*\*Clicar no nome\*\* é um toggle de filtro: as tabelas Débito e Crédito do ciclo exibido passam a mostrar só o que conta naquele teto/
  );
  assert.match(
    regras,
    /limpa os filtros — buscas por coluna, filtro de teto \(Besteira\/Isabella\), Linhas/
  );
});
