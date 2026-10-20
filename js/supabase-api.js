// Acesso ao Supabase. Regras de interface ficam nos demais módulos de js/.
const sb = supabase.createClient(API, KEY);
const TAMANHO_LOTE_SUPABASE = 1000;

// Rede ruim (metrô): sem teto, um fetch que perde o sinal no meio fica pendente pra sempre
// e o botão que esperava por ele nunca volta. Cada tentativa tem um limite de tempo.
const LIMITE_REQUISICAO_MS = 12000;
// GET, PATCH e DELETE podem ser repetidos sem mudar o resultado; INSERT não (duplicaria).
const TENTATIVAS_IDEMPOTENTES = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = [1000, 2000];

// Falha sem resposta do servidor (sinal caiu ou estourou o tempo): o pedido pode ou não ter
// chegado ao banco. Um erro HTTP é diferente — é uma resposta de verdade e nunca se repete.
const erroSemResposta = mensagem => Object.assign(Error(mensagem), { semResposta: true });

function comTeto(promessa, oQue) {
    let relogio;
    const estouro = new Promise((_, rejeita) => {
        relogio = setTimeout(() => rejeita(erroSemResposta(`${oQue}: sem resposta em ${LIMITE_REQUISICAO_MS / 1000} s`)), LIMITE_REQUISICAO_MS);
    });
    return Promise.race([promessa, estouro]).finally(() => clearTimeout(relogio));
}

// Lê o corpo dentro do mesmo teto: a conexão pode cair depois dos cabeçalhos, no meio da
// resposta. Devolve o texto já lido, pra quem chama não esperar mais nada da rede.
async function fetchComLimite(url, opcoes, oQue) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), LIMITE_REQUISICAO_MS);
    try {
        const r = await fetch(url, { ...opcoes, signal: controle.signal });
        return { ok: r.ok, status: r.status, texto: await r.text() };
    } catch (err) {
        throw erroSemResposta(controle.signal.aborted
            ? `${oQue}: sem resposta em ${LIMITE_REQUISICAO_MS / 1000} s`
            : `${oQue}: conexão falhou (${err.message})`);
    } finally {
        clearTimeout(relogio);
    }
}

const espera = ms => new Promise(resolve => setTimeout(resolve, ms));

// Só para operações idempotentes. Repete apenas falha sem resposta; erro HTTP sobe direto.
async function comRetentativas(operacao) {
    for (let tentativa = 1; ; tentativa++) {
        try {
            return await operacao(tentativa);
        } catch (err) {
            if (!err.semResposta) throw err;
            if (tentativa >= TENTATIVAS_IDEMPOTENTES) {
                throw erroSemResposta(`${err.message} (${tentativa} tentativas) — pode tentar de novo, repetir não duplica nada`);
            }
            await espera(ESPERA_ENTRE_TENTATIVAS_MS[tentativa - 1]);
        }
    }
}

const tokenAtual = async (forcar) => comTeto((async () => {
    if (forcar) await sb.auth.refreshSession();
    const { data: { session } } = await sb.auth.getSession();
    return session?.access_token || KEY;
})(), 'sessão');

// `chave`: coluna única e ordenável usada na paginação (id nas duas tabelas).
const buscar = async (tabela, retry, chave = 'id') => {
    // O limite de linhas da API vale por resposta, mesmo quando a URL pede um limite maior.
    // Paginar pela chave evita truncar silenciosamente a base e não depende de IDs contínuos.
    const linhas = [];
    let ultimoId = null;
    while (true) {
        const depois = ultimoId == null ? '' : `&${chave}=gt.${encodeURIComponent(ultimoId)}`;
        const url = `${API}/rest/v1/${tabela}?select=*&order=${chave}.asc&limit=${TAMANHO_LOTE_SUPABASE}${depois}`;
        // Reconsulta a carga inteira uma única vez após 401: a sessão pode ter sido renovada
        // entre dois lotes e reaproveitar os anteriores criaria duplicatas no resultado.
        const r = await comRetentativas(async () => fetchComLimite(url, { headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(retry) } }, 'carregar'));
        if (r.status === 401 && !retry) return buscar(tabela, true, chave);
        if (!r.ok) throw Error(`${tabela}: ${r.status} ${r.texto}`);
        const lote = JSON.parse(r.texto);
        linhas.push(...lote);
        if (lote.length < TAMANHO_LOTE_SUPABASE) return linhas;
        ultimoId = lote.at(-1)[chave];
    }
};

// Toda gravação real que o banco confirma pede uma recarga da tela (recarregarAposGravacao,
// em bootstrap.js): o que aparece é sempre o que está no banco, inclusive defaults,
// triggers e o que outra aba ou o DataGrip mudou no meio-tempo.
const aposGravar = resultado => {
    if (typeof recarregarAposGravacao === 'function') recarregarAposGravacao();
    return resultado;
};

const normalizarCategoriasNoPayload = payload => Object.hasOwn(payload, 'categ')
    ? { ...payload, categ: normalizaCategorias(payload.categ) || null }
    : payload;

