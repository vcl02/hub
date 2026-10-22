// Cadastro, calculadora e simulação de lançamentos.

const modalNovo = el('modalNovo');

// mascara de dinheiro: mantem so digitos e desloca 2 casas decimais, tipo caixa eletronico.
function formataMascaraDinheiro(valorDigitado) {
    const digitos = valorDigitado.replace(/\D/g, '');
    const numero = parseInt(digitos || '0', 10) / 100;
    return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function valorMascaraParaNumero(textoMascarado) {
    const digitos = textoMascarado.replace(/\D/g, '');
    return parseInt(digitos || '0', 10) / 100;
}
el('fValor').addEventListener('input', e => {
    const cursorNoFim = e.target.selectionEnd == e.target.value.length;
    e.target.value = formataMascaraDinheiro(e.target.value);
    if (cursorNoFim) e.target.setSelectionRange(e.target.value.length, e.target.value.length);
    atualizaSinalUI();
});

let sinalPositivo = false;
function atualizaSinalUI() {
    const semValor = valorMascaraParaNumero(el('fValor').value || '0') === 0;
    el('fSinal').disabled = semValor;
    el('fSinal').classList.toggle('pos', sinalPositivo && !semValor);
    el('fSinal').classList.toggle('neutro', semValor);
    el('fSinal').textContent = semValor ? '±' : (sinalPositivo ? '+' : '−');
    atualizarParcelaNasVezes();   // todo lugar que muda o valor passa por aqui
    conferirLimiteNoCadastro();
}

// Compra nova no Crédito: o Livre Hoje do cartão da 1ª fatura (a mesma conta do título,
// limiteLivreHojeDoCartao, no ciclo atual) antes → depois dela. O banco bloqueia a compra
// inteira na hora, então "depois" desconta o total — parcelado ou não, pago ou aberto; com
// Frequência, só a 1ª ocorrência (as seguintes entram mês a mês). Negativo: sem limite.
// Só leitura e só no cadastro novo: editar mexe numa linha que já está na conta.
function conferirLimiteNoCadastro() {
    const aviso = el('fLimiteCartao');
    const total = valorMascaraParaNumero(el('fValor').value || '0');
    const fatura = idsFaturasDoFormulario()[0];
    const freq = el('fFreq').value;
    const vezes = freq ? 1 : (+el('fParcelas').value || 1);
    aviso.hidden = !el('fCred').checked || sinalPositivo || !total || !fatura || !!el('modalNovo').dataset.editandoId || !(Estado.idxHoje >= 0);
    if (aviso.hidden) return;
    const cartao = cartaoDaFatura(fatura);
    const compra = freq || el('fDivide').checked ? total : total * vezes;
    const livre = limiteLivreHojeDoCartao(Estado.lancamentos, Estado.idxHoje, cartao);
    const depois = livre - compra;
    aviso.className = `limiteNoCadastro ${depois < -TOLERANCIA_FINANCEIRA ? 'semLimite' : ''}`;
    aviso.title = 'Livre Hoje do cartão antes e depois desta compra (o banco bloqueia o valor inteiro na hora)';
    aviso.innerHTML = `Livre ${NOME_CARTAO[cartao]} ${brl(livre)} → <b class="${corValor(depois)}">${brl(depois)}</b>` +
        (depois < -TOLERANCIA_FINANCEIRA ? ' · sem limite' : '');
}
el('fSinal').onclick = () => { sinalPositivo = !sinalPositivo; atualizaSinalUI(); };

// ---- categorias ordenadas por uso nos ultimos 3 meses ----
// conta quantas vezes cada categoria apareceu em lancamentos dos ultimos ~90 dias;
// a mais usada fica primeiro na lista do <select>.
function categoriasPorPopularidade() {
    const limite = new Date(); limite.setDate(limite.getDate() - 90);
    const limiteIso = limite.toISOString().slice(0, 10);
    const contagem = {};
    Estado.lancamentos.forEach(r => {
        if (!r.data || dataISO(r.data) < limiteIso) return;
        categoriasSeparadas(r.categ).forEach(categoria => {
            contagem[categoria] = (contagem[categoria] || 0) + 1;
        });
    });
    const todas = Estado.lancamentos.flatMap(r => categoriasSeparadas(r.categ));
    return [...new Set(todas)].sort((a, b) =>
        (contagem[b] || 0) - (contagem[a] || 0) || a.localeCompare(b, 'pt'));
}
function popularCategoriasNoForm() {
    // O campo é livre para comportar mais de uma categoria; o datalist só sugere
    // categorias já usadas, inclusive as que vierem na mesma célula separadas por vírgula.
    el('fCategList').innerHTML = categoriasPorPopularidade()
        .map(categoria => `<option value="${escapeHtml(categoria)}"></option>`).join('');
}

// O nome continua livre: esta lista apenas reaproveita o nome distinto e a categoria mais
// recente já cadastrada. Assim nomes com categorias antigas conflitantes não aparecem duas
// vezes, e a escolha mantém a mesma sugestão de categoria usada ao digitar manualmente.
function sugestoesDeNome(lancamentos = Estado.lancamentos) {
    const porNome = new Map();
    lancamentos.forEach(r => {
        const nome = String(r.nome || '').trim();
        const categ = String(r.categ || '').trim();
        const chave = semAcento(nome);
        if (!chave || !valorValido(categ)) return;
        const candidata = { nome, categ, data: dataISO(r.data) || '' };
        const atual = porNome.get(chave);
        if (!atual || candidata.data > atual.data) porNome.set(chave, candidata);
    });
    return [...porNome.values()].sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt') || a.categ.localeCompare(b.categ, 'pt'));
}

let sugestoesDeNomeAtuais = [];

function renderizarSugestoesDeNome(termo = el('fNome').value) {
    const filtro = semAcento(termo).trim();
    const lista = el('nomesExistentes');
    const opcoes = filtro
        ? sugestoesDeNomeAtuais.filter(({ nome }) => semAcento(nome).includes(filtro))
        : [];

    lista.replaceChildren(...opcoes.map(({ nome, categ }) => {
        const opcao = document.createElement('button');
        opcao.type = 'button';
        opcao.className = 'nomeExistente';
        opcao.setAttribute('role', 'option');
        const titulo = document.createElement('span');
        const categoria = document.createElement('small');
        titulo.textContent = nome;
        categoria.textContent = categ;
        opcao.append(titulo, categoria);
        // Mantém o foco no input durante o clique; assim o blur não fecha o combo antes
        // de aplicar nome e categoria escolhidos.
        opcao.onmousedown = evento => evento.preventDefault();
        opcao.onclick = () => {
            el('fNome').value = nome;
            el('fCateg').value = categ;
            atualizarFaturasDoFormulario();
            lista.hidden = true;
            el('fNome').setAttribute('aria-expanded', 'false');
            el('fNome').focus();
        };
        return opcao;
    }));
    lista.hidden = !opcoes.length;
    el('fNome').setAttribute('aria-expanded', String(opcoes.length > 0));
}

function popularNomesNoForm() {
    sugestoesDeNomeAtuais = sugestoesDeNome();
    renderizarSugestoesDeNome();
}

// ---- busca de categoria por nome parecido ----
// ao digitar o Nome, procura nos lancamentos existentes um nome IGUAL (case/acento
// insensitivo) ou que COMECE igual, pega o mais recente com esse nome, e usa a
// categoria dele. So marca como "achado" (pra pular a Categoria no Enter) quando
// a categoria foi de fato preenchida por essa busca.
function buscaCategoriaPorNome(nomeDigitado) {
    const alvo = semAcento(nomeDigitado.trim());
    if (!alvo) return null;
    const candidatos = Estado.lancamentos
        .filter(r => r.nome && r.categ && valorValido(r.categ))
        .filter(r => { const n = semAcento(r.nome); return n === alvo || n.startsWith(alvo) || alvo.startsWith(n); })
        .sort((a, b) => dataISO(b.data || '') < dataISO(a.data || '') ? -1 : 1);   // mais recente primeiro
    return candidatos[0]?.categ || null;
}
// conforme digita o Nome, tenta achar por proximidade uma categoria ja usada com esse
// nome antes e pre-seleciona no combo (voce ainda pode trocar manualmente).
el('fNome').addEventListener('input', () => {
    const categ = buscaCategoriaPorNome(el('fNome').value);
    if (categ && categoriasPorPopularidade().includes(categ)) {
        el('fCateg').value = categ;
        atualizarFaturasDoFormulario();
    }
    renderizarSugestoesDeNome();
});
el('fNome').addEventListener('blur', () => setTimeout(() => {
    el('nomesExistentes').hidden = true;
    el('fNome').setAttribute('aria-expanded', 'false');
}, 100));

// atalhos de Enter nos dois campos de texto: Nome -> foca Valor; Valor -> salva
el('fNome').addEventListener('keydown', e => {
    if (e.key == 'Escape') {
        el('nomesExistentes').hidden = true;
        el('fNome').setAttribute('aria-expanded', 'false');
        return;
    }
    if (e.key == 'Enter') { e.preventDefault(); el('fValor').focus(); }
});
el('fValor').addEventListener('keydown', e => {
    if (e.key != 'Enter') return;
    e.preventDefault();
    // so salva por Enter se os obrigatorios (Nome e Categoria) ja estao preenchidos.
    // senao, ignora em silencio (sem aviso, sem mover foco).
    if (el('fNome').value.trim() && el('fCateg').value) submeteNovoLancamento();
});

// ---- abrir modal: foco no Nome e categorias populares ----
// select de Parcelas so' precisa ser populado uma vez (1x a 40x) — nao muda entre aberturas
if (el('fParcelas').options.length < 40) {
    for (let n = 2; n <= 40; n++) el('fParcelas').add(new Option(`${n}x`, n));
}

// "Dividir valor entre as vezes" e' independente de Credito/Debito — o usuario escolhe
// nos dois modos (ver submeteNovoLancamento: marcado, o valor digitado e' DIVIDIDO entre
// as N linhas, ex: R$300 em 3x = R$100 cada; desmarcado, o valor se REPETE em cada uma,
// ex: R$50 3x = R$50 + R$50 + R$50 — util pra lancar de uma vez uma assinatura/conta
// recorrente de valor fixo). So' um PALPITE inicial segue Credito ao ligar/desligar (compras
// no credito costumam ser parceladas — dividir; contas fora do credito costumam repetir o
// mesmo valor todo mes) — o usuario pode mudar na hora, o toggle nao trava em nada.
function sugereModoValorParcelas() {
    el('fDivide').checked = el('fCred').checked;
    atualizarParcelaNasVezes();
    conferirLimiteNoCadastro();
}

// Cada opção de Vezes já diz quanto fica a parcela ("12x de R$ 779,17"): dividindo, o total
// pelas vezes (o valor das N−1 primeiras; a última absorve os centavos, ver valorDasParcelas);
// sem dividir, o próprio valor digitado, que se repete. Sem valor, só "12x". À vista e a
// contagem da série (com Frequência) ficam como estão.
function atualizarParcelaNasVezes() {
    const total = valorMascaraParaNumero(el('fValor').value || '0');
    const dividir = el('fDivide').checked;
    [...el('fParcelas').options].forEach(opcao => {
        const vezes = Number(opcao.value);
        if (!(vezes > 1)) return;
        opcao.textContent = total ? `${vezes}x de ${brl(dividir ? valorDasParcelas(total, vezes)[0] : total)}` : `${vezes}x`;
    });
}
el('fDivide').addEventListener('change', atualizarParcelaNasVezes);
// Qualquer mudança no cadastro (Crédito, fatura, Vezes, Dividir, Frequência…) pode mudar o
// cartão ou o total: os handlers de cada campo rodam antes deste, que vem pelo borbulhar.
el('formNovo').addEventListener('change', () => conferirLimiteNoCadastro());

function nomeFatura(fatura) {
    return dataBR(fatura.vencimento);
}

// No seletor do cadastro cada fatura diz de qual cartão é (o dia do vencimento decide).
const rotuloFaturaComCartao = vencimento =>
    `${nomeFatura({ vencimento })} · ${NOME_CARTAO[cartaoDaFatura(vencimento)]}`;

// Próximos vencimentos dos dois cartões, do mês passado até o fim da série
// (DATA_LIMITE_RECORRENCIA), mesmo sem compra cadastrada neles: sem isso a 1ª compra num
// cartão novo (ou num mês ainda vazio) não teria fatura pra escolher.
function vencimentosPrevistosDosCartoes(hoje = hojeISO()) {
    const [ano, mes] = hoje.split('-').map(Number);
    const ultimoMes = DATA_LIMITE_RECORRENCIA.slice(0, 7);
    const vencimentos = [];
    for (let i = -1; ; i++) {
        const mesISO = new Date(Date.UTC(ano, mes - 1 + i, 1)).toISOString().slice(0, 7);
        if (mesISO > ultimoMes) return vencimentos;
        CARTOES.forEach(cartao => vencimentos.push(`${mesISO}-${String(DIA_VENCIMENTO_CARTAO[cartao]).padStart(2, '0')}`));
    }
}

// A 1ª parcela fica no cadastro e as demais em #modalFaturasParcelas: a ordem vem do
// data-fatura-parcela, não da posição no documento.
function seletoresDeFatura() {
    return [...document.querySelectorAll('[data-fatura-parcela]')]
        .sort((a, b) => Number(a.dataset.faturaParcela) - Number(b.dataset.faturaParcela));
}

function idsFaturasDoFormulario(incluirSugestoes = true) {
    return seletoresDeFatura()
        .map(select => !incluirSugestoes && select.dataset.faturaSugerida === '1'
            ? null
            : (select.value ? dataISO(select.value) : null));
}

function opcoesFaturasDisponiveis() {
    // DISTINCT de todas as datas de vencimento que realmente existem nos lancamentos, mais
    // os vencimentos previstos dos dois cartões
    const faturasSet = new Set(vencimentosPrevistosDosCartoes());
    Estado.lancamentos.forEach(r => {
        const v = r.fatura;
        if (v) faturasSet.add(dataISO(v));
    });

    return [...faturasSet]
        .sort((a, b) => timestamp(a) - timestamp(b))
        .map(venc => ({ vencimento: venc, rotulo: rotuloFaturaComCartao(venc) }));
}

// Fatura padrão de uma compra: a do cartão no MÊS SEGUINTE ao da data, sempre — compra em
// 05/10 ou 30/10 vai pra 12/11 no Nubank. Não depende de existir fatura cadastrada.
function faturaDoMesSeguinte(data, cartao = CARTAO_NUBANK) {
    const [ano, mes] = dataISO(data).split('-').map(Number);
    const mesSeguinte = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 7);
    return `${mesSeguinte}-${String(DIA_VENCIMENTO_CARTAO[cartao]).padStart(2, '0')}`;
}

