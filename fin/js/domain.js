// Vocabulário financeiro e contratos de dados compartilhados por todos os módulos.
// Mantém nomes e invariantes em um só lugar sem introduzir framework ou camada de banco.

/**
 * @typedef {Object} Lancamento
 * @property {number|string} id Identificador real ou temporário.
 * @property {string|null} data Data ISO do débito; créditos usam também fatura.
 * @property {number|string} valor Valor persistido: entrada positiva, saída negativa.
 * @property {string} nome Nome exato usado para classificações por nome.
 * @property {string|null} categ Categoria livre do lançamento.
 * @property {boolean} cred Indica compra no cartão detalhado.
 * @property {boolean} pago Indica se o movimento já ocorreu.
 * @property {string|null} fatura Vencimento escolhido para crédito/antecipação.
 */

/** @typedef {{ ini: string, fat: string, id?: string, cicloId?: number }} Ciclo */

// Ciclos vêm só da tabela fin_ciclo (migration 26): inicio/fim de cada linha, em ordem de
// início. Fim vazio = ciclo aberto (o último), representado como '9999-12-31' pro resto do
// app. Nenhum lançamento define ciclo. Datas que caem num intervalo sem ciclo vão pro
// Backlog, por isso esse buraco vira aviso de diagnóstico.
function ciclosDeFinCiclo(linhas) {
    const avisos = [];
    const ciclos = (linhas || [])
        .filter(l => l && ehDataIso(l.inicio) && l.inicio)
        .map(l => ({ id: `c:${l.id}`, cicloId: l.id, ini: String(l.inicio).slice(0, 10), fat: l.fim ? String(l.fim).slice(0, 10) : '9999-12-31' }))
        .sort((a, b) => (a.ini < b.ini ? -1 : a.ini > b.ini ? 1 : 0));
    const diaSeguinte = iso => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + 1)).toISOString().slice(0, 10);
    ciclos.forEach((ciclo, i) => {
        const proximo = ciclos[i + 1];
        if (proximo && ciclo.fat !== '9999-12-31' && diaSeguinte(ciclo.fat) < proximo.ini) {
            avisos.push(`Sem ciclo entre ${diaSeguinte(ciclo.fat)} e a véspera de ${proximo.ini}: lançamentos nessas datas vão pro Backlog.`);
        }
    });
    return { ciclos, avisos };
}

