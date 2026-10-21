// Redesenho, seleção, edição e comandos da interface.

// Controlador da interface: comandos, modais, gráficos, formulário e boot.

// Uma chave por cartão; a do Nubank é a de sempre, pra quem já salvou não perder o valor.
const CHAVE_LIMITE_CARTAO_LOCAL = 'fin.limite-cartao';
const chaveLimiteCartaoLocal = cartao => cartao === CARTAO_NUBANK
    ? CHAVE_LIMITE_CARTAO_LOCAL : `${CHAVE_LIMITE_CARTAO_LOCAL}.${cartao}`;

// O limite contratado é uma preferência desta instalação, não um lançamento financeiro.
// Guardá-lo localmente evita criar coluna/configuração no Supabase e mantém o ajuste após
// recarregar; falha de armazenamento nunca pode impedir o uso da tela.
function restaurarLimiteCartaoLocal() {
    CARTOES.forEach(cartao => {
        try {
            const salvo = localStorage.getItem(chaveLimiteCartaoLocal(cartao));
            if (salvo != null) definirLimiteCartao(salvo, cartao);
        } catch { /* Ambiente sem armazenamento local: mantém o padrão do código. */ }
    });
}

function numeroDoLimiteDigitado(texto) {
    const limpo = String(texto || '').trim();
    if (!limpo) return NaN;
    if (limpo.includes(',')) return Number(limpo.replace(/\./g, '').replace(',', '.'));
    // Sem vírgula, "4.000" costuma significar milhar no formato brasileiro; "4000.50"
    // continua sendo aceito como decimal para não surpreender quem digitar com ponto.
    return Number(/^\d{1,3}(?:\.\d{3})+$/.test(limpo) ? limpo.replace(/\./g, '') : limpo);
}


restaurarLimiteCartaoLocal();

// Escolhas por ciclo gravadas na linha do ciclo em fin_ciclo: teto de Besteira/Isabella
// (título do Débito), Aprovado de cada cartão e Garantia do Nubank (título do Crédito). Vão
// pro banco, e não só pro navegador, pra valerem igual em qualquer aparelho (Besteira/
// Isabella ainda mudam o saldo). Campo vazio grava null: Besteira/Isabella voltam ao padrão
// do código; Aprovado/Garantia voltam a herdar do ciclo anterior. Simulação só altera a
// memória, como qualquer outra edição.
function colunaDoCampoDeLimite(input) {
    if (input.dataset.limiteCategoria) return input.dataset.limiteCategoria === 'isabella' ? 'limite_isabella' : 'limite_besteira';
    if (input.dataset.garantiaCartao != null) return 'limite_garantia_nubank';
    return input.dataset.limiteCartao === CARTAO_MERCADO_PAGO ? 'limite_aprovado_mp' : 'limite_aprovado_nubank';
}

async function confirmarLimiteDoCiclo(input) {
    const campo = colunaDoCampoDeLimite(input);
    const cicloId = Estado.ciclos[+input.dataset.ciclo]?.cicloId;
    if (cicloId == null) { mostrarToast('Limite não salvo', 'Ciclo não encontrado.'); desenhar(); return; }
    const texto = input.value.trim();
    const valor = texto ? Math.round(numeroDoLimiteDigitado(texto) * 100) / 100 : null;
    if (valor != null && !(Number.isFinite(valor) && valor >= 0)) {
        mostrarToast('Limite inválido', 'Informe um valor igual ou maior que zero, ou deixe vazio.');
        desenhar();
        return;
    }
    const salvos = Estado.limitesPorCiclo.get(cicloId) || { id: cicloId };
    if ((salvos[campo] ?? null) == valor) { desenhar(); return; }
    input.disabled = true;
    try {
        const gravada = !Estado.simulando ? await salvarLimiteDoCiclo(cicloId, campo, valor) : null;
        Estado.limitesPorCiclo.set(cicloId, gravada || { ...salvos, [campo]: valor });
    } catch (err) {
        mostrarToast('Falhou ao salvar limite', err.message);
    }
    desenhar();
}

// redesenha a tela conforme o modo ativo (blocos Debito/Credito vs matriz de comparacao),
// escondendo/mostrando os filtros que fazem sentido em cada um
// Hoje e Futuro dos títulos (Débito/Crédito) têm os mesmos itens na mesma ordem, mas
// números de largura diferente (R$ 617,32 × R$ 2.043,52) empurravam tudo o que vinha
// depois, desalinhando as duas faixas. Aqui cada item (e cada valor/rótulo dentro dele)
// ganha a largura do maior entre as faixas, então ficam um embaixo do outro. Só alinha
// quando as faixas têm a mesma estrutura; "N registros" (.resumoMeta) e os indicadores
// (só na faixa Hoje do Débito) ficam de fora.
function alinharResumosDosTitulos() {
    // Refeito do zero a cada chamada (inclusive ao redimensionar): larguras da largura
    // anterior da janela não podem forçar quebras erradas na nova.
    el('out').querySelectorAll('.resumoDados [style*="min-width"]').forEach(e => { e.style.minWidth = ''; });
    const igualarLarguras = grupos => grupos.forEach(elementos => {
        const larguras = elementos.map(e => e.getBoundingClientRect().width);
        const largura = Math.max(...larguras);
        // Só mexe em quem é mais estreito: os valores já no tamanho fixo do CSS ficam como estão.
        elementos.forEach((e, i) => { if (larguras[i] < largura - .5) e.style.minWidth = `${largura}px`; });
    });
    const emColunas = listas => listas[0].map((_, i) => listas.map(lista => lista[i]));
    el('out').querySelectorAll('.resumoTitulo').forEach(titulo => {
        const faixas = [...titulo.querySelectorAll(':scope > .resumoLinha > .resumoDados')];
        if (faixas.length < 2) return;
        const celulas = faixas.map(f => [...f.children].filter(c => !c.classList.contains('resumoMeta') && c.id != 'indicadoresFinanceiros'));
        if (celulas.some(c => c.length != celulas[0].length)) return;
        const colunas = emColunas(celulas);
        // Primeiro os valores e rótulos variáveis de dentro de cada item ("Livre"/"Acima"),
        // depois o item inteiro (que cresce junto).
        colunas.forEach(coluna => {
            const valores = coluna.map(c => [...c.querySelectorAll('b, .limiteRotulo')]);
            if (valores.every(v => v.length == valores[0].length)) igualarLarguras(emColunas(valores));
        });
        igualarLarguras(colunas);
    });
    alinharDivisoresDosIndicadores();
}

// Na faixa do Débito, os divisores da linha dos indicadores ficam embaixo dos da linha de
// cima: o 1º de baixo (antes de Gastos) embaixo do 1º de cima (antes de Besteira), o 2º
// embaixo do 2º, e assim por diante. Em cada par, o divisor que ficou pra trás é empurrado:
// o item antes dele ganha a largura que falta — em cima, a coluna inteira (Hoje e Futuro
// juntos, pra não desalinhar as faixas). O divisor de baixo que sobra depois dos pares (antes
// de Liberdade) vai logo depois do último item da linha de cima (fim dele + o vão entre itens);
// se ele já estiver mais à direita, fica onde está. Só vale pra pares na primeira linha de
// cada lado; se esticar fizer algum item descer de linha, desfaz e para (ex.: celular).
function alinharDivisoresDosIndicadores() {
    const indicadores = el('indicadoresFinanceiros');
    const faixa = indicadores.hidden ? null : indicadores.closest('.resumoDados');
    if (!faixa) return;
    const caixa = e => e.getBoundingClientRect();
    const colunasDa = f => [...f.children].filter(c => !c.classList.contains('resumoMeta') && c !== indicadores);
    const faixas = [...faixa.closest('.resumoTitulo').querySelectorAll(':scope > .resumoLinha > .resumoDados')].map(colunasDa);
    const mesmaEstrutura = faixas.every(f => f.length == faixas[0].length);
    const deCima = colunasDa(faixa);
    const itens = [...indicadores.querySelectorAll('.indicadorItem')];
    if (!deCima.length || itens.length < 2) return;
    // Mesma linha: topo a menos de meia altura do primeiro (itens alinhados pela base variam uns px).
    const mesmaLinha = (primeiro, e) => Math.abs(caixa(e).top - caixa(primeiro).top) < caixa(primeiro).height / 2;
    const naPrimeiraLinha = lista => lista.filter(e => mesmaLinha(lista[0], e)).length;
    const contagem = () => [...faixas.map(naPrimeiraLinha), naPrimeiraLinha(itens)].join();
    const temDivisor = e => !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(getComputedStyle(e).borderLeftColor);
    const divisoresDeCima = deCima.filter((e, i) => i > 0 && temDivisor(e) && mesmaLinha(deCima[0], e));
    const ultimoDeCima = deCima.filter(e => mesmaLinha(deCima[0], e)).pop();
    const vao = parseFloat(getComputedStyle(faixa).columnGap) || 0;
    // Onde cada divisor de baixo deve ficar (medido de novo a cada passo, porque esticar anda
    // com o que vem depois) e qual coluna de cima esticar quando é o de baixo que passou.
    const marcas = [
        ...divisoresDeCima.map(e => ({ posicao: () => caixa(e).left, coluna: deCima.indexOf(e) - 1 })),
        { posicao: () => caixa(ultimoDeCima).right + vao, coluna: null },
    ];
    for (let par = 0; par < marcas.length && par + 1 < itens.length; par++) {
        const baixo = itens[par + 1];
        if (!mesmaLinha(itens[0], baixo)) return;
        const { posicao, coluna } = marcas[par];
        const diferenca = posicao() - caixa(baixo).left;
        if (Math.abs(diferenca) < .5 || (diferenca < 0 && coluna == null)) continue;
        const alvos = diferenca > 0 ? [itens[par]]
            : mesmaEstrutura ? faixas.map(f => f[coluna]) : [deCima[coluna]];
        const antes = contagem();
        const larguras = alvos.map(e => caixa(e).width);
        const estilos = alvos.map(e => e.style.minWidth);
        alvos.forEach((e, i) => { e.style.minWidth = `${larguras[i] + Math.abs(diferenca)}px`; });
        if (contagem() != antes) {
            alvos.forEach((e, i) => { e.style.minWidth = estilos[i]; });
            return;
        }
    }
}

