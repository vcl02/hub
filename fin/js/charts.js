// Filtros visuais e gráficos do painel.

const FILTROS_PADRAO = { somenteDif: 'N' };

// Sem desenhar(): quem chama (o botão Atual) ainda posiciona De/Até antes de redesenhar.
function limparFiltros() {
    Object.entries(FILTROS_PADRAO).forEach(([id, valor]) => { el(id).value = valor; });
    Estado.filtroTexto = {};      // buscas por coluna (Data/Nome/Valor/Categoria/Frequência)
    Estado.filtroTeto = null;     // clique em Besteira/Isabella no título do Débito
    Estado.fechados = {};         // blocos recolhidos voltam a abrir
    Estado.selecionados.clear();  // as linhas marcadas somem junto com o recorte que as gerou
    Estado.ordenacaoPorTabela = {};   // volta pra ordenacao padrao (data ascendente)
    Estado.ordComp = { k: 'total', d: 2 };
    excluidasDoGrafico = [CATEGORIA_EXCLUIDA_GRAFICO_PADRAO];   // volta ao padrão: só Contabilidade fora
    // De/Ate: zerar os dois faz desenhar() repor o ciclo ATUAL nos dois (mesmo caminho da
    // 1a carga). Sem ciclo atual, ficam em "Todos" — que tambem e' como a pagina abriria.
    el('compDe').value = '';
    el('compAte').value = '';
}

// ===================================================================
// VISUALIZAÇÕES — acompanhamentos fixos escolhidos pelo mantenedor
// ===================================================================
const NOMES_DAS_VISUALIZACOES = [
    'Entrada Econ',
    'Evolução Obra', 'Financiamento Casa', 'Trybe', 'Senac',
    'Seguro Residencial', 'Iphone', 'Pós',
    'Banco do Brasil',
];
const OPCOES_VISUALIZACOES = [
    { id: 'categoria-roberta', rotulo: 'Roberta', categoriaContem: 'Roberta' },
    ...NOMES_DAS_VISUALIZACOES.map((nome, indice) => ({ id: `nome-${indice}`, rotulo: nome, nome })),
];

const textoNormalizadoVisualizacao = valor => semAcento(valor).trim();

function opcaoDaVisualizacao(id) {
    return OPCOES_VISUALIZACOES.find(opcao => opcao.id == id);
}

function pertenceAVisualizacao(r, opcao) {
    if (!opcao || r.v >= 0) return false;
    if (opcao.nome && textoNormalizadoVisualizacao(r.nome) !== textoNormalizadoVisualizacao(opcao.nome)) return false;
    if (opcao.categoriaContem && !textoNormalizadoVisualizacao(r.categ)
        .includes(textoNormalizadoVisualizacao(opcao.categoriaContem))) return false;
    return true;
}

// A escolha ignora o recorte da barra para mostrar a relação inteira. Pago e aberto usam
// valor absoluto porque o sinal já serviu para separar gastos de entradas.
function dadosVisualizacao(id) {
    const opcao = opcaoDaVisualizacao(id);
    const linhas = Estado.lancamentos.filter(r => pertenceAVisualizacao(r, opcao));
    const total = linhas.reduce((s, r) => s + Math.abs(r.v), 0);
    const pago = linhas.filter(r => r.pago).reduce((s, r) => s + Math.abs(r.v), 0);
    const naoPago = Math.max(0, total - pago);
    const pctPago = total ? Math.min(100, pago / total * 100) : 0;
    return { linhas, total, pago, naoPago, pctPago };
}

const pct1 = n => n.toFixed(1).replace('.', ',') + '%';

function abrirVisualizacao(id) {
    const opcao = opcaoDaVisualizacao(id);
    if (!opcao) return;
    const d = dadosVisualizacao(id);
    const concluido = d.total > 0 && d.naoPago <= 0.005;
    el('tituloVisualizacao').textContent = opcao.rotulo;
    el('visualizacaoCorpo').innerHTML = !d.linhas.length
        ? '<p class=meta>Nenhum lançamento nesta visualização.</p>'
        : `<div class="visPct ${concluido ? 'vd' : 'vm'}">${pct1(d.pctPago)}</div>
           <p class=visPctSub>do valor total está pago</p>
           <div class=visBarra><div class=visFill style="width:${d.pctPago.toFixed(2)}%"></div></div>
           <div class=visLegenda>
             <span>Pago ${pct1(d.pctPago)}</span>
             <span>${d.linhas.length} lançamento${d.linhas.length > 1 ? 's' : ''}</span>
           </div>
           <table class=visTab><tbody>
             <tr><td>Pago<td class="n vd">${brl(d.pago)}
             <tr><td>Não pago<td class="n vm">${brl(d.naoPago)}
             <tr class=tot><td>Total<td class=n>${brl(d.total)}
           </tbody></table>`;
    el('modalVisualizacao').showModal();
}

function popularAlvosVisualizacao() {
    // O menu do ícone Visualizações lista os acompanhamentos; escolher um abre o detalhe
    // direto, sem outro modal nem confirmação extra. A ordem é
    // dinâmica — do mais próximo de acabar (maior % pago) pro mais longe — pra quem falta
    // pouco aparecer sempre no topo, sem precisar abrir cada opção pra descobrir quem está
    // quase lá. Recalculada aqui porque dadosVisualizacao() depende de Estado.lancamentos,
    // que muda a cada carga/edição.
    const ordenadas = OPCOES_VISUALIZACOES
        .map(opcao => ({ opcao, pctPago: dadosVisualizacao(opcao.id).pctPago }))
        .sort((a, b) => b.pctPago - a.pctPago)
        .map(({ opcao }) => opcao);
    el('visMenu').innerHTML = ordenadas.map(opcao =>
        `<button type=button role=menuitem data-vis="${escapeHtml(opcao.id)}">${escapeHtml(opcao.rotulo)}</button>`).join('');
}

// A escolha abre o acompanhamento diretamente; não existe etapa intermediária de "Ver".
popularAlvosVisualizacao();
// Menu próprio no lugar da lista nativa do <select>, que no Windows abre colada no botão e
// sem o tema escuro. Fecha ao escolher, ao clicar fora ou com Esc.
const itensDoMenuVis = () => [...el('visMenu').querySelectorAll('[data-vis]')];
function fecharMenuVis() {
    el('visMenu').hidden = true;
    el('btVis').setAttribute('aria-expanded', 'false');
}
el('btVis').onclick = e => {
    e.stopPropagation();
    const menu = el('visMenu');
    if (!menu.hidden) { fecharMenuVis(); return; }
    menu.style.left = '';
    menu.hidden = false;
    el('btVis').setAttribute('aria-expanded', 'true');
    // Perto da borda direita (ícone no fim da linha no mobile), puxa o menu pra dentro da tela.
    const sobra = window.innerWidth - 8 - menu.getBoundingClientRect().right;
    if (sobra < 0) menu.style.left = `${sobra}px`;
    itensDoMenuVis()[0]?.focus();
};
el('visMenu').onclick = e => {
    const item = e.target.closest('[data-vis]');
    if (!item) return;
    fecharMenuVis();
    abrirVisualizacao(item.dataset.vis);
};
el('visMenu').addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const itens = itensDoMenuVis();
    const atual = itens.indexOf(document.activeElement);
    itens[(atual + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length]?.focus();
});
document.addEventListener('click', e => {
    if (!el('visMenu').hidden && !el('visIcone').contains(e.target)) fecharMenuVis();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !el('visMenu').hidden) { fecharMenuVis(); el('btVis').focus(); }
});

