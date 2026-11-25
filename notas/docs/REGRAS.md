# Regras das Notas

## Acesso

- Só a conta do Victor. Dentro do hub, sem sessão vai para o login do hub (`../?volta=notas/…`, com a nota do endereço) e volta depois de entrar; login próprio só fora do hub (testes). Outra conta sai na hora ("Esta conta não tem acesso."). Sem botão de sair.
- Abre pelo atalho **Anotações** da doca da página inicial (mesmo ícone, `icons/anotacoes.svg`, e a mesma cor, `#f2b544`). Volta para a página inicial pelo ícone do hub.
- Abre na hora com a cópia do aparelho, inclusive sem internet; depois envia o que estava pendente e traz a nuvem. Sem a cópia e sem a nuvem (ou sem a tabela ainda criada), abre vazio.
- **Nada por cima do que não foi visto (aba parada):** cada gravação manda a nota inteira (o texto final), mas só por cima da versão que este aparelho viu. Se a nota mudou em outro aparelho enquanto aqui também mudava (o texto, ou o título), a nota fica com o de lá e o daqui vira uma nota nova **"<título> (conflito)"**, logo abaixo dela na lista. Vale também para a tela: o que se digita, edita, apaga ou favorita sobre um texto que mudou por baixo (a nuvem trouxe outro durante a digitação, a seleção ou a edição de um parágrafo) vai para a cópia, e a nota aberta passa a mostrar o texto de lá. Na tela, o título que mudou em outro aparelho não faz conflito com o texto que se está digitando aqui, e vice-versa. Acrescentar um parágrafo (enviar sem edição) parte sempre do texto mais novo: nunca conflita. Cada gravação fica também no histórico do banco (`hub_historico`).
- **Avisos que ficam:** no alto da tela aberta (lista, nota ou Favoritas, logo abaixo do cabeçalho), no laranja de atenção, um por caso, até fechar no X ou no **Esc**:
  - Conflito: _<título>: mudou em outro aparelho; sua versão foi salva como "<título> (conflito)"._ (título vazio, "Sem título"), com **Abrir cópia**, que grava a nota aberta (como ao sair dela) e abre a cópia (no endereço; Voltar volta).
  - Apagada aqui que mudou em outro aparelho: não é apagada e volta para a lista com o texto de lá, com _<título> voltou: mudou em outro aparelho depois que você apagou._
  - Os avisos são da conta: a tela de login os tira.
- Pendente na nuvem aparece numa linha embaixo: "Sem internet: salvo no aparelho, envia quando conectar." ou "Erro ao enviar para a nuvem: …". Sem pendente, nada aparece.
- **Rede ruim (metrô):** cada pedido ao Supabase tem limite de 15 s; estourou, conta como sem internet (fica salvo no aparelho e envia na próxima tentativa: ao reconectar, ao voltar para a página ou a cada minuto). Repetir o envio da nota inteira não duplica nada.

## Lista de notas

