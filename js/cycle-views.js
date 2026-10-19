// Visões Ciclo e Comparar.

function vCiclo() {
    const i = +el('ciclo').value;

    if (i < 0) {   // Backlog: lancamentos sem data ou fora de qualquer periodo
        const linhas = filtrarLancamentos().filter(r => r.periodoIdx == null);
        // Sem subtítulo: a linha de baixo do título mostra só a quantidade de registros.
        return renderBloco('Backlog', linhas.reduce((s, r) => s + r.v, 0), '', linhas, 'bk', true);
    }

    const periodo = Estado.ciclos[i];
    if (!periodo) return '<p class=empty>Sem ciclos</p>';

    const debitos = filtrarLancamentos().filter(r => r.periodoIdx == i && !r.cred);
    // Recorrência que caiu 2x dentro do MESMO ciclo (ex.: Seguro Residencial dia 5, quando a
    // janela do ciclo atravessa a virada do mês) já tinha o aviso "*" em
    // Comparar; aqui, na própria tabela Débito, marca a ocorrência mais recente das duplicadas
    // com _dupCiclo = data do próximo ciclo, pra exibir a ação de corrigir (ver celData em
    // tables.js e o handler data-corrige-dup em interactions.js). Só se o próximo ciclo já
    // existe (próximo ciclo cadastrado em fin_ciclo) — sem isso não há pra onde mover.
    marcaOcorrenciasDuplicadasNoCiclo(debitos, Estado.ciclos[i + 1]);
    const visiveis = filtrarLancamentos();

    // Uma linha de fatura por cartão (Nubank, Mercado Pago), cada uma no seu vencimento —
    // são dois pagamentos de verdade, em dias diferentes. A fatura da Isabella e' um
    // lancamento comum no bloco Debito, com valor atualizado manualmente, e nunca vira uma
    // linha sintetica aqui. O vencimento vem da fatura escolhida manualmente em cada credito.
    const abatido = alocacaoAntecipacoes(visiveis);
    const linhasFatura = faturasLiquidasDoCiclo(visiveis, abatido, i)
        // fatura quitada nao aparece: nao ha mais nada pra sair da conta
        .filter(f => Math.abs(f.liquido) >= 0.005)
        .map(f => {
            // O Nubank mantém a chave de sempre; o Mercado Pago ganha sufixo próprio (e id
            // próprio na coluna ID, pra as duas faturas não aparecerem com o mesmo -3).
            const sid = f.cartao === CARTAO_NUBANK ? `fat:${i}` : `fat:${i}:${f.cartao}`;
            Estado.valorFaturaPorCiclo[sid] = f.liquido;
            return {
                data: f.vencimento || periodo.fat, nome: `Fatura ${NOME_CARTAO[f.cartao]}`, categ: 'Fatura',
                // Só exibição, nenhum cálculo lê estes campos da linha calculada: fatura é mensal
                // por natureza, fica sempre Aberto (o pagamento real é a antecipação/débito) e é
                // um compromisso do mês, sem data pra acabar (Pra sempre).
                freq: 'Mensal', pago: false, comprometido: true, pra_sempre: true,
                id: f.cartao === CARTAO_NUBANK ? -3 : -4, v: f.liquido, valor: f.liquido, _fat: 1, _sid: sid,
            };
        });

    const simples = modoSimples();
    // saldo que veio do ciclo anterior — positivo ou negativo, entra como uma linha
    // normal no comeco do bloco
    const anterior = saldoDoCiclo(i - 1);
    const linhaAnterior = Math.abs(anterior) > 0.005 && Estado.ciclos[i - 1] &&
        dataISO(Estado.ciclos[i - 1].fat) >= SALDO_DESDE
        ? [{
            data: periodo.ini, nome: 'Saldo do mês anterior', categ: 'Saldo',
            freq: '', id: -1, _sid: `sal:${i}`, v: anterior, valor: anterior, _sal: 1
        }]
        : [];

    const debitosComFatura = [...linhaAnterior, ...debitos, ...linhasFatura];

    const movimentosDoSaldo = [
        ...linhaAnterior,
        ...debitos,
        ...linhasFatura
    ];


    const totalCiclo = movimentosDoSaldo.reduce((s, r) => s + r.v, 0);

    // Resgate necessario / Aporte sugerido: mesma regra usada em todo o app (ajusteInvestimento),
    // aplicada sobre o totalCiclo — que e' o mesmo valor que totalBaseDoCiclo(i) calcularia.
    // Limitado ao que sobra de guardado NO MOMENTO do ajuste: o guardado do ciclo anterior
    // menos os investimentos reais ja lancados dentro deste ciclo (ver
    // guardadoDisponivelNoCiclo) — nao da' pra resgatar dinheiro que um resgate real do
    // proprio mes ja levou.
    const ajuste = dataISO(periodo.fat) >= SALDO_DESDE
        ? ajusteInvestimento(totalCiclo,
            guardadoDisponivelNoCiclo(i, filtrarLancamentos(), guardadoAte(i - 1)))
        : null;

    // _sid namespaced ("res:"/"sug:") pra nao colidir com o id de um lancamento real (ou
    // simulado) que por acaso seja -1/-2/-5 — sem isso, chaveSelecao() (que prefere _sid
    // mas cai pra String(id) quando falta) tratava as duas linhas como a MESMA chave,
    // e o Map de selecao (1 valor por chave) descartava uma delas silenciosamente: a
    // soma da barra flutuante ficava menor que o total do titulo, sem nenhum erro visivel.
    const linhaResgate = ajuste && ajuste.tipo == 'resgate'
        ? [{
            data: dataDeFechamentoDoCiclo(periodo),
            nome: ajuste.nome,
            categ: ajuste.categ,
            freq: '',
            id: -2,
            _sid: `res:${i}`,
            v: ajuste.v,
            valor: ajuste.v,
            _res: 1,
            _resgatouTudo: !!ajuste.resgatouTudo
        }]
        : [];

    const linhaSugestao = ajuste && ajuste.tipo == 'aporte'
        ? [{
            data: dataDeFechamentoDoCiclo(periodo),
            nome: ajuste.nome,
            categ: ajuste.categ,
            freq: '',
            id: -5,
            _sid: `sug:${i}`,
            v: ajuste.v,
            valor: ajuste.v,
            _sug: ajuste.v
        }]
        : [];

    const linhasDebito = [
        ...debitosComFatura,
        ...linhaResgate,
        ...linhaSugestao
    ];
    const guardado = guardadoAte(i);
    const totalDebito = linhasDebito.reduce((s, r) => s + r.v, 0);
    // O título passa a dizer o que já ocorreu hoje, separado da previsão do ciclo. O
    // recorte de hoje não acompanha filtros da tela: ele é um retrato financeiro real.
    // Um ciclo que ainda não começou só tem futuro; repetir o saldo atual nele seria falso.
    // O passado é histórico: mantém apenas esse retrato, sem uma projeção futura redundante.
    const debitoHoje = resumoDebitoPago(Estado.lancamentos);
    const cicloDebitoFuturo = dataISO(periodo.ini) > hojeISO();
    const cicloDebitoPassado = dataISO(periodo.fat) < hojeISO();
    const classeSaldoHoje = corValor(debitoHoje.saldo);
    const classeSaldoFuturo = corSoma(totalDebito);
    // Todo título reserva o mesmo espaço para alerta. Quando há risco, o ícone fica à direita
    // de Débito/Crédito; quando não há, continua invisível sem deslocar os resumos ao lado.
    const alertaTitulo = (classe, visivel, titulo, rotulo) => visivel
        ? `<span class="alertaTitulo ${classe}" role=img title="${titulo}" aria-label="${rotulo}">⚠</span>`
        : `<span class="alertaTitulo ${classe} vazio" aria-hidden=true>⚠</span>`;
    // Esta é uma decisão de layout: se Hoje e Futuro dizem a mesma coisa, a segunda
    // linha não acrescenta informação. A tolerância evita diferença falsa de centavos.
    // A igualdade de valores sozinha não basta: um débito aberto pode compensar outro e
    // zerar a diferença por coincidência, mesmo havendo lançamento ainda por pagar. Por
    // isso também exige nenhum débito real aberto nem fatura do cartão ainda pendente.
    const cicloAtual = i === Estado.idxHoje;
    // Indicadores de limite por categoria (Besteira, Isabella, ...): Débito do próprio
    // ciclo (periodoIdx == i) + Crédito da MESMA prévia que a tabela Crédito já mostra pra
    // esse ciclo (creditosExibidosNoCiclo: fatura de i+1 — ciclo que começa em outubro conta,
    // no Crédito, o que vai entrar na fatura de novembro). Não é pela data da compra nem
    // pelo periodoIdx cru do Crédito. Aparecem no ciclo atual e nos seguintes (onde também
    // se ajusta o teto de cada ciclo), nunca no histórico. Hoje usa só o pago; Futuro usa
    // pago + aberto (o que está planejado gastar). Só lançamentos reais: a linha prevista é
    // justamente o que falta até o teto, então nunca entra nesta conta.
    const linhasDaPreviaNoCiclo = [...debitos, ...creditosExibidosNoCiclo(visiveis, i)].filter(r => !r._prev);
    const tetosDoCiclo = limitesCategoriaDoCiclo(i);
    // A conta restrita não vê os tetos de Besteira/Isabella (pedido do mantenedor). Ciclo
    // passado também mostra os dele, na linha Passado (ver linhaHojeDebito).
    const limitesCategoria = i >= 0 && !modoRestrito() ? [
        { chave: 'besteira', rotulo: 'Besteira', teto: tetosDoCiclo.besteira, ...dadosLimiteCategoriaDoCiclo(linhasDaPreviaNoCiclo, criterioDoTeto('besteira'), tetosDoCiclo.besteira) },
        { chave: 'isabella', rotulo: 'Isabella', teto: tetosDoCiclo.isabella, ...dadosLimiteCategoriaDoCiclo(linhasDaPreviaNoCiclo, criterioDoTeto('isabella'), tetosDoCiclo.isabella) },
    ] : [];
    // Teto editável no próprio indicador, como o Aprovado do cartão: grava na linha âncora
    // do ciclo (ver confirmarLimiteCategoria em interactions.js). A conta restrita nem tem
    // esses indicadores. Largura pelo próprio valor (ver larguraDoCampo no título do Crédito).
    const tetoDoIndicador = limite => {
        const texto = limite.teto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `<span class=limiteCartaoBase>R$ <input class=limiteCartaoEditavel data-limite-categoria="${limite.chave}" data-ciclo="${i}" ` +
        `style="width:${Math.max(4, texto.length + 1)}ch" value="${texto}" placeholder="padrão" inputmode=decimal ` +
        `title="Editar limite de ${limite.rotulo} deste ciclo (vazio volta ao padrão)" aria-label="Limite de ${limite.rotulo} deste ciclo"></span>`;
    };
    // Além do %, quanto ainda dá pra gastar até o teto (ou quanto já passou dele), com o
    // mesmo valor da linha: Hoje usa só o pago; Futuro, pago + aberto. Cada número leva o
    // próprio rótulo DEPOIS dele ("74% Usado · R$ 64,02 Livre de R$ 250,00"): com o rótulo
    // solto entre dois números, "74% · Livre" parecia "74% livre". Acima do teto, o % passa a
    // ser o quanto ultrapassou (127% do teto → "27% Ultrapassado · R$ 13,41 Acima dos R$ 50,00").
    const spansLimitesCategoria = chave => limitesCategoria.map(limite => {
        const cor = corDoLimiteCategoria(limite[chave]);
        const restante = limite.teto - (chave === 'percentualPago' ? limite.valorPago : limite.valorTotal);
        const dentro = restante >= -TOLERANCIA_FINANCEIRA;
        // Sem teto (zero), não há "quanto ultrapassou" em %: só o valor acima aparece.
        const percentual = dentro ? `${Math.round(limite[chave])}%`
            : limite.teto > 0 ? `${Math.max(1, Math.round(limite[chave] - 100))}%` : '—';
        // O nome é um toggle: liga/desliga o filtro do teto nas tabelas (ver passaFiltroTeto
        // em tables.js); o hover continua explicando o que entra no teto.
        const descricao = DESCRICAO_LIMITE_CATEGORIA[limite.chave];
        const ativo = Estado.filtroTeto === limite.chave;
        const dica = `${descricao ? descricao + ' ' : ''}${ativo ? 'Clique para voltar a mostrar tudo.' : 'Clique para mostrar só o que conta neste teto.'}`;
        const rotulo = `<button type=button class="rotuloComDica filtroTeto${ativo ? ' ativo' : ''}" data-filtro-teto="${limite.chave}" ` +
            `aria-pressed="${ativo}" title="${escapeHtml(dica)}" aria-label="Filtrar ${limite.rotulo}">${limite.rotulo}</button>`;
        // Em pedaços que nunca se partem: com a faixa estreita, o item quebra entre eles.
        return `<span class="besteiraIndicador temPedacos"><span class=pedaco>${rotulo} <b class="pct ${cor}">${percentual}</b> ` +
            `<span class=limiteRotulo>${dentro ? 'Usado' : 'Ultrapassado'}</span></span>` +
            `<span class=pedaco>· <b class="${dentro ? cor : 'vm'}">${brl(dentro ? Math.max(0, restante) : -restante)}</b> <span class=limiteRotulo>${dentro ? 'Livre' : 'Acima'}</span></span>` +
            `<span class="pedaco limiteTeto">${dentro ? 'de' : 'dos'} ${tetoDoIndicador(limite)}</span></span>`;
    }).join('');
    const debitoTemPendencia = debitos.some(r => r.pago === false) || linhasFatura.length > 0;
    const resumoDebitoIgual = cicloAtual && !cicloDebitoFuturo && !debitoTemPendencia &&
        Math.abs(debitoHoje.saldo - totalDebito) <= TOLERANCIA_FINANCEIRA &&
        Math.abs(debitoHoje.guardado - guardado) <= TOLERANCIA_FINANCEIRA;
    // A mesma casca de Débito atende ao mobile e ao desktop; só a decisão de exibir
    // Futuro muda quando o desktop também consegue conferir a fatura de Crédito.
    const criaBlocoDebito = exibeFuturo => {
        // Ciclo passado não é "agora": o rótulo e os números mudam juntos. Em vez do
        // retrato ao vivo de hoje (debitoHoje, que é o MESMO valor global pra qualquer
        // ciclo que esteja sendo olhado), mostra o total que aquele ciclo fechou — Saldo
        // e Guardado acumulados até ali, iguais ao que apareceria em Futuro se o ciclo
        // ainda estivesse aberto.
        const saldoExibidoNaLinhaUnica = cicloDebitoPassado ? totalDebito : debitoHoje.saldo;
        const guardadoExibidoNaLinhaUnica = cicloDebitoPassado ? guardado : debitoHoje.guardado;
        const classeSaldoNaLinhaUnica = cicloDebitoPassado ? classeSaldoFuturo : classeSaldoHoje;
        const debitoTemSaldoVermelho = classeSaldoNaLinhaUnica == 'vm' || (exibeFuturo && classeSaldoFuturo == 'vm');
        const alertaTituloDebito = alertaTitulo('alertaSaldo', debitoTemSaldoVermelho,
            'Saldo negativo', 'Saldo negativo após usar o guardado');
        const linhaHojeDebito = cicloDebitoFuturo ? '' :
            `<span class=resumoLinha><span class=resumoRotulo>${cicloDebitoPassado ? 'Passado' : 'Hoje'}</span><span class=resumoDados>` +
            `<span>Saldo <b class="${classeSaldoNaLinhaUnica}">${brl(saldoExibidoNaLinhaUnica)}</b></span>` +
            `<span>Guardado <b class="${corValor(guardadoExibidoNaLinhaUnica)}">${brl(guardadoExibidoNaLinhaUnica)}</b></span>` +
            // Passado é o fechamento do ciclo (como Saldo/Guardado acima): pago + aberto.
            spansLimitesCategoria(cicloDebitoPassado ? 'percentualTotal' : 'percentualPago') + `</span></span>`;
        const linhaFuturoDebito = exibeFuturo ?
            `<span class=resumoLinha><span class=resumoRotulo>Futuro</span><span class=resumoDados>` +
            `<span>Saldo <b class="${classeSaldoFuturo}">${brl(totalDebito)}</b></span>` +
            `<span>Guardado <b class="${corValor(guardado)}">${brl(guardado)}</b></span>` +
            spansLimitesCategoria('percentualTotal') + `</span></span>` : '';
        const resumoDebito = `<span class=resumoTitulo>` + linhaHojeDebito + linhaFuturoDebito + `</span>`;
        return renderBloco(
            `Débito${alertaTituloDebito}`, totalDebito,
            `${periodo.ini ? dataBR(periodo.ini) : 'inicio'} a ${dataBR(dataDeFechamentoDoCiclo(periodo))}`,
            linhasDebito, 'db', true, '', resumoDebito
        );
    };

    // Conta restrita (modoSimples) não exibe Crédito; nela basta comparar as duas linhas
    // do Débito. Não depende de tamanho de tela — mobile normal mostra Crédito como sempre.
    let blocoDebito;
    if (modoSimples()) {
        if (resumoDebitoIgual && Estado.cicloQuitadoRecolhido !== `${i}:db`) {
            recolherBloco('db');
            Estado.cicloQuitadoRecolhido = `${i}:db`;
        } else if (!resumoDebitoIgual) {
            Estado.cicloQuitadoRecolhido = null;
        }
        blocoDebito = criaBlocoDebito(!cicloDebitoPassado && !resumoDebitoIgual);
        if (modoSimples()) return blocoDebito;
    }

    // Só o desktop completo monta a prévia de Crédito do ciclo seguinte e seu total líquido.
    const idxCreditoExibido = i + 1;
    const creditosExibidos = creditosExibidosNoCiclo(visiveis, i);
    const totalCreditoExibido = totalCreditoExibidoAposAntecipacoes(
        creditosExibidos, abatido[idxCreditoExibido] || 0
    );
    // No histórico, pagamento/antecipação não pode apagar a memória da fatura. O título
    // compacto mostra as compras brutas daquela fatura, inclusive as já quitadas.
    const totalCreditoHistorico = creditosExibidos.reduce((soma, r) => soma + r.v, 0);
    const totalTituloCredito = cicloDebitoPassado ? totalCreditoHistorico : totalCreditoExibido;
    // A linha "Hoje" considera só compras confirmadas (`pago = true`) e antecipações já
    // registradas, qualquer que seja a data do lançamento.
    // A prévia de Crédito do ciclo atual continua tendo "Hoje", ainda que sua fatura vença
    // no ciclo seguinte; só a navegação para um ciclo futuro remove essa linha, junto com
    // o retrato atual do Débito.
    const pagosAteHoje = lancamentosPagos(Estado.lancamentos);
    const abatidoAteHoje = alocacaoAntecipacoes(pagosAteHoje);
    const totalCreditoHoje = totalCreditoExibidoAposAntecipacoes(
        creditosExibidosNoCiclo(pagosAteHoje, i), abatidoAteHoje[idxCreditoExibido] || 0
    );
    // Mesmo raciocínio do Débito: uma compra aberta pode coincidir em valor com uma
    // antecipação e zerar a diferença sem que a fatura esteja realmente fechada.
    const creditoTemPendencia = creditosExibidos.some(r => r.pago === false);
    const resumoCreditoIgual = cicloAtual && !cicloDebitoFuturo && !creditoTemPendencia &&
        Math.abs(totalCreditoHoje - totalCreditoExibido) <= TOLERANCIA_FINANCEIRA;
    // Cada bloco é independente: um pode estar igual e recolhido sem esconder a projeção
    // útil do outro. A marca evita recolher de novo depois de o usuário abrir para auditar.
    const blocosResumosIguais = `${resumoDebitoIgual ? 'db' : ''}${resumoCreditoIgual ? 'cr' : ''}`;
    const marcaResumosIguais = blocosResumosIguais ? `${i}:${blocosResumosIguais}` : null;
    if (marcaResumosIguais && Estado.cicloQuitadoRecolhido !== marcaResumosIguais) {
        blocosResumosIguais.split(/(?=cr)/).filter(Boolean).forEach(recolherBloco);
        Estado.cicloQuitadoRecolhido = marcaResumosIguais;
    } else if (!marcaResumosIguais) {
        Estado.cicloQuitadoRecolhido = null;
    }
    const exibeFuturoDebito = !cicloDebitoPassado && !resumoDebitoIgual;
    const exibeFuturoCredito = !cicloDebitoPassado && !resumoCreditoIgual;
    // Limite não segue os filtros da tela: é o retrato de cada cartão real. A mesma
    // alocação de antecipações define quando cada compra confirmada deixa de ocupá-lo.
    // A garantia Nubank usa só aportes/resgates REAIS já pagos (guardadoGarantidoAte): Aporte
    // sugerido ou materializado em aberto faria o limite subir sem que o dinheiro estivesse
    // aplicado na Nubank. O Mercado Pago não tem garantia. Ele só aparece no título depois da
    // 1ª compra nele: antes disso a tela fica exatamente como era com um cartão só.
    // Hoje libera limite só com antecipação JÁ PAGA (mesma base de "pago" do resto de Hoje);
    // as compras continuam todas na alocação, pra antecipação abater a mesma fatura de sempre.
    // Futuro usa todas as antecipações, pagas e abertas, como a fatura exibida.
    const abatidoDoCartao = alocacaoAntecipacoes(Estado.lancamentos);
    const abatidoPagoDoCartao = alocacaoAntecipacoes(Estado.lancamentos.filter(r => !ehTransferenciaFatura(r) || r.pago));
    const guardadoGarantido = guardadoGarantidoAte(Estado.lancamentos, i);
    const cartoesNoTitulo = CARTOES.filter(cartao => cartao === CARTAO_NUBANK ||
        Estado.lancamentos.some(r => r.cred && cartaoDaFatura(r.fatura) === cartao));
    const doCartao = (linhas, cartao) => linhas.filter(r => cartaoDaFatura(r.fatura) === cartao);
    // A prévia é a fatura do próximo ciclo. O Livre futuro parte do teto menos essa fatura
    // inteira (paga e aberta), como se a anterior já tivesse sido quitada; compras
    // confirmadas de faturas posteriores também continuam ocupando o cartão.
    // Aprovado e garantia são os do ciclo (herdados do anterior quando não definidos; ver
    // aprovadoDoCiclo/garantiaDoCiclo em finance.js). A garantia é só a parte escolhida do
    // guardado, nunca acima dele.
    const garantiaNubank = garantiaDoCiclo(i, guardadoGarantido);
    const limitesDosCartoes = cartoesNoTitulo.map(cartao => {
        const garantidoDoCartao = cartao === CARTAO_NUBANK ? garantiaNubank.efetiva : 0;
        const aprovado = aprovadoDoCiclo(i, cartao);
        const abatidoNoCartao = abatimentoDoCartao(abatidoDoCartao, cartao);
        const totalExibidoDoCartao = totalCreditoExibidoAposAntecipacoes(
            doCartao(creditosExibidos, cartao), abatimentoDoCartao(abatido, cartao)[idxCreditoExibido] || 0
        );
        return {
            cartao, aprovado,
            limiteTotal: limiteCartaoTotal(garantidoDoCartao, cartao, aprovado),
            totalHoje: totalCreditoExibidoAposAntecipacoes(
                doCartao(creditosExibidosNoCiclo(pagosAteHoje, i), cartao),
                abatimentoDoCartao(abatidoAteHoje, cartao)[idxCreditoExibido] || 0
            ),
            totalFuturo: totalExibidoDoCartao,
            limiteLivreHoje: limiteCartaoLivre(Estado.lancamentos, abatimentoDoCartao(abatidoPagoDoCartao, cartao), garantidoDoCartao, -Infinity, cartao, aprovado),
            limiteLivreFuturo: limiteCartaoLivreFuturo(
                Estado.lancamentos, abatidoNoCartao, garantidoDoCartao, idxCreditoExibido, totalExibidoDoCartao, cartao, aprovado
            ),
        };
    });
    // Sem escolha (todo o guardado), fora do ciclo atual o valor visível é conservador e só
    // exibe centenas completas; com escolha, mostra exatamente a garantia usada. O teto e o
    // Livre usam sempre a garantia exata, sem perder centavos no cálculo.
    const garantiaExibida = garantiaNubank.escolhida != null || i === Estado.idxHoje
        ? garantiaNubank.efetiva : Math.floor(garantiaNubank.efetiva / 100) * 100;
    const emReais = valor => valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Largura do campo pelo próprio valor (em ch, dígitos tabulares): sem vão até o rótulo ao
    // lado em navegador que não suporta field-sizing. Redesenhar ao sair do campo reajusta.
    const larguraDoCampo = texto => `style="width:${Math.max(4, String(texto).length + 1)}ch"`;
    // O teto e a garantia são contexto do cartão. Só o Livre muda: Hoje retrata o uso real,
    // enquanto Futuro já considera quitada a fatura anterior à prévia.
    // O aviso compara cada gasto líquido com o teto utilizável do próprio cartão, não com o
    // limite livre; basta um cartão estourar. Uma única marca no título indica excesso em
    // Hoje ou Futuro sem deslocar a tabela.
    // O limite é um alerta operacional, então ciclos encerrados não exibem aviso retrospectivo.
    const creditoAcimaLimite = !cicloDebitoPassado && limitesDosCartoes.some(l =>
        Math.abs(l.totalHoje) > l.limiteTotal || (exibeFuturoCredito && l.limiteLivreFuturo < -TOLERANCIA_FINANCEIRA));
    const alertaTituloCredito = alertaTitulo('alertaLimite', creditoAcimaLimite,
        'Acima do limite', 'Gasto acima do limite');
    // Com um cartão só, o nome dele não acrescenta nada; com dois, cada faixa diz de quem é.
    // A classe por cartão dá a cor do nome (ver .limiteCartaoNome em dashboard.css).
    const nomeNoTitulo = cartao => cartoesNoTitulo.length > 1
        ? `<span class="limiteCartaoNome cartao-${cartao}">${NOME_CARTAO[cartao]}</span>` : '';
    // O teto total é somente leitura no "de"; os campos discretos editam o Aprovado de cada
    // cartão e a Garantia do Nubank DESTE ciclo (valem também pros seguintes até outro ciclo
    // definir outro). Gravam na linha âncora do ciclo (ver confirmarLimiteNaAncora em
    // interactions.js); vazio volta a herdar.
    const campoAprovado = l => `<input class=limiteCartaoEditavel data-limite-cartao="${l.cartao}" data-ciclo="${i}" ${larguraDoCampo(emReais(l.aprovado))} ` +
        `value="${emReais(l.aprovado)}" placeholder="0,00" inputmode=decimal title="Limite aprovado ${NOME_CARTAO[l.cartao]} a partir deste ciclo (vazio herda o anterior)" aria-label="Limite aprovado ${NOME_CARTAO[l.cartao]}">`;
    const campoGarantia = () => `<input class=limiteCartaoEditavel data-garantia-cartao data-ciclo="${i}" ${larguraDoCampo(emReais(garantiaExibida))} ` +
        `value="${emReais(garantiaExibida)}" placeholder="todo" inputmode=decimal ` +
        `title="Quanto do guardado (${brl(garantiaNubank.disponivel)}) vira garantia a partir deste ciclo — vazio usa todo o guardado" aria-label="Garantia do Nubank">`;
    // Garantia aparece quando há guardado pra garantir ou uma escolha feita (inclusive zero).
    const mostraGarantia = garantiaNubank.disponivel > TOLERANCIA_FINANCEIRA || garantiaNubank.escolhida != null;
    // Sem garantia (Mercado Pago sempre; Nubank quando ela é zero), o teto É o Aprovado:
    // o próprio campo editável ocupa o lugar do "de", sem repetir o mesmo valor ao lado.
    const tetoSemGarantia = l => Math.abs(l.limiteTotal - l.aprovado) < TOLERANCIA_FINANCEIRA;
    // Usado = teto − Livre: em Hoje, as compras confirmadas que ainda ocupam o cartão; em
    // Futuro, a fatura exibida inteira mais o uso confirmado posterior. Mesma conta do Livre,
    // só mostrada pelo outro lado, pra ver quanto já foi gasto sem fazer a subtração de cabeça.
    // Cada faixa vai em pedaços que nunca se partem (nome; Usado; Livre; "de" teto; Aprovado;
    // Garantido): com a tela estreita, a faixa quebra entre eles, nunca no meio de um valor.
    const pedaco = html => `<span class=pedaco>${html}</span>`;
    // Toda faixa tem os mesmos pedaços — Fatura, Usado, Livre, teto —, mesmo quando Fatura e
    // Usado coincidem: assim Hoje e Futuro sempre têm a mesma estrutura e ficam alinhados
    // coluna a coluna (alinharResumosDosTitulos desiste de faixas com pedaços diferentes).
    const usadoELivre = (nome, usado, livre, teto, fatura) => (nome ? pedaco(nome) : '') +
        pedaco(`<span class=limiteRotulo>Fatura</span> <b class="${corSoma(fatura)}">${brl(Math.abs(fatura))}</b>`) +
        pedaco(`<span class=limiteRotulo>Usado</span> <b class=limiteUsado>${brl(usado)}</b>`) +
        pedaco(`<span class=limiteRotulo>Livre</span> <b class="${corValor(livre)}">${brl(livre)}</b>`) +
        `<span class="pedaco limiteTeto">de ${teto}</span>`;
    // Cada faixa abre pela própria fatura: a de cada cartão e, na faixa Total, a soma das duas.
    // Hoje só com o confirmado e as antecipações já pagas; Futuro com a fatura exibida inteira.
    const FATURA_DA_LINHA = { limiteLivreHoje: 'totalHoje', limiteLivreFuturo: 'totalFuturo' };
    const faturaDoCartao = (l, chaveLivre) => l[FATURA_DA_LINHA[chaveLivre]];
    const faturaTotal = chaveLivre => chaveLivre === 'limiteLivreHoje' ? totalCreditoHoje : totalCreditoExibido;
    const resumoLimiteCartao = (l, chaveLivre) => `<span class="limiteCartao temPedacos">` +
        usadoELivre(nomeNoTitulo(l.cartao), l.limiteTotal - l[chaveLivre], l[chaveLivre],
            tetoSemGarantia(l) ? `<span class=limiteCartaoBase>R$ ${campoAprovado(l)}</span>` : brl(l.limiteTotal),
            faturaDoCartao(l, chaveLivre)) +
        (tetoSemGarantia(l) ? ''
            : pedaco(`<span class=limiteTeto><span class=limiteCartaoBase>R$ ${campoAprovado(l)}<span class=limiteCartaoRotulo>Aprovado</span></span></span>`)) +
        (l.cartao === CARTAO_NUBANK && mostraGarantia ? `<span class="pedaco limiteGarantido">+ R$ ${campoGarantia()} Garantido</span>` : '') +
        `</span>`;
    // Com dois cartões, a primeira faixa soma os dois: quanto ainda dá pra gastar no crédito
    // inteiro e o teto somado (com a garantia do Nubank, como o teto dele).
    const resumoTotalDosCartoes = chaveLivre => {
        if (limitesDosCartoes.length < 2) return '';
        const livre = limitesDosCartoes.reduce((soma, l) => soma + l[chaveLivre], 0);
        const teto = limitesDosCartoes.reduce((soma, l) => soma + l.limiteTotal, 0);
        return `<span class="limiteCartao temPedacos">${usadoELivre('<span class="limiteCartaoNome cartao-total">Total</span>', teto - livre, livre, brl(teto), faturaTotal(chaveLivre))}</span>`;
    };
    // Com dois cartões, o título fica enxuto: a faixa Total completa e, de cada cartão, só a
    // Fatura. Usado, Livre, teto, Aprovado e Garantido de cada um ficam no modal do cartão
    // (botões Nubank/Mercado Pago do cabeçalho). Com um cartão só, a faixa dele é completa.
    const faturaSoDoCartao = (l, chaveLivre) => `<span class="limiteCartao temPedacos">` +
        pedaco(nomeNoTitulo(l.cartao)) +
        pedaco(`<span class=limiteRotulo>Fatura</span> <b class="${corSoma(faturaDoCartao(l, chaveLivre))}">${brl(Math.abs(faturaDoCartao(l, chaveLivre)))}</b>`) +
        `</span>`;
    const resumoLimites = chaveLivre => limitesDosCartoes.length < 2
        ? limitesDosCartoes.map(l => resumoLimiteCartao(l, chaveLivre)).join('')
        : resumoTotalDosCartoes(chaveLivre) + limitesDosCartoes.map(l => faturaSoDoCartao(l, chaveLivre)).join('');

    // Crédito histórico volta ao cabeçalho compacto: só o total da fatura, sem Hoje/Futuro.
    // A fatura não abre mais a linha solta: é o primeiro pedaço de cada faixa (Total ou o único
    // cartão), com rótulo, igual nas duas linhas.
    const temHoje = !(cicloDebitoFuturo || cicloDebitoPassado);
    // Tudo de cada cartão neste ciclo, pro modal aberto pelos botões Nubank/Mercado Pago do
    // cabeçalho (htmlModalCartao): os mesmos números do título, calculados uma vez aqui.
    // Histórico (ciclo passado) e conta restrita não têm modal.
    Estado.cartoesDoCiclo = cicloDebitoPassado || modoRestrito() ? null : {
        nomeCiclo: nomePeriodo(periodo), temHoje,
        cartoes: Object.fromEntries(limitesDosCartoes.map(l => [l.cartao, {
            cartao: l.cartao, nome: NOME_CARTAO[l.cartao],
            vencimento: vencimentoDoCiclo(idxCreditoExibido, l.cartao),
            teto: l.limiteTotal, aprovado: l.aprovado,
            garantido: l.cartao === CARTAO_NUBANK && mostraGarantia ? garantiaNubank.efetiva : null,
            campoAprovado: campoAprovado(l),
            campoGarantia: l.cartao === CARTAO_NUBANK && mostraGarantia ? campoGarantia() : '',
            hoje: {
                fatura: l.totalHoje, usado: l.limiteTotal - l.limiteLivreHoje, livre: l.limiteLivreHoje,
                antecipado: abatimentoDoCartao(abatidoAteHoje, l.cartao)[idxCreditoExibido] || 0,
            },
            futuro: {
                fatura: l.totalFuturo, usado: l.limiteTotal - l.limiteLivreFuturo, livre: l.limiteLivreFuturo,
                antecipado: abatimentoDoCartao(abatido, l.cartao)[idxCreditoExibido] || 0,
            },
            compras: doCartao(creditosExibidos, l.cartao),
        }])),
    };
    const linhaHojeCredito = !temHoje ? '' :
        `<span class=resumoLinha><span class=resumoRotulo>Hoje</span><span class=resumoDados>` +
        resumoLimites('limiteLivreHoje') + `</span></span>`;
    const linhaFuturoCredito = exibeFuturoCredito ?
        `<span class=resumoLinha><span class=resumoRotulo>Futuro</span><span class=resumoDados>` +
        resumoLimites('limiteLivreFuturo') + `</span></span>` : '';
    const resumoCredito = cicloDebitoPassado ? '' :
        `<span class=resumoTitulo>` + linhaHojeCredito + linhaFuturoCredito + `</span>`;

    blocoDebito = criaBlocoDebito(exibeFuturoDebito);

    const blocoCredito = renderBloco(
        `Crédito${alertaTituloCredito}`, totalTituloCredito,
        '',   // Crédito mostra só a contagem de registros, sem as datas das faturas
        creditosExibidos, 'cr', true, '', resumoCredito,
        // Só o título compacto do Crédito histórico não usa ponto entre nome e total.
        cicloDebitoPassado ? ' ' : undefined
    );

    return blocoDebito + blocoCredito;
}