const inserirLancamentos = async payloads => {
    // Um único POST com todas as linhas: o PostgREST grava o lote num só INSERT, inteiro ou
    // nada — sinal caindo no meio nunca deixa uma série pela metade. INSERT nunca é repetido
    // sozinho: sem resposta, o lote pode já estar no banco, e repetir duplicaria.
    // Retorna a representação persistida para a tela usar os ids e os defaults reais do banco.
    // A sessão vem antes do try: se ela travar, nada foi enviado e não há o que conferir.
    const token = await tokenAtual();
    let r;
    try {
        r = await fetchComLimite(`${API}/rest/v1/${TABELA_FIN}`, {
            method: 'POST',
            headers: { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify(payloads.map(normalizarCategoriasNoPayload)),
        }, 'inserir');
    } catch (err) {
        // Sem resposta o lote pode ter sido gravado: recarrega pra tela mostrar se entrou.
        if (err.semResposta) { aposGravar(); throw erroSemResposta(`${err.message} — sem confirmação: pode ter salvado. Recarregue e confira antes de repetir`); }
        throw err;
    }
    if (!r.ok) throw Error(`inserir: ${r.status} ${r.texto}`);
    return aposGravar(JSON.parse(r.texto));
};

const inserirLancamento = async payload => (await inserirLancamentos([payload]))[0];

const linhaExiste = async id => {
    const r = await fetchComLimite(`${API}/rest/v1/${TABELA_FIN}?select=id&id=eq.${encodeURIComponent(id)}`, {
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual() },
    }, 'conferir exclusão');
    if (!r.ok) throw Error(`conferir exclusão: ${r.status} ${r.texto}`);
    return JSON.parse(r.texto).length > 0;
};

