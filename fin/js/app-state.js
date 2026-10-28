// Configuração e estado compartilhado da aplicação.
// Este arquivo não manipula a tela nem chama o banco.
// Configuração pública do cliente. A chave publicável identifica o projeto, mas não
// substitui as policies do banco; qualquer autorização continua sendo responsabilidade do RLS.
const API = 'https://yzmyncxoskvqzdczaill.supabase.co';
const KEY = 'sb_publishable_Fq984qUdQO8mGq4PSYmUiQ_ySaLrmEQ';
// Nome técnico da tabela financeira no banco. O domínio continua chamando cada registro de lançamento.
const TABELA_FIN = 'fin';
// Ciclos (inicio/fim) e as escolhas de cada um (tetos Besteira/Isabella, Aprovado,
// Garantia), uma linha por ciclo (migrations 25 e 26).
const TABELA_FIN_CICLO = 'fin_ciclo';
const TABELA_FIN_META = 'fin_meta';   // metas (migration 36)

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
// Marco histórico: ciclos anteriores não entram na cascata do saldo, para não misturar
// movimentos antigos que ainda não possuem base confiável de saldo inicial.
const SALDO_INICIAL = 0;
const SALDO_DESDE = '2026-08-07';
const COLS = [
    ['data', 'Data', 'd'], ['nome', 'Nome', 't'], ['valor', 'Valor', 'n'],
    ['categ', 'Categoria', 't'], ['freq', 'Frequência', 't'], ['seguintes', 'Próx. 3', 's'], ['pago', 'Pago', 'b'],
    ['reserva', 'Reserva', 'b'], ['comprometido', 'Comprometido', 'b'], ['pra_sempre', 'Pra sempre', 'b'],
    ['prio', 'Prio', 'n'], ['obs', 'Obs', 't'], ['canal', 'Canal', 't'], ['id', 'ID', 'n'],
];
// Mesmas colunas do desktop no mobile: a tabela já tinha rolagem horizontal própria
// (.wrap) pra telas estreitas, então não precisa de um recorte de colunas à parte. Prio é a
// única exceção de tabela: só faz sentido na fila de elevação do Backlog (ver
// estadoOrdenacao), então some nas demais (Débito, Crédito), onde a linha já tem ciclo — e,
// no Backlog, vem na FRENTE de tudo (inclusive Data), já que é o primeiro critério que
// importa ali: decidir o que elevar primeiro pra um ciclo.
// Próx. 3 (ver presencasNosSeguintes em finance.js) fala dos ciclos seguintes ao da linha:
// sem ciclo, o Backlog não tem a coluna.
const colunasDaTabela = idTabela => idTabela === 'bk'
    ? [COLS.find(([chave]) => chave === 'prio'), ...COLS.filter(([chave]) => chave !== 'prio' && chave !== 'seguintes')]
    : COLS.filter(([chave]) => chave !== 'prio');
// Pra sempre só aparece quando o banco já tem a coluna (migration 31): antes dela, mostrar
// ou gravar o campo faria o cadastro e o toggle falharem.
const colunasAtivas = idTabela => colunasDaTabela(idTabela)
    .filter(([chave]) => chave !== 'pra_sempre' || Estado.temPraSempre);
const isMobile = () => matchMedia('(max-width: 640px)').matches;

// Único estado mutável da tela. Dados vindos do banco são normalizados em carregarDados;
// as flags iniciadas com "_" pertencem apenas à interface e nunca são persistidas.
const Estado = {
    ciclos: [], faturas: [], lancamentos: [], valorFaturaPorCiclo: {},
    selecionados: new Map(), ordenacaoPorTabela: {}, filtroTexto: {}, linhasVisiveis: {},
    fechados: {}, cicloQuitadoRecolhido: null, ordComp: { k: 'total', d: 2 }, simulando: false,
    _proxIdSimulado: 0,
    // Retrato dos dados reais (lançamentos e escolhas por ciclo) tirado ao ligar a simulação,
    // pra mostrar "antes → depois" nos números que ela mudou. null fora da simulação.
    retratoAntesDaSimulacao: null,
    // Metas (fin_meta, migration 36). Vazio sem a tabela: o resto do app segue igual.
    metas: [], temMetas: false,
    // id do ciclo -> linha de fin_ciclo (escolhas vazias = padrões/herança).
    limitesPorCiclo: new Map(),
    ultimaCarga: 0, ultimaConsolidacao: 0, gravacoes: 0, gravacoesNaUltimaCarga: 0, cargasEmAndamento: 0,
    temPraSempre: false,        // o banco já tem fin.pra_sempre (migration 31)? Ver carregarDados.
    redesenhoPendente: false,   // recarga silenciosa esperando a edição da tabela acabar
    // Materializar/Consolidar (um clique) ou Consolidar tudo (clique ou automático) gravando
    // Aporte/Resgate: só um por vez, senão os dois leem "sem Aporte no ciclo" e cada um insere.
    gravandoAjuste: false,
    // Clique em Besteira/Isabella no título do Débito: 'besteira' | 'isabella' | null.
    filtroTeto: null,
};

// Login por usuário: o Supabase Auth só entra com e-mail, então o app traduz o usuário
// digitado para o e-mail da conta. Com "@", o texto já é o e-mail e vai direto. Nada muda
// no Supabase (senha, sessão e RLS por auth.uid() continuam iguais).
const EMAIL_POR_USUARIO = { victor: 'victor.cabrera0209@gmail.com' };
const emailDoLogin = texto => {
    const digitado = String(texto || '').trim();
    return digitado.includes('@') ? digitado : EMAIL_POR_USUARIO[digitado.toLowerCase()] || null;
};
// Backlog ordena por padrão pela prioridade de elevação (1 = mais provável de entrar num
// ciclo, maior = menos chance); as demais tabelas continuam por data, como sempre.
const estadoOrdenacao = id => Estado.ordenacaoPorTabela[id] || (Estado.ordenacaoPorTabela[id] = { k: id === 'bk' ? 'prio' : 'data', d: 1 });
const estadoFiltroTexto = id => Estado.filtroTexto[id] || (Estado.filtroTexto[id] = {});