el('fechaVisualizacao').onclick = () => el('modalVisualizacao').close();
el('modalVisualizacao').addEventListener('click', e => {
    if (e.target == el('modalVisualizacao')) el('modalVisualizacao').close();
});

// ===================================================================
// GRÁFICO DE GASTOS DO CICLO (pizza)
// ===================================================================
// Regra: total = soma de TUDO positivo no ciclo (renda, sem selecao manual).
// Fatias = cada categoria de débito com saldo negativo no ciclo (gasto), com
// Resgate necessario / Aporte sugerido do ciclo contando como renda / categoria
// "Investimento", igual um resgate/aporte real contaria.
// O usuario pode selecionar categorias especificas da pizza via multi-select. Uma linha com
// mais de uma categoria continua valendo uma vez só; o seletor decide em qual recorte ela entra.
let graficoChart = null;
let excluidasDoGrafico = [CATEGORIA_EXCLUIDA_GRAFICO_PADRAO];
const MESES_META_RESERVA_EMERGENCIA = 9;
const MESES_MEDIA_LIBERDADE_FINANCEIRA = 12;
const TAXA_RETIRADA_LIBERDADE_FINANCEIRA = 0.035;
const PERCENTUAL_MINIMO_PIZZA = 2;
const LIMITES_COMPROMISSOS = [
    { chave: 'comprometido', rotulo: 'Comprometido', percentual: 50 },
];

// Categorias compartilhadas pedem decisão do usuário; ficam no início do seletor para não
// se perderem entre as classificações simples. Dentro de cada grupo, a ordem é estável.
function ordenarCategoriasDoGrafico(categorias, categoriasCompartilhadas) {
    return [...categorias].sort((a, b) =>
        Number(categoriasCompartilhadas.has(b)) - Number(categoriasCompartilhadas.has(a)) ||
        a.localeCompare(b, 'pt-BR'));
}

// Um único comando alterna o recorte inteiro sem misturar categorias de outro ciclo que
// tenham ficado guardadas na preferência temporária do modal.
function proximaExclusaoDasCategorias(categorias, excluidas) {
    const todasIncluidas = categorias.every(c => !excluidas.includes(c));
    return todasIncluidas
        ? [...new Set([...excluidas, ...categorias])]
        : excluidas.filter(c => !categorias.includes(c));
}

// Projeta cada nome marcado nos nove ciclos a partir do selecionado. Uma ocorrência
// cadastrada no ciclo substitui a estimativa daquele nome; sem ocorrência, continua
// valendo o último valor conhecido. Assim uma previsão crescente entra mês a mês.
function dadosMetaReservaEmergencia(linhas, idxPeriodo, guardado) {
    const porCiclo = new Map();
    linhas.forEach(r => {
        if (!(r.v < 0) || r._transferencia || !r.reserva || r.periodoIdx == null) return;
        const gastos = porCiclo.get(r.periodoIdx) || new Map();
        const nome = String(r.nome || '').trim();
        gastos.set(nome, (gastos.get(nome) || 0) + -r.v);
        porCiclo.set(r.periodoIdx, gastos);
    });

    const ultimoValorPorNome = new Map();
    const totaisPorCiclo = [];
    let mesesComEstimativa = 0;
    for (let i = idxPeriodo; i < idxPeriodo + MESES_META_RESERVA_EMERGENCIA; i++) {
        const cadastrados = porCiclo.get(i) || new Map();
        cadastrados.forEach((valor, nome) => ultimoValorPorNome.set(nome, valor));
        if ([...ultimoValorPorNome.keys()].some(nome => !cadastrados.has(nome))) mesesComEstimativa++;
        totaisPorCiclo.push([...ultimoValorPorNome.values()].reduce((s, v) => s + v, 0));
    }
    const gastoMensal = totaisPorCiclo[0];
    const meta = totaisPorCiclo.reduce((s, v) => s + v, 0);
    const totalGuardado = Math.max(0, guardado || 0);
    return {
        gastoMensal, meta, guardado: totalGuardado, mesesComEstimativa, totaisPorCiclo,
        guardadoNaMeta: Math.min(meta, totalGuardado),
        restante: Math.max(0, meta - totalGuardado),
        excedente: Math.max(0, totalGuardado - meta),
        percentual: meta ? Math.min(100, totalGuardado / meta * 100) : 0,
    };
}

// Primeiro ciclo seguinte em que o guardado projetado alcança a meta de Reserva DE HOJE
// (alvo fixo: a meta de cada ciclo futuro só enxerga o que já está cadastrado dali pra
// frente, e some perto do fim das séries). O guardado dos ciclos futuros já inclui o Aporte
// sugerido/Resgate necessário de cada um. null quando a meta já está completa (nada a
// projetar) ou quando não fecha até o último ciclo carregado.
function cicloEmQueReservaCompleta(idxPeriodo) {
    const { meta, guardado } = dadosMetaReservaEmergenciaCiclo(idxPeriodo);
    if (!(meta > TOLERANCIA_FINANCEIRA) || guardado >= meta - TOLERANCIA_FINANCEIRA) return null;
    for (let i = idxPeriodo + 1; i < Estado.ciclos.length; i++) {
        if (guardadoAte(i) >= meta - TOLERANCIA_FINANCEIRA) return i;
    }
    return null;
}

function dadosMetaReservaEmergenciaCiclo(idxPeriodo) {
    const periodo = Estado.ciclos[idxPeriodo];
    const gastos = filtrarLancamentos()
        .filter(r => r.periodoIdx != null && r.periodoIdx >= idxPeriodo && r.periodoIdx < idxPeriodo + MESES_META_RESERVA_EMERGENCIA)
        .map(r => ({ ...r, _transferencia: ehTransferenciaFatura(r) }));
    return { periodo, ...dadosMetaReservaEmergencia(gastos, idxPeriodo, guardadoAte(idxPeriodo)) };
}

// Parcela de compra parcelada no Crédito: lote do cadastro (mesmo recorrencia_id, gravado
// quando Vezes > 1 — real ou simulado) sem Frequência. Série com Frequência (assinatura,
// conta recorrente) não é parcela: continua dependendo da marca.
const ehParcelaDeCompra = r => !!r.cred && r.recorrencia_id != null && !r.freq;

