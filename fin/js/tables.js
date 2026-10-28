// Filtros, ordenação, seleção e renderização das tabelas.

// A barra não filtra mais por Pago nem Origem. Mantemos esta função como porta única para as
// tabelas e cálculos comuns, para uma eventual regra futura não espalhar acessos ao estado.
// Reais + compras previstas de Besteira/Isabella (ver lancamentosComPrevistas em finance.js).
const filtrarLancamentos = () => lancamentosComPrevistas();

// ===================================================================
// ORDENAÇÃO DE TABELAS — cada tabela (id) guarda seu proprio estado
// ===================================================================
function ordenarLinhas(linhas, idTabela) {
    const { k: coluna, d: direcao } = estadoOrdenacao(idTabela);
    const tipo = COLS.find(c => c[0] == coluna)[2];
    const copia = [...linhas];
    copia.sort((a, b) => {
        const A = a[coluna], B = b[coluna];
        // prio sem valor preenchido equivale a "sem prioridade nenhuma" — nao a zero, que
        // seria a MAIOR prioridade; fica atras de qualquer numero real, em qualquer sentido
        // de ordenacao (ex.: pior que 999).
        const cmp = coluna == 'prio' ? ((A == null ? Infinity : +A) - (B == null ? Infinity : +B))
            : tipo == 'n' || tipo == 'b' || tipo == 'r' || tipo == 'vol' ? ((+A || 0) - (+B || 0))
                : tipo == 'd' ? (timestamp(A) - timestamp(B))
                    : String(A ?? '').localeCompare(String(B ?? ''), 'pt');
        const ordenado = direcao == 1 ? cmp : -cmp;
        if (ordenado) return ordenado;
        // saldo anterior sempre encabeca o dia: ele e' o ponto de partida, nao um evento
        if (a._sal !== b._sal) return a._sal ? -1 : 1;
        return (b.v || 0) - (a.v || 0);
    });
    return copia;
}

// Pergunta que decide a marca, no tooltip do cabeçalho (Débito, Crédito e Backlog).
const PERGUNTA_DA_COLUNA = {
    reserva: 'Se eu perder o emprego, preciso continuar pagando isso?',
    comprometido: 'Começou o mês, isso já é obrigatório pagar?',
    pra_sempre: 'Isso se repete sem data pra acabar?',
};
// monta o <tr> de cabecalho de uma tabela, com a setinha de ordenacao na coluna ativa
function cabecalhoTabela(idTabela) {
    const cols = colunasAtivas(idTabela);
    const { k: colunaAtiva, d: direcao } = estadoOrdenacao(idTabela);
    const linhaTitulos = cols.map(([chave, rotulo, tipo]) => {
        const seta = colunaAtiva == chave ? (direcao == 1 ? ' <span class=ar>↑</span>' : ' <span class=ar>↓</span>') : '';
        const dica = PERGUNTA_DA_COLUNA[chave] ? ` title="${PERGUNTA_DA_COLUNA[chave]}"` : '';
        return `<th class="${tipo == 'n' ? 'n' : ''}${chave == 'nome' ? 'cNome' : ''}"${dica} onclick="sortCol('${idTabela}','${chave}')">${rotulo}${seta}`;
    }).join('');
    // 2a linha do header: campo de busca por coluna, so nas colunas de texto (tipo 't').
    const filtroAtual = estadoFiltroTexto(idTabela);
    // Colunas de texto, Data e Valor têm campo de busca. Valor compara número (ver
    // passaFiltroTexto), não texto, mas a caixinha é a mesma das outras colunas — com a
    // mesma máscara de dinheiro do cadastro por cima (ver filtrarColuna) — e ganha ao lado
    // o botão de sinal. Pago/Reserva/Comprometido (tipo 'b') têm um botão de 3 estados.
    const campoBusca = (chave, rotulo, extra = '') =>
        `<input type=text ${extra}data-filtro="${idTabela}|${chave}" placeholder="Filtrar ${rotulo.toLowerCase()}…" value="${escapeHtml(filtroAtual[chave] ?? '')}" oninput="filtrarColuna('${idTabela}','${chave}',this)">`;
    const linhaBusca = '<tr class=filtros>' + cols.map(([chave, rotulo, tipo]) => {
        if (chave == 'valor') {
            return `<th class=n><span class=filtroValor>${botaoFiltroEstado(idTabela, 'sinal', filtroAtual.sinal)}` +
                `${campoBusca(chave, rotulo, 'inputmode=numeric ')}</span></th>`;
        }
        if (tipo == 't' || tipo == 'd') {
            return `<th${chave == 'nome' ? ' class=cNome' : ''}>${campoBusca(chave, rotulo, 'title="Digite \'vazio\' pra achar as linhas sem nada preenchido aqui" ')}</th>`;
        }
        if (tipo == 'b') return `<th>${botaoFiltroEstado(idTabela, chave, filtroAtual[chave])}</th>`;
        // ID: busca exata (coluna estreita, placeholder curto); "|" aceita vários ids.
        if (chave == 'id') return `<th class=n>${campoBusca(chave, 'ID', 'inputmode=numeric title="ID exato; use | pra vários (ex.: 12|40)" ').replace('Filtrar id…', 'ID')}</th>`;
        return '<th>';
    }).join('');
    return linhaTitulos + linhaBusca;
}