// Cada prestação nasce apontando pra fatura do mês seguinte à sua própria data (Nubank por
// padrão). É só o ponto de partida: os <select>s continuam editáveis antes de salvar.
function faturasSugeridasParaParcelas(data, parcelas, freq, cartao = CARTAO_NUBANK) {
    if (!data) return Array(parcelas).fill(null);
    return Array.from({ length: parcelas }, (_, p) => faturaDoMesSeguinte(dataDaOcorrencia(data, p, freq), cartao));
}

// Credito nao tem mais inferencia por fechamento: cada parcela recebe seu vencimento
// explicitamente. Assim uma compra 3x pode apontar para tres faturas diferentes.
// Antecipacao de fatura (debito) tambem exige uma fatura explicita para abatimento direto.
// Layout fixo: o campo Fatura nunca some (no Débito comum vira um seletor desativado "—")
// e mostra só a 1ª parcela; as demais ficam em #modalFaturasParcelas, aberto pelo "+N".
// Anima a passagem ativo <-> desativado (ver .trocaEstado em forms.css). Só com o cadastro
// aberto: ao abrir, o estado inicial aparece direto, sem animar. A classe sai no fim, senão
// a animação recomeçaria sozinha da próxima vez que o modal fosse exibido.
function animaTrocaDeEstado(select) {
    if (!modalNovo.open || !select) return;
    select.classList.remove('trocaEstado');
    void select.offsetWidth;   // força reflow pra a animação reiniciar
    select.classList.add('trocaEstado');
    select.addEventListener('animationend', () => select.classList.remove('trocaEstado'), { once: true });
}

// `cartaoPadrao`: cartão da sugestão quando nenhuma 1ª parcela foi escolhida à mão.
function atualizarFaturasDoFormulario(idsSelecionados = idsFaturasDoFormulario(), cartaoPadrao = CARTAO_NUBANK) {
    const principal = el('faturaPrincipal');
    // O seletor é recriado a cada chamada; compara com o estado anterior pra só animar troca real.
    const estavaDesativada = !!principal.querySelector('select:disabled');
    const demais = el('faturasPorParcela');
    const mais = el('fFaturasMais');
    const cred = el('fCred').checked;
    const categ = el('fCateg').value || '';
    const ehAntecip = ehAntecipacaoFatura(categ);
    const marcaMais = n => {
        mais.textContent = `+${n}`;
        mais.disabled = n < 1;
        mais.classList.toggle('vazio', n < 1);
    };
    if (!cred && !ehAntecip) {
        // Sem data-fatura-parcela: o seletor desativado nunca entra em idsFaturasDoFormulario.
        principal.innerHTML = '<select disabled title="Fatura só no Crédito" aria-label="Fatura (só no Crédito)"><option>—</option></select>';
        demais.innerHTML = '';
        marcaMais(0);
        if (!estavaDesativada) animaTrocaDeEstado(principal.querySelector('select'));
        return;
    }

    // Com Frequência, a pessoa escolhe só a 1ª fatura: as seguintes saem dela, avançadas mês
    // a mês (faturaDaOcorrencia, no momento de salvar). Sem Frequência, uma por parcela.
    const freq = el('fFreq').value;
    const parcelas = freq ? 1 : (+el('fParcelas').value || 1);
    const faturasMap = new Map();

    // DISTINCT das datas de vencimento existentes
    opcoesFaturasDisponiveis().forEach(f => {
        faturasMap.set(dataISO(f.vencimento), f.rotulo);
    });

    // Se houver fatura pré-selecionada / prefill que ainda não está na lista, inclui
    idsSelecionados.forEach(sel => {
        if (sel && !faturasMap.has(dataISO(sel))) {
            const iso = dataISO(sel);
            faturasMap.set(iso, rotuloFaturaComCartao(iso));
        }
    });

    const faturas = [...faturasMap.entries()]
        .sort((a, b) => timestamp(a[0]) - timestamp(b[0]))
        .map(([venc, rotulo]) => ({ vencimento: venc, rotulo }));
    // O mesmo preenchimento inicial vale no cadastro real e na simulação. A sugestão
    // nunca substitui uma fatura que a pessoa já escolheu manualmente, e fica no cartão da
    // 1ª parcela escolhida à mão (Nubank enquanto nada foi escolhido).
    const cartaoDaSugestao = idsSelecionados[0] ? cartaoDaFatura(idsSelecionados[0]) : cartaoPadrao;
    const sugestoes = cred
        ? faturasSugeridasParaParcelas(el('fData').value, parcelas, freq, cartaoDaSugestao)
        : [];
    // A sugestão sai da data, então pode cair fora da lista (ex.: depois de dez/2032).
    sugestoes.forEach(venc => {
        if (venc && !faturas.some(f => f.vencimento === venc)) faturas.push({ vencimento: venc, rotulo: rotuloFaturaComCartao(venc) });
    });
    faturas.sort((a, b) => timestamp(a.vencimento) - timestamp(b.vencimento));

    const opcoes = faturas.map(f =>
        `<option value="${dataISO(f.vencimento)}">${escapeHtml(f.rotulo || nomeFatura(f))}</option>`
    ).join('');
    const seletor = (parcela, rotulo) => {
        const selecionada = idsSelecionados[parcela] || sugestoes[parcela];
        return `<select data-fatura-parcela="${parcela}" data-fatura-sugerida="${!idsSelecionados[parcela] && sugestoes[parcela] ? '1' : '0'}" required` +
            (rotulo ? ` title="${rotulo}" aria-label="${rotulo}"` : '') + '>' +
            `<option value="" disabled${selecionada ? '' : ' selected'}>Selecione a fatura…</option>` +
            opcoes +
            '</select>';
    };
    const tituloPrincipal = freq ? '1ª fatura' : (parcelas > 1 ? 'Fatura da parcela 1' : 'Parcela única');
    principal.innerHTML = seletor(0, tituloPrincipal);
    if (estavaDesativada) animaTrocaDeEstado(principal.querySelector('select'));
    demais.innerHTML = Array.from({ length: parcelas - 1 }, (_, i) =>
        `<label class=fm><span>Parcela ${i + 2} <b class=req>*</b></span>${seletor(i + 1)}</label>`
    ).join('');
    marcaMais(parcelas - 1);

    seletoresDeFatura().forEach(select => {
        const parcela = Number(select.dataset.faturaParcela);
        const sel = idsSelecionados[parcela] || sugestoes[parcela];
        if (sel) {
            select.value = dataISO(sel);
        }
        select.addEventListener('change', () => {
            select.dataset.faturaSugerida = '0';
            // Trocar a 1ª parcela pode trocar o cartão: as demais, ainda só sugeridas, seguem
            // o mesmo cartão; as escolhidas à mão ficam como estão.
            if (parcela === 0) atualizarFaturasDoFormulario(idsFaturasDoFormulario(false));
        });
    });
}

el('fFaturasMais').onclick = () => el('modalFaturasParcelas').showModal();
el('fechaFaturasParcelas').onclick = () => el('modalFaturasParcelas').close();
el('modalFaturasParcelas').addEventListener('click', e => {
    if (e.target == el('modalFaturasParcelas')) el('modalFaturasParcelas').close();
});