// Reserva, Gastos, Comprometido e Liberdade são leituras do ciclo exibido: no ciclo único
// entram no fim da primeira faixa do Débito (Hoje; Passado ou Futuro quando é a única).
// Na comparação não há Débito, então ficam no cabeçalho, lendo o Até. Sem lugar no Débito,
// o #rowVis vazio continua só empurrando os botões pra direita (e some quando desceria
// pra uma linha própria, ver .semIndicadores no CSS).
function encaixarIndicadoresNoDebito(noCicloUnico) {
    const faixa = noCicloUnico && el('out').querySelector('.blk[data-bloco=db] .resumoDados');
    if (faixa) faixa.append(el('indicadoresFinanceiros'));
    el('rowVis').classList.toggle('semIndicadores', !!faixa);
}

// ===================================================================
// SIMULAÇÃO: "ANTES → DEPOIS"
// ===================================================================
// Com a simulação ligada, cada número do título (Saldo, Guardado, Besteira/Isabella, Fatura,
// Usado, Livre…) e dos indicadores que ela mudou ganha o valor real na frente, apagado:
// "71,6% → 83,2%". O real vem do retrato tirado ao ligar a simulação.

// Roda fn com os dados reais no lugar dos simulados. Caches e o que o desenho guarda no
// Estado voltam como estavam, então o desenho de verdade (simulado) não muda em nada.
function comDadosAntesDaSimulacao(fn) {
    const salvo = {
        lancamentos: Estado.lancamentos, limitesPorCiclo: Estado.limitesPorCiclo, metas: Estado.metas,
        cartoesDoCiclo: Estado.cartoesDoCiclo, fechados: { ...Estado.fechados },
        cicloQuitadoRecolhido: Estado.cicloQuitadoRecolhido,
        valorFaturaPorCiclo: { ...Estado.valorFaturaPorCiclo }, linhasVisiveis: { ...Estado.linhasVisiveis },
    };
    Estado.lancamentos = Estado.retratoAntesDaSimulacao.lancamentos;
    Estado.limitesPorCiclo = Estado.retratoAntesDaSimulacao.limitesPorCiclo;
    Estado.metas = Estado.retratoAntesDaSimulacao.metas || Estado.metas;
    limparCachesFinanceiros();
    try {
        return fn();
    } finally {
        Object.assign(Estado, salvo);
        limparCachesFinanceiros();
    }
}

const INDICADORES_COM_VALOR = ['indicadorReserva', 'indicadorProporcaoReserva', 'indicadorComprometido', 'indicadorLiberdade'];
// Os valores em negrito de cada faixa de título (bloco + rótulo da faixa) e de cada indicador.
// Os indicadores encaixados na faixa do Débito ficam fora da faixa: são comparados à parte.
function valoresEmNegrito(raiz) {
    const faixas = new Map([...raiz.querySelectorAll('.blk[data-bloco] .resumoLinha')].map(linha => [
        `${linha.closest('.blk').dataset.bloco}|${linha.querySelector('.resumoRotulo')?.textContent}`,
        [...linha.querySelectorAll('.resumoDados b')].filter(b => !b.closest('#indicadoresFinanceiros')),
    ]));
    const indicadores = new Map(INDICADORES_COM_VALOR.map(id => [id, [...el(id).querySelectorAll('b')]]));
    return { faixas, indicadores };
}
const textosDosValores = raiz => {
    const { faixas, indicadores } = valoresEmNegrito(raiz);
    const textos = mapa => new Map([...mapa].map(([chave, bs]) => [chave, bs.map(b => b.textContent)]));
    return { faixas: textos(faixas), indicadores: textos(indicadores) };
};

// Compara posição a posição (até onde as duas listas vão: a Reserva pode ganhar ou perder a
// data de quando completa) e põe o valor real antes de cada um que mudou.
function marcarAntesDaSimulacao(antes) {
    const marcar = (bs, textos = []) => bs.forEach((b, i) => {
        if (i >= textos.length || b.textContent == textos[i]) return;
        b.insertAdjacentHTML('beforebegin', `<span class=valorAntes title="Sem a simulação">${escapeHtml(textos[i])} →</span> `);
    });
    const { faixas, indicadores } = valoresEmNegrito(el('out'));
    faixas.forEach((bs, chave) => marcar(bs, antes.faixas.get(chave)));
    indicadores.forEach((bs, id) => marcar(bs, antes.indicadores.get(id)));
}

// Ao mudar a largura, o que cabe em cada linha muda: refaz o alinhamento Hoje/Futuro.
let larguraDosResumos = window.innerWidth;
window.addEventListener('resize', () => {
    if (window.innerWidth == larguraDosResumos) return;
    larguraDosResumos = window.innerWidth;
    requestAnimationFrame(alinharResumosDosTitulos);
});
// A fonte da página pode chegar depois do primeiro desenho e mudar as larguras medidas.
document.fonts?.ready.then(() => requestAnimationFrame(alinharResumosDosTitulos));

function desenhar() {
    Estado.redesenhoPendente = false;   // este desenho já mostra os dados (ver desenharQuandoLivre)
    limparCachesFinanceiros();   // recalcula 1x neste render
    const simples = modoSimples();

    el('fciclo').hidden = true;   // #ciclo e' so' a fonte de verdade interna que vCiclo() le, nunca aparece

    // ao nao ter De/Ate escolhidos ainda (1a carga), pre-preenche com o ciclo ATUAL nos
    // dois — abre direto no modo blocos do mes corrente (De=Ate=atual), igual o botao
    // "Atual" faz e igual a visao Ciclo antiga sempre abria
    if (!el('compDe').value && !el('compAte').value && Estado.idxHoje >= 0) {
        el('compDe').value = Estado.idxHoje;
        el('compAte').value = Estado.idxHoje;
    }

    // "modo blocos" (De==Ate, De=Backlog, ou modo simples — a conta restrita sempre
    // navega ciclo a ciclo) delega a tela pra vCiclo() (via vComp()); fora disso e'
    // "modo matriz". So' existe esse UM criterio — a antiga visao "Ciclo"/"Comparar"
    // separada foi removida, unificada dentro do fluxo Comparar (De==Ate cobre
    // exatamente o que a visao Ciclo cobria), e o navegador ‹›Atual tambem saiu — De/Ate
    // ficam sempre visiveis, e Backlog e' so' mais uma opcao do De.
    if (simples && el('compDe').value !== el('compAte').value) {
        // simples troca pro ciclo ATUAL (nunca deixa De != Ate escapar pro modo simples)
        const idx = Estado.idxHoje >= 0 ? Estado.idxHoje : 0;
        el('compDe').value = idx; el('compAte').value = idx;
    }
    const ehBacklog = el('compDe').value == '-1';
    const modoBlocos = ehBacklog || (!!el('compDe').value && el('compDe').value == el('compAte').value);
    // Backlog nao compara com outro periodo — o Ate fica desabilitado e ignorado
    // enquanto o De for Backlog (nao da' pra escolher um Ate junto com Backlog).
    el('compAte').disabled = ehBacklog;
    if (modoBlocos) el('ciclo').value = ehBacklog ? -1 : el('compDe').value;   // vCiclo() le o combo interno
    sincronizarCicloNaUrl();

    // Conta restrita (modo simples) não tem Visualizações, Gráfico,
    // Consolidar tudo nem indicadores — e nenhum fluxo de alteração, nem cadastro nem
    // simulação. Nada disso depende de largura de tela: continua assim em qualquer
    // dispositivo, inclusive desktop.
    el('rowVis').hidden = simples;
    // Gráfico e Visualizações moram na navegação de ciclo (fora de #rowVis): escondem à parte.
    el('btGrafico').hidden = simples;
    el('visIcone').hidden = simples;
    el('btSomenteDif').hidden = simples;   // conta restrita não compara: o botão nem aparece
    popularAlvosVisualizacao();   // reordena do mais perto de acabar pro mais longe a cada redesenho
    el('abreNovo').hidden = simples;
    el('btDiagnostico').hidden = simples;   // diagnóstico de dados é coisa do mantenedor
    // Sem Recarregar na conta restrita: os dados chegam só pela recarga automática de 5 min.
    el('recarregar').hidden = simples;
    el('toggleSimulacao').hidden = simples;
    // Botões dos cartões: a conta restrita não vê Crédito. vCiclo preenche os dados do ciclo
    // exibido; Comparar e Backlog não têm um ciclo de cartão, então ficam desativados.
    Estado.cartoesDoCiclo = null;
    const noBacklog = modoBlocos && +el('ciclo').value < 0;

    // O mesmo botão abre a pizza no ciclo único e a evolução na comparação. Ele permanece
    // no lugar e só fica desabilitado quando não existe período válido (Backlog).
    el('btGrafico').dataset.idx = el('ciclo').value;
    el('btGrafico').disabled = simples || (modoBlocos ? noBacklog : !el('compDe').value || !el('compAte').value);
    // Reserva e Comprometido são leituras do ciclo final (Até), inclusive quando há
    // comparação. No Backlog e no modo simples não há uma referência financeira válida.
    const temCicloParaIndicadores = !simples && !noBacklog && !!el('compAte').value;
    // O nó dos indicadores é sempre o mesmo (atualizarIndicadoresFinanceiros escreve pelos ids): volta pro
    // cabeçalho antes de #out ser reescrito, senão iria embora junto com o HTML antigo.
    el('acoesAcompanhamento').append(el('indicadoresFinanceiros'));
    // Simulação: os mesmos números com os dados reais, pra marcar "antes →" no que mudou.
    // Vem antes dos indicadores de verdade, que sobrescrevem os textos calculados aqui.
    const antesDaSimulacao = Estado.simulando && Estado.retratoAntesDaSimulacao && !simples
        ? comDadosAntesDaSimulacao(() => {
            if (temCicloParaIndicadores) atualizarIndicadoresFinanceiros(+el('compAte').value);
            const raiz = document.createElement('div');
            if (modoBlocos) raiz.innerHTML = vCiclo();
            return textosDosValores(raiz);
        })
        : null;
    el('indicadoresFinanceiros').hidden = !temCicloParaIndicadores;
    if (temCicloParaIndicadores) atualizarIndicadoresFinanceiros(+el('compAte').value);

    // fade suave SO' quando muda de modo (blocos <-> matriz) — nao em todo redesenho
    // (ex: digitar num filtro de texto), senao a tela piscaria a cada tecla
    const trocouModo = Estado._modoBlocosAnterior != null && Estado._modoBlocosAnterior != modoBlocos;
    Estado._modoBlocosAnterior = modoBlocos;
    // #out.innerHTML e' reescrito do zero a cada desenhar() (ex: a cada linha marcada
    // no shift-click) — sem isso, o scroll INTERNO de cada tabela (.wx/.wrap tem
    // overflow:auto proprio) e' perdido a cada redesenho, dando a impressao de que a
    // tabela "reseta" a visao no meio de um shift-click. Guarda a posicao de cada
    // container rolavel (por indice — o mesmo modo gera os mesmos blocos, na mesma
    // ordem, entre um redesenho e outro) e restaura depois, exceto ao trocar de modo
    // de verdade (blocos <-> matriz), onde nao ha posicao antiga que faca sentido.
    const scrollsAntigos = [...el('out').querySelectorAll('.wx, .wrap')].map(e => [e.scrollTop, e.scrollLeft]);
    el('out').innerHTML = modoBlocos ? vCiclo() : vComp();
    encaixarIndicadoresNoDebito(temCicloParaIndicadores && modoBlocos);
    if (antesDaSimulacao) marcarAntesDaSimulacao(antesDaSimulacao);
    alinharResumosDosTitulos();
    atualizarCartoes();
    atualizarMetas();
    if (!trocouModo) {
        [...el('out').querySelectorAll('.wx, .wrap')].forEach((e, i) => {
            if (!scrollsAntigos[i]) return;
            [e.scrollTop, e.scrollLeft] = scrollsAntigos[i];
        });
    }
    // Ícone Todas/Diferentes: sempre visível (desativado fora da comparação), pra quem vê
    // saber que o filtro existe e a navegação não pular. "Diferentes" só faz sentido com
    // EXATAMENTE 2 períodos — vComp() deixa isso em Estado._comparacao2Periodos, porque só
    // ali se sabe quantos períodos a matriz de fato usou —; com 3 ou mais fica desabilitado.
    atualizarBotaoSomenteDif(!modoBlocos && !simples && !!el('compDe').value && !!el('compAte').value);
    if (trocouModo) {
        el('out').classList.remove('fadeIn');
        void el('out').offsetWidth;   // forca reflow pra reiniciar a animacao mesmo se ja rodou antes
        el('out').classList.add('fadeIn');
    }
    // limpa a selecao SO' na troca de modo (blocos <-> matriz) — as chaves de selecao de
    // um lado nao existem no outro (linhas reais do Ciclo vs categorias "cp:" do Comparar),
    // mas dentro do MESMO modo a selecao tem que sobreviver a redesenhos normais (trocar
    // filtro, digitar em busca, etc), senao a barra de soma nunca fica de pe' no Comparar.
    if (trocouModo) Estado.selecionados.clear();
    if (typeof atualizaBarraSelecao == 'function') atualizaBarraSelecao();
    if (typeof atualizaBtsNavCiclo == 'function') atualizaBtsNavCiclo();
}

