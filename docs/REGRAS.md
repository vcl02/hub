# Regras dos lançamentos

Este arquivo é a referência de comportamento financeiro da aplicação. `AGENTS.md` explica o processo de manutenção; não substitui estas regras.

## Convenções gerais

### Valores, linhas reais e edição na tabela

- `fin.valor` é assinado: entradas são positivas e despesas são negativas.
  Relatórios podem exibir despesas como valor absoluto, mas os cálculos mantêm o sinal original.
  Resíduos menores que meio centavo são exibidos como `R$ 0,00`, sem sinal negativo, apenas na apresentação.
- Para um lançamento de verdade (nunca uma linha sintética/preview, que mantém as 3 cores normais), zero conta como negativo na aparência — tanto o "sem valor ainda" (`NULL` no banco, ex.: assinatura de preço variável, exibido como `R$ 0,00`) quanto um zero gravado de propósito: só estritamente positivo (`> 0`) pinta de verde; negativo ou zero ficam vermelhos (texto e botão de sinal com `−`), em qualquer tabela (Débito, Crédito, Backlog, detalhamento de categoria) — o estado "sem valor"/zero nunca deve parecer "positivo".
  Clicar no campo de Valor pra digitar um número novo segue a mesma regra: partindo de um lançamento que a tela já mostrava vermelho (negativo ou zero/nulo), confirmar sem usar o botão de sinal mantém negativo, nunca vira positivo por engano.
  Essa regra nunca se aplica a totais/somas (`corSoma`), que têm sua própria zona morta entre -R$ 50 e R$ 50.
  É só aparência: nada muda no cálculo nem no que é persistido até o usuário escolher um valor (ou um sinal) diferente.
- Na tabela, todo lançamento real editável mostra um botão +/− ao lado do Valor (mesmo ícone do cadastro) que inverte o sinal na hora — `UPDATE` imediato, sem precisar abrir o campo pra digitar.
  É o único jeito de trocar o sinal por ali: o campo de edição de Valor só edita a magnitude, mantendo o sinal atual (uma versão antiga embutida nesse campo não funcionava de verdade — perdia o foco e confirmava antes do clique no sinal terminar — e foi removida).
  Onde o botão aparece, o número mostra só a magnitude (`R$ 1.500,00`, sem o `-`): o sinal fica no botão e na cor, sem repetir; é só apresentação, o valor continua assinado.
  Sem botão (conta restrita, saldo do dia, totais), o `-` continua no número.
  Indisponível para a conta restrita e para linhas sintéticas/simuladas sem `id` real: nelas (fora da conta restrita) o botão aparece no mesmo lugar, só que desabilitado ("Somente leitura"), pra linha calculada ter o mesmo visual das reais sem permitir edição; a conta restrita continua sem botão nenhum.
- Nome, Categoria e Frequência também editam direto na tabela: clicar no próprio texto dessas colunas abre o campo (Nome e Categoria em texto livre; Frequência num `<select>` com as mesmas opções do cadastro — Mensal, Semanal, Quinzenal, Semestral, Anual, ou vazio pra "sem recorrência" — nunca texto livre, pra não gravar um valor que a geração de parcelas não reconheça).
  Categoria passa pela mesma normalização do cadastro (lista separada por vírgula, sem duplicar nem variar só por espaço/caixa/acento) antes do `UPDATE`.
  Clicar em qualquer outro ponto da linha continua apenas selecionando-a pra somar valores.
  Mesma disponibilidade do Valor/Data/Pago: só lançamento real, nunca pra conta restrita.
- Uma linha real possui `id` positivo e pode ser persistida.
  Linhas de fatura, saldo anterior, aporte/resgate sugerido e simulações são derivadas; nunca podem ser editadas ou excluídas diretamente no banco.
- "é investimento" e o ciclo de um lançamento seguem uma regra só (`ehCategoriaInvestimento` e `periodoDoLancamento` em `js/shared.js`), usada na carga, no cadastro, na edição, na materialização e na simulação: investimento é ter `Investimento` como uma das categorias (inclusive `Investimento, Reserva`); o ciclo é o da fatura no Crédito (mesmo sem data), o da data no Débito (inclusive antecipação) e o Backlog sem data nem fatura. Assim a linha aparece no mesmo ciclo e com a mesma classificação antes e depois de recarregar a página.

### Rede instável

- Rede instável (ex.: metrô): toda chamada ao Supabase — inclusive a renovação da sessão — tem limite de 12 s (`LIMITE_REQUISICAO_MS` em `js/supabase-api.js`), contando também a leitura da resposta; estourou ou a conexão caiu, vira erro e o botão/célula volta, nunca fica "Salvando…" pra sempre.
  Carga, `UPDATE` e `DELETE` são idempotentes e tentam sozinhos até 3 vezes (espera de 1 s e 2 s entre elas) só quando não houve resposta; erro HTTP (resposta de verdade, ex.: RLS) nunca é repetido.
  Numa repetição de `DELETE`, zero linhas removidas só conta como sucesso se a linha de fato não existir mais (a tentativa sem resposta pode ter excluído).
  `INSERT` nunca é repetido sozinho — sem resposta, pode já ter gravado e repetir duplicaria: a mensagem diz "sem confirmação: pode ter salvado. Recarregue e confira antes de repetir".

### Filtros globais, URL, Comparar e Backlog

- Não há filtros globais de Pago nem Origem.
  Tabelas e cálculos que usam `filtrarLancamentos()` consideram todos os lançamentos; o campo `pago` continua sendo dado financeiro usado apenas nas regras que o mencionam explicitamente.
  Visões especiais de acompanhamento seguem a própria base definida em cada regra.
- A URL usa `?ciclo=AAAA-MM` para um ciclo único real (De igual a Até) e `?ciclo=backlog` para o Backlog (De sozinho, Até fica desabilitado nesse modo).
  Ao abrir esse link, a tela restaura o ciclo (pelo início do mês) ou o Backlog.
  Na tela de login a URL nunca mostra `?ciclo`: o parâmetro sai da barra de endereço e o ciclo pedido fica guardado, aplicado uma vez depois de entrar; ao clicar em Sair, nada é guardado e o próximo login abre no ciclo atual.
  Trocar de ciclo único ou entrar/sair do Backlog empurra uma entrada no histórico do navegador, então Voltar/Avançar navegam entre os ciclos já visitados nesta sessão sem precisar reabrir o Supabase; qualquer outro redesenho que não muda o ciclo (filtro, seleção de linha, edição inline…) continua só substituindo a entrada atual, sem acumular histórico.
  Um `ciclo=backlog` não imposto quando a opção não existe no combo De (conta restrita nunca tem Backlog) mantém o ciclo padrão seguro, igual a um `AAAA-MM` sem ciclo correspondente.
  Comparação entre ciclos e filtros não entram na URL.
- Em Comparar, a escolha entre **Todas** e **Diferentes** é um ícone (sinal de diferente, ≠) no início do bloco de botões do cabeçalho, antes do Gráfico: cada clique alterna entre as duas, e ligado (só Diferentes) ele fica verde.
  Ele fica sempre visível, mas só funciona com exatamente dois ciclos: fora da comparação (um ciclo só ou Backlog) ou com três ou mais ciclos fica desativado (esmaecido), porque Diferentes só existe entre dois.
  A conta restrita não compara e não tem esse botão.
  O antigo seletor "Linhas" saiu da tela.
  A segunda mostra categorias com mudança confirmada e descarta falsos positivos causados pelo mesmo nome e categoria em meses-calendário distintos dentro de um único ciclo financeiro; o valor pode mudar entre as ocorrências e não faz parte dessa identidade.
  Se essas duas ocorrências deixarem o ciclo seguinte vazio e o mesmo nome e categoria reaparecerem no próximo, isso também é continuidade, não um novo começo ou item único.
  A categoria inteira só é retirada quando todos os nomes que sustentam a mudança são explicados por essa duplicidade; um único nome recorrente não esconde outros nomes que realmente começaram ou acabaram.
  As colunas dinâmicas usam os dois ciclos seguintes já existentes: **Acabou em <primeiro>** exige presença também no ciclo anterior ao primeiro, presença no primeiro e ausência no segundo e nos dois seguintes; assim, uma ocorrência isolada nunca vira encerramento ao mudar o intervalo.
  **Começou em <segundo>** exige ausência no primeiro e presença no segundo e nos dois seguintes; **Único em <segundo>** exige ausência no primeiro, presença só no segundo e ausência nos dois seguintes.
  Se não houver dois ciclos futuros, nenhuma classificação é afirmada.
  As exclusões próprias desta e das demais visões estão descritas em **Escopo e exclusões das visões**.
  O Total soma somente as linhas exibidas, portanto não tenta representar o saldo de caixa do ciclo.
- Não existe flag nem filtro Ativo. Lançamentos com data entram no ciclo correspondente; lançamentos sem data ficam no Backlog.

### Colunas Prio, Obs e Canal

- `fin.prio` guarda a prioridade de elevação do Backlog pra um ciclo: número livre preenchido pelo usuário, nunca calculado — 1 é o mais provável de entrar num ciclo em breve, quanto maior o número menos a chance (ex.: 999 para "sem pressa nenhuma").
  A coluna **Prio** só existe na tabela do Backlog (`colunasAtivas`) — não aparece em Débito nem Crédito, onde a linha já pertence a um ciclo e a prioridade perde o sentido.
  No Backlog ela vem antes de todas as outras colunas, inclusive Data, por ser o primeiro critério que importa ali.
  O Backlog ordena por essa coluna por padrão (menor primeiro); as demais tabelas continuam ordenando por Data, como sempre.
  Linha sem `prio` preenchida conta como a **menor** prioridade possível (fica depois de qualquer número, inclusive 999), nunca como zero.
  Igual às demais colunas livres (Nome, Categoria…), edita direto clicando no texto da célula, só pra lançamento real fora da conta restrita; não participa de nenhum cálculo financeiro.
- `fin.obs` (observação livre) e `fin.canal` (de onde a conta é paga/consultada, ex.: o link do site da concessionária ou a chave Pix) aparecem como colunas **Obs** e **Canal** em qualquer tabela, com a mesma edição inline das demais colunas livres (clicar no texto).
  A coluna Canal tem largura fixa: texto que não couber vira "…", mas a célula continua clicável por inteiro pra editar o texto completo (inclusive pra conta restrita ou linha não-real, que mostram o mesmo corte truncado sem o clique de edição).
  Sempre que Canal tiver algum valor, a célula ganha um ícone redondo de copiar o texto pra área de transferência ao lado — serve pra chave Pix, que não é um link pra abrir.
  Quando o valor também é uma URL `http(s)`, aparece um segundo ícone redondo de abrir link numa aba nova.
  Os dois ícones ficam sempre em evidência, nunca cortados pelo texto truncado (não fazem parte da caixa com overflow escondido); clicar em qualquer um deles nunca entra em modo de edição nem seleciona a linha, e funcionam mesmo na conta restrita/mobile, já que copiar ou abrir não altera dado nenhum.
  Nenhum dos dois campos participa de cálculo financeiro nem de nenhuma regra de negócio; são só anotações.

### Simulação

- Simulação existe somente em memória: não cria, atualiza ou exclui linhas no Supabase.
  Além de criar compras hipotéticas, permite editar ou ocultar qualquer lançamento selecionado apenas no array do navegador; os cálculos refletem isso até recarregar ou desativar o modo, quando a carga do banco restaura tudo.
  Desligar a simulação só sai do modo simulação depois que a recarga do banco der certo; se ela falhar (ex.: sem internet), a simulação continua — com os lançamentos simulados e o aviso "A simulação continua" —, em vez de uma tela "real" com lançamentos hipotéticos que um Materializar poderia gravar de verdade.

### PWA e título da página

- A PWA só guarda a casca estática da interface para instalação e contingência sem rede.
  Quando há conexão, o service worker busca a versão publicada antes de responder, atualizando a cópia local; dados, autenticação e operações do Supabase continuam dependentes de rede e nunca entram no cache.
  Os ícones instaláveis são PNGs nítidos de 192 e 512 px; o único SVG (`icons/fin-192.svg`) é o favicon.
- O título da página (aba do navegador) é só `.` — discreto; vazio faria o navegador mostrar a URL no lugar.
  O nome do app instalado continua vindo do manifest (`fin`).

### Nome e Categoria no cadastro

- No cadastro, Nome é texto livre.
  Enquanto digita, um combo alinhado sob o campo filtra nomes distintos já usados e exibe a categoria da ocorrência mais recente; ao escolher ou digitar um nome conhecido, a categoria é apenas sugerida e continua editável.
  Nome sem correspondência é aceito normalmente.
- Categorias são texto livre e podem ser múltiplas no mesmo lançamento, separadas por vírgula.
  O formulário sugere cada categoria individual; ao salvar, remove espaços extras e duplicatas sem diferenciar caixa ou acento.
  Relatórios financeiros mantêm o lançamento como uma única movimentação para não duplicar seu valor.

### Filtros por coluna e larguras das tabelas

- Nos filtros por coluna das tabelas, **Categoria** e **Nome** aceitam o prefixo `!` para inverter a busca: `!Comprometido` mostra somente linhas cuja célula não contenha esse texto, sem diferenciar caixa ou acento.
  Mais de um `!` encadeia exclusões em AND — `!Besteira!Assinatura` mostra só as linhas que não contêm nem uma nem a outra.
  `!` sozinho, ou com pedaços vazios (ex.: `!Besteira!`), não filtra por esse pedaço vazio; Frequência mantém a busca literal normal.
  Somente na tabela Débito, a exclusão de Categoria também recalcula o saldo cinza ao fim de cada dia — inclusive fatura e ajuste sintéticos derivados dessa base — sem alterar títulos, gráficos ou outros cálculos financeiros.
  Esse recorte parte da mesma base do saldo sem recorte (reais + Besteira/Isabella previstas) e calcula o guardado e o Aporte/Resgate de cada ciclo dentro do próprio recorte: um termo que não tira nenhuma linha deixa o saldo cinza igual ao sem filtro.