// Filtros por clique (sem digitar): cada clique avança Todos → 1º estado → 2º estado →
// Todos. Sinal do Valor: positivos/negativos; Pago: pago/aberto; Reserva e Comprometido:
// marcado/não marcado. O estado mora em Estado.filtroTexto junto das buscas digitadas, então
// limparFiltros() (botão Recarregar) zera tudo de uma vez.
const ESTADOS_FILTRO_CLIQUE = {
    sinal: [['+', '+', 'Só positivos', 'vd'], ['-', '−', 'Só negativos', 'vm']],
    pago: [['S', 'Pago', 'Só pagos', 'vd'], ['N', 'Aberto', 'Só abertos', 'vm']],
    reserva: [['S', 'Reserva', 'Só com Reserva', 'flagReserva'], ['N', 'Sem', 'Só sem Reserva', '']],
    comprometido: [['S', 'Compr.', 'Só comprometidos', 'flagComprometido'], ['N', 'Sem', 'Só não comprometidos', '']],
    pra_sempre: [['S', 'Sempre', 'Só os pra sempre', 'flagPraSempre'], ['N', 'Com fim', 'Só os que têm fim', '']],
};
function botaoFiltroEstado(idTabela, chave, valorAtual) {
    const estado = ESTADOS_FILTRO_CLIQUE[chave].find(([valor]) => valor == valorAtual);
    const [, texto, titulo, cor] = estado || [null, chave == 'sinal' ? '±' : 'Todos', 'Todos', ''];
    return `<button type=button class="filtroEstado${estado ? ' ligado' : ''}${cor ? ` ${cor}` : ''}" ` +
        `data-filtro-estado="${idTabela}|${chave}" title="${titulo} (clique pra alternar)" aria-label="Filtro: ${titulo}" ` +
        `onclick="alternarFiltroEstado('${idTabela}','${chave}')">${texto}</button>`;
}
window.alternarFiltroEstado = (idTabela, chave) => {
    const filtro = estadoFiltroTexto(idTabela);
    const ordem = [undefined, ...ESTADOS_FILTRO_CLIQUE[chave].map(([valor]) => valor)];
    const proximo = ordem[(ordem.indexOf(filtro[chave] || undefined) + 1) % ordem.length];
    if (proximo) filtro[chave] = proximo; else delete filtro[chave];
    desenhar();
};
// chamado a cada tecla digitada num campo de busca de coluna.
// desenhar() reescreve o innerHTML inteiro, o que tiraria o foco do campo a cada letra —
// por isso guarda onde estava o cursor e restaura depois, achando o campo novo pelo
// data-filtro (que sobrevive ao redesenho, ja que e' remontado igual).
window.filtrarColuna = (idTabela, coluna, input) => {
    // Valor usa a MESMA mascara de dinheiro do cadastro (formataMascaraDinheiro): os
    // digitos vao empurrando as casas decimais, tipo caixa eletronico. Assim a caixinha
    // mostra exatamente o numero procurado — digitar "15000" vira "150,00", sem duvida
    // sobre onde caem os centavos. Campo esvaziado tem que voltar pra vazio (filtro
    // desligado), nunca virar "0,00" — que filtraria pelos valores zerados. O sinal não se
    // digita aqui: é o botão ± ao lado (botaoFiltroEstado).
    if (coluna == 'valor') {
        const cursorNoFim = input.selectionEnd == input.value.length;
        input.value = input.value.replace(/\D/g, '') ? formataMascaraDinheiro(input.value) : '';
        if (cursorNoFim) input.setSelectionRange(input.value.length, input.value.length);
    }
    estadoFiltroTexto(idTabela)[coluna] = input.value;
    const posicaoCursor = document.activeElement === input ? input.selectionStart : null;
    desenhar();
    const novoInput = document.querySelector(`[data-filtro="${idTabela}|${coluna}"]`);
    if (novoInput) { novoInput.focus(); if (posicaoCursor != null) novoInput.setSelectionRange(posicaoCursor, posicaoCursor); }
};
// Extrai todos os termos de exclusão de um campo que começa com "!": cada "!" seguinte
// inicia outro termo excluído, em AND — "!Besteira!Assinatura" exclui as duas. Pedaços
// vazios (ex.: "!!" ou "!Besteira!") são ignorados, igual aos pedaços vazios de "|". A
// mesma leitura serve para o filtro da linha (Categoria e Nome) e para o saldo diário, sem
// deixar filtros visuais de outras colunas alterarem caixa.
function termosExcluidosDoFiltro(termo) {
    const normalizado = semAcento(termo);
    if (!normalizado.startsWith('!')) return [];
    return normalizado.split('!').map(t => t.trim()).filter(Boolean);
}