// Comprometido é uma leitura do orçamento, não uma mudança de dado: ele lê o bit
// `comprometido` do lançamento (coluna própria, não mais texto em categ — ver migration 22)
// e compara ao teto único sobre as entradas do ciclo. Parcela de compra parcelada entra
// mesmo sem a marca: depois de assumida, ela já é obrigatória todo mês.
// Base do percentual: toda entrada positiva do ciclo, menos resgate de investimento (é o
// próprio dinheiro guardado voltando, não renda) e transferências de fatura. O nome continua
// `faturamento` porque é o que o ciclo ganhou; nenhum lançamento específico é procurado.
function dadosCompromissosDoCiclo(linhas) {
    const faturamento = linhas
        .filter(r => r.v > 0 && !r.inv && !r._transferencia)
        .reduce((soma, r) => soma + r.v, 0);
    const resumo = limite => {
        const gastos = linhas.filter(r => r.v < 0 && !r._transferencia && (r.comprometido || ehParcelaDeCompra(r)));
        const valor = gastos.reduce((soma, r) => soma + -r.v, 0);
        // Quanto disso veio só por ser parcela (sem a marca), pro hover explicar o número.
        const valorParcelasSemMarca = gastos.filter(r => !r.comprometido).reduce((soma, r) => soma + -r.v, 0);
        const teto = faturamento * limite.percentual / 100;
        return {
            ...limite, valor, teto, linhas: gastos, valorParcelasSemMarca,
            percentualFaturamento: faturamento ? valor / faturamento * 100 : 0,
            percentualDoTeto: teto ? valor / teto * 100 : 0,
            excedido: valor > teto + TOLERANCIA_FINANCEIRA,
        };
    };
    return { faturamento, limites: LIMITES_COMPROMISSOS.map(resumo) };
}

// Indicador "Isabella" (rótulo exibido no título — ver cycle-views.js): conta todo
// lançamento com a categoria "Isabella" — junto com "Lazer" (sair com ela) ou sozinha
// (presente, mimo…) —, MENOS a fatura do cartão dela (categoria ou nome com "Fatura"): essa
// é a conta mensal inteira do cartão, não um gasto com ela, e estouraria o teto sozinha; e
// MENOS o que está marcado Comprometido (parcelas e compromissos fixos, como Iphone e
// Senac): o teto mede o gasto variável com ela, não o que já está assumido. A categoria é comparada como item inteiro ("Isabella"), então a antiga
// "Besteira Isabella" não entra. "Lazer" sozinho nunca conta — pode ser lazer com outra pessoa.
const ehGastoIsabella = r => {
    const categorias = categoriasSeparadas(r.categ).map(c => semAcento(c).trim());
    return categorias.includes('isabella') && !categorias.includes('fatura') && !semAcento(r.nome).includes('fatura') && !r.comprometido;
};

// Regra única pros indicadores de limite por categoria (Besteira, Isabella, ...): soma
// Débito e Crédito do MESMO ciclo contra um teto fixo em código. Hoje considera só o que já
// está pago; Futuro considera tudo (pago + aberto), porque é quanto o usuário planeja gastar
// no ciclo, não só o que já aconteceu. `categoria` aceita um texto — item INTEIRO da lista de
// categorias (ehCategoria): "Besteira" conta, a antiga "Besteira Isabella" não — OU uma função
// que recebe a linha inteira e decide sozinha (ex.: ehGastoIsabella, que combina mais de uma).
// `contaNoTeto` é a regra de uma linha só: o indicador soma por ela e o filtro do clique no
// nome do teto (passaFiltroTeto em tables.js) mostra exatamente as mesmas linhas.
function contaNoTeto(r, categoria) {
    const combina = typeof categoria === 'function' ? categoria : x => ehCategoria(x.categ, categoria);
    return r.v < 0 && !ehTransferenciaFatura(r) && combina(r);
}
function dadosLimiteCategoriaDoCiclo(linhas, categoria, limite) {
    const gastos = linhas.filter(r => contaNoTeto(r, categoria));
    const valorPago = gastos.filter(r => r.pago).reduce((soma, r) => soma + -r.v, 0);
    const valorTotal = gastos.reduce((soma, r) => soma + -r.v, 0);
    return {
        valorPago, valorTotal,
        percentualPago: limite ? valorPago / limite * 100 : 0,
        percentualTotal: limite ? valorTotal / limite * 100 : 0,
    };
}

// Cor do indicador de limite por categoria: verde com folga, laranja chegando perto
// (a partir de 70% — limiar escolhido pra dar aviso antes de estourar), vermelho acima do teto.
function corDoLimiteCategoria(percentual) {
    if (percentual > 100) return 'vm';
    return percentual >= 70 ? 'am' : 'vd';
}

// Lançamentos reais mais as linhas do plano das metas (parcelas e financiamentos futuros já
// são compromisso); as previstas de Besteira/Isabella ficam fora, como sempre.
function dadosCompromissosCiclo(idxPeriodo) {
    const periodo = Estado.ciclos[idxPeriodo];
    const linhas = [...Estado.lancamentos, ...linhasDasMetas()]
        .filter(r => r.periodoIdx == idxPeriodo)
        .map(r => ({ ...r, _transferencia: ehTransferenciaFatura(r) }));
    return { periodo, ...dadosCompromissosDoCiclo(linhas) };
}

// A proporção não mede a meta de reserva: ela só revela quanto das despesas reais do
// próprio ciclo foi classificado como Reserva. Cada lançamento entra uma única vez, mesmo
// com categorias compostas; antecipação é transferência, portanto não é gasto nesta leitura.
function dadosProporcaoReservaDoCiclo(linhas) {
    const gastos = linhas.filter(r => r.v < 0 && !r._transferencia);
    const total = gastos.reduce((soma, r) => soma + -r.v, 0);
    const reserva = gastos
        .filter(r => r.reserva)
        .reduce((soma, r) => soma + -r.v, 0);
    const demais = total - reserva;
    return {
        total, reserva, demais,
        percentualReserva: total ? reserva / total * 100 : 0,
        percentualDemais: total ? demais / total * 100 : 0,
    };
}

// Liberdade financeira usa somente patrimônio realmente investido acima da reserva. A meta
// parte da média recente do custo de vida: investimento, transferência e compensação não são
// despesas de sustento. A meta não promete retorno; aplica a taxa escolhida de retirada anual.
function dadosLiberdadeFinanceira(linhas, idxPeriodo, patrimonioInvestido, reservaNecessaria) {
    const inicio = Math.max(0, idxPeriodo - MESES_MEDIA_LIBERDADE_FINANCEIRA + 1);
    const mesesObservados = Math.max(0, idxPeriodo - inicio + 1);
    const gastos = linhas.filter(r => r.periodoIdx >= inicio && r.periodoIdx <= idxPeriodo &&
        r.v < 0 && !r.inv && !r._transferencia &&
        !ehCategoria(r.categ, 'Reembolso') && !ehCategoria(r.categ, 'Rendimento'));
    const gastoTotal = gastos.reduce((soma, r) => soma + -r.v, 0);
    const gastoMensal = mesesObservados ? gastoTotal / mesesObservados : 0;
    const meta = gastoMensal ? gastoMensal * 12 / TAXA_RETIRADA_LIBERDADE_FINANCEIRA : 0;
    const patrimonioLivre = Math.max(0, (patrimonioInvestido || 0) - Math.max(0, reservaNecessaria || 0));
    return {
        gastoMensal, mesesObservados, meta, patrimonioLivre,
        restante: Math.max(0, meta - patrimonioLivre),
        percentual: meta ? Math.min(100, patrimonioLivre / meta * 100) : 0,
    };
}