- Em qualquer coluna de texto, `|` funciona como OU: `Assinatura|Isabella` mostra linhas cuja célula contenha qualquer um dos termos, sem diferenciar caixa ou acento.
  `|` isolado ou com pedaços vazios (ex.: `Isabella|`) não filtra por esse pedaço vazio, igual ao `!` isolado de Categoria.
- Em qualquer coluna de texto (inclusive Categoria, Frequência, Obs e Canal), digitar exatamente `vazio` (sem diferenciar caixa ou acento, sozinho no campo — não combina com `!` nem `|`) mostra só as linhas sem nada preenchido naquela coluna: mesmo critério da célula "—" (`ehVazioTextual`), que também trata a string literal `null`/`undefined`/`n/a` gravada por engano como vazia.
- O filtro de **Valor** compara por proximidade (até 5 centavos), sem olhar o sinal.
  O sinal se escolhe por clique, no botão ao lado do campo — num quadradinho de largura fixa, alinhado exatamente na mesma coluna dos botões +/− das linhas, com o campo na mesma largura do número de baixo: cada clique avança **±** (todos) → **+** (só positivos) → **−** (só negativos) → **±**; não se digita mais `+`/`-` no campo.
  Zero não entra em positivos nem negativos.
  Linha de Investimento sugerido (`r._sug`) usa o mesmo valor que já aparece na célula.
  Os dois combinam (ex.: só negativos perto de R$ 150,00).
- As tabelas de lançamentos (Débito, Crédito, Backlog) têm colunas de largura fixa, que não mudam conforme o filtro (Reserva, Comprometido, Pra sempre, sinal, busca): Data, Valor, Pago, Reserva, Comprometido, Pra sempre, Prio e ID têm a largura do maior conteúdo possível (cabeçalho, botão de filtro ou célula); Nome, Categoria, Frequência, Obs e Canal dividem igualmente o espaço que sobra.
  **Nome** e **Obs** ficam numa linha só, cortados com "…" quando não cabem, e mostram o texto inteiro ao passar o mouse; no Nome, só o texto é cortado — as marcas ao lado (MP, ↳ Fat., ⚠ Resgatou tudo) ficam sempre inteiras; clicar continua editando o texto completo.
  Categoria e Frequência quebram linha dentro da própria coluna; Canal já era cortado com "…".
  Débito e Crédito ficam com as colunas alinhadas entre si.
  Abaixo de uma largura mínima, a tabela rola de lado em vez de espremer o texto.
- **ID** tem campo de busca exata: `4` acha só o lançamento de id 4 (nunca 14 ou 40); `|` aceita vários (`12|40`).
  Linhas calculadas também podem ser achadas pelo id delas (ex.: `-3`, Fatura Nubank).
- **Data** tem campo de busca como as colunas de texto: procura no que a célula mostra (`DD/MM/AAAA`), então `10/2026` acha outubro de 2026 e `15/10` o dia 15; aceita `|` (OU) e `vazio`.
- **Pago**, **Reserva**, **Comprometido** e **Pra sempre** filtram por clique, sem digitar, num botão na linha de filtros: cada clique avança **Todos** → marcado → não marcado → **Todos** (Pago: Pago → Aberto; Reserva: Reserva → Sem; Comprometido: Compr. → Sem; Pra sempre: Sempre → Com fim), com a cor do próprio estado quando ligado.
  Em Pago, linha sem status (`—`) não entra em Pago nem em Aberto; em Reserva/Comprometido/Pra sempre, ausência conta como não marcado.
  Como as outras buscas por coluna, são só visuais (não mudam saldo nem cálculos) e o botão Recarregar limpa todos.

### Cadastro: padrões, Frequência, Vezes e faturas

- Um cadastro novo abre com Crédito, Pago e Dividir parcelas marcados; todos continuam alternáveis pelo usuário antes de salvar.
  Duplicações preservam os valores do lançamento de origem.
  O título "Novo/Duplicar/Editar lançamento"/"Simular compra" (`#tituloNovo`) continua existindo e mudando conforme o modo (ver `abreModalNovo` em `js/form.js`), mas é só pra leitor de tela (`.srOnly`): a ação que abriu o modal já deixa claro o contexto, então o texto não aparece mais na tela, e por ser `position: absolute` não ocupa linha nem espaço nenhum no layout.
  Os quatro ícones Crédito/Pago/Reserva/Comprometido (`.fmChecks`) e o botão de fechar dividem a mesma linha, numa única fileira — o fechar fica à direita, separado dos outros quatro, e mantém a cor vermelha de ação destrutiva/saída, não um 5º ícone igual aos demais.
  A mensagem de erro/confirmação (`#erroNovo`) fica sem texto na maior parte do tempo; vazia, ela não reserva o espaço de uma linha de texto — o campo Categorias fica colado perto do botão Salvar, mesma distância de qualquer outro par de campos — e volta ao tamanho normal sozinha assim que ganha uma mensagem.
  No mobile, o modal ocupa a tela inteira e o formulário reparte a altura que sobra igualmente entre os campos, com Salvar encostado no fim do modal (só a margem interna) em vez de um vão vazio embaixo; a mensagem vazia sai do fluxo pra não ganhar uma fatia dessa sobra.
  Se o conteúdo não couber (tela baixa), o formulário só rola, sem espaço extra.
- No cadastro, **Frequência** vem antes de **Vezes**, e as duas são modos excludentes.
  **Com Frequência** (Mensal, Semanal…), Vezes fica desativado mostrando a contagem da série (ex.: "75x até 2032"; sem Data, "Escolha a data"): a pessoa informa só a 1ª ocorrência (a Data, obrigatória nesse modo, e no Crédito/antecipação só a 1ª fatura) e o cadastro gera uma ocorrência a cada período, da 1ª data até `DATA_LIMITE_RECORRENCIA` (31/12/2032, inclusive; em `js/domain.js`) — a 1ª sempre é gravada, mesmo se já passar do limite.
  No Crédito, a fatura de cada ocorrência é a 1ª fatura avançada pelo mesmo número de meses de calendário entre a 1ª data e a data da ocorrência (`faturaDaOcorrencia`, sempre a partir da 1ª, mantendo o dia de vencimento com o mesmo ajuste de fim de mês das datas) — funciona mesmo pra faturas que ainda não existem no banco.
  Dividir continua valendo e com o mesmo padrão de sempre (abre marcado no Crédito, desmarcado no Débito, sempre alternável): marcado, o valor digitado é dividido entre todas as ocorrências da série; desmarcado, se repete em cada uma.
  Frequência, Vezes, Dividir e Fatura têm posição fixa no cadastro (exceção pontual registrada em `docs/DECISOES.md`): Frequência ocupa a linha inteira, Vezes e Dividir ficam logo abaixo, e trocar Crédito ou Frequência só ativa/desativa campos, sem mudar a forma do formulário.
  Campo desativado pelo modo fica mais escuro que o painel, com texto apagado, borda tracejada e sem a setinha; a passagem entre ativo e desativado tem uma animação curta (só quando o estado muda de fato com o cadastro aberto, e nenhuma com movimento reduzido no sistema).
  Em Editar, Vezes e Dividir somem e a Frequência fica sozinha na linha.
  Depois de salvar, a Frequência volta a "sem recorrência" (e Vezes volta a ser editável, com o valor que tinha antes da Frequência), pra o próximo cadastro não gerar outra série sem a pessoa pedir.
  Sem valor, a série sai inteira com valor vazio em cada linha, pra preencher depois.
  **Sem Frequência**, Vezes é editável (compra parcelada comum) e cada parcela escolhe sua própria fatura; Vezes não muda mais a Frequência sozinho.
  Duplicar herda a Frequência do original — salvar um duplicado de algo Mensal gera a série inteira.
  Passar o mouse no rótulo Frequência resume essa regra num hover (`title`); não há botão nem modal de ajuda (o app é de uso pessoal: no máximo um hover).
  Os rótulos Frequência e Categorias apontam explicitamente pro próprio campo (`for=`): tocar no texto do rótulo foca o campo.
- Quando o campo Vezes (ou uma série de Frequência) cria mais de uma parcela numa única submissão (compra parcelada no Crédito, ou várias ocorrências futuras de um Débito recorrente), todas as parcelas do lote gravam o mesmo `recorrencia_id` (`fin.recorrencia_id`, coluna da migration 15).
  O `recorrencia_id` é **sempre sequencial**: o próximo número da sequência `fin_recorrencia_seq` (1, 2, 3…), obtido pela função `proxima_recorrencia()` (migration 28), nunca o id de um lançamento.
  Só o mantenedor obtém número novo; o pedido não é repetido sozinho, porque cada chamada consome um número.
  Quem grava série fora do app (DataGrip) usa `nextval('fin_recorrencia_seq')` pelo mesmo motivo.
  O lote inteiro entra num único `INSERT` (todas as linhas ou nenhuma, então sinal caindo no meio nunca deixa série pela metade); depois dele, o app pede o número e um único `UPDATE` em lote grava o `recorrencia_id` em todas.
  Se só o número ou esse `UPDATE` falhar, as linhas continuam salvas e o cadastro avisa "sem o vínculo de lote" na mensagem de sucesso, em vez de erro — erro faria a pessoa salvar de novo e duplicar a série; o vínculo é só uma marca, a tela não depende dele.
  Um lançamento único (Vezes = 1) nunca grava `recorrencia_id`, mesmo com Frequência marcada: a continuidade entre ocorrências cadastradas em momentos separados (ex: mês a mês via Duplicar) não usa essa coluna — quem identifica a mesma recorrência ao longo do tempo continua sendo nome + categoria (`chaveDaRecorrencia`), não este id.
- Compra no Crédito (ou antecipação de fatura) exige uma fatura explícita por parcela — sem inferência por fechamento, cada uma pode apontar pra um vencimento diferente.
  Sem Frequência, o cadastro gera um `<select>` de fatura por parcela (com Frequência, só o da 1ª — ver regra acima).
  O campo **Fatura** fica sempre visível, logo abaixo de Frequência/Vezes/Dividir, numa única linha: o seletor da 1ª parcela e um botão "+N" (`#fFaturasMais`, N = demais parcelas) que abre `#modalFaturasParcelas` com os seletores das parcelas 2..N; com uma parcela só, o "+N" fica invisível mas guarda o espaço, pra o seletor não mudar de largura.
  No Débito comum (fora antecipação), Fatura vira um seletor desativado "—", que nunca conta como fatura escolhida.
  Assim, com Vezes alto (compra em muitas prestações), o cadastro não estica no mobile e o botão Salvar continua à vista.
  Salvar com a fatura de alguma parcela 2..N em branco mostra o erro e abre esse modal direto.
- Reserva e Comprometido (`fin.reserva`/`fin.comprometido`, bits próprios desde a migration 22) têm checkbox próprio no cadastro, ao lado de Crédito/Pago — mas abrem **desmarcados** por padrão, diferente dos três de cima: são marcas raras, não o caso comum.
  Editar/Duplicar herdam os dois do lançamento de origem.
  Também aparecem como coluna própria em qualquer tabela (Débito, Crédito, Backlog), clicável igual ao badge Pago/Aberto — mas, por serem a exceção e não a regra, mostram apenas o rótulo (`Reserva`/`Comprometido`) quando marcados e "—" quando não, em vez de repetir um texto negativo em toda linha.
  O rótulo marcado tem cor própria, diferente do verde de Pago: **Comprometido em laranja escuro** e **Reserva em amarelo claro**, tons afastados pra não se confundirem (`COR_FLAG` em `js/tables.js`), em linhas reais, calculadas ou na conta restrita; o "—" fica neutro.
  Mesma disponibilidade das demais edições inline: só lançamento real, nunca na conta restrita.
  O cabeçalho das colunas traz, no tooltip, a pergunta que decide a marca: **Reserva** — "Se eu perder o emprego, preciso continuar pagando isso?"; **Comprometido** — "Começou o mês, isso já é obrigatório pagar?" (`PERGUNTA_DA_COLUNA` em `js/tables.js`, nas tabelas Débito, Crédito e Backlog).
  Reserva/Comprometido classificam o **compromisso**, identificado pelo **nome e pela categoria juntos**, não só a ocorrência clicada: marcar ou desmarcar pela tabela propaga pra todos os lançamentos com o mesmo nome **e** a mesma categoria (sem acento/caixa; a ordem das categorias não importa — `Lazer, Isabella` = `Isabella, Lazer`), reais ou simulados, em qualquer ciclo.
  Mesmo nome com outra categoria não muda (ex.: `Uber` de `Transporte` × `Uber` de `Besteira`).
  As linhas reais vão num único `UPDATE` (tudo ou nada: nunca metade do compromisso marcada se a rede cair), e a simulação é lida uma vez antes de gravar.
  Sem caixa de confirmação, o próprio clique já é a confirmação da varredura, igual ao "Consolidar tudo".
