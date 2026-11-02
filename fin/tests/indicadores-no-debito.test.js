// Reserva, Gastos, Comprometido e Liberdade moram na faixa Hoje do Débito no ciclo único e
// voltam ao cabeçalho na comparação; o nó é sempre o mesmo e sobrevive ao redesenho.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');
const { declaracoes } = require('./helpers/regras-css');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

const plano = (valor) => JSON.parse(JSON.stringify(valor));

// Roda encaixarIndicadoresNoDebito do arquivo real com um DOM falso mínimo.
function encaixar(noCicloUnico, faixaDoDebito) {
  const inicio = interacoes.indexOf('function encaixarIndicadoresNoDebito(');
  const fim = interacoes.indexOf('\n}\n', inicio) + 3;
  const indicadores = { id: 'indicadoresFinanceiros' };
  const classes = new Set();
  const consultas = [];

  const nos = {
    indicadoresFinanceiros: indicadores,
    rowVis: {
      classList: { toggle: (c, ligar) => (ligar ? classes.add(c) : classes.delete(c)) },
    },
    out: {
      querySelector: (sel) => {
        consultas.push(sel);

        return faixaDoDebito;
      },
    },
  };

  const ctx = { el: (id) => nos[id] };

  vm.runInNewContext(
    `${interacoes.slice(inicio, fim)}\nencaixarIndicadoresNoDebito(${noCicloUnico});`,
    ctx
  );

  return { classes, consultas, indicadores };
}

test('ciclo único: os indicadores entram na primeira faixa do Débito', () => {
  const recebidos = [];
  const faixa = { append: (n) => recebidos.push(n) };
  const r = encaixar(true, faixa);

  assert.deepEqual(r.consultas, ['.blk[data-bloco=db] .resumoDados']);
  assert.deepEqual(recebidos, [r.indicadores]);
  assert.ok(r.classes.has('semIndicadores')); // a linha própria do cabeçalho some
});

test('comparação (ou sem Débito na tela): ficam no cabeçalho', () => {
  const r = encaixar(false, { append: () => assert.fail('não deveria encaixar') });

  assert.deepEqual(r.consultas, []);
  assert.ok(!r.classes.has('semIndicadores'));
  assert.ok(!encaixar(true, null).classes.has('semIndicadores'));
});

test('o nó volta pro cabeçalho antes de #out ser reescrito, e é encaixado depois', async () => {
  const tela = carregarTela({
    dados: {
      fin: [],
      fin_ciclo: [{ id: 1, inicio: '2026-09-15', fim: null }],
      fin_meta: [],
    },
  });

  await tela.bruto('carregarDados()');
  trazer(tela.ctx, 'js/interactions.js', ['desenhar']);

  const el = (id) => tela.ctx.document.getElementById(id);
  const ordem = [];
  const indicadores = el('indicadoresFinanceiros');

  tela.ctx.ordem = ordem;
  el('acoesAcompanhamento').append = (no) => ordem.push(['volta', no === indicadores]);
  Object.defineProperty(el('out'), 'innerHTML', {
    get: () => 'HTML',
    set: (v) => {
      ordem.push(['reescreve', v]);
    },
  });
  tela.bruto(`(() => {
    sincronizarCicloNaUrl = () => {};
    popularAlvosVisualizacao = () => {};
    atualizarIndicadoresFinanceiros = () => {};
    vCiclo = () => 'CICLO';
    vComp = () => 'MATRIZ';
    encaixarIndicadoresNoDebito = (noDebito) => ordem.push(['encaixa', noDebito]);
    alinharResumosDosTitulos = () => {};
    atualizarCartoes = () => {};
    atualizarMetas = () => {};
    atualizarBotaoSomenteDif = () => {};
  })()`);

  el('compDe').value = '1';
  el('compAte').value = '1';
  tela.bruto('desenhar')();
  ordem.push('---');
  el('compAte').value = '2';
  tela.bruto('desenhar')();

  assert.deepEqual(plano(ordem), [
    ['volta', true],
    ['reescreve', 'CICLO'],
    ['encaixa', true], // ciclo único com ciclo válido: indicadores na faixa do Débito
    '---',
    ['volta', true],
    ['reescreve', 'MATRIZ'],
    ['encaixa', false], // comparação: ficam no cabeçalho
  ]);
});