// ===================================================================
// SELEÇÃO DE LINHAS (barra flutuante de soma)
// ===================================================================
function atualizaBarraSelecao() {
    if (!Estado.selecionados.size) { el('selbar').style.display = 'none'; return; }

    // A restrição de "sem ações que alteram dados" é da conta (modoRestrito), não do
    // tamanho da tela — o mobile normal tem as mesmas ações do desktop.
    const restrito = modoRestrito();
    const chaves = [...Estado.selecionados.keys()];
    // Linhas sinteticas nao existem no banco e, por isso, nao podem ser duplicadas nem
    // excluidas. As excecoes de ACAO sao os ajustes "sug:" e "res:": Aporte sugerido
    // e Resgate necessario podem ser materializados como lancamentos reais.
    const ehSintetica = c => PREFIXO_LINHA_SINTETICA.test(c);
    const chaveUnica = chaves.length == 1 ? chaves[0] : null;
    const ehAjusteMaterializavel = !!chaveUnica && /^(sug|res):/.test(chaveUnica);
    const ajusteExistente = ehAjusteMaterializavel
        ? movimentoAporteOuResgateDoCiclo(indiceDoAjuste(chaveUnica))
        : null;
    const chaveUnicaReal = chaveUnica && !ehSintetica(chaveUnica) ? chaveUnica : null;
    // Excluir aceita qualquer quantidade de linhas reais selecionadas, ignorando linhas
    // sintéticas misturadas na mesma seleção (elas não existem no banco e a barra as usa
    // só pra soma). Duplicar continua exigindo exatamente uma linha real.
    const chavesReaisSelecionadas = chaves.filter(c => !ehSintetica(c));

    // uma linha real: a barra e' so pra editar/duplicar. Varias (ou uma sintetica sozinha):
    // e' pra somar e selecionar/limpar. Na conta restrita, a barra nunca oferece ações que
    // alteram dados: fica somente a soma e o botão Limpar. Editar nunca se aplica a um
    // ajuste sintetico (sug:/res:) nem a uma linha de fatura (fat:) — so' lancamento com id
    // de verdade, real ou simulado, que da' pra transformar Debito <-> Credito e escolher
    // a fatura/data sem precisar excluir e recadastrar.
    el('seledit').hidden = restrito || !chaveUnicaReal;
    el('seldup').hidden = restrito || (!chaveUnicaReal && !ehAjusteMaterializavel);
    el('seldup').textContent = ehAjusteMaterializavel
        ? (Estado.simulando ? 'Simular' : (ajusteExistente ? 'Consolidar' : 'Materializar'))
        : 'Duplicar';
    el('seldel').hidden = restrito || !chavesReaisSelecionadas.length;
    el('seldel').textContent = Estado.simulando && chavesReaisSelecionadas.length ? 'Ocultar' : 'Excluir';
    el('selacao').hidden = !restrito && (!!chaveUnicaReal || ehAjusteMaterializavel);

    if (chaveUnica && !restrito) {
        const r = linhaDaChaveSelecao(chaveUnica);
        el('selinfo').innerHTML =
            `<span class=cnt>Selecionado</span>` +
            `<span class="val ${corValor(r?.v || 0)}">${escapeHtml(r?.nome ?? '')}</span>`;
    } else {
        let soma = 0;
        for (const v of Estado.selecionados.values()) soma += v;
        el('selinfo').innerHTML =
            `<span class=cnt>${Estado.selecionados.size} selecionados</span>` +
            `<span class="val ${corSoma(soma)}">${brl(soma)}</span>`;
        el('selacao').textContent = 'Limpar';
    }

    el('selbar').style.display = 'flex';
}
// Resolve tanto lancamentos reais quanto linhas sinteticas que so existem nas tabelas
// renderizadas (ex.: Aporte sugerido). Centralizar isso tambem garante que a barra mostre
// nome/valor dessas linhas em vez de tentar acha-las apenas em Estado.lancamentos.
function linhaDaChaveSelecao(chave) {
    for (const linhas of Object.values(Estado.linhasVisiveis)) {
        const r = linhas.find(x => chaveSelecao(x) === chave);
        if (r) return r;
    }
    return Estado.lancamentos.find(x => String(x.id) === chave) || null;
}

const indiceDoAjuste = chave => {
    const achou = /^(?:sug|res):(\d+)$/.exec(chave || '');
    return achou ? +achou[1] : null;
};

// Uma sugestao so' pode consolidar com um movimento real de Aporte/Resgate do MESMO
// ciclo. Investimentos com outro nome continuam independentes: nunca devem ser alterados
// pela acao de materializar. So' entra linha EM ABERTO (pago = false): um Aporte/Resgate ja
// pago e' dinheiro que de fato se moveu, e a consolidacao (inclusive a automatica de 15 min)
// nunca reescreve o valor dele — com so' movimento pago no ciclo, o ajuste vira uma linha
// nova aberta. Entre as abertas, prefere a da data de fechamento (a que o app cria).
function movimentoAporteOuResgateDoCiclo(idx) {
    const fechamento = dataDeFechamentoDoCiclo(Estado.ciclos[idx]);
    const naDataDoApp = r => dataISO(r.data) === fechamento ? 0 : 1;
    return Estado.lancamentos
        .filter(r => ehLinhaReal(r) && !r.cred && !r.pago && r.inv && r.periodoIdx === idx)
        .filter(r => /^(aporte|resgate)\b/.test(semAcento(String(r.nome || '')).trim()))
        .sort((a, b) => naDataDoApp(a) - naDataDoApp(b) || timestamp(a.data) - timestamp(b.data) || (+a.id - +b.id))[0] || null;
}

function valorArredondado(valor) {
    const resultado = Math.round(valor * 100) / 100;
    return Math.abs(resultado) < 0.005 ? 0 : resultado;
}

// Soma o ajuste ao movimento que ja existe. Sinais iguais acumulam; sinais opostos
// se abatem. Se inverter o sinal, o nome tambem acompanha a direcao que restou.
function consolidarAjusteExistente(existente, valorAjuste) {
    const valor = valorArredondado((existente?.v || 0) + valorAjuste);
    return {
        valor,
        nome: valor < 0 ? 'Aporte' : valor > 0 ? 'Resgate' : (existente?.nome || 'Aporte'),
    };
}