// Visão "Comparar": uma matriz [categoria/nome/etc × periodo], com totais por linha e coluna.
// Reserva é uma marca para a meta própria (bit `reserva`, não mais texto em categ — ver
// migration 22), nunca uma categoria nesta matriz — por isso categ já chega aqui sem ela;
// esta função não precisa mais filtrar nada, só devolve o texto (ou "—" se vazio).
function categoriaDaComparacao(categ) {
    return textoOuTraco(categ);
}

// Estas categorias não são comparáveis: Rendimento é entrada, Reembolso compensa uma despesa,
// Teste é técnica e as demais são recortes que o mantenedor não quer analisar nesta matriz.
// "Presemte" é tolerado como grafia já usada de Presente; ambas ficam fora da comparação.
const CATEGORIAS_EXCLUIDAS_DA_COMPARACAO = [
    'Rendimento', 'Reembolso', 'Teste', 'Alimentação', 'Transporte', 'Besteira',
    'Presente', 'Presemte', 'Saldo',
];

function ehLinhaExcluidaDaComparacao(r) {
    const categoriaEspecial = categoriasSeparadas(r.categ)
        .some(categoria => CATEGORIAS_EXCLUIDAS_DA_COMPARACAO
            .some(excluida => ehCategoria(categoria, excluida)));
    // Reserva sozinha (sem nenhuma outra categoria) sai da matriz; coexistindo com outra,
    // só a outra importa e a linha entra normalmente — mesma regra de antes, agora pelo bit.
    const soReserva = r.reserva && !categoriasSeparadas(r.categ).length;
    return categoriaEspecial || soReserva || ehAntecipacaoFatura(r.categ) || ehAntecipacaoFatura(r.nome);
}