// Os textos da barra não são botões: resumem a distância até a reserva de nove meses
// e a parcela do faturamento já comprometida no ciclo escolhido. As faixas são visuais:
// reserva <50% vermelha, 50–99,9% âmbar, completa verde; comprometido até 40% verde,
// 40–50% âmbar e acima do teto de 50% vermelho.
function classeIndicadorReserva(dados) {
    if (dados.meta <= TOLERANCIA_FINANCEIRA) return 'neutro';
    if (dados.percentual >= 100) return 'vd';
    return dados.percentual >= 50 ? 'am' : 'vm';
}

function classeIndicadorComprometido(dados) {
    const limite = dados.limites[0];
    if (dados.faturamento <= TOLERANCIA_FINANCEIRA) return 'neutro';
    if (limite.percentualFaturamento <= 40) return 'vd';
    return limite.percentualFaturamento <= limite.percentual ? 'am' : 'vm';
}

// Reserva é patrimônio, não padrão de consumo. Esta leitura usa as mesmas faixas do
// Comprometido, mas no sentido oposto: menos de 40% dos gastos em Reserva é saudável.
function classeIndicadorProporcaoReserva(dados) {
    if (dados.total <= TOLERANCIA_FINANCEIRA) return 'neutro';
    if (dados.percentualReserva <= 40) return 'vd';
    return dados.percentualReserva <= 50 ? 'am' : 'vm';
}

// Compara os percentuais já arredondados como aparecem na tela. Reserva crescendo é boa;
// Comprometido crescendo é ruim. A direção fica separada da cor atual do indicador.
function variacaoPercentualIndicador(atual, anterior, subirEhPositivo) {
    if (!Number.isFinite(atual) || !Number.isFinite(anterior)) return null;
    const atualExibido = Math.round(atual * 10) / 10;
    const anteriorExibido = Math.round(anterior * 10) / 10;
    const diferenca = atualExibido - anteriorExibido;
    if (Math.abs(diferenca) < 0.05) return { diferenca: 0, seta: '→', classe: 'neutro' };
    const subiu = diferenca > 0;
    return {
        diferenca: Math.round(Math.abs(diferenca) * 10) / 10,
        seta: subiu ? '↑' : '↓',
        classe: subiu === subirEhPositivo ? 'vd' : 'vm',
    };
}

// O valor absoluto completa a taxa: ele mostra Guardado para Reserva e o total devido
// para Comprometido. A mesma convenção de cores deixa claro quando essa mudança ajuda.
function variacaoValorIndicador(atual, anterior, subirEhPositivo) {
    if (!Number.isFinite(atual) || !Number.isFinite(anterior)) return null;
    const diferenca = Math.round((atual - anterior) * 100) / 100;
    if (Math.abs(diferenca) <= TOLERANCIA_FINANCEIRA) return { diferenca: 0, seta: '→', classe: 'neutro' };
    const subiu = diferenca > 0;
    return {
        diferenca: Math.abs(diferenca),
        seta: subiu ? '↑' : '↓',
        classe: subiu === subirEhPositivo ? 'vd' : 'vm',
    };
}

function htmlVariacaoIndicador(percentual, valor, tituloValor) {
    if (!percentual || !valor) return '';
    const pontos = percentual.diferenca.toLocaleString('pt-BR', {
        minimumFractionDigits: 1, maximumFractionDigits: 1,
    });
    // Num selo discreto (.variacaoLinha) logo depois do próprio indicador, no mesmo item:
    // quando os itens quebram de linha, a variação nunca parece de outro indicador.
    return `<span class="variacaoIndicador ${percentual.classe}" title="Variação sobre o ciclo anterior">${percentual.seta}${pontos} p.p.</span><span class=separadorVariacao aria-hidden=true> · </span><span class="variacaoIndicador ${valor.classe}" title="${tituloValor}">${valor.seta}${brl(valor.diferenca)}</span>`;
}

function atualizarLinhaVariacao(id, percentual, valor, tituloValor) {
    const linha = el(id);
    linha.innerHTML = htmlVariacaoIndicador(percentual, valor, tituloValor);
    linha.hidden = !percentual || !valor;
}

// Percentual em negrito com a largura de "100%" (b.pct), como Besteira/Isabella na faixa.
// Sem valor ("—"), sem essa largura: sobraria um vão antes de "sem meta".
const valorIndicador = (texto, classe = 'neutro') => `<b class="${texto == '—' ? '' : 'pct '}${classe}">${texto}</b>`;

