# Decisões das Notas (`notas`)

O porquê das escolhas. A regra vigente fica em `REGRAS.md`; o jeito de trabalhar, em `../AGENTS.md`; o que vale para todos os apps, em `../../docs/DIRETRIZES.md`.

## App próprio no lugar do WhatsApp (24/11/2026)

- Pedido do mantenedor: anotações que, no PC, tenham a fluidez de editar um `.md` no VS Code (principalmente Ctrl+X sem seleção recortando a linha e Ctrl+D com vários cursores) e, no celular, a de um grupo do WhatsApp (selecionar, apagar, editar). O mais importante no começo é essa fluidez.
- O atalho **Anotações** da doca abria a conversa do WhatsApp comigo mesmo (`wa.me`); passou a abrir `notas/`, com o mesmo ícone. Deixou de ser externo, então `?volta=notas/…` é aceito como o de qualquer app do hub.
- **Várias notas**, como arquivos `.md` (decisão do mantenedor), numa tabela com uma linha por nota (`notas_nota`). O título é um campo separado do corpo Markdown e pode ser editado no cabeçalho. A migration `01` move o título antigo (primeira linha não vazia) para o campo separado e remove essa linha do corpo.

## Nota gravada inteira, sem mescla (24/11/2026)

- Decisão do mantenedor: "pega sempre o resultado final da edição e coloca no banco, não compara mudanças". Cada gravação faz upsert da nota inteira (`onConflict: 'user_id,id'`); quem salva por último vale.
- Exceção à regra "Envio que mescla" de `../../AGENTS.md`: lá as listas do dia (água, xixis) mesclam porque dois aparelhos acrescentam itens ao mesmo dia. Aqui a unidade é o texto da nota; mesclar texto livre editado em dois aparelhos seria um diff de texto, com conflito a resolver na tela. Para uma pessoa só, que escreve num aparelho de cada vez, o último texto é o certo.
- Sem "voo" (`notas.voo.<conta>`): o voo existe para a mescla não somar de novo o que já subiu. O upsert da nota inteira é idempotente (repetir deixa a nuvem igual), então envio sem resposta só é repetido.
- O que é sobrescrito não se perde: a migration `02` da raiz liga `notas_nota` ao `hub_historico`, com antes e depois de cada gravação. É o "log a cada edição" que o mantenedor pediu, sem tabela de versões própria.
- Com pendente no aparelho, o carregar envia antes e não troca a cópia pela nuvem (nem se o envio falhou): o que foi escrito sem internet nunca é substituído pelo texto velho da nuvem.

## Editor do PC: CodeMirror 6 vendorizado (24/11/2026)

- Os atalhos do VS Code (vários cursores, Ctrl+D, mover e apagar linha, recortar a linha sem seleção) num `textarea` seriam reescrever um editor. O CodeMirror 6 já traz todos (o recortar e copiar sem seleção pegando a linha inteira são dele), com Markdown, desfazer e busca.
- O hub não tem build. O CodeMirror 6 só é distribuído em módulos ES com muitas dependências; por isso vira um arquivo só, gerado uma vez e guardado no repositório (`vendor/codemirror.js`, IIFE minificado com o global `CM`, ~360 KB), como o `supabase.js`. Entra no service worker e abre sem internet; nada de CDN.
- O script que gera (`scripts/codemirror.mjs`) fica versionado, com as versões exatas (todas publicadas até 10/11/2026, pelo menos 2 semanas antes) e as dependências indiretas que o npm escolheria mais novas fixadas por `overrides`; ele confere as versões instaladas antes de gerar. Instala numa pasta temporária: nada entra no `package.json` da raiz.
- ESLint, Prettier e EditorConfig ignoram `notas/vendor/` (código minificado de terceiros), como o `supabase.js`.
- Editor pelo aparelho (ponteiro fino e ≥ 900 px): no celular, o teclado virtual e o toque não têm Ctrl+D nem Ctrl+X, e a conversa é o que serve. O botão troca nos dois sentidos, e a escolha fica no aparelho.
- Grava 0,8 s depois de parar de digitar, o mesmo tempo do envio dos outros apps: gravar a cada tecla faria uma linha de histórico por letra.

## Conversa do celular (24/11/2026)

