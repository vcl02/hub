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
// O mantenedor informa nome, valor total e o mês e, se parcelar, as vezes, a entrada
// (parte do total) e o mês dela. O plano sai daqui, em cascata pela
// data (as metas disputam o mesmo guardado e o mesmo limite), e as linhas dele entram como
// previstas na base de todos os cálculos — saldo, Aporte/Resgate, guardado, data da Reserva,
// fatura, Livre Futuro e Comprometido já enxergam as metas (ver planoNoCiclo). A forma é a
// escolhida: À vista, Parcelado Crédito ou Parcelado Débito; "auto" (o padrão antigo
// da tabela) vale como À vista. Sem juros por enquanto: parcela = resto ÷ vezes.
const PARCELAS_PADRAO_METAS = 10;             // vezes quando a meta não diz
const formaDaMeta = meta => (['cartao', 'financiamento'].includes(meta.forma) ? meta.forma : 'avista');

// Ciclo do mês: o que começa naquele mês (o mesmo nome que a navegação mostra, ex.: Mar/27).
const cicloDoMes = mes => (mes ? Estado.ciclos.findIndex(c => dataISO(c.ini).slice(0, 7) === mes.slice(0, 7)) : -1);

// Linha prevista de uma meta: não existe no banco (id negativo, _prev), aparece nas tabelas
// como as previstas de Besteira/Isabella e entra em todo cálculo como um lançamento aberto.
function linhaDaMeta(meta, k, campos) {
    const linha = {
        nome: meta.nome, categ: 'Meta', freq: null, pago: false, comprometido: false, reserva: false, pra_sempre: false,
        obs: null, canal: null, prio: null, cred: false, fatura: null, recorrencia_id: null, inv: false,
        ...campos, id: -(1000 + meta.id * 1000 + k), _sid: `meta:${meta.id}:${k}`, _prev: 1, _meta: meta.id, _parte: k,
    };
    linha.valor = linha.v;
    linha.periodoIdx = periodoDoLancamento(linha);
    return linha;
}
const dataDoCiclo = idx => dataISO(Estado.ciclos[idx].ini);
// O que o mês j deixa, com as metas: a variação do guardado projetado sem metas (o Aporte
// sugerido ou o Resgate do mês) menos o que as linhas de metas pagam nele. Diferente do
// guardado que sobra (acumulado): um mês pode deixar negativo e o guardado continuar positivo.
const deixaNoMes = (ctx, metas, j) => ctx.guardado(j) - (j > 0 ? ctx.guardado(j - 1) : 0) -
    metas.filter(r => r.periodoIdx === j).reduce((s, r) => s - r.v, 0);
// Quanto as linhas (de metas) já pagaram até o ciclo j, inclusive.
const pagoAteCiclo = (linhas, j) => linhas.filter(r => r.periodoIdx != null && r.periodoIdx <= j).reduce((s, r) => s - r.v, 0);
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