const CATEGORIA_INVESTIMENTO = 'Investimento';
// Contabilidade é um custo intrínseco ao próprio faturamento PJ (a taxa de ter a empresa
// aberta), não um gasto evitável/discricionário — por isso o gráfico de pizza (ver
// abrirGraficoGastos em charts.js) abre toda vez já com essa categoria excluída, mostrando
// direto o líquido. Fixo em código de propósito, igual aos tetos acima: ainda dá pra
// reincluir manualmente no seletor de categorias do próprio modal, só não é o padrão.
const CATEGORIA_EXCLUIDA_GRAFICO_PADRAO = 'Contabilidade';
// Cadastro com Frequência gera a série inteira de uma vez, da 1ª ocorrência até esta data
// (inclusive) — mesmo horizonte dos ciclos já cadastrados. Fixo em código de propósito.
const DATA_LIMITE_RECORRENCIA = '2032-12-31';
// Teto mensal de "besteira" SOZINHO (cafés, milkshakes, lanches/doces comendo só, Uber não
// essencial) — mesmo capricho, mas feito sozinho, por isso desconta daqui e não do teto da
// Isabella (LIMITE_ISABELLA). Quando é junto com ela, vira "Lazer"+"Isabella" (ver o guia de
// categorias no cadastro). Soma Débito e Crédito do mesmo ciclo — um único limite pros dois
// blocos, não um por bloco. Fixo em código de propósito: é uma meta pessoal, não dado
// editável na tela.
const CATEGORIA_BESTEIRA = 'Besteira';
const LIMITE_BESTEIRA = 250;
// Mesma ideia, outro teto, exibido no front com o rótulo "Isabella": todo lançamento com a
// categoria "Isabella" (com "Lazer" junto ou sozinha), menos a fatura do cartão dela e o
// que estiver marcado Comprometido. Ver
// ehGastoIsabella em js/charts.js para a regra completa.
const LIMITE_ISABELLA = 700;
// Tooltip do nome de cada indicador no título do Débito: o que entra em cada teto.
const DESCRICAO_LIMITE_CATEGORIA = {
    besteira: 'Besteira: gastos pequenos e evitáveis feitos sozinho — café, milkshake, lanche/doce, Uber não essencial (categoria Besteira).',
    isabella: 'Isabella: tudo com a categoria Isabella — junto com Lazer (saídas com ela, pelo valor inteiro da conta) ou sozinha (presente, mimo). Ficam de fora a fatura do cartão dela e o que estiver marcado Comprometido (parcelas fixas); Lazer sozinho não conta.',
};
// Dois cartões de crédito, identificados SÓ pelo dia de vencimento da fatura (regra
// provisória, ver docs/DECISOES.md): dia 13 = Mercado Pago; qualquer outro dia = Nubank,
// que cobre todo o histórico. Vale enquanto os dois vencimentos forem dias diferentes.
const CARTAO_NUBANK = 'nubank';
const CARTAO_MERCADO_PAGO = 'mp';
const CARTOES = [CARTAO_NUBANK, CARTAO_MERCADO_PAGO];
const NOME_CARTAO = { [CARTAO_NUBANK]: 'Nubank', [CARTAO_MERCADO_PAGO]: 'Mercado Pago' };
const DIA_VENCIMENTO_CARTAO = { [CARTAO_NUBANK]: 12, [CARTAO_MERCADO_PAGO]: 13 };
// Limite contratado de cada cartão. A tela permite ajustá-los como preferência local;
// só o Nubank soma garantia positiva do ciclo, sem alterar este valor-base.
let LIMITE_CARTAO = 3350;
let LIMITE_CARTAO_MP = 1100;

function definirLimiteCartao(valor, cartao = CARTAO_NUBANK) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0) return false;
    const arredondado = Math.round(numero * 100) / 100;
    if (cartao === CARTAO_MERCADO_PAGO) LIMITE_CARTAO_MP = arredondado;
    else LIMITE_CARTAO = arredondado;
    return true;
}

// Leitura do limite contratado de um cartão. Também permite que teste leia o valor atual
// depois de definirLimiteCartao() — um `let` sandboxado em vm não vira propriedade legível
// do contexto, só um closure (esta função) consegue ver a mutação.
const limiteCartaoContratado = (cartao = CARTAO_NUBANK) =>
    cartao === CARTAO_MERCADO_PAGO ? LIMITE_CARTAO_MP : LIMITE_CARTAO;
const TOLERANCIA_FINANCEIRA = 0.005;
const PREFIXO_LINHA_SINTETICA = /^(fat|cp|sal|res|sug|abt|prev):/;

const ehDataIso = valor => !valor || /^\d{4}-\d{2}-\d{2}$/.test(String(valor).slice(0, 10));
const ehBooleanoOuNulo = valor => valor == null || typeof valor === 'boolean';
// A categoria é texto livre; para o diagnóstico, diferenças só de espaço, caixa ou acento
// não devem criar falsos positivos como se fossem categorias distintas.
const chaveCategoria = valor => String(valor ?? '').trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Datas nas mensagens de diagnóstico no formato da tela (DD/MM/AAAA).
const dataBRDiagnostico = iso => String(iso).slice(0, 10).split('-').reverse().join('/');
// Como uma mensagem de diagnóstico identifica o lançamento: pelo id (o mesmo da coluna ID e
// do filtro de ID), com nome e data pra reconhecer de cara. A posição na lista carregada não
// aparece — não é campo do lançamento e muda a cada registro novo; só serve quando falta id.
function identificacaoDoLancamento(lancamento, indice) {
    if (lancamento?.id == null) return `Registro ${indice + 1} da carga (sem id)`;
    const nome = String(lancamento.nome || '').trim() || 'sem nome';
    const data = ehDataIso(lancamento.data) ? `, ${dataBRDiagnostico(lancamento.data)}` : '';
    return `id ${lancamento.id} — "${nome}"${data}`;
}