function atualizarIndicadoresFinanceiros(idxPeriodo) {
    const reserva = dadosMetaReservaEmergenciaCiclo(idxPeriodo);
    const comprometidos = dadosCompromissosCiclo(idxPeriodo);
    const comprometido = comprometidos.limites[0];
    // Gastos e Liberdade contam as previstas de Besteira/Isabella como compras de verdade
    // (o teto inteiro gasto, como na fatura e no saldo); as linhas das metas ficam fora.
    const comPrevistas = [...Estado.lancamentos, ...previstasDosTetos()];
    const proporcaoDoCiclo = idx => dadosProporcaoReservaDoCiclo(
        comPrevistas
            .filter(r => r.periodoIdx == idx)
            .map(r => ({ ...r, _transferencia: ehTransferenciaFatura(r) }))
    );
    const proporcaoReserva = proporcaoDoCiclo(idxPeriodo);
    const liberdade = dadosLiberdadeFinanceira(
        comPrevistas.map(r => ({ ...r, _transferencia: ehTransferenciaFatura(r) })),
        idxPeriodo,
        guardadoRealAte(Estado.lancamentos, idxPeriodo),
        reserva.meta
    );
    const reservaAnterior = idxPeriodo > 0 ? dadosMetaReservaEmergenciaCiclo(idxPeriodo - 1) : null;
    const comprometidosAnterior = idxPeriodo > 0 ? dadosCompromissosCiclo(idxPeriodo - 1) : null;
    const variacaoReserva = reserva.meta > TOLERANCIA_FINANCEIRA
        && reservaAnterior?.meta > TOLERANCIA_FINANCEIRA
        ? variacaoPercentualIndicador(reserva.percentual, reservaAnterior.percentual, true)
        : null;
    const variacaoGuardado = reserva.meta > TOLERANCIA_FINANCEIRA
        && reservaAnterior?.meta > TOLERANCIA_FINANCEIRA
        ? variacaoValorIndicador(reserva.guardado, reservaAnterior.guardado, true)
        : null;
    const variacaoComprometido = comprometidos.faturamento > TOLERANCIA_FINANCEIRA
        && comprometidosAnterior?.faturamento > TOLERANCIA_FINANCEIRA
        ? variacaoPercentualIndicador(
            comprometido.percentualFaturamento,
            comprometidosAnterior.limites[0].percentualFaturamento,
            false
        )
        : null;
    const variacaoValorComprometido = comprometidos.faturamento > TOLERANCIA_FINANCEIRA
        && comprometidosAnterior?.faturamento > TOLERANCIA_FINANCEIRA
        ? variacaoValorIndicador(comprometido.valor, comprometidosAnterior.limites[0].valor, false)
        : null;
    // Gastos em Reserva varia como Comprometido: mais fatia (e mais R$) em Reserva é pior,
    // pela mesma leitura da cor (até 40% é saudável).
    const proporcaoAnterior = idxPeriodo > 0 ? proporcaoDoCiclo(idxPeriodo - 1) : null;
    const comparaGastos = proporcaoReserva.total > TOLERANCIA_FINANCEIRA && proporcaoAnterior?.total > TOLERANCIA_FINANCEIRA;
    const variacaoProporcaoReserva = comparaGastos
        ? variacaoPercentualIndicador(proporcaoReserva.percentualReserva, proporcaoAnterior.percentualReserva, false)
        : null;
    const variacaoValorProporcaoReserva = comparaGastos
        ? variacaoValorIndicador(proporcaoReserva.reserva, proporcaoAnterior.reserva, false)
        : null;

    // Mesmo padrão dos itens da faixa do Débito (Besteira/Isabella): rótulo, o percentual em
    // negrito com a cor do estado e o complemento apagado.
    // Meta incompleta: em que ciclo o guardado projetado chega nela ("· dez/32"); sem fechar
    // até o último ciclo carregado, "· depois de" ele. Completa, não há data.
    const idxCompleta = reserva.meta > TOLERANCIA_FINANCEIRA && reserva.percentual < 100 ? cicloEmQueReservaCompleta(idxPeriodo) : null;
    const ultimoCiclo = Estado.ciclos[Estado.ciclos.length - 1];
    const quandoCompleta = reserva.meta <= TOLERANCIA_FINANCEIRA || reserva.percentual >= 100 ? ''
        : idxCompleta != null ? ` <span class=limiteRotulo>·</span> <b>${nomePeriodoAbrev(Estado.ciclos[idxCompleta])}</b>`
            : ` <span class=limiteRotulo>· depois de</span> <b>${nomePeriodoAbrev(ultimoCiclo)}</b>`;
    const indicadorReserva = el('indicadorReserva');
    indicadorReserva.innerHTML = reserva.meta > TOLERANCIA_FINANCEIRA
        ? `Reserva ${valorIndicador(pct1(reserva.percentual), classeIndicadorReserva(reserva))} <span class=limiteRotulo>da meta</span>${quandoCompleta}`
        : `Reserva ${valorIndicador('—')} <span class=limiteRotulo>sem meta</span>`;
    indicadorReserva.title = reserva.meta > TOLERANCIA_FINANCEIRA
        ? `${brl(reserva.guardado)} de ${brl(reserva.meta)} para 9 meses` +
            (quandoCompleta ? `; no ritmo projetado, a meta ${idxCompleta != null ? `completa em ${nomePeriodo(Estado.ciclos[idxCompleta])}` : 'não completa até o último ciclo carregado'}` : '')
        : 'Sem gastos marcados para a reserva nos próximos 9 ciclos';
    atualizarLinhaVariacao(
        'variacaoReserva', variacaoReserva, variacaoGuardado,
        'Variação do Guardado sobre o ciclo anterior'
    );

    const indicadorComprometido = el('indicadorComprometido');
    indicadorComprometido.innerHTML = comprometidos.faturamento > TOLERANCIA_FINANCEIRA
        ? `Comprometido ${valorIndicador(pct1(comprometido.percentualFaturamento), classeIndicadorComprometido(comprometidos))} <span class=limiteRotulo>do mês</span>`
        : `Comprometido ${valorIndicador('—')} <span class=limiteRotulo>sem entradas</span>`;
    indicadorComprometido.title = comprometidos.faturamento > TOLERANCIA_FINANCEIRA
        ? `${brl(comprometido.valor)} de ${brl(comprometidos.faturamento)}; teto ${pct1(comprometido.percentual)}` +
            (comprometido.valorParcelasSemMarca > TOLERANCIA_FINANCEIRA ? `; inclui ${brl(comprometido.valorParcelasSemMarca)} de parcelas sem a marca` : '')
        : 'Sem entradas no ciclo';
    atualizarLinhaVariacao(
        'variacaoComprometido', variacaoComprometido, variacaoValorComprometido,
        'Variação do valor comprometido sobre o ciclo anterior'
    );

    // Mesmo formato do Comprometido: a fatia em Reserva, o complemento e a variação. Demais
    // (o resto, 100% − Reserva) fica só no hover.
    const indicadorProporcaoReserva = el('indicadorProporcaoReserva');
    indicadorProporcaoReserva.innerHTML = proporcaoReserva.total > TOLERANCIA_FINANCEIRA
        ? `Gastos ${valorIndicador(pct1(proporcaoReserva.percentualReserva), classeIndicadorProporcaoReserva(proporcaoReserva))} <span class=limiteRotulo>em Reserva</span>`
        : `Gastos ${valorIndicador('—')} <span class=limiteRotulo>sem gastos</span>`;
    indicadorProporcaoReserva.title = proporcaoReserva.total > TOLERANCIA_FINANCEIRA
        ? `Reserva ${brl(proporcaoReserva.reserva)} de ${brl(proporcaoReserva.total)} em gastos; demais ${brl(proporcaoReserva.demais)}`
        : 'Sem gastos no ciclo';
    atualizarLinhaVariacao(
        'variacaoProporcaoReserva', variacaoProporcaoReserva, variacaoValorProporcaoReserva,
        'Variação do gasto em Reserva sobre o ciclo anterior'
    );

    const indicadorLiberdade = el('indicadorLiberdade');
    indicadorLiberdade.innerHTML = `Liberdade ${valorIndicador(liberdade.meta > TOLERANCIA_FINANCEIRA ? pct1(liberdade.percentual) : '—')}`;
    indicadorLiberdade.title = liberdade.meta > TOLERANCIA_FINANCEIRA
        ? `${brl(liberdade.patrimonioLivre)} de ${brl(liberdade.meta)}; média ${brl(liberdade.gastoMensal)}/mês em ${liberdade.mesesObservados} ciclos; retirada de 3,5% ao ano`
        : 'Sem gastos suficientes para calcular a meta';
}

function dadosDoGraficoCiclo(idxPeriodo) {
    const periodo = Estado.ciclos[idxPeriodo];
    const visiveis = Estado.lancamentos;
    const doPeriodo = visiveis.filter(r =>
        r.periodoIdx == idxPeriodo && !r.cred && !ehTransferenciaFatura(r));


    const ajuste = ajusteDoCiclo(idxPeriodo);
    const linhas = [
        ...doPeriodo,
        ajuste ? { categ: ajuste.categ, v: ajuste.v } : null,
    ].filter(Boolean);

    const renda = linhas.filter(r => r.v > 0).reduce((s, r) => s + r.v, 0);
    const gastos = [];
    const categorias = new Set();
    const categoriasCompartilhadas = new Set();
    linhas.filter(r => r.v < 0).forEach(r => {
        const daLinha = categoriasSeparadas(r.categ);
        // Reserva é uma classificação da meta própria (bit `reserva`, não mais texto em
        // categ — ver migration 22), não uma fatia de gastos: um lançamento só-Reserva
        // (sem nenhuma outra categoria) não cria fatia nenhuma. Quando Reserva coexistir
        // com outra categoria, a outra já recebe o lançamento inteiro — categ não carrega
        // mais o token "Reserva" pra precisar filtrar daqui.
        if (!daLinha.length && r.reserva) return;
        const categoriasDaLinha = daLinha.length ? daLinha : [textoOuTraco(r.categ)];
        if (!categoriasDaLinha.length) return;
        categoriasDaLinha.forEach(c => categorias.add(c));
        if (categoriasDaLinha.length > 1) categoriasDaLinha.forEach(c => categoriasCompartilhadas.add(c));
        gastos.push({ categorias: categoriasDaLinha, valor: -r.v, linha: r });
    });
    return { periodo, renda, gastos, categorias: [...categorias], categoriasCompartilhadas };
}

