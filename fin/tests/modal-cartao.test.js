// Modal de um cartão (botões Nubank/Mercado Pago do cabeçalho): roda o htmlModalCartao real
// de js/cycle-views.js sobre os dados que vCiclo guarda em Estado.cartoesDoCiclo. O comportamento na tela (botão desativado
// sem dados, foco, fechar tocando fora, ← → e arrastar, Aprovado gravado no ciclo) está em navegador-cartao.test.js.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const { dom } = require('./helpers/html-texto');
const arvore = dom(fs.readFileSync('index.html', 'utf8'));
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const { declaracoes, regras: regrasCss } = require('./helpers/regras-css');
const { extrairTrecho } = require('./helpers/carregar-funcoes');

function carrega() {
  const inicio = visoes.indexOf('function htmlModalCartao(');

  const contexto = {
    TOLERANCIA_FINANCEIRA: 0.005,
    CARTAO_NUBANK: 'nubank',
    brl: (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`,
    dataBR: (s) => String(s).slice(0, 10).split('-').reverse().join('/'),
    timestamp: (s) => Date.parse(String(s || '').slice(0, 10)) || 0,
    escapeHtml: (s) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;'),
    corSoma: (v) => (v < 0 ? 'vm' : 'vd'),
    corValor: (v) => (v < 0 ? 'vm' : v > 0 ? 'vd' : ''),
  };

  vm.createContext(contexto);
  vm.runInContext(`${visoes.slice(inicio)}\nglobalThis.f = htmlModalCartao;`, contexto);

  return contexto.f;
}

const dados = {
  temHoje: true,
  cartoes: {
    mp: {
      cartao: 'mp',
      nome: 'Mercado Pago',
      vencimento: '2026-11-13',
      teto: 1100,
      aprovado: 1100,
      garantido: null,
      campoAprovado: '<input data-limite-cartao="mp">',
      campoGarantia: '',
      hoje: { fatura: -54.48, usado: 54.48, livre: 1045.52, antecipado: 0 },
      futuro: { fatura: -1200, usado: 1200, livre: -100, antecipado: 30 },
    },
  },
};

test('desenho do cartão com a fatura de Hoje e o vencimento; Hoje e Futuro com Fatura/Usado/Livre', () => {
  const html = carrega()(dados, 'mp');

  assert.match(
    html,
    /<div class="cartaoArte cartao-mp" title="Arraste para os lados para trocar de fatura"><span class=cartaoMarcaDagua aria-hidden=true><span>MER<\/span><span>CADO<\/span><span>PAGO<\/span><\/span><span class=cartaoVisa aria-hidden=true>VISA<\/span>/
  );
  assert.match(html, /<small>Fatura hoje<\/small><b>R\$ 54,48<\/b>/);
  assert.match(html, /<small>Vence<\/small><b>13\/11<\/b>/);
  assert.match(
    html,
    /<span class=cartaoLinhaRotulo>Hoje<\/span>.*<small>Fatura<\/small><b class="vm">R\$ 54,48<\/b>.*<small>Usado<\/small><b>R\$ 54,48<\/b>.*<small>Livre<\/small><b class="vd">R\$ 1045,52<\/b>/s
  );
  assert.match(html, /<span class=cartaoLinhaRotulo>Futuro<\/span>/);
});

test('barra de uso (a .barra da base, cada faixa um .cartao da base): proporção do teto, cheia e vermelha acima do teto; antecipado só quando houver', () => {
  const html = carrega()(dados, 'mp');

  assert.equal((html.match(/<div class="cartao cartaoLinha">/g) || []).length, 2); // Hoje e Futuro

  assert.match(
    html,
    /<span class="barra cartaoUso" title="5% do teto"><span style="width:5\.0%">/
  );
  assert.match(
    html,
    /<span class="barra cartaoUso acima" title="100% do teto"><span style="width:100\.0%">/
  );
  assert.equal((html.match(/Já antecipado/g) || []).length, 1);
  assert.match(html, /Já antecipado R\$ 30,00/);
});

test('limite com Aprovado editável e sem Garantido no Mercado Pago', () => {
  const html = carrega()(dados, 'mp');

  assert.match(html, /Teto <b>R\$ 1100,00<\/b>/);
  assert.match(html, /Aprovado R\$ <input data-limite-cartao="mp">/);
  assert.doesNotMatch(html, /Garantido/);
});

test('modal limpo: sem lista de compras e sem botão de fechar', () => {
  const html = carrega()(dados, 'mp');

  assert.doesNotMatch(html, /cartaoCompras|Compras da fatura|<summary>/);
  // Sem o ×, o 1º foco seria o campo Aprovado (teclado no celular, Esc só desfaria o campo).
  const modal = arvore.porId('modalCartao');

  assert.equal(modal.tag, 'dialog');
  assert.equal(modal.attrs.tabindex, '-1');

  const seletores = regrasCss(fs.readFileSync('css/forms.css', 'utf8')).flatMap(
    (r) => r.seletores
  );

  for (const removido of ['.fechaCartao', '.cartaoCompras', '#modalCartao .modalHead'])
    assert.ok(!seletores.includes(removido), removido);
  // Continua fechando com Esc (nativo do <dialog>) e com o clique fora do cartão.
  assert.match(
    regras,
    /sem botão de fechar: o cartão começa no topo do modal, que fecha com Esc ou tocando fora dele/
  );
  assert.match(
    regras,
    /a lista de compras não entra no modal, elas ficam só na tabela Crédito/
  );
});

test('ciclo futuro (sem Hoje): o cartão destaca a fatura e só há a linha Futuro', () => {
  const html = carrega()({ ...dados, temHoje: false }, 'mp');

  assert.match(html, /<small>Fatura<\/small><b>R\$ 1200,00<\/b>/);
  assert.doesNotMatch(html, /cartaoLinhaRotulo>Hoje/);
});

test('sem dados do cartão no ciclo exibido, o modal avisa em vez de quebrar', () => {
  assert.match(carrega()(null, 'nubank'), /Sem compras deste cartão no ciclo exibido/);
});

test('botões no cabeçalho, desativados sem dados; modal refeito a cada desenho', () => {
  // Sem título visível: o nome do cartão fica só pra leitor de tela.
  const titulo = arvore.porId('tituloCartao');

  assert.equal(titulo.tag, 'h2');
  assert.ok(titulo.classes.includes('srOnly'));
  assert.equal(arvore.texto(titulo).trim(), 'Cartão');
  // O Aprovado/Garantido gravar pelos mesmos handlers dentro do modal (fora do #out) está em navegador-cartao.test.js.
  // O desenho da tela (`desenhar`, de interactions.js) roda de verdade, com o resto da página trocado por marcadores:
  // zera os dados dos cartões antes de desenhar e só depois alinha os resumos e atualiza os botões.
  const blocos = desenharComMarcadores({ de: '1', ate: '1' });

  // Ciclo único: o desenho do ciclo (vCiclo) preenche os dados e o botão os enxerga, sem sobra do desenho anterior
  assert.deepEqual(blocos.cartoesNaAtualizacao, { novo: true });
  const alinhar = blocos.chamadas.indexOf('alinharResumosDosTitulos');

  assert.ok(alinhar >= 0);
  assert.equal(blocos.chamadas[alinhar + 1], 'atualizarCartoes');
  // Comparação (De ≠ Até): não há ciclo de cartão, os dados do desenho anterior não sobram e os botões ficam desativados
  const matriz = desenharComMarcadores({ de: '0', ate: '1' });

  assert.equal(matriz.cartoesNaAtualizacao, null);

  const { atualizar, botoes, estado } = carregaAtualizarCartoes();
  const corpo = botoes.corpoCartao;

  // Sem dados do cartão no ciclo (Comparar, Backlog, cartão que não existe no título): botão desativado
  estado.cartoesDoCiclo = null;
  atualizar();
  assert.deepEqual(
    [botoes.btNubank.disabled, botoes.btMercadoPago.disabled],
    [true, true]
  );
  estado.cartoesDoCiclo = { cartoes: { mp: {} } };
  atualizar();
  assert.deepEqual(
    [botoes.btNubank.disabled, botoes.btMercadoPago.disabled],
    [true, false]
  );
  assert.equal(corpo.innerHTML, ''); // modal fechado: nada refeito

  // Modal aberto: refeito com os números novos do redesenho (ex.: depois de gravar um Aprovado lá dentro)
  botoes.modalCartao.open = true;
  atualizar();
  assert.equal(corpo.innerHTML, 'html:mp');
  assert.equal(botoes.tituloCartao.textContent, 'Mercado Pago');
});

test('Hoje/Futuro com o rótulo em cima e as três colunas na largura toda; cabeçalho quebra no celular', () => {
  const formularios = fs.readFileSync('css/forms.css', 'utf8');

  const linha = declaracoes(formularios, '.cartaoLinha');

  assert.ok(linha.includes('display: grid'));
  assert.ok(linha.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'));
  assert.ok(
    declaracoes(formularios, '.cartaoLinhaRotulo').includes('grid-column: 1 / -1')
  );
  assert.ok(
    declaracoes(fs.readFileSync('css/mobile.css', 'utf8'), '.acoesCabecalho').includes(
      'display: grid'
    )
  );
  assert.match(
    regras,
    /No celular, o bloco vira uma grade de 6 colunas com a largura da tela/
  );
});

test('REGRAS.md documenta o modal do cartão', () => {
  assert.match(
    regras,
    /\*\*Modal do cartão:\*\* dois botões no cabeçalho, junto dos demais ícones — \*\*Nubank\*\* \(cartão roxo\) e \*\*Mercado Pago\*\* \(cartão azul\)/
  );
  assert.match(
    regras,
    /Os botões ficam desativados em Comparar, no Backlog e quando o cartão não existe no título\./
  );
});

test('cartão Nubank no estilo do de verdade: círculos da bandeira e o "nu"; o MP não tem', () => {
  const f = (() => {
    const visoesFonte = fs.readFileSync('js/cycle-views.js', 'utf8');

    const contexto = {
      TOLERANCIA_FINANCEIRA: 0.005,
      CARTAO_NUBANK: 'nubank',
      brl: (v) => `R$ ${Number(v).toFixed(2)}`,
      dataBR: (s) => String(s).slice(0, 10).split('-').reverse().join('/'),
      timestamp: () => 0,
      escapeHtml: (s) => String(s),
      corSoma: () => '',
      corValor: () => '',
    };

    vm.createContext(contexto);
    vm.runInContext(
      `${visoesFonte.slice(visoesFonte.indexOf('function htmlModalCartao('))}\nglobalThis.f = htmlModalCartao;`,
      contexto
    );

    return contexto.f;
  })();

  const base = {
    teto: 100,
    campoAprovado: '',
    campoGarantia: '',
    vencimento: '2026-11-12',
    hoje: { fatura: -1, usado: 1, livre: 99, antecipado: 0 },
    futuro: { fatura: -1, usado: 1, livre: 99, antecipado: 0 },
  };

  const nubank = f(
    { temHoje: true, cartoes: { nubank: { ...base, nome: 'Nubank' } } },
    'nubank'
  );

  assert.match(nubank, /<svg class=cartaoBandeira /);
  assert.match(nubank, /<svg class=cartaoLogoNu /);
  // n e u com a mesma altura (5,5 a 23) e traço grosso.
  assert.match(
    nubank,
    /stroke-width=4\.2 [^>]*><path d="M4 23V12\.5a7 7 0 0 1 14 0V23M26 5\.5V16a7 7 0 0 0 14 0V5\.5"\/>/
  );
  assert.doesNotMatch(nubank, /cartaoVisa|cartaoMarcaDagua/);

  const mp = f(
    { temHoje: true, cartoes: { mp: { ...base, nome: 'Mercado Pago' } } },
    'mp'
  );

  assert.doesNotMatch(mp, /cartaoBandeira|cartaoLogoNu/);
  assert.match(
    regras,
    /Nubank roxo com os círculos da bandeira e o "nu" em traço grosso, n e u da mesma altura; Mercado Pago grafite com "MER CADO PAGO" apagado na vertical e "VISA" em pé/
  );
});

test('ciclo passado: fatura fechada com compras brutas, pago/antecipado e o que restou, sem barra de uso', () => {
  const c = {
    ...dados.cartoes.mp,
    bruto: -54.48,
    futuro: { fatura: 0, usado: 0, livre: 1100, antecipado: 54.48 },
  };

  const html = carrega()({ temHoje: false, passado: true, cartoes: { mp: c } }, 'mp');

  assert.match(html, /<small>Fatura fechada<\/small><b>R\$ 54,48<\/b>/);
  assert.match(
    html,
    /<span class=cartaoLinhaRotulo>Fechada<\/span><span class=cartaoValor><small>Compras<\/small><b class="vm">R\$ 54,48<\/b><\/span><span class=cartaoValor><small>Pago\/antecipado<\/small><b>R\$ 54,48<\/b><\/span><span class=cartaoValor><small>Restou<\/small><b class="vd">R\$ 0,00<\/b>/
  );
  assert.doesNotMatch(html, /cartaoUso|cartaoLinhaRotulo>Hoje|cartaoLinhaRotulo>Futuro/);
});

// Roda deslizarFatura real com o combo De/Até simulado: a navegação é a de navegaCiclo.
// Roda atualizarCartoes/preencherModalCartao reais (js/interactions.js) com os elementos simulados.
// Roda o `desenhar` de verdade (js/interactions.js) com a página trocada por marcadores: `el` devolve elementos falsos, o
// desenho do ciclo (`vCiclo`) preenche os dados dos cartões como o real e o da comparação (`vComp`) não preenche. Toda função
// que o `desenhar` chama e não existe aqui vira um marcador que só anota a chamada (descobertas pelo ReferenceError, uma a uma).
// Devolve a ordem das chamadas e o que `Estado.cartoesDoCiclo` valia quando `atualizarCartoes` foi chamado; o desenho anterior
// deixou dados na tela (`{ velho: true }`), que não podem sobrar.
function desenharComMarcadores({ de, ate }) {
  const inicio = interacoes.indexOf('function desenhar() {');
  const codigo = interacoes.slice(inicio, interacoes.indexOf('\n}\n', inicio) + 3);
  const marcadores = new Set();

  for (;;) {
    const chamadas = [];
    const elementos = {};
    let cartoesNaAtualizacao;

    const el = (id) =>
      (elementos[id] ||= {
        id,
        value: '',
        hidden: false,
        disabled: false,
        dataset: {},
        style: {},
        classList: { add() {}, remove() {} },
        querySelectorAll: () => [],
        append() {},
      });

    const ctx = {
      el,
      Estado: {
        simulando: false,
        idxHoje: 1,
        selecionados: new Set(),
        cartoesDoCiclo: { velho: true },
      },
      document: { createElement: () => el('novo') },
      vCiclo: () => {
        chamadas.push('vCiclo');
        ctx.Estado.cartoesDoCiclo = { novo: true };

        return '';
      },
      vComp: () => {
        chamadas.push('vComp');

        return '';
      },
      atualizarCartoes: () => {
        chamadas.push('atualizarCartoes');
        cartoesNaAtualizacao = ctx.Estado.cartoesDoCiclo;
      },
    };

    for (const nome of marcadores) ctx[nome] = () => chamadas.push(nome);
    vm.createContext(ctx);
    vm.runInContext(codigo, ctx);
    el('compDe').value = de;
    el('compAte').value = ate;

    try {
      ctx.desenhar();

      return { chamadas, cartoesNaAtualizacao };
    } catch (erro) {
      if (erro.name !== 'ReferenceError') throw erro;
      marcadores.add(erro.message.split(' is not defined')[0]);
    }
  }
}

function carregaAtualizarCartoes() {
  const botoes = {};

  const contexto = {
    CARTAO_NUBANK: 'nubank',
    CARTAO_MERCADO_PAGO: 'mp',
    NOME_CARTAO: { nubank: 'Nubank', mp: 'Mercado Pago' },
    Estado: { cartoesDoCiclo: null },
    htmlModalCartao: (_dados, cartao) => `html:${cartao}`,
    el: (id) =>
      (botoes[id] ||= {
        disabled: false,
        open: false,
        innerHTML: '',
        textContent: '',
        dataset: id == 'modalCartao' ? { cartao: 'mp' } : {},
      }),
  };

  for (const id of [
    'btNubank',
    'btMercadoPago',
    'modalCartao',
    'tituloCartao',
    'corpoCartao',
  ])
    contexto.el(id);

  vm.createContext(contexto);
  vm.runInContext(
    `${extrairTrecho(interacoes, 'const BOTAO_DO_CARTAO', '\n};')}\n};
${extrairTrecho(interacoes, 'function preencherModalCartao(', '\n}\n')}\n}
${extrairTrecho(interacoes, 'function atualizarCartoes(', '\n}\n')}\n}
globalThis.atualizar = atualizarCartoes;`,
    contexto
  );

  return { atualizar: contexto.atualizar, botoes, estado: contexto.Estado };
}

// Roda o ouvinte de rolagem horizontal (trackpad) real do modal, com deslizarFatura e o relógio simulados.
function carregaTrackpad() {
  const chamadas = [];
  let ouvinte = null;

  const contexto = {
    agora: 1000,
    Date: { now: () => contexto.agora },
    deslizarFatura: (d) => chamadas.push(d),
    el: () => ({ addEventListener: (_tipo, f) => (ouvinte = f) }),
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${extrairTrecho(interacoes, 'let rolagemHorizontal = 0', '\n);')}\n);`,
    contexto
  );

  const rolar = (deltaX, deltaY = 0) => {
    const evento = {
      deltaX,
      deltaY,
      impedido: false,
      preventDefault: () => (evento.impedido = true),
    };

    ouvinte(evento);

    return evento;
  };

  return { rolar, chamadas, contexto };
}

