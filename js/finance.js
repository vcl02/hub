// Cálculos financeiros: saldo, faturas, antecipações, aportes e resgates.

function abatimentosDaBase(base) {
    return alocacaoAntecipacoes(base);
}
let _baseFiltrada = null, _abatFiltrada = null;
function baseEAbatFiltrados() {
    if (!_baseFiltrada) { _baseFiltrada = filtrarLancamentos(); _abatFiltrada = abatimentosDaBase(_baseFiltrada); }
    return { base: _baseFiltrada, abat: _abatFiltrada };
}
// Saldo bruto (ANTES de aplicar Resgate necessario / Aporte sugerido) de um ciclo, a partir de
// uma lista `base` ja filtrada e o `abat` (alocacaoAntecipacoes) JA CALCULADO pra essa base —
// nunca chame alocacaoAntecipacoes aqui dentro. `saldoAnteriorFn` devolve o saldo (com ajuste
// aplicado) do ciclo anterior NA MESMA BASE.
function totalBaseDoCiclo(idx, base, abat, saldoAnteriorFn) {
    if (idx < 0 || !Estado.ciclos[idx]) return 0;
    if (dataISO(Estado.ciclos[idx].fat) < SALDO_DESDE) return 0;

    const doCiclo = base
        .filter(r => r.periodoIdx === idx && !r.cred)
        .reduce((s, r) => s + r.v, 0);

    const brutoFatura = base
        .filter(r => r.cred && r.periodoIdx === idx)
        .reduce((s, r) => s + r.v, 0);
    const fatura = brutoFatura ? brutoFatura + (abat[idx] || 0) : 0;

    const anterior = idx > 0 && dataISO(Estado.ciclos[idx - 1].fat) >= SALDO_DESDE
        ? saldoAnteriorFn(idx - 1) : 0;

    return anterior + doCiclo + fatura;
}

// Limites de Besteira/Isabella de um ciclo: o valor salvo na linha dele em fin_ciclo ou, sem
// valor, o padrão do código. Cada
// ciclo é independente: mudar um não mexe nos outros.
const ehValorDeLimite = valor => valor != null && valor !== '' && Number.isFinite(+valor);

// Escolhas salvas de um ciclo (a própria linha dele em fin_ciclo) ou null.
function limitesSalvosDoCiclo(idx) {
    const cicloId = Estado.ciclos[idx]?.cicloId;
    return cicloId == null ? null : Estado.limitesPorCiclo?.get(cicloId) || null;
}

function limitesCategoriaDoCiclo(idx) {
    const salvos = limitesSalvosDoCiclo(idx);
    const valorOuPadrao = (valor, padrao) => valor == null || valor === '' || !Number.isFinite(+valor) ? padrao : +valor;
    return {
        besteira: valorOuPadrao(salvos?.limite_besteira, LIMITE_BESTEIRA),
        isabella: valorOuPadrao(salvos?.limite_isabella, LIMITE_ISABELLA),
    };
}

// Aprovado e garantia do cartão (fin_ciclo, migration 25) herdam: o valor definido num ciclo vale pra
// ele e pros seguintes, até outro ciclo definir outro — limite de banco muda raramente, e
// repetir o mesmo número em todo ciclo seria só trabalho. Nada definido até aqui = null.
function valorDefinidoAteOCiclo(idx, campo) {
    for (let j = idx; j >= 0; j--) {
        const valor = limitesSalvosDoCiclo(j)?.[campo];
        if (ehValorDeLimite(valor)) return +valor;
    }
    return null;
}

// Aprovado de um cartão no ciclo; sem nenhum ciclo definindo, o padrão (LIMITE_CARTAO, que
// ainda pode vir da preferência antiga salva no navegador, ou LIMITE_CARTAO_MP).
function aprovadoDoCiclo(idx, cartao) {
    const coluna = cartao === CARTAO_MERCADO_PAGO ? 'limite_aprovado_mp' : 'limite_aprovado_nubank';
    return valorDefinidoAteOCiclo(idx, coluna) ?? limiteCartaoContratado(cartao);
}