// valor de uma linha a partir da sua chave de selecao (linha real ou fatura sintetica)
function valorDaChave(chave) {
    // Fatura sintetica
    if (chave.startsWith('fat:')) {
        return Estado.valorFaturaPorCiclo[chave] || 0;
    }

    // Procura primeiro nas linhas atualmente renderizadas.
    // Isso inclui Saldo do mês anterior, Resgate necessário
    // e Investimento sugerido, que não existem em Estado.lancamentos.
    const visivel = linhaDaChaveSelecao(chave);
    if (visivel) return visivel._sug != null ? visivel._sug : (visivel.v || 0);

    // Linha real vinda do banco
    const r = Estado.lancamentos.find(x => String(x.id) === chave);
    return r ? (r.v || 0) : 0;
}
function alternarSelecao(chave) {
    if (!chave) return;
    const jaEstava = Estado.selecionados.has(chave);
    if (jaEstava) Estado.selecionados.delete(chave);
    else Estado.selecionados.set(chave, valorDaChave(chave));
    Estado.ultimaClicada = chave;
    desenhar();
}

// shift-click: aplica na linha atual o intervalo entre ela e a ultima linha clicada,
// dentro da MESMA tabela (respeitando a ordem em que as linhas estao na tela agora).
// A ACAO (marcar ou desmarcar) segue o que um clique normal faria na linha atual: se ela
// ja estava marcada, o shift desmarca o intervalo inteiro; senao, marca o intervalo inteiro.
function selecionarIntervalo(idTabela, chave) {
    const linhas = (Estado.linhasVisiveis[idTabela] || []).map(chaveSelecao).filter(Boolean);
    const iAtual = linhas.indexOf(chave);
    const iAncora = linhas.indexOf(Estado.ultimaClicada);
    if (iAtual < 0 || iAncora < 0) { alternarSelecao(chave); return; }
    const desmarcando = Estado.selecionados.has(chave);
    const [ini, fim] = iAncora <= iAtual ? [iAncora, iAtual] : [iAtual, iAncora];
    for (let i = ini; i <= fim; i++) {
        const c = linhas[i];
        if (desmarcando) Estado.selecionados.delete(c);
        else if (!Estado.selecionados.has(c)) Estado.selecionados.set(c, valorDaChave(c));
    }
    Estado.ultimaClicada = chave;
    desenhar();
}

function recolherBloco(idTabela) {
    Estado.fechados[idTabela] = true;
    // Uma seleção não pode sobreviver escondida: o total flutuante deve refletir a tela.
    (Estado.linhasVisiveis[idTabela] || []).map(chaveSelecao).filter(Boolean)
        .forEach(c => Estado.selecionados.delete(c));
    Estado.linhasVisiveis[idTabela] = [];
}

function abrirBlocosFinanceiros() {
    ['db', 'cr'].forEach(idTabela => { Estado.fechados[idTabela] = false; });
}

window.alternarBloco = idTabela => {
    if (Estado.fechados[idTabela]) Estado.fechados[idTabela] = false;
    else recolherBloco(idTabela);
    desenhar();
};

// clique no badge "Pago"/"Aberto" alterna o status na hora, sem selecionar a linha (o
// listener de selecao abaixo esta no MESMO #out — precisa vir ANTES e parar a propagacao,
// senao o clique tambem selecionaria a linha inteira por baixo do badge).
el('out').addEventListener('click', async e => {
    const badge = e.target.closest('[data-tog-pago]');
    if (!badge) return;
    if (modoRestrito()) return;
    // stopPropagation NAO basta aqui: os dois listeners estao no MESMO elemento (#out),
    // entao ambos disparam na mesma fase de bubbling nao importa o que este pare de
    // propagar — precisa de stopImmediatePropagation pra impedir o listener de selecao
    // (registrado logo abaixo, no mesmo #out) de rodar tambem.
    e.stopImmediatePropagation();

    const id = badge.dataset.togPago;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r) return;

    const novoPago = !r.pago;
    let novaData = r.data;

    // So' ao MARCAR como pago (nunca ao desmarcar) de um Débito com vencimento ainda nao
    // chegado: o pagamento aconteceu HOJE, antes do dia que a linha gravou (ex.: a conta de
    // agua paga no inicio do ciclo, com vencimento mais pra frente no mesmo ciclo).
    // Dentro do MESMO ciclo isso e' so' adiantar um pagamento ja disponivel — ajusta a data
    // pra hoje sem perguntar. Fora do ciclo (atual ou outro ja fechado) e' o padrao exato do
    // bug de recorrencia que nasce paga (ver validarLancamentosCarregados em domain.js):
    // pede confirmacao em vez de aplicar direto.
    if (novoPago && !r.cred && r.data) {
        const hoje = hojeISO();
        const dataAtual = dataISO(r.data);
        if (dataAtual !== hoje) {
            const cicloDoLancamento = periodoDoDebito(dataAtual);
            const cicloDeHoje = periodoDoDebito(hoje);
            const mesmoCiclo = cicloDoLancamento >= 0 && cicloDoLancamento === cicloDeHoje;
            if (mesmoCiclo) {
                if (dataAtual > hoje) novaData = hoje;
            } else if (!confirm(`"${r.nome ?? ''}" está datado ${dataBR(dataAtual)}, fora do ciclo atual. Marcar como pago mesmo assim?`)) {
                return;
            }
        }
    }

    badge.classList.toggle('vd', novoPago);
    badge.classList.toggle('vm', !novoPago);
    badge.textContent = novoPago ? 'Pago' : 'Aberto';
    badge.style.opacity = .5;   // feedback imediato enquanto o PATCH esta no ar

    try {
        const campos = { pago: novoPago };
        if (novaData !== r.data) campos.data = novaData;
        if (!Estado.simulando && !r._sim) await atualizarLancamento(r.id, campos);
        r.pago = novoPago;
        if (novaData !== r.data) { r.data = novaData; reclassificaPeriodo(r); }
        desenhar();
    } catch (err) {
        badge.style.opacity = '';
        mostrarToast('Falhou ao atualizar', err.message);
        desenhar();   // redesenha pra garantir que o badge volta a refletir o estado real
    }
});

// clique no badge Reserva/Comprometido/Pra sempre alterna o bit na hora — mesmo esquema do
// togPago acima, só sem a lógica de data (nenhum tem relação com vencimento). Um único
// handler cobre as três colunas: data-tog-flag="reserva:123", "comprometido:123" ou
// "pra_sempre:123".
// Reserva/Comprometido classificam o COMPROMISSO (identificado pelo nome), não só esta
// ocorrência — alternar um propaga pra TODOS os lançamentos com o mesmo nome (mesma
// comparação sem acento/caixa de chaveDaRecorrencia), reais ou simulados.
const ROTULO_FLAG_TOGGLE = { reserva: 'Reserva', comprometido: 'Comprometido', pra_sempre: 'Pra sempre' };
el('out').addEventListener('click', async e => {
    const badge = e.target.closest('[data-tog-flag]');
    if (!badge) return;
    if (modoRestrito()) return;
    e.stopImmediatePropagation();

    const [campo, id] = badge.dataset.togFlag.split(':');
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r) return;

    const novoValor = !r[campo];
    // O mesmo compromisso = mesmo nome E mesma categoria (sem acento/caixa; a ordem das
    // categorias não importa). Só o nome igual não basta: "Uber" de Transporte e "Uber" de
    // Besteira são coisas diferentes.
    const chaveDoCompromisso = x => `${semAcento(x.nome).trim()}|${categoriasSeparadas(x.categ).map(c => semAcento(c).trim()).sort().join(',')}`;
    const chave = chaveDoCompromisso(r);
    const mesmoNome = Estado.lancamentos.filter(x => !x._sid && chaveDoCompromisso(x) === chave);

    badge.classList.toggle(COR_FLAG[campo], novoValor);
    badge.textContent = novoValor ? ROTULO_FLAG_TOGGLE[campo] : '—';
    badge.style.opacity = .5;   // feedback imediato enquanto o PATCH esta no ar

    try {
        // Um só PATCH (id=in.(...)) pra todas as linhas reais: tudo ou nada, sem metade do
        // compromisso marcada se a rede cair no meio. A simulação é lida uma vez, antes de
        // gravar — ligá-la durante o PATCH não pode deixar parte gravada e parte só na memória.
        const simulando = Estado.simulando;
        const reais = simulando ? [] : mesmoNome.filter(linha => !linha._sim);
        if (reais.length) await atualizarLancamentos(reais.map(linha => linha.id), { [campo]: novoValor });
        mesmoNome.forEach(linha => { linha[campo] = novoValor; });
        desenhar();
        if (mesmoNome.length > 1) {
            mostrarToast('Atualizado', `${ROTULO_FLAG_TOGGLE[campo]} ${novoValor ? 'marcado' : 'desmarcado'} em ${mesmoNome.length} lançamentos "${r.nome}".`);
        }
    } catch (err) {
        badge.style.opacity = '';
        mostrarToast('Falhou ao atualizar', err.message);
        desenhar();
    }
});

// Clique no nome Besteira/Isabella do título do Débito: liga o filtro daquele teto nas
// tabelas Débito e Crédito (passaFiltroTeto em tables.js); clicar de novo desliga, e clicar
// no outro troca. Só lê, então vale também na simulação. Ao ligar, reabre os dois blocos,
// senão um bloco recolhido esconderia justamente o que foi pedido.
el('out').addEventListener('click', e => {
    const botao = e.target.closest('[data-filtro-teto]');
    if (!botao) return;
    e.stopImmediatePropagation();
    const chave = botao.dataset.filtroTeto;
    Estado.filtroTeto = Estado.filtroTeto === chave ? null : chave;
    if (Estado.filtroTeto) { delete Estado.fechados.db; delete Estado.fechados.cr; }
    desenhar();
});

