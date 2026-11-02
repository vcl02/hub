// Contrato de preferências visuais: grafite legível, ações compactas e mobile somente consulta/cadastro.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');

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
  assert.match(pagina, /title="Simular \(não salva\)"/);
  assert.match(
    pagina,
    /title="Recarregar, voltar ao ciclo atual, limpar filtros e consolidar tudo"/
  );
  assert.doesNotMatch(pagina, /injeta lançamentos hipotéticos|ignora os filtros acima/);
  // O ícone de editar a data da linha, no desenho real da tabela.
  const tela = await telaCarregada(dadosSimples);

  assert.match(
    tela.rodar("renderTabela(Estado.lancamentos, 'db', true)"),
    /title="Editar data"/
  );
});

test('cadastro compacto usa ícones e defaults de crédito e pago', () => {
  assert.match(pagina, /id=fCred checked aria-label="Crédito"/);
  assert.match(pagina, /id=fPago checked aria-label="Pago"/);
  assert.match(pagina, /id=fDivide checked aria-label="Dividir a compra entre parcelas"/);
  assert.match(pagina, /forms\.css\?v=20260924-valor-sinal/);
  assert.match(pagina, /class=parcelasLinha/);
  assert.match(pagina, /<option value=1>À vista/);
  assert.doesNotMatch(pagina, /À vista \(1x\)|Separe mais de uma categoria por vírgula/);
  const estilosForm = fs.readFileSync('css/forms.css', 'utf8');

  assert.match(estilosForm, /\.fmChkIco/);
  // os 4 ícones (Crédito/Pago/Reserva/Comprometido) + o fechar ficam numa linha só (flex),
  // não mais numa grade 2x2 (ver teste do cabeçalho pra essa regra em detalhe).
  assert.match(estilosForm, /\.fmChecks\s*\{\s*\n\s*display:\s*flex;/);
  assert.match(estilosForm, /\.parcelasLinha/);
});

test('título do cadastro é só pra leitor de tela (.srOnly); Crédito/Pago/Reserva/Comprometido e o fechar dividem uma única linha; o sinal fica ao lado do valor', () => {
  // título vira o 1º filho de #formNovo, sem wrapper .modalHead: por ser position:
  // absolute, não participa do flex nem consome gap — não sobra linha vazia por causa dele.
  assert.match(
    pagina,
    /<form id=formNovo method=dialog>\s*\n\s*<h2 id=tituloNovo class=srOnly>Novo lançamento<\/h2>/
  );
  assert.doesNotMatch(pagina, /class=modalHead>\s*\n\s*<h2 id=tituloNovo/);
  // os 4 ícones E o fechar (nessa ordem) ficam juntos na mesma .fmChecks.
  assert.match(
    pagina,
    /<div class=fmChecks>\s*\n\s*<label class="fmChk fmChkIco" title="Crédito">/
  );
  assert.match(
    pagina,
    /title="Pra sempre" id=fPraSempreRotulo>[\s\S]{0,400}<\/label>\s*\n\s*<button type=button id=fechaNovo/
  );
  assert.doesNotMatch(pagina, /class=modalTituloAcoes>[\s\S]{0,200}id=fCred/);
  assert.match(
    pagina,
    /class=moneyLinha>[\s\S]*class=moneyWrap[\s\S]*id=fValor[\s\S]*<\/div>\s*<button type=button id=fSinal/
  );
  assert.doesNotMatch(pagina, /id=abreCalc|id=modalCalc/);
  assert.doesNotMatch(pagina, /class=moneyPrefix/);
  const estilosForm = fs.readFileSync('css/forms.css', 'utf8');

  assert.match(estilosForm, /\.modalTituloAcoes/); // continua existindo, usado por outro modal (modalVisualizacao)
  assert.match(estilosForm, /\.moneyLinha/);
  assert.match(pagina, /id=fechaNovo title="Fechar" aria-label="Fechar">\s*<svg/);
  // .fmChecks virou flex row (não mais grid 4 colunas) pra caber o fechar na mesma linha,
  // empurrado pro canto direito por margem automática — continua vermelho/destrutivo,
  // não um 5º ícone igual aos outros.
  assert.match(
    estilosForm,
    /\.fmChecks\s*\{\s*\n\s*display:\s*flex;\s*\n\s*align-items:\s*center;\s*\n\s*gap:\s*\.6rem;\s*\n\s*\}/
  );
  assert.match(
    estilosForm,
    /\.fmChecks #fechaNovo\s*\{\s*\n\s*margin-left:\s*auto;\s*\n\s*\}/
  );
  assert.doesNotMatch(estilosForm, /#formNovo \.modalHead/);
  assert.doesNotMatch(estilosForm, /#formNovo \.modalTituloAcoes/);
  assert.doesNotMatch(estilosForm, /grid-template-columns: repeat\(4, 2\.9rem\)/);
  assert.match(
    regras,
    /O título "Novo\/Duplicar\/Editar lançamento"\/"Simular compra" \(`#tituloNovo`\) continua existindo e mudando conforme o modo[\s\S]*?mas é só pra leitor de tela \(`\.srOnly`\)/
  );
  assert.match(
    regras,
    /Os quatro ícones Crédito\/Pago\/Reserva\/Comprometido \(`\.fmChecks`\) e o botão de fechar dividem a mesma linha, numa única fileira/
  );
});

test('cadastro abre sem foco automático no mobile', () => {
  assert.match(formulario, /window\.matchMedia\('\(min-width: 641px\)'\)\.matches/);
});

test('cadastro mantém margem visível em todos os lados no mobile', () => {
  const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');

  assert.match(
    estilosMobile,
    /dialog#modalNovo\s*\{[\s\S]*width: calc\(100vw - 2rem\);[\s\S]*height: calc\(100dvh - 2rem\);[\s\S]*border-radius: 16px;[\s\S]*margin: 1rem auto;/
  );
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
  assert.match(pagina, /id=fFaturasWrap>\s*<span>Fatura<\/span>/);
});

test('visualizações usam um único dropdown com acompanhamentos fixos', () => {
  assert.match(
    pagina,
    /<div id=visMenu class=menuIcone role=menu aria-label="Visualizações" hidden><\/div>/
  );
  assert.doesNotMatch(pagina, /id=visAlvo/);
  assert.doesNotMatch(pagina, /id=visTipo|id=visAlvoRotulo/);
  assert.doesNotMatch(
    pagina,
    /id=btVisualizacoes|id=modalVisualizacoes|id=abreVisualizacao|id=voltaVisualizacoes/
  );
  assert.doesNotMatch(pagina, /id=btRoberta|id=btEmprestimo|id=btIphone/);
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
  const acoes = pagina.slice(pagina.indexOf('id="rowVis"'));

  // Ordem: Reserva, Gastos (em Reserva), Comprometido, Liberdade.
  assert.ok(
    acoes.indexOf('id="indicadorReserva"') <
      acoes.indexOf('id="indicadorProporcaoReserva"')
  );
  assert.ok(
    acoes.indexOf('id="indicadorProporcaoReserva"') <
      acoes.indexOf('id="indicadorComprometido"')
  );
  assert.ok(
    acoes.indexOf('id="indicadorComprometido"') < acoes.indexOf('id="indicadorLiberdade"')
  );

  // No cabeçalho: depois da navegação de ciclo e antes dos botões de ação.
  const cabecalho = pagina.slice(
    pagina.indexOf('<div class="head">'),
    pagina.indexOf('<p class="sub">')
  );

  assert.ok(cabecalho.indexOf('id="fciclNav"') < cabecalho.indexOf('id="rowVis"'));
  assert.ok(cabecalho.indexOf('id="rowVis"') < cabecalho.indexOf('id="toggleSimulacao"'));
  assert.doesNotMatch(
    pagina.slice(pagina.indexOf('<div class="tool">'), pagina.indexOf('<div id="out">')),
    /id=rowVis/
  );
  assert.doesNotMatch(pagina, /id=fpago|id=origem|id=fsit|id=forigem/);
  const estilosPainel = fs.readFileSync('css/dashboard.css', 'utf8');

  assert.match(estilosPainel, /\.tool > \.row\s*\{[\s\S]*flex-wrap:\s*nowrap/);
  // Cada variação mora no mesmo item do seu indicador, logo depois dele.
  assert.match(
    pagina,
    /<span class=indicadorItem id=itemReserva>\s*\n\s*<span id=indicadorReserva [^>]*>Reserva —<\/span>\s*\n\s*<span id=variacaoReserva class=variacaoLinha hidden><\/span>/
  );
  assert.match(
    pagina,
    /<span class=indicadorItem id=itemComprometido>\s*\n\s*<span id=indicadorComprometido [^>]*>Comprometido —<\/span>\s*\n\s*<span id=variacaoComprometido class=variacaoLinha hidden><\/span>/
  );
  assert.doesNotMatch(pagina, /indicadorPipe|indicadoresResumo|indicadoresVariacao/);
  assert.match(pagina, /id=variacaoReserva class=variacaoLinha hidden/);
  assert.match(pagina, /id=variacaoComprometido class=variacaoLinha hidden/);
  // Mesmo desenho dos itens da faixa: rótulo, percentual em negrito (largura de 100%) e complemento apagado.
  assert.match(estilosPainel, /\.indicadorRegra b\.pct \{\s*\n\s*min-width: 5ch;/);
  // Gastos no formato do Comprometido: fatia em Reserva, complemento e variação; Demais só no hover.
  assert.match(
    pagina,
    /<span id=indicadorProporcaoReserva [^>]*>Gastos —<\/span>\s*\n\s*<span id=variacaoProporcaoReserva class=variacaoLinha hidden><\/span>/
  );
  assert.doesNotMatch(estilosPainel, /indicadorPercentual/);
  assert.match(regras, /Gastos 48,6% em Reserva/);

  // Fluxo com quebra de linha: itens inteiros, divisor na borda esquerda cortado no início da linha.
  assert.match(
    estilosPainel,
    /\.listaIndicadores \{\s*\n\s*display: flex;\s*\n\s*flex-wrap: wrap;/
  );
  assert.match(
    estilosPainel,
    /#indicadoresFinanceiros \{\s*\n\s*min-width: 0;\s*\n\s*overflow: hidden;/
  );
  assert.match(
    estilosPainel,
    /\.listaIndicadores \{[\s\S]*?margin-left: calc\(-\.8rem - 1px\);/
  );
  assert.match(estilosPainel, /#rowVis \{\s*\n\s*display: flex;\s*\n\s*flex: 1 1 0;/);
  // Variação em texto miúdo colado no indicador, sem parênteses nem fundo.
  assert.match(estilosPainel, /\.variacaoLinha \{\s*\n\s*white-space: nowrap;\s*\n\s*\}/);
  // Sem divisor nem folga antes da tabela Débito.
  assert.doesNotMatch(
    estilosPainel.slice(
      estilosPainel.indexOf('  .tool {'),
      estilosPainel.indexOf('  .row {')
    ),
    /border-bottom/
  );
  assert.match(
    estilosPainel,
    /\.tool:not\(:has\(\.f:not\(\[hidden\]\)\)\) \{\s*\n\s*display: none;/
  );
  assert.match(
    fs.readFileSync('css/base.css', 'utf8'),
    /\.sub:has\(#st:empty\) \{\s*\n\s*display: none;/
  );
  assert.match(
    regras,
    /A tabela Débito começa logo abaixo do cabeçalho, sem linha divisória nem espaço reservado/
  );
  // Janela estreita: o bloco desce pra uma linha própria, navegação e botões seguem juntos.
  assert.match(
    estilosPainel,
    /@media \(max-width: 1250px\) \{\s*\n\s*#rowVis \{\s*\n\s*order: 1;\s*\n\s*flex-basis: 100%;/
  );
  assert.match(
    fs.readFileSync('css/base.css', 'utf8'),
    /\.head \{\s*\n\s*display: flex;\s*\n\s*flex-wrap: wrap;/
  );
  assert.match(
    regras,
    /Na comparação \(De ≠ Até\) não há Débito, então ficam no cabeçalho, na mesma linha da navegação de ciclo e dos botões de ação/
  );
  assert.doesNotMatch(pagina, /id=btMetaReservaEmergencia|id=btCompromissos/);
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

test('edição inline de data não apaga a data ao perder o foco com dígito incompleto', () => {
  // Fica conferido no código: no navegador do teste, o Chromium completa sozinho o segmento incompleto ("0" vira "01")
  // depois de ~1 s e dispara change, então o caso não se reproduz na tela de forma confiável (e não se sabe se o Chrome
  // do celular ou do computador faz igual). O "19 não vira 1" está na tela em navegador-linhas.test.js.
  // "0" sozinho no dia nao e' um dia valido: o navegador marca badInput e deixa
  // input.value vazio, igual a quando a data e' apagada de proposito. Sem essa checagem,
  // perder o foco no meio da digitacao mandaria o lancamento pro Backlog sem querer.
  assert.match(
    interacoes,
    /if \(input\.validity && input\.validity\.badInput\) \{ desenhar\(\); return; \}/
  );
});

test('Excluir com várias linhas marcadas (regra documentada; na tela em navegador-linhas.test.js)', () => {
  assert.match(
    regras,
    /o botão Excluir da barra de seleção aceita quantas linhas reais estiverem marcadas/
  );
});

test('comparar: Todas ou Diferentes entre dois ciclos (regra documentada; na tela em navegador-linhas.test.js)', () => {
  assert.match(
    pagina,
    /id=somenteDif>[\s\S]*?<option value=N>Todas[\s\S]*?<option value=D>Diferentes/
  ); // o estado do filtro
  assert.match(regras, /dois ciclos seguintes/);
});

test('conta da Isabella saiu: nenhuma casca restrita, login só do mantenedor', () => {
  assert.deepEqual(carregarTela().rodar('EMAIL_POR_USUARIO'), {
    victor: 'victor.cabrera0209@gmail.com',
  });
  // Flag antiga de modo restrito (form com checkbox fIsa) continua fora. `reserva` em
  // formulario é o bit fin.reserva do PRÓPRIO lançamento (reserva de emergência).
  assert.doesNotMatch(pagina, /id=fIsa|id=fReservaEmergencia/);
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
  assert.doesNotMatch(pagina, /btOlho|nomeOlho/);
  assert.doesNotMatch(
    fs.readFileSync('css/dashboard.css', 'utf8'),
    /btOlho|nomeOlho|\.indicadorItem\.fechado/
  );
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

  assert.match(estilos, /\.resumoMeta \{\s*\n\s*margin-left: auto;/);
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
  assert.doesNotMatch(pagina, /navCompararAte/);
  assert.match(
    pagina,
    /<select id=compDe aria-label="De"><\/select>\s*<\/label>\s*<label class=fInline id=fate>/
  );
  assert.match(regras, /Os dois ficam lado a lado, sem texto ou traço entre eles/);
});

test('botões de ação do cabeçalho ficam num bloco que quebra de linha inteiro', () => {
  const grupo = pagina.slice(
    pagina.indexOf('<div class="acoesCabecalho">'),
    pagina.indexOf('<p class="sub">')
  );

  for (const id of ['toggleSimulacao', 'abreNovo', 'recarregar', 'btDiagnostico'])
    assert.match(grupo, new RegExp(`id="${id}"`));
  assert.match(
    fs.readFileSync('css/base.css', 'utf8'),
    /\.acoesCabecalho \{\s*\n\s*display: flex;\s*\n\s*flex-wrap: nowrap;/
  );
  assert.doesNotMatch(
    fs.readFileSync('css/mobile.css', 'utf8'),
    /#abreNovo \{\s*\n\s*margin-left: auto;/
  );
  assert.match(
    regras,
    /descem \*\*juntos\*\* pra linha seguinte, nunca separados, e lá ficam alinhados \*\*à esquerda\*\*/
  );
});

test('botões que descem de linha ficam à esquerda; na mesma linha, à direita', () => {
  const base = fs.readFileSync('css/base.css', 'utf8');

  const bloco = base.slice(
    base.indexOf('.acoesCabecalho {'),
    base.indexOf('}', base.indexOf('.acoesCabecalho {'))
  );

  // margin-left:auto empurraria o bloco pra direita também quando ele está sozinho numa linha.
  assert.doesNotMatch(bloco, /margin-left/);
  // Na mesma linha da navegação, é a margem automática dela que joga os botões pra direita.
  assert.match(
    fs.readFileSync('css/dashboard.css', 'utf8'),
    /#fciclNav \{[^}]*margin: 0 auto 0 0;/
  );
});

test('controle desativado mostra o cursor de bloqueado vermelho', () => {
  const base = fs.readFileSync('css/base.css', 'utf8');

  // SVG do círculo cortado no vermelho do tema (--erro da base, #F06A61), com not-allowed de reserva.
  assert.match(
    base,
    /--cursor-bloqueado:\s*url\("data:image\/svg\+xml,[^"]*stroke='%23F06A61'[^"]*"\)\s*12 12,\s*not-allowed;/i
  );
  assert.match(base, /:disabled \{\s*cursor: var\(--cursor-bloqueado\) !important;/);

  // Nenhuma regra de desativado volta a impor o cursor padrão ou o nativo.
  for (const arquivo of ['css/dashboard.css', 'css/forms.css', 'css/mobile.css']) {
    const css = fs.readFileSync(arquivo, 'utf8');

    for (const [, corpo] of css.matchAll(/:disabled[^{]*\{([^}]*)\}/g))
      assert.doesNotMatch(corpo, /cursor:/, arquivo);
  }

  assert.match(
    regras,
    /Todo controle desativado \(botão, seletor ou campo\) mostra, ao passar o mouse, o cursor de bloqueado \(círculo cortado\) em \*\*vermelho\*\*/
  );
});

test('Simular é sempre laranja, como o Recarregar é sempre verde; ligado fica preenchido', () => {
  const base = fs.readFileSync('css/base.css', 'utf8');

  assert.match(
    base,
    /#toggleSimulacao:hover,\s*\n\s*#toggleSimulacao\.ativo \{\s*\n\s*color: #10231A;\s*\n\s*background: #F0A83A;/
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