function carregaDeslize(valores, atual) {
  const inicio = interacoes.indexOf('function animarCartao(');
  const fim = interacoes.indexOf('let arrasteCartao = null;');

  const chamadas = [],
    animacoes = [];

  const compDe = { value: atual, options: valores.map((value) => ({ value })) };

  const contexto = {
    el: (id) =>
      id === 'compDe'
        ? compDe
        : {
            querySelector: () => ({
              classList: { add: (c) => animacoes.push(c), remove() {} },
              addEventListener() {},
            }),
          },
    navegaCiclo: (d) => chamadas.push(d),
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${interacoes.slice(inicio, fim)}\nglobalThis.f = deslizarFatura;`,
    contexto
  );

  return { deslizar: contexto.f, chamadas, animacoes };
}

test('deslizar anda um ciclo pelo navegaCiclo, nunca para o Backlog nem além do fim', () => {
  const meio = carregaDeslize(['', '-1', '0', '1', '2'], '1');

  meio.deslizar(1);
  meio.deslizar(-1);
  assert.deepEqual(meio.chamadas, [1, -1]);
  assert.deepEqual(meio.animacoes, ['cartaoVemDaDireita', 'cartaoVemDaEsquerda']);
  const primeiro = carregaDeslize(['', '-1', '0', '1'], '0');

  primeiro.deslizar(-1); // antes do 1º ciclo só há o Backlog: não navega
  assert.deepEqual(primeiro.chamadas, []);
  assert.deepEqual(primeiro.animacoes, ['cartaoNoLimite']);
  const ultimo = carregaDeslize(['', '-1', '0', '1'], '1');

  ultimo.deslizar(1);
  assert.deepEqual(ultimo.chamadas, []);
});

test('gestos: arrasto (toque/mouse), trackpad e setas; arrasto não fecha o modal', () => {
  const trackpad = carregaTrackpad();

  // Rolagem mais vertical que horizontal é da própria página: não é gesto
  assert.equal(trackpad.rolar(10, 40).impedido, false);
  assert.deepEqual(trackpad.chamadas, []);
  // O gesto soma os eventos até 60; só então troca de fatura (para a esquerda, a seguinte)
  assert.equal(trackpad.rolar(30).impedido, true);
  assert.deepEqual(trackpad.chamadas, []);
  trackpad.rolar(35);
  assert.deepEqual(trackpad.chamadas, [1]);
  // Um gesto dispara vários eventos: os seguintes, na janela de 600 ms, não trocam de novo
  trackpad.rolar(-80);
  assert.deepEqual(trackpad.chamadas, [1]);
  trackpad.contexto.agora += 601;
  trackpad.rolar(-80);
  assert.deepEqual(trackpad.chamadas, [1, -1]);

  const formularios = fs.readFileSync('css/forms.css', 'utf8');

  assert.ok(declaracoes(formularios, '#modalCartao').includes('touch-action: pan-y'));

  // Com movimento reduzido, a animação de vir de um lado e a de bater no limite param
  for (const seletor of [
    '.cartaoArte.cartaoVemDaDireita',
    '.cartaoArte.cartaoVemDaEsquerda',
    '.cartaoArte.cartaoNoLimite',
  ])
    assert.ok(
      declaracoes(
        formularios,
        seletor,
        '@media (prefers-reduced-motion: reduce)'
      ).includes('animation: none'),
      seletor
    );
  assert.match(
    regras,
    /\*\*Deslizar troca de fatura:\*\* puxar o modal para a esquerda vai para a fatura seguinte/
  );
});

test('vencimento sem compra na fatura: o dia do cartão dentro do ciclo, nunca o fechamento do ciclo', () => {
  const inicio = visoes.indexOf('function vencimentoDoCartaoNoCiclo(');
  const fim = visoes.indexOf('\n}\n', inicio) + 3;

  const contexto = {
    Estado: { ciclos: [{ ini: '2026-10-05' }, { ini: '2026-11-20' }] },
    DIA_VENCIMENTO_CARTAO: { nubank: 12, mp: 13 },
    faturasDoCiclo: () => [],
    vencimentoDoCiclo: () => 'cadastrada',
    dataISO: (s) => String(s || '').slice(0, 10),
    somaMeses: (iso, n) => {
      const [a, m, d] = iso.split('-').map(Number);
      const t = new Date(Date.UTC(a, m - 1 + n, d));

      return t.toISOString().slice(0, 10);
    },
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${visoes.slice(inicio, fim)}\nglobalThis.f = vencimentoDoCartaoNoCiclo;`,
    contexto
  );
  assert.equal(contexto.f(0, 'nubank'), '2026-10-12');
  assert.equal(contexto.f(0, 'mp'), '2026-10-13');
  assert.equal(contexto.f(1, 'nubank'), '2026-12-12'); // ciclo começa depois do dia 12
  assert.equal(contexto.f(5, 'nubank'), ''); // ciclo inexistente
  contexto.faturasDoCiclo = () => [{}];
  assert.equal(contexto.f(0, 'nubank'), 'cadastrada');
});

test('modal largo o bastante pra Teto, Aprovado e Garantido numa linha no desktop', () => {
  assert.ok(
    declaracoes(fs.readFileSync('css/forms.css', 'utf8'), 'dialog#modalCartao').includes(
      'width: min(34rem, 92vw)'
    )
  );
  assert.match(
    regras,
    /numa linha só no desktop \(o modal tem até 34rem de largura; no celular, 92% da tela, e a linha pode quebrar\)/
  );
});