// Plano de uma meta com o mês dela no ciclo c, sobre as linhas das metas anteriores. O mês da
// meta é o do pagamento (à vista), o da 1ª parcela (débito) ou o da compra (cartão, 1ª fatura
// no seguinte); a entrada vem `meses_ate_parcela` meses antes (padrão: 1 mês antes), e sem
// entrada esse número fica sem efeito. O resto (total − entrada) se divide nas
// vezes (padrão 10), sem juros.
// No cartão, a compra cabe se o Livre do cartão comporta o resto inteiro (o banco bloqueia
// tudo na hora); no débito, cada parcela é Comprometido.
// Dinheiro: em cada mês de pagamento (entrada, parcelas ou faturas), o guardado projetado,
// menos tudo o que as metas anteriores e esta já pagaram até ali, não pode ficar negativo.
// Comprometido aparece no plano como informação, sem barrar.
// `leve`: só pra saber se cabe (buscas do "cabe em"/"em Nx"), sem o Comprometido de cada mês.
function planoNoCiclo(meta, c, anteriores, ctx, { leve = false } = {}) {
    const forma = formaDaMeta(meta);
    const valor = meta.valor;
    const plano = { forma, disponivel: ctx.guardado(c) - pagoAteCiclo(anteriores, c), linhas: [] };
    if (forma === 'avista') {
        plano.linhas = [linhaDaMeta(meta, 0, { data: dataDoCiclo(c), v: -valor })];
    } else {
        const entrada = centavos(Math.min(valor, meta.entrada > 0 ? meta.entrada : 0));
        const resto = centavos(valor - entrada);
        const n = meta.parcelas || PARCELAS_PADRAO_METAS;
        // Meses da entrada até o mês da meta. Antes do 1º ciclo carregado, a entrada fica nele.
        const antes = entrada > TOLERANCIA_FINANCEIRA ? Math.max(0, meta.meses_ate_parcela ?? 1) : 0;
        const cicloEntrada = Math.max(0, c - antes);
        const partes = resto > TOLERANCIA_FINANCEIRA ? partesIguais(resto, n) : [];
        Object.assign(plano, { entrada, parcelas: partes.length, parcela: partes[0] || 0, cicloEntrada });
        if (entrada > TOLERANCIA_FINANCEIRA) {
            plano.linhas.push(linhaDaMeta(meta, 900, { nome: `Entrada · ${meta.nome}`, data: dataDoCiclo(cicloEntrada), v: -entrada }));
        }
        if (forma === 'cartao' && partes.length) {
            const compra = c;   // no mês da meta
            const comLimite = Estado.ciclos[compra] && CARTOES.find(cartao => {
                // Compras das metas anteriores feitas até a compra e cobradas depois ocupam o cartão.
                const ocupado = anteriores.filter(r => r.cred && r._compra <= compra && r.periodoIdx > compra && cartaoDaFatura(r.fatura) === cartao)
                    .reduce((s, r) => s - r.v, 0);
                return ctx.livre(compra, cartao) - ocupado >= resto - TOLERANCIA_FINANCEIRA;
            });
            plano.cartao = comLimite || CARTAO_NUBANK;
            plano.semLimite = !comLimite;
            const fatura = Estado.ciclos[compra] && primeiraFaturaDaCompra(compra, plano.cartao);
            if (fatura) {
                plano.linhas.push(...partes.map((v, p) => linhaDaMeta(meta, p + 1, {
                    data: dataDoCiclo(compra), cred: true, fatura: somaMeses(fatura, p), v: -v,
                    recorrencia_id: n > 1 ? `meta-${meta.id}` : null,
                })).filter(r => r.periodoIdx != null).map(r => ({ ...r, _compra: compra })));
            }
        } else {
            plano.linhas.push(...partes.map((v, p) => [c + p, v]).filter(([j]) => Estado.ciclos[j])
                .map(([j, v], p) => linhaDaMeta(meta, p + 1, { data: dataDoCiclo(j), v: -v, comprometido: true })));
        }
        if (!leve && plano.linhas.some(r => r.comprometido || ehParcelaDeCompra(r))) {
            plano.comprometidoMax = ctx.cabeNoTeto(plano.linhas, [...anteriores, ...plano.linhas]).maximo;
        }
    }
    // Dinheiro em cada mês de pagamento: o pior buraco e o 1º mês em que ele aparece.
    plano.falta = 0;
    [...new Set(plano.linhas.map(r => r.periodoIdx))].sort((x, y) => x - y).forEach(j => {
        const sobra = ctx.guardado(j) - pagoAteCiclo(anteriores, j) - pagoAteCiclo(plano.linhas, j);
        if (sobra < -TOLERANCIA_FINANCEIRA) {
            if (plano.cicloFalta == null) plano.cicloFalta = j;
            plano.falta = Math.max(plano.falta, centavos(-sobra));
        }
    });
    plano.cabe = plano.falta <= TOLERANCIA_FINANCEIRA && !plano.semLimite;
    return plano;
}