- Cada balão é um parágrafo (decisão do mantenedor): linha em branco separa, como no Markdown. Bloco de código fica inteiro num balão, mesmo com linha em branco dentro. Acrescentar, trocar e apagar mexem só no trecho do parágrafo; o resto do texto fica byte a byte igual, para o editor do PC ver a mesma nota.
- Markdown formatado (decisão do mantenedor) por um renderizador próprio e pequeno (`markdownHtml`), só com o que uma anotação usa: sem dependência nova e com a segurança na mão. Todo texto é escapado antes de virar HTML, e link só aceita `http(s)`, `mailto` e `tel` (`javascript:` fica como texto), com `rel="noopener noreferrer"`.
- Segurar ~0,5 s seleciona, como no WhatsApp; o menu do toque longo do Android não aparece sobre os balões. Apagar com o toque duplo do núcleo, como em todos os apps; a chave do armado é a própria seleção, então mudar a seleção desarma.
- Enter envia no PC (Shift+Enter quebra a linha) e quebra a linha no celular, onde o envio é pelo botão, como no WhatsApp; Ctrl+Enter envia sempre.

## Título num campo dentro do h1 (24/11/2026)

- O título da nota é um `<input>` dentro do `h1` do topo, que da base tem `nowrap` + `text-overflow: ellipsis` e a bolinha da cor antes. Com o campo inline a 100% da largura depois da bolinha, ele passava do `h1`, e o Chromium troca o elemento inteiro que passa por "…": no PC só aparecia "…" e clicar não mostrava nada. Corrigido com o `h1` das Notas em flex (bolinha e campo lado a lado, o campo com `flex: 1`), sem ellipsis. O teste do editor confere que o campo cabe no `h1` (sem a correção, ele passa 26 px e o teste falha).
- O foco do campo também era cortado pelo `h1`: do contorno de 3 px da base (`:focus-visible`, 2 px para fora) só sobrava o lado esquerdo, uma barra amarela no começo que parecia o cursor parado ali. O título tem foco próprio: sublinhado por dentro (`box-shadow` inset na cor) e o cursor na cor; o teste confere sem contorno e com o sublinhado.

## Linha do cursor translúcida no editor (24/11/2026)

- A seleção do editor é de fundo claro e texto escuro (escolha do mantenedor). No CodeMirror a camada da seleção fica atrás das linhas, e o fundo da linha do cursor (`.cm-activeLine`) fica por cima dela: com esse fundo opaco, ao selecionar de baixo para cima (cursor na 1ª linha), a parte selecionada dessa linha virava texto escuro em fundo escuro e sumia. O fundo da linha do cursor agora é o `--fg` a 6% translúcido (no escuro, quase o mesmo tom de antes; sobre a seleção, deixa o claro passar). O teste da seleção confere a opacidade abaixo de 10% com o cursor na 1ª linha (com o fundo opaco antigo, falha).

## Ordem manual das notas (24/11/2026)

- Pedido do mantenedor: a ordem das notas é definida por ele, arrastando pela alça ⠿ (como as sub-issues do GitHub), e fica para sempre. Antes, a lista era "editada mais recente em cima".
- Escolhas do coordenador (troca barata, se o mantenedor preferir outra): nota nova entra **no topo**; **editar não muda a posição** (a data da última edição continua na linha).
- Coluna `ordem` em `double precision` (`notas/migrations/02-notas-ordem.sql`). Mover dá à nota a média das vizinhas da nova posição (no topo, a primeira − 1; no fim, a última + 1), então **só a nota movida sobe** no envio: não se renumera a lista a cada arraste.
- Fracionária tem limite: cada movimento para o mesmo espaço divide a folga ao meio. Quando a folga entre as vizinhas fica abaixo de 1e-6 (ou a média não cabe entre elas), a lista inteira é renumerada 1, 2, 3… na ordem nova. Esse caso sobe várias linhas, e é raro. Teste: "moverNota sem folga entre as vizinhas renumera".
- Notas sem `ordem` (formato antigo, antes da `notas/02`, ou linha da nuvem sem a coluna) vão depois das que têm, pela edição (a mais recente primeiro, empate pelo id). A migration grava a mesma ordem para as notas que já existiam, então aparelho antigo e nuvem nova chegam ao mesmo resultado e a base antiga não vira pendente só de formato.
- Até a `notas/02` ser aplicada, o envio falha (a nuvem não conhece a coluna `ordem`) e a mudança fica pendente no aparelho; ao aplicar, a pendência sobe sozinha na próxima tentativa. Nada se perde, porque a cópia local é a fonte até lá.
- Alça ⠿ com Pointer Events (mouse e toque iguais), só na alça (`touch-action: none` nela), para o toque não rolar a página ao arrastar. Teclado: Alt+↑/↓ com a alça em foco move uma posição, sem mouse nem toque, e mantém o foco na alça da mesma nota.
- Esc durante o arraste só cancela o arraste (não sai do app), porque o Esc da lista sai para a página inicial e o arraste em curso não pode perder o gesto.

