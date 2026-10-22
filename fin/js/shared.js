// Utilitários de tela, datas, recorrências e classificação de lançamentos.

// HELPERS
const el = id => document.getElementById(id);
// mostra/esconde um campo da barra de filtros com fade suave, em vez do corte seco do
// atributo hidden. Ao aparecer: tira o hidden e roda o fadeIn. Ao sumir: roda o fadeOut
// e SO' entao aplica hidden (fora do fluxo, sem deixar buraco) quando a animacao termina —
// nao antes, senao o hidden corta a transicao no meio.
// Duas redes de seguranca contra o campo ficar preso visivel pra sempre:
//  1) se for chamada de novo antes do fadeOut anterior terminar (troca rapida de visao,
//     ida e volta), o timer/listener pendentes sao cancelados aqui e reagendados do zero;
//  2) um setTimeout um pouco mais longo que a animacao aplica hidden=true de qualquer
//     jeito, caso o evento 'animationend' nunca dispare (prefers-reduced-motion desativa
//     a animacao sem disparar o evento, aba em background, etc) — sem essa rede, o campo
//     fica visivel escondido atras do 'return' de jaResolvidoAssim pra sempre.
function mostraComFade(id, mostrar) {
    const alvo = el(id);
    if (alvo._fadeOutHandler) { alvo.removeEventListener('animationend', alvo._fadeOutHandler); alvo._fadeOutHandler = null; }
    if (alvo._fadeOutTimer) { clearTimeout(alvo._fadeOutTimer); alvo._fadeOutTimer = null; }
    // "definitivamente visivel" = sem hidden e sem estar no meio de um fadeOut (que ainda
    // vai acabar escondendo). So pula o trabalho se o estado final ja bate com o pedido.
    const jaResolvidoAssim = mostrar ? (!alvo.hidden && !alvo.classList.contains('fadeOut')) : alvo.hidden;
    if (jaResolvidoAssim) return;
    alvo.classList.remove('fadeIn', 'fadeOut');
    if (mostrar) {
        alvo.hidden = false;
        void alvo.offsetWidth;   // forca reflow pra garantir que a animacao rode desde o inicio
        alvo.classList.add('fadeIn');
    } else {
        alvo.classList.add('fadeOut');
        const termina = () => {
            alvo.hidden = true;
            alvo.classList.remove('fadeOut');
            if (alvo._fadeOutHandler) { alvo.removeEventListener('animationend', alvo._fadeOutHandler); alvo._fadeOutHandler = null; }
            if (alvo._fadeOutTimer) { clearTimeout(alvo._fadeOutTimer); alvo._fadeOutTimer = null; }
        };
        alvo._fadeOutHandler = termina;
        alvo.addEventListener('animationend', termina, { once: true });
        alvo._fadeOutTimer = setTimeout(termina, 250);   // duracao do fadeOut (.18s) + folga
    }
}
// Resíduos de ponto flutuante menores que meio centavo já são R$ 0,00 na tela. Normalizá-los
// aqui evita o falso "-R$ 0,00" sem mudar valores, saldos ou decisões financeiras.
const valorMonetarioExibivel = v => Math.abs(Number(v) || 0) < 0.005 ? 0 : Number(v);
const brl = v => valorMonetarioExibivel(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Valor sem o "-": onde o botão +/− já mostra o sinal ao lado, repeti-lo no número é ruído.
// Só apresentação — o valor guardado e usado nos cálculos continua assinado.
const brlSemSinal = v => brl(Math.abs(valorMonetarioExibivel(v)));
const corValor = v => valorMonetarioExibivel(v) < 0 ? 'vm' : valorMonetarioExibivel(v) > 0 ? 'vd' : ''; // classe css: vermelho/verde conforme o valor mostrado
// Pedido explicito: pra um lancamento de verdade (nunca uma linha sintetica/preview, que
// mantem as 3 cores normais de corValor), zero conta como negativo na aparencia — tanto o
// "sem valor ainda" (NULL no banco, ex.: assinatura de preco variavel) quanto um zero
// gravado de proposito. So' estritamente POSITIVO (> 0) e' que pinta de verde; o resto
// (negativo ou zero) fica vermelho. Nunca afeta total/soma (corSoma ja' trata isso a parte).
const corValorLancamento = r => r._sid ? corValor(r.v) : (valorMonetarioExibivel(r.v) > 0 ? 'vd' : 'vm');
// celula <td> ja formatada em R$, pra uma linha de lancamento de verdade (nunca
// sintetica/preview): usa corValorLancamento em vez de corValor, pelo motivo acima.
const celValorLancamento = r => `<td class="n ${corValorLancamento(r)}">${brl(r.v)}`;
// mesma celValorLancamento, mas clicavel pra edicao inline — so' pra lancamentos REAIS (id
// numerico vindo do banco; linhas sinteticas tem id negativo fixo -1..-6, e simuladas tem
// id tipo "sim-N-P", nenhum dos dois casos existe na tabela lancamentos pra dar PATCH). O
// botao de sinal inverte +/- na hora (mesmo esquema do toggle Pago), sem precisar abrir o
// campo de valor pra so' trocar o sinal.
// botao+valor ficam num wrapper flex proprio (.valorLinha), em vez de no <td> direto: o
// saldo do dia (.sd, ver celulasDaLinha) e' anexado DEPOIS, como outro filho do <td>, e
// precisa continuar em 'display:block' empilhando por baixo — se o <td> virasse flex ele
// tambem, o saldo entraria na mesma linha do botao/valor em vez de ficar abaixo.
const celValorEditavel = r => {
    const positivoVisual = valorMonetarioExibivel(r.v) > 0;
    return `<td class="n ${corValorLancamento(r)}"><span class=valorLinha>` +
        `<button type=button class="sinalBt compacto${positivoVisual ? ' pos' : ''}" data-tog-sinal="${escapeHtml(String(r.id))}" title="Inverter sinal" aria-label="Inverter sinal">${positivoVisual ? '+' : '−'}</button>` +
        `<span class="togValor" data-tog-valor="${escapeHtml(String(r.id))}" title="Editar valor">${brlSemSinal(r.v)}</span></span>`;
};
// Linha calculada (fatura, previstas, aporte/resgate…) ou simulada: mesmo desenho do
// celValorEditavel, pra a coluna Valor ficar alinhada com as linhas reais, mas o botão de
// sinal vem desabilitado e o valor não abre edição — essas linhas não existem no banco.
const celValorSomenteLeitura = (r, v = r.v, cor = corValorLancamento(r)) => {
    const positivoVisual = valorMonetarioExibivel(v) > 0;
    return `<td class="n ${cor}"><span class=valorLinha>` +
        `<button type=button class="sinalBt compacto${positivoVisual ? ' pos' : ''}" disabled title="Somente leitura" aria-label="Sinal (somente leitura)">${positivoVisual ? '+' : '−'}</button>` +
        `<span class=valorFixo>${brlSemSinal(v)}</span></span>`;
};

// Zona morta pra SOMAS/TOTAIS (nunca pra valor de lancamento individual): entre -R$50 e +R$50 (inclusive) fica cinza,
// porque uma diferenca tao pequena nao muda decisao nenhuma — so pinta vermelho/verde quando o total realmente sai desse intervalo.
const corSoma = v => (v >= -50 && v <= 50) ? '' : corValor(v);
const celSoma = v => `<td class="n ${corSoma(v)}">${brl(v)}`;
const dataISO = s => String(s || '').slice(0, 10);                                                              // normaliza pra 'YYYY-MM-DD'
const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);   // hoje em 'YYYY-MM-DD' no fuso local (toISOString sozinho usa UTC e erra o dia a noite)
const timestamp = s => Date.parse(dataISO(s)) || 0;                                                             // YYYY-MM-DD -> numero, pra comparar/ordenar
const dataBR = s => { const p = dataISO(s).split('-'); return p.length == 3 ? `${p[2]}/${p[1]}/${p[0]}` : s };  // YYYY-MM-DD -> DD/MM/YYYY
// tolerancia da busca por Valor: +/- 5 centavos do que foi digitado, pra achar mesmo sem
// bater centavo a centavo (ex: buscar "150" acha 149,97 a 150,03)
const TOLERANCIA_BUSCA_VALOR = 0.05;
const capitaliza = s => String(s ?? '').replace(/^./, c => c.toUpperCase());
// nome de exibicao de uma coluna do lancamento ('nome'/'categ') — normaliza 'categ' pra
// "Categoria" (capitaliza() sozinho faria "Categ") em todo lugar que rotula essa coluna:
// combo "Agrupar por", cabecalho da matriz Comparar e o subtitulo dela.
const nomeColuna = c => c == 'categ' ? 'Categoria' : capitaliza(c);
const semAcento = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');   // escapa aspas/&/<> pra nao quebrar o HTML se algum valor do banco tiver esses caracteres