el('fCred').addEventListener('change', () => {
    sugereModoValorParcelas();
    atualizarFaturasDoFormulario();
});

// quando a categoria muda pra "Antecipacao Fatura" (debito), o seletor de fatura
// deve aparecer igual ao credito — e desaparecer se sair dessa categoria.
el('fCateg').addEventListener('input', () => atualizarFaturasDoFormulario());

// Uma sugestao ainda automatica acompanha a data da venda; uma fatura escolhida
// manualmente nunca e' substituida por esse recálculo.
// No cadastro e no Duplicar, a fatura fica presa à data: trocar a data refaz TODAS as
// faturas (mês seguinte de cada parcela), inclusive uma escolhida à mão — só o cartão dessa
// escolha é mantido. Em Editar (a mesma linha) a fatura gravada não muda sozinha.
el('fData').addEventListener('change', () => {
    atualizaModoFrequencia();   // a contagem da série mostrada em Vezes sai da data
    if (!el('fCred').checked) return;
    if (modalNovo.dataset.editandoId) {
        atualizarFaturasDoFormulario(idsFaturasDoFormulario(false));
        return;
    }
    const atual = idsFaturasDoFormulario(true)[0];
    atualizarFaturasDoFormulario([], atual ? cartaoDaFatura(atual) : CARTAO_NUBANK);
});
// Frequência escolhida = série até DATA_LIMITE_RECORRENCIA: a quantidade sai da própria
// data, então Vezes fica desativado mostrando essa contagem (ex.: "75x até 2032") — nunca
// some, pra o formulário não mudar de forma. Sem Frequência, Vezes volta ao valor que
// tinha (compra parcelada comum). Vezes não mexe mais na Frequência — se subisse pra
// Mensal sozinha, viraria série até 2032.
// Editar é sempre a própria linha: Vezes e Dividir só servem pra criar lançamentos novos
// (ver submeteEdicaoLancamento, que ignora os dois), mas a Frequência continua editável.
function atualizaModoFrequencia() {
    el('parcelasLinha').hidden = !!modalNovo.dataset.editandoId;

    const vezes = el('fParcelas');
    const freq = el('fFreq').value;
    let serie = vezes.querySelector('option[value=serie]');
    if (freq) {
        if (!serie) {
            serie = new Option('', 'serie');
            vezes.add(serie);
        }
        if (vezes.value !== 'serie') vezes.dataset.anterior = vezes.value;
        const data = el('fData').value;
        serie.textContent = data
            ? `${ocorrenciasAteLimite(data, freq, DATA_LIMITE_RECORRENCIA)}x até ${DATA_LIMITE_RECORRENCIA.slice(0, 4)}`
            : 'Escolha a data';
        vezes.value = 'serie';
    } else if (serie) {
        // Só restaura o Vezes anterior se a contagem estava selecionada; depois de um
        // formNovo.reset() ela já não está, e o valor padrão do reset prevalece.
        if (vezes.value === 'serie') vezes.value = vezes.dataset.anterior || '1';
        serie.remove();
    }
    if (vezes.disabled !== !!freq) {
        vezes.disabled = !!freq;
        animaTrocaDeEstado(vezes);
    }
}

el('fFreq').addEventListener('change', () => {
    atualizaModoFrequencia();
    atualizarFaturasDoFormulario(idsFaturasDoFormulario(false));
});

el('fParcelas').addEventListener('change', () => atualizarFaturasDoFormulario());


function abreModalNovo(prefill, modoEdicao) {
    Estado._compraDaMeta = null;   // cadastro comum; abrirEtapaDaCompraDaMeta põe de volta
    el('formNovo').reset();
    popularCategoriasNoForm();
    popularNomesNoForm();
    el('fCateg').value = '';
    sinalPositivo = false;
    el('erroNovo').textContent = ''; el('erroNovo').classList.remove('ok');

    // titulo e aviso mudam conforme o modo simulacao global (Estado.simulando): o MESMO
    // formulario serve pra lancamento real (vai pro banco) e simulado (so' memoria) —
    // ver submeteNovoLancamento, que decide o destino no momento de salvar.
    el('avisoSimulando').hidden = !Estado.simulando;
    el('tituloNovo').textContent = Estado.simulando
        ? 'Simular compra'
        : (modoEdicao ? 'Editar lançamento' : (prefill ? 'Duplicar lançamento' : 'Novo lançamento'));
    el('salvaNovo').textContent = Estado.simulando ? 'Simular' : 'Salvar';
    // Pra sempre só aparece com a coluna no banco (migration 31), como na tabela.
    el('fPraSempreRotulo').hidden = !Estado.temPraSempre;

    // Editar e' sempre a PROPRIA linha, nunca gera parcela nova — Vezes/Dividir somem em
    // atualizaModoFrequencia (chamada no fim desta funcao), que le o editandoId abaixo.
    if (modoEdicao) { el('fParcelas').value = 1; modalNovo.dataset.editandoId = String(prefill.id); }
    else delete modalNovo.dataset.editandoId;

    if (prefill) {
        // copia tudo, inclusive data e valor: e' um ponto de partida, voce edita o que quiser
        el('fNome').value = prefill.nome || '';
        el('fCateg').value = prefill.categ || '';
        el('fData').value = dataISO(prefill.data) || '';
        el('fCred').checked = !!prefill.cred;
        // Editar mantém a fatura da própria linha; Duplicar recomeça pela fatura do mês
        // seguinte à data (Nubank), como um cadastro novo — não copia a do original.
        const fatRef = modoEdicao ? prefill.fatura : null;
        atualizarFaturasDoFormulario(fatRef ? [fatRef] : []);
        el('fPago').checked = prefill.pago !== false;   // so' desmarca se for explicitamente false
        el('fReserva').checked = !!prefill.reserva;
        el('fComprometido').checked = !!prefill.comprometido;
        el('fPraSempre').checked = !!prefill.pra_sempre;
        // so' herda a frequencia do original se ela for uma das regras conhecidas; senao
        // cai em "sem recorrencia" — lancamento antigo pode ter freq vazia ou um texto
        // livre qualquer, e atribuir isso a um <select> deixaria o campo em branco de
        // verdade (selectedIndex -1), sem opcao nenhuma marcada
        el('fFreq').value = RECORRENCIAS[prefill.freq] ? prefill.freq : '';
        const bruto = Math.abs(prefill.v || 0);
        if (bruto) {
            el('fValor').value = formataMascaraDinheiro(String(Math.round(bruto * 100)));
            sinalPositivo = (prefill.v || 0) > 0;
        }
    }
    else {
        el('fData').value = hojeISO();
        el('fFreq').value = '';   // avulso: série só se a pessoa escolher uma Frequência
        atualizarFaturasDoFormulario([]);
    }
    // Duplicar/Editar herdam a Frequência do original — o campo Vezes precisa refletir isso,
    // e as faturas também (com Frequência, só a 1ª).
    atualizaModoFrequencia();
    atualizarFaturasDoFormulario(idsFaturasDoFormulario(false));
    atualizaSinalUI();
    sugereModoValorParcelas();

    modalNovo.showModal();
    // No celular, evitar foco automático impede que o teclado cubra o cadastro ao abrir.
    // No desktop, duplicando vai para Valor; do zero, vai para Nome.
    if (window.matchMedia('(min-width: 641px)').matches) {
        setTimeout(() => el(prefill ? 'fValor' : 'fNome').focus(), 50);
    }
}
// "Hoje" é uma troca de data como outra qualquer: dispara o mesmo `change` do campo, pra a
// fatura (presa à data) e a contagem da série acompanharem.
el('fDataHoje').onclick = () => {
    el('fData').value = hojeISO();
    el('fData').dispatchEvent(new Event('change'));
};

// ===================================================================
// CALCULADORA (modal auxiliar do campo Valor)
// ===================================================================
// Avalia so o subconjunto de expressao aceito pelo visor (numeros, + - X / %,
// parenteses e virgula decimal) — nunca usa eval. O visor e' um <input> de verdade:
// aceita digitacao direta do teclado e clique/toque pra posicionar o cursor no meio
// da expressao (o proprio input cuida do caret — os botoes so inserem/apagam ali).
const modalCalc = el('modalCalc');
const calcInput = el('calcVisor');
const calcExprAtual = () => calcInput.value;

// insere um texto na posicao atual do cursor (substituindo a selecao, se houver) e
// deixa o cursor logo depois do que foi inserido — igual digitar de verdade
function calcInsere(texto) {
    const ini = calcInput.selectionStart ?? calcInput.value.length;
    const fim = calcInput.selectionEnd ?? calcInput.value.length;
    calcInput.setRangeText(texto, ini, fim, 'end');
    calcFormataMilharAoRedorDoCursor();
    calcRenderiza();
}
function calcApaga() {
    const ini = calcInput.selectionStart ?? calcInput.value.length;
    const fim = calcInput.selectionEnd ?? calcInput.value.length;
    if (ini == fim) { if (ini == 0) return; calcInput.setRangeText('', ini - 1, ini, 'end'); }
    else calcInput.setRangeText('', ini, fim, 'end');
    calcFormataMilharAoRedorDoCursor();
    calcRenderiza();
}

