// Inicialização da sessão e da aplicação.

// A PWA guarda somente os arquivos estáticos da interface. Dados financeiros continuam
// vindo do Supabase em rede e nunca são persistidos pelo service worker.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
        .catch(() => { /* Instalação da PWA não pode impedir o uso normal da aplicação. */ }));
}

// Botão Voltar/Avançar do navegador: cada troca real de ciclo empurra uma entrada de
// histórico (ver sincronizarCicloNaUrl em js/data-ui.js); aqui só precisamos reagir lendo a
// URL restaurada e redesenhando — sem rebuscar o Supabase, Estado.lancamentos já tem tudo.
// Sem ciclos carregados ainda (antes do primeiro load() ou já deslogado), não há o que redesenhar.
window.addEventListener('popstate', () => {
    if (!Estado.ciclos.length) return;
    aplicarCicloDaUrl();
    desenhar();
});

const mostraTela = logado => {
    el('login').style.display = logado ? 'none' : 'flex';
    el('app').style.display = logado ? 'block' : 'none';
    if (!logado) tirarCicloDaUrl();
};

// ao abrir a pagina: se ja existe sessao salva, entra direto; senao mostra o login
async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        mostraTela(1); load();
    } else if (!irParaLoginDoHub()) {
        mostraTela(0);
    }
}

// Dentro do hub (…/fin/), o login é o da página inicial: sem sessão vai pra lá e, depois de
// entrar, o hub devolve pra cá com o mesmo ?ciclo. Servido fora do hub (testes), usa o login próprio.
function irParaLoginDoHub() {
    if (!/\/fin\/(index\.html)?$/.test(window.location.pathname)) return false;
    window.location.replace('../?volta=' + encodeURIComponent('fin/' + window.location.search + window.location.hash));
    return true;
}
async function entrar() {
    el('lerr').textContent = '';

    // Usuário desconhecido recebe a mesma mensagem de senha errada: não revela quais existem.
    const email = emailDoLogin(el('email').value);
    const { data, error } = email
        ? await sb.auth.signInWithPassword({ email, password: el('senha').value })
        : { data: null, error: true };

    if (error) {
        // Sem resposta do servidor o supabase-js devolve status 0 (não lança): é a rede, não a senha.
        el('lerr').textContent = email && !error.status ? 'Sem conexão. Tente de novo.' : 'Usuário ou senha inválidos.';
        return;
    }

    mostraTela(1);
    load();
}

el('email').onkeydown = e => {
    if (e.key == 'Enter') el('senha').focus();
};

el('senha').onkeydown = e => {
    if (e.key == 'Enter') entrar();
};

el('modalDiagnostico').addEventListener('click', e => {
    if (e.target == el('modalDiagnostico')) el('modalDiagnostico').close();
});
el('btDiagnostico').onclick = abrirDiagnosticoDeDados;
el('modalConsolidarTudo').addEventListener('click', e => {
    if (e.target == el('modalConsolidarTudo')) el('modalConsolidarTudo').close();
});
// Só recarrega do banco (sem navegar nem gravar), em silêncio: base da recarga automática
// abaixo — sem toast nem som, e uma falha não troca a tela pela mensagem de erro.
async function recarregarDados() {
    const bt = el('recarregar');
    if (bt.disabled) return;
    bt.classList.add('carregando');
    bt.disabled = true;
    try {
        await load({ silencioso: true });
    } finally {
        bt.classList.remove('carregando');
        bt.disabled = false;
    }
}

// Recarga após gravação: todo INSERT/UPDATE/DELETE confirmado pelo banco — cadastro, edição
// na tabela, exclusão, toggles, tetos e limites do ciclo, consolidação — chama isto (ver
// aposGravar em supabase-api.js), e a tela recarrega do banco sozinha, em silêncio. Espera
// a tela ficar livre (sem campo em edição, sem modal aberto, sem carga ou Consolidar em
// andamento) pra não apagar o que o usuário está digitando, e não repete a carga quando o
// próprio fluxo já recarregou depois de gravar. Várias gravações seguidas viram uma só carga.
const ESPERA_RECARGA_APOS_GRAVACAO_MS = 300;
let temporizadorRecargaAposGravacao = null;
// Nunca durante a simulação: a carga apagaria os lançamentos simulados (uma gravação real que
// terminou depois de ligar a simulação espera; desligá-la já recarrega e cobre a espera).
const telaSemEdicaoEmCurso = () =>
    el('app').style.display !== 'none' && !Estado.simulando && !document.querySelector('dialog[open]') &&
    !document.activeElement?.matches?.('input, select, textarea') &&
    !el('recarregar').disabled && !Estado.cargasEmAndamento;
