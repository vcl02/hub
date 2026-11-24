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