// Mês a mês do plano escolhido (o detalhe no modal): em cada mês em que esta meta paga algo,
// o que sai (entrada, parcela k/N ou à vista), o que sobra do guardado projetado depois das
// metas anteriores e desta até ali (negativo = falta, a mesma conta do "cabe") e o
// Comprometido do ciclo contando as metas anteriores e esta (null sem entrada no ciclo).
// Só pro plano final: o Comprometido de cada mês custa, e a busca do "cabe" não precisa dele.
function detalheDoPlano(plano, anteriores, ctx) {
    const extras = [...anteriores, ...plano.linhas];
    return [...new Set(plano.linhas.map(r => r.periodoIdx).filter(j => j != null))].sort((x, y) => x - y).map(j => {
        const doMes = plano.linhas.filter(r => r.periodoIdx === j);
        return {
            ciclo: j,
            itens: doMes.map(r => ({
                rotulo: r._parte === 900 ? 'Entrada' : plano.forma === 'avista' ? 'À vista' : `Parcela ${r._parte}/${plano.parcelas}`,
                valor: -r.v,
            })),
            sai: centavos(doMes.reduce((s, r) => s - r.v, 0)),
            deixa: centavos(deixaNoMes(ctx, extras, j)),
            sobra: centavos(ctx.guardado(j) - pagoAteCiclo(anteriores, j) - pagoAteCiclo(plano.linhas, j)),
            comprometido: ctx.comprometido(j, extras),
        };
    });
}

// ===================================================================
// PRA CABER: sugestões de corte por regra (sem IA), pra uma meta que não cabe
// ===================================================================
// Duas fontes de dinheiro, sempre do ciclo atual em diante:
// - Tetos de Besteira/Isabella: o app supõe o teto inteiro gasto (a prevista do ciclo, que cai
//   na fatura do ciclo seguinte); baixar o teto devolve até o valor da prevista.
// - Pular lançamento: saída real em aberto que não é Comprometido (o "intocável"), Reserva,
//   Investimento (Aporte/Resgate já são a própria conta do guardado: mexer neles só troca o
//   dinheiro de lugar), transferência de fatura nem gasto que conta num teto (cortar esse só
//   faria a prevista crescer o mesmo tanto — pra ele, a alavanca é o teto).
// Investimento fica de fora porque a falta já é medida contra todo o guardado projetado, com
// Aporte sugerido e Resgate necessário de cada ciclo: não há aporte a diminuir que vire dinheiro.
function candidatosPraCaber() {
    const tetos = lancamentosComPrevistas().filter(r => r._prev && String(r._sid).startsWith('prev:')).map(r => {
        const [, chave, idx] = r._sid.split(':');
        return { tipo: 'teto', chave, cicloTeto: +idx, ciclo: r.periodoIdx, ganho: -r.v, parcial: true };
    }).filter(c => c.ciclo != null && Estado.ciclos[c.cicloTeto]?.cicloId != null);
    const noTeto = r => contaNoTeto(r, CATEGORIA_BESTEIRA) || contaNoTeto(r, ehGastoIsabella);
    const lancamentos = Estado.lancamentos.filter(r =>
        r.periodoIdx != null && r.periodoIdx >= Estado.idxHoje && !r.pago && (r.v || 0) < -TOLERANCIA_FINANCEIRA &&
        !r.comprometido && !r.reserva && !ehCategoriaInvestimento(r.categ) && !ehTransferenciaFatura(r) && !noTeto(r),
    ).map(r => ({ tipo: 'pular', id: r.id, grupo: r.recorrencia_id ?? `id:${r.id}`, nome: r.nome, data: r.data, ciclo: r.periodoIdx, ganho: -r.v }));
    return { tetos, lancamentos };
}