// clique no botao +/- inverte o sinal na hora, sem abrir o campo de valor — mesmo esquema
// do toggle Pago acima (stopImmediatePropagation pra nao vazar pra selecao da linha).
el('out').addEventListener('click', async e => {
    const botao = e.target.closest('[data-tog-sinal]');
    if (!botao) return;
    if (modoRestrito()) return;
    e.stopImmediatePropagation();

    const id = botao.dataset.togSinal;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r) return;

    const novoValor = -(r.v || 0);
    botao.classList.toggle('pos', novoValor >= 0);
    botao.textContent = novoValor < 0 ? '−' : '+';
    botao.disabled = true;   // feedback imediato enquanto o PATCH esta no ar

    try {
        if (!Estado.simulando && !r._sim) await atualizarLancamento(r.id, { valor: novoValor });
        r.valor = novoValor;
        r.v = novoValor;
        desenhar();
    } catch (err) {
        mostrarToast('Falhou ao atualizar', err.message);
        desenhar();   // redesenha pra garantir que o botao volta a refletir o estado real
    }
});

// clique no Valor troca o <span> por um <input> mascarado (mesma mascara do form de
// lancamento), focado e com o texto ja selecionado. Enter ou blur confirma; Escape
// cancela sem salvar. Mesmo esquema do toggle Pago acima: stopImmediatePropagation pra
// nao disparar a selecao da linha por baixo.
el('out').addEventListener('click', e => {
    const span = e.target.closest('[data-tog-valor]');
    if (!span) return;
    if (modoRestrito()) return;
    // ja esta em edicao (input aberto): so' impede o clique de vazar pra selecao de
    // linha por baixo — o proprio <input> cuida do cursor/foco nativamente.
    if (span.classList.contains('editando')) { e.stopImmediatePropagation(); return; }
    e.stopImmediatePropagation();

    const id = span.dataset.togValor;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r) return;

    const bruto = Math.abs(r.v || 0);
    // Mesma regra visual de corValorLancamento/celValorEditavel: so' estritamente POSITIVO
    // mantem o sinal "+"; negativo OU zero (inclusive vindo de valor nulo, ex.: Backlog sem
    // valor ainda) assume negativo — senao digitar um numero num lancamento que a tela ja
    // mostrava "vermelho" entraria como positivo, contradizendo o que acabou de aparecer.
    const negativo = !(valorMonetarioExibivel(r.v) > 0);
    span.classList.add('editando');
    // O sinal não se edita mais por aqui: o clique perdia o foco do input antes do clique
    // no +/− terminar de registrar (blur disparava confirma() com o sinal antigo primeiro),
    // então o toggle nunca pegava. O botão de sinal ao lado (data-tog-sinal) resolve isso
    // de verdade, com PATCH próprio — este campo só edita a magnitude, mantendo o sinal atual.
    // "R$" fixo na frente, dentro da mesma caixa (.dinheiro), como no cadastro e nas metas.
    span.innerHTML = `<span class="inpValor dinheiro"><span class=dinheiroPrefixo aria-hidden=true>R$</span>` +
        `<input type=text inputmode=numeric aria-label="Valor" value="${bruto ? formataMascaraDinheiro(String(Math.round(bruto * 100))) : ''}" placeholder="0,00"></span>`;
    const input = span.querySelector('input');

    input.addEventListener('input', () => {
        const cursorNoFim = input.selectionEnd == input.value.length;
        input.value = formataMascaraDinheiro(input.value);
        if (cursorNoFim) input.setSelectionRange(input.value.length, input.value.length);
    });

    let concluido = false;
    async function confirma() {
        if (concluido) return;
        concluido = true;
        const novoValor = valorMascaraParaNumero(input.value.trim() || '0') * (negativo ? -1 : 1);
        if (novoValor == r.v) { desenhar(); return; }   // nada mudou, so' redesenha (sai do modo edicao)
        input.disabled = true;
        try {
            if (!Estado.simulando && !r._sim) await atualizarLancamento(r.id, { valor: novoValor });
            r.valor = novoValor;
            r.v = novoValor;
            desenhar();
        } catch (err) {
            mostrarToast('Falhou ao atualizar', err.message);
            desenhar();
        }
    }
    function cancela() { concluido = true; desenhar(); }

    input.addEventListener('keydown', ev => {
        if (ev.key == 'Enter') { ev.preventDefault(); confirma(); }
        else if (ev.key == 'Escape') { ev.preventDefault(); cancela(); }
    });
    input.addEventListener('blur', () => confirma());

    input.focus();
    input.select();
});

// Campos de limite (Besteira/Isabella no título do Débito; Aprovado e Garantia no modal de
// cada cartão e, com um cartão só, no título do Crédito): mesma máscara monetária do
// cadastro; Enter ou sair do campo grava a escolha do ciclo (confirmarLimiteDoCiclo), Esc
// desfaz. Os mesmos handlers valem no #out e no modal do cartão, que fica fora dele.
function ligarCamposDeLimite(raiz) {
    const campo = e => e.target.closest('[data-limite-cartao], [data-limite-categoria], [data-garantia-cartao]');
    raiz.addEventListener('input', e => {
        const input = campo(e);
        if (!input) return;
        const cursorNoFim = input.selectionEnd == input.value.length;
        input.value = formataMascaraDinheiro(input.value);
        if (cursorNoFim) input.setSelectionRange(input.value.length, input.value.length);
    });
    raiz.addEventListener('focusin', e => {
        const input = campo(e);
        if (input) input.select();
    });
    raiz.addEventListener('keydown', e => {
        const input = campo(e);
        if (!input) return;
        if (e.key == 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key == 'Escape') { e.preventDefault(); desenhar(); }
    });
    raiz.addEventListener('change', e => {
        const input = campo(e);
        if (input) confirmarLimiteDoCiclo(input);
    });
}
ligarCamposDeLimite(el('out'));
ligarCamposDeLimite(el('modalCartao'));

// Botões Nubank/Mercado Pago do cabeçalho: cada um abre o modal só daquele cartão no ciclo
// exibido (htmlModalCartao em cycle-views.js). A cada redesenho, os botões refletem se há
// dados do cartão e o modal aberto é refeito com os números novos (ex.: depois de gravar
// um Aprovado lá dentro).
const BOTAO_DO_CARTAO = { [CARTAO_NUBANK]: 'btNubank', [CARTAO_MERCADO_PAGO]: 'btMercadoPago' };
function preencherModalCartao() {
    const cartao = el('modalCartao').dataset.cartao;
    el('tituloCartao').textContent = NOME_CARTAO[cartao] || 'Cartão';
    el('corpoCartao').innerHTML = htmlModalCartao(Estado.cartoesDoCiclo, cartao);
}
function atualizarCartoes() {
    const restrito = modoRestrito();
    Object.entries(BOTAO_DO_CARTAO).forEach(([cartao, id]) => {
        el(id).hidden = restrito;
        el(id).disabled = restrito || !Estado.cartoesDoCiclo?.cartoes?.[cartao];
    });
    if (el('modalCartao').open) preencherModalCartao();
}
Object.entries(BOTAO_DO_CARTAO).forEach(([cartao, id]) => {
    el(id).onclick = () => {
        if (el(id).disabled) return;
        el('modalCartao').dataset.cartao = cartao;
        preencherModalCartao();
        el('modalCartao').showModal();
        // Sem botão de fechar, o 1º foco seria o campo Aprovado: no celular abriria o teclado
        // e o Esc só desfaria o campo, em vez de fechar o modal.
        el('modalCartao').focus();
    };
});

// Deslizar no modal do cartão troca de fatura: pra esquerda a seguinte, pra direita a
// anterior. É a mesma navegação do ‹ › do topo (navegaCiclo), então o ciclo da tela anda
// junto e o modal é refeito no redesenho; nunca entra no Backlog (lá não há fatura). Toque e
// mouse por Pointer Events (arrasto de 50px+ mais horizontal que vertical; no mouse, só a
// partir do desenho do cartão, pra não brigar com seleção de texto), trackpad pela rolagem
// horizontal (um passo por gesto) e setas ← → do teclado fora dos campos.
const DISTANCIA_MINIMA_DESLIZE = 50;
function animarCartao(classe) {
    const arte = el('corpoCartao').querySelector('.cartaoArte');
    if (!arte) return;
    arte.classList.add(classe);
    arte.addEventListener('animationend', () => arte.classList.remove(classe), { once: true });
}
function deslizarFatura(direcao) {
    const opcoes = [...el('compDe').options].map(o => o.value).filter(v => v !== '' && v !== '-1');
    const pos = opcoes.indexOf(el('compDe').value);
    if (pos < 0 || !opcoes[pos + direcao]) { animarCartao('cartaoNoLimite'); return; }
    navegaCiclo(direcao);
    animarCartao(direcao > 0 ? 'cartaoVemDaDireita' : 'cartaoVemDaEsquerda');
}
let arrasteCartao = null;
el('modalCartao').addEventListener('pointerdown', e => {
    if (e.target.closest('input, summary, button')) return;
    if (e.pointerType == 'mouse' && !e.target.closest('.cartaoArte')) return;
    arrasteCartao = { x: e.clientX, y: e.clientY };
});
el('modalCartao').addEventListener('pointermove', e => {
    if (!arrasteCartao) return;
    const dx = e.clientX - arrasteCartao.x;
    const arte = el('corpoCartao').querySelector('.cartaoArte');
    // O cartão acompanha o dedo pela metade da distância, pra sentir o arrasto.
    if (arte && Math.abs(dx) > Math.abs(e.clientY - arrasteCartao.y)) arte.style.transform = `translateX(${dx / 2}px)`;
});
const terminarArrasteCartao = e => {
    if (!arrasteCartao) return;
    const dx = e.clientX - arrasteCartao.x, dy = e.clientY - arrasteCartao.y;
    arrasteCartao = null;
    if (Math.abs(dx) >= 10) ultimoArrasteCartao = Date.now();
    const arte = el('corpoCartao').querySelector('.cartaoArte');
    if (arte) arte.style.transform = '';
    if (e.type == 'pointerup' && Math.abs(dx) >= DISTANCIA_MINIMA_DESLIZE && Math.abs(dx) > Math.abs(dy) * 1.5) {
        deslizarFatura(dx < 0 ? 1 : -1);
    }
};
el('modalCartao').addEventListener('pointerup', terminarArrasteCartao);
el('modalCartao').addEventListener('pointercancel', terminarArrasteCartao);
let rolagemHorizontal = 0, rolagemTravadaAte = 0;
el('modalCartao').addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (Date.now() < rolagemTravadaAte) return;
    rolagemHorizontal += e.deltaX;
    if (Math.abs(rolagemHorizontal) < 60) return;
    deslizarFatura(rolagemHorizontal > 0 ? 1 : -1);
    rolagemHorizontal = 0;
    rolagemTravadaAte = Date.now() + 600;   // um gesto do trackpad dispara vários eventos
}, { passive: false });
el('modalCartao').addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key == 'ArrowRight' || e.key == 'ArrowLeft') { e.preventDefault(); deslizarFatura(e.key == 'ArrowRight' ? 1 : -1); }
});
// Um arrasto de mouse que começa no cartão e termina fora dele vira um clique no fundo: não fecha.
let ultimoArrasteCartao = 0;
el('modalCartao').addEventListener('click', e => {
    if (e.target == el('modalCartao') && Date.now() - ultimoArrasteCartao > 300) el('modalCartao').close();
});

