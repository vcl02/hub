// Contrato de preferências visuais: grafite legível, ações compactas e mobile somente consulta/cadastro.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const agentes = fs.readFileSync('AGENTS.md', 'utf8');
const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const base = fs.readFileSync('css/base.css', 'utf8');
const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const estado = fs.readFileSync('js/app-state.js', 'utf8');
const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');

test('registra o tema grafite, ações por ícone e minimalismo como preferências', () => {
    assert.match(agentes, /dark mode definitivo, porém em tons de cinza escuro legíveis/);
    assert.match(agentes, /Prefira ícones a textos nos botões de ação/);
    assert.match(agentes, /formulários somente com campos necessários/);
    assert.match(decisoes, /tema é sempre escuro, mas em cinza grafite legível/);
    assert.match(base, /--bg: #1B1E21;/);
    assert.match(base, /--pa: #24272B;/);
});

test('mantém tooltips e descrições auxiliares curtos', () => {
    assert.match(regras, /Tooltips, rótulos auxiliares e descrições visíveis devem ser curtos/);
    assert.match(pagina, /title="Simular \(não salva\)"/);
    assert.match(pagina, /title="Recarregar, voltar ao ciclo atual, limpar filtros e consolidar tudo"/);
    assert.doesNotMatch(pagina, /injeta lançamentos hipotéticos|ignora os filtros acima/);
    assert.match(tabelas, /title="Editar data"/);
    assert.match(visoes, /Possível recorrência duplicada/);
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
    assert.match(pagina, /<form id=formNovo method=dialog>\s*\n\s*<h2 id=tituloNovo class=srOnly>Novo lançamento<\/h2>/);
    assert.doesNotMatch(pagina, /class=modalHead>\s*\n\s*<h2 id=tituloNovo/);
    // os 4 ícones E o fechar (nessa ordem) ficam juntos na mesma .fmChecks.
    assert.match(pagina, /<div class=fmChecks>\s*\n\s*<label class="fmChk fmChkIco" title="Crédito">/);
    assert.match(pagina, /title="Pra sempre" id=fPraSempreRotulo>[\s\S]{0,400}<\/label>\s*\n\s*<button type=button id=fechaNovo/);
    assert.doesNotMatch(pagina, /class=modalTituloAcoes>[\s\S]{0,200}id=fCred/);
    assert.match(pagina, /class=moneyLinha>[\s\S]*class=moneyWrap[\s\S]*id=fValor[\s\S]*<\/div>\s*<button type=button id=fSinal/);
    assert.doesNotMatch(pagina, /id=abreCalc|id=modalCalc/);
    assert.doesNotMatch(pagina, /class=moneyPrefix/);
    const estilosForm = fs.readFileSync('css/forms.css', 'utf8');
    assert.match(estilosForm, /\.modalTituloAcoes/);   // continua existindo, usado por outro modal (modalVisualizacao)
    assert.match(estilosForm, /\.moneyLinha/);
    assert.match(pagina, /id=fechaNovo title="Fechar" aria-label="Fechar">\s*<svg/);
    // .fmChecks virou flex row (não mais grid 4 colunas) pra caber o fechar na mesma linha,
    // empurrado pro canto direito por margem automática — continua vermelho/destrutivo,
    // não um 5º ícone igual aos outros.
    assert.match(estilosForm, /\.fmChecks\s*\{\s*\n\s*display:\s*flex;\s*\n\s*align-items:\s*center;\s*\n\s*gap:\s*\.6rem;\s*\n\s*\}/);
    assert.match(estilosForm, /\.fmChecks #fechaNovo\s*\{\s*\n\s*margin-left:\s*auto;\s*\n\s*\}/);
    assert.doesNotMatch(estilosForm, /#formNovo \.modalHead/);
    assert.doesNotMatch(estilosForm, /#formNovo \.modalTituloAcoes/);
    assert.doesNotMatch(estilosForm, /grid-template-columns: repeat\(4, 2\.9rem\)/);
    assert.match(estilosForm, /#fechaNovo\s*\{[\s\S]*background:\s*var\(--red-soft\)/);
    assert.match(regras, /O título "Novo\/Duplicar\/Editar lançamento"\/"Simular compra" \(`#tituloNovo`\) continua existindo e mudando conforme o modo[\s\S]*?mas é só pra leitor de tela \(`\.srOnly`\)/);
    assert.match(regras, /Os quatro ícones Crédito\/Pago\/Reserva\/Comprometido \(`\.fmChecks`\) e o botão de fechar dividem a mesma linha, numa única fileira/);
});

test('cadastro abre sem foco automático no mobile', () => {
    assert.match(formulario, /window\.matchMedia\('\(min-width: 641px\)'\)\.matches/);
});

test('cadastro mantém margem visível em todos os lados no mobile', () => {
    const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');
    assert.match(estilosMobile, /dialog#modalNovo\s*\{[\s\S]*width: calc\(100vw - 2rem\);[\s\S]*height: calc\(100dvh - 2rem\);[\s\S]*border-radius: 16px;[\s\S]*margin: 1rem auto;/);
});

test('fatura à vista não repete o rótulo nem o asterisco', () => {
    assert.match(pagina, /id=fFaturasWrap>\s*<span>Fatura<\/span>/);
    assert.match(formulario, /: 'Parcela única'\);/);
    assert.match(formulario, /function nomeFatura\(fatura\) \{\s*return dataBR\(fatura\.vencimento\);/);
});

test('visualizações usam um único dropdown com acompanhamentos fixos', () => {
    assert.match(pagina, /<button type=button id=btVis class=btIcone title="Visualizações" aria-label="Visualizações"\s*\n\s*aria-haspopup=menu aria-expanded=false aria-controls=visMenu>/);
    assert.match(pagina, /<div id=visMenu class=menuIcone role=menu aria-label="Visualizações" hidden><\/div>/);
    assert.doesNotMatch(pagina, /id=visAlvo/);
    assert.doesNotMatch(pagina, /id=visTipo|id=visAlvoRotulo/);
    assert.doesNotMatch(pagina, /id=btVisualizacoes|id=modalVisualizacoes|id=abreVisualizacao|id=voltaVisualizacoes/);
    assert.doesNotMatch(pagina, /id=btRoberta|id=btEmprestimo|id=btIphone/);
    assert.match(graficos, /const OPCOES_VISUALIZACOES/);
    assert.match(graficos, /categoriaContem: 'Roberta'/);
    assert.doesNotMatch(graficos, /function valoresDaVisualizacao|visTipo/);
    assert.match(graficos, /el\('visMenu'\)\.onclick = e => \{/);
    assert.match(regras, /o clique abre um menu próprio logo abaixo dele/);
    assert.match(regras, /seletor é fixo/);
    assert.match(regras, /categoria contendo `Roberta`/);
    assert.match(regras, /Toda visualização usa a mesma regra/);
    // No mobile, a regra de botão não pode apagar a imagem de fundo que desenha a seta do select.
    assert.match(estilosMobile, /\.btFiltro\s*\{[\s\S]*background-color: var\(--field\);/);
    assert.doesNotMatch(estilosMobile, /\.btFiltro\s*\{[\s\S]*?background: var\(--field\);/);
});

test('indicadores financeiros ficam no cabeçalho, entre a navegação e os botões, separados por pipe', () => {
    const acoes = pagina.slice(pagina.indexOf('id=rowVis'));
    // Ordem: Reserva, Gastos (em Reserva), Comprometido, Liberdade.
    assert.ok(acoes.indexOf('id=indicadorReserva') < acoes.indexOf('id=indicadorProporcaoReserva'));
    assert.ok(acoes.indexOf('id=indicadorProporcaoReserva') < acoes.indexOf('id=indicadorComprometido'));
    assert.ok(acoes.indexOf('id=indicadorComprometido') < acoes.indexOf('id=indicadorLiberdade'));
    // No cabeçalho: depois da navegação de ciclo e antes dos botões de ação.
    const cabecalho = pagina.slice(pagina.indexOf('<div class=head>'), pagina.indexOf('<p class=sub>'));
    assert.ok(cabecalho.indexOf('id=fciclNav') < cabecalho.indexOf('id=rowVis'));
    assert.ok(cabecalho.indexOf('id=rowVis') < cabecalho.indexOf('id=toggleSimulacao'));
    assert.doesNotMatch(pagina.slice(pagina.indexOf('<div class=tool>'), pagina.indexOf('<div id=out>')), /id=rowVis/);
    assert.doesNotMatch(pagina, /id=fpago|id=origem|id=fsit|id=forigem/);
    const estilosPainel = fs.readFileSync('css/dashboard.css', 'utf8');
    assert.match(estilosPainel, /\.tool > \.row\s*\{[\s\S]*flex-wrap:\s*nowrap/);
    // Cada variação mora no mesmo item do seu indicador, logo depois dele.
    assert.match(pagina, /<span class=indicadorItem id=itemReserva>\s*\n\s*<span id=indicadorReserva [^>]*>Reserva —<\/span>\s*\n\s*<span id=variacaoReserva class=variacaoLinha hidden><\/span>/);
    assert.match(pagina, /<span class=indicadorItem id=itemComprometido>\s*\n\s*<span id=indicadorComprometido [^>]*>Comprometido —<\/span>\s*\n\s*<span id=variacaoComprometido class=variacaoLinha hidden><\/span>/);
    assert.doesNotMatch(pagina, /indicadorPipe|indicadoresResumo|indicadoresVariacao/);
    assert.match(pagina, /id=variacaoReserva class=variacaoLinha hidden/);
    assert.match(pagina, /id=variacaoComprometido class=variacaoLinha hidden/);
    // Mesmo desenho dos itens da faixa: rótulo, percentual em negrito (largura de 100%) e complemento apagado.
    assert.match(estilosPainel, /\.indicadorRegra b\.pct \{\s*\n\s*min-width: 5ch;/);
    assert.doesNotMatch(estilosPainel + graficos, /indicadorPercentual/);
    assert.match(graficos, /const valorIndicador = \(texto, classe = 'neutro'\) => `<b class="\$\{texto == '—' \? '' : 'pct '\}\$\{classe\}">\$\{texto\}<\/b>`;/);
    assert.match(graficos, /`Reserva \$\{valorIndicador\(pct1\(reserva\.percentual\), classeIndicadorReserva\(reserva\)\)\} <span class=limiteRotulo>da meta<\/span>`/);
    assert.match(graficos, /`Comprometido \$\{valorIndicador\(pct1\(comprometido\.percentualFaturamento\), classeIndicadorComprometido\(comprometidos\)\)\} <span class=limiteRotulo>do mês<\/span>`/);
    // Gastos no formato do Comprometido: fatia em Reserva, complemento e variação; Demais só no hover.
    assert.match(graficos, /`Gastos \$\{valorIndicador\(pct1\(proporcaoReserva\.percentualReserva\), classeIndicadorProporcaoReserva\(proporcaoReserva\)\)\} <span class=limiteRotulo>em Reserva<\/span>`/);
    assert.doesNotMatch(graficos, /limiteRotulo>· Demais/);
    assert.match(pagina, /<span id=indicadorProporcaoReserva [^>]*>Gastos —<\/span>\s*\n\s*<span id=variacaoProporcaoReserva class=variacaoLinha hidden><\/span>/);
    assert.match(graficos, /variacaoPercentualIndicador\(proporcaoReserva\.percentualReserva, proporcaoAnterior\.percentualReserva, false\)/);
    assert.match(graficos, /variacaoValorIndicador\(proporcaoReserva\.reserva, proporcaoAnterior\.reserva, false\)/);
    assert.match(graficos, /atualizarLinhaVariacao\(\s*'variacaoProporcaoReserva'/);
    assert.match(regras, /Gastos 48,6% em Reserva/);
    assert.match(graficos, /`Liberdade \$\{valorIndicador\(/);
    assert.doesNotMatch(graficos, /[`'](Reserva|Comprometido|Gastos|Liberdade): /);
    assert.match(estilosPainel, /\.variacaoIndicador\.vd\s*\{\s*color:\s*var\(--vd\)/);
    assert.match(estilosPainel, /\.variacaoIndicador\.vm\s*\{\s*color:\s*var\(--vm\)/);
    assert.match(graficos, /variacaoValorIndicador\(reserva\.guardado, reservaAnterior\.guardado, true\)/);
    assert.match(graficos, /variacaoValorIndicador\(comprometido\.valor, comprometidosAnterior\.limites\[0\]\.valor, false\)/);
    assert.match(graficos, /atualizarLinhaVariacao\(\s*'variacaoReserva'/);
    assert.match(graficos, /atualizarLinhaVariacao\(\s*'variacaoComprometido'/);
    assert.doesNotMatch(graficos, /da meta\$\{htmlVariacaoIndicador/);
    assert.doesNotMatch(graficos, /do mês\$\{htmlVariacaoIndicador/);
    const blocoIndicadores = estilosPainel.slice(
        estilosPainel.indexOf('#indicadoresFinanceiros'), estilosPainel.indexOf('/* Reserva e Comprometido')
    );
    // Fluxo com quebra de linha: itens inteiros, divisor na borda esquerda cortado no início da linha.
    assert.match(estilosPainel, /\.listaIndicadores \{\s*\n\s*display: flex;\s*\n\s*flex-wrap: wrap;/);
    assert.match(estilosPainel, /\.indicadorItem \{[\s\S]*?flex-wrap: wrap;[\s\S]*?border-left: 1px solid var\(--ln\);/);
    assert.match(estilosPainel, /#indicadoresFinanceiros \{\s*\n\s*min-width: 0;\s*\n\s*overflow: hidden;/);
    assert.match(estilosPainel, /\.listaIndicadores \{[\s\S]*?margin-left: calc\(-\.8rem - 1px\);/);
    assert.match(estilosPainel, /#rowVis \{\s*\n\s*display: flex;\s*\n\s*flex: 1 1 0;/);
    // Variação em texto miúdo colado no indicador, sem parênteses nem fundo.
    assert.match(graficos, /return `<span class="variacaoIndicador \$\{percentual\.classe\}"[\s\S]*?\$\{brl\(valor\.diferenca\)\}<\/span>`;/);
    assert.match(estilosPainel, /\.variacaoLinha \{\s*\n\s*white-space: nowrap;\s*\n\s*\}/);
    // Sem divisor nem folga antes da tabela Débito.
    assert.doesNotMatch(estilosPainel.slice(estilosPainel.indexOf('  .tool {'), estilosPainel.indexOf('  .row {')), /border-bottom/);
    assert.match(estilosPainel, /\.tool:not\(:has\(\.f:not\(\[hidden\]\)\)\) \{\s*\n\s*display: none;/);
    assert.match(fs.readFileSync('css/base.css', 'utf8'), /\.sub:has\(#st:empty\) \{\s*\n\s*display: none;/);
    assert.match(regras, /A tabela Débito começa logo abaixo do cabeçalho, sem linha divisória nem espaço reservado/);
    // Janela estreita: o bloco desce pra uma linha própria, navegação e botões seguem juntos.
    assert.match(estilosPainel, /@media \(max-width: 1250px\) \{\s*\n\s*#rowVis \{\s*\n\s*order: 1;\s*\n\s*flex-basis: 100%;/);
    assert.match(fs.readFileSync('css/base.css', 'utf8'), /\.head \{\s*\n\s*display: flex;\s*\n\s*flex-wrap: wrap;/);
    assert.match(regras, /Na comparação \(De ≠ Até\) não há Débito, então ficam no cabeçalho, na mesma linha da navegação de ciclo e dos botões de ação/);
    assert.match(interacoes, /atualizarIndicadoresFinanceiros\(\+el\('compAte'\)\.value\)/);
    assert.doesNotMatch(pagina, /id=btMetaReservaEmergencia|id=btCompromissos/);
    assert.match(interacoes, /if \(modoBlocos\) abrirGraficoGastos/);
    assert.match(interacoes, /else abrirGraficoEvolucao/);
    assert.doesNotMatch(interacoes, /mostraComFade\('(fgraf|fevol|fReserva)'/);
});

test('edição inline de data no desktop não confirma a cada dígito antes do segundo dígito do segmento', () => {
    // input type=date dispara 'change' assim que o valor fica completo, mesmo com um só
    // dígito do dia (ambíguo: "1" já é valor válido antes do "9" de "19" chegar). O
    // commit precisa esperar um instante e ser cancelado se outro 'input' chegar logo
    // depois, senão "19" vira "1" sem esperar Enter.
    assert.match(interacoes, /input\.addEventListener\('input', \(\) => clearTimeout\(timerConfirma\)\);/);
    assert.match(interacoes, /input\.addEventListener\('change', \(\) => \{\s*clearTimeout\(timerConfirma\);\s*timerConfirma = setTimeout\(confirma, 450\);\s*\}\);/);
    assert.match(interacoes, /ev\.key == 'Enter'.*clearTimeout\(timerConfirma\); confirma\(\);/);
});

test('edição inline de data não apaga a data ao perder o foco com dígito incompleto', () => {
    // "0" sozinho no dia nao e' um dia valido: o navegador marca badInput e deixa
    // input.value vazio, igual a quando a data e' apagada de proposito. Sem essa checagem,
    // perder o foco no meio da digitacao mandaria o lancamento pro Backlog sem querer.
    assert.match(interacoes, /if \(input\.validity && input\.validity\.badInput\) \{ desenhar\(\); return; \}/);
});

test('botão Excluir aceita várias linhas reais selecionadas, ignorando sintéticas misturadas', () => {
    // Antes só existia excluir UMA linha ([...Estado.selecionados.keys()][0]); agora o botão
    // fica visível com qualquer quantidade de linhas reais marcadas, e linhas sintéticas (ex.:
    // Saldo do mês anterior) na mesma seleção são ignoradas, pois não existem no banco.
    assert.match(interacoes, /const chavesReaisSelecionadas = chaves\.filter\(c => !ehSintetica\(c\)\);/);
    assert.match(interacoes, /el\('seldel'\)\.hidden = restrito \|\| !chavesReaisSelecionadas\.length;/);
    assert.doesNotMatch(formulario, /const chave = \[\.\.\.Estado\.selecionados\.keys\(\)\]\[0\];\s*\n\s*const i = Estado\.lancamentos\.findIndex\(x => String\(x\.id\) == chave\);\s*\n\s*if \(i < 0\) return;/);
    assert.match(formulario, /const linhas = \[\.\.\.Estado\.selecionados\.keys\(\)\]/);
    assert.match(formulario, /for \(const r of linhas\) \{/);
    assert.match(formulario, /lista = linhas\.map\(r => `- \$\{r\.nome \?\? ''\}/);
    assert.match(regras, /o botão Excluir da barra de seleção aceita quantas linhas reais estiverem marcadas/);
});

test('comparar mantém apenas todas ou diferentes confirmados sem recorrência duplicada', () => {
    assert.match(pagina, /id=somenteDif>[\s\S]*?<option value=N>Todas[\s\S]*?<option value=D>Diferentes/);
    // O select virou estado interno; o controle visível é o ícone depois de Visualizações.
    assert.match(pagina, /<label class=f id=fdif hidden>/);
    const nav = pagina.slice(pagina.indexOf('<div class=acoesCabecalho>'), pagina.indexOf('id=toggleSimulacao'));
    assert.ok(nav.indexOf('id=btSomenteDif') < nav.indexOf('id=btGrafico'));
    assert.match(nav, /<button type=button id=btSomenteDif class=btIcone title="Mostrar só as linhas diferentes"\s*\n\s*aria-label="Mostrar só as linhas diferentes" aria-pressed=false disabled>/);
    // Sempre visível: nada de classe que esconda o botão fora da comparação.
    assert.doesNotMatch(fs.readFileSync('css/dashboard.css', 'utf8'), /\.btIcone\.reservado/);
    assert.doesNotMatch(pagina, /<option value=S>Diferentes/);
    assert.doesNotMatch(pagina, /Diferentes \(ignorar repetidas\)/);
    assert.match(visoes, /const somenteDif = comparacao2Periodos && modoLinhas == 'D';/);
    assert.match(visoes, /Acabou em \$\{nomeMes1\}/);
    assert.match(visoes, /Começou em \$\{nomeMes2\}/);
    assert.match(visoes, /Único em \$\{nomeMes2\}/);
    assert.match(regras, /dois ciclos seguintes/);
});

test('conta restrita (Isabella) é identificada por e-mail, não a interface geral', () => {
    // Reintroduzido por pedido explícito do mantenedor: modoSimples volta a significar
    // "conta restrita", não mais "tela estreita" — mobile normal tem paridade total.
    assert.match(estado, /const EMAIL_ISABELLA = 'isabella\.251200@gmail\.com';/);
    assert.match(estado, /const modoRestrito = \(\) => String\(Estado\.emailSessao \|\| ''\)\.trim\(\)\.toLowerCase\(\) === EMAIL_ISABELLA;/);
    assert.match(estado, /const modoSimples = \(\) => modoRestrito\(\);/);
    assert.match(bootstrap, /Estado\.emailSessao = session\.user\?\.email \|\| null;/);
    assert.match(bootstrap, /Estado\.emailSessao = data\.user\?\.email \|\| null;/);
    // Flag antiga de modo restrito (form com checkbox fIsa) continua fora — essa
    // reintrodução é só a checagem de e-mail, não aquele mecanismo antigo. `reserva` em
    // formulario já não é mais esse flag: é o bit fin.reserva do PRÓPRIO lançamento
    // (reserva de emergência, sem nenhuma relação com a conta — ver migration 22 e
    // tests/comparar-reserva.test.js), reintroduzido de propósito.
    assert.doesNotMatch(pagina, /id=fIsa|id=fReservaEmergencia/);
    assert.doesNotMatch(formulario, /\bisa\b/);
    assert.doesNotMatch(graficos, /data-tog-reserva-emergencia/);
    // A categoria textual "Isabella" (fatura do cartão) é outro conceito: a nota de que
    // "ela" (a categoria) não muda a interface continua valendo, sem relação com a conta.
    assert.match(regras, /A categoria `Isabella` identifica esses lançamentos/);
});

test('mobile tem paridade total: mesmas colunas, edição e ações do desktop', () => {
    assert.match(estado, /const colunasDaTabela = idTabela => idTabela === 'bk'\s*\n\s*\? \[COLS\.find\(\(\[chave\]\) => chave === 'prio'\), \.\.\.COLS\.filter\(\(\[chave\]\) => chave !== 'prio'\)\]\s*\n\s*: COLS\.filter\(\(\[chave\]\) => chave !== 'prio'\);/);
    assert.doesNotMatch(estado, /COLS_MOBILE/);
    assert.match(tabelas, /const texto = ehLinhaReal\(r\) && !modoRestrito\(\)\s*\n\s*\? `<span class="togData"/);
    assert.match(tabelas, /: ehLinhaReal\(r\) \? celValorEditavel\(r\) : celValorSomenteLeitura\(r\)\)/);
    assert.doesNotMatch(tabelas, /celValorMobile/);
    assert.match(tabelas, /const podeSelecionar = selecionavel;/);
    assert.doesNotMatch(interacoes, /const linha = e\.target\.closest\('tr\[data-sid\]'\);[\s\S]*?if \(isMobile\(\)\) return;/);
    assert.match(interacoes, /el\('seldup'\)\.hidden = restrito/);
    assert.match(interacoes, /el\('seldel'\)\.hidden = restrito/);
    assert.match(regras, /O mobile tem paridade total com o desktop/);
});

test('conta restrita fica só no Débito, ciclo atual/próximo, somente leitura e sem toolbar', () => {
    assert.match(visoes, /if \(modoSimples\(\)\) return blocoDebito;/);
    assert.ok(visoes.indexOf('if (modoSimples()) return blocoDebito;') < visoes.indexOf('const creditosExibidos = creditosExibidosNoCiclo'));
    assert.match(dadosUi, /const usados = modoRestrito\(\)\s*\n\s*\? \[idxAtual, idxAtual \+ 1\]\.filter\(i => i >= 0 && i < Estado\.ciclos\.length\)/);
    assert.match(dadosUi, /opcoesPeriodoDe = \(modoRestrito\(\) \? '' : '<option value="">Todos<\/option><option value=-1>Backlog'\)/);
    assert.match(interacoes, /el\('rowVis'\)\.hidden = simples;/);
    assert.match(interacoes, /el\('abreNovo'\)\.hidden = simples;/);
    assert.match(interacoes, /el\('toggleSimulacao'\)\.hidden = simples;/);
    assert.match(regras, /só vê o bloco Débito \(sem Crédito\), e só navega entre o ciclo atual e o próximo/);
});

test('indicadores sem olho: os quatro sempre visíveis, no padrão da faixa', () => {
    assert.doesNotMatch(pagina, /btOlho|nomeOlho/);
    assert.doesNotMatch(graficos + interacoes, /Olho|olhosEscolhidos/);
    assert.doesNotMatch(fs.readFileSync('css/dashboard.css', 'utf8'), /btOlho|nomeOlho|\.indicadorItem\.fechado/);
    assert.match(regras, /Não há olho para esconder indicador: os quatro aparecem sempre\./);
    assert.match(regras, /Seguem o padrão dos itens da faixa \(Besteira\/Isabella\): rótulo sem dois-pontos/);
    assert.match(regras, /\*\*Comprometido\*\* e \*\*Liberdade\*\* ficam numa linha quando cabem[^.]*\.\s+Nenhum tem linha própria fixa\./);
});

test('ícone Todas/Diferentes: sempre visível, só funciona com 2 ciclos e alterna o filtro', () => {
    const vm = require('node:vm');
    const inicio = interacoes.indexOf('function atualizarBotaoSomenteDif(comparando) {');
    const codigo = interacoes.slice(inicio, interacoes.indexOf('\n};', interacoes.indexOf("el('btSomenteDif').onclick")) + 3);
    const classes = new Set(['btIcone']);
    const atributos = {};
    const botao = {
        disabled: true, title: '',
        classList: { toggle: (c, ligar) => (ligar ? classes.add(c) : classes.delete(c)) },
        setAttribute: (k, v) => { atributos[k] = v; },
    };
    const ctx = { Estado: { _comparacao2Periodos: false }, desenhos: 0 };
    const filtro = { value: 'N' };
    ctx.el = id => ({ btSomenteDif: botao, somenteDif: filtro })[id];
    ctx.desenhar = () => { ctx.desenhos++; };
    vm.runInNewContext(`${codigo}\nthis.atualizar = atualizarBotaoSomenteDif;\nthis.clica = () => el('btSomenteDif').onclick();`, ctx);

    ctx.atualizar(false);   // um ciclo só: visível, desativado
    assert.deepEqual([...classes], ['btIcone']);
    assert.equal(botao.disabled, true);
    assert.equal(botao.title, 'Linhas diferentes: só comparando 2 ciclos');

    ctx.atualizar(true);    // comparando 3+ ciclos: continua desativado
    assert.deepEqual([...classes], ['btIcone']);
    assert.equal(botao.disabled, true);
    assert.equal(botao.title, 'Linhas diferentes: só comparando 2 ciclos');

    ctx.Estado._comparacao2Periodos = true;
    ctx.atualizar(true);    // exatamente 2 ciclos: habilitado
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
    assert.match(interacoes, /el\('btSomenteDif'\)\.hidden = simples;/);
    assert.match(regras, /Ele fica sempre visível, mas só funciona com exatamente dois ciclos: fora da comparação \(um ciclo só ou Backlog\) ou com três ou mais ciclos fica desativado/);
    assert.match(regras, /a escolha entre \*\*Todas\*\* e \*\*Diferentes\*\* é um ícone \(sinal de diferente, ≠\) no início do bloco de botões do cabeçalho, antes do Gráfico/);
});

test('"N registros · período" fica encaixado no fim da faixa Futuro do título', () => {
    const vm = require('node:vm');
    const inicio = tabelas.indexOf('const textoMetaBloco =');
    const fim = tabelas.indexOf('\n};', tabelas.indexOf('const renderBloco =')) + 3;
    const ctx = {
        Estado: { fechados: {} }, corSoma: () => '', brl: v => `R$ ${v}`,
        renderTabela: () => '<div class=wrap>tabela</div>',
    };
    vm.runInNewContext(`${tabelas.slice(inicio, fim)}\nthis.renderBloco = renderBloco;`, ctx);
    const faixa = (rotulo, dados) => `<span class=resumoLinha><span class=resumoRotulo>${rotulo}</span><span class=resumoDados>${dados}</span></span>`;
    const resumo = `<span class=resumoTitulo>${faixa('Hoje', 'a')}${faixa('Futuro', 'b')}</span>`;
    const html = ctx.renderBloco('Débito', 0, '08/10/2026 a 08/11/2026', [{}, {}], 'db', true, '', resumo);
    // Entra no fim da faixa Futuro (a última), e a linha própria some.
    assert.ok(html.includes(faixa('Futuro', 'b<span class=resumoMeta>2 registros · 08/10/2026 a 08/11/2026</span>')));
    assert.doesNotMatch(html, /<p class=meta>/);
    // Só uma faixa: vai no fim dela.
    const unica = ctx.renderBloco('Débito', 0, 'x', [{}], 'db', true, '', `<span class=resumoTitulo>${faixa('Passado', 'a')}</span>`);
    assert.ok(unica.includes(faixa('Passado', 'a<span class=resumoMeta>1 registro · x</span>')));
    // Título compacto (sem faixas) mantém a linha própria.
    assert.match(ctx.renderBloco('Backlog', 10, 'Sem data', [{}], 'bk'), /<p class=meta>1 registro · Sem data<\/p>/);
    // Backlog também sem subtítulo: só a contagem.
    assert.match(fs.readFileSync('js/cycle-views.js', 'utf8'), /renderBloco\('Backlog', linhas\.reduce\(\(s, r\) => s \+ r\.v, 0\), '', linhas, 'bk', true\)/);
    const backlog = ctx.renderBloco('Backlog', 10, '', [{}, {}], 'bk');
    assert.match(backlog, /<h3>.*Backlog · <b class="">R\$ 10<\/b> <span class=contagemTitulo>2 registros<\/span><\/h3>/);
    assert.doesNotMatch(backlog, /<p class=meta>/);
    assert.match(fs.readFileSync('css/dashboard.css', 'utf8'), /\.blk h3 \.contagemTitulo \{[\s\S]*?color: var\(--mu\);/);
    assert.match(regras, /Sem período a mostrar \(Backlog e Crédito histórico\), a quantidade vai em cinza e menor, sem parênteses, logo depois do valor/);
    // Crédito não passa subtítulo: só a contagem, sem datas nem " · " sobrando.
    const credito = ctx.renderBloco('Crédito', 0, '', [{}, {}, {}], 'cr', true, '', `<span class=resumoTitulo>${faixa('Futuro', 'b')}</span>`);
    assert.ok(credito.includes('<span class=resumoMeta>3 registros</span>'));
    assert.match(fs.readFileSync('js/cycle-views.js', 'utf8'), /'',   \/\/ Crédito mostra só a contagem de registros, sem as datas das faturas/);
    assert.match(regras, /O bloco Crédito mostra só a quantidade de registros \("17 registros"\), sem as datas das faturas\./);
    const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
    assert.match(estilos, /\.resumoMeta \{\s*\n\s*margin-left: auto;/);
    assert.match(regras, /"N registros · período" fica encaixado no fim da faixa \*\*Futuro\*\*/);
});

test('De/Até mostram o mês abreviado, com o nome completo no tooltip', () => {
    const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
    assert.match(dadosUi, /const opcaoDoCiclo = i => `<option value=\$\{i\} title="\$\{nomePeriodo\(Estado\.ciclos\[i\]\)\}">\$\{nomePeriodoAbrev\(Estado\.ciclos\[i\]\)\}`;/);
    assert.match(dadosUi, /usadosNaveg\.map\(opcaoDoCiclo\)/);
    assert.match(regras, /Os seletores \*\*De\*\* e \*\*Até\*\* mostram cada ciclo pelo mês abreviado \(`Out\/26`/);
});

test('entre De e Até não há texto nem traço', () => {
    assert.doesNotMatch(pagina, /navCompararAte/);
    assert.match(pagina, /<select id=compDe aria-label="De"><\/select>\s*<\/label>\s*<label class=fInline id=fate>/);
    assert.match(regras, /Os dois ficam lado a lado, sem texto ou traço entre eles/);
});

test('botões de ação do cabeçalho ficam num bloco que quebra de linha inteiro', () => {
    const grupo = pagina.slice(pagina.indexOf('<div class=acoesCabecalho>'), pagina.indexOf('<p class=sub>'));
    for (const id of ['toggleSimulacao', 'abreNovo', 'recarregar', 'btDiagnostico', 'sair']) assert.match(grupo, new RegExp(`id=${id}\\b`));
    assert.match(fs.readFileSync('css/base.css', 'utf8'), /\.acoesCabecalho \{\s*\n\s*display: flex;\s*\n\s*flex-wrap: nowrap;/);
    assert.doesNotMatch(fs.readFileSync('css/mobile.css', 'utf8'), /#abreNovo \{\s*\n\s*margin-left: auto;/);
    assert.match(regras, /descem \*\*juntos\*\* pra linha seguinte, nunca separados, e lá ficam alinhados \*\*à esquerda\*\*/);
});

test('botões que descem de linha ficam à esquerda; na mesma linha, à direita', () => {
    const base = fs.readFileSync('css/base.css', 'utf8');
    const bloco = base.slice(base.indexOf('.acoesCabecalho {'), base.indexOf('}', base.indexOf('.acoesCabecalho {')));
    // margin-left:auto empurraria o bloco pra direita também quando ele está sozinho numa linha.
    assert.doesNotMatch(bloco, /margin-left/);
    // Na mesma linha da navegação, é a margem automática dela que joga os botões pra direita.
    assert.match(fs.readFileSync('css/dashboard.css', 'utf8'), /#fciclNav \{[^}]*margin: 0 auto 0 0;/);
});

test('controle desativado mostra o cursor de bloqueado vermelho', () => {
    const base = fs.readFileSync('css/base.css', 'utf8');
    // SVG do círculo cortado no vermelho do tema (--vm #F06A61), com not-allowed de reserva.
    assert.match(base, /--cursor-bloqueado: url\("data:image\/svg\+xml,[^"]*stroke='%23F06A61'[^"]*"\) 12 12, not-allowed;/);
    assert.match(base, /:disabled \{\s*\n\s*cursor: var\(--cursor-bloqueado\) !important;/);
    // Nenhuma regra de desativado volta a impor o cursor padrão ou o nativo.
    for (const arquivo of ['css/dashboard.css', 'css/forms.css', 'css/mobile.css']) {
        const css = fs.readFileSync(arquivo, 'utf8');
        for (const [, corpo] of css.matchAll(/:disabled[^{]*\{([^}]*)\}/g)) assert.doesNotMatch(corpo, /cursor:/, arquivo);
    }
    assert.match(regras, /Todo controle desativado \(botão, seletor ou campo\) mostra, ao passar o mouse, o cursor de bloqueado \(círculo cortado\) em \*\*vermelho\*\*/);
});

test('Simular é sempre laranja, como o Recarregar é sempre verde; ligado fica preenchido', () => {
    const base = fs.readFileSync('css/base.css', 'utf8');
    assert.match(base, /#toggleSimulacao \{[^}]*color: #F0A83A;\s*\n\s*background: var\(--orange-soft\);\s*\n\s*border: 1px solid #F0A83A;/);
    assert.match(base, /#recarregar \{[^}]*color: var\(--vd\);\s*\n\s*background: var\(--green-soft\);\s*\n\s*border: 1px solid var\(--vd\);/);
    assert.match(base, /#toggleSimulacao:hover,\s*\n\s*#toggleSimulacao\.ativo \{\s*\n\s*color: #10231A;\s*\n\s*background: #F0A83A;/);
    assert.match(regras, /O botão \*\*Simular\*\* \(lançamentos provisórios\) é sempre laranja/);
});

test('conta restrita sem tetos Besteira/Isabella, sem diagnóstico e sem Recarregar (só a recarga automática)', () => {
    const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
    const boot = fs.readFileSync('js/bootstrap.js', 'utf8');
    assert.match(visoes, /const limitesCategoria = i >= 0 && !modoRestrito\(\) \? \[/);
    assert.match(interacoes, /el\('btDiagnostico'\)\.hidden = simples;/);
    assert.match(interacoes, /el\('recarregar'\)\.hidden = simples;/);
    assert.match(boot, /if \(bt\.disabled \|\| modoRestrito\(\)\) return;\s*\n\s*await consolidarTudo\(bt, voltarAoCicloAtualELimpar\);/);
    // A recarga automática continua valendo pra ela (nunca consolida: só modoRestrito() fora).
    assert.match(boot, /if \(!modoRestrito\(\) && Date\.now\(\) - Estado\.ultimaConsolidacao >= INTERVALO_CONSOLIDACAO_AUTOMATICA_MS\)/);
    assert.match(boot, /if \(Date\.now\(\) - Estado\.ultimaCarga >= INTERVALO_RECARGA_AUTOMATICA_MS\) recarregarDados\(\);/);
    assert.match(regras, /os indicadores de teto \*\*Besteira\*\*\/\*\*Isabella\*\* nas faixas Hoje\/Futuro do Débito, o botão de \*\*diagnóstico\*\* e o botão \*\*Recarregar\*\* ficam escondidos/);
    const agentes = fs.readFileSync('AGENTS.md', 'utf8');
    assert.match(agentes, /O mobile tem paridade total com o desktop/);
    assert.doesNotMatch(agentes, /Isabella e mobile usam o mesmo `modoSimples`/);
});
