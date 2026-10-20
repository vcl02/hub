// Contrato visual-financeiro: a tabela Crédito é prévia; o saldo continua no ciclo próprio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync('js/finance.js', 'utf8');
const dominio = fs.readFileSync('js/domain.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');
const inicio = script.indexOf('function creditosExibidosNoCiclo(');
const fim = script.length;

if (inicio < 0 || fim < 0) throw Error('Não encontrou a regra de layout do Crédito no módulo financeiro.');

const contexto = {};
vm.createContext(contexto);
vm.runInContext(script.slice(inicio, fim), contexto);
const exibir = (linhas, ciclo) => Array.from(contexto.creditosExibidosNoCiclo(linhas, ciclo));

test('mostra no ciclo atual somente os créditos que pertencem ao ciclo seguinte', () => {
    const linhas = [
        { id: 1, cred: true, periodoIdx: 4 },
        { id: 2, cred: true, periodoIdx: 5 },
        { id: 3, cred: false, periodoIdx: 5 },
    ];
    assert.deepEqual(exibir(linhas, 4).map(r => r.id), [2]);
});

test('não desloca créditos quando não existe uma competência seguinte', () => {
    assert.deepEqual(exibir([{ id: 1, cred: true, periodoIdx: 4 }], 4), []);
});

test('o título do Crédito mostra o saldo após antecipações da mesma fatura', () => {
    assert.equal(
        contexto.totalCreditoExibidoAposAntecipacoes([{ v: -2922.26 }], 500),
        -2422.26
    );
});