- **Pra sempre** (`fin.pra_sempre`, migration 31) separa a recorrência **sem data pra acabar** (assinatura, conta de consumo, data comemorativa) da que tem fim (parcelas, financiamento, dívida).
  Necessário porque o app gera as séries de Frequência só até `DATA_LIMITE_RECORRENCIA` (hoje 31/12/2032; até a migration 33, 31/12/2029): sem a marca, "sem fim" e "termina no limite" ficariam iguais.
  Quando o limite sobe, as séries marcadas são estendidas até o novo limite por migration (ver migration 33), a partir da ocorrência mais recente de cada uma.
  Segue exatamente o padrão de Reserva/Comprometido: checkbox próprio no cadastro (ícone de infinito, **desmarcado** por padrão), herdado por Editar/Duplicar, gravado em todas as ocorrências da série cadastrada; coluna própria nas tabelas Débito, Crédito e Backlog, que mostra `Pra sempre` em **azul** quando marcado e "—" quando não, clicável com a mesma propagação por **nome e categoria juntos**; filtro por clique; tooltip do cabeçalho "Isso se repete sem data pra acabar?".
  A conta restrita não vê a coluna, e linha calculada ou simulada só lê, como nas outras marcas.
  Enquanto o banco não tem a coluna (migration 31 não aplicada), o app não mostra a coluna nem o checkbox e não envia o campo — cadastro e toggle continuam funcionando.

### Editar pela barra de seleção

- Selecionando exatamente um lançamento real (ou simulado) — nunca um ajuste sintético (`sug:`/`res:`) nem uma linha de fatura (`fat:`) — a barra de seleção ganha **Editar**, ao lado de Duplicar/Excluir: abre o mesmo modal de cadastro, pré-preenchido com a própria linha, mas a confirmação faz `UPDATE` nela em vez de criar um lançamento novo (sem campo Vezes/Dividir, que só serve pra gerar parcelas novas — Editar é sempre uma única linha).
  O uso principal é transformar Débito em Crédito ou vice-versa sem excluir e recadastrar do zero: marcar Crédito exige escolher a fatura (mesmo seletor do cadastro, que lista qualquer vencimento já usado em algum lançamento, então funciona igual para um lançamento vindo do Backlog, sem data, ou de qualquer ciclo); desmarcar Crédito limpa a fatura da linha (`fatura: null`) e passa a classificar pelo campo Data, que decide o ciclo de Débito.
  Os demais campos (Nome, Categoria, Valor…) também ficam editáveis ali, mas cada um já tem edição mais rápida direto na célula da tabela.

### Diagnóstico da carga

- A carga valida o formato dos lançamentos de forma somente diagnóstica.
  O botão de diagnóstico fica neutro sem inconsistências e vermelho com ponto somente quando a última carga encontrar inconsistências; ele abre o modal detalhado.
  Esse modal não tem botão de fechar e pode ser fechado ao clicar no fundo ou usar Esc.
  No desktop, ele amplia proporcionalmente para avisos longos usarem a linha disponível; no mobile preserva a largura da tela.
  Avisos não acendem o ponto.
  Lentidão e falhas operacionais aparecem em toast no canto inferior direito.
  Nada é corrigido, descartado ou gravado automaticamente.
  O Console mantém apenas uma linha resumida de métricas por carga.
- As regras de diagnóstico ficam centralizadas em `validarLancamentosCarregados()` em `js/domain.js`: `inconsistencias` apontam contrato de dados inválido e `avisos` são sinais de revisão.
  Para criar uma regra personalizada, acrescente-a à lista adequada; o modal passa a refletir o resultado sem mudar o banco.
  Categoria preenchida que aparece em somente um lançamento carregado é apenas aviso suspeito e mostra nome e id da linha — e só quando esse lançamento é negativo (saída); com valor positivo ou zero, nunca avisa; diferenças apenas de espaço, caixa ou acento contam como a mesma categoria.
- Vencimento de fatura (`fatura`) repetido em mais de um dia dentro do mesmo mês-ano gera aviso, listando os dias e um lançamento de exemplo por dia; o mesmo cartão não fecha duas vezes no mesmo mês.
- As mensagens do diagnóstico de carga identificam o lançamento pelo **id** (o mesmo da coluna ID e do filtro de ID), com nome e data — ex.: `id 5251 — "Netflix", 10/12/2026: marcado como pago…` —, e mostram datas como DD/MM/AAAA.
  A posição do registro na lista carregada não aparece (não é campo do lançamento e muda a cada registro novo); só um registro sem id é apontado pela posição.
- Lançamento real marcado `pago = true` também gera aviso quando cai longe demais à frente, porque "Hoje" conta qualquer `pago = true` sem olhar a data (ver regra de Hoje/Futuro acima): no Débito, data no ciclo seguinte ao atual (ou além) já é cedo demais, pois esse bloco não tem prévia — é o sinal típico de uma recorrência que nasceu paga sem querer, já que o cadastro grava o mesmo `pago` em todas as parcelas, inclusive as futuras.
  No Crédito, `pago = true` é só "compra confirmada", não "fatura paga", e a prévia do ciclo atual já mostra por design os créditos da competência seguinte (N+1); por isso só vencimento de fatura **dois ciclos ou mais à frente** gera esse aviso, nunca o próximo ciclo sozinho.
  Também não avisa nas parcelas seguintes de uma compra parcelada (mesmo `recorrencia_id`) cuja 1ª fatura — a menor do lote — vence antes do ciclo N+2: é compra já feita, e o banco bloqueia o limite inteiro na hora; lançamento avulso ou lote que já começa dois ciclos à frente continua avisando.
  Nenhum lançamento é exceção: uma entrada já marcada como paga com data no início do próximo ciclo também gera o aviso.

### Badge Pago/Aberto

- Clicar no badge Pago/Aberto de um lançamento real de Débito (nunca Crédito, cujo `pago` é "compra confirmada" e não tem vencimento comparável) para MARCAR como pago (nunca ao desmarcar) compara a data gravada com hoje antes de aplicar a mudança: datas iguais seguem direto, sem nenhum ajuste.
  Datas diferentes mas dentro do MESMO ciclo, com a data gravada ainda no futuro, ajustam a data para hoje automaticamente, sem perguntar — é o caso de pagar adiantado algo já disponível mas com vencimento mais à frente no ciclo (ex.: a conta de água, paga logo no início do ciclo).
  Dentro do mesmo ciclo mas já no passado, ou em qualquer ciclo diferente do de hoje (incluindo um já encerrado), a data nunca é tocada; só no caso de ciclo diferente, a ação pede confirmação antes de marcar como pago — é o mesmo padrão da recorrência que nasce paga sem querer (regra acima), só que pego no momento do clique em vez de só depois, no diagnóstico.

### Toasts e confirmações

- Erros operacionais usam toast, sem interromper a tela com `alert()`.
  Cada toast tenta tocar um tom curto e baixo, sem arquivo externo; bloqueio de autoplay do navegador nunca impede o aviso visual.
  As únicas caixas nativas (`confirm()`) permitidas são: a confirmação antes de excluir um lançamento real ou simulado, porque essa ação não pode ser desfeita; a confirmação ao marcar como pago um Débito cuja data cai fora do ciclo atual (ver regra do badge Pago abaixo), porque é o mesmo padrão da recorrência que nasce paga sem querer; e a confirmação ao corrigir a data de uma recorrência duplicada no ciclo (ver regra logo abaixo) — nos três casos, por alterar dado real sem volta fácil.

### Recorrência duplicada no mesmo ciclo

- Quando a mesma recorrência (nome+categoria, igual à identidade usada em Comparar) tem 2+ lançamentos reais no MESMO ciclo com datas de meses-calendário diferentes — sintoma de a janela do ciclo ter cortado o mês ao meio, não uma despesa nova (ex.: Seguro Residencial perto do dia 5, com o ciclo terminando logo depois) — a tabela Débito marca com um botão "↷" ao lado da Data (mesma cor do asterisco `avisoDup` de Comparar) só a(s) ocorrência(s) cujo mês é diferente do da mais antiga do grupo; a mais antiga e as do mesmo mês dela ficam como estão.
  Só linha de série (com Frequência ou `recorrencia_id`) entra: compra avulsa repetida (ex.: Mercado em 15/10 e 03/11 no mesmo ciclo) é gasto de verdade nas duas datas e nunca é movida.
  Antecipação/pagamento de fatura nunca entra nessa detecção: é transferência, não recorrência, e duas antecipações de verdade no mesmo ciclo são dois pagamentos distintos por si só, nunca a mesma conta cortada pela janela do ciclo — mover a data mudaria quando o dinheiro de verdade saiu da conta.
  O botão "↷" e o lote de **Consolidar tudo** também nunca marcam um lançamento de valor positivo (entrada): é recebimento, não conta recorrente, então nunca é "a mesma conta cortada pela janela do ciclo".
  Essa exclusão de entrada é exclusiva do botão/lote; o asterisco `avisoDup` de Comparar, que usa a mesma detecção de meses duplicados por outro motivo, não é afetado.
  Um clique, com confirmação, move a `data` dessa linha pro 1º dia do PRÓXIMO ciclo (`UPDATE` real, pedindo confirmação porque altera dado); some sozinho se não houver próximo ciclo cadastrado ainda (não há pra onde mover) ou, depois do PATCH, porque deixou de haver duplicidade.
  Só pra linha real fora da conta restrita, mesma regra de edição das demais colunas.
  **Consolidar tudo** pelo clique no Recarregar (ver **Ciclos, saldo e gráficos**) aplica essa mesma correção em lote, em todos os ciclos varridos, sem confirmação por linha; a consolidação automática de 15 minutos não move datas.

### Excluir várias linhas

- No desktop, o botão Excluir da barra de seleção aceita quantas linhas reais estiverem marcadas, não só uma; linhas sintéticas misturadas na mesma seleção são ignoradas por essa ação, pois não existem no banco.
  A confirmação lista cada lançamento escolhido por nome e valor antes de prosseguir.
  Se algum selecionado for `_sim` (só desta simulação) e outro for real, a confirmação deixa claro que o simulado some ao recarregar enquanto o real é excluído sem volta; fora do modo simulação, isso não ocorre porque recarregar já descarta os simulados.

### Textos curtos

- Tooltips, rótulos auxiliares e descrições visíveis devem ser curtos; detalhes financeiros ficam nas telas e modais próprios, não no hover.

## Escopo e exclusões das visões

- **Comparar:** usa registros com ciclo válido e ainda inclui as linhas sintéticas `Saldo do mês anterior`, `Aporte sugerido` e `Resgate necessário`, salvo as exclusões abaixo.
  `Reserva` nunca é uma categoria nesta matriz: é um bit próprio (`fin.reserva`), sem relação com `categ`; um lançamento com `reserva = true` entra normalmente pela categoria que tiver (`Casa`, por exemplo), e só sai se não tiver nenhuma outra categoria junto.
  A linha inteira sai se sua categoria contiver uma destas categorias, mesmo combinada com outra: `Rendimento`, `Reembolso`, `Teste`, `Alimentação`, `Transporte`, `Besteira`, `Presente` (também aceita a grafia `Presemte`) ou `Saldo`.
  As três primeiras são entrada/compensação/dado técnico; as demais são recortes escolhidos para não participar dessa análise.
  Portanto, a linha sintética `Saldo do mês anterior` também sai.
  **Antecipação Fatura** sai se estiver no nome ou na categoria, mesmo em cadastro legado marcado como Crédito.
  Não há abatimento sintético de fatura na matriz.
  Essas exclusões são somente de Comparar; não mudam pizza, evolução, Visualizações, ciclos, saldo nem dados no banco.
- **Gráfico — pizza do ciclo:** usa somente despesas (`valor < 0`) de Débito do ciclo.
  Compras de Crédito nunca viram fatia individual; **Antecipação Fatura** também não vira fatia porque é transferência de pagamento.
  `Reserva` nunca cria fatia própria: é o bit `fin.reserva`, sem relação com a categoria do lançamento (`Casa`, por exemplo, continua criando sua fatia normalmente); um lançamento com `reserva = true` e nenhuma outra categoria não cria fatia nenhuma.
  Linhas sintéticas de aporte/resgate podem entrar como `Investimento`, pois representam o ajuste financeiro mostrado no ciclo.
  A pizza não possui exclusão especial para `Rendimento` ou `Reembolso`: se forem despesas de Débito e não forem transferências, seguem a regra geral e podem aparecer.
- **Gráfico — evolução ao comparar ciclos:** não usa compras de Crédito individualmente; transforma-as em uma única `Fatura do cartão` líquida das antecipações.
  Diferentemente da pizza, a antecipação real entra no mês em que foi paga, para representar a saída de caixa uma única vez.
  `Investimento` é separado em Aportado/Resgatado; os demais positivos formam Ganho e os demais negativos formam Gasto.
  Não há exclusão nominal de `Reserva`, `Rendimento` ou `Reembolso` nessa evolução.
- **Visualizações:** o seletor é fixo e contém somente: categoria contendo `Roberta`; e os nomes exatos `Entrada Econ`, `Evolução Obra`, `Financiamento Casa`, `Trybe`, `Senac`, `Seguro Residencial`, `Iphone`, `Pós` e `Banco do Brasil`.
  Comparações de nome ignoram caixa e acento, sem aceitar correspondência parcial.
  As opções permanecem disponíveis mesmo quitadas ou momentaneamente sem lançamentos.
  Nenhuma outra categoria ou nome é oferecida.

## Faturas

### Faturas no cadastro e na carga

- As faturas existentes são derivadas das datas `fatura` já usadas nos lançamentos; a aplicação não usa uma tabela `faturas`.
- Todo lançamento novo com `cred = true` deverá receber `fatura` escolhida manualmente.
  O total da fatura nunca é gravado: é a soma dos `fin.valor` ligados a ela.