// Fatias muito pequenas não ajudam a leitura da pizza. O corte ocorre depois do seletor,
// para que isolar uma categoria pequena continue possível e nunca descarte dados financeiros.
function categoriasMinimasDaPizza(porCategoria) {
    const total = Object.values(porCategoria).reduce((soma, valor) => soma + valor, 0);
    const categorias = Object.keys(porCategoria).filter(c =>
        total > 0 && porCategoria[c] / total * 100 >= PERCENTUAL_MINIMO_PIZZA);
    return { total, categorias };
}

// A fatia pode agrupar vários lançamentos. Preservar as linhas permite abrir o detalhe sem
// recalcular a regra de seleção e sem correr o risco de mostrar um lançamento excluído.
function agruparGastosDaPizza(gastos, excluidas) {
    const porCategoria = {};
    const linhasPorCategoria = {};
    gastos.forEach(({ categorias, valor, linha }) => {
        const selecionadas = categorias.filter(c => !excluidas.includes(c));
        if (!selecionadas.length) return;
        const legenda = selecionadas.join(', ');
        porCategoria[legenda] = (porCategoria[legenda] || 0) + valor;
        (linhasPorCategoria[legenda] = linhasPorCategoria[legenda] || []).push(linha);
    });
    return { porCategoria, linhasPorCategoria };
}

// clique numa celula da matriz Comparar (categoria x periodo): abre o detalhamento dos
// lancamentos individuais (nome + valor) que somam aquele total. Estado._detalheComparar.
// matriz e' preenchido em vComp() a cada redesenho; Estado._detalheAtual guarda as linhas
// e a ordenacao ativa do modal aberto, pra sortDetalheCel() poder reordenar sem reabrir.
window.abrirDetalheCelComparar = (categoria, periodoIdx) => {
    const info = Estado._detalheComparar;
    if (!info) return;
    const linhas = info.matriz[categoria + '||' + periodoIdx] || [];

    Estado._detalheAtual = { categoria, periodoIdx, linhas, ord: { k: 'data', d: 2 } };   // padrao: mais recente primeiro
    renderizaDetalheCel();
    el('modalDetalheCel').showModal();
};

// redesenha a mini-tabela do modal de detalhamento com a ordenacao atual de Estado._detalheAtual.ord
function renderizaDetalheCel() {
    const info = Estado._detalheAtual;
    if (!info) return;
    const { categoria, periodoIdx, linhas, ord } = info;
    const periodo = Estado.ciclos[periodoIdx];

    el('tituloDetalheCel').textContent = categoria;
    el('subDetalheCel').textContent =
        `${nomePeriodo(periodo)} · ${linhas.length} ${linhas.length == 1 ? 'lançamento' : 'lançamentos'}`;

    const seta = k => ord.k == k ? (ord.d == 1 ? ' <span class=ar>↑</span>' : ' <span class=ar>↓</span>') : '';
    const valorOrd = { data: r => timestamp(r.data), nome: r => semAcento(r.nome ?? ''), valor: r => r.v };
    const ordenadas = [...linhas].sort((a, b) => {
        const A = valorOrd[ord.k](a), B = valorOrd[ord.k](b);
        const cmp = typeof A == 'string' ? A.localeCompare(B, 'pt') : A - B;
        return ord.d == 1 ? cmp : -cmp;
    });

    const total = linhas.reduce((s, r) => s + r.v, 0);
    el('corpoDetalheCel').innerHTML =
        `<table><thead><tr>` +
        `<th onclick="sortDetalheCel('data')">Data${seta('data')}` +
        `<th onclick="sortDetalheCel('nome')">Nome${seta('nome')}` +
        `<th class=n onclick="sortDetalheCel('valor')">Valor${seta('valor')}` +
        `</thead><tbody>` +
        ordenadas.map(r => `<tr><td>${r.data ? dataBR(r.data) : '—'}<td>${celNome(r)}${celValorLancamento(r)}`).join('') +
        `<tr class=tot><td colspan=2>Total${celSoma(total)}</tbody></table>`;
}

// clique no header da mini-tabela do modal: mesma logica de sortComp (1o clique ordena
// desc — mais relevante primeiro — clique de novo alterna asc/desc)
window.sortDetalheCel = k => {
    const ord = Estado._detalheAtual.ord;
    if (ord.k != k) { ord.k = k; ord.d = 2; }
    else ord.d = ord.d == 1 ? 2 : 1;
    renderizaDetalheCel();
};

el('fechaDetalheCel').onclick = () => el('modalDetalheCel').close();
el('modalDetalheCel').addEventListener('click', e => { if (e.target == el('modalDetalheCel')) el('modalDetalheCel').close(); });

window.abrirGraficoGastos = idxPeriodo => {
    const { periodo, renda, categorias, categoriasCompartilhadas } = dadosDoGraficoCiclo(idxPeriodo);
    const todasCategorias = ordenarCategoriasDoGrafico(categorias, categoriasCompartilhadas);
    // Cada abertura parte do padrão (só CATEGORIA_EXCLUIDA_GRAFICO_PADRAO fora, pra mostrar
    // direto o líquido); o recorte anterior serve apenas enquanto este modal estiver aberto e
    // nunca deve surpreender ao clicar novamente no botão Gráfico. A categoria continua
    // reincluível ali mesmo, no seletor — isso só muda o estado inicial.
    excluidasDoGrafico = [CATEGORIA_EXCLUIDA_GRAFICO_PADRAO];

    el('graficoSubtitulo').textContent = `${nomePeriodo(periodo)} · Renda do ciclo: ${brl(renda)}`;
    montaExcluirCatDrop(todasCategorias, categoriasCompartilhadas);
    desenhaGraficoPizza(idxPeriodo);
    el('modalGrafico').showModal();
};