// Quanto do guardado vira garantia do Nubank no ciclo: o valor escolhido (herdado como o
// Aprovado), nunca acima do guardado real; sem escolha, todo o guardado positivo.
function garantiaDoCiclo(idx, guardado) {
    const escolhida = valorDefinidoAteOCiclo(idx, 'limite_garantia_nubank');
    const disponivel = Math.max(0, +guardado || 0);
    return { escolhida, disponivel, efetiva: escolhida == null ? disponivel : Math.min(escolhida, disponivel) };
}

// Do ciclo atual em diante, o ciclo assume que o teto de Besteira e de Isabella será gasto
// por inteiro, no Crédito: uma compra sintética EM ABERTO no Nubank completa o que falta até
// 100% (limite − já lançado, pago ou aberto, nunca negativa; nada se o ciclo já passou do
// teto). "Já lançado" é a mesma base do indicador: débitos do ciclo + créditos da prévia
// (fatura do ciclo seguinte). A compra cai nessa mesma prévia — fatura Nubank do ciclo
// idx+1 —, então entra na tabela Crédito, na fatura (e por ela no saldo e no Aporte/Resgate)
// e no Livre Futuro; por estar em aberto, nunca ocupa o limite de Hoje. Ciclos passados não
// ganham previsão, nem o último ciclo aberto (sem ciclo seguinte pra fatura cair).
function previstasDoCiclo(idx, base) {
    const ciclo = Estado.ciclos[idx];
    const proximo = Estado.ciclos[idx + 1];
    if (!ciclo || !proximo || Estado.idxHoje == null || Estado.idxHoje < 0 || idx < Estado.idxHoje) return [];
    const reais = base.filter(r => !r._prev);
    const linhas = [...reais.filter(r => r.periodoIdx === idx && !r.cred), ...creditosExibidosNoCiclo(reais, idx)];
    const tetos = limitesCategoriaDoCiclo(idx);
    // 1º vencimento do Nubank dentro do ciclo seguinte (dia 12 do mês do início, ou do mês
    // depois se o ciclo começa depois do dia 12).
    const dia = String(DIA_VENCIMENTO_CARTAO[CARTAO_NUBANK]).padStart(2, '0');
    let fatura = `${dataISO(proximo.ini).slice(0, 7)}-${dia}`;
    if (fatura < dataISO(proximo.ini)) fatura = `${somaMeses(fatura, 1).slice(0, 7)}-${dia}`;
    // A Isabella prevista leva "Lazer, Isabella" pra continuar sendo gasto com ela em qualquer
    // leitura (ehGastoIsabella, Comparar). Montada aqui, e não no topo do arquivo, porque
    // ehGastoIsabella vem de js/charts.js, carregado depois deste.
    const categorias = [
        { chave: 'besteira', nome: 'Besteira prevista', categ: CATEGORIA_BESTEIRA, combina: CATEGORIA_BESTEIRA },
        { chave: 'isabella', nome: 'Isabella prevista', categ: 'Lazer, Isabella', combina: ehGastoIsabella },
    ];
    return categorias.map(c => {
        const falta = tetos[c.chave] - dadosLimiteCategoriaDoCiclo(linhas, c.combina, tetos[c.chave]).valorTotal;
        if (falta <= TOLERANCIA_FINANCEIRA) return null;
        const v = -Math.round(falta * 100) / 100;
        return {
            // freq e comprometido só aparecem nas colunas (é uma previsão de todo ciclo); o
            // indicador Comprometido lê só lançamentos reais. pago = false é regra: não ocupa
            // o limite de Hoje. Ids distintos na coluna ID: Besteira -6, Isabella -7.
            // pra_sempre também é só exibição: todo ciclo tem a sua prevista, sem fim.
            data: dataDeFechamentoDoCiclo(ciclo), nome: c.nome, categ: c.categ, freq: 'Mensal', pago: false, comprometido: true, pra_sempre: true, cred: true, fatura,
            id: c.chave === 'besteira' ? -6 : -7, _sid: `prev:${c.chave}:${idx}`, _prev: 1, v, valor: v, periodoIdx: idx + 1,
        };
    }).filter(Boolean);
}