- Ao cadastrar ou simular uma venda no crédito, a fatura sugerida é sempre a do mês seguinte à data de cada prestação, no dia de vencimento do cartão (compra em 05/10 ou em 30/10 → 12/11 no Nubank), mesmo que essa fatura ainda não exista nos lançamentos.
  O cartão é o da 1ª parcela escolhida à mão — Nubank enquanto nada foi escolhido.
  Trocar a 1ª parcela à mão refaz as sugestões das demais no novo cartão.
  No cadastro e no Duplicar a fatura fica presa à data: trocar a Data — digitando, no calendário ou pelo botão **Hoje** — refaz todas as faturas pelo mês seguinte, inclusive uma escolhida à mão (só o cartão dela é mantido); depois de acertar a data, qualquer seletor continua editável.
  Duplicar não copia a fatura do original: começa pela do mês seguinte à data, no Nubank, como um cadastro novo.
  Editar é a mesma linha: a fatura gravada nunca muda sozinha.
  O seletor lista as faturas que já existem nos lançamentos mais os vencimentos previstos dos dois cartões (dia 12 e dia 13), do mês passado até dezembro de 2032, cada uma com o nome do cartão (ex.: "13/11/2026 · Mercado Pago") — sem isso a 1ª compra num cartão ou mês ainda vazio não teria fatura pra escolher.
- `periodos` não é lida pela aplicação; a tabela já foi removida do banco (`migrations/07-drop-periodo.sql`).
  Os ciclos são as linhas de `fin_ciclo` (ver abaixo).

### Ciclos, competência e títulos Hoje/Futuro

- Os ciclos são as linhas de `fin_ciclo` (migration 26): cada uma tem `inicio` e `fim` próprios; `fim` vazio = ciclo aberto (o último), até o próximo ser criado.
  Nenhum lançamento define ciclo — os lançamentos `Faturamento PJ` são entradas comuns.
  Criar ou ajustar um ciclo é inserir/editar uma linha de `fin_ciclo` no DataGrip; o banco garante início obrigatório e único, `fim >= inicio` e nenhuma sobreposição entre ciclos.
  Um débito entra no ciclo que contém sua data e uma fatura no ciclo que contém seu `vencimento`; data num intervalo sem ciclo vai pro Backlog, e esse buraco aparece como aviso no diagnóstico de carga.
  Sem `fin_ciclo` nesse formato (migrations 25 e 26 não aplicadas), a carga para com a instrução do que aplicar.
- No modo Ciclo, o bloco Débito e seus cálculos continuam na competência atual.
  Somente a tabela Crédito é uma prévia visual: no ciclo N ela mostra os créditos da competência N+1.
- Os títulos de Débito e Crédito mostram duas linhas quando o ciclo selecionado já começou: **Hoje** é um retrato de caixa que usa somente registros reais com `pago = true`, qualquer que seja a data do lançamento — quem antecipa um pagamento não precisa ajustar a data antes, só marcar `pago`; a data pode ser corrigida depois, sem afetar esse retrato.
  **Futuro** mantém a projeção completa do ciclo, com pagos e abertos, sem olhar `pago`.
  No ciclo atual, cada bloco é avaliado separadamente: se os valores que ele mostra em Hoje e Futuro forem iguais — Saldo e Guardado no Débito; total líquido da fatura no Crédito — e não houver nenhum lançamento real aberto nesse bloco (no Débito, inclusive a fatura do cartão ainda pendente), Futuro some e apenas esse bloco inicia recolhido.
  A igualdade de valores sozinha nunca basta: um lançamento aberto pode compensar outro e zerar a diferença por coincidência, sem que o bloco esteja de fato quitado.
  A comparação admite somente a tolerância financeira de centavos e o usuário pode abrir o bloco para auditoria.
  Ao navegar para um ciclo ainda não iniciado, ambos mostram somente Futuro.
  Ciclos anteriores ao atual sempre ficam abertos e detalhados: navegar para o histórico, com Anterior ou selecionando o ciclo diretamente, nunca recolhe Débito nem Crédito — só o toggle manual do próprio usuário recolhe um bloco.
  Ao avançar novamente para o atual ou para qualquer ciclo futuro, ou usar Atual, ambos voltam abertos, inclusive se o usuário tinha recolhido algum manualmente.
  Em ciclo anterior ao atual, o Débito mantém somente uma linha rotulada **Passado** em vez de Hoje; ela não repete o retrato de agora (`debitoHoje`, que é o mesmo valor global não importa qual ciclo esteja aberto) — mostra Saldo e Guardado acumulados até o fechamento daquele ciclo específico, os mesmos números que apareceriam em Futuro se o ciclo ainda estivesse em andamento.
  O alerta de saldo vermelho do Débito, nesse caso, também olha esse total do ciclo, não o saldo de hoje.
  O Crédito volta ao título compacto com o total bruto da fatura, incluindo compras já pagas e sem descontar antecipações, sem o ponto separador entre Crédito e valor.
  Portanto, a linha inteira Futuro e o alerta de limite do Crédito não aparecem no histórico.
  A prévia de Crédito do ciclo atual mantém Hoje mesmo que sua fatura vença no próximo ciclo.
  No Débito, Saldo começa em `SALDO_DESDE` com saldo inicial zero e soma os débitos reais já ocorridos (inclui aporte/resgate, pois o dinheiro saiu ou voltou à conta); Guardado é essa parcela de Investimento separada.
  Registros anteriores a `SALDO_DESDE` e sugestões sintéticas nunca entram em Hoje.
  Os ícones de aviso de Débito e Crédito ficam à direita do próprio título, nunca após Saldo, Total ou Futuro.
  Todo título reserva esse espaço, com ou sem alerta: Débito acende se Hoje ou Futuro tiver Saldo vermelho (no Futuro, após a zona neutra de totais); Crédito acende se qualquer uma das duas faixas ultrapassar o teto utilizável, exceto em ciclo histórico.
  No Crédito, Hoje é a fatura líquida das compras confirmadas e antecipações já ocorridas, enquanto Futuro mantém a fatura líquida de compras pagas e abertas.

### Dois cartões e limites

- Dois cartões de crédito, sem coluna nova: o dia do vencimento da `fatura` decide o cartão (`cartaoDaFatura` em `js/shared.js`).
  Dia 13 é **Mercado Pago**; qualquer outro dia é **Nubank**, que fica com todo o histórico (vence dia 12).
  Crédito ou antecipação sem `fatura` é Nubank.
  Nomes e categorias não identificam cartão.
  Na tela continua existindo uma única tabela de Crédito por ciclo, com as compras dos dois cartões juntas e o total somado; compra (ou antecipação) do Mercado Pago ganha a marca **MP** ao lado do nome, e o Nubank fica sem marca.
  O bloco Crédito mostra só a quantidade de registros ("17 registros"), sem as datas das faturas.
  No Débito, a linha calculada de fatura vira uma por cartão — **Fatura Nubank** e **Fatura Mercado Pago**, cada uma no próprio vencimento e líquida das antecipações do próprio cartão —, e o saldo por dia e o gráfico de evolução seguem as mesmas duas linhas.
- O total no título dessa prévia de Crédito usa a mesma base e os mesmos abatimentos por antecipação da linha dinâmica da fatura; a tabela abaixo continua detalhando as compras brutas.
  Cada cartão tem o próprio limite livre, calculado só com as próprias compras e antecipações; o Mercado Pago só aparece no título depois da 1ª compra nele (antes disso o título fica igual ao de um cartão só) e, com dois cartões, cada faixa começa pelo nome do cartão.
- **Modal do cartão:** dois botões no cabeçalho, junto dos demais ícones — **Nubank** (cartão roxo) e **Mercado Pago** (cartão azul) — abrem um modal só daquele cartão no ciclo exibido, sem título visível (o desenho do cartão já diz qual é; o nome fica só para leitor de tela).
  No alto, o desenho do cartão no estilo do de verdade (Nubank roxo com os círculos da bandeira e o "nu" em traço fino; Mercado Pago grafite com "MER CADO PAGO" apagado na vertical e "VISA" em pé; logotipos simplificados), com a fatura em destaque no lugar do nome (a de Hoje; num ciclo futuro, a única) e o vencimento (o da fatura cadastrada; sem compra nela, o dia do cartão dentro do ciclo — 12 no Nubank, 13 no Mercado Pago).
  Abaixo, Hoje e Futuro com Fatura, Usado, Livre, a barra de uso do teto (vermelha acima do teto) e o que já foi antecipado.
  Depois, o teto com o Aprovado e o Garantido editáveis (mesma gravação por ciclo de antes) e as compras da fatura num botão em pílula que abre a lista (mais recente primeiro; aberta marcada como "aberto", prevista em itálico).
  Em Hoje e Futuro, o rótulo fica em cima e Fatura, Usado e Livre dividem a largura toda, cada um com o rótulo em cima do valor.
  Os números são os mesmos do título, calculados uma vez por desenho; com o modal aberto, uma gravação feita nele redesenha o modal junto.
  **Deslizar troca de fatura:** puxar o modal para a esquerda vai para a fatura seguinte e para a direita, para a anterior — no celular com o dedo; no desktop arrastando o cartão com o mouse, deslizando dois dedos no trackpad ou com as setas ← → do teclado (fora dos campos).
  É a mesma navegação do ‹ › do topo: o ciclo da tela anda junto, o modal é refeito com os números daquele ciclo e o cartão entra deslizando do lado certo; sem fatura para aquele lado (o Backlog nunca conta), o cartão só balança.
  Num ciclo passado, o modal mostra a fatura fechada: as compras brutas, o que foi pago/antecipado e o que restou, sem Hoje/Futuro nem barra de uso.
  Os botões ficam desativados em Comparar, no Backlog e quando o cartão não existe no título; a conta restrita não os vê.
  O alerta de limite acende se qualquer um dos dois estourar.
  O limite livre de cada cartão em **Hoje** retrata o cartão real: crédito com `pago = false` é projeção e não ocupa limite; crédito com `pago = true` ocupa; antecipação **já paga** alocada à mesma fatura libera somente o que ela abate, até zero; antecipação em aberto ainda não saiu da conta e não libera nada em Hoje (mesma base de pago do resto de Hoje), só em Futuro.
  Em **Futuro**, a fatura exibida inteira (paga e aberta, líquida das antecipações) é subtraída do teto; faturas anteriores são tratadas como quitadas e compras confirmadas de faturas posteriores também continuam consumindo limite.
  Portanto, o Livre Futuro é `Total − fatura exibida − uso confirmado posterior`; antecipação acima da fatura não cria limite extra.
- `LIMITE_CARTAO` é o limite contratado-base do Nubank, inicialmente **R$ 3.350,00** quando este navegador ainda não possui uma preferência salva.
  Depois de “de R$”, o título exibe o teto utilizável (contratado-base mais garantia positiva) apenas para consulta.
  Ao lado, o valor **Aprovado** é o campo discreto editável, com a mesma máscara monetária do cadastro; Enter ou sair dele grava o Aprovado do ciclo no Supabase (ver regra de limites por ciclo abaixo).
  A garantia fica ao lado como **Garantido**, sem um rótulo Total separado ou parênteses.
  No ciclo atual ela é exata; em qualquer ciclo passado ou futuro é arredondada visualmente para baixo à centena completa (R$ 1.344,25 aparece como R$ 1.300,00).
  Esse arredondamento não altera teto nem Livre, que usam a garantia exata.
  Aportes e resgates reais de `Investimento` **já pagos** até o ciclo definem essa garantia, independente de recortes visuais.
  `Aporte sugerido` não é dinheiro aplicado e não entra nela, nem o Aporte materializado ainda em aberto (a Nubank só garante o que está na caixinha); resgate pago reduz a garantia.
  A Liberdade financeira, que projeta ciclos futuros, continua contando os aportes/resgates reais abertos (planejados).
  Garantia negativa não reduz o limite contratado.
- O Aprovado de cada cartão e a Garantia do Nubank são definidos por ciclo, na própria linha do ciclo em `fin_ciclo` (colunas `limite_aprovado_nubank`, `limite_aprovado_mp`, `limite_garantia_nubank`), editáveis no modal de cada cartão (com um cartão só, também no título do Crédito) ou no DataGrip.
  Diferente dos tetos de Besteira/Isabella, eles herdam: o valor definido num ciclo vale para ele e para os seguintes até outro ciclo definir outro; campo vazio volta a herdar.
  Sem nenhum ciclo definindo, o Aprovado usa o padrão (`LIMITE_CARTAO`, que ainda lê a antiga preferência salva neste navegador, ou `LIMITE_CARTAO_MP`).
  Na garantia, a garantia usada é o valor escolhido, nunca acima do guardado real do ciclo; sem escolha, é todo o guardado positivo, como antes.
  O campo Garantido aparece quando há guardado ou uma escolha feita (zero inclusive).
  Vão para o banco, e não só para o navegador, para valer igual em qualquer aparelho.
- O Mercado Pago tem limite contratado próprio (`LIMITE_CARTAO_MP`, inicialmente **R$ 1.100,00**), editável no modal dele igual ao do Nubank, e nunca tem garantia: o teto dele é só o Aprovado.
  Quando o teto de um cartão é igual ao Aprovado (Mercado Pago sempre; Nubank sem garantia), o próprio campo editável fica depois de "de" ("Livre R$ 1.090,10 de R$ [1.100,00]"), sem repetir o mesmo valor nem o rótulo Aprovado.
  **No título**, com dois cartões, Hoje e Futuro ficam enxutos: a faixa **Total** completa — **Fatura** (a soma das duas), **Usado** e **Livre** do teto somado (com a garantia do Nubank) — e, de cada cartão, só o nome e a **Fatura** dele; Usado, Livre, teto, Aprovado e Garantido de cada um ficam no modal do cartão.
  Com um cartão só, a única faixa é completa: Fatura, Usado, Livre, teto e os campos de Aprovado/Garantido.
  Usado = teto − Livre: em Hoje, as compras confirmadas que ainda ocupam o cartão; em Futuro, a fatura exibida inteira mais o uso confirmado posterior.
  Hoje, a Fatura é só compras confirmadas menos as antecipações já pagas; em Futuro, a fatura exibida inteira (paga e aberta, líquida das antecipações). Não há valor solto no começo de Hoje/Futuro.
  As faixas ficam separadas por um divisor vertical; o nome de cada cartão tem cor própria (Total neutro, Nubank roxo, Mercado Pago azul), rótulos discretos, valores em negrito e o teto ("de R$ …") e a garantia em itálico.
  Cada valor fica colado no próprio rótulo ("Fatura R$ 54,48"), com o espaço que sobra depois dele e um respiro maior entre um par e o seguinte, pra nenhum valor parecer rótulo do próximo.
  Hoje e Futuro têm sempre os mesmos pedaços em cada faixa, pra ficarem alinhados coluna a coluna.
  O Aprovado editado (no modal do cartão ou, com um cartão só, no título) vai para o ciclo no Supabase (ver a regra de limites por ciclo acima); as preferências antigas deste navegador (`fin.limite-cartao` e `fin.limite-cartao.mp`) só são lidas como padrão enquanto nenhum ciclo define o Aprovado.