// Uma receita: em cada mês com falta (em ordem), completa o que falta com cortes de ciclos até
// ali — a falta é acumulada, então um corte ajuda o próprio mês e os seguintes, e um corte
// depois do buraco não ajuda o buraco. Escolhe primeiro o corte mais perto do buraco (abre
// mão do mínimo de tempo) e, no mesmo ciclo, o maior. Teto corta só o que falta; lançamento
// sai inteiro. É uma estimativa: o Simular refaz a conta de verdade.
function receitaPraCaber(faltas, candidatos) {
    const usado = new Map();
    const cobertoAte = j => [...usado].reduce((s, [c, v]) => s + (c.ciclo <= j ? v : 0), 0);
    faltas.forEach(({ ciclo: j, falta }) => {
        let resta = falta - cobertoAte(j);
        candidatos.filter(c => c.ciclo <= j)
            .sort((a, b) => b.ciclo - a.ciclo || b.ganho - a.ganho)
            .forEach(c => {
                const livre = c.ganho - (usado.get(c) || 0);
                if (resta <= TOLERANCIA_FINANCEIRA || livre <= TOLERANCIA_FINANCEIRA || (!c.parcial && usado.has(c))) return;
                const valor = c.parcial ? Math.min(livre, resta) : c.ganho;
                usado.set(c, centavos((usado.get(c) || 0) + valor));
                resta -= valor;
            });
    });
    const resta = Math.max(0, ...faltas.map(({ ciclo, falta }) => centavos(falta - cobertoAte(ciclo))));
    const cortes = [...usado].map(([c, valor]) => ({ ...c, valor }));
    return { cortes, ganho: centavos(cortes.reduce((s, c) => s + c.valor, 0)), resta, cobre: resta <= TOLERANCIA_FINANCEIRA };
}

// Receitas de uma meta que não cabe por falta de dinheiro: só tetos, só pular lançamentos e,
// quando nenhuma das duas cobre sozinha, as duas juntas. Vazia quando cabe ou falta limite.
function receitasPraCaber(plano) {
    const faltas = (plano.porMes || []).filter(m => m.sobra < -TOLERANCIA_FINANCEIRA).map(m => ({ ciclo: m.ciclo, falta: -m.sobra }));
    if (plano.cabe || !faltas.length) return [];
    const { tetos, lancamentos } = candidatosPraCaber();
    const receitas = [
        { titulo: 'Diminuir tetos', ...receitaPraCaber(faltas, tetos) },
        { titulo: 'Pular lançamentos', ...receitaPraCaber(faltas, lancamentos) },
    ].filter(r => r.cortes.length);
    if (receitas.length === 2 && !receitas.some(r => r.cobre)) {
        receitas.push({ titulo: 'Tetos e lançamentos', ...receitaPraCaber(faltas, [...tetos, ...lancamentos]) });
    }
    return receitas;
}

// Quando nem cortando dá: o que já está Comprometido do ciclo atual até o último mês com
// falta — saídas em aberto marcadas Comprometido, parcelas de compra no cartão e as linhas das
// outras metas —, por grupo (recorrência, meta ou lançamento), do maior total pro menor. É o
// dinheiro que o "Pra caber" não toca; a lista serve pra analisar o que dá pra rever.
function comprometidosAteAFalta(plano) {
    const faltas = (plano.porMes || []).filter(m => m.sobra < -TOLERANCIA_FINANCEIRA);
    if (!faltas.length) return null;
    const ate = Math.max(...faltas.map(m => m.ciclo));
    const grupos = new Map();
    lancamentosComPrevistas().filter(r =>
        !String(r._sid || '').startsWith('prev:') && r._meta !== plano.meta.id &&
        r.periodoIdx != null && r.periodoIdx >= Estado.idxHoje && r.periodoIdx <= ate &&
        !r.pago && (r.v || 0) < -TOLERANCIA_FINANCEIRA && (r.comprometido || ehParcelaDeCompra(r)),
    ).forEach(r => {
        const chave = r._meta != null ? `meta:${r._meta}` : r.recorrencia_id ?? `id:${r.id}`;
        if (!grupos.has(chave)) grupos.set(chave, { nome: r._meta != null ? (Estado.metas.find(m => m.id === r._meta)?.nome ?? r.nome) : r.nome, categ: r.categ, meta: r._meta != null, ciclos: [], total: 0 });
        const g = grupos.get(chave);
        g.ciclos.push(r.periodoIdx);
        g.total = centavos(g.total - r.v);
    });
    const lista = [...grupos.values()].sort((a, b) => b.total - a.total);
    return { ate, total: centavos(lista.reduce((s, g) => s + g.total, 0)), grupos: lista };
}

