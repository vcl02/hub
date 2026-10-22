// Carregamento dos dados e atualização dos seletores da interface.

// Interface: carregamento, filtros, tabelas, visões, gráficos e formulários.

function atualizarCombos(lancamentosCrus) {
    const selecaoAnterior = el('ciclo').value;
    const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const idxAtual = Estado.ciclos.findIndex(per => hoje >= per.ini && hoje <= dataISO(per.fat));
    // Conta restrita só navega entre o ciclo atual e o próximo, mesmo vazios: nunca Backlog,
    // nunca um ciclo mais antigo ou mais distante no futuro.
    const usados = modoRestrito()
        ? [idxAtual, idxAtual + 1].filter(i => i >= 0 && i < Estado.ciclos.length)
        : [...new Set(Estado.lancamentos.map(r => r.periodoIdx).filter(p => p != null))];

    if (!modoRestrito() && idxAtual >= 0 && !usados.includes(idxAtual)) usados.push(idxAtual);
    usados.sort((a, b) => a - b);
    const opcoesCiclo = (modoRestrito() ? '' : '<option value=-1>Backlog') +
        usados.map(i => `<option value=${i}>${nomePeriodo(Estado.ciclos[i])}`).join('');
    el('ciclo').innerHTML = opcoesCiclo;

    // preserva a selecao anterior se ainda for valida; senao cai no periodo atual (ou no mais recente usado)
    const valorAnterior = selecaoAnterior === '' ? null : +selecaoAnterior;
    const valorEscolhido = valorAnterior !== null && (valorAnterior < 0 || usados.includes(valorAnterior))
        ? valorAnterior
        : (idxAtual >= 0 ? idxAtual : usados.at(-1) ?? -1);
    el('ciclo').value = valorEscolhido;

    Estado.idxHoje = idxAtual;      // ancora do pre-preenchimento inicial de De/Ate (ciclo atual + proximo)

    // Comparar sempre agrupa por Categoria agora (sem filtro "Agrupar por" na toolbar) —
    // ver vComp(), que fixa coluna='categ' direto.

    // Categoria do formulario e' populada por popularCategoriasNoForm() (ordenada por uso
    // recente), chamada toda vez que o modal abre — nao precisa duplicar aqui.

    // Os combos conservam todos os ciclos usados. modoSimples() (conta restrita) limita
    // apenas a visualização a um ciclo por vez, sem uma regra paralela de navegação. "Todos"
    // (value vazio) é a opção padrão.
    // Backlog só existe no De, pois não faz sentido compará-lo com outro período. Conta
    // restrita nunca vê "Todos" (Comparar) nem Backlog — só os ciclos de usadosNaveg.
    const usadosNaveg = usados;
    // De/Até mostram o mês abreviado ("Out/26"): mais curto, cabe melhor na navegação; o nome
    // completo fica no title de cada opção.
    const opcaoDoCiclo = i => `<option value=${i} title="${nomePeriodo(Estado.ciclos[i])}">${nomePeriodoAbrev(Estado.ciclos[i])}`;
    const opcoesPeriodo = (modoRestrito() ? '' : '<option value="">Todos</option>') +
        usadosNaveg.map(opcaoDoCiclo).join('');
    const opcoesPeriodoDe = (modoRestrito() ? '' : '<option value="">Todos</option><option value=-1>Backlog') +
        usadosNaveg.map(opcaoDoCiclo).join('');
    const deAnterior = el('compDe').value, ateAnterior = el('compAte').value;

    el('compDe').innerHTML = opcoesPeriodoDe;
    el('compAte').innerHTML = opcoesPeriodo;
    el('compDe').value = deAnterior == '-1' || usadosNaveg.includes(+deAnterior) ? deAnterior : '';
    el('compAte').value = usadosNaveg.includes(+ateAnterior) ? ateAnterior : '';

    // A URL só restaura uma consulta de ciclo único; comparações não viram estado compartilhável.
    aplicarCicloDaUrl();
}

// Identificador estável para compartilhar o ciclo, sem expor o índice interno que pode mudar
// quando novos Faturamentos PJ são incluídos. O nome do ciclo já é definido pelo mês do início.
// Backlog não tem mês de início (não é um ciclo de verdade) — usa a palavra fixa "backlog".
function chaveCicloNaUrl(idx) {
    if (+idx === -1) return 'backlog';
    const ciclo = Estado.ciclos[+idx];
    return ciclo?.ini ? dataISO(ciclo.ini).slice(0, 7) : '';
}