- Identificar o cartão pelo dia do vencimento é uma regra provisória (ver `docs/DECISOES.md`): só funciona enquanto os dois cartões vencerem em dias diferentes.
  Se um vencimento mudar para o dia do outro, ou entrar um terceiro cartão, o caminho é uma migration nova com identificação explícita de cartão em cada crédito e antecipação.

### Fatura da Isabella e antecipações

- Todo lançamento com `cred = true` aponta para `fatura`; a categoria `Isabella` não seleciona outro calendário de cartão.
- A fatura da Isabella é um lançamento real comum: `cred = false`, categoria `Isabella` (nunca entra no indicador `Isabella`, porque o nome ou a categoria têm `Fatura` — `ehGastoIsabella`, ver regra do teto em **Ciclos, saldo e gráficos**; o nome com "Fatura" basta, a 2ª categoria `Fatura` é opcional), valor negativo e `pago` indicando Aberto/Pago.
  Pode começar com um valor máximo estimado e receber `UPDATE` no mesmo lançamento quando o total fechar.
- A fatura da Isabella não é criada como linha sintética, não é calculada pela soma de compras e não participa da alocação de antecipações dos cartões.
- A categoria `Isabella` identifica esses lançamentos; ela não muda a interface conforme o e-mail da sessão.
- Antecipações de fatura abatem somente faturas do próprio cartão (o da `fatura` que elas apontam; sem `fatura`, Nubank), da mais antiga para a mais nova: antecipação do Mercado Pago maior que a fatura dele não transborda para o Nubank, e vice-versa.
  A antecipação com `fatura` abate exatamente a fatura daquele vencimento, cujo saldo é a soma das compras de crédito com esse mesmo vencimento — mesmo quando o ciclo tem dois vencimentos do mesmo cartão (ciclo longo) ou uma linha de débito ficou com uma `fatura` esquecida; antes, nesses casos, nada era abatido e o pagamento contava duas vezes no saldo.
  Abate no máximo o saldo daquela fatura, nunca transborda.

## Aportes e resgates

### Materializar e consolidar Aporte/Resgate

- Ao agir sobre um `Aporte sugerido` ou `Resgate necessário`, o aplicativo procura um lançamento real de `Aporte` ou `Resgate`, na categoria `Investimento`, **em aberto** (`pago = false`), dentro do mesmo ciclo; havendo mais de um, prefere o da data de fechamento do ciclo (o que o próprio app cria).
  Aporte/Resgate já **pago** é dinheiro que de fato se moveu e nunca é reescrito — nem pelo clique, nem pelo Consolidar tudo, nem pela consolidação automática de 15 minutos; marcar como pago o Aporte materializado tira ele da consolidação, e um ajuste posterior vira uma linha nova.
- Sem movimento real em aberto no ciclo, a ação materializa uma nova linha aberta.
  Com um em aberto, a ação passa a ser `Consolidar` e faz `UPDATE` nessa linha: valores do mesmo sentido somam e valores opostos se abatem.
- Só um Materializar/Consolidar grava por vez: enquanto o Consolidar tudo (clique ou automático) roda, o clique numa linha avisa "Há uma consolidação em andamento" e não grava; enquanto um clique grava, o Consolidar tudo pelo botão avisa e o automático espera o próximo intervalo — senão os dois leriam "sem Aporte no ciclo" e cada um inseriria o seu.
  A trava vale dentro da mesma aba; duas abas ou aparelhos ao mesmo tempo ainda podem duplicar (a carga antes de consolidar reduz essa janela).
  Se houver inversão de sinal, o nome passa a refletir o movimento que restou.
- Se o abatimento zerar o valor, a linha existente é mantida com valor zero; a ação não exclui lançamentos automaticamente.
- Aporte/Resgate é lançado na data de fechamento do ciclo.
  O último ciclo, aberto (fim vazio em `fin_ciclo`), usa um fechamento provisório — a véspera do mesmo dia do mês seguinte ao início (início 05/10 → 04/11) —, nunca a data técnica 31/12/9999; a linha calculada de Aporte sugerido/Resgate necessário, o subtítulo "início a fim" do Débito e de Comparar, Besteira/Isabella previstas, o vencimento de reserva de um ciclo sem fatura, o saldo por dia e o detalhe do gráfico de evolução usam a mesma data.
- O **guardado nunca fica negativo**.
  O `Resgate necessário` de um ciclo nunca passa do que havia guardado (o déficit que sobrar fica negativo no saldo do ciclo).
  Se os resgates **reais** do ciclo já levaram mais do que havia guardado, o ajuste do ciclo passa a ser um `Resgate necessário` **negativo**, que, ao materializar/consolidar (inclusive pelo Consolidar tudo), **diminui** o Resgate real até o guardado ficar exatamente zerado; se a sobra do ciclo for maior que esse rombo, vira um `Aporte sugerido` comum, que já o cobre.
  Nos dois casos em que o guardado acaba no ciclo — o resgate levou tudo ou foi diminuído pra caber —, a linha de resgate (calculada ou real) ganha o aviso laranja **⚠ Resgatou tudo**, e o resumo do Consolidar tudo diz "(todo o guardado)" ou "(resgate diminuído: o guardado não pode ficar negativo)".

### Recargas e consolidação automática

- **Recarga após gravar:** toda mudança real que o banco confirma — cadastro (`INSERT`), edição na tabela ou pelo modal, toggles de Pago/Reserva/Comprometido/sinal, data corrigida (`UPDATE`), exclusão (`DELETE`), tetos/Aprovado/Garantia do ciclo e o que o Consolidar tudo gravar — recarrega os dados da tela do banco automaticamente, em silêncio (sem toast), mantendo ciclo, filtros e seleção.
  Várias gravações seguidas viram uma só carga; se o próprio fluxo já recarregou depois de gravar, não repete.
  Espera a tela ficar livre — nenhum campo em edição, nenhum modal aberto, nenhuma carga ou Consolidar em andamento — pra não apagar o que está sendo digitado.
  Gravação sem resposta do banco (pode ter salvado) também recarrega, pra mostrar se entrou.
  Na simulação e na conta restrita nada é gravado, então nada recarrega por isso; uma gravação real que termina depois de ligar a simulação espera, porque a carga apagaria os lançamentos simulados — desligar a simulação já recarrega.
- **Recarga silenciosa** (automática de 5 min, após gravar, consolidação de 15 min) nunca redesenha por cima de uma célula da tabela em edição: os dados novos entram na memória e a tela espera o campo perder o foco pra redesenhar; se a própria edição já redesenhar ao confirmar, não redesenha de novo. Campo fora da tabela (ex.: cadastro) não segura o redesenho, e o clique no Recarregar redesenha na hora.
- Recarga automática: 5 minutos depois da última carga bem-sucedida, a tela busca os dados no banco de novo (só a carga — sem voltar ao ciclo atual, limpar filtros nem consolidar, que são só do clique no botão Recarregar), pra mostrar o que mudou em outro aparelho ou no DataGrip.
  Ela só acontece com a tela logada e visível, sem modal aberto, sem campo em edição, sem linha selecionada, sem simulação (apagaria os lançamentos simulados) e sem outra carga ou consolidação em andamento; ocupada, a tela tenta de novo a cada 30 segundos.
  É silenciosa: não mostra toast nem toca som (nem "Carga lenta", nem erro); se falhar, a tela continua com os dados que já tinha, em vez de virar a mensagem de erro, e a próxima verificação tenta de novo.
  O clique no botão Recarregar continua avisando normalmente.
- **Consolidação automática:** a cada 15 minutos (contados da última consolidação, automática ou pelo botão Recarregar; a primeira vem 15 minutos depois de abrir a tela), roda sozinho o **Consolidar tudo** — recarrega do banco e materializa/consolida Aporte sugerido/Resgate necessário, do ciclo atual em diante; mover data de recorrência duplicada fica só pro clique, por ser a parte mais invasiva —, nas mesmas condições de tela livre da recarga automática, e nunca na conta restrita.
  Diferente do clique no botão, não volta ao ciclo atual nem limpa os filtros.
  É silenciosa quando não há nada a fazer; quando grava algo, mostra só um toast ("Consolidado automaticamente"), sem o modal de detalhe; uma falha fica só no console e espera o próximo intervalo.
  Quando vence, ela substitui a recarga simples daquela verificação, pois já recarrega.
- **Consolidar tudo** (hoje parte do clique no botão verde **Recarregar** do cabeçalho) repete essa mesma ação (materializar/consolidar) em sequência, do ciclo atual até o último ciclo que tiver algum lançamento — sem precisar abrir ciclo por ciclo.
  Enquanto a varredura roda, o próprio botão fica desabilitado (`disabled`, de verdade bloqueado pro navegador — mesmo esquema visual apagado do Salvar do cadastro e do Duplicar/Editar/Excluir da barra de seleção, não só o `disabled` nativo sem estilo) e o ícone do Recarregar gira, com o title/aria-label passando a "Recarregando…" e depois "Consolidando…", pra bloquear clique duplo e deixar claro que já está processando; volta ao normal ao final, com sucesso ou falha.
  Antes disso, o clique no Recarregar também corrige toda recorrência duplicada nesse mesmo intervalo (mesma regra do botão "↷" ao lado da Data, ver **Ciclos, saldo e gráficos**), pra que os ajustes materializados/consolidados em seguida já reflitam as datas certas — sem pedir confirmação por linha, já que o clique em "Consolidar tudo" é a confirmação da varredura inteira.
  Cada ciclo é resolvido na ordem (do atual pra frente) porque materializar o ajuste de um ciclo muda o guardado disponível do próximo; ciclos sem `Aporte sugerido` nem `Resgate necessário` são pulados sem gerar nada.
  Ciclos anteriores ao atual nunca entram nessa varredura.
  Como a maioria dos ciclos varridos não fica visível na tela (só o ciclo aberto é renderizado), a conclusão sempre aparece em toast contando quantos foram materializados, quantos foram consolidados e quantas datas de recorrência duplicada foram corrigidas, ou avisando que não havia nenhum pendente — e, junto, abre sozinho um modal (`#modalConsolidarTudo`) com o mesmo resumo e uma linha por ação de verdade executada (ciclo, tipo — Aporte/Resgate materializado ou consolidado, valor; ou recorrência duplicada movida, nome, data antiga e nova), pra dar contexto do que aconteceu em ciclos que não estão na tela.
  Quando a varredura não encontra nada a fazer, aparece só o toast ("Nenhum ciclo com Aporte sugerido, Resgate necessário ou recorrência duplicada pendente."), sem modal: não há detalhe a mostrar.
  Diferente do modal de diagnóstico de carga (que só abre por escolha do usuário, pra não interromper a consulta), este abre automaticamente porque é resposta direta a um clique explícito do próprio usuário — sem botão de fechar, mesmo padrão de clicar fora ou Esc.
  Não altera nem recalcula nada: só lê o que a varredura já gravou.
  Antes de varrer, **Consolidar tudo** sempre recarrega os dados do banco (a mesma carga do botão recarregar), porque grava em cima do que lê e não pode partir de uma tela desatualizada (outro aparelho, DataGrip, aba aberta há horas); se a carga falhar, nada é consolidado.
  Na simulação não recarrega, porque isso apagaria os lançamentos simulados, que só existem na memória.

## Ciclos, saldo e gráficos

- Cada ciclo vai do `inicio` ao `fim` da sua linha em `fin_ciclo` (fim vazio = aberto). Lançamentos sem data ou sem ciclo válido ficam no Backlog.
- O saldo de um ciclo carrega o saldo anterior, os débitos e a fatura líquida.
  Antecipação/pagamento de fatura é saída real de conta na sua própria data e entra no saldo diário; ao mesmo tempo reduz a fatura futura, que representa somente o restante a pagar.
  Assim a saída de caixa aparece uma vez, sem criar segunda despesa nas análises de gasto.
- Se houver déficit, o `Resgate necessário` é limitado ao patrimônio disponível.
  Se houver excedente, o `Aporte sugerido` absorve o excedente.
  Ambos são linhas sintéticas até serem materializados/consolidados pelo usuário.