// Base de todos os cálculos e tabelas (filtrarLancamentos): os lançamentos reais mais as
// compras previstas de Besteira/Isabella. Montada uma vez por desenho (limparCachesFinanceiros
// zera junto com os demais caches), nunca persistida.
let _lancamentosComPrevistas = null;
function lancamentosComPrevistas() {
    if (!_lancamentosComPrevistas) {
        const reais = Estado.lancamentos;
        _lancamentosComPrevistas = [...reais, ...Estado.ciclos.flatMap((_, idx) => previstasDoCiclo(idx, reais))];
    }
    return _lancamentosComPrevistas;
}

// Linha sintetica de Resgate necessario / Aporte sugerido de um ciclo, a partir do seu saldo
// bruto (totalBaseDoCiclo). Regra UNICA usada em todo lugar que soma dinheiro por ciclo —
// Ciclo, saldo por dia, Comparar, pizza de gastos e evolucao — pra garantir que o mesmo numero
// e o mesmo criterio apareçam em todos: saldo negativo -> resgate cobrindo o deficit; saldo
// positivo -> aporte sugerido escoando o excedente (sempre, mesmo sem aporte real no ciclo).
// `guardadoDisponivel` (patrimonio acumulado ATE O CICLO ANTERIOR, de guardadoAte(idx-1)) LIMITA
// o resgate: nao da' pra resgatar mais do que existe guardado. Se o deficit for maior que o
// guardado, resgata so' o que tem — o resto do deficit fica negativo de verdade no saldo do
// ciclo, em vez de fingir (via um resgate maior que o patrimonio real) que o mes fechou em zero.
// O guardado nunca pode ficar negativo: se os resgates REAIS do ciclo já levaram mais do que
// havia guardado (guardadoDisponivel < 0), o ajuste DIMINUI o resgate (valor negativo,
// consolidado no Resgate do ciclo) até o guardado voltar a zero — o déficit que sobrar fica
// negativo no saldo do ciclo, que é a verdade. `resgatouTudo` marca os dois casos em que o
// guardado acaba no ciclo (o resgate levou tudo, ou foi corrigido pra caber), pra a linha
// ganhar o aviso "Resgatou tudo".
function ajusteInvestimento(totalBase, guardadoDisponivel = Infinity) {
    if (guardadoDisponivel < -TOLERANCIA_FINANCEIRA) {
        const v = Math.round(Math.min(guardadoDisponivel, -Math.max(0, totalBase)) * 100) / 100;
        // Sobra do ciclo maior que o rombo: é um Aporte sugerido comum, que já zera o rombo.
        if (v < guardadoDisponivel - TOLERANCIA_FINANCEIRA) return { tipo: 'aporte', nome: 'Aporte sugerido', categ: CATEGORIA_INVESTIMENTO, v };
        return { tipo: 'resgate', nome: 'Resgate necessário', categ: CATEGORIA_INVESTIMENTO, v, resgatouTudo: true };
    }
    if (totalBase < -0.005) {
        const deficit = -totalBase;
        const resgate = Math.min(deficit, Math.max(0, guardadoDisponivel));
        if (resgate <= 0.005) return null;   // sem nada guardado pra resgatar — o mes fica negativo, sem linha de ajuste
        // Resgate menor que o déficit: levou todo o guardado.
        const ajuste = { tipo: 'resgate', nome: 'Resgate necessário', categ: CATEGORIA_INVESTIMENTO, v: resgate };
        if (resgate < deficit - TOLERANCIA_FINANCEIRA) ajuste.resgatouTudo = true;
        return ajuste;
    }
    if (totalBase > TOLERANCIA_FINANCEIRA) return { tipo: 'aporte', nome: 'Aporte sugerido', categ: CATEGORIA_INVESTIMENTO, v: -totalBase };
    return null;
}