// Contador em vez de relógio: carga e gravação no mesmo milissegundo não se confundem.
function recarregarAposGravacao() {
    const gravacao = ++Estado.gravacoes;
    clearTimeout(temporizadorRecargaAposGravacao);
    const tentar = () => {
        if (Estado.gravacoesNaUltimaCarga >= gravacao) return;   // uma carga posterior já trouxe
        if (!telaSemEdicaoEmCurso()) {
            temporizadorRecargaAposGravacao = setTimeout(tentar, ESPERA_RECARGA_APOS_GRAVACAO_MS);
            return;
        }
        recarregarDados();
    };
    temporizadorRecargaAposGravacao = setTimeout(tentar, ESPERA_RECARGA_APOS_GRAVACAO_MS);
}

// Botão Recarregar (verde, no cabeçalho): numa só ação, recarrega do banco, volta ao ciclo
// atual, limpa os filtros e roda o Consolidar tudo (consolidarTudo em form.js, que recarrega
// primeiro e chama voltarAoCicloAtualELimpar entre a carga e a varredura).
el('recarregar').onclick = async () => {
    const bt = el('recarregar');
    if (bt.disabled) return;
    await consolidarTudo(bt, voltarAoCicloAtualELimpar);
};

// Recarga automática: 5 min depois da última carga bem-sucedida, os dados voltam do banco
// (o que mudou em outro aparelho ou no DataGrip aparece sozinho). Só lê: nunca navega, limpa
// filtro nem consolida — isso é só do clique no botão Recarregar. Nunca no meio de algo:
// só com a tela logada e visível, sem modal aberto, sem campo em edição, sem linha
// selecionada, sem simulação (recarregar apagaria os lançamentos simulados) e sem outra
// carga/gravação em andamento. Ocupado, tenta de novo na próxima verificação (30 s).
const INTERVALO_RECARGA_AUTOMATICA_MS = 5 * 60 * 1000;
const telaLivreParaRecarregar = () =>
    el('app').style.display !== 'none' && !document.hidden && !Estado.simulando &&
    !document.querySelector('dialog[open]') && !Estado.selecionados.size &&
    !document.activeElement?.matches?.('input, select, textarea') &&
    !el('recarregar').disabled;
// Consolidação automática: de 15 em 15 min (contados da última consolidação, automática ou
// pelo botão; a 1ª vem 15 min depois de abrir a tela), roda o Consolidar tudo — recarrega e
// materializa/consolida Aporte/Resgate e datas duplicadas —, mas sem voltar ao ciclo atual
// nem limpar filtros, e em silêncio (só avisa se gravou algo). Mesmas condições de tela livre
// da recarga. Quando vence, substitui a recarga
// simples daquela verificação, pois já recarrega.
const INTERVALO_CONSOLIDACAO_AUTOMATICA_MS = 15 * 60 * 1000;
setInterval(() => {
    if (!Estado.ultimaCarga) return;
    if (!Estado.ultimaConsolidacao) Estado.ultimaConsolidacao = Date.now();
    if (!telaLivreParaRecarregar()) return;
    if (Date.now() - Estado.ultimaConsolidacao >= INTERVALO_CONSOLIDACAO_AUTOMATICA_MS) {
        consolidarTudo(el('recarregar'), () => {}, { silencioso: true });
        return;
    }
    if (Date.now() - Estado.ultimaCarga >= INTERVALO_RECARGA_AUTOMATICA_MS) recarregarDados();
}, 30 * 1000);

// Voltou a conexão (ex.: saiu do metrô): abriu sem internet e a carga falhou (a tela ficou em
// "Falhou"), carrega sozinho; já tinha carregado, recarrega em silêncio se a tela estiver livre.
// Gravação que falhou sem resposta não é refeita: o INSERT pode já ter entrado (ver supabase-api.js).
addEventListener('online', () => {
    if (el('app').style.display === 'none' || Estado.cargasEmAndamento) return;
    if (!Estado.ultimaCarga) load();
    else if (telaLivreParaRecarregar()) recarregarDados();
});

if (API.includes('SEUPROJETO')) { mostraTela(1); load(); }   // sem chaves configuradas: pula o login (modo dev)
else boot();