// Quanto o mês típico precisa sobrar pra uma meta parcelada ser "ideal", lido de hoje, sem as
// metas (o plano é calculado com a base sem elas). Reserva incompleta: o que falta dela, pra
// completar até a última parcela da opção (o valor por mês depende de cada opção, ver
// opcoesDeVezes). Reserva completa (ou sem meta): manter o ritmo de hoje rumo à Liberdade — a
// mediana do que cada mês deixou nos últimos 12 ciclos até hoje (Aporte/Resgate), nunca
// negativa: a meta não pode tirar do que já vai pra Liberdade todo mês.
function alvoDeSobraMensal(ctx) {
    const hoje = Estado.idxHoje;
    if (hoje == null || hoje < 0) return null;
    const reserva = dadosMetaReservaEmergenciaCiclo(hoje);
    if (reserva.meta > TOLERANCIA_FINANCEIRA && reserva.restante > TOLERANCIA_FINANCEIRA) {
        return { tipo: 'reserva', restante: centavos(reserva.restante) };
    }
    const meses = [];
    for (let j = Math.max(0, hoje - MESES_MEDIA_LIBERDADE_FINANCEIRA + 1); j <= hoje; j++) {
        meses.push(ctx.guardado(j) - (j > 0 ? ctx.guardado(j - 1) : 0));
    }
    meses.sort((a, b) => a - b);
    const meio = Math.floor(meses.length / 2);
    const mediana = meses.length % 2 ? meses[meio] : (meses[meio - 1] + meses[meio]) / 2;
    return { tipo: 'liberdade', ritmo: centavos(Math.max(0, mediana || 0)) };
}

// O alvo de sobra de uma opção: a parte da Reserva que falta por mês até a última parcela
// (de hoje até ela, inclusive) ou o ritmo da Liberdade.
const sobraAlvoDaOpcao = (alvo, fim) => (alvo.tipo === 'reserva'
    ? centavos(alvo.restante / Math.max(1, fim - Estado.idxHoje + 1)) : alvo.ritmo);

// Quanto sobra por mês com as parcelas (deixaNoMes), nos meses com parcela: o mês **típico**
// (mediana) e o **pior** (com o ciclo dele). O mês só da entrada fica de fora: ela é uma vez
// só e não muda com o número de vezes. O ideal olha o típico: um mês que já é negativo sem
// a meta (ex.: dezembro com IPVA e presentes) nunca chegaria a R$ 1.000 com vezes nenhuma.
// Null sem parcela nos ciclos carregados.
function folgaDoPlano(plano, anteriores, ctx) {
    const linhas = [...anteriores, ...plano.linhas];
    const meses = [...new Set(plano.linhas.filter(r => r._parte !== 900).map(r => r.periodoIdx).filter(j => j != null))];
    if (!meses.length) return null;
    const porMes = meses.map(j => ({ ciclo: j, valor: centavos(deixaNoMes(ctx, linhas, j)) })).sort((a, b) => a.valor - b.valor);
    const meio = Math.floor(porMes.length / 2);
    const tipica = porMes.length % 2 ? porMes[meio].valor : centavos((porMes[meio - 1].valor + porMes[meio].valor) / 2);
    return { tipica, pior: porMes[0].valor, cicloPior: porMes[0].ciclo };
}