// ===================================================================
// METAS (botão do cabeçalho → #modalMetas)
// ===================================================================
// Botão só com a tabela (migration 36) e fora da conta restrita. O modal é refeito a cada
// desenho com ele aberto: um campo salvo redesenha a tela, e o plano de todas as metas muda.
function atualizarMetas() {
    el('btMetas').hidden = !Estado.temMetas || modoRestrito();
    if (el('modalMetas').open) el('corpoMetas').innerHTML = htmlModalMetas(planoDasMetas());
    if (el('modalPlanoMeta').open) {
        const plano = planoDasMetas().find(p => p.meta.id === +el('modalPlanoMeta').dataset.meta);
        if (plano) el('corpoPlanoMeta').innerHTML = htmlDetalheDoPlano(plano);
        else el('modalPlanoMeta').close();   // a meta saiu (excluída ou comprada)
    }
}
el('btMetas').onclick = () => {
    el('corpoMetas').innerHTML = htmlModalMetas(planoDasMetas());
    el('modalMetas').showModal();
    el('modalMetas').focus();   // não abre o teclado do celular num campo
};
el('modalMetas').addEventListener('click', e => {
    if (e.target == el('modalMetas')) el('modalMetas').close();
});
el('modalPlanoMeta').addEventListener('click', e => {
    if (e.target == el('modalPlanoMeta')) el('modalPlanoMeta').close();
});

// Valor de cada campo como vai pro banco. Vazio vira null (mês vazio: a meta fica sem plano)
// e o valor é obrigatório. Devolve undefined quando o texto é inválido.
function valorDoCampoDaMeta(campo, texto) {
    const t = String(texto ?? '').trim();
    if (campo === 'nome') return t || undefined;
    if (campo === 'forma') return t in FORMAS_DA_META ? t : undefined;
    if (campo === 'mes') return t ? (/^\d{4}-\d{2}$/.test(t) ? `${t}-01` : undefined) : null;
    if (campo === 'parcelas') return t ? (/^\d+$/.test(t) && +t >= 1 && +t <= 120 ? +t : undefined) : null;
    if (campo === 'mes_entrada') return t ? (/^\d{4}-\d{2}$/.test(t) ? `${t}-01` : undefined) : null;
    if (!t) return campo === 'valor' ? undefined : null;
    const n = Math.round(numeroDoLimiteDigitado(t) * 100) / 100;
    if (!Number.isFinite(n) || n < 0 || (campo === 'valor' && n <= 0)) return undefined;
    return n;
}

// Grava uma mudança (ou insere/exclui): no banco, ou só na memória durante a simulação, como
// toda edição simulada. A tela recarrega pelo aposGravar; a memória já reflete na hora.
async function gravarMudancaDaMeta(acao, id, campos) {
    try {
        if (Estado.simulando) {
            if (acao === 'inserir') Estado.metas.push({ id: -(++Estado._proxIdSimulado), forma: 'avista', status: 'aberta', mes: null, ...campos });
            if (acao === 'atualizar') Object.assign(Estado.metas.find(m => m.id === id), campos);
            if (acao === 'excluir') Estado.metas = Estado.metas.filter(m => m.id !== id);
        } else if (acao === 'inserir') {
            Estado.metas.push(normalizarMeta(await inserirMeta(campos)));
        } else if (acao === 'atualizar') {
            // Já na memória antes de gravar: um segundo "change" igual no meio do caminho não
            // manda outro PATCH. Falhou, volta ao que era.
            const meta = Estado.metas.find(m => m.id === id);
            const antes = Object.fromEntries(Object.keys(campos).map(k => [k, meta[k]]));
            Object.assign(meta, campos);
            try {
                Object.assign(meta, normalizarMeta(await atualizarMeta(id, campos)));
            } catch (err) {
                Object.assign(meta, antes);
                throw err;
            }
        } else {
            await excluirMeta(id);
            Estado.metas = Estado.metas.filter(m => m.id !== id);
        }
    } catch (err) {
        mostrarToast('Meta não salva', err.message);
    }
    desenhar();
}

const proximoMesISO = () => `${somaMeses(hojeISO(), 1).slice(0, 7)}-01`;
// Valor e entrada: a máscara de caixa eletrônico do cadastro enquanto digita; apagar tudo
// deixa vazio (entrada vazia = sem entrada), nunca "0,00".
el('corpoMetas').addEventListener('input', e => {
    const input = e.target.closest('[data-dinheiro]');
    if (!input) return;
    const cursorNoFim = input.selectionEnd == input.value.length;
    input.value = input.value.replace(/\D/g, '') ? formataMascaraDinheiro(input.value) : '';
    if (cursorNoFim) input.setSelectionRange(input.value.length, input.value.length);
});
el('corpoMetas').addEventListener('change', e => {
    const input = e.target.closest('[data-campo]');
    const linha = e.target.closest('[data-meta]');
    if (!input || !linha) return;
    const id = +linha.dataset.meta;
    const meta = Estado.metas.find(m => m.id === id);
    let campo = input.dataset.campo;
    // Campo de mês: o navegador dispara "change" a cada dígito do ano (0002, 0020, 0202…) e ao
    // apagar pra redigitar. Só grava mês completo, de 2000 em diante; o mês da meta apagado
    // também espera (o da entrada vazio é escolha: volta ao padrão).
    if ((campo === 'mes' || campo === 'mes_entrada') && (input.value ? +input.value.slice(0, 4) < 2000 : campo === 'mes')) return;
    let valor = valorDoCampoDaMeta(campo, input.value);
    if (!meta || valor === undefined) { mostrarToast('Valor inválido', 'Confira o campo e tente de novo.'); desenhar(); return; }
    // Mês da entrada: grava quantos meses antes do mês da meta ela vem; depois do mês da meta
    // não vale. Vazio volta ao padrão (1 mês antes).
    if (campo === 'mes_entrada') {
        const mesMeta = meta.mes;
        const meses = valor && mesMeta ? (+mesMeta.slice(0, 4) - +valor.slice(0, 4)) * 12 + (+mesMeta.slice(5, 7) - +valor.slice(5, 7)) : null;
        if (meses != null && meses < 0) {
            mostrarToast('Mês inválido', `A entrada não pode vir depois ${formaDaMeta(meta) === 'cartao' ? 'da compra' : 'da 1ª parcela'}.`);
            desenhar();
            return;
        }
        campo = 'meses_ate_parcela';
        valor = meses;
    }
    if ((meta[campo] ?? null) === valor) return;
    // Mudar o mês da meta (1ª parcela/compra) ou pôr uma entrada onde não havia leva o mês
    // da entrada pro padrão: 1 mês antes. Mudar o mês da entrada, ou o valor de uma entrada
    // que já existe, mantém o que foi escolhido.
    const campos = { [campo]: valor };
    const voltaEntrada = campo === 'mes' ? meta.entrada > 0 : campo === 'entrada' && valor > 0 && !(meta.entrada > 0);
    if (voltaEntrada && meta.meses_ate_parcela !== 1) campos.meses_ate_parcela = 1;
    gravarMudancaDaMeta('atualizar', id, campos);
});
el('corpoMetas').addEventListener('click', e => {
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    const acao = botao.dataset.acao;
    if (acao === 'novaMeta') return gravarMudancaDaMeta('inserir', null, { nome: 'Nova meta', valor: 1000, mes: proximoMesISO(), forma: 'avista' });
    const id = +botao.closest('[data-meta]').dataset.meta;
    const meta = Estado.metas.find(m => m.id === id);
    if (!meta) return;
    if (acao === 'excluir') {
        if (!confirm(`Excluir "${meta.nome}"?`)) return;
        return gravarMudancaDaMeta('excluir', id);
    }
    if (acao === 'mesAMes') {
        const plano = planoDasMetas().find(p => p.meta.id === id);
        if (!plano) return;
        el('modalPlanoMeta').dataset.meta = id;
        el('corpoPlanoMeta').innerHTML = htmlDetalheDoPlano(plano);
        el('modalPlanoMeta').showModal();
        el('modalPlanoMeta').focus();   // não abre o teclado do celular
        return;
    }
    if (acao === 'comprar') {
        const plano = planoDasMetas().find(p => p.meta.id === id);
        el('modalMetas').close();
        abreCompraDaMeta(meta, plano);
    }
});