function filtrarLinhasDaComparacao(reais, sinteticas) {
    // A regra vale depois da união para alcançar também Saldo do mês anterior e qualquer
    // outra linha sintética que venha a receber uma categoria excluída no futuro.
    return [...reais, ...sinteticas].filter(r => !ehLinhaExcluidaDaComparacao(r));
}

function chaveDaRecorrencia(r) {
    const nome = semAcento(r.nome).trim();
    const categoria = semAcento(categoriaDaComparacao(r.categ)).trim();
    return `${nome}|${categoria}`;
}

function gruposComRecorrenciaDuplicadaEntreMeses(linhas) {
    // Uma recorrência continua sendo a mesma quando seu valor muda. Nome e categoria
    // identificam o compromisso; o valor é apenas o montante daquela ocorrência.
    // Antecipação/pagamento de fatura é transferência, não recorrência (ver
    // ehTransferenciaFatura em js/shared.js): duas antecipações de verdade no mesmo ciclo,
    // em meses-calendário diferentes, são dois pagamentos distintos por si só — nunca "a
    // mesma conta cortada pela janela do ciclo". Mover a data mudaria quando o dinheiro de
    // verdade saiu da conta, por isso fica fora desta detecção desde a raiz.
    const mesesPorGrupo = {};
    linhas.filter(ehLinhaReal).filter(r => !ehTransferenciaFatura(r)).forEach(r => {
        const grupo = chaveDaRecorrencia(r);
        (mesesPorGrupo[grupo] = mesesPorGrupo[grupo] || new Set()).add(dataISO(r.data).slice(0, 7));
    });
    return new Set(Object.entries(mesesPorGrupo)
        .filter(([, meses]) => meses.size >= 2)
        .map(([grupo]) => grupo));
}