function montaExcluirCatDrop(categorias, categoriasCompartilhadas) {
    const todasIncluidas = categorias.every(c => !excluidasDoGrafico.includes(c));
    el('excluirCatDrop').innerHTML =
        `<button type=button id=excluirCatTudo class=multiSelAll onclick="alternarTodasCategoriasGrafico()">${todasIncluidas ? 'Desmarcar tudo' : 'Selecionar tudo'}</button>` +
        categorias.map(c =>
        `<label><input type=checkbox value="${escapeHtml(c)}" ${excluidasDoGrafico.includes(c) ? '' : 'checked'} onchange="toggleCategoriaGrafico(${escapeHtml(JSON.stringify(c))},this.checked)">${escapeHtml(c)}${categoriasCompartilhadas.has(c) ? '<b class=catCompartilhada title="Classificação compartilhada">*</b>' : ''}</label>`
        ).join('');
    atualizaBotaoExcluirCat();
}
function atualizaBotaoExcluirCat() {
    const n = excluidasDoGrafico.length;
    el('excluirCatBtn').textContent = n == 0 ? 'Nenhuma excluída' : `${n} excluída${n > 1 ? 's' : ''}`;
    const caixas = [...el('excluirCatDrop').querySelectorAll('input[type=checkbox]')];
    const botaoTudo = el('excluirCatTudo');
    if (botaoTudo) botaoTudo.textContent = caixas.every(caixa => caixa.checked) ? 'Desmarcar tudo' : 'Selecionar tudo';
}
// checkbox MARCADO = categoria incluida na pizza; desmarcar exclui
window.toggleCategoriaGrafico = (categoria, incluida) => {
    excluidasDoGrafico = incluida
        ? excluidasDoGrafico.filter(c => c !== categoria)
        : [...excluidasDoGrafico, categoria];
    atualizaBotaoExcluirCat();
    const idxAtual = el('modalGrafico').dataset.periodoIdx;
    desenhaGraficoPizza(+idxAtual);
};
window.alternarTodasCategoriasGrafico = () => {
    const caixas = [...el('excluirCatDrop').querySelectorAll('input[type=checkbox]')];
    const categorias = caixas.map(caixa => caixa.value);
    excluidasDoGrafico = proximaExclusaoDasCategorias(categorias, excluidasDoGrafico);
    const incluidas = categorias.every(c => !excluidasDoGrafico.includes(c));
    caixas.forEach(caixa => { caixa.checked = incluidas; });
    atualizaBotaoExcluirCat();
    desenhaGraficoPizza(+el('modalGrafico').dataset.periodoIdx);
};
el('excluirCatBtn').onclick = () => el('excluirCatDrop').classList.toggle('open');
// Chart.js pode interromper o click do canvas; o pointerdown em captura do modal garante que
// tocar qualquer área fora do seletor feche o dropdown antes de o gráfico tratar o gesto.
el('modalGrafico').addEventListener('pointerdown', e => {
    if (!e.target.closest('#excluirCatWrap')) el('excluirCatDrop').classList.remove('open');
}, true);
document.addEventListener('click', e => {
    if (!e.target.closest('#excluirCatWrap')) el('excluirCatDrop').classList.remove('open');
});

const CORES_PIZZA = [
    '#8B84F5',
    '#35B982',
    '#E06B3C',
    '#D95C86',
    '#4B9BE8',
    '#F0A83A',
    '#79AE3A',
    '#92989D',
    '#C04A4A',
    '#A84F73'
];

function desenhaGraficoPizza(idxPeriodo) {
    el('modalGrafico').dataset.periodoIdx = idxPeriodo;
    const { renda, gastos } = dadosDoGraficoCiclo(idxPeriodo);
    const { porCategoria, linhasPorCategoria } = agruparGastosDaPizza(gastos, excluidasDoGrafico);
    const { total: totalGastosSelecionados, categorias: categoriasMinimas } = categoriasMinimasDaPizza(porCategoria);
    const categorias = categoriasMinimas.sort((a, b) => porCategoria[b] - porCategoria[a]);
    const valores = categorias.map(c => porCategoria[c]);

    el('graficoVazio').hidden = categorias.length > 0;
    el('graficoVazio').textContent = totalGastosSelecionados ? `Sem categorias a partir de ${PERCENTUAL_MINIMO_PIZZA}%.` : 'Sem gastos neste ciclo.';
    el('canvasGraficoGastos').style.display = categorias.length ? 'block' : 'none';
    if (!categorias.length) { if (graficoChart) { graficoChart.destroy(); graficoChart = null } return; }

    const cores = categorias.map((_, i) => CORES_PIZZA[i % CORES_PIZZA.length]);
    if (graficoChart) graficoChart.destroy();
    graficoChart = new Chart(el('canvasGraficoGastos'), {
        type: 'pie',
        data: { labels: categorias, datasets: [{ data: valores, backgroundColor: cores, borderColor: '#FFF', borderWidth: 2 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            // Clicar em uma fatia abre somente os lançamentos que a compõem no recorte atual.
            onClick: (_evento, elementos) => {
                if (!elementos.length) return;
                const categoria = categorias[elementos[0].index];
                abrirDetalheFatiaGrafico(categoria, idxPeriodo, linhasPorCategoria[categoria] || []);
            },
            plugins: {
                legend: { position: isMobile() ? 'bottom' : 'right', labels: { boxWidth: 12, padding: 14 } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = totalGastosSelecionados;
                            const pctRenda = renda ? (ctx.parsed / renda * 100).toFixed(1) : '0.0';
                            const pctGasto = total ? (ctx.parsed / total * 100).toFixed(1) : '0.0';
                            return `${ctx.label}: ${brl(ctx.parsed)} · ${pctGasto}% dos gastos · ${pctRenda}% da renda`;
                        }
                    }
                }
            }
        }
    });
    el('canvasGraficoGastos').style.cursor = 'pointer';
}

function abrirDetalheFatiaGrafico(categoria, idxPeriodo, linhas) {
    Estado._detalheAtual = { categoria, periodoIdx: idxPeriodo, linhas, ord: { k: 'valor', d: 2 } };
    renderizaDetalheCel();
    el('modalDetalheCel').showModal();
}

el('fechaGrafico').onclick = () => el('modalGrafico').close();
el('modalGrafico').addEventListener('click', e => {
    if (e.target == el('modalGrafico')) el('modalGrafico').close();
});

// ===================================================================
// GRÁFICO DE EVOLUÇÃO (Comparar) — ganho x gasto x aportado x resgatado, mês a mês
// ===================================================================
// Regra por período:
//   Ganho     = soma dos positivos, exceto categoria Investimento (nao inclui Resgate
//               real nem o Resgate necessario hipotetico)
//   Aportado  = soma dos negativos DA categoria Investimento (invertido pra positivo),
//               incluindo o Aporte sugerido do ciclo (se houver)
//   Resgatado = soma dos positivos DA categoria Investimento, incluindo o Resgate
//               necessario hipotetico do ciclo (se houver)
//   Gasto     = soma dos negativos, exceto categoria Investimento (nao inclui Aporte
//               real nem o Aporte sugerido hipotetico)
let graficoEvolucaoChart = null;

