// Regressão do botão "Consolidar tudo": repete materializar/consolidar ciclo a ciclo sem
// abrir um por um, reaproveitando a mesma regra de aporte/resgate já usada na linha única. O caminho na tela (Recarregar
// consolida do ciclo de hoje ao último com lançamento, resumo ciclo a ciclo, não duplica, sem rede não consolida) está em
// navegador-consolidar.test.js; aqui, as regras rodando no código e a documentação.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');

test('Consolidar tudo não tem botão próprio: roda no clique do Recarregar', () => {
    assert.match(fs.readFileSync('js/bootstrap.js', 'utf8'), /await consolidarTudo\(bt, voltarAoCicloAtualELimpar\);/);
    // .tool tem paridade total com o desktop: fica sempre visível, em qualquer largura —
    // sem regra própria escondendo este botão no mobile.
});

test('botão fica desabilitado e com texto "Consolidando…" durante a varredura, bloqueando clique duplo', () => {
    const inicio = formulario.indexOf("async function consolidarTudo(botao, depoisDaCarga = () => {}, { silencioso = false } = {}) {");
    const trecho = formulario.slice(inicio, formulario.indexOf('\n}\n', inicio) + 3);
    // Botão só de ícone: trocar textContent apagaria o SVG; a etapa vai pro title/aria-label.
    assert.doesNotMatch(trecho, /textContent/);
    assert.match(trecho, /const tituloOriginal = botao\.title;/);
    assert.match(trecho, /botao\.disabled = true;\s*\n\s*botao\.classList\.add\('carregando'\);/);
    assert.match(trecho, /etapa\('Recarregando…'\);/);
    assert.match(trecho, /etapa\('Consolidando…'\);/);
    // finally roda tanto no caminho feliz quanto no catch, então o texto e o disabled
    // voltam ao normal nos dois casos — sucesso ou falha.
    assert.match(trecho, /\} finally \{\s*\n\s*Estado\.gravandoAjuste = false;\s*\n\s*botao\.disabled = false;\s*\n\s*botao\.classList\.remove\('carregando'\);\s*\n\s*botao\.title = tituloOriginal;\s*\n\s*botao\.setAttribute\('aria-label', rotuloOriginal\);\s*\n\s*\}/);
});

test('fica visualmente apagado enquanto desabilitado, igual Duplicar/Editar/Excluir e o Salvar do cadastro — não só o cursor nativo do navegador', () => {
    // .btFiltro só tinha estilo dentro do media query mobile (ver css/mobile.css); esta
    // regra fica em dashboard.css, fora de qualquer media query, pra também valer no
    // desktop — onde "Consolidar tudo" realmente roda.
    // O cursor vem da regra global de :disabled (bloqueado vermelho, em base.css).
    assert.match(estilos, /\.btFiltro:disabled \{\s*\n\s*opacity: \.5;\s*\n\s*\}/);
    assert.doesNotMatch(estilosMobile, /\.btFiltro:disabled/);
});