// Total do bloco Debito de um ciclo: lancamentos + fatura + saldo do ciclo anterior + o
// Resgate necessario / Aporte sugerido do proprio ciclo. E' recursivo — cada ciclo carrega o
// anterior — e para no SALDO_DESDE. Memoizado (idx -> total, idx -> ajuste) porque a cascata
// reprocessa os mesmos ciclos varias vezes por render.
const _cacheSaldo = {};
const _cacheAjuste = {};
function saldoDoCiclo(idx) {
    if (idx < 0 || !Estado.ciclos[idx]) return 0;
    if (dataISO(Estado.ciclos[idx].fat) < SALDO_DESDE) return 0;
    if (_cacheSaldo[idx] != null) return _cacheSaldo[idx];

    _cacheSaldo[idx] = 0;   // trava recursao circular enquanto calcula

    const { base, abat } = baseEAbatFiltrados();
    const totalBase = totalBaseDoCiclo(idx, base, abat, saldoDoCiclo);
    const ajuste = ajusteInvestimento(totalBase,
        guardadoDisponivelNoCiclo(idx, base, guardadoAte(idx - 1)));
    _cacheAjuste[idx] = ajuste;
    const total = totalBase + (ajuste ? ajuste.v : 0);

    _cacheSaldo[idx] = total;
    return total;
}
// Resgate necessario / Aporte sugerido de um ciclo. SEMPRE usar esta funcao em vez de chamar
// totalBaseDoCiclo/ajusteInvestimento direto — ela reaproveita o calculo memoizado de
// saldoDoCiclo, garantindo O(1) amortizado por idx no render inteiro.
function ajusteDoCiclo(idx) {
    if (idx < 0 || !Estado.ciclos[idx] || dataISO(Estado.ciclos[idx].fat) < SALDO_DESDE) return null;
    saldoDoCiclo(idx);   // efeito colateral: preenche _cacheAjuste[idx]
    return _cacheAjuste[idx] || null;
}

// Zera as 2 memoizações acima (saldo/ajuste e a base/abatimento). desenhar() chama isso
// a cada redesenho; consolidar tudo também chama entre um ciclo e o próximo, pois materializar
// o ajuste de um ciclo muda Estado.lancamentos e o guardado disponível do ciclo seguinte
// (guardadoAte) precisa recalcular em cima do lançamento recém-criado, não do cache antigo.
function limparCachesFinanceiros() {
    Object.keys(_cacheSaldo).forEach(k => delete _cacheSaldo[k]);
    Object.keys(_cacheAjuste).forEach(k => delete _cacheAjuste[k]);
    _baseFiltrada = _abatFiltrada = null;
    _lancamentosComPrevistas = null;
}

// Saldo em conta ao fim de cada dia, acumulado desde SALDO_INICIAL. Considera o que
// de fato passa pela conta: os debitos (inclusive antecipação/pagamento de fatura) mais as
// linhas sinteticas de fatura, que representam apenas o restante a sair no vencimento, mais
// o Resgate necessario / Aporte sugerido de cada ciclo (na data de fechamento dele) — pra
// que cada pagamento de cartão entre uma vez, na sua data real, e o saldo final bata com
// saldoDoCiclo(idx).
// A exclusão por categoria é um recorte exclusivamente visual da tabela de Débito. Como
// fatura e aporte/resgate sintéticos dependem da mesma base, este contexto local os refaz
// junto com os eventos reais; reutilizar o cache da conta inteira misturaria o recorte com
// os valores não filtrados. Os demais totais da tela continuam usando a conta inteira.
// O guardado também é o do recorte: soma os ajustes DESTE contexto, nunca os da conta inteira
// (ajusteDoCiclo global), senão o limite do Resgate saía de uma base e o saldo de outra.
function ajusteDoCicloParaSaldoDiario(base, abat) {
    const saldos = {};
    const ajustes = {};

    const guardadoAte = idx => {
        const reais = base
            .filter(r => r.inv && r.periodoIdx != null && r.periodoIdx <= idx)
            .reduce((s, r) => s - r.v, 0);
        let hipotetico = 0;
        for (let i = 0; i <= idx; i++) {
            saldoDoCiclo(i);   // preenche ajustes[i] (ciclos anteriores já vêm prontos da cascata)
            if (ajustes[i]) hipotetico -= ajustes[i].v;
        }
        return reais + hipotetico;
    };

    const saldoDoCiclo = idx => {
        if (idx < 0 || !Estado.ciclos[idx] || dataISO(Estado.ciclos[idx].fat) < SALDO_DESDE) return 0;
        if (saldos[idx] != null) return saldos[idx];
        saldos[idx] = 0; // impede a cascata de reentrar no próprio ciclo enquanto calcula.

        const totalBase = totalBaseDoCiclo(idx, base, abat, saldoDoCiclo);
        const ajuste = ajusteInvestimento(totalBase,
            guardadoDisponivelNoCiclo(idx, base, guardadoAte(idx - 1)));
        ajustes[idx] = ajuste;
        saldos[idx] = totalBase + (ajuste ? ajuste.v : 0);
        return saldos[idx];
    };

    return idx => {
        saldoDoCiclo(idx);
        return ajustes[idx] || null;
    };
}