// Opções de vezes de uma meta parcelada, de 1x até a última parcela caber nos ciclos carregados
// (depois disso as parcelas somem da conta e "caberia" à toa): o **mínimo** que cabe e o
// **ideal**, o menor que cabe com o mês típico sobrando ao menos o alvo (alvoDeSobraMensal:
// Reserva até a última parcela ou o ritmo da Liberdade). Cada uma com a prévia (parcela, 1ª e
// última, mês típico e pior, alvo); `atual` traz a do número escolhido.
function opcoesDeVezes(meta, plano, anteriores, ctx, alvo) {
    const ate = Math.min(120, Estado.ciclos.length - plano.ciclo - (plano.forma === 'cartao' ? 1 : 0));
    const previa = (vezes, p) => {
        const meses = p.linhas.filter(r => r._parte !== 900).map(r => r.periodoIdx).filter(j => j != null);
        return { vezes, parcela: p.parcela, ini: Math.min(...meses), fim: Math.max(...meses), ...folgaDoPlano(p, anteriores, ctx) };
    };
    const opcoes = { alvo, atual: previa(plano.parcelas, plano), minimo: null, ideal: null };
    for (let n = 1; n <= ate && !opcoes.ideal; n++) {
        const p = n === plano.parcelas ? plano : planoNoCiclo({ ...meta, parcelas: n }, plano.ciclo, anteriores, ctx, { leve: true });
        if (!p.cabe || !p.parcelas) continue;
        const opcao = previa(n, p);
        if (!opcoes.minimo) opcoes.minimo = opcao;
        opcao.alvo = alvo ? sobraAlvoDaOpcao(alvo, opcao.fim) : null;
        if (opcao.alvo != null && opcao.tipica != null && opcao.tipica >= opcao.alvo - TOLERANCIA_FINANCEIRA) opcoes.ideal = opcao;
    }
    return opcoes;
}

function calcularPlanoDasMetas() {
    const todas = Estado.metas || [];
    const metas = todas
        .filter(m => m.status === 'aberta' && m.valor > 0)
        .map(meta => ({ meta, mes: meta.mes || null, ciclo: cicloDoMes(meta.mes) }))
        .sort((a, b) => (a.ciclo < 0) - (b.ciclo < 0) || a.ciclo - b.ciclo || a.meta.id - b.meta.id);
    if (!metas.length) return [];
    const ctx = contextoDoPlano();
    const alvo = alvoDeSobraMensal(ctx);
    const anteriores = [];
    return metas.map(({ meta, mes, ciclo }) => {
        if (ciclo < 0) return { meta, mes, ciclo, cabe: false, cabeEm: null, linhas: [] };   // sem data ou fora dos ciclos
        // O plano fica sempre no mês pedido (o buraco, se houver, aparece no saldo daqueles
        // ciclos); sem caber, diz também o 1º mês da meta em que tudo caberia, com a entrada
        // 1 mês antes — o que acontece de fato ao mudar o mês da meta (ver interactions.js).
        const plano = { meta, mes, ciclo, cabeEm: null, ...planoNoCiclo(meta, ciclo, anteriores, ctx) };
        if (!plano.cabe) {
            const movida = { ...meta, meses_ate_parcela: 1 };
            for (let c = ciclo + 1; c < Estado.ciclos.length; c++) {
                if (planoNoCiclo(movida, c, anteriores, ctx, { leve: true }).cabe) { plano.cabeEm = c; break; }
            }
        }
        // Parcelado: as opções de vezes (mínimo que cabe e o ideal com folga), e o "em Nx" do
        // Pra caber quando o atual não cabe e mais vezes resolvem.
        if (plano.forma !== 'avista' && plano.parcelas) {
            plano.opcoesVezes = opcoesDeVezes(meta, plano, anteriores, ctx, alvo);
            const minimo = plano.opcoesVezes.minimo;
            if (!plano.cabe && minimo && minimo.vezes > plano.parcelas) plano.vezesQueCabe = minimo.vezes;
        }
        plano.porMes = detalheDoPlano(plano, anteriores, ctx);
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