- No título Débito de qualquer ciclo (atual, seguintes e passados), as linhas Hoje/Futuro — ou Passado, num ciclo já encerrado — mostram um indicador por categoria de limite, bem separado de Saldo/Guardado e um do outro por um divisor: a porcentagem gasta daquela categoria contra o teto fixo dela.
  Hoje conta só o que já está `pago`; Futuro conta pago + aberto, isto é, o que está planejado gastar no ciclo inteiro.
  O cálculo soma o Débito do próprio ciclo (`periodoIdx == i`) com o Crédito da MESMA prévia que a tabela Crédito já mostra pra esse ciclo (`creditosExibidosNoCiclo`, fatura de `i+1`): um ciclo que começa em outubro conta, no Crédito, o que vai entrar na fatura de novembro — igual à regra geral de Crédito ("no ciclo N ela mostra os créditos da competência N+1"), nunca pela data da compra nem pelo `periodoIdx` cru do lançamento de Crédito.
  Mesma regra de despesa das demais leituras de orçamento (`dadosCompromissosDoCiclo`): só `valor < 0`, exclui antecipação de fatura, valor absoluto.
  A cor do percentual segue a folga: verde até 70%, laranja de 70% a 100% e vermelho acima do teto (`corDoLimiteCategoria` em `js/charts.js`).
  Ao lado do percentual, cada indicador mostra também quanto ainda cabe no teto ou, se já passou, quanto está acima — calculado com o mesmo valor da linha (Hoje: só pago; Futuro: pago + aberto).
  Para não confundir o rótulo de um número com o do outro, cada número vem com o próprio rótulo depois dele: `Besteira 74% Usado · R$ 64,02 Livre de R$ 250,00`.
  Acima do teto, o percentual passa a ser o quanto ultrapassou (127% do teto → 27%): `Isabella 27% Ultrapassado · R$ 13,41 Acima dos R$ 50,00`; sem teto (zero), o percentual fica `—`.
  Hoje existem dois indicadores, cada um com seu próprio teto fixo em código (`js/domain.js`, não editável pela tela): `Besteira` (cafés, milkshakes, lanches/doces, Uber não essencial — feitos **sozinho**) contra `LIMITE_BESTEIRA`, R$ 250; e o rótulo `Isabella` contra `LIMITE_ISABELLA`, R$ 700 (`ehGastoIsabella` em `js/charts.js`).
  A categoria `Besteira Isabella` (antigo par do `Besteira` solo) foi descontinuada e substituída por `Lazer`+`Isabella`; não há mais rastro dela em código — um lançamento antigo ainda taggeado assim precisa ser corrigido pela edição inline de Categoria pra voltar a contar em algum teto.
  `Besteira` também é comparada como **item inteiro** da lista de categorias (sem acento/caixa): `Besteira` e `Lazer, Besteira` contam; `Besteira Isabella` ou `Besteiras` não.
  Convenção de categorização: todo lançamento com a categoria `Isabella` (comparada como item inteiro da lista de categorias) conta pro teto dela — junto com `Lazer` (sair com ela, lanches, estacionamento, ingresso, Uber compartilhado, cover…, o valor inteiro da conta, sem dividir) ou sozinha (presente, mimo).
  Ficam de fora a fatura do cartão dela — lançamento com `Fatura` na categoria ou no nome, que é a conta mensal inteira do cartão — e todo lançamento marcado **Comprometido** (parcelas e compromissos fixos, como Iphone e Senac): o teto mede o gasto variável com ela.
  `Lazer` sozinho nunca conta, pois pode ser lazer com qualquer outra pessoa; a antiga categoria `Besteira Isabella` também não (não é o item `Isabella`).
  Besteira (café, milkshake, lanche sozinho) é só o teto `Besteira` — nunca combina com `Isabella`.
  Do ciclo atual em diante, Besteira e Isabella contam como se o teto do ciclo fosse gasto por inteiro: cada ciclo ganha compras sintéticas **no Crédito, em aberto** — **Besteira prevista** (categoria `Besteira`) e **Isabella prevista** (categoria `Lazer, Isabella`) — com o que falta até 100% do teto: teto menos o já lançado (pago ou aberto, na mesma base do indicador: débitos do ciclo + créditos da prévia), nunca negativo; se o ciclo já passou do teto, não há compra prevista.
  Elas caem no Nubank, na fatura do ciclo seguinte (o 1º dia 12 dentro dele) — a mesma prévia que a tabela Crédito do ciclo já mostra —, com data no fechamento do ciclo.
  Por isso aparecem na tabela Crédito, entram na fatura (e por ela no Débito, no saldo do ciclo da fatura, no saldo por dia, no Aporte sugerido/Resgate necessário — inclusive o que o Consolidar tudo materializa —, em Comparar e no gráfico de evolução) e no Livre **Futuro** do cartão; por estarem em aberto, nunca ocupam o limite de **Hoje**.
  Fazem parte da base de todos os cálculos e tabelas (`lancamentosComPrevistas`/`filtrarLancamentos`), montada uma vez por desenho, e o indicador de Besteira/Isabella as ignora (seriam sempre 100%).
  Mostram Frequência **Mensal**, Pago **Aberto**, **Comprometido** e **Pra sempre**, assim como as linhas calculadas Fatura Nubank/Fatura Mercado Pago do Débito — é só exibição: nenhum cálculo lê esses campos das linhas calculadas (o indicador Comprometido usa só lançamentos reais e `pra_sempre` não entra em conta nenhuma), e toda linha calculada é somente leitura, inclusive a célula Pago; Comprometido e Pra sempre aparecem na mesma cor das linhas reais e entram no filtro por clique dessas colunas.
  Na coluna ID cada uma tem o seu: Fatura Nubank −3, Fatura Mercado Pago −4, Besteira prevista −6, Isabella prevista −7.
  Não existem no banco: não podem ser editadas, duplicadas nem excluídas.
  Ciclos passados não ganham previsão, nem o último ciclo aberto (sem ciclo seguinte pra fatura cair).
  O teto de cada ciclo é individual: o indicador aparece no título do Débito de cada ciclo — inclusive dos passados, na linha Passado, com o total daquele ciclo (pago + aberto), como o Saldo e o Guardado dessa linha —, com o teto editável ao lado ("de R$ […]", mesmo esquema do Aprovado do cartão).
  O valor é gravado na linha daquele ciclo em `fin_ciclo` (`limite_besteira`/`limite_isabella`) — vai pro banco, e não só pro navegador, porque muda o saldo e precisa ser igual em qualquer aparelho; campo vazio volta ao padrão do código.
  Também dá pra editar direto no DataGrip (tabela `fin_ciclo`).
  A conta restrita só vê o teto, sem campo.
  Passar o mouse no nome **Besteira** ou **Isabella** do indicador mostra o que entra naquele teto (`DESCRICAO_LIMITE_CATEGORIA` em `js/domain.js`); o nome tem sublinhado pontilhado discreto pra indicar a dica.
  **Clicar no nome** é um toggle de filtro: as tabelas Débito e Crédito do ciclo exibido passam a mostrar só o que conta naquele teto — pela mesma regra do indicador (`contaNoTeto`: gasto negativo, sem antecipação/pagamento de fatura, Besteira como item inteiro, Isabella por `ehGastoIsabella`) e sem as linhas previstas, que o indicador também ignora; somando o que sobra dá o Usado de Futuro.
  O nome ligado fica em verde, como os outros controles ativos; clicar de novo mostra tudo e clicar no outro troca de teto.
  O filtro soma-se às buscas por coluna, vale em qualquer ciclo navegado (Hoje, Futuro e Passado mostram o mesmo toggle), reabre os blocos Débito/Crédito se estiverem recolhidos, só lê (funciona também na simulação) e sai com o clique no Recarregar; Backlog e Comparar não mudam.
  A conta restrita não tem os indicadores, então também não tem o filtro.
  Passar o mouse no rótulo Categorias do cadastro resume esse guia num hover (`title`), sem botão nem modal de ajuda.
- A pizza de gastos usa o ciclo inteiro conforme seu escopo próprio descrito em **Escopo e exclusões das visões**.
  As demais categorias separadas por vírgula ficam selecionáveis individualmente; `*` vermelho indica classificação compartilhada e aparece primeiro no seletor.
  O dropdown alterna entre Selecionar tudo e Desmarcar tudo.
  Selecionar uma ou mais delas recorta o lançamento, mas nunca duplica seu valor na pizza.
  A pizza e sua legenda exibem somente fatias de ao menos 2% do total atualmente selecionado; categorias menores continuam no seletor e aparecem quando isoladas.
  `Contabilidade` (`CATEGORIA_EXCLUIDA_GRAFICO_PADRAO` em `js/domain.js`) já abre desmarcada por padrão — é custo intrínseco ao próprio faturamento PJ, não um gasto discricionário, então a pizza mostra direto o líquido; continua reincluível ali mesmo, no seletor.
  Fechar e abrir o modal restaura esse padrão (só `Contabilidade` fora, as demais categorias de volta); clicar numa fatia abre seu detalhamento de lançamentos no modal próprio.

## Visualizações de acompanhamento

- **Visualizações** é um ícone (olho) no bloco de botões do cabeçalho, logo depois do Gráfico; o clique abre um menu próprio logo abaixo dele (cartão escuro com cantos arredondados, separado do ícone — não a lista nativa do navegador, que abria colada), que fecha ao escolher, ao clicar fora ou com Esc e aceita as setas do teclado, com os acompanhamentos fixos descritos em **Escopo e exclusões das visões**.
  Escolher uma opção abre o detalhe imediatamente, sem modal intermediário ou botão de confirmação; `×` encerra o detalhe.
  A ordem das opções não é fixa: a cada redesenho elas são reordenadas do mais próximo de acabar (maior percentual pago) pro mais longe, para quem falta pouco aparecer sempre no topo.
- Toda visualização usa a mesma regra: considera apenas as despesas negativas pagas e abertas, usa valor absoluto e compara pago, pendente e total.
  Ela usa a relação inteira escolhida, independente do ciclo da barra.

## Mobile

### Paridade e barra de filtros

- O mobile tem paridade total com o desktop: mesmas colunas (`colunasAtivas()` não recorta mais nada; a rolagem horizontal própria de `.wrap` já resolvia telas estreitas), mesma edição inline (Valor, Data, Pago, Nome, Categoria e Frequência por toque), mesmo Editar/Duplicar/Excluir na barra de seleção, mesmo Crédito, Comparar, Visualizações, gráficos, Consolidar tudo, simulação e cadastro.
  Nenhuma dessas ações é reduzida por tamanho de tela.
- A barra de filtros (`.tool`: Linhas) fica sempre visível, em qualquer largura — sem menu pra abrir/fechar.

### Títulos em faixas

- Nas faixas **Hoje** e **Futuro** (ou Passado) dos títulos de Débito e Crédito, cada item fica exatamente embaixo do correspondente da outra faixa: cada item, e cada valor ou rótulo variável dentro dele (`Usado`/`Ultrapassado`, `Livre`/`Acima`), ocupa a largura do maior entre as faixas, com números de largura uniforme e alinhados à direita.
  Esse alinhamento é refeito quando a largura da janela muda.
  Com a tela estreita, um item que não cabe na linha desce inteiro; se nem sozinho couber, quebra só entre seus pedaços — Besteira/Isabella em `nome % Usado/Ultrapassado`, `· valor Livre/Acima` e `de/dos teto`; o Total (e o único cartão) em `nome`, `Fatura valor`, `Usado valor`, `Livre valor`, `de teto`, `Aprovado` e `Garantido` —, nunca no meio de um valor ou separando "de" do teto.
  O divisor vertical entre itens nunca aparece no começo de uma linha.
  Os valores também têm tamanho fixo: todo valor em reais nas faixas reserva a largura de `-R$ 99.999,99` e todo percentual a de `100%`, então a faixa não muda de largura quando os números mudam (outro ciclo, um lançamento novo).
  Quando só uma faixa do Crédito abre com o valor da fatura, a outra reserva esse lugar vazio.
  Só alinha quando as faixas têm a mesma estrutura.
- Nos blocos com título em faixas (Débito e Crédito), "N registros · período" fica encaixado no fim da faixa **Futuro**, à direita, em vez de ocupar uma linha própria entre o título e a tabela; sem a faixa Futuro (ciclo quitado, ciclo passado), vai no fim da única faixa.
  Blocos de título compacto (Crédito histórico, Backlog, Comparar) mantêm a linha própria.
  Sem período a mostrar (Backlog e Crédito histórico), a quantidade vai em cinza e menor, sem parênteses, logo depois do valor no próprio título (`Backlog · R$ 0,00 40 registros`), sem linha própria.
- A tabela Débito começa logo abaixo do cabeçalho, sem linha divisória nem espaço reservado: a barra de filtros (`.tool`) não tem mais nenhum filtro visível e não ocupa espaço, e a linha de status vazia não reserva altura.

### Cabeçalho e controles

- Os seletores **De** e **Até** mostram cada ciclo pelo mês abreviado (`Out/26`, mês do início do ciclo), com o nome completo (`Outubro 2026`) no tooltip da opção.
  Os dois ficam lado a lado, sem texto ou traço entre eles (`Out/26` `Nov/26`).
- O cabeçalho (navegação De/Até, simulação, cadastro, recarregar, diagnóstico, sair) é o mesmo em qualquer largura; quando não cabe numa linha só, quebra para a seguinte.
  Os botões (cartões Nubank e Mercado Pago, Todas/Diferentes, Gráfico, Visualizações, simulação, cadastro, recarregar, diagnóstico, sair, nessa ordem) formam um bloco só, à direita — a navegação de ciclo fica só com setas e De/Até: quando não cabem, descem **juntos** pra linha seguinte, nunca separados, e lá ficam alinhados **à esquerda**.
  Só no celular, quando o bloco não cabe nem sozinho na largura da tela, ele quebra entre os botões, também alinhado à esquerda.
  A navegação de ciclo (setas, De/Até) ganha sua própria linha e encolhe/quebra internamente em vez de estourar a tela.
  O botão verde **Recarregar** do cabeçalho (mesmo ícone de setas) faz, num só clique e nesta ordem: recarrega os dados do banco, volta De/Até ao ciclo atual, limpa os filtros — buscas por coluna, filtro de teto (Besteira/Isabella), Linhas, ordenação, blocos recolhidos, seleção e categorias excluídas do gráfico —, devolvendo a tela ao estado em que ela abre, e roda o **Consolidar tudo** (ver **Aportes e resgates**).
  Não existem mais botões "Atual", "Limpar filtros" nem "Consolidar tudo" separados.
  Enquanto roda, o ícone gira e fica desabilitado.
  Se a recarga falhar, para ali: não navega nem consolida em cima de dado desatualizado.
  Sem ciclo atual (hoje fora de qualquer ciclo), recarrega e limpa os filtros, sem consolidar.
  Na simulação não recarrega (apagaria os lançamentos simulados): volta ao ciclo atual, limpa e consolida só na memória.
  A conta restrita não tem esse botão.
  Como o clique pode gravar (materializar Aporte sugerido/Resgate necessário e mover recorrência duplicada), ele é a confirmação dessa varredura; a recarga automática de 5 minutos só lê, e a consolidação automática de 15 minutos (ver **Aportes e resgates**) grava o mesmo que o Consolidar tudo, sem navegar nem limpar filtros.