// O saldo cinza ao fim do dia acompanha exclusivamente `!Categoria`: é a única busca que
// remove movimentos da conta. A cópia protege o array carregado de qualquer mutação no render.
// Parte da mesma base do saldo sem recorte (reais + Besteira/Isabella previstas): sem as
// previstas, o recorte mudava o saldo mesmo quando o termo não tirava nenhuma linha.
function baseParaSaldoDiario(idTabela) {
    const termosExcluidos = idTabela == 'db'
        ? termosExcluidosDoFiltro(estadoFiltroTexto(idTabela).categ)
        : [];
    return termosExcluidos.length
        ? filtrarLancamentos().filter(r => !termosExcluidos.some(t => semAcento(r.categ).includes(t)))
        : null;
}

// remove acentos e caixa: "Café" e "cafe" viram a mesma coisa pra comparar
// uma linha passa no filtro de texto da tabela se contem (ignorando acento e maiuscula) todos os termos digitados
function passaFiltroTexto(r, idTabela) {
    const filtro = estadoFiltroTexto(idTabela);
    return Object.entries(filtro).every(([coluna, termo]) => {
        if (!termo) return true;
        // Botões de clique (botaoFiltroEstado). Sinal olha o valor visível (r._sug na linha
        // de Investimento sugerido); zero não é positivo nem negativo. Pago separa pago de
        // aberto (linha sem status, "—", não entra em nenhum dos dois); Reserva/Comprometido
        // tratam ausência como "não marcado".
        if (coluna == 'sinal') {
            const valorVisivel = r._sug != null ? r._sug : (r.v || 0);
            return termo == '+' ? valorVisivel > 0 : valorVisivel < 0;
        }
        if (coluna == 'pago') return termo == 'S' ? r.pago === true : r.pago === false;
        if (coluna == 'reserva' || coluna == 'comprometido' || coluna == 'pra_sempre') return termo == 'S' ? !!r[coluna] : !r[coluna];
        // ID é exato (não "contém"): "4" acha só o lançamento 4, nunca 14 ou 40. "|" aceita
        // vários; linhas calculadas também têm id (-3, -4…) e podem ser achadas.
        if (coluna == 'id') {
            const ids = termo.split('|').map(t => t.trim()).filter(Boolean);
            return !ids.length || ids.includes(String(r.id));
        }
        // Valor nao e' texto: o campo sempre traz um numero ja mascarado (formataMascaraDinheiro),
        // entao compara por PROXIMIDADE em vez de substring — acha qualquer lancamento a ate
        // 5 centavos do valor digitado, pra nao exigir acertar o centavo exato. Ignora o sinal
        // dos dois lados (a mascara nao digita "-"): buscar "150" acha tanto -150 quanto +150.
        // Linha de Investimento sugerido mostra r._sug no lugar de r.v — busca no que esta visivel.
        if (coluna == 'valor') {
            const valorAssinado = r._sug != null ? r._sug : (r.v || 0);
            const alvo = valorMascaraParaNumero(termo);
            return Math.abs(Math.abs(valorAssinado) - alvo) <= TOLERANCIA_BUSCA_VALOR;
        }
        // Data busca no texto que a célula mostra (DD/MM/AAAA): "10/2026" acha outubro.
        const valorDaCelula = coluna == 'data' ? (r.data ? dataBR(r.data) : '') : r[coluna];
        const texto = semAcento(valorDaCelula);
        const termoNormalizado = semAcento(termo);
        // Termo especial "vazio" (sem acento/caixa, sozinho no campo) acha as linhas sem
        // nada preenchido naquela coluna — mesmo critério da célula "—" (ehVazioTextual).
        // Não combina com ! nem |: é um atalho isolado, igual aos outros desta função.
        if (termoNormalizado.trim() == 'vazio') return ehVazioTextual(valorDaCelula);
        // Categoria (pode ser composta, ex.: "Casa, Reserva") e Nome aceitam "!" pra
        // excluir — um ou mais termos encadeados, em AND (ver termosExcluidosDoFiltro).
        // Frequência nunca entra aqui: mantém a busca literal normal. "!" isolado (ou só
        // pedaços vazios) equivale a filtro vazio e evita ocultar toda a tabela.
        if ((coluna == 'categ' || coluna == 'nome') && termoNormalizado.startsWith('!')) {
            const termosExcluidos = termosExcluidosDoFiltro(termo);
            return !termosExcluidos.length || termosExcluidos.every(t => !texto.includes(t));
        }
        // '|' funciona como OU em qualquer coluna de texto: "Assinatura|Isabella" acha
        // linhas que contenham qualquer um dos termos, não só os dois juntos. '|' sozinho
        // ou com pedaços vazios equivale a filtro vazio, igual ao '!' isolado de Categoria.
        const termosOu = termoNormalizado.split('|').map(t => t.trim()).filter(Boolean);
        return !termosOu.length || termosOu.some(t => texto.includes(t));
    });
}
// clique no header: 1o clique ordena asc, 2o desc, alternando (sem 3o estado "original")
window.sortCol = (idTabela, coluna) => {
    const estado = estadoOrdenacao(idTabela);
    if (estado.k != coluna) { estado.k = coluna; estado.d = 1; }
    else estado.d = estado.d == 1 ? 2 : 1;
    desenhar();
};

