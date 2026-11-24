# Regras das Notas

## Acesso

- Só a conta do Victor. Dentro do hub, sem sessão vai para o login do hub (`../?volta=notas/…`, com a nota do endereço) e volta depois de entrar; login próprio só fora do hub (testes). Outra conta sai na hora ("Esta conta não tem acesso."). Sem botão de sair.
- Abre pelo atalho **Anotações** da doca da página inicial (mesmo ícone, `icons/anotacoes.svg`, e a mesma cor, `#f2b544`). Volta para a página inicial pelo ícone do hub.
- Abre na hora com a cópia do aparelho, inclusive sem internet; depois envia o que estava pendente e traz a nuvem. Sem a cópia e sem a nuvem (ou sem a tabela ainda criada), abre vazio.
- **Quem salva por último vale:** cada gravação manda a nota inteira (o texto final), sem comparar com o que outro aparelho mudou. A versão de antes fica guardada no histórico do banco (`hub_historico`), nunca na tela.
- Pendente na nuvem aparece numa linha embaixo: "Sem internet: salvo no aparelho, envia quando conectar." ou "Erro ao enviar para a nuvem: …". Sem pendente, nada aparece.
- **Rede ruim (metrô):** cada pedido ao Supabase tem limite de 15 s; estourou, conta como sem internet (fica salvo no aparelho e envia na próxima tentativa: ao reconectar, ao voltar para a página ou a cada minuto). Repetir o envio da nota inteira não duplica nada.

## Lista de notas

- Uma linha por nota, a editada mais recentemente em cima: título separado (vazio, "Sem título"), prévia (a 1ª linha não vazia do corpo, sem as marcas do começo) e quando foi a última edição (hoje, a hora "14:05"; ontem, "ontem"; neste ano, "19/11"; antes, "19/11/25").
- **+** cria uma nota nova e já a abre, pronta para escrever. Toque repetido sem querer no + em menos de 0,5 s é ignorado.
- **Apagar** (lixeira da linha): toque duplo, como em todos os apps (o 1º deixa vermelho por 3 s, o 2º apaga).
- Nota que fica vazia ao sair (a nova sem nada escrito, ou a que teve tudo apagado) some da lista.

## Nota aberta

- A nota aberta fica no endereço (`?nota=<id>`, como o `?ciclo` do Fin): recarregar mantém, e o Voltar do navegador (ou a seta do app) volta para a lista. Nota que não existe (apagada, de outra conta, endereço estranho) volta para a lista com "Nota não encontrada.", só depois de a nuvem responder. Apagada em outro aparelho com ela aberta: volta para a lista com "A nota foi apagada em outro aparelho.".
- No topo: voltar, o campo editável do título, e o botão que troca entre **editor** e **conversa**. O título não faz parte do Markdown; alterar o título não altera o corpo e salva sozinho após 0,8 s (ou ao sair do campo). Sem escolha, vale o aparelho: mouse e tela de 900 px ou mais abrem o editor; celular e tablet, a conversa. A escolha pelo botão fica no aparelho.
- Uma nota vazia só some ao sair se título e corpo estiverem vazios.
- Texto novo que chega da nuvem com a nota aberta só entra na tela se não há nada digitado esperando para gravar.

## Editor (PC)

- A nota inteira num editor de tela cheia, em Markdown com destaque (títulos na cor do módulo, ênfases, marcas em cinza, código com fundo) e quebra de linha visual.
- Atalhos como no VS Code: **Ctrl+D** seleciona a próxima ocorrência (vários cursores; digitar troca todas), **Ctrl+X** sem seleção recorta a linha inteira e **Ctrl+C** sem seleção copia a linha (a linha vai para a área de transferência sem a quebra do fim; colar no editor a põe inteira acima da linha do cursor), **Alt+↑/↓** move a linha, **Ctrl+Shift+K** apaga a linha, **Ctrl+Z**/**Ctrl+Y** desfazem e refazem, **Ctrl+F** busca, Tab indenta. Enter numa lista continua a lista.
- Grava sozinho 0,8 s depois de parar de digitar; sair da nota, trocar de modo ou esconder a página grava na hora. Desfazer começa do zero a cada nota aberta.

## Conversa (celular)

- Cada parágrafo (linhas seguidas; linha em branco separa; um bloco de código ``` fica inteiro) é um balão, com o Markdown formatado: títulos, negrito, itálico, riscado, código, listas (com tarefas `[ ]`/`[x]`), citação, linha e links. Link só `http(s)`, `mailto` ou `tel`, abre em outra aba; o resto fica como texto. O mais novo embaixo, e a nota abre no fim.
- Campo embaixo, que cresce com o texto, e **enviar**: acrescenta um parágrafo no fim. Enter envia no PC (Shift+Enter quebra a linha); no celular, Enter quebra a linha e se envia pelo botão; **Ctrl+Enter** envia sempre. Toque repetido sem querer no enviar em menos de 0,5 s é ignorado. Campo vazio não envia.
- **Segurar** um balão ~0,5 s seleciona (rolar não seleciona); com algo selecionado, um toque seleciona ou desseleciona outros. Barra de seleção no topo, com a quantidade:
  - **Apagar**: toque duplo; apaga os parágrafos selecionados ("Parágrafo apagado." ou "N parágrafos apagados.").
  - **Editar** (só com 1 selecionado): o texto do parágrafo vai para o campo de baixo; enviar troca o parágrafo no lugar (vazio apaga), **Cancelar** desiste.
  - **Copiar**: os parágrafos selecionados, na ordem da nota, separados por uma linha em branco.
  - **X**: desmarca.
- O resto do texto da nota continua igual: só o parágrafo mexido muda.

## Esc

- Na nota, na ordem: desmarca a seleção; cancela a edição do parágrafo; no editor, desfaz os vários cursores ou fecha a busca e depois só tira o foco; num campo de texto, o 1º Esc só tira o foco; sem nada disso, volta para a lista.
- Na lista, sai do app para a página inicial do hub (`../`), como em todos os apps.