test('estilo: linha própria dentro da faixa; sem linha vazia no cabeçalho estreito', () => {
  assert.deepEqual(declaracoes(estilos, '.resumoDados > #indicadoresFinanceiros'), [
    'flex: 1 1 100%',
  ]);
  assert.deepEqual(declaracoes(estilos, '.resumoDados .indicadorRegra'), [
    'font-size: inherit',
  ]);
  // A faixa herda nowrap; o texto do indicador volta a quebrar pra não cortar no celular.
  assert.deepEqual(declaracoes(estilos, '.indicadorRegra'), [
    'font-size: 0.84rem',
    'white-space: normal',
  ]);
  assert.deepEqual(
    declaracoes(estilos, '#rowVis.semIndicadores', '@media (max-width: 1250px)'),
    ['display: none']
  );
});

test('REGRAS.md documenta o lugar dos indicadores', () => {
  assert.match(
    regras,
    /No ciclo único, os indicadores ficam \*\*dentro da faixa Hoje do Débito\*\*/
  );
  assert.match(regras, /Eles não entram no alinhamento Hoje\/Futuro das faixas/);
  assert.match(regras, /com os indicadores no Débito, essa linha não aparece/);
});

// Layout falso em linha: cada lista quebra quando passa da largura; minWidth vale como largura.
function alinharDivisores({
  cima,
  futuro,
  baixo,
  larguraCima = 1000,
  larguraBaixo = 1000,
}) {
  const inicio = interacoes.indexOf('function alinharDivisoresDosIndicadores() {');
  const fim = interacoes.indexOf('\n}\n', inicio) + 3;
  const largura = (e) => Math.max(e.w, parseFloat(e.style.minWidth) || 0);

  const posicoes = (lista, limite) => {
    let x = 0,
      linha = 0;

    return lista.map((e) => {
      if (x > 0 && x + largura(e) > limite) {
        x = 0;
        linha++;
      }

      const caixa = {
        left: x,
        right: x + largura(e),
        top: linha * 20,
        height: 20,
        width: largura(e),
      };

      x += largura(e);

      return caixa;
    });
  };

  const item = (w, divisor = false) => ({
    w,
    divisor,
    style: { minWidth: '' },
    classList: { contains: () => false },
  });

  const faixa = (lista) => ({ children: lista });

  const deCima = cima.map(([w, d]) => item(w, d)),
    deFuturo = futuro.map(([w, d]) => item(w, d));

  const itens = baixo.map((w) => item(w, true));

  const indicadores = {
    hidden: false,
    querySelectorAll: () => itens,
    classList: { contains: () => false },
  };

  const hoje = faixa([...deCima, indicadores]),
    proxima = faixa(deFuturo);

  const titulo = { querySelectorAll: () => [hoje, proxima] };

  hoje.closest = () => titulo;
  indicadores.closest = () => hoje;
  [
    [deCima, larguraCima],
    [deFuturo, larguraCima],
    [itens, larguraBaixo],
  ].forEach(([lista, limite]) =>
    lista.forEach((e, i) => {
      e.getBoundingClientRect = () => posicoes(lista, limite)[i];
    })
  );

  const ctx = {
    el: () => indicadores,
    getComputedStyle: (e) => ({
      borderLeftColor: e.divisor ? 'rgb(59, 65, 71)' : 'rgba(0, 0, 0, 0)',
    }),
  };

  vm.runInNewContext(
    `${interacoes.slice(inicio, fim)}\nalinharDivisoresDosIndicadores();`,
    ctx
  );

  return { deCima, deFuturo, itens };
}

const linhaDeCima = [[100], [120], [300, true], [300, true]]; // Saldo, Guardado | Besteira | Isabella