function temRecorrenciaDuplicadaEntreMeses(linhas) {
    return gruposComRecorrenciaDuplicadaEntreMeses(linhas).size > 0;
}

// Dentro de um único ciclo (debitos já filtrados por periodoIdx), marca com _dupCiclo a(s)
// ocorrência(s) MAIS RECENTE(S) de cada recorrência (nome+categoria) que caiu 2x — a mais
// antiga fica como está, só a(s) de depois ganha(m) a ação de corrigir (ver celData em
// tables.js). _dupCiclo guarda a data ISO do 1º dia do PRÓXIMO ciclo, pronta pra virar o
// novo valor de `data` num PATCH (ver handler data-corrige-dup em interactions.js). Sem
// próximo ciclo cadastrado ainda, não marca nada — não há pra onde mover.
function marcaOcorrenciasDuplicadasNoCiclo(debitos, proximoCiclo) {
    debitos.forEach(r => { delete r._dupCiclo; });   // limpa marca de um redesenho anterior
    if (!proximoCiclo) return;
    const grupos = gruposComRecorrenciaDuplicadaEntreMeses(debitos);
    if (!grupos.size) return;
    const porGrupo = {};
    // Segunda barreira, redundante com a de gruposComRecorrenciaDuplicadaEntreMeses de
    // propósito: nenhuma antecipação/pagamento de fatura deve ganhar _dupCiclo, mesmo se
    // seu nome+categoria coincidisse por acaso com outro grupo já marcado como duplicado.
    // r.v <= 0 fica só aqui (não em gruposComRecorrenciaDuplicadaEntreMeses, que o "*" de
    // Comparar também usa): entrada (valor positivo) é recebimento, nunca uma conta
    // recorrente que a janela do ciclo cortou ao meio, então nunca ganha o botão "↷" — mas
    // isso não deve mudar o desconto de falso positivo que Comparar já faz por conta própria.
    // Só linha de SÉRIE (com Frequência ou recorrencia_id) pode ser movida: compra avulsa
    // repetida (Mercado em 15/10 e 03/11 no mesmo ciclo) é gasto de verdade nas duas datas,
    // não uma conta que a janela do ciclo cortou.
    const ehDeSerie = r => !!r.freq || r.recorrencia_id != null;
    debitos.filter(ehLinhaReal).filter(r => !ehTransferenciaFatura(r) && r.v <= 0 && ehDeSerie(r)).forEach(r => {
        const grupo = chaveDaRecorrencia(r);
        if (!grupos.has(grupo)) return;
        (porGrupo[grupo] = porGrupo[grupo] || []).push(r);
    });
    // Move só a ocorrência do OUTRO mês: a mais antiga fixa o mês da série naquele ciclo, e
    // as do mesmo mês dela ficam onde estão.
    Object.values(porGrupo).forEach(linhasDoGrupo => {
        const ordenadas = [...linhasDoGrupo].sort((a, b) => timestamp(a.data) - timestamp(b.data));
        const mesDaPrimeira = dataISO(ordenadas[0].data).slice(0, 7);
        ordenadas.filter(r => dataISO(r.data).slice(0, 7) !== mesDaPrimeira)
            .forEach(r => { r._dupCiclo = proximoCiclo.ini; });
    });
}