function aplicarCicloDaUrl() {
    // Ciclo de um link aberto antes do login (tirado da URL na tela de login): vale uma vez.
    const chave = new URLSearchParams(window.location.search).get('ciclo') ?? cicloPedidoAntesDoLogin;
    cicloPedidoAntesDoLogin = null;
    // Backlog só existe no combo De (nunca no Até — "não faz sentido comparar com outro
    // período", ver atualizarCombos); conta restrita nem tem a opção. Só aplica se a opção
    // existir de verdade no combo, senão a tela mantém o ciclo padrão seguro.
    if (chave === 'backlog') {
        if ([...el('compDe').options].some(opcao => opcao.value === '-1')) el('compDe').value = -1;
        return;
    }
    if (!/^\d{4}-\d{2}$/.test(chave || '')) return;

    const idx = Estado.ciclos.findIndex((_, i) => chaveCicloNaUrl(i) === chave);
    // Um ciclo sem opção navegável não é imposto à tela; ela mantém o ciclo padrão seguro.
    if (idx < 0 || ![...el('compDe').options].some(opcao => +opcao.value === idx)) return;
    el('compDe').value = idx;
    el('compAte').value = idx;
}

// Mantém o link copiável pra De=Até em ciclos reais E pro Backlog (De=-1, Até ignorado/
// desabilitado nesse caso — ver modoBlocos). Uma troca REAL de ciclo empurra uma entrada de
// histórico (pushState), pra Voltar/Avançar do navegador navegarem entre ciclos já
// visitados; redesenhos que não mudam o ciclo (filtro, seleção de linha, edição inline…)
// continuam substituindo a entrada atual (replaceState), sem encher o histórico. undefined
// na primeira chamada evita empurrar uma entrada pra o próprio estado de carga inicial.
let _ultimaChaveCicloUrl;
function sincronizarCicloNaUrl() {
    const de = el('compDe').value, ate = el('compAte').value;
    const chave = de === '-1' ? 'backlog' : (de && de == ate && +de >= 0 ? chaveCicloNaUrl(de) : '');
    const trocouDeCiclo = _ultimaChaveCicloUrl !== undefined && chave !== _ultimaChaveCicloUrl;
    _ultimaChaveCicloUrl = chave;

    const url = new URL(window.location.href);
    if (chave) url.searchParams.set('ciclo', chave);
    else url.searchParams.delete('ciclo');
    const destino = url.pathname + url.search + url.hash;
    if (destino !== window.location.pathname + window.location.search + window.location.hash) {
        if (trocouDeCiclo) window.history.pushState(window.history.state, '', destino);
        else window.history.replaceState(window.history.state, '', destino);
    }
}