// re-formata SO' o numero onde o cursor esta (nunca a expressao inteira) com ponto de
// milhar automatico na parte inteira — ex: digitar 1234567 vira "1.234.567" sozinho — e
// so' poe virgula decimal quando o proprio usuario digita ela (nunca insere sozinha).
// O numero e' o trecho contiguo de digitos/pontos/virgula ao redor do cursor, delimitado
// por operador, parenteses ou borda da string (os outros numeros da expressao ficam
// intocados). O cursor e' reposicionado contando quantos DIGITOS reais (sem os pontos de
// milhar, que sao so' formatacao) havia antes dele, pra nao pular de lugar ao digitar.
function calcFormataMilharAoRedorDoCursor() {
    const valor = calcInput.value;
    const pos = calcInput.selectionStart ?? valor.length;
    const delimitador = /[+\-×÷()]/;

    let ini = pos; while (ini > 0 && !delimitador.test(valor[ini - 1])) ini--;
    let fim = pos; while (fim < valor.length && !delimitador.test(valor[fim])) fim++;

    const numero = valor.slice(ini, fim);
    if (!/\d/.test(numero)) return;   // nada de numero aqui (ex: cursor logo apos um operador)

    // quantos digitos reais (sem pontos de milhar) ficam antes do cursor, dentro do numero
    const digitosAntes = numero.slice(0, pos - ini).replace(/\./g, '').length;

    const [parteInteira, ...resto] = numero.split(',');
    const inteiraFormatada = parteInteira.replace(/\./g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const numeroFormatado = inteiraFormatada + (resto.length ? ',' + resto.join(',') : '');

    calcInput.value = valor.slice(0, ini) + numeroFormatado + valor.slice(fim);

    // recoloca o cursor apos os mesmos N digitos reais de antes, contando os pontos
    // de milhar que agora existem no caminho (eles nao contam como "digito andado")
    let novoPos = ini, digitosVistos = 0;
    while (digitosVistos < digitosAntes && novoPos < ini + numeroFormatado.length) {
        if (/\d/.test(calcInput.value[novoPos])) digitosVistos++;
        novoPos++;
    }
    calcInput.setSelectionRange(novoPos, novoPos);
}

// mostra, numa linha abaixo, o resultado parcial em tempo real (so quando a expressao
// ja tem pelo menos um operador — um numero solto nao precisa repetir embaixo)
function calcRenderiza() {
    const expr = calcExprAtual();
    const temOperador = /[+\-×÷%]/.test(expr.slice(1));   // ignora um '-' inicial (numero negativo)
    const resultado = expr && temOperador ? calcAvalia(expr) : null;
    el('calcResultado').innerHTML = resultado != null ? '= ' + brl(resultado).replace('R$', '').trim() : '&nbsp;';
}

// conta parenteses abertos ainda sem fechar (so na parte ANTES do cursor), pra "( )"
// saber qual dos dois inserir na posicao onde voce esta
function calcParensAbertosAte(pos) {
    let n = 0;
    for (const c of calcExprAtual().slice(0, pos)) { if (c == '(') n++; else if (c == ')') n--; }
    return n;
}

function calcTokeniza(expr) {
    return expr.match(/\d+\.?\d*|[+\-*/%()]/g) || [];
}

// shunting-yard simples: numeros, + - * /, parenteses e %. Regra do %: se vier
// seguido de outro numero/parenteses, e' "a% de b" (ex: 15%100 = 15); se fechar a
// expressao ou vier antes de um operador/fecha-parenteses, e' percentual do numero
// anterior sozinho (ex: 50%+10 = 0,5+10). Precisao de ponto flutuante corrigida no final.
function calcAvalia(expr) {
    // visor usa os simbolos matematicos de verdade (× ÷), ponto de milhar automatico
    // e virgula decimal — a avaliacao interna usa os operadores JS (* /) e ponto decimal.
    // ORDEM IMPORTA: primeiro tira os pontos de MILHAR (senao "1.234,56" viraria
    // "1.234.56" depois de trocar a virgula por ponto), so' depois troca ',' por '.'.
    const normalizada = expr.replace(/(\d)\.(?=\d{3}(\D|$))/g, '$1').replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/');
    // O teclado da calculadora só insere estes símbolos, mas validar aqui também protege
    // colagem e chamadas indiretas: texto desconhecido nunca pode ser parcialmente aceito.
    if (/[^\d.\s+\-*/%()]/.test(normalizada)) return null;
    const tokens = calcTokeniza(normalizada);
    if (!tokens.length) return null;

    try {

    const precedencia = { '+': 1, '-': 1, '*': 2, '/': 2 };
    const saida = [], operadores = [];
    const aplicaTopo = () => {
        const op = operadores.pop();
        const b = saida.pop(), a = saida.pop();
        if (a == null || b == null) throw Error('expressao invalida');
        saida.push(op == '+' ? a + b : op == '-' ? a - b : op == '*' ? a * b : (b == 0 ? NaN : a / b));
    };

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (/^\d/.test(t)) {
            saida.push(+t);
        } else if (t == '%') {
            const proximo = tokens[i + 1];
            if (proximo != null && proximo != ')' && !(proximo in precedencia)) {
                // "a% de b": consome o proximo numero/parenteses aqui mesmo, com prioridade maxima
                saida.push(saida.pop() / 100);
                operadores.push('*');
            } else {
                saida.push(saida.pop() / 100);   // percentual isolado do numero anterior
            }
        } else if (t == '(') {
            operadores.push(t);
        } else if (t == ')') {
            while (operadores.length && operadores.at(-1) != '(') aplicaTopo();
            operadores.pop();
        } else {
            while (operadores.length && operadores.at(-1) != '(' && precedencia[operadores.at(-1)] >= precedencia[t]) aplicaTopo();
            operadores.push(t);
        }
    }
        while (operadores.length) aplicaTopo();
        if (saida.length != 1 || !isFinite(saida[0])) return null;
        return Math.round(saida[0] * 100) / 100;
    } catch {
        // Durante a digitação é normal haver "2+" ou parênteses incompletos. A tela
        // precisa continuar responsiva e apenas não exibir resultado até completar.
        return null;
    }
}

function calcConfirma() {
    const resultado = calcAvalia(calcExprAtual());
    if (resultado == null) { el('calcResultado').textContent = 'Expressão inválida'; return; }
    const bruto = Math.abs(resultado);
    el('fValor').value = formataMascaraDinheiro(String(Math.round(bruto * 100)));
    sinalPositivo = resultado > 0;
    atualizaSinalUI();
    modalCalc.close();
}

function calcToque(tecla) {
    const pos = calcInput.selectionStart ?? calcInput.value.length;
    const anterior = calcExprAtual().slice(0, pos).slice(-1);
    const ehOperador = c => '+-×÷'.includes(c);

    if (tecla == 'ac') { calcInput.value = ''; calcRenderiza(); calcInput.focus(); return; }
    if (tecla == 'back') { calcApaga(); calcInput.focus(); return; }
    if (tecla == 'paren') {
        const podeFechar = calcParensAbertosAte(pos) > 0 && anterior && /[\d)%]/.test(anterior);
        calcInsere(podeFechar ? ')' : '(');
        calcInput.focus(); return;
    }
    if (tecla == 'pct') {
        if (anterior && /[\d)]/.test(anterior)) calcInsere('%');
        calcInput.focus(); return;
    }
    if (tecla == 'igual') { calcConfirma(); return; }

    const mapa = { div: '÷', mul: '×', sub: '-', add: '+', ponto: ',' };
    const chr = mapa[tecla] ?? tecla;   // digitos vem com o proprio valor em data-calc

    if (chr == ',') {
        const segmento = calcExprAtual().slice(0, pos).split(/[+\-×÷()]/).pop();
        if (segmento.includes(',')) { calcInput.focus(); return; }
        calcInsere((segmento ? '' : '0') + ',');
    } else if (ehOperador(chr)) {
        if (!calcExprAtual().slice(0, pos) && chr != '-') { calcInput.focus(); return; }
        if (ehOperador(anterior)) { calcApaga(); calcInsere(chr); }   // troca o operador repetido
        else calcInsere(chr);
    } else {
        calcInsere(chr);
    }
    calcInput.focus();
}