function saldoPorDiaDaBase(base, abat, ajusteDoCiclo) {

    // faturas em aberto de todos os ciclos, ja liquidas de antecipacao — uma por cartao, cada
    // uma no seu proprio vencimento (Nubank dia 12, Mercado Pago dia 13)
    const faturas = [];
    Estado.ciclos.forEach((per, idx) => {
        faturasLiquidasDoCiclo(base, abat, idx).forEach(f => {
            if (Math.abs(f.liquido) > 0.005) faturas.push({ data: f.vencimento, v: f.liquido });
        });
    });

    // um evento de Resgate/Aporte por ciclo, na data de fechamento (usa o cache — nunca
    // recalcula alocacaoAntecipacoes por periodo). O ciclo aberto usa o fechamento provisório
    // (dataDeFechamentoDoCiclo), nunca 31/12/9999 — senão o ajuste dele caía fora de qualquer dia.
    const ajustes = [];
    Estado.ciclos.forEach((per, idx) => {
        const ajuste = ajusteDoCiclo(idx);
        if (ajuste) ajustes.push({ data: dataDeFechamentoDoCiclo(per), v: ajuste.v });
    });

    const eventos = [
        ...base
            .filter(r => !r.cred && r.data)
            .map(r => ({ data: dataISO(r.data), v: r.v })),
        ...faturas,
        ...ajustes,
    ]
        .filter(e => e.data >= SALDO_DESDE)
        .sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);

    const saldo = {};
    let acc = SALDO_INICIAL;
    eventos.forEach(e => { acc += e.v; saldo[e.data] = acc; });
    return saldo;
}

// `baseVisual` só é enviada pela tabela quando Categoria usa `!texto`; assim filtros de
// Nome, Valor e Frequência nunca mudam o saldo diário, e os títulos/indicadores financeiros
// também permanecem intactos. Sem recorte, usa a mesma base/ajuste de saldoDoCiclo.
function saldoPorDia(baseVisual = null) {
    if (baseVisual) {
        const abat = abatimentosDaBase(baseVisual);
        return saldoPorDiaDaBase(baseVisual, abat, ajusteDoCicloParaSaldoDiario(baseVisual, abat));
    }
    const { base, abat } = baseEAbatFiltrados();
    return saldoPorDiaDaBase(base, abat, ajusteDoCiclo);
}


// Quanto esta guardado no fim do ciclo: todos os aportes menos todos os resgates REAIS, de
// todos os ciclos ate este, MAIS o efeito hipotetico do Resgate necessario / Aporte sugerido
// de cada ciclo ate aqui (tratado como se o dinheiro tivesse de fato mudado de bolso, do
// mesmo jeito que um aporte/resgate real ja lancado). Nao entra no saldo da conta — e'
// patrimonio separado.
function guardadoAte(idx) {
    const reais = filtrarLancamentos()
        .filter(r => r.inv && r.periodoIdx != null && r.periodoIdx <= idx)
        .reduce((s, r) => s - r.v, 0);

    let hipotetico = 0;
    for (let i = 0; i <= idx; i++) {
        const ajuste = ajusteDoCiclo(i);
        if (ajuste) hipotetico -= ajuste.v;
    }

    return reais + hipotetico;
}

// Quanto SOBRA pra bancar o Resgate necessario do ciclo `idx`: o guardado que veio do ciclo
// anterior MENOS o efeito dos investimentos REAIS ja lancados dentro do proprio ciclo `idx`.
// Sem descontar esses, um resgate real do mes (ex: R$2.456,34) era ignorado no limite e o
// Resgate necessario podia sacar dinheiro que aquele resgate real ja tinha levado — deixando
// o guardado negativo e sobrando um residuo no saldo do ciclo (o caso "-R$10,00" no titulo
// do Debito, com o guardado do mes seguinte aparecendo em -9,99).
function guardadoDisponivelNoCiclo(idx, base, guardadoAnterior) {
    const reaisDoCiclo = base
        .filter(r => r.inv && r.periodoIdx === idx)
        .reduce((s, r) => s - r.v, 0);
    return guardadoAnterior + reaisDoCiclo;
}