- Uma linha por nota, na ordem que eu defino (fica para sempre, em todos os aparelhos): alça **⠿**, título (vazio, "Sem título") e a lixeira. A linha só tem o título: sem prévia do corpo e sem a data da última edição.
- O card **Favoritas** fica sempre em primeiro, acima da lista (ver "Favoritas"), e o card **Temp** logo abaixo dele (ver "Temp").
- **Ordem:** a alça **⠿** à esquerda de cada linha arrasta a nota (mouse ou dedo, só pela alça; o resto da linha abre a nota e rola a página); a linha segue o ponteiro, as outras abrem espaço e, ao soltar, a nota fica ali. Esc (ou o sistema interromper o toque) durante o arraste cancela e a nota volta ao lugar, sem sair do app. Com a alça em foco, **Alt+↑**/**Alt+↓** sobe ou desce uma posição. Nota nova entra no topo; editar não muda a posição.
- **+** cria uma nota nova (no topo) e já a abre, pronta para escrever. Toque repetido sem querer no + em menos de 0,5 s é ignorado.
- **Apagar** (lixeira da linha): toque duplo, como em todos os apps (o 1º deixa vermelho por 3 s, o 2º apaga).
- Nota que fica vazia ao sair (a nova sem nada escrito, ou a que teve tudo apagado) some da lista.

## Favoritas

- **Favorito é o parágrafo que termina com ` ★`** (um espaço e a estrela; espaços depois da estrela também valem). A marca fica no próprio texto da nota: o editor do PC e a conversa veem a mesma coisa, e nada mais é guardado.
- Não podem ser favoritos: parágrafo vazio ou só com a estrela, e parágrafo cuja última linha está num bloco de código (a marca ali quebraria o bloco). Nesses casos a estrela fica desativada.
- O card **Favoritas** (amarelo fraco, no topo da lista, fora da ordem: não arrasta e não apaga) mostra a contagem: "Nenhuma ainda", "1 mensagem" ou "N mensagens". Tocar em qualquer parte dele abre a "nota" Favoritas (`?nota=favoritas`); Ctrl/Shift+clique abre à parte, como um link.
- **A Favoritas é calculada na hora**, com o texto atual de cada nota: os favoritos de todas as notas, na ordem da lista e, dentro de cada nota, na ordem do texto. Cada balão tem o título da nota de origem em cima, pequeno ("Sem título" se vazio), e a estrela no canto; a ` ★` do texto não aparece. O mais novo fica embaixo e a tela abre no fim. Editar a origem muda a Favoritas; tirar a marca da origem tira o balão.
- A Favoritas aparece sempre como conversa, também no PC.
- **Tocar num balão** abre a nota de origem no parágrafo: no celular, rolado até ele com um destaque breve; no PC, com o cursor no começo do parágrafo, no meio da tela.
- **Segurar** um balão seleciona (como na conversa). Com seleção, a barra no topo mostra a quantidade e tem: **Desmarcar** (X), **Copiar** (os parágrafos na ordem da lista, sem a ★, separados por uma linha em branco) e **Tirar das favoritas** (tira a marca só dos selecionados, em cada nota de origem; o resto do texto fica igual); se a origem mudou depois de a lista aparecer, cada selecionado é achado pelo texto, e o que sumiu ou já não é favorito fica de fora).
- Sem favoritos, a Favoritas mostra: "Nenhuma favorita ainda. Na conversa, segure um parágrafo e toque na estrela; no editor, Alt+S."
- **Como favoritar:**
  - No celular: segurar, selecionar e tocar na estrela da barra (ao lado do Apagar). Com os selecionados que podem ser favoritos, a estrela tira a marca se todos já são; senão, favorita todos. Desativada se nenhum pode.
  - No PC: o botão de estrela no topo do editor e **Alt+S** (pela tecla S física, então vale também no Mac) põem ou tiram a marca nos parágrafos dos cursores e das seleções (vários cursores: todos de uma vez). A mesma regra da estrela do celular. O botão fica aceso quando o parágrafo do cursor já é favorito, e desativado quando ele não pode ser. Aparece "Nas favoritas." ou "Fora das favoritas."; Ctrl+Z desfaz.
- Editar um favorito na conversa mantém a marca. Enviar sem texto no campo de edição apaga o parágrafo (não sobra só a estrela).
- **Esc** na Favoritas: com seleção, desmarca; sem seleção, volta para a lista. O **Voltar** do app ou do navegador também volta.

## Temp

- O card **Temp** (o mesmo visual do Favoritas, com o ícone de caixa de entrada, logo abaixo dele, fora da ordem: não arrasta e não apaga) mostra "Vazia", "1 mensagem" ou "N mensagens" (os parágrafos da nota). Tocar abre a nota Temp (`?nota=temp`).
- A Temp é uma nota como as outras (conversa no celular, editor no PC, escrever, editar, apagar e favoritar parágrafos, a mesma gravação e o mesmo conflito), com o título fixo **Temp** (o campo não edita). Nasce na primeira vez que é aberta ou que recebe parágrafos; esvaziada, continua.

## Mover para outra nota

- Como o encaminhar do WhatsApp, mas **sem deixar cópia**: os parágrafos saem da nota de origem e vão para o **fim** da nota escolhida, na ordem do texto, exatamente como eram (a ★ do favorito vai junto).
- Onde: a **seta** da barra de seleção da conversa (qualquer nota, a Temp inclusive) e da Favoritas (cada favorita sai da nota dela; a que já está no destino fica); no PC, o botão de seta no topo do editor e **Alt+M** (pela tecla M física), com os parágrafos dos cursores e das seleções (cursor fora de um parágrafo: "Nada para mover: o cursor não está num parágrafo.").
- O seletor **Mover para** lista a Temp, as notas na ordem da lista (sem a de origem) e **Nova nota** no fim (cria uma nota no topo da lista com os parágrafos). Esc, o X ou tocar fora fecham sem mover (a seleção continua).
- Movido, aparece "Movido para <título>" com **Abrir**, que abre o destino. As duas notas gravam juntas e sobem para a nuvem; se o destino mudou em outro aparelho, vale a regra do conflito (nada se perde).

## Nota aberta

- A nota aberta fica no endereço (`?nota=<id>`, como o `?ciclo` do Fin): recarregar mantém, e o Voltar do navegador (ou a seta do app) volta para a lista. Nota que não existe (apagada, de outra conta, endereço estranho) volta para a lista com "Nota não encontrada.", só depois de a nuvem responder. Apagada em outro aparelho com ela aberta: volta para a lista com "A nota foi apagada em outro aparelho.".
- No topo: voltar, o campo editável do título, e o botão que troca entre **editor** e **conversa**. O título não faz parte do Markdown; alterar o título não altera o corpo e salva sozinho após 0,8 s (ou ao sair do campo). Sem escolha, vale o aparelho: mouse e tela de 900 px ou mais abrem o editor; celular e tablet, a conversa. A escolha pelo botão fica no aparelho.
- Uma nota vazia só some ao sair se título e corpo estiverem vazios.
- Texto novo que chega da nuvem com a nota aberta só entra na tela se não há nada digitado esperando para gravar.

## Editor (PC)

- A nota inteira num editor de tela cheia, em Markdown, com quebra de linha visual.
- **Formatação ao vivo** (como no Obsidian): a tela mostra o Markdown formatado; o texto gravado continua o Markdown puro, byte a byte.
  - Títulos `#`, `##` e `###` maiores (1,6×, 1,35× e 1,15× da letra), na cor do módulo e em negrito. `####` a `######` ficam do tamanho de `###`.
  - `-`, `*` e `+` de item sem número viram **•** (o espaço depois da marca fica). Item numerado fica como está.
  - Ênfases formatadas: negrito (`**` ou `__`), itálico (`*` ou `_`) e riscado (`~~`). Código (crase) tem fundo; links sublinhados.
  - As marcas (`#`, as de ênfase e a do item de lista) **somem fora das linhas do cursor e da seleção** e voltam nas linhas que eles tocam. Com vários cursores, cada linha de um cursor conta. Uma seleção mostra as marcas de todas as linhas que toca, do começo da primeira ao fim da última. Uma ênfase que passa de uma linha mostra as marcas das duas pontas quando o cursor está em qualquer uma delas.
  - A ★ do favorito fica na cor do módulo, fora da linha do cursor (dentro de bloco de código, não ganha cor).
- Atalhos como no VS Code: **Ctrl+D** seleciona a próxima ocorrência (vários cursores; digitar troca todas), **Ctrl+X** sem seleção recorta a linha inteira e **Ctrl+C** sem seleção copia a linha (a linha vai para a área de transferência sem a quebra do fim; colar no editor a põe inteira acima da linha do cursor), **Alt+↑/↓** move a linha, **Ctrl+Shift+K** apaga a linha, **Ctrl+Z**/**Ctrl+Y** desfazem e refazem, **Ctrl+F** busca, Tab indenta. Enter numa lista continua a lista.
- **Ctrl+↑ / Ctrl+↓** rolam a página uma linha, sem mexer no cursor e sem criar cursores. **Ctrl+← / Ctrl+→** andam por palavra.
- **Seleção em coluna:** arrastar com o **botão do meio** (ou Alt + arrastar com o esquerdo) faz um cursor por linha, na mesma coluna. O ponteiro não vira cruz ao segurar Alt. Um paste logo depois do botão do meio (até 1 s) é ignorado: é a seleção primária do Linux, não algo que se quer colar.
- Grava sozinho 0,8 s depois de parar de digitar; sair da nota, trocar de modo ou esconder a página grava na hora. Desfazer começa do zero a cada nota aberta.
- A estrela do topo e Alt+S: ver "Favoritas".