// Recalcula em qual ciclo um lancamento cai, com a MESMA regra da carga inicial
// (carregarDados) — mudar a data pode jogar a linha pra outro periodo, ou pro Backlog
// quando a data e' apagada / cai fora de todos os periodos cadastrados. Um Credito sem
// 'data' (ex.: veio do Backlog e ganhou uma fatura na transformacao Debito -> Credito)
// ainda classifica certo pelo vencimento — so' cai no Backlog quando faltam as DUAS coisas.
function reclassificaPeriodo(r) {
    r.periodoIdx = periodoDoLancamento(r);
}

// clique na Data troca o <span> por um <input type=date>. O banco ja guarda 'YYYY-MM-DD',
// que e' exatamente o formato do value/atributo desse input — nao ha conversao nenhuma no
// meio (a tela e' que mostra DD/MM/AAAA, via dataBR). Enter ou escolher no calendario
// confirma; Escape cancela. Mesmo esquema do toggle Pago e do Valor: stopImmediatePropagation
// pra nao disparar a selecao da linha por baixo.
el('out').addEventListener('click', e => {
    const span = e.target.closest('[data-tog-data]');
    if (!span) return;
    if (modoRestrito()) return;
    if (span.classList.contains('editando')) { e.stopImmediatePropagation(); return; }
    e.stopImmediatePropagation();

    const id = span.dataset.togData;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r) return;

    const original = dataISO(r.data);
    span.classList.add('editando');
    span.innerHTML = `<input type=date class=inpData value="${original}">`;
    const input = span.querySelector('input');

    let concluido = false;
    async function confirma() {
        if (concluido) return;
        // Digito incompleto (ex.: parou no "0" do dia, que sozinho nao e' um dia valido)
        // deixa o input.value vazio igual a quando o usuario apaga a data de proposito.
        // badInput distingue os dois casos: so' confirma a limpeza quando o campo foi
        // mesmo esvaziado, nunca quando a digitacao so' ficou pela metade.
        if (input.validity && input.validity.badInput) { desenhar(); return; }
        concluido = true;
        const nova = input.value || null;   // apagar a data manda o lancamento pro Backlog
        if ((nova || '') === original) { desenhar(); return; }   // nada mudou, so' sai do modo edicao
        input.disabled = true;
        try {
            if (!Estado.simulando && !r._sim) await atualizarLancamento(r.id, { data: nova });
            r.data = nova;
            reclassificaPeriodo(r);
            desenhar();
        } catch (err) {
            mostrarToast('Falhou ao atualizar', err.message);
            desenhar();
        }
    }
    function cancela() { concluido = true; desenhar(); }

    // O input nativo dispara 'change' assim que o valor fica completo — inclusive no meio
    // da digitacao, pois o dia e' ambiguo com um so digito (ex.: "1" ja e' um valor
    // completo antes do "9" do "19" ser digitado). Por isso o 'change' so agenda a
    // confirmacao; se mais um 'input' chegar logo em seguida (segundo digito do segmento),
    // o agendamento e' cancelado e so' o valor final confirma. Enter e blur continuam
    // confirmando na hora.
    let timerConfirma = null;
    input.addEventListener('input', () => clearTimeout(timerConfirma));
    input.addEventListener('change', () => {
        clearTimeout(timerConfirma);
        timerConfirma = setTimeout(confirma, 450);
    });
    input.addEventListener('keydown', ev => {
        if (ev.key == 'Enter') { ev.preventDefault(); clearTimeout(timerConfirma); confirma(); }
        else if (ev.key == 'Escape') { ev.preventDefault(); clearTimeout(timerConfirma); cancela(); }
    });
    input.addEventListener('blur', () => { clearTimeout(timerConfirma); confirma(); });
    // clique dentro do proprio input (inclusive no icone do calendario) nao pode vazar
    // pro listener de selecao de linha, que esta no mesmo #out
    input.addEventListener('click', ev => ev.stopImmediatePropagation());

    input.focus();
});

// Edição inline das colunas de texto/número/lista (Nome, Categoria, Frequência, Prio, Obs,
// Canal): o clique troca o <span data-tog-…> por um campo; Enter ou sair do campo grava,
// Esc cancela. Um registrador só, porque o ciclo é sempre o mesmo — só mudam o campo, o
// controle e como o texto digitado vira valor. Valor e Data têm regras próprias (sinal,
// confirmação de ciclo) e continuam com handlers à parte.
//   ler(texto, original) → novo valor; undefined cancela sem gravar (entrada inválida).
//   vazioViraNull: grava null em vez de '' (coluna opcional no banco).
function registrarEditorInline({ atributo, campo, original, controle, ler, vazioViraNull = false, lista = false }) {
    el('out').addEventListener('click', e => {
        const span = e.target.closest(`[${atributo}]`);
        if (!span) return;
        if (modoRestrito()) return;
        // stopImmediatePropagation: o clique não pode vazar pra seleção da linha (#out).
        if (span.classList.contains('editando')) { e.stopImmediatePropagation(); return; }
        e.stopImmediatePropagation();

        const id = span.getAttribute(atributo);
        const r = Estado.lancamentos.find(x => String(x.id) == id);
        if (!r) return;

        const anterior = original(r);
        span.classList.add('editando');
        span.innerHTML = controle(anterior);
        const campoEditado = span.querySelector('input, select');

        let concluido = false;
        async function confirma() {
            if (concluido) return;
            concluido = true;
            const novo = ler(campoEditado.value, anterior);
            if (novo === undefined || novo === anterior) { desenhar(); return; }
            const valor = vazioViraNull ? novo || null : novo;
            campoEditado.disabled = true;
            try {
                // Simulação e linha simulada mudam só na memória, nunca no banco.
                if (!Estado.simulando && !r._sim) await atualizarLancamento(r.id, { [campo]: valor });
                r[campo] = valor;
                desenhar();
            } catch (err) {
                mostrarToast('Falhou ao atualizar', err.message);
                desenhar();
            }
        }
        function cancela() { concluido = true; desenhar(); }

        // Lista (select) grava ao escolher; texto/número gravam no Enter.
        if (lista) campoEditado.addEventListener('change', confirma);
        campoEditado.addEventListener('keydown', ev => {
            if (ev.key == 'Enter' && !lista) { ev.preventDefault(); confirma(); }
            else if (ev.key == 'Escape') { ev.preventDefault(); cancela(); }
        });
        campoEditado.addEventListener('blur', () => confirma());
        campoEditado.addEventListener('click', ev => ev.stopImmediatePropagation());

        campoEditado.focus();
        if (!lista) campoEditado.select();
    });
}

const textoDoLancamento = campo => r => String(r[campo] || '');
const aparado = texto => texto.trim();

// Nome é obrigatório: apagar tudo cancela em vez de gravar vazio.
registrarEditorInline({
    atributo: 'data-tog-nome', campo: 'nome', original: textoDoLancamento('nome'),
    controle: original => `<input type=text class=inpNome value="${escapeHtml(original)}">`,
    ler: texto => texto.trim() || undefined,
});

// Mesma lista separada por vírgula do cadastro. A normalização (trim, dedupe, acento/caixa)
// também acontece no PATCH (normalizarCategoriasNoPayload); repetida aqui pra
// Estado.lancamentos não ficar com o texto bruto divergente do que foi persistido.
registrarEditorInline({
    atributo: 'data-tog-categ', campo: 'categ', original: textoDoLancamento('categ'), vazioViraNull: true,
    controle: original => `<input type=text class=inpCateg value="${escapeHtml(original)}" placeholder="Ex.: Casa, Mercado">`,
    ler: texto => normalizaCategorias(texto),
});

// Frequência só aceita o MESMO vocabulário do cadastro (RECORRENCIAS, em shared.js) — nunca
// texto livre, pra não persistir um valor que dataDaOcorrencia não reconheceria depois.
registrarEditorInline({
    atributo: 'data-tog-freq', campo: 'freq', original: textoDoLancamento('freq'), vazioViraNull: true, lista: true,
    controle: original => `<select class=inpFreq>${['', ...Object.keys(RECORRENCIAS)].map(op =>
        `<option value="${escapeHtml(op)}" ${op === original ? 'selected' : ''}>${op || '— Sem recorrência'}</option>`
    ).join('')}</select>`,
    ler: texto => texto,
});

// Prioridade de elevação do Backlog: número livre (1 = mais provável de entrar num ciclo;
// quanto maior, menos chance, ex.: 999). Vazio volta a null; texto inválido cancela.
registrarEditorInline({
    atributo: 'data-tog-prio', campo: 'prio', original: r => r.prio ?? null,
    controle: original => `<input type=number class=inpPrio inputmode=numeric step=1 value="${escapeHtml(original != null ? String(original) : '')}" placeholder="—">`,
    ler: texto => {
        const bruto = texto.trim();
        if (bruto === '') return null;
        const n = Math.trunc(Number(bruto));
        return Number.isFinite(n) ? n : undefined;
    },
});

registrarEditorInline({
    atributo: 'data-tog-obs', campo: 'obs', original: textoDoLancamento('obs'), vazioViraNull: true,
    controle: original => `<input type=text class=inpObs value="${escapeHtml(original)}">`,
    ler: aparado,
});

// Canal aceita qualquer texto; sendo URL http(s), ganha o ícone de abrir link ao lado (ver
// celCanal em tables.js), sem precisar re-clicar pra editar de novo.
registrarEditorInline({
    atributo: 'data-tog-canal', campo: 'canal', original: textoDoLancamento('canal'), vazioViraNull: true,
    controle: original => `<input type=text class=inpCanal value="${escapeHtml(original)}" placeholder="Ex.: https://...">`,
    ler: aparado,
});

// clique no botão de copiar do Canal: copia o texto bruto pra área de transferência — link
// ou chave Pix, tanto faz, não entra em edição nem seleciona a linha (disponível mesmo na
// conta restrita/mobile, já que copiar não altera dado nenhum).
el('out').addEventListener('click', e => {
    const botao = e.target.closest('[data-copiar-canal]');
    if (!botao) return;
    e.stopImmediatePropagation();
    const id = botao.dataset.copiarCanal;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r || !r.canal) return;
    navigator.clipboard.writeText(String(r.canal)).then(
        () => mostrarToast('Copiado', String(r.canal)),
        () => mostrarToast('Falhou ao copiar', 'Tente selecionar e copiar manualmente.'),
    );
});