// clique no header da matriz Comparar: alterna asc/desc na mesma coluna, ou troca
// de coluna comecando por desc (o mais relevante costuma ser o maior valor)
window.sortComp = k => {
    const oc = Estado.ordComp;
    if (oc.k != k) { oc.k = k; oc.d = k == 'chave' ? 1 : 2; }
    else oc.d = oc.d == 1 ? 2 : 1;
    desenhar();
};

// ===================================================================
// RENDERIZAÇÃO DE TABELAS
// ===================================================================
// chave de selecao de uma linha: usa o _sid sintetico (linha de fatura) ou o id real
const chaveSelecao = r => r._sid ? r._sid : (r.id != null ? String(r.id) : '');
// texto de uma celula "vazia": trata null/undefined/"" E a string literal "null"/"undefined"
// que pode ter ficado gravada no banco por engano em alguma insercao anterior
// mesma logica de limpeza do valorValido: reconhece "null", "<null>", "n/a" etc como vazio
const ehVazioTextual = v => {
    if (v == null) return true;
    const limpo = String(v).trim().toLowerCase().replace(/^<|>$/g, '');
    return ['', 'null', 'undefined', 'nan', 'none', 'n/a'].includes(limpo);
};
const textoOuTraco = v => ehVazioTextual(v) ? '—' : v;
// linha REAL (existe na tabela lancamentos, da' pra dar PATCH): nao e' sintetica (fatura,
// saldo anterior, resgate/aporte) nem simulada (so' memoria, nunca foi salva)
const ehLinhaReal = r => Number.isInteger(+r.id) && +r.id > 0 && !r._sid && !r._sim;
// conteudo da celula Data: DD/MM/AAAA ou '—'. A fatura e' escolhida manualmente,
// portanto nao existe mais marca de fechamento/D+1.
// O século vai num span próprio: no celular ele some (05/10/26) e sobra largura pro Nome;
// o ano continua inteiro na tela, só mais curto.
const textoData = r => r.data ? dataBR(r.data).replace(/\/(\d{2})(\d{2})$/, '/<span class=seculo>$1</span>$2') : '—';
// mesma ideia de celValorEditavel: clicar abre um <input type=date> inline. So' pra
// lancamentos REAIS (id do banco, da' pra dar PATCH).
const celData = r => {
    const texto = ehLinhaReal(r)
        ? `<span class="togData" data-tog-data="${escapeHtml(String(r.id))}" title="Editar data">${textoData(r)}</span>`
        : textoData(r);
    // _dupCiclo (marcado em marcaOcorrenciasDuplicadasNoCiclo, js/cycle-views.js): essa
    // ocorrência é a mais recente de uma recorrência que caiu 2x no mesmo ciclo. O botão
    // corrige com 1 clique, movendo pro 1º dia do próximo ciclo (handler data-corrige-dup
    // em interactions.js) — só pra linha real, mesma regra de edição.
    const corrige = r._dupCiclo && ehLinhaReal(r)
        ? ` <button type=button class=corrigeDupData data-corrige-dup="${escapeHtml(String(r.id))}" title="Recorrência caiu 2x neste ciclo — mover pro 1º dia do próximo" aria-label="Mover esta ocorrência pro 1º dia do próximo ciclo">↷</button>`
        : '';
    return `${texto}${corrige}`;
};
// Compra do Mercado Pago na tabela única de Crédito: a linha inteira ganha um fundo azul
// bem apagado com contorno (classe "mp" no <tr>), no lugar de um selo "MP"; o Nubank (todo o
// histórico) fica sem marca, pra tabela de um cartão só continuar igual.
const ehCompraMercadoPago = r => !!r.cred && !!r.fatura && cartaoDaFatura(r.fatura) === CARTAO_MERCADO_PAGO;
const celNome = r => {
    const sim = r._sim ? '<span class=simIco title="Simulado">✦</span> ' : '';
    const nome = escapeHtml(textoOuTraco(r.nome));
    const fatRef = r.fatura;
    const ehMercadoPago = !!fatRef && cartaoDaFatura(fatRef) === CARTAO_MERCADO_PAGO;
    const badgeFatura = (ehTransferenciaFatura(r) && fatRef)
        ? ` <span class="tagFatura" title="Abate fatura${ehMercadoPago ? ' do Mercado Pago' : ''}">↳ Fat. ${nomePeriodoAbrev({ ini: fatRef })}${ehMercadoPago ? ' MP' : ''}</span>`
        : '';
    // Resgate que levou todo o guardado (ou foi diminuído pra não deixá-lo negativo): na linha
    // calculada vem marcado pelo ajuste; no Resgate real, o guardado do ciclo terminou em zero.
    const resgatouTudo = r._res ? r._resgatouTudo
        : ehLinhaReal(r) && r.inv && r.v > 0 && r.periodoIdx != null && guardadoAte(r.periodoIdx) <= TOLERANCIA_FINANCEIRA;
    const badgeResgate = resgatouTudo
        ? ' <span class=tagAviso title="O guardado acabou: o resgate foi limitado ao que havia guardado, e o que faltar fica negativo no saldo do ciclo">⚠ Resgatou tudo</span>'
        : '';
    // Só o nome é cortado com "…" quando não cabe; as marcas ficam sempre inteiras ao lado
    // (senão o aviso "Resgatou tudo" sumia dentro das reticências).
    const textoNome = ehLinhaReal(r)
        ? `<span class="nomeTexto togNome" data-tog-nome="${escapeHtml(String(r.id))}">${nome}</span>`
        : `<span class=nomeTexto>${nome}</span>`;
    return `<span class=nomeLinha>${sim}${textoNome}${badgeFatura}${badgeResgate}</span>`;
};
// Categoria e Frequência (colunas de texto livre/vocabulário controlado): mesmo esquema de
// clique-pra-editar do Nome/Data, só pra linha REAL.
const celCateg = r => ehLinhaReal(r)
    ? `<span class="togCateg" data-tog-categ="${escapeHtml(String(r.id))}" title="Editar categoria">${escapeHtml(textoOuTraco(r.categ))}</span>`
    : textoOuTraco(r.categ);