// Diagnóstico conservador da resposta do Supabase. Ele não altera nem exclui linhas:
// inconsistências apontam contrato de dados inválido; avisos são apenas sinais para revisão.
// Toda nova regra personalizada entra aqui na lista adequada e aparece no mesmo modal.
function validarLancamentosCarregados(lancamentos, ciclos = []) {
    const inconsistencias = [];
    const avisos = [];
    if (!Array.isArray(lancamentos)) return { inconsistencias: ['Supabase não retornou uma lista de lançamentos.'], avisos };
    const categorias = new Map();
    // Vencimento de fatura deve ter um único dia por mês: o mesmo cartão não fecha duas
    // vezes no mesmo mês. Agrupa por "AAAA-MM" -> dia -> lançamentos que usaram aquele dia.
    const faturasPorMes = new Map();

    lancamentos.forEach((lancamento, indice) => {
        if (!lancamento || typeof lancamento !== 'object') { inconsistencias.push(`Registro ${indice + 1} da carga: registro inválido.`); return; }
        const prefixo = identificacaoDoLancamento(lancamento, indice);
        if (!String(lancamento.nome || '').trim()) inconsistencias.push(`${prefixo}: nome ausente.`);
        if (!Number.isFinite(Number(lancamento.valor))) inconsistencias.push(`${prefixo}: valor não numérico.`);
        if (!ehDataIso(lancamento.data)) inconsistencias.push(`${prefixo}: data fora do formato ISO.`);
        if (lancamento.fatura && !ehDataIso(lancamento.fatura)) inconsistencias.push(`${prefixo}: vencimento de fatura fora do formato ISO.`);
        ['cred', 'pago'].forEach(campo => {
            if (!ehBooleanoOuNulo(lancamento[campo])) inconsistencias.push(`${prefixo}: ${campo} precisa ser booleano.`);
        });
        if (lancamento.cred === true && !lancamento.fatura) {
            inconsistencias.push(`${prefixo}: crédito sem fatura vinculada.`);
        }

        // Uma célula pode conter várias categorias separadas por vírgula. O diagnóstico
        // avalia cada item separadamente, como o formulário faz.
        categoriasSeparadas(lancamento.categ).forEach(categoria => {
            const chave = chaveCategoria(categoria);
            const grupo = categorias.get(chave) || { nome: categoria, lancamentos: [] };
            // O aviso precisa identificar a linha rapidamente no modal, sem exigir busca pelo id.
            grupo.lancamentos.push({
                id: lancamento.id ?? indice + 1,
                nome: String(lancamento.nome || '').trim() || 'sem nome',
                negativo: Number(lancamento.valor) < 0,
            });
            categorias.set(chave, grupo);
        });

        if (lancamento.fatura && ehDataIso(lancamento.fatura)) {
            const [ano, mes, dia] = String(lancamento.fatura).slice(0, 10).split('-');
            // Um dia por mês POR CARTÃO: Nubank (12) e Mercado Pago (13) no mesmo mês é normal.
            const cartao = +dia === DIA_VENCIMENTO_CARTAO[CARTAO_MERCADO_PAGO] ? CARTAO_MERCADO_PAGO : CARTAO_NUBANK;
            const chaveMes = `${ano}-${mes}|${cartao}`;
            const porDia = faturasPorMes.get(chaveMes) || new Map();
            const itensDoDia = porDia.get(dia) || [];
            itensDoDia.push({ id: lancamento.id ?? indice + 1, nome: String(lancamento.nome || '').trim() || 'sem nome' });
            porDia.set(dia, itensDoDia);
            faturasPorMes.set(chaveMes, porDia);
        }
    });
    // Categoria única só é suspeita numa saída: entradas (positivas) costumam ser pontuais
    // (reembolso, venda, presente) e nunca geram esse aviso.
    categorias.forEach(({ nome, lancamentos: itens }) => {
        if (itens.length === 1 && itens[0].negativo) {
            const { id, nome: nomeLancamento } = itens[0];
            avisos.push(`Categoria "${nome}" aparece em apenas um lançamento: "${nomeLancamento}" (id ${id}).`);
        }
    });
    faturasPorMes.forEach((porDia, chave) => {
        if (porDia.size <= 1) return;
        const [chaveMes, cartao] = chave.split('|');
        const dias = [...porDia.keys()].sort();
        const exemplos = dias.map(dia => {
            const [{ id, nome: nomeLancamento }] = porDia.get(dia);
            return `dia ${dia} (ex.: "${nomeLancamento}", id ${id})`;
        }).join(', ');
        avisos.push(`Fatura ${NOME_CARTAO[cartao]} de ${chaveMes} tem vencimento em mais de um dia: ${exemplos}. Cada mês deveria ter um único dia de fatura por cartão.`);
    });

    // "Hoje" do Débito e do Crédito (ver finance.js: lancamentosPagos) conta qualquer
    // lançamento com pago = true sem olhar a data. No Débito isso é direto: pago no ciclo
    // seguinte (ou além) já é cedo demais. No Crédito, pago = true é "compra confirmada",
    // não "fatura paga" — e a própria prévia do Crédito mostra por design os créditos da
    // competência N+1 no ciclo N (ver REGRAS.md), então fatura no PRÓXIMO ciclo é o
    // normal esperado. Só fatura dois ciclos ou mais à frente foge dessa prévia e é sinal
    // de revisão (ex.: mesma falha de recorrência nascer paga, só que do lado do Crédito).
    // Exceção: parcelas seguintes de um lote (mesmo recorrencia_id) cuja 1ª fatura está
    // antes do ciclo N+2. É compra parcelada já feita — o banco bloqueia o limite inteiro
    // na compra —, então as parcelas futuras estarem confirmadas é o esperado.
    if (typeof hojeISO === 'function') {
        const iniciosOrdenados = ciclos.map(ciclo => ciclo.ini).sort();
        const hoje = hojeISO();
        const idxHoje = iniciosOrdenados.reduce((achado, data, i) => data <= hoje ? i : achado, -1);
        const inicioProximoCiclo = idxHoje >= 0 ? iniciosOrdenados[idxHoje + 1] : null;
        const inicioDoisCiclosAFrente = idxHoje >= 0 ? iniciosOrdenados[idxHoje + 2] : null;
        if (inicioProximoCiclo || inicioDoisCiclosAFrente) {
            // 1ª fatura (a menor) de cada lote de Crédito, pra reconhecer parcelas seguintes.
            const primeiraFaturaDoLote = new Map();
            lancamentos.forEach(lancamento => {
                if (!lancamento?.cred || lancamento.recorrencia_id == null || !ehDataIso(lancamento.fatura)) return;
                const fatura = String(lancamento.fatura).slice(0, 10);
                const atual = primeiraFaturaDoLote.get(lancamento.recorrencia_id);
                if (!atual || fatura < atual) primeiraFaturaDoLote.set(lancamento.recorrencia_id, fatura);
            });
            lancamentos.forEach((lancamento, indice) => {
                if (!lancamento || lancamento.pago !== true) return;
                if (lancamento.cred && inicioDoisCiclosAFrente
                    && primeiraFaturaDoLote.get(lancamento.recorrencia_id) < inicioDoisCiclosAFrente) return;
                const fronteira = lancamento.cred ? inicioDoisCiclosAFrente : inicioProximoCiclo;
                if (!fronteira) return;
                const dataRelevante = lancamento.cred ? lancamento.fatura : lancamento.data;
                if (!dataRelevante || !ehDataIso(dataRelevante)) return;
                if (String(dataRelevante).slice(0, 10) < fronteira) return;
                const prefixo = identificacaoDoLancamento(lancamento, indice);
                const rotuloData = lancamento.cred ? 'vencimento de fatura' : 'data';
                const alemDe = lancamento.cred ? 'dois ciclos à frente (além da prévia normal de 1 ciclo)' : 'um ciclo futuro, fora do atual';
                avisos.push(`${prefixo}: marcado como pago com ${rotuloData} em ${dataBRDiagnostico(dataRelevante)} — cai ${alemDe}.`);
            });
        }
    }
    return { inconsistencias, avisos };
}