function dadosEvolucao(de, ate) {
    const periodosUsados = [];
    for (let i = de; i <= ate; i++) if (Estado.ciclos[i]) periodosUsados.push(i);

    const { base, abat } = baseEAbatFiltrados();

    const porPeriodo = periodosUsados.map(i => {
        // compras no CREDITO nao entram uma a uma: o que sai da conta no mes e' a fatura
        // LIQUIDA (bruto + antecipacao ja paga), a mesma linha sintetica que o bloco Debito
        // da visao Ciclo mostra. Somar o bruto de cada compra inflava o Gasto pela
        // antecipacao — ex: R$5.008,42 em compras que viram R$3.026,14 a pagar.
        //
        // A ANTECIPACAO de fatura entra normalmente (regime de caixa): ela saiu da conta
        // NESTE mes, entao conta como gasto aqui — e a fatura que ela quita ja vem abatida
        // do mesmo valor (alocacaoAntecipacoes), no mes seguinte. Sem dupla contagem: o
        // desembolso aparece uma vez, no mes em que aconteceu. Excluir a antecipacao (como
        // a pizza de categorias faz, onde ela e' transferencia e nao gasto) sumia com o
        // dinheiro do grafico — nem no mes do pagamento nem no da fatura.
        const linhas = base.filter(r => r.periodoIdx == i && !r.cred);
        const investimento = linhas.filter(r => r.inv);
        const resto = linhas.filter(r => !r.inv);

        // guarda as linhas que compoem cada barra (nao so o total) pra o clique na barra
        // poder abrir o detalhamento item a item — sem isso, uma divergencia entre o
        // grafico e a soma manual do bloco Debito nao tem como ser conferida na tela.
        const linhasDe = {
            Ganho: resto.filter(r => r.v > 0),
            Gasto: resto.filter(r => r.v < 0),
            Resgatado: investimento.filter(r => r.v > 0),
            Aportado: investimento.filter(r => r.v < 0),
        };

        // uma linha por fatura de cartao, liquida de antecipacao (mesmo criterio de vCiclo:
        // fatura ja quitada — liquido ~0 — nao vira linha nenhuma)
        faturasLiquidasDoCiclo(base, abat, i).forEach(f => {
            if (Math.abs(f.liquido) < 0.005) return;
            linhasDe[f.liquido < 0 ? 'Gasto' : 'Ganho'].push({
                data: f.vencimento, nome: `Fatura ${NOME_CARTAO[f.cartao]}`, categ: 'Fatura', v: f.liquido,
            });
        });

        // o Resgate necessario / Aporte sugerido do ciclo entra como uma linha sintetica na
        // barra correspondente, do mesmo jeito que aparece no bloco Debito da visao Ciclo
        const ajuste = ajusteDoCiclo(i);
        if (ajuste) {
            // Pelo sinal, não pelo tipo: o Resgate corrigido pra caber no guardado é negativo.
            linhasDe[ajuste.v > 0 ? 'Resgatado' : 'Aportado'].push({
                // Fechamento provisório no ciclo aberto, nunca a data técnica 31/12/9999.
                data: dataDeFechamentoDoCiclo(Estado.ciclos[i]), nome: ajuste.nome, categ: ajuste.categ, v: ajuste.v,
            });
        }

        const soma = k => linhasDe[k].reduce((s, r) => s + Math.abs(r.v), 0);
        return {
            nome: nomePeriodo(Estado.ciclos[i]), periodoIdx: i, linhasDe,
            ganho: soma('Ganho'), gasto: soma('Gasto'),
            aportado: soma('Aportado'), resgatado: soma('Resgatado'),
        };
    });
    return porPeriodo;
}

window.abrirGraficoEvolucao = (de, ate) => {
    const dados = dadosEvolucao(de, ate);
    desenhaGraficoEvolucao(dados);
    el('modalComparativo').showModal();
};

function desenhaGraficoEvolucao(dados) {
    if (graficoEvolucaoChart) graficoEvolucaoChart.destroy();
    graficoEvolucaoChart = new Chart(el('canvasEvolucao'), {
        type: 'bar',
        data: {
            labels: dados.map(d => d.nome),
            // duas colunas por mes, cada uma empilhando duas barras:
            //   entrada = Ganho (verde) + Resgatado (azul) em cima  -> tudo que entrou na conta
            //   saida   = Gasto (vermelho) + Aportado (laranja) em cima -> tudo que saiu
            // com as duas na mesma altura, o mes fechou equalizado — da' pra ver de relance.
            datasets: [
                { label: 'Ganho', data: dados.map(d => d.ganho), backgroundColor: '#35B982', stack: 'entrada' },
                { label: 'Resgatado', data: dados.map(d => d.resgatado), backgroundColor: '#4C9BE8', stack: 'entrada' },
                { label: 'Gasto', data: dados.map(d => d.gasto), backgroundColor: '#E95F59', stack: 'saida' },
                { label: 'Aportado', data: dados.map(d => d.aportado), backgroundColor: '#F0A83A', stack: 'saida' },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const renda = dados[ctx.dataIndex].ganho;
                            const valor = ctx.parsed.y;
                            // % da renda: so faz sentido pra Gasto e Aportado (Ganho e' a propria renda, sempre 100%)
                            if (ctx.dataset.label == 'Ganho') return `Ganho: ${brl(valor)}`;
                            const pct = renda ? (valor / renda * 100).toFixed(1) : '—';
                            return `${ctx.dataset.label}: ${brl(valor)} · ${pct}% da renda`;
                        }
                    }
                },
            },
            // `stacked` nos dois eixos e' o que faz o `stack` dos datasets valer: sem isso o
            // Chart.js ignora os grupos e desenha as 4 barras lado a lado.
            scales: {
                x: { stacked: true },
                y: { stacked: true, ticks: { callback: v => brl(v) } },
            },
            // clique numa barra abre o detalhamento item a item daquela barra (mesmo modal
            // do clique numa celula da matriz Comparar), pra dar pra conferir de onde vem
            // cada total — e bater com a soma manual do bloco Debito quando divergirem.
            onClick: (_evt, elementos) => {
                if (!elementos.length) return;
                const { datasetIndex, index } = elementos[0];
                const rotulo = graficoEvolucaoChart.data.datasets[datasetIndex].label;
                abrirDetalheBarraEvolucao(dados[index], rotulo);
            },
        },
    });
    el('canvasEvolucao').style.cursor = 'pointer';
}

// detalhamento de uma barra do grafico de evolucao: reaproveita o modal (e a tabela
// ordenavel) do detalhamento de celula da matriz Comparar.
function abrirDetalheBarraEvolucao(dadoDoPeriodo, rotulo) {
    Estado._detalheAtual = {
        categoria: rotulo,
        periodoIdx: dadoDoPeriodo.periodoIdx,
        linhas: dadoDoPeriodo.linhasDe[rotulo] || [],
        ord: { k: 'valor', d: 2 },   // maior primeiro: e' o que ajuda a achar a divergencia
    };
    renderizaDetalheCel();
    el('modalDetalheCel').showModal();
}

el('fechaComparativo').onclick = () => el('modalComparativo').close();
el('modalComparativo').addEventListener('click', e => {
    if (e.target == el('modalComparativo')) el('modalComparativo').close();
});

// ===================================================================
// NOVO LANÇAMENTO (modal de insercao) — otimizado pra cadastro rapido:
// foco automatico, navegacao por Enter, busca de categoria por nome
// parecido, categorias ordenadas por uso recente, modal fica aberto
// apos salvar (pronto pro proximo).
// ===================================================================