const celFreq = r => ehLinhaReal(r)
    ? `<span class="togFreq" data-tog-freq="${escapeHtml(String(r.id))}" title="Editar frequência">${escapeHtml(textoOuTraco(r.freq))}</span>`
    : textoOuTraco(r.freq);
// Prioridade de elevação do Backlog pra um ciclo: numero livre que o usuario preenche na
// mao (1 = mais provavel, quanto maior menos chance, ex.: 999) — mesmo esquema de clique-
// pra-editar das demais colunas de texto/numero livre.
const celPrio = r => ehLinhaReal(r)
    ? `<span class="togPrio" data-tog-prio="${escapeHtml(String(r.id))}" title="Editar prioridade de elevação">${escapeHtml(textoOuTraco(r.prio))}</span>`
    : textoOuTraco(r.prio);
// Observação (texto livre, qualquer anotação) e Canal (de onde a conta e' paga/consultada —
// ex.: o link do site da concessionária): mesmo esquema de clique-pra-editar das demais
// colunas livres. Canal ganha um ícone extra pra abrir o link numa aba nova quando o texto
// e' uma URL http(s) — clicar nele não entra em edição nem seleciona a linha (mesmo truque
// de stopPropagation de abrirDetalheCelComparar em cycle-views.js).
const celObs = r => ehLinhaReal(r)
    ? `<span class="togObs" data-tog-obs="${escapeHtml(String(r.id))}">${escapeHtml(textoOuTraco(r.obs))}</span>`
    : textoOuTraco(r.obs);
const ehUrlHttp = texto => /^https?:\/\//i.test(String(texto ?? '').trim());
const celCanal = r => {
    const bruto = String(r.canal ?? '').trim();
    const textoVisivel = escapeHtml(textoOuTraco(r.canal));
    // Largura fixa (ver .togCanal/.celCanalTexto no CSS): o que nao couber vira "...", mas
    // continua clicavel pra editar o texto inteiro. A linha nao-real tambem
    // trunca, so' sem o clique de edicao.
    const texto = ehLinhaReal(r)
        ? `<span class="togCanal" data-tog-canal="${escapeHtml(String(r.id))}" title="Editar canal">${textoVisivel}</span>`
        : `<span class=celCanalTexto>${textoVisivel}</span>`;
    if (!bruto) return texto;
    // Copiar sempre que houver texto — inclusive chave Pix, que nao e' um link pra abrir.
    // So' quando e' http(s) o botao de abrir aparece ao lado (ver handler em
    // interactions.js e ehUrlHttp acima). SEM stopPropagation aqui: o clique precisa
    // borbulhar até #out, onde o handler delegado (data-copiar-canal) faz a copia de
    // verdade — ele mesmo chama stopImmediatePropagation pra nao cair na selecao de linha.
    const copiar = ` <button type=button class=copiarCanal data-copiar-canal="${escapeHtml(String(r.id))}" title="Copiar" aria-label="Copiar">` +
        `<svg viewBox="0 0 24 24" width=13 height=13 fill=none stroke=currentColor stroke-width=2.2 stroke-linecap=round stroke-linejoin=round aria-hidden=true>` +
        `<rect x=9 y=9 width=11 height=11 rx=2 /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg></button>`;
    const link = ehUrlHttp(bruto)
        ? ` <a class=linkCanal href="${escapeHtml(bruto)}" target=_blank rel="noopener noreferrer" title="Abrir link" aria-label="Abrir link" onclick="event.stopPropagation()">` +
            `<svg viewBox="0 0 24 24" width=13 height=13 fill=none stroke=currentColor stroke-width=2.2 stroke-linecap=round stroke-linejoin=round aria-hidden=true>` +
            `<path d="M10 14 21 3" /><path d="M15 3h6v6" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg></a>`
        : '';
    return `${texto}${copiar}${link}`;
};