- O botão **Simular** (lançamentos provisórios) é sempre laranja — ícone, borda e fundo suave —, assim como o **Recarregar** é sempre verde; ligado (simulação ativa) ou com o mouse em cima, fica preenchido de laranja com o ícone escuro.
- Todo controle desativado (botão, seletor ou campo) mostra, ao passar o mouse, o cursor de bloqueado (círculo cortado) em **vermelho**, além do visual esmaecido próprio de cada um.

## Login

- O campo de login aceita **usuário** ou e-mail: `victor` e `isabella` são traduzidos para o e-mail de cada conta (`EMAIL_POR_USUARIO`/`emailDoLogin` em `js/app-state.js`); texto com `@` é usado como e-mail, direto.
  O Supabase continua autenticando por e-mail e senha — nada muda no Auth, na sessão nem no RLS (que usa `auth.uid()`).
  Usuário desconhecido nem chega ao Supabase e recebe a mesma mensagem de senha errada (`Usuário ou senha inválidos.`), sem revelar quais usuários existem.

## Conta restrita (Isabella)

- Existe uma única conta com a interface restrita, identificada pelo e-mail da sessão (`EMAIL_ISABELLA`, checado por `modoRestrito()` em `js/app-state.js`) — não por tamanho de tela.
  `modoSimples()` é sinônimo de `modoRestrito()`: em qualquer dispositivo, essa conta sempre vê a casca simplificada.
- Essa conta só vê o bloco Débito (sem Crédito), e só navega entre o ciclo atual e o próximo (sem Backlog, sem ciclos mais antigos ou mais distantes, sem Comparar por intervalo — `atualizarCombos()` em `js/data-ui.js` nem oferece essas opções nos seletores).
- A interface fica somente leitura: tabelas sem edição inline, sem Editar/Duplicar/Excluir/Materializar na barra de seleção (só soma e Limpar), sem cadastro de novo lançamento (`#abreNovo` escondido) e sem simulação (`#toggleSimulacao` escondido).
  Tocar uma linha ainda seleciona/desmarca pra somar valores — isso não grava nada.