## Conversa (celular)

- Cada parágrafo (linhas seguidas; linha em branco separa; um bloco de código ``` fica inteiro) é um balão, com o Markdown formatado: títulos, negrito, itálico, riscado, código, listas (com tarefas `[ ]`/`[x]`), citação, linha e links. Link só `http(s)`, `mailto` ou `tel`, abre em outra aba; o resto fica como texto. O mais novo embaixo, e a nota abre no fim. Balão favorito leva a estrela no canto.
- Campo embaixo, que cresce com o texto, e **enviar**: acrescenta um parágrafo no fim. Enter envia no PC (Shift+Enter quebra a linha); no celular, Enter quebra a linha e se envia pelo botão; **Ctrl+Enter** envia sempre. Toque repetido sem querer no enviar em menos de 0,5 s é ignorado. Campo vazio não envia.
- **Segurar** um balão ~0,5 s seleciona (rolar não seleciona); com algo selecionado, um toque seleciona ou desseleciona outros. Barra de seleção no topo, com a quantidade:
  - **Apagar**: toque duplo; apaga os parágrafos selecionados ("Parágrafo apagado." ou "N parágrafos apagados.").
  - **Editar** (só com 1 selecionado): o texto do parágrafo vai para o campo de baixo; enviar troca o parágrafo no lugar (vazio apaga), **Cancelar** desiste.
  - **Copiar**: os parágrafos selecionados, na ordem da nota, sem a ★, separados por uma linha em branco.
  - **Estrela**: favorita ou tira das favoritas (ver "Favoritas"); desativada se nenhum selecionado pode ser favorito.
  - **X**: desmarca.
- O resto do texto da nota continua igual: só o parágrafo mexido muda.

## Esc

- Com o seletor **Mover para** aberto, o Esc só o fecha, antes de tudo.
- Com aviso na tela, o Esc fecha o mais antigo antes de tudo (não tira o foco, não desmarca, não volta e não sai do app); só um arraste da lista em andamento vem antes.
- Na nota, na ordem: desmarca a seleção; cancela a edição do parágrafo; no editor, desfaz os vários cursores ou fecha a busca e depois só tira o foco; num campo de texto, o 1º Esc só tira o foco; sem nada disso, volta para a lista.
- Na Favoritas: com seleção, desmarca; sem seleção, volta para a lista.
- Na lista, durante um arraste, só cancela o arraste; sem arraste, sai do app para a página inicial do hub (`../`), como em todos os apps.