// Reserva/Comprometido/Pra sempre são marcas raras (bits fin.reserva/fin.comprometido —
// migration 22 — e fin.pra_sempre — migration 31 — a maioria dos lançamentos não é nenhuma): diferente de Pago, que é sempre
// um estado relevante pra qualquer lançamento real, aqui "falso" fica em "—" em vez de
// repetir um texto negativo em toda linha; só "verdadeiro" ganha destaque. Mesma permissão
// de Pago (nunca em linha sintética), clicável pra alternar na hora.
const ROTULO_FLAG = { reserva: 'Reserva', comprometido: 'Comprometido', pra_sempre: 'Pra sempre' };
// Cada marca tem a sua cor pra não se confundir com o verde de Pago: Comprometido laranja
// escuro, Reserva amarelo claro, Pra sempre azul — tons afastados pros três não se
// confundirem lado a lado.
// Classes próprias (não o .am dos indicadores) pra mudar o tom sem mexer nos indicadores.
// Só o texto marcado ganha cor; "—" fica neutro.
const COR_FLAG = { reserva: 'flagReserva', comprometido: 'flagComprometido', pra_sempre: 'flagPraSempre' };
const celFlag = (r, chave) => {
    const marcado = !!r[chave];
    const texto = marcado ? ROTULO_FLAG[chave] : '—';
    // Somente leitura (linha calculada) mantém a mesma cor quando marcada.
    return !r._sid
        ? `<span class="${marcado ? COR_FLAG[chave] : ''} togFlag" data-tog-flag="${chave}:${escapeHtml(String(r.id))}" title="Alternar ${ROTULO_FLAG[chave]}">${texto}</span>`
        : (marcado ? `<span class=${COR_FLAG[chave]}>${texto}</span>` : texto);
};

// monta as celulas <td> de uma linha, conforme o tipo de cada coluna. A edição por toque/
// clique (Valor, Pago, Data) é a mesma em qualquer dispositivo; as linhas calculadas
// (fatura, previstas — não existem no banco) veem tudo como texto simples, nunca editável.
const celulasDaLinha = (r, idTabela) => colunasAtivas(idTabela).map(([chave, , tipo]) => chave == 'valor'
    // Toda linha mostra o botão de sinal; só a real o usa.
    ? (r._sug != null ? celValorSomenteLeitura(r, r._sug, corValor(r._sug))
        : ehLinhaReal(r) ? celValorEditavel(r) : celValorSomenteLeitura(r)).replace(/$/,
            r._saldo != null ? `<span class=sd>${brl(r._saldo)}</span>` : '')
    : tipo == 'b' && chave != 'pago' ? `<td>${celFlag(r, chave)}`
    : tipo == 'b' ? `<td>${r[chave] == null ? '—'
        : (!ehLinhaReal(r) ? `<span class="${r[chave] ? 'vd' : 'vm'}">${r[chave] ? 'Pago' : 'Aberto'}</span>`
            : `<span class="${r[chave] ? 'vd' : 'vm'} togPago" data-tog-pago="${escapeHtml(String(r.id))}" title="Alternar status">${r[chave] ? 'Pago' : 'Aberto'}</span>`)}`
    // Nome e Obs ficam numa linha só, cortados com "…"; o texto inteiro aparece no hover
    // (title da célula). Clicar continua editando o texto completo.
    : chave == 'nome' || chave == 'obs'
        ? `<td class="corta${chave == 'nome' ? ' cNome' : ''}" title="${escapeHtml(ehVazioTextual(r[chave]) ? '' : String(r[chave]))}">${chave == 'nome' ? celNome(r) : celObs(r)}`
    : `<td class="${tipo == 'n' ? 'n' : chave == 'data' ? 'cData' : ''}">${chave == 'data'
            ? celData(r)
            : (chave == 'nome' ? celNome(r)
                : (chave == 'categ' ? celCateg(r)
                    : (chave == 'freq' ? celFreq(r)
                        : (chave == 'prio' ? celPrio(r)
                            : (chave == 'obs' ? celObs(r)
                                : (chave == 'canal' ? celCanal(r) : textoOuTraco(r[chave])))))))}`
).join('');
// Critério de cada teto por categoria (Besteira, Isabella): o mesmo pro indicador do título
// e pro filtro do clique no nome dele. Função, e não objeto no topo, porque ehGastoIsabella
// vem de charts.js, carregado depois deste arquivo.
const criterioDoTeto = chave => chave === 'isabella' ? ehGastoIsabella : CATEGORIA_BESTEIRA;
// Clique no nome Besteira/Isabella do título do Débito: Débito e Crédito do ciclo mostram só
// o que conta naquele teto (contaNoTeto, a mesma regra do indicador), sem as linhas
// previstas, que o indicador também ignora — a soma do que sobra é o Usado de Futuro.
// Soma-se aos outros filtros; outras tabelas (Backlog, Comparar) não mudam.
const TABELAS_DO_FILTRO_TETO = ['db', 'cr'];
const passaFiltroTeto = (r, idTabela) => !Estado.filtroTeto || !TABELAS_DO_FILTRO_TETO.includes(idTabela) ||
    (!r._prev && contaNoTeto(r, criterioDoTeto(Estado.filtroTeto)));