test('divisores de baixo embaixo dos de cima: estica quem ficou pra trás', () => {
  const r = alinharDivisores({
    cima: linhaDeCima,
    futuro: linhaDeCima,
    baixo: [150, 330, 280, 120],
  });

  // 1º par: Besteira em 220, Comprometido em 150 → Reserva cresce 70.
  assert.equal(r.itens[0].style.minWidth, '220px');
  // 2º par: Isabella em 520, Gastos em 550 → a coluna Besteira cresce 30, em Hoje e Futuro.
  assert.equal(r.deCima[2].style.minWidth, '330px');
  assert.equal(r.deFuturo[2].style.minWidth, '330px');
  assert.equal(r.deCima[1].style.minWidth, '');
  assert.equal(r.itens[1].style.minWidth, '');
  // Último divisor de baixo (antes de Liberdade) logo depois do fim de Isabella (550 + 300):
  // Comprometido começa em 550 e tem 280 → cresce 20.
  assert.equal(r.itens[2].style.minWidth, '300px');
});

test('último divisor de baixo já depois do fim da linha de cima: fica onde está', () => {
  const r = alinharDivisores({
    cima: [[100], [120], [300, true], [200, true]],
    futuro: [[100], [120], [300, true], [200, true]],
    baixo: [220, 300, 400, 120],
  });

  // Pares: Besteira 220 × Gastos 220; Isabella 520 × Comprometido 520. Liberdade em 920 > fim de Isabella (720).
  assert.ok(
    [...r.itens, ...r.deCima, ...r.deFuturo].every((e) => e.style.minWidth === '')
  );
});

test('se esticar fizer um item descer de linha, desfaz e para', () => {
  // Reserva precisaria crescer 70, mas aí Liberdade não cabe mais nos 900 da linha de baixo.
  const r = alinharDivisores({
    cima: linhaDeCima,
    futuro: linhaDeCima,
    baixo: [150, 330, 280, 120],
    larguraBaixo: 900,
  });

  assert.ok(r.itens.every((e) => e.style.minWidth === ''));
  assert.ok(r.deCima.every((e) => e.style.minWidth === ''));
});

test('alinhamento dos divisores roda junto com o das faixas (desenho, largura e fonte)', () => {
  // O alinhamento das faixas termina chamando o dos divisores (mesmo sem faixas para alinhar).
  const inicio = interacoes.indexOf('function alinharResumosDosTitulos() {');
  const fim = interacoes.indexOf('\n}\n', inicio) + 3;
  const chamadas = [];
  const vazio = { querySelectorAll: () => [] };

  vm.runInNewContext(`${interacoes.slice(inicio, fim)}\nalinharResumosDosTitulos();`, {
    el: () => vazio,
    Math,
    alinharDivisoresDosIndicadores: () => chamadas.push('divisores'),
  });
  assert.deepEqual(chamadas, ['divisores']);

  // Quando a fonte da página chega, o alinhamento das faixas é refeito no quadro seguinte.
  const ini = interacoes.indexOf('document.fonts?.ready.then(');
  const quadros = [];
  const alinhar = () => {};

  let fonteChegou;

  vm.runInNewContext(interacoes.slice(ini, interacoes.indexOf('\n', ini)), {
    document: { fonts: { ready: { then: (fn) => (fonteChegou = fn) } } },
    requestAnimationFrame: (fn) => quadros.push(fn),
    alinharResumosDosTitulos: alinhar,
  });
  assert.equal(quadros.length, 0); // a fonte ainda não chegou
  fonteChegou();
  assert.deepEqual(quadros, [alinhar]);
  // O desenho (que também refaz o alinhamento) é conferido em "o nó volta pro cabeçalho" e em resumo-alinhado.test.js.
  assert.match(
    regras,
    /os divisores da linha dos indicadores ficam embaixo dos da linha de cima/
  );
  assert.match(
    regras,
    /o de antes de Liberdade logo depois do fim de Isabella \(o último item de cima\)/
  );
});