// filtra valores vazios de verdade (null/undefined/"") E variacoes textuais de "vazio" que podem ter ficado salvas no banco por engano: "null", "<null>", "undefined", "n/a" etc.
const valorValido = v => {
    if (!v) return false;
    const limpo = String(v).trim().toLowerCase().replace(/^<|>$/g, '');
    return !['null', 'undefined', 'nan', 'none', 'n/a'].includes(limpo);
};

// O banco mantém a categoria como texto; uma célula pode trazer mais de uma, separadas
// por vírgula. Esta regra é a fronteira única para leitura, exibição e persistência.
const categoriasSeparadas = valor => {
    const vistas = new Set();
    return String(valor ?? '').split(',')
        .map(categoria => categoria.trim())
        .filter(valorValido)
        .filter(categoria => {
            const chave = semAcento(categoria);
            if (vistas.has(chave)) return false;
            vistas.add(chave);
            return true;
        });
};
const normalizaCategorias = valor => categoriasSeparadas(valor).join(', ');
const ehCategoria = (categ, procurada) =>
    categoriasSeparadas(categ).some(categoria => semAcento(categoria) === semAcento(procurada).trim());

// categoria dedicada pra antecipacao de fatura: um debito nessa categoria abate o quanto ainda falta sair da conta na linha dinamica "Fatura do cartao" (nao duplica o lancamento — ele continua aparecendo normal na tabela de Debito).
const ehAntecipacaoFatura = categ => {
    const c = semAcento(categ).trim();
    return c.includes('antecipacao') && c.includes('fatura');
};