// renderiza uma tabela completa (cabecalho + linhas). 'selecionavel' liga o clique-pra-somar por linha.
const renderTabela = (linhasBrutas, idTabela, selecionavel) => {
    const linhas = linhasBrutas.filter(r => passaFiltroTexto(r, idTabela) && passaFiltroTeto(r, idTabela));
    if (!linhasBrutas.length) { Estado.linhasVisiveis[idTabela] = []; return '<p class=empty>Vazio</p>'; }
    if (!linhas.length) { Estado.linhasVisiveis[idTabela] = []; return `<div class=wrap><table><thead><tr>${cabecalhoTabela(idTabela)}</thead></table></div><p class=empty>Nenhum resultado com esse filtro.</p>`; }
    const ordenadas = ordenarLinhas(linhas, idTabela);
    // guarda na ordem REAL da tela (pos-ordenacao) — usado por "Selecionar tudo" e pelo
    // shift-click de intervalo, que dependem do indice bater com a posicao visual.
    Estado.linhasVisiveis[idTabela] = ordenadas;

    // saldo do dia: so na tabela de Debito e so com data ASCENDENTE — em qualquer outra
    // ordem "fim do dia" nao corresponde ao que esta na tela. Marca DEPOIS de ordenar,
    // na ultima linha de cada dia como ela realmente aparece.
    const ord = estadoOrdenacao(idTabela);
    ordenadas.forEach(r => { r._saldo = null; });
    if (idTabela == 'db' && ord.k == 'data' && ord.d == 1) {
        const saldo = saldoPorDia(baseParaSaldoDiario(idTabela));
        ordenadas.forEach((r, i) => {
            const d = dataISO(r.data);
            if (!d || d < SALDO_DESDE) return;
            const prox = ordenadas[i + 1];
            if (!prox || dataISO(prox.data) !== d) r._saldo = saldo[d];   // ultima do dia
        });
    }

    // O toque/clique na linha sempre serve para somar valores, em qualquer dispositivo.
    const podeSelecionar = selecionavel;
    // <colgroup> com uma classe por coluna: as larguras são fixas no CSS (table.larguraFixa),
    // então filtrar Reserva, Comprometido ou o sinal não faz as colunas "dançarem".
    const colunas = colunasAtivas(idTabela).map(([chave]) => `<col class=col-${chave}>`).join('');
    return `<div class=wrap><table class=larguraFixa><colgroup>${colunas}</colgroup><thead><tr>${cabecalhoTabela(idTabela)}</thead><tbody>` +
        ordenadas.map(r => {
            const chave = chaveSelecao(r), marcada = podeSelecionar && chave && Estado.selecionados.has(chave);
            return `<tr class="${r._fat ? 'fat ' : ''}${r._sal ? 'sal ' : ''}${r._res ? 'res ' : ''}${r._sug != null ? 'sug ' : ''}${r._prev ? 'prev ' : ''}${r._sim ? 'sim ' : ''}${ehCompraMercadoPago(r) ? 'mp ' : ''}${marcada ? 'on' : ''}${podeSelecionar && chave ? ' pick' : ''}" data-sid="${podeSelecionar ? chave : ''}">` + celulasDaLinha(r, idTabela);
        }).join('') + '</tbody></table></div>';
};