// clique no botão de corrigir a Data (ver celData em tables.js, _dupCiclo marcado em
// marcaOcorrenciasDuplicadasNoCiclo no cycle-views.js): recorrência caiu 2x no mesmo ciclo
// (ex.: dia 5 perto do fim, a janela do ciclo corta o mês) — move a ocorrência
// mais recente pro 1º dia do PRÓXIMO ciclo, que já existe (senão o botão nem apareceria).
// É um PATCH de verdade, por isso pede confirmação antes, igual ao padrão já usado pro badge
// Pago fora do ciclo.
el('out').addEventListener('click', async e => {
    const botao = e.target.closest('[data-corrige-dup]');
    if (!botao) return;
    e.stopImmediatePropagation();
    if (modoRestrito()) return;
    const id = botao.dataset.corrigeDup;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r || !r._dupCiclo) return;
    const novaData = r._dupCiclo;
    if (!confirm(`"${r.nome ?? ''}" está duplicado neste ciclo. Mover a data de ${dataBR(r.data)} para ${dataBR(novaData)} (1º dia do próximo ciclo)?`)) return;
    botao.disabled = true;
    try {
        if (!Estado.simulando && !r._sim) await atualizarLancamento(r.id, { data: novaData });
        r.data = novaData;
        reclassificaPeriodo(r);
        desenhar();
    } catch (err) {
        botao.disabled = false;
        mostrarToast('Falhou ao atualizar', err.message);
    }
});

el('out').addEventListener('click', e => {
    const linha = e.target.closest('tr[data-sid]');
    if (!linha || !linha.dataset.sid || e.target.closest('th')) return;
    if (e.shiftKey) { const s = getSelection(); if (s) s.removeAllRanges(); }   // limpa a selecao de texto nativa do shift-click
    if (e.shiftKey && !isMobile() && Estado.ultimaClicada) {
        const idTabela = Object.keys(Estado.linhasVisiveis)
            .find(id => (Estado.linhasVisiveis[id] || []).some(r => chaveSelecao(r) === linha.dataset.sid));
        if (idTabela) { selecionarIntervalo(idTabela, linha.dataset.sid); return; }
    }
    alternarSelecao(linha.dataset.sid);
});
el('selacao').onclick = () => { Estado.selecionados.clear(); desenhar(); };
el('ciclo').addEventListener('change', () => { atualizaBarraSelecao(); });
// Intervalo invertido (De > Ate) nao faz sentido: o campo que o usuario ACABOU de
// escolher "ganha", empurrando o outro pra igualar ele — mexeu no De e ficou maior que
// o Ate? o Ate sobe junto. Mexeu no Ate e ficou menor que o De? o De desce junto.
el('compDe').addEventListener('change', () => {
    if (el('compDe').value && el('compDe').value != '-1' && el('compAte').value
        && +el('compDe').value > +el('compAte').value) {
        el('compAte').value = el('compDe').value;
    }
    atualizaBarraSelecao();
});
el('compAte').addEventListener('change', () => {
    if (el('compDe').value && el('compDe').value != '-1' && el('compAte').value
        && +el('compAte').value < +el('compDe').value) {
        el('compDe').value = el('compAte').value;
    }
    atualizaBarraSelecao();
});

el('btGrafico').onclick = () => {
    const de = el('compDe').value;
    const ate = el('compAte').value;
    const modoBlocos = de == '-1' || (!!de && de == ate);
    if (modoBlocos) abrirGraficoGastos(+el('btGrafico').dataset.idx);
    else abrirGraficoEvolucao(+de, +ate);
};
function atualizarBotaoSomenteDif(comparando) {
    const botao = el('btSomenteDif');
    const doisCiclos = comparando && !!Estado._comparacao2Periodos;
    const diferentes = el('somenteDif').value == 'D';
    const rotulo = !doisCiclos ? 'Linhas diferentes: só comparando 2 ciclos'
        : diferentes ? 'Mostrar todas as linhas' : 'Mostrar só as linhas diferentes';
    botao.disabled = !doisCiclos;
    botao.classList.toggle('ativo', doisCiclos && diferentes);
    botao.setAttribute('aria-pressed', String(doisCiclos && diferentes));
    botao.title = rotulo;
    botao.setAttribute('aria-label', rotulo);
}
el('btSomenteDif').onclick = () => {
    el('somenteDif').value = el('somenteDif').value == 'D' ? 'N' : 'D';
    desenhar();
};

// Volta a tela ao estado em que ela abre: ciclo atual (De=Até=hoje) e filtros limpos. Etapa
// do botão Recarregar (bootstrap.js), que antes recarrega do banco. Sem ciclo atual, só limpa
// (limparFiltros deixa De/Até vazios, como a página abriria).
function voltarAoCicloAtualELimpar() {
    limparFiltros();
    if (Estado.idxHoje >= 0) {
        abrirBlocosFinanceiros();
        el('compDe').value = Estado.idxHoje;
        el('compAte').value = Estado.idxHoje;
    }
    desenhar();
}

// ‹ / › navegam pro periodo anterior/seguinte. Anda pelas OPCOES reais do combo #compDe
// (com Backlog como primeira opção), não por
// indice aritmetico — assim respeita os mesmos limites de navegacao sem duplicar a logica.
// Com De==Ate (1 ciclo so', "modo blocos") sempre foi assim: anda 1 a 1, igualando os
// dois (entra direto no modo blocos daquele ciclo). Comparando um INTERVALO (De != Ate,
// ex: 2 meses de distancia) o clique desliza a janela inteira mantendo a MESMA distancia
// entre De e Ate — um passo pra CADA lado (De e Ate andam +1/-1 juntos), nunca pulando
// pelo tamanho do intervalo inteiro, senao "Jan-Mar" viraria "Mai-Jul" de uma vez em vez
// de "Fev-Abr". Backlog nunca entra nesse modo — De='-1' sempre deixa Ate desabilitado
// (ver desenhar()), entao so' chega aqui com os dois periodos reais.
function navegaCiclo(direcao) {
    const opcoes = [...el('compDe').options].map(o => o.value).filter(v => v !== '');
    const deAtual = el('compDe').value || '', ateAtual = el('compAte').value || '';
    const posDeAtual = opcoes.indexOf(deAtual);
    const comparandoIntervalo = deAtual && deAtual !== '-1' && ateAtual && deAtual !== ateAtual;

    if (comparandoIntervalo) {
        const posAteAtual = opcoes.indexOf(ateAtual);
        const novaPosDe = posDeAtual + direcao, novaPosAte = posAteAtual + direcao;
        if (novaPosDe < 1 || novaPosAte >= opcoes.length) return;   // nunca pousa em Backlog nem passa do fim
        el('compDe').value = opcoes[novaPosDe];
        el('compAte').value = opcoes[novaPosAte];
        desenhar();
        return;
    }

    const novaPos = posDeAtual < 0 ? (direcao > 0 ? 0 : -1) : posDeAtual + direcao;
    if (novaPos < 0 || novaPos >= opcoes.length) return;
    const novoValor = opcoes[novaPos];
    // Ciclo anterior ao atual sempre fica aberto e detalhado: a navegação nunca recolhe
    // Débito nem Crédito do histórico, só o toggle manual do usuário faz isso.
    // Ao chegar no ciclo atual ou avançar além dele, os resumos financeiros voltam a abrir.
    if (direcao > 0 && +novoValor >= Estado.idxHoje) abrirBlocosFinanceiros();
    el('compDe').value = novoValor;
    el('compAte').value = novoValor == '-1' ? el('compAte').value : novoValor;
    desenhar();
}
function atualizaBtsNavCiclo() {
    const opcoes = [...el('compDe').options].map(o => o.value).filter(v => v !== '');
    const deAtual = el('compDe').value || '', ateAtual = el('compAte').value || '';
    const posDe = opcoes.indexOf(deAtual);
    const comparandoIntervalo = deAtual && deAtual !== '-1' && ateAtual && deAtual !== ateAtual;

    if (comparandoIntervalo) {
        const posAte = opcoes.indexOf(ateAtual);
        el('cicloAnterior').disabled = posDe <= 1;
        el('cicloProximo').disabled = posAte < 0 || posAte >= opcoes.length - 1;
    } else {
        el('cicloAnterior').disabled = posDe <= 0;
        el('cicloProximo').disabled = posDe < 0 || posDe >= opcoes.length - 1;
    }
}
el('cicloAnterior').onclick = () => navegaCiclo(-1);
el('cicloProximo').onclick = () => navegaCiclo(1);

// qualquer select/checkbox da barra de ferramentas redesenha a tela ao mudar
// O erro de redesenho acontece fora do try de load(); é um problema operacional passageiro,
// então vai para toast, enquanto inconsistências recebidas do banco ficam no modal.
// compDe/compAte moraram em .tool ate virarem parte do slot #navComparar (em .head,
// pra nao dar "tremor" de layout ao trocar Ciclo/Comparar) — por isso entram na
// selecao aqui tambem, senao o "onchange" generico da toolbar nunca os alcança.
document.querySelectorAll('.tool select,.tool input,#navComparar select').forEach(e => e.onchange = () => {
    try { desenhar(); } catch (err) {
        mostrarToast('Não foi possível atualizar a visão', err.message);
    }
});

// ===================================================================
// LIMPAR FILTROS — devolve a tela pro estado em que ela abre
// ===================================================================
// Valor padrao de cada select da toolbar: e' a 1a <option> de cada um no index.html, que e'
// tambem o que o navegador seleciona sozinho na 1a carga. desenhar() ainda pode sobrescrever
// alguns deles conforme o modo (ex: Origem volta pra "Tudo"
// no modo blocos) — o padrao aqui e' so' o ponto de partida, igual na abertura da pagina.