- Os indicadores financeiros (`#rowVis` inteiro), Gráfico, Visualizações, os indicadores de teto **Besteira**/**Isabella** nas faixas Hoje/Futuro do Débito, o botão de **diagnóstico** e o botão **Recarregar** ficam escondidos; não há filtro por coluna nas tabelas.
  As tabelas dessa conta não têm as colunas **ID**, **Reserva**, **Comprometido** e **Pra sempre**.
  Dados novos chegam só pela recarga automática de 5 minutos (que nunca consolida nessa conta).
- A casca somente leitura é só a interface; a garantia real vem do RLS de `fin` (migration 20): somente o mantenedor grava — `INSERT`, `UPDATE` e `DELETE` exigem o `auth.uid()` dele —, qualquer outra conta logada (inclusive a restrita) apenas lê e o papel anônimo não tem nenhum acesso.
  Uma escrita negada volta vazia ou com erro e a tela mostra o toast de falha, sem fingir sucesso.
  O DataGrip usa o papel dono do banco e não passa pelo RLS.
- A categoria textual `Isabella` (fatura detalhada do cartão, ver "Faturas") é um conceito totalmente diferente: continua sendo só uma categoria em lançamentos, sem relação com a conta/e-mail restrita.

## Migrations

- O mantenedor aplica as migrations no DataGrip, que parte o script em cada `;`; da 28 em diante elas não usam `do $$`, função com `;` no corpo nem `;` em comentário, e rodam numa transação com pré-requisitos conferidos (formato e motivos em `docs/DECISOES.md`, "Migrations no DataGrip").
  Se um script abortar no meio, a sessão do DataGrip fica com a transação abortada até um `rollback;`; mudanças de sequência feitas antes do erro não voltam.
- Aplicadas e conferidas por `SELECT` até a 35 (17/10/2026); o histórico do que deu errado nelas está em `docs/DECISOES.md`, "Histórico de problemas e correções".
- `migrations/00-esquema-existente.sql` registra o esquema anterior e não deve ser executado no projeto `fin` existente.
- `migrations/01-nao-volatil-lancamentos.sql` e `migrations/02-volatil-lancamentos.sql` permanecem somente como histórico das alterações já aplicadas.
- `migrations/03-remover-fatura-isabella-periodos.sql` registra a remoção de `periodos.fecha_isa` e `periodos.venc_isa`.
  Ela é idempotente porque essas colunas podem já ter sido removidas diretamente no banco.
- `migrations/04-remover-volatil-lancamentos.sql` remove definitivamente a flag `volatil`, ausente da tabela atual `fin`.
  O aplicativo não exibe, filtra, grava nem atualiza essa flag.
- `migrations/05-faturas-db-first.sql` registra o modelo anterior de `faturas`; as migrations 10 e 11 o substituem pela coluna atual `fin.fatura`, sem tabela de faturas.
  Nenhum valor de fatura é calculado ou armazenado no banco.
- `migrations/06-exigir-fatura-no-credito.sql` registra a validação original que mantinha crédito e débito coerentes com a fatura escolhida; a constraint caiu junto quando `fatura_id` foi removida na migration 10 e só foi restaurada, na coluna atual, pela migration 21.
- `migrations/07-drop-periodo.sql` remove a tabela legada `periodos`; os ciclos passaram a ser derivados dos lançamentos `Faturamento PJ` (até a migration 26, que os move para `fin_ciclo`).
- `migrations/08-antecipacao-com-fatura-id.sql` é só registro de mudança de comportamento (sem DDL): antecipação de fatura passa a ser um débito que também pode referenciar a fatura que está abatendo.
- `migrations/09-drop-referencia-faturas.sql` remove a coluna `referencia` da antiga tabela `faturas`, histórico de um modelo já substituído pelas migrations 10 e 11.
- `migrations/13-renomear-lancamentos-para-fin.sql` renomeia a tabela técnica `public.lancamentos` para `public.fin` sem copiar ou alterar registros; nomes antigos permanecem apenas no histórico das migrations e no vocabulário financeiro.
- `migrations/14-renomear-colunas-fin.sql` renomeia `fin.fatura_venc` para `fin.fatura` e `fin.reserva_emergencia` para `fin.reserva`, preservando todos os valores e recarregando o cache de schema da API.
- `migrations/15-recorrencia.sql` adiciona `fin.recorrencia_id` e a sequência usada para identificadores de recorrência.
- `migrations/16-classificacoes-em-categorias.sql` preserva valores `isa` e `reserva` verdadeiros nas categorias `Isabella` e `Reserva emergência`, remove essas flags e também remove `ativo`.
- `migrations/17-normalizar-categoria-reserva.sql` normaliza a categoria criada pela migration 16 para o nome já adotado no banco: `Reserva`.
- `migrations/20-rls-somente-dono-escreve.sql` troca as policies de `fin` para que somente o mantenedor grava (pelo `auth.uid()`), contas logadas só leiam e `anon` perca todos os grants; também retira a execução pública de `rls_auto_enable()` e remove as sobras `fn_diferenca_ciclos` e `btree_gist`.
  Coberta por `node --test tests/rls-somente-dono.test.js`.
- `migrations/21-restaurar-fatura-exigida-credito.sql` recria em `fin.fatura` a constraint perdida da migration 06: todo `cred = true` exige fatura preenchida; um débito só pode preencher fatura quando a categoria identifica antecipação de fatura.
  Coberta por `node --test tests/fatura-exigida-credito.test.js`.
- `migrations/22-reserva-comprometido-colunas-bool.sql` adiciona `fin.reserva` e `fin.comprometido` (bool, `not null default false`) e, numa única `UPDATE`, preenche os dois a partir dos tokens exatos `Reserva`/`Comprometido` em `categ`, removendo-os do texto.
  Reversão deliberada do sentido da migration 16 só para estas duas marcas — as demais categorias (`Isabella`, `Fatura`, etc.) continuam como texto.
  O app lê os dois bits direto (`r.reserva`, `r.comprometido`), nunca mais por substring em `categ`.
- `migrations/23-limites-categoria-por-ciclo.sql` adiciona `fin.limite_besteira` e `fin.limite_isabella` (numeric, nulas, não negativas).
  Só têm efeito na linha âncora `Faturamento PJ` de cada ciclo: guardam o teto de Besteira e de Isabella daquele ciclo; nulo usa o padrão do código.
  Não cria tabela, policy nem grant — o RLS da migration 20 já cobre as colunas novas.
- `migrations/24-aprovado-garantia-por-ciclo.sql` adiciona `fin.limite_aprovado_nubank`, `fin.limite_aprovado_mp` e `fin.limite_garantia_nubank` (numeric, nulas, não negativas), também só com efeito na linha âncora `Faturamento PJ` de cada ciclo.
  Nulo herda do ciclo anterior mais próximo que tiver valor.
  Sem tabela, policy ou grant novos.
- `migrations/25-tabela-fin-ciclo.sql` cria `public.fin_ciclo`: uma linha por ciclo, com `ancora_id` (PK, FK para o `fin.id` do `Faturamento PJ` que abre o ciclo, `on delete cascade`) e as cinco escolhas por ciclo (`limite_besteira`, `limite_isabella`, `limite_aprovado_nubank`, `limite_aprovado_mp`, `limite_garantia_nubank`; nulas, não negativas).
  Só guarda escolhas: uso de limite, garantia efetiva e gasto do ciclo continuam calculados pelo app.
  Migra com segurança qualquer estado: sem as colunas das migrations 23/24, só cria a tabela; com elas, copia os valores das linhas `Faturamento PJ` e só então remove as cinco colunas de `fin`; se alguma outra linha tiver valor nelas (só por edição manual), aborta a transação inteira sem alterar nada.
  Acesso igual ao de `fin` (migration 20): RLS ligado, `anon` sem grant, leitura para contas logadas e escrita só pelo uid do mantenedor.
  O app grava por upsert (`on_conflict=ancora_id`) e, se a tabela não existir, carrega normalmente com os padrões e um aviso no diagnóstico.
  As migrations 23 e 24 ficam só como histórico.
- `migrations/26-ciclo-com-inicio-e-fim.sql` faz de cada linha de `fin_ciclo` o próprio ciclo: adiciona `inicio`/`fim` e um `id` próprio, e remove o vínculo `ancora_id`.
  Converte exatamente os ciclos que o app calculava: um por `Faturamento PJ` com data (débito), `inicio` = data dele, `fim` = véspera do próximo, o último com `fim` vazio; linhas que já existiam (com limites) são mantidas e só ganham as datas.
  Aborta a transação inteira, sem alterar nada, se a 25 não estiver aplicada, se houver dois `Faturamento PJ` na mesma data ou se alguma linha de `fin_ciclo` apontar para outro tipo de lançamento.
  Depois dela o banco exige `inicio` único e não nulo, `fim >= inicio` e nenhuma sobreposição (`exclude using gist` sobre o intervalo de datas, sem extensão).
  Os lançamentos `Faturamento PJ` continuam em `fin`, intactos.
- `migrations/27-historico-de-mudancas.sql` cria `public.fin_historico`: todo `INSERT`, `UPDATE` e `DELETE` em `fin` e em `fin_ciclo` grava uma linha com tabela, operação, id da linha, quem fez (`auth.uid()`; vazio quando veio do DataGrip), quando, e a linha inteira antes e depois (`jsonb`).
  `UPDATE` que não muda nada não é registrado.
  Só o trigger escreve (função `SECURITY DEFINER`, sem execução pela API); nenhuma conta insere, altera ou apaga o histórico pela API, só o mantenedor lê e o anônimo não acessa.
  Não altera nenhuma linha de `fin` nem de `fin_ciclo` e não muda nada no app; serve pra achar e desfazer à mão, no DataGrip, uma mudança errada (ex.: `select * from fin_historico where tabela = 'fin' and linha_id = 5251 order by em desc`).
- `migrations/28-recorrencia-sequencial.sql` alinha `fin_recorrencia_seq` ao maior `recorrencia_id` já gravado (nunca volta atrás) e cria `public.proxima_recorrencia()`, que devolve o próximo número da sequência só para o mantenedor (outra conta logada recebe vazio e não consome número; o anônimo nem executa).
  Não altera nenhuma linha de `fin`.
- `migrations/29-marcar-series-sem-recorrencia.sql` dá `freq` e um `recorrencia_id` novo (da sequência, na ordem da 1ª ocorrência) às séries cadastradas sem os dois: mesmo nome + categoria + `cred`, só entre linhas com data, sem `freq` e sem `recorrencia_id`.
  **Mensal**: 3 ou mais, exatamente uma por mês, em meses seguidos (o dia pode variar); **Anual**: 2 ou mais, uma por ano, no mesmo mês, em anos seguidos.
  No Crédito o valor precisa ser sempre igual (parcela/assinatura), pra compras avulsas que caíram uma vez por mês por acaso ficarem de fora; no Débito o valor pode variar.
  Nunca entram Investimento (Aporte/Resgate), antecipação/pagamento de fatura e Ajuste.
  As duas são escritas sem `;` dentro de bloco `$$` (o DataGrip parte o script em cada `;` e quebrava função/`do` no meio).
  A 29 exige a 28 (aborta sem alterar nada se ela faltar), não toca linha que já tem `freq` ou `recorrencia_id` (rodar de novo não muda nada) e lista ao final as séries marcadas; o histórico (migration 27) guarda o antes de cada linha.
- `migrations/30-renumerar-recorrencias.sql` renumera `recorrencia_id` de 1 em diante, sem buracos, mantendo a ordem (o menor vira 1, o seguinte 2…) e os lotes juntos, e põe `fin_recorrencia_seq` no último número, pra o próximo lote continuar a contagem.
  Trava gravações em `fin` durante a transação (rodar com o app fechado), não muda saldo nem tela (o número é só marca de lote) e rodar de novo não muda nada; o histórico (migration 27) guarda o número antigo.
  O `setval` dela volta a sequência de propósito e, como toda mudança de sequência no PostgreSQL, não é desfeito por `rollback`: se a transação abortar depois dele, rode o script inteiro de novo (ele recalcula o mesmo número).
- `migrations/31-pra-sempre.sql` cria `fin.pra_sempre` (bool, não nulo, falso por padrão) e marca como pra sempre todo grupo de mesmo nome + categoria que tem Frequência e cuja última ocorrência cai em dez/2029 (o limite de geração).
  Fica de fora o que vai além (ex.: dívida até 2031), o que acaba antes, grupo sem Frequência e Investimento, antecipação/pagamento de fatura e Ajuste; rodar de novo não muda nada e o fim lista os grupos marcados.
  Esse critério deixou de fora as séries Anual/Semestral cujo dia não cai em dezembro (aniversários, Páscoa, Contadora…), corrigidas pela migration 32.
- `migrations/32-pra-sempre-por-frequencia.sql` marca pra sempre, pelo critério por frequência, todo grupo (mesmo nome + categoria, com Frequência, mesmas exclusões da 31) que chegou ao limite antigo: a próxima ocorrência depois da última já cairia depois de 31/12/2029 (Mensal +1 mês, Semanal +7 dias, Quinzenal +14, Semestral +6 meses, Anual +1 ano, pela Frequência da ocorrência mais recente que tem uma).
  Só liga a marca, exige as migrations 27 e 31 (aborta sem alterar nada sem elas), rodar de novo não muda nada e o fim lista os grupos marcados.
- `migrations/33-estender-pra-sempre-ate-2032.sql` gera, pra cada grupo pra sempre, as ocorrências que faltam depois da última até 31/12/2032.
  O modelo é a ocorrência mais recente do grupo; as novas andam a partir da data dele pela Frequência (meses contados sempre do modelo, então dia 31 vira o último dia do mês curto e volta ao 31; Semanal/Quinzenal em 7/14 dias) e copiam nome, categoria, valor, Crédito, Frequência, lote, canal, prio, Reserva, Comprometido e pra sempre; nascem em aberto e sem obs.
  No Crédito, a fatura anda com a data pela mesma regra do cadastro (a do modelo mais os meses de calendário entre as datas); modelo sem lote ganha o próximo número da sequência.
  Exige as migrations 27, 28 e 31; rodar de novo não cria nada; o fim lista quantas linhas cada grupo ganhou.
- `migrations/34-ciclos-ate-2032.sql` cria os ciclos de jan/2030 a dez/2032 em `fin_ciclo`, no padrão dos atuais: cada um começa na data do Faturamento PJ daquele mês e termina na véspera do seguinte; o ciclo aberto de hoje ganha fim na véspera do 1º novo e o de dez/2032 fica aberto.
  Antes, o Faturamento PJ gerado que cai em sábado, domingo ou 7 de setembro passa pro próximo dia útil (outros feriados e os dias 8 avulsos ficam pro DataGrip).
  Os cinco limites de cada ciclo novo copiam os do último ciclo existente, porque os tetos de Besteira/Isabella não herdam; rodar de novo não cria nada.
  Rodar depois da 33: sem os Faturamento PJ de 2030 em diante, não há de onde tirar os inícios.
- `migrations/35-antecipacao-sem-frequencia.sql` tira a Frequência das antecipações/pagamentos de fatura e Ajustes sem lote (cinco "Antecipação Fatura (Final)" de 2026 estavam como Mensal) e remove o default `'Mensal'` de `fin.freq`, que dava Frequência a toda linha inserida pelo DataGrip sem preencher a coluna; o app sempre envia `freq`, então nada muda na tela.

## Testes

- Os estilos são carregados em camadas por `css/base.css`, `css/dashboard.css`, `css/forms.css`, `css/charts.css`, `css/utilities.css` e `css/mobile.css`; o responsivo permanece por último para preservar a cascata.
  A estrutura é coberta por `node --test tests/estrutura-estilos.test.js`.
- A estrutura em arquivos clássicos carrega `js/app-state.js`, `js/domain.js`, `js/shared.js`, `js/supabase-api.js`, `js/finance.js`, `js/data-ui.js`, `js/tables.js`, `js/cycle-views.js`, `js/interactions.js`, `js/charts.js`, `js/form.js` e `js/bootstrap.js` nessa ordem.
  Estado/configuração, validação de domínio, utilitários, Supabase, cálculos financeiros, carregamento, tabelas, visões, comandos, gráficos, formulário e inicialização ficam em módulos próprios.
  A separação é coberta por `node --test tests/estrutura-modulos.test.js`.
- A carga de `fin` percorre todos os lotes permitidos pela API do Supabase, sempre em ordem crescente de `id`.
  O limite máximo de uma resposta não pode truncar silenciosamente lançamentos novos nem alterar ciclos, saldos ou classificações do Comparar.
- O preenchimento sugerido das faturas em vendas simuladas é coberto por `node --test tests/faturas-simulacao.test.js`.
- A consolidação de aporte/resgate no mesmo ciclo é coberta por `node --test tests/materializacao-ajuste.test.js`.
- A meta de reserva emergência, calculada para os nove ciclos seguintes com valores previstos e estimados, é coberta por `node --test tests/meta-reserva-emergencia.test.js`.
- A substituição das flags por categorias é coberta por `node --test tests/reserva-emergencia-interacao.test.js`.
- O deslocamento visual de uma competência na tabela Crédito é coberto por `node --test tests/layout-creditos.test.js`.
- Datas, recorrências, normalização de texto e alocação de antecipações são cobertas por `node --test tests/shared-regras.test.js`.
- Aporte/resgate, saldo-base, saldo diário com exclusão de categoria e total de Crédito são cobertos por `node --test tests/finance-regras.test.js`.
- Máscara monetária, calculadora e divisão exata de parcelas são cobertas por `node --test tests/form-regras.test.js`.
- A combinação dos filtros de tabelas é coberta por `node --test tests/tabelas-filtros.test.js`.
- O padrão de cabeçalhos explicativos em código, estilos, migrations, testes e regiões dinâmicas do HTML é coberto por `node --test tests/documentacao-estrutura.test.js`.
- O vocabulário financeiro e a validação não destrutiva da carga são cobertos por `node --test tests/domain-validacao.test.js`.
- A separação entre modal de inconsistências, toast operacional e resumo único de métricas no Console é coberta por `node --test tests/diagnosticos-interface.test.js`.
- `.editorconfig` padroniza edição futura, e `node scripts/check.mjs` bloqueia tabs, espaços finais e arquivos sem newline final; o contrato é coberto por `node --test tests/estilo-editorconfig.test.js`.
- A suíte inteira deve rodar com `node --test tests/*.test.js`. Ela é local e não cria lançamentos de teste nem valida uma sessão real do Supabase.

## Reserva emergência

- `fin.reserva` é um bit próprio (não mais texto dentro de `categ` — ver migration 22) usado pela meta; pode coexistir com qualquer categoria no mesmo lançamento, sem nenhuma relação com ela.

### Indicadores do cabeçalho e Gráfico

- **Gráfico** (ícone de barras) é botão só de ícone, com o nome no `title` e `aria-label`, no mesmo tamanho dos botões de navegação de ciclo, no bloco de botões à direita do cabeçalho, junto dos demais.
  O botão **Gráfico** é fixo: abre a pizza no ciclo único e a evolução ao comparar vários ciclos.
  No começo da barra de indicadores, **Reserva:** é um texto calculado pelo ciclo escolhido em **Até** (no ciclo único, De e Até são iguais), não um botão.
  Os indicadores ficam no cabeçalho, na mesma linha da navegação de ciclo e dos botões de ação (entre os dois), em fluxo: **Reserva**, **Comprometido**, **Gastos** e **Liberdade** ficam numa linha quando cabem; quando não, os que não couberem quebram pra linha de baixo, cada um inteiro (nunca cortado no meio).
  Nenhum tem linha própria fixa.
  A variação de Reserva e de Comprometido vem num selo discreto (fundo levemente mais claro, cantos arredondados) colado logo depois do próprio indicador, no mesmo item (ex.: `Reserva: 3,4% da meta` `↑2,2 p.p. · ↑R$ 900,00`), pra nunca parecer de outro indicador ao quebrar a linha.
  Quando a janela é estreita demais pra caber ao lado da navegação e dos botões nem o maior indicador (até 1250px de largura, e no mobile), o bloco desce pra uma linha própria logo abaixo deles, que continuam juntos em cima.
  Cada indicador tem um **olho** antes: aberto mostra o indicador; fechado deixa só o olho fechado e o nome (ex.: `Reserva`), e um clique alterna.
  Ao abrir a página e ao mudar a largura da janela, os olhos abrem na ordem Reserva, Comprometido, Gastos, Liberdade enquanto couberem sem quebrar a linha; o primeiro que não couber e os seguintes começam fechados.
  Assim, no desktop todos começam abertos e, conforme a tela estreita, vão fechando a partir da Liberdade; no celular, em geral, todos começam fechados.
  O que o usuário clicar prevalece sobre esse ajuste até recarregar a página.
  É só apresentação, sem gravar nada.
  Os itens são separados por um divisor vertical (`|`), que nunca aparece no começo de uma linha; nenhum usa negrito: a cor é o único sinal de estado.
  Cada percentual ocupa seis caracteres de largura fixa — inclusive `100,0%` — para não deslocar os textos quando seu valor muda.
  **Gastos:** mostra a proporção das despesas reais negativas do ciclo marcadas com o bit `reserva` e a proporção complementar **Demais**; Débito e Crédito entram uma vez cada, categoria composta continua sendo uma única despesa e antecipação/pagamento de fatura fica fora por ser transferência.
  Seu tooltip traz os valores absolutos.
  Como Reserva é patrimônio, não padrão de consumo, a cor é o inverso de Comprometido: até 40% dos gastos em Reserva é verde, acima de 40% até 50% é âmbar e acima de 50% é vermelho; portanto mais **Demais** é melhor.
  **Liberdade:** é uma leitura sem cor de objetivo de longo prazo: divide o patrimônio realmente investido que exceder a meta atual de Reserva pela meta de liberdade.
  Essa meta é a média dos últimos doze ciclos disponíveis de despesas negativas reais, incluindo Débito e Crédito uma vez cada, menos investimento, antecipação/pagamento de fatura e categorias `Reembolso` ou `Rendimento`; o gasto mensal médio é anualizado e dividido pela taxa fixa de retirada de **3,5% ao ano**.
  O tooltip informa capital livre, meta, média e quantidade de ciclos.
  No selo depois de Reserva e de Comprometido, a seta mostra a variação em pontos percentuais e em reais contra o ciclo imediatamente anterior: para Reserva, o valor real é o Guardado; subir é verde e cair é vermelho; sem mudança fica neutra.
  A variação só aparece quando ambos os ciclos possuem meta válida.
  A meta soma os gastos negativos dessa categoria nos nove ciclos a partir dessa referência, respeitando os demais filtros e excluindo transferências de pagamento/antecipação de fatura.
  Para cada nome, um valor cadastrado em um ciclo substitui o anterior; se não houver ocorrência cadastrada naquele ciclo, mantém-se o último valor conhecido como estimativa.
  O texto mostra o percentual já guardado: fica vermelho abaixo de 50%, âmbar de 50% a menos de 100% e verde ao completar a meta; o título curto contém os valores e a referência de nove meses.
- **Comprometido** é outro texto calculado pelo ciclo em **Até**, ao lado de Reserva e também oculto no Backlog e no modo simples.
  Ele soma todos os lançamentos reais negativos, de Débito e Crédito, marcados com o bit `fin.comprometido` (coluna própria, não mais texto em `categ` — ver migration 22), exceto antecipação/pagamento de fatura por ser transferência.
  O denominador é toda entrada positiva do ciclo (o que ele ganhou), exceto resgate de investimento (dinheiro guardado voltando) e transferências de fatura; nenhum lançamento é procurado pelo nome.
  O texto mostra quanto do mês já está comprometido antes de ele começar: verde até **40%** do faturamento, âmbar acima disso até o teto único de **50%**, e vermelho quando o ultrapassa.
  Na segunda linha, sua seta compara pontos percentuais e o total comprometido em reais com o ciclo imediatamente anterior; cair é verde, subir é vermelho e estabilidade é neutra.
  A variação só aparece quando os dois ciclos possuem faturamento válido.
  O título curto contém gasto, faturamento e teto.
- O valor guardado da pizza usa `guardadoAte(ciclo)`, a mesma base exibida no título Débito; por isso ele soma tudo que já foi guardado até aquele ciclo.
