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
// 1º vencimento do cartão dentro do ciclo seguinte (o dia do cartão no mês do início, ou no
// mês depois se o ciclo começa depois dele): a fatura de uma compra feita no ciclo idx.
// Usada pelas previstas de Besteira/Isabella e pelas compras das metas.
function primeiraFaturaDaCompra(idx, cartao) {
    const proximo = Estado.ciclos[idx + 1];
    if (!proximo) return null;
    const dia = String(DIA_VENCIMENTO_CARTAO[cartao]).padStart(2, '0');
    const fatura = `${dataISO(proximo.ini).slice(0, 7)}-${dia}`;
    return fatura < dataISO(proximo.ini) ? `${somaMeses(fatura, 1).slice(0, 7)}-${dia}` : fatura;
}

function previstasDoCiclo(idx, base) {
    const ciclo = Estado.ciclos[idx];
    const proximo = Estado.ciclos[idx + 1];
    if (!ciclo || !proximo || Estado.idxHoje == null || Estado.idxHoje < 0 || idx < Estado.idxHoje) return [];
    const reais = base.filter(r => !r._prev);
    const linhas = [...reais.filter(r => r.periodoIdx === idx && !r.cred), ...creditosExibidosNoCiclo(reais, idx)];
    const tetos = limitesCategoriaDoCiclo(idx);
    const fatura = primeiraFaturaDaCompra(idx, CARTAO_NUBANK);
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

// Base de todos os cálculos e tabelas (filtrarLancamentos): os lançamentos reais, as compras
// previstas de Besteira/Isabella e as linhas do plano das metas. Montada uma vez por desenho
// (limparCachesFinanceiros zera junto com os demais caches), nunca persistida. Enquanto o
// plano das metas é calculado, a base sai sem elas (planoDasMetas devolve vazio).
let _lancamentosComPrevistas = null;
function lancamentosComPrevistas() {
    if (!_lancamentosComPrevistas) {
        const reais = Estado.lancamentos;
        const metas = linhasDasMetas();
        _lancamentosComPrevistas = [...reais, ...Estado.ciclos.flatMap((_, idx) => previstasDoCiclo(idx, reais)), ...metas];
    }
    return _lancamentosComPrevistas;
}

// ===================================================================
// METAS (fin_meta, migration 36)
// ===================================================================
// O mantenedor só informa nome, valor médio e mês (ou uma âncora ± meses). O plano sai daqui,
// em cascata pela data (as metas disputam o mesmo guardado e o mesmo limite), e as linhas
// dele entram como previstas na base de todos os cálculos — saldo, Aporte/Resgate, guardado,
// data da Reserva, fatura, Livre Futuro e Comprometido já enxergam as metas. Formas:
//   - à vista (débito no ciclo), se o guardado projetado, menos o que as metas anteriores já
//     usaram, cobre o valor (as metas podem usar o guardado abaixo da meta da Reserva)
//   - cartão parcelado sem juros, se o Livre do cartão naquele ciclo comporta a compra
//     inteira (o banco bloqueia tudo na hora) e as parcelas não levam o Comprometido acima
//     do teto em nenhum ciclo
//   - entrada + financiamento, só quando a meta pede: entrada à vista, parcelas com juros
//     (Price) marcadas Comprometido
// "auto" tenta à vista e depois cartão. Se nada cabe no mês pedido, a meta fica nele mesmo
// (o buraco aparece no saldo daquele ciclo) e o plano diz o 1º ciclo em que caberia.
const JUROS_PADRAO_METAS = 3;                  // % a.m. quando a meta financiada não diz o seu
const PARCELAS_SEM_JUROS_PADRAO_METAS = 10;    // vezes no cartão quando a meta não diz
const PRAZOS_FINANCIAMENTO_METAS = [6, 12, 18, 24, 36, 48, 60];

// Mês da meta (AAAA-MM-01): o próprio, ou o da âncora ± deslocamento. Um nível só: a âncora
// vale pelo mês dela. Sem data (âncora excluída, sem mês) não há plano.
function mesDaMeta(meta, porId) {
    const ancora = meta.ancora_meta_id != null ? porId.get(meta.ancora_meta_id) : null;
    if (ancora) return ancora.mes ? somaMeses(ancora.mes, meta.deslocamento || 0) : null;
    return meta.mes || null;
}

// Ciclo do mês: o que começa naquele mês (o mesmo nome que a navegação mostra, ex.: Mar/27).
const cicloDoMes = mes => (mes ? Estado.ciclos.findIndex(c => dataISO(c.ini).slice(0, 7) === mes.slice(0, 7)) : -1);

// Parcela fixa (tabela Price) de `valor` em `n` vezes a `jurosPct` % ao mês.
function prestacao(valor, jurosPct, n) {
    const i = jurosPct / 100;
    return i ? valor * i / (1 - (1 + i) ** -n) : valor / n;
}

// Linha prevista de uma meta: não existe no banco (id negativo, _prev), aparece nas tabelas
// como as previstas de Besteira/Isabella e entra em todo cálculo como um lançamento aberto.
function linhaDaMeta(meta, k, campos) {
    const linha = {
        nome: meta.nome, categ: 'Meta', freq: null, pago: false, comprometido: false, reserva: false, pra_sempre: false,
        obs: null, canal: null, prio: null, cred: false, fatura: null, recorrencia_id: null, inv: false,
        ...campos, id: -(1000 + meta.id * 1000 + k), _sid: `meta:${meta.id}:${k}`, _prev: 1, _meta: meta.id,
    };
    linha.valor = linha.v;
    linha.periodoIdx = periodoDoLancamento(linha);
    return linha;
}
const dataDoCiclo = idx => dataISO(Estado.ciclos[idx].ini);
const centavos = v => Math.round(v * 100) / 100;

// Valor dividido em n partes com a diferença de centavos na última (como o cadastro faz).
const partesIguais = (valor, n) => {
    const parte = centavos(valor / n);
    return Array.from({ length: n }, (_, p) => (p === n - 1 ? centavos(valor - parte * (n - 1)) : parte));
};

// Contexto do cálculo, montado uma vez: guardado projetado sem metas, Livre de cada cartão e
// Comprometido por ciclo, com linhas extras (as das metas anteriores e as da candidata).
function contextoDoPlano() {
    const reaisPorCiclo = new Map();
    Estado.lancamentos.forEach(r => {
        if (r.periodoIdx == null) return;
        if (!reaisPorCiclo.has(r.periodoIdx)) reaisPorCiclo.set(r.periodoIdx, []);
        reaisPorCiclo.get(r.periodoIdx).push(r);
    });
    const guardados = new Map();
    const teto = LIMITES_COMPROMISSOS[0].percentual;
    return {
        guardado: c => { if (!guardados.has(c)) guardados.set(c, guardadoAte(c)); return guardados.get(c); },
        // Livre no ciclo c: faturas até c já pagas; compras confirmadas cobradas depois ocupam.
        livre: (c, cartao) => limiteCartaoLivre(Estado.lancamentos, {},
            cartao === CARTAO_NUBANK ? garantiaDoCiclo(c, guardadoGarantidoAte(Estado.lancamentos, c)).efetiva : 0,
            c, cartao, aprovadoDoCiclo(c, cartao)),
        // % do faturamento do ciclo; null sem entrada nenhuma (sem base pra comparar ao teto).
        comprometido: (c, extras) => {
            const dados = dadosCompromissosDoCiclo([...(reaisPorCiclo.get(c) || []), ...extras.filter(r => r.periodoIdx === c)]
                .map(r => ({ ...r, _transferencia: ehTransferenciaFatura(r) })));
            return dados.faturamento > TOLERANCIA_FINANCEIRA ? dados.limites[0].percentualFaturamento : null;
        },
        cabeNoTeto(linhasNovas, extras) {
            const ciclos = [...new Set(linhasNovas.filter(r => r.comprometido || ehParcelaDeCompra(r)).map(r => r.periodoIdx))];
            const percentuais = ciclos.map(c => this.comprometido(c, extras)).filter(p => p != null);
            return { ok: percentuais.every(p => p <= teto + 1e-9), maximo: percentuais.length ? Math.max(...percentuais) : null };
        },
    };
}

// Cada forma, num ciclo c, com as linhas das metas anteriores. Devolve o plano ou null.
function formasDaMeta(meta, c, anteriores, ctx) {
    const valor = meta.valor;
    const gasto = anteriores.filter(r => r.periodoIdx != null && r.periodoIdx <= c).reduce((s, r) => s - r.v, 0);
    const disponivel = ctx.guardado(c) - gasto;
    const formas = {
        avista() {
            if (disponivel < valor - TOLERANCIA_FINANCEIRA) return null;
            return { forma: 'avista', linhas: [linhaDaMeta(meta, 0, { data: dataDoCiclo(c), v: -valor })] };
        },
        cartao() {
            const n = meta.parcelas || PARCELAS_SEM_JUROS_PADRAO_METAS;
            for (const cartao of CARTOES) {
                const fatura = primeiraFaturaDaCompra(c, cartao);
                if (!fatura) continue;
                // Compras das metas anteriores feitas até c e cobradas depois dele ocupam o cartão.
                const ocupado = anteriores.filter(r => r.cred && r._compra <= c && r.periodoIdx > c && cartaoDaFatura(r.fatura) === cartao)
                    .reduce((s, r) => s - r.v, 0);
                if (ctx.livre(c, cartao) - ocupado < valor - TOLERANCIA_FINANCEIRA) continue;
                const linhas = partesIguais(valor, n).map((v, p) => linhaDaMeta(meta, p, {
                    data: dataDoCiclo(c), cred: true, fatura: somaMeses(fatura, p), v: -v,
                    recorrencia_id: n > 1 ? `meta-${meta.id}` : null,
                })).filter(r => r.periodoIdx != null).map(r => ({ ...r, _compra: c }));
                const teto = ctx.cabeNoTeto(linhas, [...anteriores, ...linhas]);
                if (!teto.ok) continue;
                return { forma: 'cartao', cartao, parcelas: n, parcela: linhas[0]?.valor ? -linhas[0].valor : valor / n, linhas, comprometidoMax: teto.maximo };
            }
            return null;
        },
        financiamento() {
            const entrada = Math.min(valor, meta.entrada != null ? meta.entrada : Math.max(0, disponivel));
            if (entrada > disponivel + TOLERANCIA_FINANCEIRA) return null;
            const financiado = centavos(valor - entrada);
            const juros = meta.juros_mensal != null ? meta.juros_mensal : JUROS_PADRAO_METAS;
            const entradaLinhas = entrada > TOLERANCIA_FINANCEIRA
                ? [linhaDaMeta(meta, 0, { nome: `Entrada · ${meta.nome}`, data: dataDoCiclo(c), v: -centavos(entrada) })] : [];
            if (financiado <= TOLERANCIA_FINANCEIRA) return { forma: 'financiamento', entrada, financiado: 0, parcelas: 0, parcela: 0, juros, jurosTotal: 0, linhas: entradaLinhas };
            for (const n of meta.parcelas ? [meta.parcelas] : PRAZOS_FINANCIAMENTO_METAS) {
                const parcela = centavos(prestacao(financiado, juros, n));
                const linhas = [...entradaLinhas, ...Array.from({ length: n }, (_, p) => c + 1 + p)
                    .filter(j => Estado.ciclos[j])
                    .map((j, p) => linhaDaMeta(meta, p + 1, { data: dataDoCiclo(j), v: -parcela, comprometido: true }))];
                const teto = ctx.cabeNoTeto(linhas, [...anteriores, ...linhas]);
                if (!teto.ok) continue;
                return { forma: 'financiamento', entrada, financiado, parcelas: n, parcela, juros, jurosTotal: centavos(parcela * n - financiado), linhas, comprometidoMax: teto.maximo };
            }
            return null;
        },
    };
    const ordem = meta.forma === 'auto' || !meta.forma ? ['avista', 'cartao'] : [meta.forma];
    for (const forma of ordem) {
        const plano = formas[forma]();
        if (plano) return { ...plano, disponivel };
    }
    return null;
}

// Custo depois da compra (seguro, IPVA rateado): uma linha Comprometido por ciclo seguinte.
const custoDaMeta = (meta, c) => !(meta.custo_mensal > 0) ? []
    : Estado.ciclos.map((_, j) => j).filter(j => j > c)
        .map(j => linhaDaMeta(meta, 500 + j, { nome: `Custo · ${meta.nome}`, data: dataDoCiclo(j), v: -meta.custo_mensal, comprometido: true }));

function calcularPlanoDasMetas() {
    const todas = Estado.metas || [];
    const porId = new Map(todas.map(m => [m.id, m]));
    const metas = todas
        .filter(m => m.status === 'aberta' && m.valor > 0)
        .map(meta => { const mes = mesDaMeta(meta, porId); return { meta, mes, ciclo: cicloDoMes(mes) }; })
        .sort((a, b) => (a.ciclo < 0) - (b.ciclo < 0) || a.ciclo - b.ciclo || a.meta.id - b.meta.id);
    if (!metas.length) return [];
    const ctx = contextoDoPlano();
    const anteriores = [];
    return metas.map(({ meta, mes, ciclo }) => {
        const plano = { meta, mes, ciclo, cabe: false, cabeEm: null, linhas: [] };
        if (ciclo < 0) return plano;   // sem data ou fora dos ciclos carregados: sem plano
        const escolha = formasDaMeta(meta, ciclo, anteriores, ctx);
        if (escolha) {
            Object.assign(plano, escolha, { cabe: true });
        } else {
            for (let c = ciclo + 1; c < Estado.ciclos.length; c++) {
                if (formasDaMeta(meta, c, anteriores, ctx)) { plano.cabeEm = c; break; }
            }
            // Fica no mês pedido, à vista: o buraco aparece no saldo e no Resgate daquele ciclo.
            const gasto = anteriores.filter(r => r.periodoIdx != null && r.periodoIdx <= ciclo).reduce((s, r) => s - r.v, 0);
            plano.disponivel = ctx.guardado(ciclo) - gasto;
            plano.forma = 'avista';
            plano.falta = centavos(meta.valor - Math.max(0, plano.disponivel));
            plano.linhas = [linhaDaMeta(meta, 0, { data: dataDoCiclo(ciclo), v: -meta.valor })];
        }
        plano.linhas.push(...custoDaMeta(meta, ciclo));
        anteriores.push(...plano.linhas);
        return plano;
    });
}

// Plano das metas, uma vez por desenho (limparCachesFinanceiros recalcula na hora, com os
// caches zerados, pra nunca nascer no meio de um saldo em cálculo). Durante o próprio cálculo
// devolve vazio: o guardado projetado que ele usa é o da base sem as metas.
let _planoMetas = null, _calculandoPlanoMetas = false;
function planoDasMetas() {
    if (_planoMetas) return _planoMetas;
    if (_calculandoPlanoMetas) return [];
    _calculandoPlanoMetas = true;
    try {
        _planoMetas = calcularPlanoDasMetas();
    } finally {
        _calculandoPlanoMetas = false;
        limparCachesDeSaldo();   // o que foi calculado sem as metas não vale mais
    }
    return _planoMetas;
}
const linhasDasMetas = () => planoDasMetas().flatMap(p => p.linhas);

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
function limparCachesDeSaldo() {
    Object.keys(_cacheSaldo).forEach(k => delete _cacheSaldo[k]);
    Object.keys(_cacheAjuste).forEach(k => delete _cacheAjuste[k]);
    _baseFiltrada = _abatFiltrada = null;
    _lancamentosComPrevistas = null;
}
// Também refaz o plano das metas já aqui, com tudo zerado (ver planoDasMetas).
function limparCachesFinanceiros() {
    limparCachesDeSaldo();
    _planoMetas = null;
    planoDasMetas();
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