// Visão "Ciclo": mostra um periodo por vez, com os blocos Debito e Credito (ou o Backlog).
// O Crédito é uma prévia visual: no ciclo N mostra as compras da fatura do ciclo N+1.
// O cálculo da fatura e do Débito continua usando os créditos do próprio ciclo N.
function creditosExibidosNoCiclo(linhas, idxCiclo) {
    return linhas.filter(r => r.cred && r.periodoIdx === idxCiclo + 1);
}
// Mesmo saldo líquido da linha dinâmica de fatura: compras brutas menos as antecipações.
function totalCreditoExibidoAposAntecipacoes(creditos, valorAntecipado = 0) {
    return creditos.reduce((soma, r) => soma + r.v, 0) + valorAntecipado;
}

// "Hoje" é um retrato de caixa, não uma previsão: só movimentos reais já marcados como
// pagos entram, qualquer que seja a data do lançamento — pago é a ÚNICA coluna que decide.
// Quem antecipa um pagamento ajusta a data depois se quiser; isso nunca atrasa o retrato.
// Compras no crédito continuam fora do saldo de caixa, pois ainda não saíram da conta;
// antecipações reais entram como qualquer débito.
function lancamentosPagos(linhas) {
    return linhas.filter(r => r.pago && r.data);
}

// Separa explicitamente o dinheiro disponível do patrimônio guardado no instante atual.
// O saldo nasce no mesmo SALDO_DESDE da cascata dos ciclos: antes dele não há saldo inicial
// confiável e os registros históricos não podem contaminar o retrato de hoje. Saldo inclui
// aporte/resgate porque o dinheiro efetivamente sai/volta para a conta; guardado mostra essa
// parcela separada e nunca conta sugestões sintéticas de futuro.
function resumoDebitoPago(linhas) {
    const pagos = lancamentosPagos(linhas)
        .filter(r => !r.cred && dataISO(r.data) >= SALDO_DESDE);
    return {
        saldo: pagos.reduce((soma, r) => soma + (+r.v || 0), 0),
        guardado: pagos
            .filter(r => r.inv)
            .reduce((soma, r) => soma - (+r.v || 0), 0),
    };
}

// O limite garantido só pode usar dinheiro realmente aplicado: aportes negativos aumentam a
// garantia e resgates positivos a reduzem, mas só os já PAGOS — o Aporte que o Consolidar
// materializa nasce aberto, e a Nubank só garante o que de fato está na caixinha. Recebe a
// lista inteira para não obedecer a recortes visuais (nem contar Aporte sugerido, sintético).
function guardadoGarantidoAte(linhas, idx) {
    return linhas
        .filter(r => r.inv && r.pago && r.periodoIdx != null && r.periodoIdx <= idx)
        .reduce((soma, r) => soma - (+r.v || 0), 0);
}

// Patrimônio guardado até o ciclo, inclusive aportes/resgates REAIS ainda abertos (planejados):
// base da Liberdade financeira, que projeta ciclos futuros. Sem Aporte sugerido (sintético).
function guardadoRealAte(linhas, idx) {
    return linhas
        .filter(r => r.inv && r.periodoIdx != null && r.periodoIdx <= idx)
        .reduce((soma, r) => soma - (+r.v || 0), 0);
}