test('o único título de Crédito exibe o limite livre de cada cartão, com a garantia só no Nubank', () => {
    assert.match(dominio, /let LIMITE_CARTAO = 3350;/);
    assert.match(dominio, /let LIMITE_CARTAO_MP = 1100;/);
    assert.match(visoes, /const guardadoGarantido = guardadoGarantidoAte\(Estado\.lancamentos, i\)/);
    assert.match(visoes, /const garantiaNubank = garantiaDoCiclo\(i, guardadoGarantido\);/);
    assert.match(visoes, /const garantidoDoCartao = cartao === CARTAO_NUBANK \? garantiaNubank\.efetiva : 0;/);
    assert.match(visoes, /const aprovado = aprovadoDoCiclo\(i, cartao\);/);
    assert.match(visoes, /limiteTotal: limiteCartaoTotal\(garantidoDoCartao, cartao, aprovado\),/);
    assert.match(visoes, /limiteLivreHoje: limiteCartaoLivre\(Estado\.lancamentos, abatimentoDoCartao\(abatidoPagoDoCartao, cartao\), garantidoDoCartao, -Infinity, cartao, aprovado\),/);
    assert.match(visoes, /limiteLivreFuturo: limiteCartaoLivreFuturo\(/);
    assert.match(visoes, /Estado\.lancamentos, garantidoDoCartao, idxCreditoExibido, totalExibidoDoCartao, cartao/);
    assert.match(visoes, /data-limite-cartao/);
    // Garantia editável no próprio título (quanto do guardado vira garantia no ciclo).
    assert.match(visoes, /data-garantia-cartao data-ciclo="\$\{i\}"/);
    assert.match(visoes, /placeholder="0,00"/);
    assert.match(visoes, /limiteGarantido/);
    assert.match(visoes, /const resumoLimiteCartao/);
    // Teto = Aprovado vira o próprio campo depois de "de"; com garantia, o Aprovado vem num
    // pedaço próprio e a garantia em outro (só no Nubank).
    assert.match(visoes, /tetoSemGarantia\(l\) \? `<span class=limiteCartaoBase>R\$ \$\{campoAprovado\(l\)\}<\/span>` : brl\(l\.limiteTotal\),/);
    assert.match(visoes, /pedaco\(`<span class=limiteTeto><span class=limiteCartaoBase>R\$ \$\{campoAprovado\(l\)\}<span class=limiteCartaoRotulo>Aprovado<\/span><\/span><\/span>`\)/);
    assert.match(visoes, /l\.cartao === CARTAO_NUBANK && mostraGarantia \? `<span class="pedaco limiteGarantido">\+ R\$ \$\{campoGarantia\(\)\} Garantido<\/span>` : ''/);
    assert.match(visoes, /const creditoAcimaLimite = !cicloDebitoPassado && limitesDosCartoes\.some\(l =>\s*Math\.abs\(l\.totalHoje\) > l\.limiteTotal \|\| \(exibeFuturoCredito && l\.limiteLivreFuturo < -TOLERANCIA_FINANCEIRA\)\);/);
    assert.match(visoes, /const alertaTituloCredito = alertaTitulo\('alertaLimite', creditoAcimaLimite,/);
    assert.match(visoes, /Math\.abs\(l\.totalHoje\) > l\.limiteTotal/);
    assert.match(visoes, /l\.limiteLivreFuturo < -TOLERANCIA_FINANCEIRA/);
    assert.match(visoes, /'Gasto acima do limite'/);
    assert.match(visoes, /`Crédito\$\{alertaTituloCredito\}`/);
    assert.match(visoes, /value="\$\{emReais\(l\.aprovado\)\}"/);
    // Largura pelo próprio valor, sem vão até Aprovado/Garantido sem field-sizing.
    assert.match(visoes, /const larguraDoCampo = texto => `style="width:\$\{Math\.max\(4, String\(texto\)\.length \+ 1\)\}ch"`;/);
    // Teto igual ao Aprovado (sem garantia): só o campo editável depois do "de", sem repetir.
    assert.match(visoes, /const tetoSemGarantia = l => Math\.abs\(l\.limiteTotal - l\.aprovado\) < TOLERANCIA_FINANCEIRA;/);
    assert.match(visoes, /\? `<span class=limiteCartaoBase>R\$ \$\{campoAprovado\(l\)\}<\/span>`/);
    assert.match(visoes, /const garantiaExibida = garantiaNubank\.escolhida != null \|\| i === Estado\.idxHoje\s*\n\s*\? garantiaNubank\.efetiva : Math\.floor\(garantiaNubank\.efetiva \/ 100\) \* 100;/);
    assert.doesNotMatch(visoes, /Garantido<\/span>` : ''\}\)<\/span>/);
    assert.match(estilos, /\.limiteCartao/);
    assert.match(estilos, /\.limiteCartaoEditavel/);
    assert.match(estilos, /\.limiteCartaoEditavel::placeholder/);
    assert.match(estilos, /\.limiteCartaoRotulo/);
    assert.match(estilos, /gap: \.1rem/);
    assert.match(interacoes, /formataMascaraDinheiro\(input\.value\)/);
    assert.match(interacoes, /input\.select\(\)/);
    assert.match(interacoes, /const valor = texto \? Math\.round\(numeroDoLimiteDigitado\(texto\) \* 100\) \/ 100 : null;/);
    assert.doesNotMatch(estilos, /\.limiteTotal/);
    assert.match(estilos, /\.alertaTitulo/);
    assert.match(estilos, /\.alertaTitulo\.vazio/);
    assert.match(estilos, /flex: 0 0 5\.7rem/);
});

test('títulos distinguem o retrato pago até hoje da previsão futura', () => {
    assert.match(visoes, /const debitoHoje = resumoDebitoPago\(Estado\.lancamentos\)/);
    assert.match(visoes, /const pagosAteHoje = lancamentosPagos\(Estado\.lancamentos\)/);
    assert.match(visoes, /const cicloDebitoFuturo = dataISO\(periodo\.ini\) > hojeISO\(\)/);
    assert.match(visoes, /const cicloDebitoPassado = dataISO\(periodo\.fat\) < hojeISO\(\)/);
    assert.match(visoes, /const linhaFuturoDebito = exibeFuturo \?/);
    assert.match(visoes, /const linhaFuturoCredito = exibeFuturoCredito \?/);
    assert.match(visoes, /linhaHojeDebito \+ linhaFuturoDebito/);
    assert.match(visoes, /linhaHojeCredito \+ linhaFuturoCredito/);
    assert.match(visoes, /const linhaHojeDebito = cicloDebitoFuturo \? ''/);
    assert.match(visoes, /const temHoje = !\(cicloDebitoFuturo \|\| cicloDebitoPassado\);[\s\S]*?const linhaHojeCredito = !temHoje \? ''/);
    assert.match(visoes, /const resumoCredito = cicloDebitoPassado \? '' :/);
    assert.match(visoes, /const totalCreditoHistorico = creditosExibidos\.reduce\(\(soma, r\) => soma \+ r\.v, 0\)/);
    assert.match(visoes, /const totalTituloCredito = cicloDebitoPassado \? totalCreditoHistorico : totalCreditoExibido/);
    assert.match(visoes, /`Crédito\$\{alertaTituloCredito\}`, totalTituloCredito,/);
    assert.match(visoes, /cicloDebitoPassado \? ' ' : undefined/);
    assert.match(fs.readFileSync('js\/tables\.js', 'utf8'), /separadorTotal = ' · '/);
    assert.match(visoes, /const alertaTitulo = \(classe, visivel, titulo, rotulo\) =>/);
    assert.match(visoes, /'Saldo negativo após usar o guardado'/);
    assert.match(visoes, /const debitoTemSaldoVermelho = classeSaldoNaLinhaUnica == 'vm' \|\| \(exibeFuturo && classeSaldoFuturo == 'vm'\)/);
    assert.match(visoes, /!cicloDebitoPassado && limitesDosCartoes\.some\(l =>\s*Math\.abs\(l\.totalHoje\) > l\.limiteTotal/);
    assert.match(visoes, /const alertaTituloDebito = alertaTitulo\('alertaSaldo', debitoTemSaldoVermelho,/);
    assert.match(visoes, /`Débito\$\{alertaTituloDebito\}`/);
    assert.doesNotMatch(visoes, /Pago \+ aberto/);
    assert.match(visoes, /Guardado/);
    assert.match(estilos, /\.resumoTitulo/);
    assert.match(estilos, /\.resumoLinha/);
    assert.match(estilos, /\.alertaTitulo/);
    assert.match(visoes, /class=resumoDados/);
    assert.match(estilos, /grid-template-columns: 3\.65rem minmax\(0, 1fr\)/);
    assert.match(estilosMobile, /flex-basis: calc\(100% - 1\.95rem\)/);
    assert.doesNotMatch(interacoes, /voltouDoAtualParaHistorico/);
    assert.match(interacoes, /if \(direcao > 0 && \+novoValor >= Estado\.idxHoje\) abrirBlocosFinanceiros\(\)/);
    assert.match(interacoes, /function voltarAoCicloAtualELimpar\(\) \{[\s\S]*abrirBlocosFinanceiros\(\)/);
});

test('prévia de crédito do ciclo atual mantém Hoje mesmo quando a fatura vence depois', () => {
    assert.match(visoes, /A prévia de Crédito do ciclo atual continua tendo/);
    assert.doesNotMatch(visoes, /cicloCreditoFuturo/);
    const inicioHoje = visoes.indexOf('const linhaHojeCredito');
    const fimHoje = visoes.indexOf('const resumoCredito');
    assert.doesNotMatch(visoes.slice(inicioHoje, fimHoje), /Pago <b/);
});

test('ciclo anterior ao atual troca o rótulo Hoje do Débito por Passado', () => {
    // Mesmo cálculo de sempre (pago = true); só o texto muda, porque um ciclo que já
    // fechou não é "agora".
    assert.match(visoes, /resumoRotulo>\$\{cicloDebitoPassado \? 'Passado' : 'Hoje'\}<\/span>/);
});

test('Passado mostra o total fechado daquele ciclo, não o retrato de hoje', () => {
    // debitoHoje é um valor GLOBAL (mesmo não importa o ciclo aberto); um ciclo passado
    // precisa do total acumulado ATÉ ELE (totalDebito/guardado), senão todo ciclo antigo
    // mostraria o mesmo número de hoje, o que não faz sentido pra histórico.
    assert.match(visoes, /const saldoExibidoNaLinhaUnica = cicloDebitoPassado \? totalDebito : debitoHoje\.saldo;/);
    assert.match(visoes, /const guardadoExibidoNaLinhaUnica = cicloDebitoPassado \? guardado : debitoHoje\.guardado;/);
    assert.match(visoes, /const classeSaldoNaLinhaUnica = cicloDebitoPassado \? classeSaldoFuturo : classeSaldoHoje;/);
    assert.match(regras, /não repete o retrato de agora.*mostra Saldo e Guardado acumulados até o fechamento daquele ciclo específico/);
});

test('ciclo anterior ao atual nunca recolhe automaticamente ao navegar para o histórico', () => {
    // Antes, voltar do ciclo atual pra um ciclo passado (Anterior) recolhia Débito e
    // Crédito de propósito; a regra mudou para manter o histórico sempre aberto e
    // detalhado, deixando o recolhimento só no toggle manual do usuário.
    assert.doesNotMatch(interacoes, /voltouDoAtualParaHistorico/);
    assert.doesNotMatch(interacoes, /histórico abre com Débito e Crédito recolhidos/);
    assert.match(regras, /Ciclos anteriores ao atual sempre ficam abertos e detalhados/);
    assert.match(regras, /navegar para o histórico, com Anterior ou selecionando o ciclo diretamente, nunca recolhe Débito nem Crédito/);
});

test('igualdade de valores não recolhe débito ou crédito com lançamento real ainda aberto', () => {
    // Um débito aberto pode compensar outro em valor (ex.: +100 e -100 abertos) e zerar
    // a diferença entre Hoje e Futuro por coincidência, sem que o ciclo esteja quitado.
    // A mesma fatura do cartão pendente (linhasFatura não vazia) também não pode sumir.
    assert.match(visoes, /const debitoTemPendencia = debitos\.some\(r => r\.pago === false\) \|\| linhasFatura\.length > 0;/);
    assert.match(visoes, /const resumoDebitoIgual = cicloAtual && !cicloDebitoFuturo && !debitoTemPendencia &&/);
    assert.match(visoes, /const creditoTemPendencia = creditosExibidos\.some\(r => r\.pago === false\);/);
    assert.match(visoes, /const resumoCreditoIgual = cicloAtual && !cicloDebitoFuturo && !creditoTemPendencia &&/);
    assert.match(regras, /A igualdade de valores sozinha nunca basta: um lançamento aberto pode compensar outro e zerar a diferença por coincidência/);
});

test('resumos iguais no ciclo atual recolhem apenas o bloco repetido e ocultam seu Futuro', () => {
    assert.match(visoes, /const resumoDebitoIgual = cicloAtual && !cicloDebitoFuturo/);
    assert.match(visoes, /Math\.abs\(debitoHoje\.saldo - totalDebito\) <= TOLERANCIA_FINANCEIRA/);
    assert.match(visoes, /const resumoCreditoIgual = cicloAtual && !cicloDebitoFuturo/);
    assert.match(visoes, /Math\.abs\(totalCreditoHoje - totalCreditoExibido\) <= TOLERANCIA_FINANCEIRA/);
    assert.match(visoes, /const exibeFuturoDebito = !cicloDebitoPassado && !resumoDebitoIgual;/);
    assert.match(visoes, /const exibeFuturoCredito = !cicloDebitoPassado && !resumoCreditoIgual;/);
    assert.match(visoes, /blocosResumosIguais\.split\(\/\(\?=cr\)\/\)\.filter\(Boolean\)\.forEach\(recolherBloco\)/);
    assert.match(regras, /cada bloco é avaliado separadamente[\s\S]*Hoje e Futuro forem iguais/);
});

test('documenta o cartão pelo dia do vencimento como regra provisória, com saída por migration', () => {
    // Decisão do mantenedor: dois cartões sem coluna nova. A identidade explícita continua
    // sendo o caminho quando os vencimentos coincidirem ou entrar um terceiro cartão.
    assert.match(regras, /Identificar o cartão pelo dia do vencimento é uma regra provisória/);
    assert.match(regras, /identificação explícita de cartão/);
    assert.match(decisoes, /identidade explícita de cartão em crédito e antecipação/);
    assert.match(decisoes, /Nome e categoria continuam sem identificar cartão/);
});