## Lista só com o título (24/11/2026)

- A linha da lista tem alça, título e lixeira. Saíram a prévia (a 1ª linha do corpo) e a data da última edição (commits `7e5b308` e `35b06b4`; as funções `previaDe` e `quandoFoi` foram removidas de `js/util.js`).

## Formatação ao vivo no editor do PC (24/11/2026)

- Escolhas do mantenedor: a formatação fica **só no editor do PC** (a conversa do celular já mostra os balões formatados) e a sintaxe é a **do Markdown**, não a do Slack. A nota é um `.md`, então o que se digita é Markdown e o editor só o mostra formatado.
- Só decorações: marcas escondidas (`Decoration.replace`), títulos e linhas com classe (`Decoration.line`/`mark`) e o "•" como widget (`WidgetType`). Nada insere ou troca texto: o que é gravado é o Markdown byte a byte, e o teste "o texto do doc nunca muda" confere.
- As marcas somem só fora das linhas do cursor e da seleção, como no Obsidian. Uma ênfase que passa de uma linha tem as marcas das duas pontas decididas juntas, pelas linhas do elemento inteiro (`ENFASES` em `js/editor.js`).
- Bundle: `ENTRADA` de `scripts/codemirror.mjs` ganhou `Decoration`, `ViewPlugin`, `WidgetType` e `syntaxTree` (o `crosshairCursor` já estava lá, sem uso). Mesmas versões, `vendor/codemirror.js` regenerado.
- Problema que aconteceu e pode voltar: o seletor `&dark` dentro de `EditorView.theme` faz o CodeMirror recusar o tema ("Unsupported selector"), e a nota abria vazia no PC. Corrigido em `c1410f2` (24/11/2026): o tema usa só `{ dark: true }`, sem seletor `&dark`. Teste: "a nota abre no editor".

## Ctrl+↑/↓ rolam, não criam cursor (24/11/2026)

- Primeiro, Ctrl+↑/↓ acrescentava um cursor na linha de cima ou de baixo (`61f9bf6`, como no VS Code). Passou a rolar a página uma linha, sem mexer no cursor (`bb5bd1a`), para não criar vários cursores sem querer ao rolar. Ctrl+←/→ continuam andando por palavra (padrão do CodeMirror).

## Botão do meio e cruz no Alt (24/11/2026)

- Arrastar com o botão do meio (ou Alt + arrastar com o esquerdo) faz seleção em coluna, como no VS Code (`8a8f36f`).
- Sem `crosshairCursor`: ele trocava o ponteiro por uma cruz grande ao segurar Alt, e isso aparecia ao usar Alt+S. Por isso Alt+S só favorita e o ponteiro não muda.
- Um paste logo depois de soltar o botão do meio é ignorado (até 1 s): no Linux, esse botão cola a seleção primária, que não se quer no texto.

## Favoritas como marca no texto (24/11/2026)

- Decisão: favorito é o parágrafo que termina com ` ★` **no próprio texto**. Não há coluna nova, nem tabela, nem migration; a Favoritas é calculada na hora (`favoritas`, em `js/markdown.js`) com o texto atual de cada nota.
- Caminhos vistos, na ordem (o mantenedor decidiu o último): (1) uma tela própria de favoritos; (2) uma nota de verdade chamada Favoritas, com cópia dos parágrafos; (3) a lista dinâmica, como os favoritos do WhatsApp, que o mantenedor pediu. Com uma cópia, a Favoritas mostraria o que foi copiado, não o texto atual da nota de origem; por isso a dinâmica.
- Marca no texto e não num campo à parte: o editor do PC e a conversa veem a mesma coisa, e a nota continua um `.md` que vai para o `hub_historico` como qualquer edição.
- Bloco de código não pode ser favorito: a marca no fecho ``` quebraria o bloco. A estrela fica desativada nesse caso (`podeFavoritar`).
- Espaços depois da ★ também valem (`0eea2fd`): a marca aceita `[ \t]*` no fim, porque o celular e o editor deixam espaço no fim da linha.
- O id `favoritas` (9 letras) nunca bate com um id de nota: os ids gerados em `criarNota` têm no máximo 8 caracteres (`Math.random().toString(36).slice(2, 10)`). Se o gerador mudar para um id maior, a Favoritas precisa de outro endereço.