// casca comum de TODOS os blocos (Débito/Crédito/Backlog/Comparar): titulo com botao
// de collapse + linha de meta info + corpo por baixo. E' a MESMA estrutura/diagramacao
// pra todo mundo, inclusive o collapse (▾/▸, Estado.fechados[idTabela]) — assim trocar
// de visao (Ciclo <-> Comparar) fica impercetivel, os blocos sao visualmente identicos.
// 'corpoFn' e' chamada so' quando o bloco esta aberto (evita montar a tabela/matriz a
// toa quando esta fechado).
// Sem subtítulo (Crédito), só a contagem — sem o " · " pendurado.
const textoMetaBloco = (n, subtitulo) => `${n} ${n == 1 ? 'registro' : 'registros'}${subtitulo ? ` · ${subtitulo}` : ''}`;
// `metaNoTitulo`: a contagem/período já foi encaixada na última faixa do título (ver
// renderBloco), então não ganha a linha própria embaixo.
function blocoCasca(tituloHtml, subtitulo, n, idTabela, corpoFn, metaNoTitulo = false) {
    const fechado = !!Estado.fechados[idTabela];
    const btnTog = `<button type=button class=tog onclick="alternarBloco('${idTabela}')" aria-label="${fechado ? 'Expandir' : 'Recolher'}">${fechado ? '▸' : '▾'}</button>`;
    const corpo = fechado ? '' : corpoFn();
    const meta = metaNoTitulo ? '' : `<p class=meta>${textoMetaBloco(n, subtitulo)}</p>`;
    // data-bloco localiza o bloco depois de desenhado (ex.: os indicadores entram no Débito).
    return `<div class=blk data-bloco=${idTabela}><h3>${btnTog}${tituloHtml}</h3>${meta}${corpo}</div>`;
}

// Fecho comum de todo resumo de título: </span> do .resumoDados, da .resumoLinha e do
// .resumoTitulo. A meta entra logo antes dele, ou seja, no fim da ÚLTIMA faixa — Futuro
// quando existe; senão a única faixa (Hoje/Passado).
const FECHO_RESUMO_TITULO = '</span></span></span>';
const encaixaMetaNoResumo = (resumoTitulo, meta) => resumoTitulo.endsWith(FECHO_RESUMO_TITULO)
    ? resumoTitulo.slice(0, -FECHO_RESUMO_TITULO.length) + `<span class=resumoMeta>${meta}</span>` + FECHO_RESUMO_TITULO
    : null;

// um card "Débito"/"Crédito"/"Backlog": titulo + total, subtitulo, tabela por baixo.
// quando selecionavel, ganha um botao "Selecionar tudo" que marca/desmarca todas as linhas
// dessa tabela de uma vez (respeitando o filtro de texto ativo, se houver).
// "Ver gráfico" mora na toolbar (#btGrafico), nao mais aqui.
const renderBloco = (titulo, total, subtitulo, linhas, idTabela, selecionavel = false, extra = '', resumoTitulo = '', separadorTotal = ' · ') => {
    // 'extra' preenchido substitui o total no destaque: o titulo passa a exibir o que
    // falta pagar em evidencia, com o bruto de lado, apagado.
    const valor = extra.startsWith('<b') ? extra
        : `<b class="${corSoma(total)}">${brl(Math.abs(total))}</b>${extra}`;
    // Resumos em duas linhas substituem o único total quando a visão precisa distinguir
    // o retrato de hoje da projeção. Os demais blocos preservam o título compacto legado.
    // Com resumo em faixas, "N registros · período" fica encaixado no fim da última faixa
    // (Futuro), em vez de ocupar uma linha própria entre o título e a tabela.
    const resumoComMeta = resumoTitulo && encaixaMetaNoResumo(resumoTitulo, textoMetaBloco(linhas.length, subtitulo));
    // Título compacto sem subtítulo (Backlog, Crédito histórico): a contagem vira um
    // "N registros" cinza logo depois do valor, em vez de uma linha só pra ela.
    const contagemNoTitulo = !resumoTitulo && !subtitulo;
    const tituloCompleto = resumoTitulo
        ? `<span class=tituloBloco>${titulo}</span>${resumoComMeta || resumoTitulo}`
        : `${titulo}${separadorTotal}${valor}` +
            (contagemNoTitulo ? ` <span class=contagemTitulo>${textoMetaBloco(linhas.length, '')}</span>` : '');
    return blocoCasca(tituloCompleto, subtitulo, linhas.length, idTabela,
        () => renderTabela(linhas, idTabela, selecionavel), !!resumoComMeta || contagemNoTitulo);
};



// ===================================================================
// AS TRÊS VISÕES: Ciclo, Comparar, Investimento
// ===================================================================

// alocacaoAntecipacoes ja varre TODOS os periodos sozinha (e' O(periodos*lancamentos)) —
// chama-la de novo pra cada ciclo individual faz o custo virar O(periodos^2*lancamentos),
// que com uma tabela de periodos grande (ex: 1000 linhas) trava o navegador por dezenas de
// segundos. Por isso ela e' calculada UMA VEZ POR RENDER aqui, memoizada por base, e
// reaproveitada — nunca chamada dentro de um loop por idx.
// Cálculos financeiros foram movidos para js/finance.js.
