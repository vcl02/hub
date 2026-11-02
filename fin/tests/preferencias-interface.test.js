// Contrato de preferências visuais: grafite legível, ações compactas e mobile somente consulta/cadastro.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { abrirCadastro } = require('./helpers/cadastro');
const { dom, mencionaNoHtml } = require('./helpers/html-texto');
const { declaracoes, regras: regrasCss } = require('./helpers/regras-css');

const lanc = (id, nome, data, valor, extra = {}) => ({
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

const ciclos = [
  { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
  { id: 2, inicio: '2026-10-15', fim: null },
];

// Dois ciclos: Aluguel marcado Reserva nos dois, Mercado e um compromisso (Carro) só no 2º.
const dadosIndicadores = {
  fin_ciclo: ciclos,
  fin: [
    lanc(1, 'Faturamento PJ', '2026-09-15', 10000, { categ: 'Renda' }),
    lanc(2, 'Aluguel', '2026-09-16', -1000, { reserva: true }),
    lanc(3, 'Mercado', '2026-09-17', -500, { categ: 'Mercado' }),
    lanc(4, 'Faturamento PJ', '2026-10-15', 10000, { categ: 'Renda' }),
    lanc(5, 'Aluguel', '2026-10-16', -1000, { reserva: true }),
    lanc(6, 'Mercado', '2026-10-17', -900, { categ: 'Mercado' }),
    lanc(7, 'Carro', '2026-10-18', -2500, { comprometido: true }),
  ],
  fin_meta: [],
};

const dadosSimples = {
  fin_ciclo: ciclos,
  fin: [
    lanc(1, 'Salário', '2026-09-15', 9000, { categ: 'Salário' }),
    lanc(2, 'Luz', '2026-10-16', -100),
  ],
  fin_meta: [],
};

// Carrega os dados como o app carrega (banco falso) e põe hoje no ciclo de índice 1.
async function telaCarregada(dados) {
  const tela = carregarTela({ dados });

  await tela.bruto('carregarDados()');
  tela.bruto('Estado.idxHoje = 1');
  tela.ctx.recolherBloco = () => {}; // vem de js/interactions.js, que a tela sem navegador não carrega

  return tela;
}

const pagina = fs.readFileSync('index.html', 'utf8');

// O index.html como árvore de elementos (helpers/html-texto): os testes de tela perguntam por elemento, atributo e ordem.
const arvore = dom(pagina);
const { nos } = arvore;
const noPorId = arvore.porId;
const comClasse = (classe) => nos.filter((n) => n.classes.includes(classe));

// O CSS como regras (helpers/regras-css): existe uma regra com esse seletor?
const temSeletor = (css, seletor) =>
  regrasCss(css).some((r) => r.seletores.includes(seletor));

const agentes = fs.readFileSync('AGENTS.md', 'utf8');
const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

fs.readFileSync('css/base.css', 'utf8');
fs.readFileSync('css/mobile.css', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');

fs.readFileSync('js/data-ui.js', 'utf8');

fs.readFileSync('js/bootstrap.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');

test('registra o tema grafite, ações por ícone e minimalismo como preferências', () => {
  assert.match(agentes, /dark mode definitivo, porém em tons de cinza escuro legíveis/);
  assert.match(agentes, /Prefira ícones a textos nos botões de ação/);
  assert.match(agentes, /formulários somente com campos necessários/);
  assert.match(decisoes, /tema é sempre escuro, mas em cinza grafite legível/);
});

test('mantém tooltips e descrições auxiliares curtos', async () => {
  assert.match(
    regras,
    /Tooltips, rótulos auxiliares e descrições visíveis devem ser curtos/
  );
  assert.equal(noPorId('toggleSimulacao').attrs.title, 'Simular (não salva)');

  assert.equal(
    noPorId('recarregar').attrs.title,
    'Recarregar, voltar ao ciclo atual, limpar filtros e consolidar tudo'
  );

  for (const frase of ['injeta lançamentos hipotéticos', 'ignora os filtros acima'])
    assert.ok(!mencionaNoHtml(pagina, frase), frase);
  // O ícone de editar a data da linha, no desenho real da tabela.
  const tela = await telaCarregada(dadosSimples);

  assert.match(
    tela.rodar("renderTabela(Estado.lancamentos, 'db', true)"),
    /title="Editar data"/
  );
});

test('cadastro compacto usa ícones e defaults de crédito e pago', () => {
  for (const [id, rotulo] of [
    ['fCred', 'Crédito'],
    ['fPago', 'Pago'],
    ['fDivide', 'Dividir a compra entre parcelas'],
  ]) {
    const campo = noPorId(id);

    assert.equal(campo.attrs.type, 'checkbox', id);
    assert.ok('checked' in campo.attrs, `${id} começa marcado`);
    assert.equal(campo.attrs['aria-label'], rotulo, id);
  }

  assert.ok(
    nos.some(
      (n) => n.tag === 'link' && n.attrs.href === './css/forms.css?v=20260924-valor-sinal'
    )
  );
  assert.equal(comClasse('parcelasLinha').length, 1);

  const vezes = nos.find((n) => n.tag === 'option' && n.attrs.value === '1');

  assert.equal(arvore.texto(vezes).trim(), 'À vista');

  for (const frase of ['À vista (1x)', 'Separe mais de uma categoria por vírgula'])
    assert.ok(!mencionaNoHtml(pagina, frase), frase);
  const estilosForm = fs.readFileSync('css/forms.css', 'utf8');

  assert.ok(temSeletor(estilosForm, '.fmChkIco'));
  // os 4 ícones (Crédito/Pago/Reserva/Comprometido) + o fechar ficam numa linha só (flex),
  // não mais numa grade 2x2 (ver teste do cabeçalho pra essa regra em detalhe).
  assert.ok(declaracoes(estilosForm, '.fmChecks').includes('display: flex'));
  assert.ok(temSeletor(estilosForm, '.parcelasLinha'));
});

test('título do cadastro é só pra leitor de tela (.srOnly); Crédito/Pago/Reserva/Comprometido e o fechar dividem uma única linha; o sinal fica ao lado do valor', () => {
  // título vira o 1º filho de #formNovo, sem wrapper .modalHead: por ser position:
  // absolute, não participa do flex nem consome gap — não sobra linha vazia por causa dele.
  const cadastro = noPorId('formNovo');
  const titulo = noPorId('tituloNovo');

  assert.equal(cadastro.attrs.method, 'dialog');
  assert.equal(titulo.pai, cadastro);
  assert.equal(cadastro.filhos[0], titulo);
  assert.equal(titulo.tag, 'h2');
  assert.ok(titulo.classes.includes('srOnly'));
  assert.equal(arvore.texto(titulo).trim(), 'Novo lançamento');
  // os 4 ícones E o fechar (nessa ordem) ficam juntos na mesma .fmChecks, logo depois do título.
  const checks = cadastro.filhos[1];

  assert.ok(checks.classes.includes('fmChecks'));

  assert.deepEqual(
    checks.filhos.map((n) => n.attrs.title || n.attrs.id),
    ['Crédito', 'Pago', 'Reserva', 'Comprometido', 'Pra sempre', 'Fechar']
  );
  assert.ok(checks.filhos[0].classes.includes('fmChk'));
  assert.equal(checks.filhos.at(-1).tag, 'button');
  // o título e os ícones não ficam dentro de um .modalTituloAcoes (o do modal de visualização)
  assert.ok(!cadastro.filhos.some((n) => n.classes.includes('modalTituloAcoes')));
  assert.ok(!noPorId('fCred').pai.pai.classes.includes('modalTituloAcoes'));
  // o sinal fica ao lado do valor, na mesma linha, fora do campo com o R$
  const linha = noPorId('fSinal').pai;

  assert.ok(linha.classes.includes('moneyLinha'));

  assert.deepEqual(
    linha.filhos.map((n) => n.attrs.id || n.classes[0]),
    ['moneyWrap', 'fSinal']
  );
  assert.equal(noPorId('fValor').pai, linha.filhos[0]);
  assert.equal(noPorId('abreCalc'), undefined);
  assert.equal(noPorId('modalCalc'), undefined);
  assert.equal(comClasse('moneyPrefix').length, 0);
  const fechar = noPorId('fechaNovo');

  assert.equal(fechar.attrs.title, 'Fechar');
  assert.equal(fechar.attrs['aria-label'], 'Fechar');
  assert.equal(fechar.filhos[0].tag, 'svg');
  const estilosForm = fs.readFileSync('css/forms.css', 'utf8');

  assert.ok(temSeletor(estilosForm, '.modalTituloAcoes')); // continua existindo, usado por outro modal (modalVisualizacao)
  assert.ok(temSeletor(estilosForm, '.moneyLinha'));
  // .fmChecks virou flex row (não mais grid 4 colunas) pra caber o fechar na mesma linha,
  // empurrado pro canto direito por margem automática — continua vermelho/destrutivo,
  // não um 5º ícone igual aos outros.

  assert.deepEqual(declaracoes(estilosForm, '.fmChecks'), [
    'display: flex',
    'align-items: center',
    'gap: 0.6rem',
  ]);
  assert.deepEqual(declaracoes(estilosForm, '.fmChecks #fechaNovo'), [
    'margin-left: auto',
  ]);
  const seletores = regrasCss(estilosForm).flatMap((r) => r.seletores);

  assert.ok(!seletores.includes('#formNovo .modalHead'));
  assert.ok(!seletores.includes('#formNovo .modalTituloAcoes'));

  assert.ok(
    !regrasCss(estilosForm).some((r) =>
      r.declaracoes.includes('grid-template-columns: repeat(4, 2.9rem)')
    )
  );
  assert.match(
    regras,
    /O título "Novo\/Duplicar\/Editar lançamento"\/"Simular compra" \(`#tituloNovo`\) continua existindo e mudando conforme o modo[\s\S]*?mas é só pra leitor de tela \(`\.srOnly`\)/
  );
  assert.match(
    regras,
    /Os quatro ícones Crédito\/Pago\/Reserva\/Comprometido \(`\.fmChecks`\) e o botão de fechar dividem a mesma linha, numa única fileira/
  );
});

// O cadastro roda de verdade (abreModalNovo, com a tela falsa): a consulta de largura responde como a tela de 640 ou 641 px.
test('cadastro abre sem foco automático no mobile', () => {
  for (const largura of [320, 640])
    assert.deepEqual(abrirCadastro({ largura }).passarTempo(), [], `${largura}px`);
  // No desktop (641 px ou mais): do zero vai para Nome; duplicando, para Valor.
  assert.deepEqual(abrirCadastro({ largura: 641 }).passarTempo(), ['fNome']);
  const original = { id: 7, nome: 'Sofá', categ: 'Casa', data: '2026-09-21', v: -300 };

  assert.deepEqual(abrirCadastro({ largura: 1280, prefill: original }).passarTempo(), [
    'fValor',
  ]);
  assert.deepEqual(abrirCadastro({ largura: 640, prefill: original }).passarTempo(), []);
});

test('cadastro mantém margem visível em todos os lados no mobile', () => {
  const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');

  const caixa = declaracoes(
    estilosMobile,
    'dialog#modalNovo',
    '@media (max-width: 640px)'
  );

  for (const d of [
    'width: calc(100vw - 2rem)',
    'height: calc(100dvh - 2rem)',
    'border-radius: 16px',
    'margin: 1rem auto',
  ])
    assert.ok(caixa.includes(d), d);
});

test('fatura à vista não repete o rótulo nem o asterisco', () => {
  // O nome da fatura no seletor é só a data do vencimento (sem "Fatura" repetido).
  const tela = carregarTela();
  const inicioNome = formulario.indexOf('function nomeFatura(');

  vm.runInContext(
    formulario.slice(inicioNome, formulario.indexOf('\n}\n', inicioNome) + 3),
    tela.ctx
  );
  assert.equal(tela.rodar("nomeFatura({ vencimento: '2026-11-12' })"), '12/11/2026');
  // O rótulo "Fatura" aparece uma vez só, sem asterisco, como 1º filho do campo.
  const rotulo = noPorId('fFaturasWrap').filhos[0];

  assert.equal(rotulo.tag, 'span');
  assert.equal(arvore.texto(rotulo).trim(), 'Fatura');
});

test('visualizações usam um único dropdown com acompanhamentos fixos', () => {
  const menu = noPorId('visMenu');

  assert.equal(menu.tag, 'div');
  assert.ok(menu.classes.includes('menuIcone'));
  assert.equal(menu.attrs.role, 'menu');
  assert.equal(menu.attrs['aria-label'], 'Visualizações');
  assert.ok('hidden' in menu.attrs);
  assert.equal(menu.filhos.length, 0);

  for (const id of [
    'visAlvo',
    'visTipo',
    'visAlvoRotulo',
    'btVisualizacoes',
    'modalVisualizacoes',
    'abreVisualizacao',
    'voltaVisualizacoes',
    'btRoberta',
    'btEmprestimo',
    'btIphone',
  ])
    assert.equal(noPorId(id), undefined, id);
  // As opções fixas: a primeira filtra pela categoria que contém Roberta; o resto, pelo nome.
  const opcoes = carregarTela().rodar('OPCOES_VISUALIZACOES');

  assert.deepEqual(opcoes[0], {
    id: 'categoria-roberta',
    rotulo: 'Roberta',
    categoriaContem: 'Roberta',
  });
  assert.ok(opcoes.slice(1).every((o) => o.nome && !o.categoriaContem));
  assert.match(regras, /o clique abre um menu próprio logo abaixo dele/);
  assert.match(regras, /seletor é fixo/);
  assert.match(regras, /categoria contendo `Roberta`/);
  assert.match(regras, /Toda visualização usa a mesma regra/);
});

test('indicadores financeiros ficam no cabeçalho, entre a navegação e os botões, separados por pipe', () => {
  const ordem = (id) => nos.indexOf(noPorId(id));

  // Ordem: Reserva, Gastos (em Reserva), Comprometido, Liberdade.
  const ids = [
    'indicadorReserva',
    'indicadorProporcaoReserva',
    'indicadorComprometido',
    'indicadorLiberdade',
  ];

  assert.deepEqual(
    ids.map(ordem),
    ids.map(ordem).toSorted((a, b) => a - b)
  );

  // No cabeçalho: depois da navegação de ciclo e antes dos botões de ação.
  const cabecalho = noPorId('rowVis').pai;

  assert.ok(cabecalho.classes.includes('head'));

  const filhosDoCabecalho = cabecalho.filhos.map((n) => n.attrs.id || n.classes[0]);

  assert.ok(filhosDoCabecalho.indexOf('fciclNav') < filhosDoCabecalho.indexOf('rowVis'));
  assert.ok(
    filhosDoCabecalho.indexOf('rowVis') < filhosDoCabecalho.indexOf('acoesCabecalho')
  );
  assert.ok(noPorId('toggleSimulacao').pai.classes.includes('acoesCabecalho'));
  // Fora da faixa de filtros (.tool): o bloco dos indicadores não mora lá.
  assert.ok(ordem('rowVis') < nos.indexOf(comClasse('tool')[0]));

  for (const id of ['fpago', 'origem', 'fsit', 'forigem'])
    assert.equal(noPorId(id), undefined, id);
  const estilosPainel = fs.readFileSync('css/dashboard.css', 'utf8');

  assert.ok(declaracoes(estilosPainel, '.tool > .row').includes('flex-wrap: nowrap'));

  // Cada variação mora no mesmo item do seu indicador, logo depois dele.
  for (const [item, indicador, variacao, rotulo] of [
    ['itemReserva', 'indicadorReserva', 'variacaoReserva', 'Reserva —'],
    [
      'itemComprometido',
      'indicadorComprometido',
      'variacaoComprometido',
      'Comprometido —',
    ],
    [
      'itemProporcaoReserva',
      'indicadorProporcaoReserva',
      'variacaoProporcaoReserva',
      'Gastos —',
    ],
  ]) {
    const caixa = noPorId(item);

    assert.ok(caixa.classes.includes('indicadorItem'), item);
    assert.deepEqual(
      caixa.filhos.map((n) => n.attrs.id),
      [indicador, variacao],
      item
    );
    assert.equal(arvore.texto(noPorId(indicador)).trim(), rotulo, indicador);
    assert.ok(noPorId(variacao).classes.includes('variacaoLinha'), variacao);
    assert.ok('hidden' in noPorId(variacao).attrs, `${variacao} começa escondida`);
  }

  for (const nome of ['indicadorPipe', 'indicadoresResumo', 'indicadoresVariacao'])
    assert.ok(!mencionaNoHtml(pagina, nome), nome);
  // Mesmo desenho dos itens da faixa: rótulo, percentual em negrito (largura de 100%) e complemento apagado.
  assert.ok(
    declaracoes(estilosPainel, '.indicadorRegra b.pct').includes('min-width: 5ch')
  );
  assert.ok(!temSeletor(estilosPainel, '.indicadorPercentual'));
  assert.match(regras, /Gastos 48,6% em Reserva/);

  // Fluxo com quebra de linha: itens inteiros, divisor na borda esquerda cortado no início da linha.
  const lista = declaracoes(estilosPainel, '.listaIndicadores');

  assert.ok(lista.includes('display: flex') && lista.includes('flex-wrap: wrap'));
  assert.ok(lista.includes('margin-left: calc(-0.8rem - 1px)'));

  assert.deepEqual(
    declaracoes(estilosPainel, '#indicadoresFinanceiros', '').slice(0, 2),
    ['min-width: 0', 'overflow: hidden']
  );

  assert.deepEqual(declaracoes(estilosPainel, '#rowVis', '').slice(0, 2), [
    'display: flex',
    'flex: 1 1 0',
  ]);
  // Variação em texto miúdo colado no indicador, sem parênteses nem fundo.
  assert.deepEqual(declaracoes(estilosPainel, '.variacaoLinha'), ['white-space: nowrap']);
  // Sem divisor nem folga antes da tabela Débito.
  assert.ok(
    declaracoes(estilosPainel, '.tool').every((d) => !d.startsWith('border-bottom'))
  );
  assert.ok(
    declaracoes(estilosPainel, '.tool:not(:has(.f:not([hidden])))').includes(
      'display: none'
    )
  );

  assert.ok(
    declaracoes(fs.readFileSync('css/base.css', 'utf8'), '.sub:has(#st:empty)').includes(
      'display: none'
    )
  );
  assert.match(
    regras,
    /A tabela Débito começa logo abaixo do cabeçalho, sem linha divisória nem espaço reservado/
  );
  // Janela estreita: o bloco desce pra uma linha própria, navegação e botões seguem juntos.
  const estreita = declaracoes(estilosPainel, '#rowVis', '@media (max-width: 1250px)');

  assert.ok(estreita.includes('order: 1') && estreita.includes('flex-basis: 100%'));

  assert.deepEqual(
    declaracoes(fs.readFileSync('css/base.css', 'utf8'), '.head').slice(0, 2),
    ['display: flex', 'flex-wrap: wrap']
  );
  assert.match(
    regras,
    /Na comparação \(De ≠ Até\) não há Débito, então ficam no cabeçalho, na mesma linha da navegação de ciclo e dos botões de ação/
  );
  assert.equal(noPorId('btMetaReservaEmergencia'), undefined);
  assert.equal(noPorId('btCompromissos'), undefined);
});

test('os quatro indicadores desenhados: rótulo antes do número, complemento apagado e a variação sobre o ciclo anterior', async () => {
  const tela = await telaCarregada(dadosIndicadores);

  tela.bruto('atualizarIndicadoresFinanceiros(1)');
  const caixa = (id) => tela.ctx.document.getElementById(id);

  assert.equal(
    caixa('indicadorReserva').innerHTML,
    'Reserva <b class="pct vd">100,0%</b> <span class=limiteRotulo>da meta</span>'
  );
  assert.equal(
    caixa('indicadorProporcaoReserva').innerHTML,
    'Gastos <b class="pct vd">22,7%</b> <span class=limiteRotulo>em Reserva</span>'
  );
  assert.equal(
    caixa('indicadorComprometido').innerHTML,
    'Comprometido <b class="pct vd">25,0%</b> <span class=limiteRotulo>do mês</span>'
  );
  assert.match(
    caixa('indicadorLiberdade').innerHTML,
    /^Liberdade <b class="pct neutro">/
  );

  // Cada variação mora no item do próprio indicador: pontos percentuais, " · " e o valor, com a cor
  // (subir a Reserva é bom; subir o Comprometido ou a fatia dos Gastos em Reserva é ruim).
  const variacao = (pontos, classe, valor, classeValor, tituloValor) =>
    `<span class="variacaoIndicador ${classe}" title="Variação sobre o ciclo anterior">${pontos}</span><span class=separadorVariacao aria-hidden=true> · </span><span class="variacaoIndicador ${classeValor}" title="${tituloValor}">${valor}</span>`;

  assert.equal(
    caixa('variacaoReserva').innerHTML.replace(/\u00a0/g, ' '),
    variacao(
      '↑5,6 p.p.',
      'vd',
      '↑R$ 5.600,00',
      'vd',
      'Variação do Guardado sobre o ciclo anterior'
    )
  );
  assert.equal(
    caixa('variacaoComprometido').innerHTML.replace(/\u00a0/g, ' '),
    variacao(
      '↑25,0 p.p.',
      'vm',
      '↑R$ 2.500,00',
      'vm',
      'Variação do valor comprometido sobre o ciclo anterior'
    )
  );
  assert.equal(
    caixa('variacaoProporcaoReserva').innerHTML.replace(/\u00a0/g, ' '),
    variacao(
      '↓44,0 p.p.',
      'vd',
      '→R$ 0,00',
      'neutro',
      'Variação do gasto em Reserva sobre o ciclo anterior'
    )
  );
  assert.equal(caixa('variacaoReserva').hidden, false);

  // Sem nada marcado Reserva: "sem meta", sem o percentual e sem a variação.
  const semMeta = await telaCarregada(dadosSimples);

  semMeta.bruto('atualizarIndicadoresFinanceiros(1)');
  assert.equal(
    semMeta.ctx.document.getElementById('indicadorReserva').innerHTML,
    'Reserva <b class="neutro">—</b> <span class=limiteRotulo>sem meta</span>'
  );
  assert.equal(semMeta.ctx.document.getElementById('variacaoReserva').hidden, true);
});

// O editor da Data roda de verdade (o ouvinte de clique de #out, de js/interactions.js) com um campo falso: o campo guarda os
// ouvintes e o `validity.badInput` que o navegador marca quando a digitação ficou pela metade.
function editarDataComCampo({ valor, digitacaoIncompleta }) {
  const comeco =
    "el('out').addEventListener('click', (e) => {\n  const span = e.target.closest('[data-tog-data]');";

  const inicio = interacoes.indexOf(comeco);
  let ouvinte;

  const ctx = {
    Estado: {
      simulando: false,
      lancamentos: [{ id: 5, data: '2026-10-20' }],
    },
    dataISO: (d) => String(d || '').slice(0, 10),
    desenhos: 0,
    gravados: [],
    desenhar: () => ctx.desenhos++,
    atualizarLancamento: async (id, campos) => ctx.gravados.push([id, campos]),
    reclassificaPeriodo() {},
    mostrarToast() {},
    setTimeout: () => 0,
    clearTimeout() {},
    el: () => ({ addEventListener: (tipo, f) => (ouvinte = f) }),
  };

  vm.runInNewContext(
    interacoes.slice(inicio, interacoes.indexOf('\n});\n', inicio) + 5),
    ctx
  );

  const ouvintes = {};

  const campo = {
    value: valor,
    // um dia "0" sozinho não é válido: o navegador marca badInput e deixa o value vazio
    validity: { badInput: digitacaoIncompleta },
    addEventListener: (tipo, f) => (ouvintes[tipo] = f),
    focus() {},
  };

  ouvinte({
    target: {
      closest: () => ({
        classList: { contains: () => false, add() {} },
        dataset: { togData: '5' },
        querySelector: () => campo,
      }),
    },
    stopImmediatePropagation() {},
  });

  return {
    ctx,
    confirmar: async () => {
      ouvintes.keydown({ key: 'Enter', preventDefault() {} });
      await new Promise((ok) => setImmediate(ok));
    },
  };
}

test('edição inline de data não apaga a data ao perder o foco com dígito incompleto', async () => {
  // No navegador do teste, o Chromium completa sozinho o segmento incompleto ("0" vira "01") depois de ~1 s e dispara
  // change, então o caso não se reproduz na tela de forma confiável (e não se sabe se o Chrome do celular ou do computador
  // faz igual). O "19 não vira 1" está na tela em navegador-linhas.test.js. Aqui o editor roda de verdade com o campo falso.
  // "0" sozinho no dia nao e' um dia valido: o navegador marca badInput e deixa input.value vazio, igual a quando a data
  // e' apagada de proposito. Sem essa checagem, perder o foco no meio da digitacao mandaria o lancamento pro Backlog sem querer.
  const incompleto = editarDataComCampo({ valor: '', digitacaoIncompleta: true });

  await incompleto.confirmar();
  assert.deepEqual(incompleto.ctx.gravados, []); // não gravou nada
  assert.equal(incompleto.ctx.desenhos, 1); // só voltou a desenhar a linha como estava
  assert.equal(incompleto.ctx.Estado.lancamentos[0].data, '2026-10-20');
  // Apagar a data de propósito (campo vazio, sem digitação pela metade) manda o lançamento pro Backlog
  const apagada = editarDataComCampo({ valor: '', digitacaoIncompleta: false });

  await apagada.confirmar();
  assert.equal(JSON.stringify(apagada.ctx.gravados), '[[5,{"data":null}]]');
  assert.equal(apagada.ctx.Estado.lancamentos[0].data, null);
});

test('Excluir com várias linhas marcadas (regra documentada; na tela em navegador-linhas.test.js)', () => {
  assert.match(
    regras,
    /o botão Excluir da barra de seleção aceita quantas linhas reais estiverem marcadas/
  );
});

test('comparar: Todas ou Diferentes entre dois ciclos (regra documentada; na tela em navegador-linhas.test.js)', () => {
  // o estado do filtro: um seletor escondido com as duas opções
  const filtro = noPorId('somenteDif');

  assert.deepEqual(
    filtro.filhos.map((o) => [o.attrs.value, arvore.texto(o).trim()]),
    [
      ['N', 'Todas'],
      ['D', 'Diferentes'],
    ]
  );
  assert.match(regras, /dois ciclos seguintes/);
});

test('conta da Isabella saiu: nenhuma casca restrita, login só do mantenedor', () => {
  assert.deepEqual(carregarTela().rodar('EMAIL_POR_USUARIO'), {
    victor: 'victor.cabrera0209@gmail.com',
  });
  // Flag antiga de modo restrito (form com checkbox fIsa) continua fora. `reserva` em
  // formulario é o bit fin.reserva do PRÓPRIO lançamento (reserva de emergência).
  assert.equal(noPorId('fIsa'), undefined);
  assert.equal(noPorId('fReservaEmergencia'), undefined);
  // A categoria textual "Isabella" (teto e fatura do cartão dela) é outro conceito e fica.
  assert.match(regras, /A categoria `Isabella` identifica esses lançamentos/);
  assert.doesNotMatch(regras, /## Conta restrita/);
});

test('mobile tem paridade total: mesmas colunas, edição e ações do desktop', async () => {
  const tela = await telaCarregada(dadosSimples);
  const colunas = (id) => tela.rodar(`colunasDaTabela('${id}').map(c => c[0])`);

  assert.equal(colunas('bk')[0], 'prio'); // só o Backlog tem Prio, no começo, e não tem Parcela
  assert.ok(!colunas('bk').includes('parcela'));
  assert.ok(colunas('db').includes('parcela') && !colunas('db').includes('prio'));
  assert.deepEqual(colunas('cr'), colunas('db')); // as mesmas colunas no mobile e no desktop

  assert.match(regras, /O mobile tem paridade total com o desktop/);
});

test('indicadores sem olho: os quatro sempre visíveis, no padrão da faixa', () => {
  for (const nome of ['btOlho', 'nomeOlho'])
    assert.ok(!mencionaNoHtml(pagina, nome), nome);
  const painel = regrasCss(fs.readFileSync('css/dashboard.css', 'utf8'));

  for (const r of painel)
    for (const texto of [...r.seletores, ...r.declaracoes]) {
      assert.ok(!texto.includes('btOlho') && !texto.includes('nomeOlho'), texto);
      assert.notEqual(texto, '.indicadorItem.fechado');
    }

  assert.match(
    regras,
    /Não há olho para esconder indicador: os quatro aparecem sempre\./
  );
  assert.match(
    regras,
    /Seguem o padrão dos itens da faixa \(Besteira\/Isabella\): rótulo sem dois-pontos/
  );
  assert.match(
    regras,
    /\*\*Comprometido\*\* e \*\*Liberdade\*\* ficam numa linha quando cabem[^.]*\.\s+Nenhum tem linha própria fixa\./
  );
});

test('ícone Todas/Diferentes: sempre visível, só funciona com 2 ciclos e alterna o filtro', () => {
  const vm = require('node:vm');
  const inicio = interacoes.indexOf('function atualizarBotaoSomenteDif(comparando) {');

  const codigo = interacoes.slice(
    inicio,
    interacoes.indexOf('\n};', interacoes.indexOf("el('btSomenteDif').onclick")) + 3
  );

  const classes = new Set(['btIcone']);
  const atributos = {};

  const botao = {
    disabled: true,
    title: '',
    classList: { toggle: (c, ligar) => (ligar ? classes.add(c) : classes.delete(c)) },
    setAttribute: (k, v) => {
      atributos[k] = v;
    },
  };

  const ctx = { Estado: { _comparacao2Periodos: false }, desenhos: 0 };
  const filtro = { value: 'N' };

  ctx.el = (id) => ({ btSomenteDif: botao, somenteDif: filtro })[id];
  ctx.desenhar = () => {
    ctx.desenhos++;
  };

  vm.runInNewContext(
    `${codigo}\nthis.atualizar = atualizarBotaoSomenteDif;\nthis.clica = () => el('btSomenteDif').onclick();`,
    ctx
  );

  ctx.atualizar(false); // um ciclo só: visível, desativado
  assert.deepEqual([...classes], ['btIcone']);
  assert.equal(botao.disabled, true);
  assert.equal(botao.title, 'Linhas diferentes: só comparando 2 ciclos');

  ctx.atualizar(true); // comparando 3+ ciclos: continua desativado
  assert.deepEqual([...classes], ['btIcone']);
  assert.equal(botao.disabled, true);
  assert.equal(botao.title, 'Linhas diferentes: só comparando 2 ciclos');

  ctx.Estado._comparacao2Periodos = true;
  ctx.atualizar(true); // exatamente 2 ciclos: habilitado
  assert.equal(botao.disabled, false);
  assert.equal(atributos['aria-pressed'], 'false');
  ctx.clica();
  assert.equal(filtro.value, 'D');
  assert.equal(ctx.desenhos, 1);
  ctx.atualizar(true);
  assert.ok(classes.has('ativo'));
  assert.equal(atributos['aria-pressed'], 'true');
  assert.equal(botao.title, 'Mostrar todas as linhas');
  ctx.clica();
  assert.equal(filtro.value, 'N');
  assert.match(
    regras,
    /Ele fica sempre visível, mas só funciona com exatamente dois ciclos: fora da comparação \(um ciclo só ou Backlog\) ou com três ou mais ciclos fica desativado/
  );
  assert.match(
    regras,
    /a escolha entre \*\*Todas\*\* e \*\*Diferentes\*\* é um ícone \(sinal de diferente, ≠\) no início do bloco de botões do cabeçalho, antes do Gráfico/
  );
});

test('"N registros · período" fica encaixado no fim da faixa Futuro do título', async () => {
  const vm = require('node:vm');
  const inicio = tabelas.indexOf('const textoMetaBloco =');
  const fim = tabelas.indexOf('\n};', tabelas.indexOf('const renderBloco =')) + 3;

  const ctx = {
    Estado: { fechados: {} },
    corSoma: () => '',
    brl: (v) => `R$ ${v}`,
    renderTabela: () => '<div class=rolagem>tabela</div>',
  };

  vm.runInNewContext(
    `${tabelas.slice(inicio, fim)}\nthis.renderBloco = renderBloco;`,
    ctx
  );

  const faixa = (rotulo, dados) =>
    `<span class=resumoLinha><span class=resumoRotulo>${rotulo}</span><span class=resumoDados>${dados}</span></span>`;

  const resumo = `<span class=resumoTitulo>${faixa('Hoje', 'a')}${faixa('Futuro', 'b')}</span>`;

  const html = ctx.renderBloco(
    'Débito',
    0,
    '08/10/2026 a 08/11/2026',
    [{}, {}],
    'db',
    true,
    '',
    resumo
  );

  // Entra no fim da faixa Futuro (a última), e a linha própria some.
  assert.ok(
    html.includes(
      faixa(
        'Futuro',
        'b<span class=resumoMeta>2 registros · 08/10/2026 a 08/11/2026</span>'
      )
    )
  );
  assert.doesNotMatch(html, /<p class=meta>/);

  // Só uma faixa: vai no fim dela.
  const unica = ctx.renderBloco(
    'Débito',
    0,
    'x',
    [{}],
    'db',
    true,
    '',
    `<span class=resumoTitulo>${faixa('Passado', 'a')}</span>`
  );

  assert.ok(
    unica.includes(faixa('Passado', 'a<span class=resumoMeta>1 registro · x</span>'))
  );
  // Título compacto (sem faixas) mantém a linha própria.
  assert.match(
    ctx.renderBloco('Backlog', 10, 'Sem data', [{}], 'bk'),
    /<p class=meta>1 registro · Sem data<\/p>/
  );
  // Backlog também sem subtítulo: só a contagem.
  // O desenho real do Backlog não passa subtítulo: só a contagem.
  const desenhoBacklog = await (await telaCarregada(dadosSimples)).desenharCiclo(-1);

  assert.doesNotMatch(desenhoBacklog.html, /<p class=meta>/);
  assert.match(desenhoBacklog.texto, /Backlog · R\$ 0,00 0 registros/);
  const backlog = ctx.renderBloco('Backlog', 10, '', [{}, {}], 'bk');

  assert.match(
    backlog,
    /<h3>.*Backlog · <b class="">R\$ 10<\/b> <span class=contagemTitulo>2 registros<\/span><\/h3>/
  );
  assert.doesNotMatch(backlog, /<p class=meta>/);
  assert.match(
    regras,
    /Sem período a mostrar \(Backlog e Crédito histórico\), a quantidade vai em cinza e menor, sem parênteses, logo depois do valor/
  );

  // Crédito não passa subtítulo: só a contagem, sem datas nem " · " sobrando.
  const credito = ctx.renderBloco(
    'Crédito',
    0,
    '',
    [{}, {}, {}],
    'cr',
    true,
    '',
    `<span class=resumoTitulo>${faixa('Futuro', 'b')}</span>`
  );

  assert.ok(credito.includes('<span class=resumoMeta>3 registros</span>'));

  // O desenho real do Crédito: só a contagem, sem as datas das faturas.
  const comCredito = await (
    await telaCarregada({
      fin_ciclo: [
        { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
        { id: 2, inicio: '2026-10-15', fim: '2026-11-14' },
        { id: 3, inicio: '2026-11-15', fim: null },
      ],
      fin: [lanc(5, 'Fone', '2026-10-16', -150, { cred: true, fatura: '2026-12-12' })],
      fin_meta: [],
    })
  ).desenharCiclo(1);

  const blocoCredito = comCredito.html.slice(comCredito.html.indexOf('data-bloco=cr'));

  assert.match(blocoCredito, /<span class=resumoMeta>\d+ registros?<\/span>/);
  assert.match(
    regras,
    /O bloco Crédito mostra só a quantidade de registros \("17 registros"\), sem as datas das faturas\./
  );
  const estilos = fs.readFileSync('css/dashboard.css', 'utf8');

  assert.ok(declaracoes(estilos, '.resumoMeta').includes('margin-left: auto'));
  assert.match(
    regras,
    /"N registros · período" fica encaixado no fim da faixa \*\*Futuro\*\*/
  );
});

test('De/Até mostram o mês abreviado, com o nome completo no tooltip', async () => {
  const tela = await telaCarregada(dadosSimples);

  tela.bruto('atualizarCombos()');
  const opcoes = (id) => tela.ctx.document.getElementById(id).innerHTML;

  assert.match(opcoes('compDe'), /<option value=1 title="Outubro 2026">Out\/26/);
  assert.match(opcoes('compAte'), /<option value=0 title="Setembro 2026">Set\/26/);

  assert.match(
    regras,
    /Os seletores \*\*De\*\* e \*\*Até\*\* mostram cada ciclo pelo mês abreviado \(`Out\/26`/
  );
});

test('entre De e Até não há texto nem traço', () => {
  assert.ok(!mencionaNoHtml(pagina, 'navCompararAte'));
  // O select De mora sozinho no rótulo dele, e o rótulo do Até vem logo depois, sem nada no meio
  const de = noPorId('compDe');
  const rotuloDe = de.pai;

  assert.equal(de.attrs['aria-label'], 'De');
  assert.equal(rotuloDe.tag, 'label');
  assert.deepEqual(rotuloDe.filhos, [rotuloDe.filhos[0], de]);
  assert.ok(rotuloDe.filhos[0].classes.includes('srOnly')); // o "De" é só pra leitor de tela
  assert.equal(arvore.texto(rotuloDe).trim(), 'De');
  const irmaos = rotuloDe.pai.filhos;
  const ate = irmaos[irmaos.indexOf(rotuloDe) + 1];

  assert.equal(ate, noPorId('fate'));
  assert.ok(ate.classes.includes('fInline'));
  assert.match(regras, /Os dois ficam lado a lado, sem texto ou traço entre eles/);
});

test('botões de ação do cabeçalho ficam num bloco que quebra de linha inteiro', () => {
  const grupo = comClasse('acoesCabecalho')[0];
  const dentro = (no) => no.pai === grupo || (no.pai && dentro(no.pai));

  for (const id of ['toggleSimulacao', 'abreNovo', 'recarregar', 'btDiagnostico'])
    assert.ok(dentro(noPorId(id)), id);
  const base = declaracoes(fs.readFileSync('css/base.css', 'utf8'), '.acoesCabecalho');

  assert.ok(base.includes('display: flex') && base.includes('flex-wrap: nowrap'));

  assert.ok(
    declaracoes(fs.readFileSync('css/mobile.css', 'utf8'), '#abreNovo').every(
      (d) => !d.startsWith('margin-left')
    )
  );
  assert.match(
    regras,
    /descem \*\*juntos\*\* pra linha seguinte, nunca separados, e lá ficam alinhados \*\*à esquerda\*\*/
  );
});

test('botões que descem de linha ficam à esquerda; na mesma linha, à direita', () => {
  const base = fs.readFileSync('css/base.css', 'utf8');

  // margin-left:auto empurraria o bloco pra direita também quando ele está sozinho numa linha.
  assert.ok(
    declaracoes(base, '.acoesCabecalho').every((d) => !d.startsWith('margin-left'))
  );
  // Na mesma linha da navegação, é a margem automática dela que joga os botões pra direita.
  assert.ok(
    declaracoes(fs.readFileSync('css/dashboard.css', 'utf8'), '#fciclNav').includes(
      'margin: 0 auto 0 0'
    )
  );
});

test('controle desativado mostra o cursor de bloqueado vermelho', () => {
  const base = fs.readFileSync('css/base.css', 'utf8');

  // SVG do círculo cortado no vermelho do tema (--erro da base, #F06A61), com not-allowed de reserva.
  const cursor = declaracoes(base, ':root').find((d) =>
    d.startsWith('--cursor-bloqueado:')
  );

  assert.ok(cursor.startsWith('--cursor-bloqueado: url("data:image/svg+xml,'));
  assert.ok(cursor.toLowerCase().includes("stroke='%23f06a61'"));
  assert.ok(cursor.endsWith('") 12 12, not-allowed'));
  assert.ok(
    declaracoes(base, ':disabled').includes('cursor: var(--cursor-bloqueado) !important')
  );

  // Nenhuma regra de desativado volta a impor o cursor padrão ou o nativo.
  for (const arquivo of ['css/dashboard.css', 'css/forms.css', 'css/mobile.css'])
    for (const r of regrasCss(fs.readFileSync(arquivo, 'utf8')))
      if (r.seletores.some((s) => s.includes(':disabled')))
        assert.ok(
          r.declaracoes.every((d) => !d.startsWith('cursor:')),
          `${arquivo}: ${r.seletores}`
        );

  assert.match(
    regras,
    /Todo controle desativado \(botão, seletor ou campo\) mostra, ao passar o mouse, o cursor de bloqueado \(círculo cortado\) em \*\*vermelho\*\*/
  );
});

test('Simular é sempre laranja, como o Recarregar é sempre verde; ligado fica preenchido', () => {
  const base = fs.readFileSync('css/base.css', 'utf8');

  for (const seletor of ['#toggleSimulacao:hover', '#toggleSimulacao.ativo'])
    assert.deepEqual(
      declaracoes(base, seletor).map((d) => d.toLowerCase()),
      ['color: #10231a', 'background: #f0a83a'],
      seletor
    );
  assert.match(
    regras,
    /O botão \*\*Simular\*\* \(lançamentos provisórios\) é sempre laranja/
  );
});

// Os tetos no título de cada ciclo estão em ciclo-desenhado.test.js; o Recarregar e a consolidação
// automática, em recarregar-faz-tudo.test.js e consolidacao-automatica.test.js.
test('documentação: diagnóstico e Recarregar sempre presentes; consolidação automática sem exceção de conta', () => {
  const agentes = fs.readFileSync('AGENTS.md', 'utf8');

  assert.match(agentes, /O mobile tem paridade total com o desktop/);
  assert.doesNotMatch(agentes, /modoRestrito|modoSimples/);
});