function todasRecorrenciasDaMudancaSaoExplicadas(linhasDaMudanca, fontesDuplicadas) {
    const gruposDaMudanca = new Set(linhasDaMudanca.filter(ehLinhaReal).map(chaveDaRecorrencia));
    if (!gruposDaMudanca.size) return false;
    const gruposExplicados = new Set(fontesDuplicadas
        .flatMap(linhas => [...gruposComRecorrenciaDuplicadaEntreMeses(linhas)]));
    return [...gruposDaMudanca].every(grupo => gruposExplicados.has(grupo));
}

// Classifica uma categoria pelos dois ciclos comparados e pelos dois seguintes. Sem os dois
// ciclos futuros não há confirmação suficiente para afirmar começo, fim ou ocorrência única.
function estadoDaComparacaoPorCiclos(presencas, idxPrimeiro, idxSegundo, totalCiclos) {
    if (idxSegundo + 2 >= totalCiclos) return { acabou: false, comecou: false, unico: false };
    const tem = idx => presencas.has(idx);
    const haviaAntes = tem(idxPrimeiro), temAgora = tem(idxSegundo);
    // "Acabou" só vale para algo que vinha recorrendo. Sem presença no ciclo anterior ao
    // primeiro comparado, uma ocorrência isolada não pode virar falsamente um encerramento.
    const vinhaRecorrendo = idxPrimeiro > 0 && tem(idxPrimeiro - 1);
    const continuaDoisCiclos = tem(idxSegundo + 1) && tem(idxSegundo + 2);
    const someDoisCiclos = !tem(idxSegundo + 1) && !tem(idxSegundo + 2);
    return {
        acabou: haviaAntes && vinhaRecorrendo && !temAgora && someDoisCiclos,
        comecou: !haviaAntes && temAgora && continuaDoisCiclos,
        unico: !haviaAntes && temAgora && someDoisCiclos,
    };
}