// Antecipacao e' TRANSFERENCIA, nao gasto: a despesa ja foi contada na compra do credito. Entra no fluxo de caixa (bloco Debito) e fica fora das analises de gasto (Comparar, Balanco, evolucao, pizza) — senao a mesma despesa conta duas vezes. Dados antigos podem ter esse rótulo no nome, com categoria genérica; por isso os dois campos identificam a transferência.
const ehTransferenciaFatura = r => !r.cred && (ehAntecipacaoFatura(r.categ) || ehAntecipacaoFatura(r.nome));

// Data a partir da qual voce passou a lancar os pagamentos de fatura. Faturas que venceram antes disso foram pagas sem lancamento, entao tem saldo "fantasma" e engoliriam as antecipacoes novas. AJUSTE aqui quando comecar a lancar. proximo dia (usado pra calcular o inicio de um periodo a partir do 'fat' do anterior)
function proximoDia(iso) {
    const d = new Date(dataISO(iso) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

// Soma N meses a uma data ISO, preservando o dia (com clamp pro ultimo dia do mes de
// destino quando ele nao existe — 31/01 + 1 mes = 28 ou 29/02, nunca "03/03" por
// transbordo). Usada pra datar cada PARCELA de uma compra parcelada: parcela 2 cai ~1
// mes depois da 1a, parcela 3 ~2 meses depois etc — igual uma fatura de cartao de
// verdade, onde cada parcela e' cobrada no ciclo seguinte. Sem isso, todas as parcelas
// ficavam gravadas com a MESMA data no banco; o periodoIdx certo so' existia em memoria
// (calculado na hora do cadastro) e sumia ao recarregar, porque o recalculo (carregarDados)
// deriva o periodo so' a partir da 'data' — e' o que fazia as parcelas desmoronarem todas
// pro mesmo mes depois de dar F5/limpar cache.
function somaMeses(iso, n) {
    if (!n) return dataISO(iso);
    const [y, m, d] = dataISO(iso).split('-').map(Number);
    const alvo = new Date(Date.UTC(y, m - 1 + n, 1));                    // 1o dia do mes de destino
    const ultimoDiaAlvo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
    alvo.setUTCDate(Math.min(d, ultimoDiaAlvo));
    return alvo.toISOString().slice(0, 10);
}

// Data em que se lança o Aporte/Resgate de um ciclo (o fechamento dele). O ciclo aberto
// (fim vazio em fin_ciclo) tem fim '9999-12-31' só pra caber tudo nele; gravar essa data no
// banco seria lixo, então ele usa um fechamento provisório: a véspera do mesmo dia do mês
// seguinte ao início (início 05/10 → 04/11), que continua dentro do próprio ciclo aberto.
function dataDeFechamentoDoCiclo(ciclo) {
    const fim = dataISO(ciclo?.fat);
    if (!fim.startsWith('9999')) return fim;
    const mesSeguinte = somaMeses(dataISO(ciclo.ini), 1);
    const vespera = new Date(Date.UTC(+mesSeguinte.slice(0, 4), +mesSeguinte.slice(5, 7) - 1, +mesSeguinte.slice(8, 10) - 1));
    return vespera.toISOString().slice(0, 10);
}

// Soma N dias corridos a uma data ISO (mesmo padrao UTC de proximoDia/menos30, so' que
// com passo livre) — base das recorrencias que andam por semana, nao por mes.
function somaDias(iso, n) {
    if (!n) return dataISO(iso);
    const d = new Date(dataISO(iso) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

// As opcoes do campo Frequencia, e a REGRA de cada uma: como andar da 1a ocorrencia pra
// proxima quando o lancamento e' repetido/parcelado em N vezes.
//  - 'mes' anda de mes em mes preservando o DIA (via somaMeses, ja com clamp: dia 31 cai
//    no ultimo dia do mes curto, e 29/02 vira 28/02 em ano nao bissexto);
//  - 'dia' anda em dias corridos, o que mantem o MESMO DIA DA SEMANA (7 e 14 sao multiplos
//    de 7) sem depender de calendario.
// A chave e' exatamente o texto gravado na coluna 'freq' do banco — o <option value> no
// index.html usa esses mesmos nomes, entao ler o select ja da' a regra direto.
const RECORRENCIAS = {
    Mensal: { tipo: 'mes', passo: 1 },
    Semanal: { tipo: 'dia', passo: 7 },
    Quinzenal: { tipo: 'dia', passo: 14 },   // "quinze" e' so' o nome de costume — a regra e' de 2 em 2 semanas, nao 15 dias
    Semestral: { tipo: 'mes', passo: 6 },
    Anual: { tipo: 'mes', passo: 12 },       // +12 meses = mesmo dia, ano seguinte
};

// Data da p-esima ocorrencia (p=0 e' a 1a, que cai na propria data digitada) conforme a
// Frequencia escolhida. Frequencia vazia ("sem recorrencia") ou desconhecida cai em
// Mensal: com 1x so' isso nao muda nada (p=0 devolve a propria data), e a partir de 2x
// PRECISA haver algum espacamento — sem regra as N linhas nasceriam todas na mesma data,
// que e' exatamente o bug que fazia as parcelas desabarem no mesmo mes ao recarregar.
// Mensal e' tambem o unico comportamento que existia antes deste campo virar regra.
function dataDaOcorrencia(iso, p, freq) {
    const regra = RECORRENCIAS[freq] || RECORRENCIAS.Mensal;
    const passo = regra.passo * p;
    return regra.tipo == 'dia' ? somaDias(iso, passo) : somaMeses(iso, passo);
}

// Quantas ocorrências da série cabem da 1ª data até `limite` (inclusive). A 1ª sempre
// conta, mesmo se já passar do limite: é o lançamento que a pessoa pediu explicitamente.
function ocorrenciasAteLimite(iso, freq, limite) {
    let n = 1;
    while (dataDaOcorrencia(iso, n, freq) <= limite) n++;
    return n;
}

// Fatura de uma ocorrência da série no Crédito: a 1ª fatura escolhida, avançada pelo
// número de meses de calendário entre a 1ª data e a data da ocorrência. Sempre calculada
// a partir da 1ª (nunca encadeada), pra o clamp de dia 31 não ir encurtando o vencimento.
function faturaDaOcorrencia(faturaInicial, dataInicial, dataOcorrencia) {
    const [y1, m1] = dataISO(dataInicial).split('-').map(Number);
    const [y2, m2] = dataISO(dataOcorrencia).split('-').map(Number);
    return somaMeses(faturaInicial, (y2 - y1) * 12 + (m2 - m1));
}

// Nome de exibicao de um periodo: baseado no mes de inicio do ciclo ou no mes anterior ao fat seguinte.
function nomePeriodo(fatOuCiclo) {
    if (!fatOuCiclo) return '—';
    if (typeof fatOuCiclo === 'object' && fatOuCiclo.ini) {
        const iso = dataISO(fatOuCiclo.ini);
        const y = +iso.slice(0, 4), m = +iso.slice(5, 7);
        return `${MESES[m - 1]} ${y}`;
    }
    const iso = dataISO(fatOuCiclo);
    if (iso.startsWith('9999')) {
        const ultimo = Estado.ciclos[Estado.ciclos.length - 1];
        if (ultimo?.ini) {
            const uIso = dataISO(ultimo.ini);
            return `${MESES[+uIso.slice(5, 7) - 1]} ${uIso.slice(0, 4)}`;
        }
    }
    const y = +iso.slice(0, 4), m = +iso.slice(5, 7);
    let mesAnterior = m - 1, ano = y;
    if (mesAnterior == 0) { mesAnterior = 12; ano--; }
    return `${MESES[mesAnterior - 1]} ${ano}`;
}

// Mesma logica de nomePeriodo, mas abreviada ("Set/26") — usada no titulo da visao Comparar.
function nomePeriodoAbrev(fatOuCiclo) {
    if (!fatOuCiclo) return '—';
    if (typeof fatOuCiclo === 'object' && fatOuCiclo.ini) {
        const iso = dataISO(fatOuCiclo.ini);
        return `${MESES[+iso.slice(5, 7) - 1].slice(0, 3)}/${iso.slice(2, 4)}`;
    }
    const iso = dataISO(fatOuCiclo);
    if (iso.startsWith('9999')) {
        const ultimo = Estado.ciclos[Estado.ciclos.length - 1];
        if (ultimo?.ini) {
            const uIso = dataISO(ultimo.ini);
            return `${MESES[+uIso.slice(5, 7) - 1].slice(0, 3)}/${uIso.slice(2, 4)}`;
        }
    }
    const y = +iso.slice(0, 4), m = +iso.slice(5, 7);
    let mesAnterior = m - 1, ano = y;
    if (mesAnterior == 0) { mesAnterior = 12; ano--; }
    return `${MESES[mesAnterior - 1].slice(0, 3)}/${String(ano).slice(-2)}`;
}

// So' o nome do mes (sem ano) de um periodo — usado nas colunas "Somente <mes>" da
// comparacao 1-a-1 entre 2 periodos.
function nomeMesPeriodo(fatOuCiclo) {
    if (!fatOuCiclo) return '—';
    if (typeof fatOuCiclo === 'object' && fatOuCiclo.ini) {
        return MESES[+dataISO(fatOuCiclo.ini).slice(5, 7) - 1];
    }
    const iso = dataISO(fatOuCiclo);
    if (iso.startsWith('9999')) {
        const ultimo = Estado.ciclos[Estado.ciclos.length - 1];
        if (ultimo?.ini) return MESES[+dataISO(ultimo.ini).slice(5, 7) - 1];
    }
    const m = +iso.slice(5, 7);
    let mesAnterior = m - 1;
    if (mesAnterior == 0) mesAnterior = 12;
    return MESES[mesAnterior - 1];
}

// Regras únicas de classificação de um lançamento — carga (carregarDados), cadastro,
// edição, materialização e simulação usam estas duas, pra uma linha nunca mudar de ciclo
// nem de "é investimento" ao recarregar a página.
// Investimento: alguma das categorias (lista separada por vírgula) é exatamente
// "Investimento" — "Investimento, Reserva" também é.
const ehCategoriaInvestimento = categ => categoriasSeparadas(categ).some(categoria => /^investimento$/i.test(categoria));
// Ciclo: Crédito pela fatura, Débito (inclusive antecipação) pela data; sem data nem fatura,
// Backlog (null); fora de todos os ciclos conhecidos, também null.
function periodoDoLancamento(r) {
    const idx = !r.data && !r.fatura ? null
        : r.cred ? periodoDaFatura(r.fatura) : periodoDoDebito(dataISO(r.data));
    return idx != null && idx >= 0 && idx < Estado.ciclos.length ? idx : null;
}

// Credito nao e' classificado pela data da compra: a fatura foi escolhida manualmente
// e o vencimento dela determina em qual ciclo de caixa o total aparece.
function periodoDaFatura(faturaVenc) {
    if (!faturaVenc) return null;
    return periodoDoDebito(dataISO(faturaVenc));
}

// Cartão de uma fatura pelo dia do vencimento (ver CARTOES em js/domain.js). Sem fatura
// (antecipação antiga, crédito no Backlog) é Nubank, dono de todo o histórico.
function cartaoDaFatura(vencimento) {
    return vencimento && +dataISO(vencimento).slice(8, 10) === DIA_VENCIMENTO_CARTAO[CARTAO_MERCADO_PAGO]
        ? CARTAO_MERCADO_PAGO : CARTAO_NUBANK;
}

// Faturas conhecidas de um ciclo, opcionalmente só as de um cartão, da mais antiga pra nova.
function faturasDoCiclo(idx, cartao) {
    return Estado.faturas
        .filter(f => periodoDaFatura(f.vencimento) === idx && (!cartao || cartaoDaFatura(f.vencimento) === cartao))
        .sort((a, b) => timestamp(a.vencimento) - timestamp(b.vencimento));
}

function vencimentoDoCiclo(idx, cartao) {
    const fatura = faturasDoCiclo(idx, cartao)[0];
    return fatura ? dataISO(fatura.vencimento) : dataDeFechamentoDoCiclo(Estado.ciclos[idx]);
}

// Distribui as antecipacoes de cada cartao pelas faturas DELE, da mais antiga pra mais nova:
// antecipacao do Mercado Pago nunca abate fatura do Nubank e vice-versa (o cartao sai do
// vencimento da fatura apontada; sem fatura, e' Nubank). A fatura da Isabella e' um
// lancamento comum e nao participa deste calculo. Antecipacoes com fatura explícita vao
// direto para a fatura apontada (sem depender de ordenacao cronologica). Antecipacoes
// antigas sem fatura continuam usando o fallback cronologico (ponteiro p na lista de
// faturas com saldo).
function alocacaoAntecipacoesDoCartao(linhas, cartao) {
    // Saldo devido de cada fatura, do ciclo mais antigo pro mais novo e, dentro do ciclo, por
    // vencimento. Cada fatura é somada pelas PRÓPRIAS compras (o vencimento delas), não pela
    // lista geral de faturas do ciclo: com dois vencimentos do mesmo cartão no mesmo ciclo
    // (ou uma linha de débito com fatura esquecida), a antecipação que aponta pra um deles
    // ainda acha a fatura certa — antes ficava sem vencimento e não abatia nada, contando o
    // pagamento duas vezes no saldo.
    const faturas = [];
    Estado.ciclos.forEach((per, idx) => {
        const porVencimento = new Map();
        // Compra sem fatura (o banco exige, migration 21; só dado antigo/simulado) cai no
        // vencimento único do ciclo, como antes; com mais de um, fica sem vencimento.
        const faturasDoCartao = faturasDoCiclo(idx, cartao);
        const vencimentoUnico = faturasDoCartao.length === 1 ? dataISO(faturasDoCartao[0].vencimento) : null;
        linhas
            .filter(r => r.cred && r.periodoIdx === idx && cartaoDaFatura(r.fatura) === cartao)
            .forEach(r => {
                const vencimento = r.fatura ? dataISO(r.fatura) : vencimentoUnico;
                porVencimento.set(vencimento, (porVencimento.get(vencimento) || 0) + r.v);
            });
        [...porVencimento.entries()]
            .sort(([a], [b]) => (a == null) - (b == null) || timestamp(a) - timestamp(b))
            .forEach(([vencimento, bruto]) => { if (bruto < 0) faturas.push({ idx, saldo: -bruto, vencimento }); });
    });

    const antecipacoes = linhas
        .filter(r => ehTransferenciaFatura(r) && r.data && r.v < 0 && cartaoDaFatura(r.fatura) === cartao)
        .sort((a, b) => timestamp(a.data) - timestamp(b.data));

    const abatido = {};
    let p = 0;                                                  // ponteiro no fallback cronologico
    antecipacoes.forEach(r => {
        const refVenc = r.fatura;
        if (refVenc) {
            // vinculo explicito: abate direto na fatura apontada pelo vencimento
            const f = faturas.find(x => x.vencimento != null && String(x.vencimento) === dataISO(refVenc));
            if (f) {
                const usa = Math.min(-r.v, f.saldo);
                f.saldo -= usa;
                abatido[f.idx] = (abatido[f.idx] || 0) + usa;
            }
        } else {
            // fallback cronologico: comportamento anterior para antecipacoes sem fatura informada
            let resto = -r.v;
            while (resto > 0.005 && p < faturas.length) {
                const f = faturas[p];
                const usa = Math.min(resto, f.saldo);
                f.saldo -= usa; resto -= usa;
                abatido[f.idx] = (abatido[f.idx] || 0) + usa;
                if (f.saldo <= 0.005) p++;                              // fatura quitada: proxima antecipacao vai pra seguinte
                else break;                                                 // sobrou saldo: nada transborda
            }
            // resto que sobrar depois da ultima fatura conhecida simplesmente nao abate nada
        }
    });
    return abatido;
}

// Abatimento total por ciclo (soma dos cartões), no mesmo formato de sempre — o saldo e a
// fatura do ciclo continuam usando o total. O detalhe por cartão vai junto em `porCartao`
// (não enumerável: não aparece ao espalhar/comparar o mapa), pra limite e linhas de fatura
// de cada cartão não recalcularem a alocação.
function alocacaoAntecipacoes(linhas) {
    const porCartao = Object.fromEntries(CARTOES.map(cartao => [cartao, alocacaoAntecipacoesDoCartao(linhas, cartao)]));
    const total = {};
    Object.values(porCartao).forEach(abatido => Object.entries(abatido).forEach(([idx, valor]) => {
        total[idx] = (total[idx] || 0) + valor;
    }));
    Object.defineProperty(total, 'porCartao', { value: porCartao });
    return total;
}

// Abatimento de um cartão a partir do resultado de alocacaoAntecipacoes. Sem o detalhe
// (mapa montado à mão), tudo é do Nubank, como antes de existir o segundo cartão.
function abatimentoDoCartao(abatido, cartao) {
    return abatido?.porCartao?.[cartao] || (cartao === CARTAO_NUBANK ? (abatido || {}) : {});
}

// Fatura líquida de cada cartão num ciclo (compras do cartão + antecipações alocadas a ele),
// com o vencimento daquele cartão. Base única das linhas "Fatura Nubank"/"Fatura Mercado
// Pago" no Débito, no saldo por dia e no gráfico de evolução.
function faturasLiquidasDoCiclo(base, abatido, idx) {
    return CARTOES.map(cartao => {
        const bruto = base
            .filter(r => r.cred && r.periodoIdx === idx && cartaoDaFatura(r.fatura) === cartao)
            .reduce((s, r) => s + r.v, 0);
        if (!bruto) return null;
        return {
            cartao, bruto,
            liquido: bruto + (abatimentoDoCartao(abatido, cartao)[idx] || 0),
            vencimento: vencimentoDoCiclo(idx, cartao),
        };
    }).filter(Boolean);
}

// Em qual PERIODO uma movimentacao de DEBITO cai: o periodo cujo intervalo [ini, fat] contem a data. Retorna null se a data for vazia (Backlog) ou nao cair em nenhum periodo cadastrado.
function periodoDoDebito(iso) {
    if (!iso) return null;
    return Estado.ciclos.findIndex(per => iso >= per.ini && iso <= dataISO(per.fat));
}

// CARGA DE DADOS — busca no Supabase e processa (sem tocar na tela)

// pega o token da sessao NA HORA: o supabase-js renova sozinho em background, entao guardar o token do login numa variavel garante 401 depois de ~1h. Se nao ha sessao, cai na chave publica (modo dev).
// Acesso ao Supabase foi movido para js/supabase-api.js.