// Tela de login sem "?ciclo" na URL (pedido do mantenedor): ali não há ciclo nenhum na tela.
// O ciclo de um link compartilhado fica guardado e é aplicado depois de entrar
// (aplicarCicloDaUrl); ao sair, não guarda — o próximo login abre no ciclo atual.
let cicloPedidoAntesDoLogin = null;
function tirarCicloDaUrl({ guardar = true } = {}) {
    const url = new URL(window.location.href);
    const chave = url.searchParams.get('ciclo');
    _ultimaChaveCicloUrl = undefined;   // a 1ª sincronização depois de entrar substitui, não empilha
    cicloPedidoAntesDoLogin = guardar ? chave : null;
    if (chave === null) return;
    url.searchParams.delete('ciclo');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

// Fluxo completo de carga: busca dados, atualiza os combos, mostra o contador e desenha a tela.
// E a unica funcao chamada de fora (pelo botao de recarregar e pelo login).
// Problemas precisam ficar visíveis para quem usa a tela, mas sem modificar dados nem
// despejar métricas no console. O mesmo modal separa inconsistências de avisos de revisão.
function preencherListaDiagnostico(id, itens) {
    el(id).replaceChildren(...itens.map(item => {
        const linha = document.createElement('li');
        linha.textContent = item;
        return linha;
    }));
}

function mostrarDiagnostico(titulo, texto, diagnostico) {
    el('tituloDiagnostico').textContent = titulo;
    el('textoDiagnostico').textContent = texto;
    const inconsistencias = diagnostico.inconsistencias || [];
    const avisos = diagnostico.avisos || [];
    preencherListaDiagnostico('listaInconsistencias', inconsistencias);
    preencherListaDiagnostico('listaAvisos', avisos);
    el('secaoInconsistencias').hidden = !inconsistencias.length;
    el('secaoAvisos').hidden = !avisos.length;
    if (!el('modalDiagnostico').open) el('modalDiagnostico').showModal();
}

// Resultado detalhado de "Consolidar tudo" (ver consolidarTudo em form.js): diferente do
// diagnóstico de carga, este abre SOZINHO ao fim da varredura — é a resposta direta a um
// clique explícito do próprio usuário, não um aviso de fundo, então não há por que escondê-lo
// atrás de um botão. Mesmo esquema de lista do diagnóstico, só que com o que a varredura
// de fato gravou, ciclo a ciclo (a maioria nem aparece na tela aberta).
function mostrarResultadoConsolidarTudo(resumo, log) {
    el('textoConsolidarTudo').textContent = resumo;
    preencherListaDiagnostico('listaConsolidarTudo', log);
    if (!el('modalConsolidarTudo').open) el('modalConsolidarTudo').showModal();
}

let diagnosticoDeDadosAtual = { inconsistencias: [], avisos: [] };

// A última carga decide o estado do ícone. O modal só abre por escolha do usuário para
// não interromper a consulta, mas o vermelho deixa claro que há algo a revisar.
function atualizarBotaoDiagnostico(diagnostico) {
    diagnosticoDeDadosAtual = diagnostico;
    const inconsistencias = diagnostico.inconsistencias || [];
    const temInconsistencia = inconsistencias.length > 0;
    const botao = el('btDiagnostico');
    botao.classList.toggle('temInconsistencia', temInconsistencia);
    const descricao = temInconsistencia
        ? `${inconsistencias.length} inconsistência${inconsistencias.length === 1 ? '' : 's'} na última carga`
        : 'Sem inconsistências na última carga';
    botao.setAttribute('aria-label', descricao);
    botao.title = descricao;
}

function abrirDiagnosticoDeDados() {
    const { inconsistencias, avisos } = diagnosticoDeDadosAtual;
    if (!inconsistencias.length && !avisos.length) {
        mostrarDiagnostico('Dados verificados', 'Nenhuma inconsistência ou aviso na última carga.', diagnosticoDeDadosAtual);
        return;
    }
    const titulo = inconsistencias.length ? 'Dados para revisar' : 'Avisos de dados';
    mostrarDiagnostico(titulo, 'Nada foi alterado. Revise no banco se fizer sentido.', diagnosticoDeDadosAtual);
}

const LIMIAR_CARGA_LENTA_MS = 1000;
let contextoAudioToast;

// Um tom curto dá presença ao toast sem exigir arquivo externo. Navegadores podem bloquear
// áudio antes da primeira interação; nesse caso o aviso visual continua sendo suficiente.
async function tocarSomToast() {
    try {
        const ContextoAudio = window.AudioContext || window.webkitAudioContext;
        if (!ContextoAudio) return;
        contextoAudioToast ??= new ContextoAudio();
        if (contextoAudioToast.state === 'suspended') await contextoAudioToast.resume();
        const oscilador = contextoAudioToast.createOscillator();
        const ganho = contextoAudioToast.createGain();
        oscilador.type = 'sine';
        oscilador.frequency.value = 660;
        ganho.gain.setValueAtTime(.0001, contextoAudioToast.currentTime);
        ganho.gain.exponentialRampToValueAtTime(.012, contextoAudioToast.currentTime + .01);
        ganho.gain.exponentialRampToValueAtTime(.0001, contextoAudioToast.currentTime + .09);
        oscilador.connect(ganho).connect(contextoAudioToast.destination);
        oscilador.start();
        oscilador.stop(contextoAudioToast.currentTime + .1);
    } catch {
        // Falha de permissão/autoplay não deve impedir nem registrar ruído para um toast.
    }
}

// Toast é reservado a estado operacional passageiro; não mistura uma falha de rede com
// inconsistências persistentes dos registros, que precisam ser lidas no modal.
function mostrarToast(titulo, texto) {
    void tocarSomToast();
    const toast = document.createElement('article');
    const tituloToast = document.createElement('strong');
    const descricao = document.createElement('p');
    const fechar = document.createElement('button');
    tituloToast.textContent = titulo;
    descricao.textContent = texto;
    fechar.type = 'button';
    fechar.textContent = '×';
    fechar.title = 'Fechar';
    fechar.setAttribute('aria-label', 'Fechar');
    const remover = () => toast.remove();
    fechar.onclick = remover;
    toast.className = 'toast';
    toast.append(tituloToast, fechar, descricao);
    el('toasts').append(toast);
    setTimeout(remover, 7000);
}

// Recarga em silêncio (automática, após gravar, consolidação de 15 min) que termina com
// uma célula da tabela em edição não redesenha por cima: redesenhar apagaria o campo e o que
// já foi digitado. Os dados novos já estão em Estado; a tela espera a edição acabar. Se a
// própria edição redesenhar ao confirmar (desenhar zera Estado.redesenhoPendente), não há
// mais nada a fazer.
const edicaoNaTabelaEmCurso = () => {
    const ativo = document.activeElement;
    return !!ativo?.matches?.('input, select, textarea') && el('out').contains(ativo);
};
function desenharQuandoLivre() {
    if (!edicaoNaTabelaEmCurso()) { desenhar(); return; }
    Estado.redesenhoPendente = true;
    const tentar = () => {
        if (!Estado.redesenhoPendente) return;
        if (edicaoNaTabelaEmCurso()) { setTimeout(tentar, 300); return; }
        desenhar();
    };
    setTimeout(tentar, 300);
}

// Devolve true quando a carga deu certo — quem depende de dados frescos (Consolidar tudo)
// não segue em cima de uma carga que falhou. `silencioso` (recarga automática): sem toast
// (cada toast toca um som) e, se falhar, mantém a tela como estava em vez de trocá-la pela
// mensagem de erro — a próxima verificação tenta de novo sozinha.
async function load({ silencioso = false } = {}) {
    if (API.includes('SEUPROJETO')) { el('out').innerHTML = '<p class=empty>Cole API e KEY no topo do script.</p>'; return false; }
    const inicioCarga = performance.now();
    // Quantas gravações já existiam quando esta carga começou: ela traz todas essas.
    const gravacoesAteAqui = Estado.gravacoes;
    Estado.cargasEmAndamento++;
    try {
        const { lancamentosCrus, diagnosticoDeDados } = await carregarDados();
        const aposDados = performance.now();
        atualizarCombos(lancamentosCrus);
        const aposCombos = performance.now();

        if (silencioso) desenharQuandoLivre(); else desenhar();
        const aposRender = performance.now();
        const cargaMs = Math.round(aposRender - inicioCarga);
        console.info(`[diag] carga ${cargaMs}ms | combos ${Math.round(aposCombos - aposDados)}ms | render ${Math.round(aposRender - aposCombos)}ms | ${Estado.ciclos.length} ciclos | ${Estado.lancamentos.length} lançamentos`);
        if (cargaMs >= LIMIAR_CARGA_LENTA_MS && !silencioso) mostrarToast('Carga lenta', `A tela levou ${(cargaMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s.`);
        atualizarBotaoDiagnostico(diagnosticoDeDados);
        Estado.ultimaCarga = Date.now();   // base da recarga automática (bootstrap.js)
        // Base da recarga após gravação: carga que COMEÇOU depois de gravar já traz o gravado.
        Estado.gravacoesNaUltimaCarga = Math.max(Estado.gravacoesNaUltimaCarga, gravacoesAteAqui);
        return true;
    } catch (e) {
        if (silencioso) {
            console.warn('[recarga automática] falhou:', e.message);
            return false;
        }
        el('st').textContent = '';
        // e.message pode trazer texto crudo da resposta do Supabase (ver buscar() em
        // supabase-api.js); escapar evita que um corpo de erro com '<'/'&' seja interpretado
        // como HTML em vez de aparecer como texto.
        el('out').innerHTML = '<p class=empty>Falhou: ' + escapeHtml(e.message) + '</p>';
        mostrarToast('Não foi possível carregar', e.message);
        return false;
    } finally {
        Estado.cargasEmAndamento--;
    }
}

// ===================================================================
// FILTROS — os selects/checkboxes da barra de ferramentas
// ===================================================================
// le um select de 3 estados (Ambos/Sim/Não) e diz se um valor booleano passa no filtro