if (modalCalc && el('abreCalc')) {
el('abreCalc').onclick = () => {
    calcInput.value = '';
    calcRenderiza();
    modalCalc.showModal();
    setTimeout(() => calcInput.focus(), 50);
};
el('fechaCalc').onclick = () => modalCalc.close();
modalCalc.addEventListener('click', e => { if (e.target == modalCalc) modalCalc.close(); });
// mousedown num botao tira o foco do input ANTES do click disparar, colapsando a
// selecao/cursor — por isso cada clique inseria sempre na posicao errada (ex: "1+1"
// virava "11+"). preventDefault aqui mantem o foco (e o cursor) no input o tempo todo.
document.querySelectorAll('#modalCalc [data-calc]').forEach(bt => {
    bt.addEventListener('mousedown', e => e.preventDefault());
    bt.addEventListener('click', () => calcToque(bt.dataset.calc));
});

// digitacao direta do teclado fisico: cada tecla reconhecida passa pelo MESMO
// calcToque() que os botoes usam (mesma logica de trocar operador repetido, virgula
// unica por numero, etc). Teclas de navegacao/edicao do proprio input (setas, Home,
// Backspace nativo, Ctrl+C/V) continuam funcionando normalmente.
const CALC_TECLA_DO_KEY = {
    '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
    '+': 'add', '-': 'sub', '*': 'mul', 'x': 'mul', 'X': 'mul', '/': 'div', '%': 'pct',
    '.': 'ponto', ',': 'ponto', '(': 'paren', ')': 'paren',
};
calcInput.addEventListener('keydown', e => {
    if (e.key == 'Enter') { e.preventDefault(); calcConfirma(); return; }
    if (e.key == 'Escape') { e.preventDefault(); modalCalc.close(); return; }
    if (e.key == 'Backspace') { e.preventDefault(); calcToque('back'); return; }
    if (['Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'].includes(e.key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // deixa passar Ctrl+C/V/A etc
    const tecla = CALC_TECLA_DO_KEY[e.key];
    e.preventDefault();   // bloqueia qualquer caractere que nao seja um dos reconhecidos acima
    if (tecla) calcToque(tecla);
});
calcInput.addEventListener('click', calcRenderiza);
calcInput.addEventListener('keyup', calcRenderiza);
}

el('abreNovo').onclick = () => abreModalNovo();
el('fechaNovo').onclick = () => modalNovo.close();
el('salvaNovo').onclick = () => submeteNovoLancamento();
modalNovo.addEventListener('click', e => { if (e.target == modalNovo) modalNovo.close(); });

// Editar: mesmo modal de sempre, pré-preenchido com a linha selecionada (igual Duplicar),
// mas em modo "transformar" — troca Crédito/Débito e escolhe a fatura/data sem precisar
// excluir e recadastrar. Só pra lançamento com id de verdade (real ou simulado); ver guarda
// em atualizaBarraSelecao.
el('seledit').onclick = () => {
    const chave = [...Estado.selecionados.keys()][0];
    const r = Estado.lancamentos.find(x => String(x.id) == chave);
    if (r) abreModalNovo(r, true);
};

// ao fechar o modal (por qualquer via: X, clique fora, Esc, ou apos salvar), se ele foi
// aberto pelo "Duplicar", desmarca a linha que originou o duplicado — senao ela ficava
// selecionada na tabela depois de fechar, o que nao faz mais sentido.
modalNovo.addEventListener('close', () => {
    if (modalNovo.dataset.viaDuplicar || modalNovo.dataset.editandoId) { Estado.selecionados.clear(); desenhar(); }
    delete modalNovo.dataset.viaDuplicar;
    delete modalNovo.dataset.editandoId;
});

// Núcleo de "materializar/consolidar" um Aporte sugerido ou Resgate necessário de um ciclo
// `idx`: sem movimento real EM ABERTO no ciclo, INSERT (ou push local em simulação); com
// um aberto, UPDATE consolidando os valores — Aporte/Resgate já pago nunca é reescrito
// (ver movimentoAporteOuResgateDoCiclo). Compartilhado entre o clique de uma linha só
// (seldup) e "Consolidar tudo" (consolidarTudo), que repete isso ciclo a ciclo. O retorno
// ('consolidado'/'materializado') é só pro resumo de "Consolidar tudo" contar cada tipo.
async function materializaOuConsolidaAjuste(idx, ehAporte, categ, valorAjuste) {
    const data = dataDeFechamentoDoCiclo(Estado.ciclos[idx]) || null;
    const existente = movimentoAporteOuResgateDoCiclo(idx);
    if (existente) {
        const consolidado = consolidarAjusteExistente(existente, valorAjuste);
        if (Estado.simulando) {
            Object.assign(existente, {
                nome: consolidado.nome,
                valor: consolidado.valor,
                v: consolidado.valor,
            });
        } else {
            const linhaAtualizada = await atualizarLancamento(existente.id, {
                nome: consolidado.nome,
                valor: consolidado.valor,
            });
            Object.assign(existente, linhaAtualizada, {
                v: +linhaAtualizada.valor || 0,
                inv: ehCategoriaInvestimento(linhaAtualizada.categ),
            });
        }
    } else {
        if (Estado.simulando) {
            simulaLancamentoParcelado({
                nome: ehAporte ? 'Aporte' : 'Resgate', categ, freq: null, data,
                cred: false, pago: false,
                parcelas: 1, valores: [valorAjuste],
            });
        } else {
            const linhaCriada = await inserirLancamento({
                data,
                freq: null,
                cred: false,
                pago: false,
                nome: ehAporte ? 'Aporte' : 'Resgate',
                categ,
                valor: valorAjuste,
            });
            Estado.lancamentos.push({
                ...linhaCriada,
                v: +linhaCriada.valor || 0,
                inv: ehCategoriaInvestimento(linhaCriada.categ),
                periodoIdx: periodoDoLancamento(linhaCriada),
            });
        }
    }
    return existente ? 'consolidado' : 'materializado';
}

// A mesma posicao da barra tem duas acoes mutuamente exclusivas:
// - lancamento real: Duplicar abre o modal pre-preenchido;
// - Aporte sugerido/Resgate necessario: cria o ajuste real quando ainda nao existe um
//   Aporte/Resgate no ciclo; caso exista, consolida nele por UPDATE.
el('seldup').onclick = async () => {
    const chave = [...Estado.selecionados.keys()][0];
    if (chave && /^(sug|res):/.test(chave)) {
        const ajuste = linhaDaChaveSelecao(chave);
        if (!ajuste || (ajuste._sug == null && !ajuste._res) || el('seldup').disabled) return;
        // Consolidar tudo em andamento (clique ou automático) já pode estar gravando este ciclo.
        if (Estado.gravandoAjuste) { mostrarToast('Aguarde', 'Há uma consolidação em andamento.'); return; }

        Estado.gravandoAjuste = true;
        el('seldup').disabled = true;
        el('seldup').textContent = 'Salvando…';
        try {
            const ehAporte = chave.startsWith('sug:');
            const valorAjuste = ajuste._sug != null ? ajuste._sug : ajuste.v;
            await materializaOuConsolidaAjuste(indiceDoAjuste(chave), ehAporte, ajuste.categ, valorAjuste);
            Estado.selecionados.clear();
            desenhar();
        } catch (err) {
            mostrarToast('Falhou ao materializar o ajuste', err.message);
        } finally {
            Estado.gravandoAjuste = false;
            el('seldup').disabled = false;
            const existente = /^(sug|res):/.test(chave) && movimentoAporteOuResgateDoCiclo(indiceDoAjuste(chave));
            el('seldup').textContent = /^(sug|res):/.test(chave)
                ? (Estado.simulando ? 'Simular' : (existente ? 'Consolidar' : 'Materializar'))
                : 'Duplicar';
        }
        return;
    }

    const r = Estado.lancamentos.find(x => String(x.id) == chave);
    if (r) { modalNovo.dataset.viaDuplicar = '1'; abreModalNovo(r); }
};

// Mesma correção do botão "↷" (ver celData em tables.js e marcaOcorrenciasDuplicadasNoCiclo
// em cycle-views.js), varrendo um intervalo de ciclos inteiro de uma vez em vez de pedir pra
// abrir ciclo por ciclo. Sem caixa de confirmação por linha — o próprio clique em "Consolidar
// tudo" já é a confirmação da varredura em lote, igual como ela já trata aporte/resgate. Roda ANTES do
// loop de aporte/resgate abaixo: mover uma data entre ciclos muda o total de cada um, então
// precisa refletir nos ajustes que o loop seguinte vai materializar/consolidar.
async function corrigeRecorrenciasDuplicadasNoIntervalo(idxInicio, idxFim) {
    let corrigidos = 0;
    const log = [];   // uma linha por correção, pro modal de resultado (ver consolidarTudo)
    for (let idx = idxInicio; idx <= idxFim; idx++) {
        const proximoCiclo = Estado.ciclos[idx + 1];
        if (!proximoCiclo) continue;   // sem próximo ciclo cadastrado, não há pra onde mover
        const debitos = Estado.lancamentos.filter(r => r.periodoIdx == idx && !r.cred);
        marcaOcorrenciasDuplicadasNoCiclo(debitos, proximoCiclo);
        for (const r of debitos.filter(r => r._dupCiclo)) {
            const dataAntiga = r.data;
            const novaData = r._dupCiclo;
            if (!Estado.simulando && !r._sim) await atualizarLancamento(r.id, { data: novaData });
            r.data = novaData;
            reclassificaPeriodo(r);
            delete r._dupCiclo;
            corrigidos++;
            log.push(`${nomePeriodo(Estado.ciclos[idx])}: "${r.nome ?? ''}" movida de ${dataBR(dataAntiga)} para ${dataBR(novaData)} (recorrência duplicada no ciclo).`);
            limparCachesFinanceiros();
        }
    }
    return { corrigidos, log };
}

// "Consolidar tudo": repete materializaOuConsolidaAjuste ciclo a ciclo, de hoje até o
// último ciclo que tem algum lançamento, pra não exigir abrir um por um manualmente — e, de
// quebra, corrige toda recorrência duplicada no mesmo intervalo (ver função acima). Cada
// escrita muda Estado.lancamentos (logo o guardado disponível do ciclo seguinte), por isso
// limpa os caches financeiros entre uma iteração e a próxima, não só no fim. Roda pelo
// botão Recarregar (bootstrap.js): `depoisDaCarga` volta ao ciclo atual e limpa os filtros
// entre a recarga e a varredura.
// `silencioso` (consolidação automática de 15 em 15 min, bootstrap.js): carga sem aviso, sem
// toast quando não há nada a fazer, sem o modal de detalhe e falha só no console — mas, se
// gravou algo, o toast avisa, porque o banco mudou sem um clique.
// ---- pra sempre: as ocorrências que faltam até DATA_LIMITE_RECORRENCIA ----
// A mesma regra da migration 33, pro Consolidar tudo: grupo = mesmo nome + categoria (sem
// diferenciar caixa nem espaço nas pontas) com pra_sempre; modelo = a ocorrência mais recente
// (maior data e, no empate, maior id), que é a intenção mais nova (valor, dia, cartão, marcas);
// Frequência = a da ocorrência mais recente do grupo que tem uma (sem Frequência conhecida, o
// grupo fica como está). As novas saem do modelo como no cadastro (dataDaOcorrencia: meses
// sempre contados da data do modelo; Semanal/Quinzenal em 7/14 dias), só depois da última data
// e até o limite — então repetir não cria nada. Copiam nome, categoria, valor, Crédito,
// Frequência, lote, canal, prio, Reserva, Comprometido e pra_sempre; nascem em aberto e sem
// obs; no Crédito, a fatura anda com a data (faturaDaOcorrencia). Só linhas reais (id > 0).
function ocorrenciasPraSempreQueFaltam(linhas, limite = DATA_LIMITE_RECORRENCIA) {
    const grupos = new Map();
    linhas.filter(r => r.pra_sempre && r.data && r.id > 0 && !r._sim).forEach(r => {
        const chave = `${String(r.nome ?? '').trim().toLowerCase()}|${String(r.categ ?? '').trim().toLowerCase()}`;
        if (!grupos.has(chave)) grupos.set(chave, []);
        grupos.get(chave).push(r);
    });
    return [...grupos.values()].map(grupo => {
        const ordem = [...grupo].sort((a, b) => dataISO(b.data).localeCompare(dataISO(a.data)) || b.id - a.id);
        const modelo = ordem[0];
        const freq = ordem.find(r => r.freq)?.freq;
        if (!RECORRENCIAS[freq]) return null;
        const inicio = dataISO(modelo.data);
        const reserva = !!modelo.reserva, comprometido = !!modelo.comprometido;
        const novas = [];
        for (let p = 1; dataDaOcorrencia(inicio, p, freq) <= limite; p++) {
            const data = dataDaOcorrencia(inicio, p, freq);
            novas.push({
                data, valor: modelo.valor ?? modelo.v, nome: modelo.nome, categ: modelo.categ, freq, cred: !!modelo.cred, pago: false,
                fatura: modelo.cred && modelo.fatura ? faturaDaOcorrencia(dataISO(modelo.fatura), inicio, data) : null,
                recorrencia_id: modelo.recorrencia_id ?? null, obs: null, canal: modelo.canal ?? null, prio: modelo.prio ?? null,
                reserva, comprometido, pra_sempre: true,
            });
        }
        return novas.length ? { modelo, freq, novas } : null;
    }).filter(Boolean);
}

// Pra sempre até o limite (só no clique do Consolidar tudo, nunca na automática de 15 min, que
// fica só com Aporte/Resgate; nunca na simulação): cria de uma vez as ocorrências que faltam
// em cada grupo (ocorrenciasPraSempreQueFaltam). Modelo sem lote ganha o próximo número da
// sequência — ele e as novas entram juntos no lote, como na migration 33.
async function estenderPraSempre() {
    if (Estado.simulando || !Estado.temPraSempre) return { criadas: 0, log: [] };
    const grupos = ocorrenciasPraSempreQueFaltam(Estado.lancamentos);
    if (!grupos.length) return { criadas: 0, log: [] };
    for (const g of grupos.filter(x => x.modelo.recorrencia_id == null)) {
        const lote = await proximaRecorrencia();
        await atualizarLancamentos([g.modelo.id], { recorrencia_id: lote });
        g.modelo.recorrencia_id = lote;
        g.novas.forEach(n => { n.recorrencia_id = lote; });
    }
    const criadas = await inserirLancamentos(grupos.flatMap(g => g.novas));
    // Mesmas regras da carga: o que aparece agora é o que volta ao recarregar.
    criadas.forEach(linha => Estado.lancamentos.push({
        ...linha, v: +linha.valor || 0, inv: ehCategoriaInvestimento(linha.categ), periodoIdx: periodoDoLancamento(linha),
    }));
    limparCachesFinanceiros();
    const mes = iso => nomePeriodoAbrev({ ini: iso });
    const log = grupos.map(g => `Pra sempre: ${g.modelo.nome} — ${g.novas.length} ocorrência(s), de ${mes(g.novas[0].data)} a ${mes(g.novas[g.novas.length - 1].data)}.`);
    return { criadas: criadas.length, log };
}

async function consolidarTudo(botao, depoisDaCarga = () => {}, { silencioso = false } = {}) {
    if (botao.disabled) return;
    // Um Materializar/Consolidar de um clique ainda gravando: a varredura leria o ciclo antes
    // dessa linha existir e inseriria outra. O clique avisa; a automática tenta no próximo ciclo.
    if (Estado.gravandoAjuste) {
        if (!silencioso) mostrarToast('Aguarde', 'Há um Aporte/Resgate sendo gravado.');
        return;
    }
    Estado.gravandoAjuste = true;
    Estado.ultimaConsolidacao = Date.now();   // tentativa conta: falhou, espera o próximo intervalo
    // disabled bloqueia clique duplo nativamente (botão desabilitado não dispara 'click'),
    // mas sozinho pode passar despercebido — o ícone gira e o title diz a etapa, pra deixar
    // claro que já está processando (o botão é só ícone; trocar o texto apagaria o desenho).
    const tituloOriginal = botao.title;
    const rotuloOriginal = botao.getAttribute('aria-label');
    const etapa = texto => { botao.title = texto; botao.setAttribute('aria-label', texto); };
    botao.disabled = true;
    botao.classList.add('carregando');
    try {
        // Sempre recarrega do banco antes: a varredura grava em cima do que lê, então nunca
        // pode partir de uma tela velha (outro aparelho, DataGrip ou aba aberta há horas).
        // Carga que falhou para tudo — não consolida em cima de dado desatualizado. Na
        // simulação não recarrega: isso apagaria os lançamentos simulados, que só existem aqui.
        if (!Estado.simulando) {
            etapa('Recarregando…');
            if (!(await load({ silencioso }))) return;
        }
        depoisDaCarga();
        // Hoje fora de qualquer ciclo: não há de onde partir a varredura.
        if (Estado.idxHoje < 0) return;
        // Pra sempre primeiro: as ocorrências novas entram nas datas e no Aporte/Resgate abaixo.
        etapa('Estendendo pra sempre…');
        const { criadas: praSempre, log: logPraSempre } = silencioso ? { criadas: 0, log: [] } : await estenderPraSempre();
        etapa('Consolidando…');
        const ultimoCicloAntesDaCorrecao = Estado.lancamentos.reduce(
            (max, r) => r.periodoIdx != null && r.periodoIdx > max ? r.periodoIdx : max,
            Estado.idxHoje
        );
        // Mover data é a parte mais invasiva da varredura: só roda no clique (Recarregar), nunca
        // na consolidação automática de 15 min, que fica só com Aporte/Resgate.
        const { corrigidos, log: logDatas } = silencioso ? { corrigidos: 0, log: [] }
            : await corrigeRecorrenciasDuplicadasNoIntervalo(Estado.idxHoje, ultimoCicloAntesDaCorrecao);
        // Uma correção pode ter empurrado alguma linha pro ciclo logo depois do limite
        // conhecido antes da varredura — recalcula pra não deixar esse ciclo de fora do
        // loop de aporte/resgate a seguir.
        const ultimoCicloComDados = Estado.lancamentos.reduce(
            (max, r) => r.periodoIdx != null && r.periodoIdx > max ? r.periodoIdx : max,
            ultimoCicloAntesDaCorrecao
        );
        let materializados = 0, consolidados = 0;
        const logAjustes = [];
        for (let idx = Estado.idxHoje; idx <= ultimoCicloComDados; idx++) {
            const ajuste = ajusteDoCiclo(idx);
            if (!ajuste) continue;
            const ehAporte = ajuste.tipo == 'aporte';
            const resultado = await materializaOuConsolidaAjuste(idx, ehAporte, ajuste.categ, ajuste.v);
            if (resultado == 'consolidado') consolidados++; else materializados++;
            const limite = ajuste.resgatouTudo ? (ajuste.v < 0 ? ' (resgate diminuído: o guardado não pode ficar negativo)' : ' (todo o guardado)') : '';
            logAjustes.push(`${nomePeriodo(Estado.ciclos[idx])}: ${resultado == 'consolidado' ? 'Consolidado' : 'Materializado'} ${ehAporte ? 'Aporte' : 'Resgate'} de ${brl(Math.abs(ajuste.v))}${limite}.`);
            limparCachesFinanceiros();
        }
        Estado.selecionados.clear();
        // Automática: nunca redesenha por cima de uma célula em edição (ver desenharQuandoLivre).
        if (silencioso) desenharQuandoLivre(); else desenhar();
        // Nada aparece na tela pros ciclos fora do atual (não estão renderizados), então o
        // toast é um resumo rápido e o modal (mostrarResultadoConsolidarTudo) traz o detalhe
        // ciclo a ciclo de tudo que a varredura de fato gravou.
        const partes = [];
        if (materializados || consolidados) partes.push(`${materializados} materializado(s), ${consolidados} consolidado(s)`);
        if (corrigidos) partes.push(`${corrigidos} data(s) de recorrência duplicada corrigida(s)`);
        if (praSempre) partes.push(`${praSempre} ocorrência(s) pra sempre criada(s) até ${DATA_LIMITE_RECORRENCIA.slice(0, 4)}`);
        const resumo = partes.length
            ? `${partes.join('; ')}.`
            : 'Nenhum ciclo com Aporte sugerido, Resgate necessário, recorrência duplicada ou pra sempre pendente.';
        if (silencioso) {
            if (partes.length) mostrarToast('Consolidado automaticamente', resumo);
        } else {
            mostrarToast('Consolidar tudo', resumo);
            // Sem nada gravado, o toast já diz tudo: o modal só abre quando há o que detalhar.
            if (partes.length) mostrarResultadoConsolidarTudo(resumo, [...logPraSempre, ...logDatas, ...logAjustes]);
        }
    } catch (err) {
        if (silencioso) console.warn('[consolidação automática] falhou:', err.message);
        else mostrarToast('Falhou ao consolidar tudo', err.message);
        desenhar();
    } finally {
        Estado.gravandoAjuste = false;
        botao.disabled = false;
        botao.classList.remove('carregando');
        botao.title = tituloOriginal;
        botao.setAttribute('aria-label', rotuloOriginal);
    }
}

// A confirmação explica se a remoção é real ou somente parte da simulação atual.
// Simulação altera somente Estado.lancamentos: nunca chama DELETE para uma linha real.
const exclusaoEhSimulada = r => Estado.simulando || r._sim;

// Aceita quantas linhas reais estiverem selecionadas (uma ou várias); linhas sintéticas
// misturadas na mesma seleção são ignoradas aqui, pois não existem no banco. A confirmação
// lista cada lançamento por nome e valor para o usuário auditar antes de uma ação
// irreversível, inclusive quando a seleção mistura linha real (DELETE) com linha só desta
// simulação (oculta em memória).
el('seldel').onclick = async () => {
    const linhas = [...Estado.selecionados.keys()]
        .map(chave => Estado.lancamentos.find(x => String(x.id) == chave))
        .filter(Boolean);
    if (!linhas.length) return;

    const todasSimuladas = linhas.every(exclusaoEhSimulada);
    const nenhumaSimulada = linhas.every(r => !exclusaoEhSimulada(r));
    const total = linhas.reduce((s, r) => s + (r.v || 0), 0);

    let pergunta;
    if (linhas.length == 1) {
        const r = linhas[0];
        pergunta = exclusaoEhSimulada(r)
            ? `Ocultar "${r.nome ?? ''}" só nesta simulação?\n\nVolta ao recarregar ou sair da simulação.`
            : `Excluir "${r.nome ?? ''}" (${brl(r.v || 0)})?\n\nNão dá pra desfazer.`;
    } else {
        const lista = linhas.map(r => `- ${r.nome ?? ''} (${brl(r.v || 0)})`).join('\n');
        const acao = todasSimuladas ? 'Ocultar' : 'Excluir';
        const aviso = todasSimuladas
            ? 'Volta ao recarregar ou sair da simulação.'
            : nenhumaSimulada
                ? 'Não dá pra desfazer.'
                : 'Os marcados só desta simulação voltam ao recarregar; os demais não dá pra desfazer.';
        pergunta = `${acao} estes ${linhas.length} lançamentos (${brl(total)} no total)?\n\n${lista}\n\n${aviso}`;
    }
    if (!confirm(pergunta)) return;

    if (el('seldel').disabled) return;   // trava clique duplo enquanto o DELETE esta no ar
    el('seldel').disabled = true;
    el('seldel').textContent = todasSimuladas ? 'Ocultando…' : 'Excluindo…';
    try {
        for (const r of linhas) {
            if (!exclusaoEhSimulada(r)) await excluirLancamento(r.id);
            const i = Estado.lancamentos.findIndex(x => String(x.id) == String(r.id));
            if (i >= 0) Estado.lancamentos.splice(i, 1);
            Estado.selecionados.delete(String(r.id));
        }
        desenhar();
    } catch (err) {
        mostrarToast('Falhou ao excluir', err.message);
        desenhar();   // redesenha pra refletir o que ja foi removido antes da falha
    } finally {
        el('seldel').disabled = false;
        el('seldel').textContent = Estado.simulando ? 'Ocultar' : 'Excluir';
    }
};

// divide um valor total em N parcelas iguais, jogando o resto de arredondamento na
// ultima (ex: R$100 em 3x = 33,33 + 33,33 + 33,34) — a soma das parcelas nunca diverge
// do total digitado por causa de arredondamento.
function valorDasParcelas(valorTotal, parcelas) {
    const valorParcela = Math.round((valorTotal / parcelas) * 100) / 100;
    const somaAteAntepenultima = valorParcela * (parcelas - 1);
    const valorUltima = Math.round((valorTotal - somaAteAntepenultima) * 100) / 100;
    return Array.from({ length: parcelas }, (_, p) => p == parcelas - 1 ? valorUltima : valorParcela);
}

// ---- salvar: nao fecha o modal, so limpa valor/data e mostra confirmacao ----
// MESMO formulario serve pros dois destinos — a chave e' Estado.simulando (o toggle
// global no topo): ligado, as parcelas viram lancamentos _sim=true SO' na memoria
// (nunca chamam inserirLancamento, nunca tocam o Supabase — ver o bloco MODO SIMULACAO
// mais abaixo); desligado, cada parcela e' um POST real, sequencial, uma fatura depois
// da outra. "Dividir valor" (independente de Credito/Debito) escolhe se o campo "Vezes"
// DIVIDE o valor digitado entre as N linhas (valorDasParcelas, ex: R$300 em 3x = R$100
// cada) ou REPETE o mesmo valor em cada uma (ex: R$50 3x = R$50 + R$50 + R$50) — pensado
// pra lancar de uma vez uma conta recorrente de valor fixo (ex: assinatura, mensalidade)
// que ainda nao foi cadastrada.
async function submeteNovoLancamento() {
    if (modalNovo.dataset.editandoId) {
        const r = Estado.lancamentos.find(x => String(x.id) == modalNovo.dataset.editandoId);
        if (r) await submeteEdicaoLancamento(r);
        return;
    }

    el('erroNovo').textContent = ''; el('erroNovo').classList.remove('ok');

    const nome = el('fNome').value.trim();
    if (!nome) { el('erroNovo').textContent = 'Preencha o nome.'; el('fNome').focus(); return; }
    const categ = el('fCateg').value || null;
    if (!categ) { el('erroNovo').textContent = 'Escolha uma categoria.'; el('fCateg').focus(); return; }

    const data = el('fData').value || null;
    const valorDigitado = el('fValor').value.trim();
    const valorTotal = valorDigitado ? valorMascaraParaNumero(valorDigitado) : 0;

    const cred = el('fCred').checked;
    const ehAntecip = ehAntecipacaoFatura(categ || '');
    // credito sempre exige fatura; antecipacao de debito tambem (agora com vinculo explicito)
    const faturaIds = (cred || ehAntecip) ? idsFaturasDoFormulario() : [];
    const pago = el('fPago').checked;
    const reserva = el('fReserva').checked;
    const comprometido = el('fComprometido').checked;
    const praSempre = el('fPraSempre').checked;
    const freq = el('fFreq').value || null;   // "" (sem recorrencia) vira null, pra coluna freq ficar vazia no banco
    // Com Frequência, a série vai da 1ª data até DATA_LIMITE_RECORRENCIA — sem data não há
    // de onde contar nem onde parar.
    if (freq && !data) {
        el('erroNovo').textContent = 'Escolha a data da 1ª ocorrência.'; el('fData').focus(); return;
    }
    // Sem Frequência: valor em branco continua gerando 1 única linha (null), sem efeito do
    // Vezes — lançamento sem valor definido ainda, ex: assinatura de preço variável. Com
    // Frequência, a série é o pedido em si: sai inteira mesmo sem valor (cada linha null,
    // pra preencher depois), em vez de a Frequência não fazer nada.
    const parcelas = freq ? ocorrenciasAteLimite(data, freq, DATA_LIMITE_RECORRENCIA)
        : valorTotal ? +el('fParcelas').value : 1;
    const dividir = el('fDivide').checked;
    const valorAssinado = valorTotal * (sinalPositivo ? 1 : -1);
    const valores = !valorTotal ? Array(freq ? parcelas : 1).fill(null)
        : dividir ? valorDasParcelas(valorTotal, parcelas).map(v => v * (sinalPositivo ? 1 : -1))
            : Array(parcelas).fill(valorAssinado);   // repete o mesmo valor digitado em cada linha, sem dividir

    // Com Frequência só existe o seletor da 1ª fatura; sem, um por parcela.
    const faturasEsperadas = freq ? 1 : parcelas;
    if ((cred || ehAntecip) && (faturaIds.length !== faturasEsperadas || faturaIds.some(id => !id))) {
        el('erroNovo').textContent = cred
            ? (freq ? 'Escolha a 1ª fatura.' : 'Escolha uma fatura para cada parcela de crédito.')
            : 'Escolha a fatura que esta antecipação está quitando.';
        // Faltando a de uma parcela 2..N, abre direto o modal onde ela está.
        if (faturaIds.findIndex(id => !id) > 0) el('modalFaturasParcelas').showModal();
        else el('fFaturasWrap').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
    }
    const faturasDaSerie = freq && faturaIds.length
        ? Array.from({ length: parcelas }, (_, p) =>
            faturaDaOcorrencia(faturaIds[0], data, dataDaOcorrencia(data, p, freq)))
        : faturaIds;

    if (el('salvaNovo').disabled) return;   // trava clique duplo / Enter repetido
    el('salvaNovo').disabled = true;
    el('salvaNovo').textContent = Estado.simulando ? 'Simulando…' : 'Salvando…';

    try {
        let aviso = '';
        if (Estado.simulando) simulaLancamentoParcelado({ nome, categ, freq, data, cred, pago, reserva, comprometido, praSempre, parcelas, valores, faturaIds: faturasDaSerie });
        else aviso = await salvaLancamentoParceladoNoBanco({ nome, categ, freq, data, cred, pago, reserva, comprometido, praSempre, parcelas, valores, faturaIds: faturasDaSerie });

        // sucesso: NAO fecha o modal. Limpa so valor/data e mantem as opcoes do cadastro
        // pro proximo lancamento da mesma sessao (ex: varios itens do mesmo mercado).
        const totalAssinado = valores.reduce((s, v) => s + v, 0);
        el('erroNovo').textContent = (Estado.simulando ? 'Simulado: ' : 'Salvo: ') +
            (parcelas > 1
                ? (valores[0] == null ? `${parcelas}x sem valor`
                    : `${parcelas}x ${brl(Math.abs(valores[0]))} · ${brl(Math.abs(totalAssinado))} no total`)
                : brl(totalAssinado)) +
            (aviso ? ` · ${aviso}` : '');
        el('erroNovo').classList.add('ok');
        el('fNome').value = '';
        el('fValor').value = ''; sinalPositivo = false; atualizaSinalUI();
        el('fData').value = hojeISO();
        // Série até 2032 nunca é o padrão: o próximo cadastro volta a ser avulso, com Vezes
        // de volta, pra não gerar outra série sem a pessoa pedir de novo.
        el('fFreq').value = '';
        atualizaModoFrequencia();
        atualizarFaturasDoFormulario(idsFaturasDoFormulario(false));
        el('fCateg').value = '';   // categoria vinha do nome; sem nome, nao faz sentido manter
        popularCategoriasNoForm();   // recalcula popularidade com o lancamento recem-criado
        popularNomesNoForm();        // a próxima digitação já oferece o novo nome e categoria
        if (Estado._compraDaMeta) await avancarCompraDaMeta();
        desenhar();
        el('fNome').focus();
    } catch (err) {
        el('erroNovo').textContent = 'Falhou ao salvar: ' + err.message;
    } finally {
        el('salvaNovo').disabled = false;
        el('salvaNovo').textContent = Estado.simulando ? 'Simular' : 'Salvar';
    }
}

// ---- comprar uma meta: o mesmo cadastro, já preenchido com o plano ----
// À vista: um débito. Com entrada (parte do total), ela vem primeiro, como débito; depois o
// resto — cartão: crédito em N vezes, dividido, nas faturas do cartão do plano; financiado:
// débito em N vezes, dividido, Comprometido. A pessoa confere, escolhe a categoria e salva cada uma; depois
// da última, a meta vira "comprada" (some da lista e das projeções: agora é lançamento).
// Sem plano que caiba, parte do à vista, e a pessoa ajusta o que quiser.
function etapasDaCompraDaMeta(meta, plano) {
    if (plano?.forma === 'cartao' || plano?.forma === 'financiamento') {
        const entrada = plano.entrada > TOLERANCIA_FINANCEIRA ? [{ nome: `Entrada · ${meta.nome}`, cred: false, v: -plano.entrada }] : [];
        const resto = -(meta.valor - (plano.entrada || 0));
        if (!plano.parcelas) return entrada;
        // Cartão: as faturas do plano, a partir da 1ª (as que passam do horizonte seguem mês a mês).
        // Débito: a série começa no mês da meta (o da 1ª parcela).
        const primeiraFatura = plano.linhas.find(r => r.cred)?.fatura;
        return [...entrada, plano.forma === 'cartao'
            ? { nome: meta.nome, cred: true, v: resto, vezes: plano.parcelas, dividir: true, cartao: plano.cartao,
                faturas: primeiraFatura ? Array.from({ length: plano.parcelas }, (_, p) => somaMeses(primeiraFatura, p)) : null }
            : { nome: meta.nome, cred: false, v: resto, vezes: plano.parcelas, dividir: true, comprometido: true,
                // Início do ciclo da 1ª parcela (o dia 1º do mês ainda é do ciclo anterior).
                data: Estado.ciclos[plano.ciclo] ? dataISO(Estado.ciclos[plano.ciclo].ini) : plano.mes }];
    }
    return [{ nome: meta.nome, cred: false, v: -meta.valor }];
}

function abreCompraDaMeta(meta, plano) {
    const etapas = etapasDaCompraDaMeta(meta, plano);
    if (!etapas.length) return;
    abrirEtapaDaCompraDaMeta({ metaId: meta.id, nome: meta.nome, etapas });
}

function abrirEtapaDaCompraDaMeta(compra) {
    const etapa = compra.etapas[0];
    if (modalNovo.open) modalNovo.close();
    abreModalNovo({ nome: etapa.nome, categ: '', data: etapa.data || hojeISO(), cred: etapa.cred, v: etapa.v, pago: !etapa.data, comprometido: !!etapa.comprometido });
    Estado._compraDaMeta = compra;
    el('tituloNovo').textContent = `${Estado.simulando ? 'Simular' : 'Comprar'} · ${compra.nome}`;
    if (etapa.vezes > 1) {
        el('fParcelas').value = etapa.vezes;
        el('fDivide').checked = !!etapa.dividir;
    }
    if (etapa.cred) atualizarFaturasDoFormulario(etapa.faturas || faturasSugeridasParaParcelas(hojeISO(), etapa.vezes || 1, null, etapa.cartao), etapa.cartao);
    atualizaSinalUI();
}

// Depois de salvar uma etapa: abre a próxima ou marca a meta como comprada.
async function avancarCompraDaMeta() {
    const compra = Estado._compraDaMeta;
    compra.etapas.shift();
    if (compra.etapas.length) { abrirEtapaDaCompraDaMeta(compra); return; }
    Estado._compraDaMeta = null;
    if (Estado.metas.some(m => m.id === compra.metaId)) await gravarMudancaDaMeta('atualizar', compra.metaId, { status: 'comprada' });
}

// Editar (ver el('seledit')): a MESMA linha, nunca gera lançamento novo. Principal uso é
// transformar Débito <-> Crédito (escolhendo a fatura ao virar Crédito, ou uma nova data —
// que decide o ciclo — ao virar Débito) sem precisar excluir e recadastrar do zero; os
// demais campos (Nome, Categoria, Valor...) ficam editáveis juntos por já estarem no mesmo
// formulário, mas cada um já tem edição própria mais rápida direto na célula da tabela.
// `fatura` é sempre reenviado explicitamente — inclusive `null` ao desmarcar Crédito — pra
// realmente apagar uma fatura antiga em vez de deixá-la esquecida no banco.
async function submeteEdicaoLancamento(r) {
    el('erroNovo').textContent = ''; el('erroNovo').classList.remove('ok');

    const nome = el('fNome').value.trim();
    if (!nome) { el('erroNovo').textContent = 'Preencha o nome.'; el('fNome').focus(); return; }
    const categ = el('fCateg').value || null;
    if (!categ) { el('erroNovo').textContent = 'Escolha uma categoria.'; el('fCateg').focus(); return; }

    const data = el('fData').value || null;
    const valorDigitado = el('fValor').value.trim();
    const valorTotal = valorDigitado ? valorMascaraParaNumero(valorDigitado) : 0;
    const cred = el('fCred').checked;
    const ehAntecip = ehAntecipacaoFatura(categ || '');
    const faturaIds = (cred || ehAntecip) ? idsFaturasDoFormulario() : [];
    const pago = el('fPago').checked;
    const reserva = el('fReserva').checked;
    const comprometido = el('fComprometido').checked;
    const praSempre = el('fPraSempre').checked;
    const freq = el('fFreq').value || null;

    if ((cred || ehAntecip) && (faturaIds.length !== 1 || !faturaIds[0])) {
        el('erroNovo').textContent = cred
            ? 'Escolha a fatura dessa compra.'
            : 'Escolha a fatura que esta antecipação está quitando.';
        el('fFaturasWrap').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
    }

    if (el('salvaNovo').disabled) return;
    el('salvaNovo').disabled = true;
    el('salvaNovo').textContent = Estado.simulando ? 'Simulando…' : 'Salvando…';

    const campos = {
        nome, categ: normalizaCategorias(categ), freq, data, cred, pago, reserva, comprometido,
        ...(Estado.temPraSempre ? { pra_sempre: praSempre } : {}),
        valor: valorTotal ? valorTotal * (sinalPositivo ? 1 : -1) : null,
        fatura: (cred || ehAntecip) ? dataISO(faturaIds[0]) : null,
    };

    try {
        if (!Estado.simulando && !r._sim) await atualizarLancamento(r.id, campos);
        Object.assign(r, campos);
        r.v = campos.valor || 0;
        r.inv = ehCategoriaInvestimento(r.categ);
        reclassificaPeriodo(r);
        modalNovo.close();   // o close listener ja' limpa a selecao e redesenha
    } catch (err) {
        el('erroNovo').textContent = 'Falhou ao salvar: ' + err.message;
    } finally {
        el('salvaNovo').disabled = false;
        el('salvaNovo').textContent = Estado.simulando ? 'Simular' : 'Salvar';
    }
}

// grava as N parcelas como lancamentos REAIS no Supabase, uma por vez (sequencial, pra
// preservar a ordem e simplificar o tratamento de erro no meio do caminho). Cada parcela
// p grava sua PROPRIA data (a data digitada avancada p vezes pela regra da Frequencia
// escolhida — ver dataDaOcorrencia) — nao so' a mesma data repetida — porque o
// periodoIdx nao e' uma coluna do banco: ele e' recalculado do
// zero a partir da 'data' toda vez que os dados sao carregados (ver carregarDados). Se
// todas as parcelas fossem gravadas com a mesma data, o recalculo jogava todas de volta
// pro mesmo mes ao dar F5/recarregar, mesmo com o periodoIdx correto (e passageiro) na
// memoria logo apos o cadastro. Por isso o periodoIdx de cada parcela aqui usa a MESMA
// regra de classificacao que carregarDados() usa: debito pela propria data, credito pelo
// vencimento da fatura escolhida. Assim o que aparece na hora e' igual ao recarregamento.
async function salvaLancamentoParceladoNoBanco({ nome, categ, freq, data, cred, pago, reserva, comprometido, praSempre = false, parcelas, valores, faturaIds = [] }) {
    const ehAntecip = ehAntecipacaoFatura(categ || '');
    // Vezes > 1 cria o lote inteiro nesta mesma submissão (cartão parcelado ou várias
    // ocorrências futuras de um débito recorrente) num único INSERT (inserirLancamentos):
    // com sinal ruim, ou o lote inteiro entra, ou nada entra — nunca uma série pela metade.
    // Todas as parcelas compartilham um recorrencia_id só pra marcar o lote: o próximo número
    // da sequência do banco (proximaRecorrencia, migration 28), pedido depois do INSERT — só
    // então o lote existe — e gravado num PATCH em lote. Lançamento único (parcelas == 1)
    // continua sem recorrencia_id, mesmo com Frequência marcada: essa continuidade entre
    // meses cadastrados em momentos separados não é coberta aqui.
    const payloads = Array.from({ length: parcelas }, (_, p) => {
        const dataParcela = data ? dataDaOcorrencia(data, p, freq) : null;
        const faturaVenc = (cred || ehAntecip) && faturaIds[p] ? dataISO(faturaIds[p]) : null;
        return {
            data: dataParcela, freq, cred, pago, reserva, comprometido,
            // Sem a coluna no banco (migration 31 não aplicada), o campo nem vai no INSERT.
            ...(Estado.temPraSempre ? { pra_sempre: praSempre } : {}),
            nome,
            categ, valor: valores[p],
            fatura: faturaVenc,
            recorrencia_id: null,
        };
    });
    const criadas = (await inserirLancamentos(payloads)).sort((a, b) => a.id - b.id);
    let aviso = '';
    if (parcelas > 1) {
        try {
            // Sempre o próximo número da sequência do banco, nunca o id de uma parcela.
            const recorrenciaId = await proximaRecorrencia();
            await atualizarLancamentos(criadas.map(linha => linha.id), { recorrencia_id: recorrenciaId });
            criadas.forEach(linha => { linha.recorrencia_id = recorrenciaId; });
        } catch (err) {
            // As linhas já estão no banco: falhar aqui faria a pessoa salvar de novo e duplicar.
            // O vínculo de lote é só uma marca (a tela não depende dele), então vira aviso.
            aviso = `sem o vínculo de lote (recorrencia_id): ${err.message}`;
        }
    }
    // Mesmas regras da carga (periodoDoLancamento/ehCategoriaInvestimento): o que aparece na
    // hora é o que volta ao recarregar. Antecipação é débito: ciclo pela data, não pela fatura.
    criadas.forEach(linhaCriada => {
        Estado.lancamentos.push({
            ...linhaCriada,
            v: +linhaCriada.valor || 0,
            inv: ehCategoriaInvestimento(linhaCriada.categ),
            periodoIdx: periodoDoLancamento(linhaCriada),
        });
    });
    return aviso;
}


// ===================================================================
// MODO SIMULAÇÃO — lançamentos hipotéticos entram direto em Estado.lancamentos, marcados
// com _sim=true. Atualizações e ocultações de linhas já carregadas também ficam somente
// nesse array; recarregar ou desligar reconstrói tudo a partir do Supabase.
// Enquanto ativo, os simulados entram em TODAS as metricas (saldo, matriz Comparar,
// graficos) exatamente como um lancamento real entraria, porque sao um.
//
// O formulario de lancamento e' o MESMO de sempre (modalNovo/#abreNovo) — nao ha mais um
// modal "Simular compra" separado. Enquanto o toggle abaixo estiver ligado,
// submeteNovoLancamento() desvia pra simulaLancamentoParcelado() em vez de gravar no
// banco (ver abreModalNovo, que tambem troca titulo/texto do botao conforme o modo).
// ===================================================================
// Cópia (linha a linha) do que está carregado: a simulação edita e oculta direto em
// Estado.lancamentos e Estado.limitesPorCiclo, então o "antes" precisa de objetos próprios.
function guardarRetratoAntesDaSimulacao() {
    Estado.retratoAntesDaSimulacao = {
        lancamentos: Estado.lancamentos.map(r => ({ ...r })),
        metas: Estado.metas.map(m => ({ ...m })),
        limitesPorCiclo: new Map([...Estado.limitesPorCiclo].map(([id, linha]) => [id, { ...linha }])),
    };
}

function atualizaBotaoSimulacao() {
    el('toggleSimulacao').classList.toggle('ativo', Estado.simulando);
    el('toggleSimulacao').title = Estado.simulando
        ? 'Simulação ativa'
        : 'Simular (não salva)';
    document.body.classList.toggle('simulando', Estado.simulando);
}

el('toggleSimulacao').onclick = async () => {
    if (Estado.simulando) {
        // desligar = descartar: recarrega os dados de verdade do banco, que reconstroi
        // Estado.lancamentos do zero SEM os simulados (eles nunca foram salvos). Só sai da
        // simulação DEPOIS que a recarga der certo: se falhar (sem internet), os simulados
        // continuam na memória e a tela segue em modo simulação — nunca uma tela "real" com
        // lançamentos hipotéticos que um Materializar poderia gravar de verdade.
        const bt = el('toggleSimulacao');
        if (bt.disabled) return;
        bt.disabled = true;
        try {
            if (!(await load({ silencioso: true }))) {
                mostrarToast('A simulação continua', 'Não deu pra recarregar os dados do banco. Tente de novo quando a conexão voltar.');
                return;
            }
            Estado.simulando = false;
            Estado.retratoAntesDaSimulacao = null;
            atualizaBotaoSimulacao();
            desenhar();
        } finally {
            bt.disabled = false;
        }
    } else {
        Estado.simulando = true;
        guardarRetratoAntesDaSimulacao();
        atualizaBotaoSimulacao();
        desenhar();
    }
};

// cria N lancamentos simulados (parcelas), um por periodo seguinte, injetados direto em
// Estado.lancamentos com _sim=true. Cada parcela p ganha sua PROPRIA data (a digitada
// avancada p vezes pela regra da Frequencia, via dataDaOcorrencia — mesma ideia de
// salvaLancamentoParceladoNoBanco) e o periodoIdx e'
// derivado dessa data com a MESMA regra de qualquer lancamento real, em vez de so' somar
// +1 no indice: sem isso a coluna Data mostrava a mesma data em todas as parcelas
// enquanto elas apareciam espalhadas em ciclos diferentes, incoerente na tela.
function simulaLancamentoParcelado({ nome, categ, freq, data, cred, pago, reserva, comprometido, praSempre = false, parcelas, valores, faturaIds = [] }) {
    const grupoSimulado = ++Estado._proxIdSimulado;   // contador curto, so' pra diferenciar cada "compra simulada" das outras
    const ehAntecip = ehAntecipacaoFatura(categ || '');

    const criadas = valores.map((valorAssinado, p) => {
        const dataParcela = data ? dataDaOcorrencia(data, p, freq) : null;
        const faturaVenc = (cred || ehAntecip) && faturaIds[p] ? dataISO(faturaIds[p]) : null;
        return {
            id: `sim-${grupoSimulado}-${p}`,
            nome,
            categ, freq, data: dataParcela,
            cred, pago, reserva, comprometido, pra_sempre: praSempre,
            fatura: faturaVenc,
            valor: valorAssinado, v: +valorAssinado || 0,   // v numerico seguro, igual carregarDados() faz com dados reais
            inv: ehCategoriaInvestimento(categ),
            periodoIdx: periodoDoLancamento({ cred, data: dataParcela, fatura: faturaVenc }),
            // mesma ideia do lote real (salvaLancamentoParceladoNoBanco): só parcelas > 1
            // dividem um identificador de lote, aqui o próprio contador da simulação.
            recorrencia_id: parcelas > 1 ? grupoSimulado : null,
            _sim: true,
        };
    });
    Estado.lancamentos.push(...criadas);
}

// ===================================================================
// LOGIN (Supabase Auth)
// ===================================================================