const excluirLancamento = async id => comRetentativas(async tentativa => {
    // Prefer retorna a linha removida: resposta vazia denuncia policy/RLS sem fingir sucesso.
    const r = await fetchComLimite(`${API}/rest/v1/${TABELA_FIN}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), Prefer: 'return=representation' },
    }, 'excluir');
    if (!r.ok) throw Error(`excluir: ${r.status} ${r.texto}`);
    if (JSON.parse(r.texto).length) return aposGravar();
    // Numa repetição, a tentativa sem resposta pode ter excluído de fato: só é bloqueio se a
    // linha ainda existir.
    if (tentativa > 1 && !(await linhaExiste(id))) return aposGravar();
    throw Error('nenhuma linha excluída (RLS/policy do Supabase pode estar bloqueando DELETE)');
});

const atualizarLancamentos = async (ids, campos) => comRetentativas(async () => {
    // Mesmos campos em várias linhas num só PATCH (filtro id=in.(...)).
    const filtro = ids.length === 1 ? `eq.${encodeURIComponent(ids[0])}` : `in.(${ids.map(encodeURIComponent).join(',')})`;
    const r = await fetchComLimite(`${API}/rest/v1/${TABELA_FIN}?id=${filtro}`, {
        method: 'PATCH',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(normalizarCategoriasNoPayload(campos)),
    }, 'atualizar');
    if (!r.ok) throw Error(`atualizar: ${r.status} ${r.texto}`);
    const linhas = JSON.parse(r.texto);
    if (linhas.length < ids.length) throw Error('nenhuma linha atualizada (RLS/policy do Supabase pode estar bloqueando UPDATE)');
    return aposGravar(linhas);
});

// Próximo recorrencia_id da sequência do banco (fin_recorrencia_seq, via a função da
// migration 28): a numeração é sempre 1, 2, 3…, nunca o id de um lançamento. Não repete
// sozinho: cada chamada consome um número, e uma repetição cega deixaria um buraco.
const proximaRecorrencia = async () => {
    const r = await fetchComLimite(`${API}/rest/v1/rpc/proxima_recorrencia`, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), 'Content-Type': 'application/json' },
        body: '{}',
    }, 'numerar recorrência');
    if (!r.ok) throw Error(`numerar recorrência: ${r.status} ${r.texto}`);
    const numero = JSON.parse(r.texto);
    if (!Number.isInteger(numero) || numero <= 0) throw Error(`numerar recorrência: resposta inválida (${r.texto})`);
    return numero;
};

const atualizarLancamento = async (id, campos) => (await atualizarLancamentos([id], campos))[0];

// Grava UMA escolha de um ciclo na linha dele em fin_ciclo (a linha existe: é o próprio
// ciclo). Repetir dá o mesmo resultado, então pode tentar de novo sozinho quando não houver
// resposta, como qualquer UPDATE.
const salvarLimiteDoCiclo = async (cicloId, campo, valor) => comRetentativas(async () => {
    const r = await fetchComLimite(`${API}/rest/v1/${TABELA_FIN_CICLO}?id=eq.${encodeURIComponent(cicloId)}`, {
        method: 'PATCH',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ [campo]: valor }),
    }, 'salvar limite');
    if (!r.ok) throw Error(`salvar limite: ${r.status} ${r.texto}`);
    const linhas = JSON.parse(r.texto);
    if (!linhas.length) throw Error('limite não gravado (RLS/policy do Supabase pode estar bloqueando)');
    return aposGravar(linhas[0]);
});

// Números do PostgREST (numeric vem como texto) e mês como AAAA-MM-DD.
const numeroOuNulo = v => (v == null ? null : +v);
const normalizarMeta = m => ({
    ...m, valor: numeroOuNulo(m.valor), entrada: numeroOuNulo(m.entrada), juros_mensal: numeroOuNulo(m.juros_mensal),
    custo_mensal: numeroOuNulo(m.custo_mensal), mes: m.mes ? dataISO(m.mes) : null,
});

// Metas (fin_meta, migration 36): sem a tabela (404 do PostgREST), a tela segue sem metas em
// vez de travar a carga — o botão Metas só aparece com ela (Estado.temMetas). Qualquer outro
// erro derruba a carga como as outras tabelas: sumir com as metas mudaria as projeções calado.
async function carregarMetas() {
    try {
        Estado.metas = (await buscar(TABELA_FIN_META)).map(normalizarMeta);
        Estado.temMetas = true;
    } catch (err) {
        if (!/: 404 |PGRST205/.test(err.message)) throw err;
        Estado.metas = [];
        Estado.temMetas = false;
    }
}

// Grava metas: mesma forma das outras tabelas (PATCH/DELETE por id exato, POST devolvendo a
// linha). O id vai sempre por encodeURIComponent no filtro.
const gravarMeta = async (metodo, id, campos) => {
    const filtro = id == null ? '' : `?id=eq.${encodeURIComponent(id)}`;
    const executar = async () => {
        const r = await fetchComLimite(`${API}/rest/v1/${TABELA_FIN_META}${filtro}`, {
            method: metodo,
            headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: campos ? JSON.stringify(campos) : undefined,
        }, 'gravar meta');
        if (!r.ok) throw Error(`gravar meta: ${r.status} ${r.texto}`);
        const linhas = JSON.parse(r.texto);
        if (!linhas.length) throw Error('meta não gravada (RLS/policy do Supabase pode estar bloqueando)');
        return aposGravar(linhas[0]);
    };
    // PATCH e DELETE são idempotentes; POST nunca repete sozinho (duplicaria a meta).
    return metodo === 'POST' ? executar() : comRetentativas(executar);
};
const inserirMeta = campos => gravarMeta('POST', null, campos);
const atualizarMeta = (id, campos) => gravarMeta('PATCH', id, campos);
const excluirMeta = id => gravarMeta('DELETE', id, null);

async function carregarDados() {
    const lancamentosCrus = await buscar(TABELA_FIN);
    await carregarMetas();
    // fin.pra_sempre vem da migration 31: sem ela, o app não mostra nem grava o campo.
    Estado.temPraSempre = lancamentosCrus.some(r => 'pra_sempre' in r);
    // Os ciclos são as linhas de fin_ciclo (inicio/fim, migration 26). Sem a tabela nesse
    // formato não há ciclo nenhum pra montar a tela: a carga para com a instrução do que falta.
    let linhasCiclo;
    try {
        linhasCiclo = await buscar(TABELA_FIN_CICLO);
    } catch (err) {
        throw Error(`Tabela de ciclos indisponível (${err.message}). Aplique migrations/25-tabela-fin-ciclo.sql e 26-ciclo-com-inicio-e-fim.sql.`);
    }
    if (linhasCiclo.length && !('inicio' in linhasCiclo[0])) {
        throw Error('fin_ciclo ainda sem início/fim. Aplique migrations/26-ciclo-com-inicio-e-fim.sql.');
    }
    const { ciclos, avisos: avisosDosCiclos } = ciclosDeFinCiclo(linhasCiclo);
    Estado.ciclos = ciclos;
    // id do ciclo -> linha de fin_ciclo (as escolhas: tetos, Aprovado, Garantia).
    Estado.limitesPorCiclo = new Map(linhasCiclo.map(linha => [linha.id, linha]));
    const diagnosticoDeDados = validarLancamentosCarregados(lancamentosCrus, ciclos);
    diagnosticoDeDados.avisos.push(...avisosDosCiclos);
    Estado.lancamentos = lancamentosCrus.map(r => {
        const categ = normalizaCategorias(r.categ) || null;
        return {
            ...r, categ, fatura: r.fatura ? dataISO(r.fatura) : null, v: +r.valor || 0,
            inv: ehCategoriaInvestimento(categ),
            periodoIdx: periodoDoLancamento(r),
        };
    });
    // Recarregar no meio da simulação descarta os simulados: o "antes" passa a ser o recarregado.
    if (Estado.simulando) guardarRetratoAntesDaSimulacao();
    Estado.faturas = [...new Set(Estado.lancamentos.map(r => r.fatura).filter(Boolean))]
        .sort((a, b) => timestamp(a) - timestamp(b)).map(vencimento => ({ vencimento }));
    return { lancamentosCrus, diagnosticoDeDados };
}