// O limite do cartão é diferente da fatura exibida: crédito Aberto é só projeção e não
// compromete o cartão. Crédito Pago já virou compra real; uma antecipação da mesma fatura
// libera esse valor, até o saldo chegar a zero. `cicloQuitadoAte` é usado exclusivamente
// pela projeção Futuro: os créditos até esse ciclo são tratados como faturas já quitadas,
// liberando o limite antes de avaliar a próxima. `abatidoPorCiclo` vem da mesma alocação
// usada pela fatura para nunca liberar mais que o pagamento realmente abateu. Cada cartão
// conta só as próprias compras (cartaoDaFatura) contra o próprio abatimento.
function limiteCartaoOcupado(linhas, abatidoPorCiclo = {}, cicloQuitadoAte = -Infinity, cartao = CARTAO_NUBANK) {
    const confirmadoPorCiclo = new Map();
    linhas.forEach(r => {
        if (!r.cred || !r.pago || r.periodoIdx == null) return;
        if (cartaoDaFatura(r.fatura) !== cartao) return;
        if (r.periodoIdx <= cicloQuitadoAte) return;
        confirmadoPorCiclo.set(r.periodoIdx, (confirmadoPorCiclo.get(r.periodoIdx) || 0) + (+r.v || 0));
    });
    return Array.from(confirmadoPorCiclo, ([idx, total]) =>
        Math.max(0, -total - (abatidoPorCiclo[idx] || 0))
    ).reduce((soma, restante) => soma + restante, 0);
}

// O guardado positivo que aparece no título de Débito é aplicado na garantia da Nubank.
// Ele aumenta o teto utilizável do cartão no ciclo atual; valor negativo nunca reduz o limite
// contratado, pois só dinheiro efetivamente guardado pode estar como garantia. O Mercado Pago
// não tem garantia: o teto é só o limite contratado, qualquer que seja o guardado.
// `aprovado` é o do ciclo (aprovadoDoCiclo); sem ele, o padrão global de cada cartão.
function limiteCartaoTotal(guardadoDoCiclo = 0, cartao = CARTAO_NUBANK,
    aprovado = cartao === CARTAO_MERCADO_PAGO ? LIMITE_CARTAO_MP : LIMITE_CARTAO) {
    if (cartao === CARTAO_MERCADO_PAGO) return aprovado;
    return aprovado + Math.max(0, +guardadoDoCiclo || 0);
}

function limiteCartaoLivre(linhas, abatidoPorCiclo = {}, guardadoDoCiclo = 0, cicloQuitadoAte = -Infinity, cartao = CARTAO_NUBANK, aprovado) {
    return limiteCartaoTotal(guardadoDoCiclo, cartao, aprovado) - limiteCartaoOcupado(linhas, abatidoPorCiclo, cicloQuitadoAte, cartao);
}

// Livre Hoje de um cartão no ciclo idx, a mesma conta do título do Crédito: teto (Aprovado e,
// no Nubank, a garantia do guardado já pago) menos as compras confirmadas que ainda ocupam o
// cartão, e só antecipação JÁ PAGA libera. Regra única: o título e a conferência do cadastro
// (quanto sobra depois de uma compra nova) usam esta função.
function limiteLivreHojeDoCartao(linhas, idx, cartao) {
    const garantido = cartao === CARTAO_NUBANK ? garantiaDoCiclo(idx, guardadoGarantidoAte(linhas, idx)).efetiva : 0;
    const abatidoPago = alocacaoAntecipacoes(linhas.filter(r => !ehTransferenciaFatura(r) || r.pago));
    return limiteCartaoLivre(linhas, abatimentoDoCartao(abatidoPago, cartao), garantido, -Infinity, cartao, aprovadoDoCiclo(idx, cartao));
}

// No Futuro, a fatura exibida é uma obrigação inteira (paga e aberta), então ela precisa
// consumir o limite mesmo que uma parte ainda não esteja marcada como `pago`. As faturas até
// ela já são descontadas como quitadas por `limiteCartaoLivre`; créditos confirmados depois
// dela continuam ocupando por inteiro: antecipação só conta no ciclo da própria fatura (a
// exibida já vem líquida das dela, em totalFatura), então a de uma fatura seguinte — paga
// ou planejada — não alivia o limite desta projeção. Antecipação acima do total não gera
// limite extra.
function limiteCartaoLivreFuturo(linhas, guardadoDoCiclo = 0, idxFatura, totalFatura = 0, cartao = CARTAO_NUBANK, aprovado) {
    const faturaExibida = Math.max(0, -(+totalFatura || 0));
    return limiteCartaoLivre(linhas, {}, guardadoDoCiclo, idxFatura, cartao, aprovado) - faturaExibida;
}