test('consolidar tudo corrige recorrências duplicadas ANTES de materializar/consolidar, no mesmo intervalo, recalculando o fim do intervalo depois', () => {
    assert.match(formulario, /const \{ corrigidos, log: logDatas \} = silencioso \? \{ corrigidos: 0, log: \[\] \}\s*\n\s*: await corrigeRecorrenciasDuplicadasNoIntervalo\(Estado\.idxHoje, ultimoCicloAntesDaCorrecao\);/);
    assert.match(formulario, /async function corrigeRecorrenciasDuplicadasNoIntervalo\(idxInicio, idxFim\) \{/);
    assert.match(formulario, /const proximoCiclo = Estado\.ciclos\[idx \+ 1\];\s*\n\s*if \(!proximoCiclo\) continue;/);
    assert.match(formulario, /marcaOcorrenciasDuplicadasNoCiclo\(debitos, proximoCiclo\);/);
    assert.match(formulario, /for \(const r of debitos\.filter\(r => r\._dupCiclo\)\) \{/);
    assert.match(formulario, /const dataAntiga = r\.data;/);
    assert.match(formulario, /if \(!Estado\.simulando && !r\._sim\) await atualizarLancamento\(r\.id, \{ data: novaData \}\);/);
    assert.match(formulario, /r\.data = novaData;\s*\n\s*reclassificaPeriodo\(r\);\s*\n\s*delete r\._dupCiclo;\s*\n\s*corrigidos\+\+;/);
    assert.match(formulario, /log\.push\(`\$\{nomePeriodo\(Estado\.ciclos\[idx\]\)\}: "\$\{r\.nome \?\? ''\}" movida de \$\{dataBR\(dataAntiga\)\} para \$\{dataBR\(novaData\)\} \(recorrência duplicada no ciclo\)\.`\);/);
    assert.match(formulario, /return \{ corrigidos, log \};/);
});

test('conclusão sempre aparece em toast, juntando materialização/consolidação e correção de datas num só resumo', () => {
    const inicio = formulario.indexOf("async function consolidarTudo(botao, depoisDaCarga = () => {}, { silencioso = false } = {}) {");
    const trecho = formulario.slice(inicio, formulario.indexOf('\n}\n', inicio) + 3);
    assert.match(trecho, /const partes = \[\];\s*\n\s*if \(materializados \|\| consolidados\) partes\.push\(`\$\{materializados\} materializado\(s\), \$\{consolidados\} consolidado\(s\)`\);\s*\n\s*if \(corrigidos\) partes\.push\(`\$\{corrigidos\} data\(s\) de recorrência duplicada corrigida\(s\)`\);/);
    assert.match(trecho, /const resumo = partes\.length\s*\n\s*\? `\$\{partes\.join\('; '\)\}\.`\s*\n\s*: 'Nenhum ciclo com Aporte sugerido, Resgate necessário, recorrência duplicada ou pra sempre pendente\.';/);
    assert.match(trecho, /mostrarToast\('Consolidar tudo', resumo\);/);
    assert.match(trecho, /catch \(err\) \{\s*if \(silencioso\) console\.warn\('\[consolidação automática\] falhou:', err\.message\);\s*else mostrarToast\('Falhou ao consolidar tudo', err\.message\);\s*desenhar\(\);/);
});

test('também abre um modal com o detalhe ciclo a ciclo — resposta direta ao clique, não escondida atrás de outro botão', () => {
    const inicio = formulario.indexOf("async function consolidarTudo(botao, depoisDaCarga = () => {}, { silencioso = false } = {}) {");
    const trecho = formulario.slice(inicio, formulario.indexOf('\n}\n', inicio) + 3);
    assert.match(trecho, /const logAjustes = \[\];/);
    assert.match(trecho, /const ehAporte = ajuste\.tipo == 'aporte';/);
    assert.match(trecho, /logAjustes\.push\(`\$\{nomePeriodo\(Estado\.ciclos\[idx\]\)\}: \$\{resultado == 'consolidado' \? 'Consolidado' : 'Materializado'\} \$\{ehAporte \? 'Aporte' : 'Resgate'\} de \$\{brl\(Math\.abs\(ajuste\.v\)\)\}\$\{limite\}\.`\);/);
    assert.match(trecho, /const limite = ajuste\.resgatouTudo \? \(ajuste\.v < 0 \? ' \(resgate diminuído: o guardado não pode ficar negativo\)' : ' \(todo o guardado\)'\) : '';/);
    // Só abre quando algo foi gravado; sem nada a fazer, fica só o toast.
    assert.match(trecho, /if \(partes\.length\) mostrarResultadoConsolidarTudo\(resumo, \[\.\.\.logPraSempre, \.\.\.logDatas, \.\.\.logAjustes\]\);/);
    assert.equal((trecho.match(/mostrarResultadoConsolidarTudo\(/g) || []).length, 1);

    const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
    assert.match(dadosUi, /function mostrarResultadoConsolidarTudo\(resumo, log\) \{/);
    assert.match(dadosUi, /el\('textoConsolidarTudo'\)\.textContent = resumo;/);
    assert.match(dadosUi, /preencherListaDiagnostico\('listaConsolidarTudo', log\);/);
    assert.match(dadosUi, /if \(!el\('modalConsolidarTudo'\)\.open\) el\('modalConsolidarTudo'\)\.showModal\(\);/);

    const inicializacao = fs.readFileSync('js/bootstrap.js', 'utf8');
    assert.match(inicializacao, /el\('modalConsolidarTudo'\)\.addEventListener\('click', e => \{\s*\n\s*if \(e\.target == el\('modalConsolidarTudo'\)\) el\('modalConsolidarTudo'\)\.close\(\);\s*\n\s*\}\);/);

    const estilosForm = fs.readFileSync('css/forms.css', 'utf8');
    assert.match(estilosForm, /dialog#modalDiagnostico::backdrop,\s*\n\s*dialog#modalConsolidarTudo::backdrop \{\s*\n\s*background: rgba\(0, 0, 0, \.68\);/);
    assert.match(estilosForm, /dialog#modalDiagnostico,\s*\n\s*dialog#modalConsolidarTudo \{/);
    assert.match(estilosForm, /#listaConsolidarTudo \{\s*\n\s*color: var\(--mu\);\s*\n\s*\}/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /\*\*Consolidar tudo\*\* \(hoje parte do clique no botão verde \*\*Recarregar\*\* do cabeçalho\) repete essa mesma ação \(materializar\/consolidar\) em sequência, do ciclo atual até o último ciclo que tiver algum lançamento/);
    assert.match(regras, /o próprio botão fica desabilitado \(`disabled`, de verdade bloqueado pro navegador — mesmo esquema visual apagado do Salvar do cadastro e do Duplicar\/Editar\/Excluir da barra de seleção/);
    assert.match(regras, /e o ícone do Recarregar gira, com o title\/aria-label passando a "Recarregando…" e depois "Consolidando…", pra bloquear clique duplo/);
    assert.match(regras, /volta ao normal ao final, com sucesso ou falha/);
    assert.match(regras, /o clique no Recarregar também corrige toda recorrência duplicada nesse mesmo intervalo \(mesma regra do botão "↷" ao lado da Data/);
    assert.match(regras, /sem pedir confirmação por linha, já que o clique em "Consolidar tudo" é a confirmação da varredura inteira/);
    assert.match(regras, /Ciclos anteriores ao atual nunca entram nessa varredura\./);
    assert.match(regras, /a conclusão sempre aparece em toast contando quantos foram materializados, quantos foram consolidados e quantas datas de recorrência duplicada foram corrigidas/);
    assert.match(regras, /abre sozinho um modal \(`#modalConsolidarTudo`\) com o mesmo resumo e uma linha por ação de verdade executada/);
    assert.match(regras, /Quando a varredura não encontra nada a fazer, aparece só o toast \("Nenhum ciclo com Aporte sugerido, Resgate necessário, recorrência duplicada ou pra sempre pendente\."\), sem modal/);
    assert.match(regras, /Diferente do modal de diagnóstico de carga \(que só abre por escolha do usuário, pra não interromper a consulta\), este abre automaticamente porque é resposta direta a um clique explícito do próprio usuário/);
    assert.match(regras, /sem botão de fechar, mesmo padrão de clicar fora ou Esc/);
    assert.match(regras, /Não altera nem recalcula nada: só lê o que a varredura já gravou\./);
});

test('sempre recarrega do banco antes de varrer; carga com falha para tudo; simulação não recarrega', () => {
    const inicio = formulario.indexOf("async function consolidarTudo(botao, depoisDaCarga = () => {}, { silencioso = false } = {}) {");
    const trecho = formulario.slice(inicio, formulario.indexOf('\n}\n', inicio) + 3);
    assert.match(trecho, /if \(!Estado\.simulando\) \{\s*\n\s*etapa\('Recarregando…'\);\s*\n\s*if \(!\(await load\(\{ silencioso \}\)\)\) return;\s*\n\s*\}/);
    // A recarga vem antes de qualquer leitura de Estado.lancamentos pela varredura.
    assert.ok(trecho.indexOf('await load({ silencioso })') < trecho.indexOf('corrigeRecorrenciasDuplicadasNoIntervalo('));
    const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
    assert.match(dadosUi, /atualizarBotaoDiagnostico\(diagnosticoDeDados\);[\s\S]*?Estado\.gravacoesNaUltimaCarga = Math\.max\(Estado\.gravacoesNaUltimaCarga, gravacoesAteAqui\);\s*\n\s*return true;/);
    assert.match(dadosUi, /mostrarToast\('Não foi possível carregar', e\.message\);\s*\n\s*return false;/);
    assert.match(regras, /Antes de varrer, \*\*Consolidar tudo\*\* sempre recarrega os dados do banco/);
});

test('recarga automática a cada 5 min, só com a tela livre', () => {
    const inicializacao = fs.readFileSync('js/bootstrap.js', 'utf8');
    assert.match(inicializacao, /const INTERVALO_RECARGA_AUTOMATICA_MS = 5 \* 60 \* 1000;/);
    assert.match(inicializacao, /!document\.hidden && !Estado\.simulando &&/);
    assert.match(inicializacao, /!document\.querySelector\('dialog\[open\]'\) && !Estado\.selecionados\.size &&/);
    assert.match(inicializacao, /!document\.activeElement\?\.matches\?\.\('input, select, textarea'\) &&/);
    assert.match(inicializacao, /!el\('recarregar'\)\.disabled;/);
    assert.match(inicializacao, /if \(Date\.now\(\) - Estado\.ultimaCarga >= INTERVALO_RECARGA_AUTOMATICA_MS\) recarregarDados\(\);\s*\n\s*\}, 30 \* 1000\);/);
    assert.match(fs.readFileSync('js/data-ui.js', 'utf8'), /Estado\.ultimaCarga = Date\.now\(\);/);
    assert.match(regras, /Recarga automática: 5 minutos depois da última carga bem-sucedida/);
});