function vComp() {
    // reseta ANTES de qualquer return antecipado — senao um valor de uma chamada
    // anterior fica "preso" (ex: filtro "Somente Diferentes" continua aparecendo mesmo
    // depois de trocar De/Ate pra um intervalo que nao tem mais 2 periodos)
    Estado._comparacao2Periodos = false;

    const coluna = 'categ';   // Comparar sempre agrupa por Categoria — sem filtro "Agrupar por" na toolbar
    // so mostra a matriz depois que o usuario escolhe De E Ate — nunca vem preenchida sozinha
    const deTexto = el('compDe').value, ateTexto = el('compAte').value;
    if (!deTexto || !ateTexto || deTexto == '-1') return '<p class=empty>Escolha o período (De / Até) para comparar.</p>';

    const de = +deTexto, ate = +ateTexto;
    const dentroDoIntervalo = i => i >= de && i <= ate;

    // rede de seguranca: desenhar() ja decide "modo blocos" (De==Ate) e chama vCiclo()
    // direto nesse caso, entao vComp() normalmente nunca chega aqui com de==ate — mas se
    // for chamada de outro lugar no futuro, continua se comportando corretamente.
    if (de == ate) {
        el('ciclo').value = de;
        return vCiclo();
    }

    const visiveis = filtrarLancamentos();
    // Comparar é uma visão de categorias, não de transferências de caixa: Antecipação Fatura
    // não entra e tampouco precisa de uma linha sintética de abatimento para compensá-la.
    // O rótulo Antecipação Fatura é transferência por regra de negócio, inclusive se algum
    // cadastro legado estiver marcado como crédito. Comparar nunca o trata como gasto.
    const reais = visiveis.filter(r => r.periodoIdx != null);

    // Saldo anterior e ajuste de investimento ainda são as linhas sintéticas financeiras do
    // ciclo; não há abatimento de fatura nesta visão, pois ele não representa categoria real.
    const sinteticas = [];
    Estado.ciclos.forEach((per, idx) => {
        if (!dentroDoIntervalo(idx)) return;
        const anterior = saldoDoCiclo(idx - 1);
        if (Math.abs(anterior) > 0.005 && Estado.ciclos[idx - 1] && dataISO(Estado.ciclos[idx - 1].fat) >= SALDO_DESDE) {
            sinteticas.push({
                nome: 'Saldo do mês anterior', categ: 'Saldo', freq: '', pago: null,
                id: -1, _sid: `sal:${idx}`, data: per.ini, cred: false,
                v: anterior, valor: anterior, periodoIdx: idx,
            });
        }
        const ajuste = ajusteDoCiclo(idx);
        if (!ajuste) return;
        sinteticas.push({
            nome: ajuste.nome, categ: ajuste.categ, freq: '', pago: null,
            id: ajuste.tipo == 'resgate' ? -2 : -5,
            _sid: `${ajuste.tipo == 'resgate' ? 'res' : 'sug'}:${idx}`,
            data: dataDeFechamentoDoCiclo(per), cred: false, v: ajuste.v, valor: ajuste.v, periodoIdx: idx,
        });
    });

    const linhas = filtrarLinhasDaComparacao(reais, sinteticas);
    if (!linhas.length) return '<p class=empty>Vazio</p>';

    // A confirmação de começo/fim olha os lançamentos dos ciclos futuros já cadastrados,
    // inclusive fora do intervalo visível. Reserva é removida pelo mesmo normalizador da matriz.
    const presencasPorChave = new Map();
    linhas.filter(r => r.periodoIdx != null).forEach(r => {
        const chave = categoriaDaComparacao(r[coluna]);
        if (!chave) return;
        const presencas = presencasPorChave.get(chave) || new Set();
        presencas.add(r.periodoIdx);
        presencasPorChave.set(chave, presencas);
    });

    const periodosUsados = [...new Set(linhas.map(r => r.periodoIdx))].filter(dentroDoIntervalo).sort((a, b) => a - b);
    const matriz = {};
    // guarda tambem os LANCAMENTOS individuais de cada celula (categoria x periodo), pra
    // abrir o detalhamento (nome + valor) ao clicar. Chave = "<categoria>||<periodoIdx>".
    const linhasDaCelula = {};
    linhas.filter(r => dentroDoIntervalo(r.periodoIdx)).forEach(r => {
        const chave = categoriaDaComparacao(r[coluna]);
        if (!chave) return; // linha classificada apenas como Reserva não participa do Comparar.
        (matriz[chave] = matriz[chave] || {})[r.periodoIdx] = (matriz[chave][r.periodoIdx] || 0) + r.v;
        const chaveCelula = chave + '||' + r.periodoIdx;
        (linhasDaCelula[chaveCelula] = linhasDaCelula[chaveCelula] || []).push(r);
    });
    const totalDaChave = chave => Object.values(matriz[chave]).reduce((a, b) => a + b, 0);
    Estado._detalheComparar = { matriz: linhasDaCelula, coluna };   // lido por abreDetalheCelComparar()

    const oc = Estado.ordComp;
    const seta = k => oc.k == k ? (oc.d == 1 ? ' <span class=ar>↑</span>' : ' <span class=ar>↓</span>') : '';

    // Com EXATAMENTE 2 períodos no intervalo, as três colunas extras confirmam mudanças
    // olhando os dois ciclos seguintes: Acabou, Começou e Único. A opção Diferentes usa as
    // mesmas confirmações; fora dessa comparação, a toolbar permanece oculta.
    const comparacao2Periodos = periodosUsados.length == 2;
    Estado._comparacao2Periodos = comparacao2Periodos;
    const [idxPrimeiro, idxSegundo] = periodosUsados;
    const estadoDaChave = chave => comparacao2Periodos
        ? estadoDaComparacaoPorCiclos(presencasPorChave.get(chave) || new Set(), idxPrimeiro, idxSegundo, Estado.ciclos.length)
        : { acabou: false, comecou: false, unico: false };
    const nomeMes1 = comparacao2Periodos ? nomeMesPeriodo(Estado.ciclos[idxPrimeiro].fat) : '';
    const nomeMes2 = comparacao2Periodos ? nomeMesPeriodo(Estado.ciclos[idxSegundo].fat) : '';

    // Dentro de uma categoria x periodo, agrupa os lancamentos REAIS por nome+categoria e
    // avisa quando algum grupo se repete (2+) com datas de MESES DIFERENTES entre si —
    // sintoma de um lancamento recorrente que caiu 2x dentro do
    // MESMO ciclo porque a janela entre dois Faturamentos PJ atravessou a virada do mes,
    // e nao uma despesa que realmente comecou/parou de existir. Sem esse
    // aviso, uma mudança confirmada fazia parecer que a categoria sumiu ou surgiu quando na
    // verdade ela so' foi contada 2x nesse aqui (e ficou de fora, sem repetir, no outro).
    // Ignora linhas sinteticas (Saldo/Fatura/Investimento) — a checagem e' so' pra
    // lancamento de verdade.
    const linhasReaisDaChaveNoCiclo = (chave, periodoIdx) => linhas.filter(r => r.periodoIdx == periodoIdx
        && categoriaDaComparacao(r[coluna]) == chave && ehLinhaReal(r));
    const temRecorrenciaDuplicadaNoCiclo = (chave, periodoIdx) => temRecorrenciaDuplicadaEntreMeses(
        linhasReaisDaChaveNoCiclo(chave, periodoIdx),
    );
    // Uma categoria inteira só deixa de ser "Diferente" se TODOS os nomes que sustentam a
    // mudança forem explicados por duplicidade. Uma recorrência de Ammi, por exemplo, não pode
    // esconder os demais nomes que realmente fizeram Isabella começar naquele ciclo.
    const mudancaInteiramenteExplicadaPorDuplicidade = (chave, estado) => {
        const cicloMarcado = estado.acabou ? idxPrimeiro : idxSegundo;
        const linhasDaMudanca = linhasReaisDaChaveNoCiclo(chave, cicloMarcado);
        const fontesDuplicadas = [linhasDaMudanca];
        if ((estado.comecou || estado.unico) && idxPrimeiro > 0) {
            fontesDuplicadas.push(linhasReaisDaChaveNoCiclo(chave, idxPrimeiro - 1));
        }
        return todasRecorrenciasDaMudancaSaoExplicadas(linhasDaMudanca, fontesDuplicadas);
    };
    // HTML do asterisco de aviso, colado no "✓" de difOk/difNovo, so' quando o lado que
    // TEM o lancamento (chave, periodoIdx) apresenta essa duplicata de mes diferente.
    const avisoRecorrenciaDuplicada = (chave, periodoIdx) => temRecorrenciaDuplicadaNoCiclo(chave, periodoIdx)
        ? '<span class=avisoDup title="Possível recorrência duplicada">*</span>'
        : '';

    // Filtro "Linhas": Todas (N) mostra tudo. Diferentes (D) mostra apenas categorias com
    // começo, fim ou ocorrência única confirmados e descarta as que carregam aviso de recorrência
    // duplicada: nesse caso a janela do ciclo cortou o mês ao meio, não houve diferença real.
    const modoLinhas = el('somenteDif').value;
    const somenteDif = comparacao2Periodos && modoLinhas == 'D';

    // ao LIGAR o filtro (de Todas para Diferentes), passa a
    // ordenar pela coluna "Começou" (a coisa nova recorrente fica em cima); ao DESLIGAR,
    // volta a ordenar pela coluna principal (nome/categ/o que estiver em "Agrupar por").
    // So dispara na TRANSICAO (nao a cada redesenho, senao o usuario nunca conseguiria
    // reordenar manualmente por outra coluna).
    if (somenteDif && !Estado._somenteDifAnterior) oc.k = 'comecou', oc.d = 2;
    else if (!somenteDif && Estado._somenteDifAnterior) oc.k = 'chave', oc.d = 1;
    Estado._somenteDifAnterior = somenteDif;

    const chavesFiltradas = Object.keys(matriz).filter(chave => {
        if (!somenteDif) return true;
        const estado = estadoDaChave(chave);
        if (!estado.acabou && !estado.comecou && !estado.unico) return false;
        if (mudancaInteiramenteExplicadaPorDuplicidade(chave, estado)) return false;
        return true;
    });

    // com so' 1 periodo no intervalo a coluna Total seria identica a unica coluna de
    // periodo — redundante, entao some nesse caso
    const mostraColTotal = periodosUsados.length > 1;

    const cabecalho = `<tr><th class=c1 onclick="sortComp('chave')">${nomeColuna(coluna)}${seta('chave')}</th>` +
        (comparacao2Periodos
            ? `<th class="n colDif" title="Não aparece em ${nomeMes2} nem nos dois ciclos seguintes" onclick="sortComp('acabou')">Acabou em ${nomeMes1}${seta('acabou')}</th>` +
            `<th class="n colDif" title="Aparece em ${nomeMes2} e continua nos dois ciclos seguintes" onclick="sortComp('comecou')">Começou em ${nomeMes2}${seta('comecou')}</th>` +
            `<th class="n colDif" title="Aparece somente em ${nomeMes2} e some nos dois ciclos seguintes" onclick="sortComp('unico')">Único em ${nomeMes2}${seta('unico')}</th>`
            : '') +
        periodosUsados.map(i => `<th class=n onclick="sortComp('${i}')">${nomePeriodo(Estado.ciclos[i])}${seta(String(i))}</th>`).join('') +
        (mostraColTotal ? `<th class=n onclick="sortComp('total')">Total${seta('total')}</th>` : '') +
        `</thead>`;

    // ordena pela coluna escolhida: 'chave' é alfabética; os estados são booleanos;
    // 'total' e as colunas de período são numéricos
    // (celula vazia conta como zero)
    const valorDaLinha = chave =>
        oc.k == 'total' ? totalDaChave(chave)
            : oc.k == 'acabou' ? (estadoDaChave(chave).acabou ? 1 : 0)
                : oc.k == 'comecou' ? (estadoDaChave(chave).comecou ? 1 : 0)
                    : oc.k == 'unico' ? (estadoDaChave(chave).unico ? 1 : 0)
                    : (matriz[chave][+oc.k] || 0);
    // cada linha de categoria vira selecionavel igual as tabelas do Ciclo (clique marca,
    // shift-click marca intervalo, soma na barra flutuante) — o valor usado e' o Total da
    // categoria no intervalo (totalDaChave), nao uma celula especifica. `_sid` prefixado
    // com "cp:" pra nao colidir com as chaves sinteticas de fatura ("fat:") do Ciclo.
    const linhasSelecionaveis = [];
    const corpo = chavesFiltradas.sort((a, b) => {
        const cmp = oc.k == 'chave'
            ? String(a).localeCompare(String(b), 'pt')
            : valorDaLinha(a) - valorDaLinha(b);
        return oc.d == 1 ? cmp : -cmp;
    }).map(chave => {
        const sid = 'cp:' + chave;
        linhasSelecionaveis.push({ _sid: sid, nome: chave, v: totalDaChave(chave) });
        const marcada = Estado.selecionados.has(sid);
        const estado = estadoDaChave(chave);
        return `<tr class="${marcada ? 'on' : ''} pick" data-sid="${escapeHtml(sid)}"><td class=c1>${chave}</td>` +
            (comparacao2Periodos
                ? `<td class="n colDif">${estado.acabou ? `<span class=difOk>✓</span>${avisoRecorrenciaDuplicada(chave, idxPrimeiro)}` : ''}</td>` +
                `<td class="n colDif">${estado.comecou ? `<span class=difNovo>✓</span>${avisoRecorrenciaDuplicada(chave, idxSegundo)}` : ''}</td>` +
                `<td class="n colDif">${estado.unico ? `<span class=difUnico>✓</span>${avisoRecorrenciaDuplicada(chave, idxSegundo)}` : ''}</td>`
                : '') +
            periodosUsados.map(i => {
                if (matriz[chave][i] == null) return '<td class=n>·</td>';
                const v = matriz[chave][i];
                const chaveJs = escapeHtml(chave).replace(/'/g, '&#39;');
                return `<td class="n ${corSoma(v)} celClicavel" onclick="event.stopPropagation();abrirDetalheCelComparar('${chaveJs}',${i})">${brl(v)}</td>`;
            }).join('') +
            (mostraColTotal ? celSoma(totalDaChave(chave)) : '');
    }).join('');
    Estado.linhasVisiveis['cp'] = linhasSelecionaveis;

    const linhasNoIntervalo = linhas.filter(r => dentroDoIntervalo(r.periodoIdx));
    // Total é a soma exata das linhas visíveis no Comparar. Ele não tenta reproduzir o saldo
    // de caixa do ciclo, que inclui antecipações de fatura deliberadamente ausentes daqui.
    const totalDoPeriodo = i => Object.values(matriz).reduce((soma, valores) => soma + (valores[i] || 0), 0);
    const celTotalPeriodo = i => celSoma(totalDoPeriodo(i));
    const totalGeral = chavesFiltradas.reduce((soma, chave) => soma + totalDaChave(chave), 0);
    const linhaTotal = '<tr class=tot><td class=c1>Total</td>' +
        // As três colunas de status não são valores acumuláveis; células explícitas evitam
        // que o navegador as reposicione para o fim da linha Total.
        (comparacao2Periodos ? '<td class="n colDif"></td><td class="n colDif"></td><td class="n colDif"></td>' : '') +
        periodosUsados.map(celTotalPeriodo).join('') +
        (mostraColTotal ? celSoma(totalGeral) : '');

    // subtitulo: quantas linhas a matriz tem (varia com o "Agrupar por" — cada valor
    // distinto da coluna escolhida vira uma linha) e o intervalo de datas do periodo
    // De/Ate. A contagem de "N registros" (quantos lancamentos foram somados) ja vem
    // de graca da blocoCasca, igual nos blocos Debito/Credito — nao repete aqui.
    const nGrupos = chavesFiltradas.length;
    const nRegistros = linhasNoIntervalo.length;
    const iniPeriodo = Estado.ciclos[periodosUsados[0]];
    const fimPeriodo = Estado.ciclos[periodosUsados.at(-1)];
    const subtitulo =
        `${nGrupos} ${nGrupos == 1 ? nomeColuna(coluna) : nomeColuna(coluna) + 's'}` +
        (iniPeriodo && fimPeriodo ? ` · ${dataBR(iniPeriodo.ini)} a ${dataBR(dataDeFechamentoDoCiclo(fimPeriodo))}` : '');

    // titulo no mesmo estilo dos blocos Debito/Credito
    const tituloPeriodo = iniPeriodo && fimPeriodo
        ? `Comparação ${nomePeriodoAbrev(iniPeriodo.fat)} até ${nomePeriodoAbrev(fimPeriodo.fat)}`
        : 'Comparação';

    // MESMA casca (blocoCasca) usada por Debito/Credito/Backlog: titulo, botao de
    // collapse (▾/▸), linha de meta info e o corpo por baixo — pra trocar de visao
    // (Ciclo <-> Comparar) ser impercetivel, os blocos ficam visualmente identicos.
    return blocoCasca(tituloPeriodo, subtitulo, nRegistros, 'cp',
        () => `<div class="wrap wx"><table><thead>${cabecalho}<tbody>${corpo}${linhaTotal}</tbody></table></div>`);
}

// Modal de um cartão (botões Nubank/Mercado Pago do cabeçalho): o desenho do cartão com a
// fatura em destaque e, abaixo, Hoje e Futuro (Fatura, Usado, Livre e a barra de uso do
// teto), o limite (Aprovado e Garantido editáveis, os mesmos campos que ficavam no título)
// e as compras da fatura. Só lê o que vCiclo já calculou em Estado.cartoesDoCiclo.
function htmlModalCartao(dados, cartao) {
    const c = dados?.cartoes?.[cartao];
    if (!c) return '<p class=empty>Sem compras deste cartão no ciclo exibido.</p>';
    const principal = dados.temHoje ? c.hoje : c.futuro;
    // A barra mostra quanto do teto está usado; passou do teto, fica cheia e vermelha.
    const uso = x => c.teto > 0 ? Math.max(0, Math.min(100, x.usado / c.teto * 100)) : 100;
    const linha = (rotulo, x) => `<div class=cartaoLinha>` +
        `<span class=cartaoLinhaRotulo>${rotulo}</span>` +
        `<span class=cartaoValor><small>Fatura</small><b class="${corSoma(x.fatura)}">${brl(Math.abs(x.fatura))}</b></span>` +
        `<span class=cartaoValor><small>Usado</small><b>${brl(x.usado)}</b></span>` +
        `<span class=cartaoValor><small>Livre</small><b class="${corValor(x.livre)}">${brl(x.livre)}</b></span>` +
        `<span class="cartaoUso${x.livre < -TOLERANCIA_FINANCEIRA ? ' acima' : ''}" title="${Math.round(uso(x))}% do teto"><span style="width:${uso(x).toFixed(1)}%"></span></span>` +
        (x.antecipado > TOLERANCIA_FINANCEIRA ? `<small class=cartaoAntecipado>Já antecipado ${brl(x.antecipado)}</small>` : '') +
        `</div>`;
    const compras = [...c.compras].sort((a, b) => timestamp(b.data) - timestamp(a.data) || (+b.id - +a.id));
    const itemCompra = r => `<li${r._prev ? ' class=prevista' : ''}>` +
        `<span class=cartaoCompraData>${r.data ? dataBR(r.data).slice(0, 5) : '—'}</span>` +
        `<span class=cartaoCompraNome>${escapeHtml(r.nome ?? '')}${!r._prev && r.pago === false ? ' <small>aberto</small>' : ''}</span>` +
        `<b class="${corSoma(r.v)}">${brl(Math.abs(r.v))}</b></li>`;
    return `<div class="cartaoArte cartao-${cartao}">` +
        `<div class=cartaoArteTopo><span class=cartaoMarca>${escapeHtml(c.nome)}</span>` +
        `<svg class=cartaoContato viewBox="0 0 24 24" width=22 height=22 fill=none stroke=currentColor stroke-width=2 stroke-linecap=round aria-hidden=true>` +
        `<path d="M8.5 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M15.5 3.5a12 12 0 0 1 0 17"/></svg></div>` +
        `<span class=cartaoChip aria-hidden=true></span>` +
        `<div class=cartaoArteRodape><span><small>${dados.temHoje ? 'Fatura hoje' : 'Fatura'}</small><b>${brl(Math.abs(principal.fatura))}</b></span>` +
        `<span class=cartaoVence><small>Vence</small><b>${c.vencimento ? dataBR(c.vencimento).slice(0, 5) : '—'}</b></span></div>` +
        `</div>` +
        (dados.temHoje ? linha('Hoje', c.hoje) : '') + linha('Futuro', c.futuro) +
        `<div class=cartaoLimite><span>Teto <b>${brl(c.teto)}</b></span>` +
        `<span class=limiteCartaoBase>Aprovado R$ ${c.campoAprovado}</span>` +
        (c.campoGarantia ? `<span class=limiteCartaoBase>Garantido + R$ ${c.campoGarantia}</span>` : '') +
        `</div>` +
        `<details class=cartaoCompras><summary>Compras da fatura <span>${compras.length}</span></summary>` +
        (compras.length ? `<ul>${compras.map(itemCompra).join('')}</ul>` : '<p class=empty>Nenhuma compra.</p>') +
        `</details>`;
}
