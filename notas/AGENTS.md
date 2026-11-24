# Guia de manutenção das Notas (`notas`)

## Propósito e fontes de verdade

- App estático (HTML/CSS/JavaScript clássico, sem build) de anotações: várias notas em Markdown, como arquivos `.md`. No PC, a nota abre num editor como o do VS Code (CodeMirror 6); no celular, como uma conversa do WhatsApp (um balão por parágrafo, selecionar, apagar, editar). Abre pelo atalho **Anotações** da doca da página inicial.
- `docs/REGRAS.md` é a fonte de verdade das regras e do comportamento visível; `README.md` tem a implantação. Guia geral do hub em `../AGENTS.md`.

## Arquitetura

- `index.html` é o único documento; um stylesheet próprio (`css/notas.css`), depois de `../base/tokens.css` e `../base/componentes.css`.
- Scripts clássicos nesta ordem, depois de `../supabase.js` (do hub), `../base/nucleo.js` (o `fetchComTeto`, o `confirmar` do toque duplo e o `repetido` do toque sem querer) e `vendor/codemirror.js` (global `CM`): `config`, `util`, `banco`, `markdown`, `editor`, `telas`, `bootstrap`. A 1ª linha de cada um diz a responsabilidade.
  - `js/banco.js`: cópia local, migração do título antigo, a ordem da lista (`ordemEntre`, `moverNota`, e `preparar` que completa a ordem que falta), diferença e envio da nota inteira.
  - `js/markdown.js`: só funções puras da conversa: os parágrafos do texto (`blocos`), `acrescentarBloco`, `trocarBloco`, `apagarBlocos`, `copiarBlocos` e o Markdown de um parágrafo em HTML (`markdownHtml`).
  - `js/editor.js`: o CodeMirror com o tema escuro do hub (só cores da base) e o Markdown destacado.
  - `js/telas.js`: a lista (o arraste pela alça ⠿ com Pointer Events, Alt+↑/↓ com a alça em foco), a nota aberta (editor ou conversa), a seleção e o Esc dentro da nota.
- Editor ou conversa: `modoDoAparelho` em `js/util.js` (ponteiro fino e largura ≥ 900 px → editor; o resto, conversa); o botão `#n-modo` troca e grava a escolha em `notas.modo`.
- `vendor/codemirror.js` é gerado, nunca editado à mão: `node notas/scripts/codemirror.mjs [pasta-temp]` (versões em Pacotes). O que o app usa do CodeMirror está na `ENTRADA` do script; precisou de mais um export, acrescente ali e gere de novo.
- Arquivo novo em `css/`, `js/` ou `vendor/` entra no `index.html` e no `ARQUIVOS_ESTATICOS` do `sw.js` (`tests/estrutura.test.mjs` confere). Cache `notas-estatico`; o service worker só apaga caches `notas-`, guarda `../supabase.js`, `../base/nucleo.js` e a base visual, e serve a página com `?nota=` sem internet.
- Todo arquivo `.js`, `.mjs`, `.css` e `.sql` começa com um comentário curto de responsabilidade (menos o vendor, que começa com a licença e as versões).

## Dados e segurança

- Tabela `notas_nota` (1 linha por nota: `user_id`, `id` gerado no aparelho, `titulo`, `texto`, `ordem` (posição na lista, `double precision`, migration `02`), `criada_em`, `editada_em`; chave `(user_id, id)`), só a conta `DONO` (RLS `somente_dono` + restritiva `somente_victor`), `anon` sem acesso. A migration `01` migra o título antigo da primeira linha para a coluna `titulo`.
- Cópia local primeiro (`notas.db.<conta>`, base em `notas.base.<conta>`), envio por diferença com a base **por nota inteira**: upsert da linha toda (`onConflict: 'user_id,id'`) e delete da nota apagada, 0,8 s depois de cada mudança. Ao abrir, envia o pendente e só então traz a nuvem; com pendente que não subiu, a nuvem não troca a cópia.
- **Sem mescla e sem voo** (exceção à regra "Envio que mescla" de `../AGENTS.md`, decisão do mantenedor de 24/11/2026; o porquê em `docs/DECISOES.md`): quem salva por último vale. Repetir o upsert da nota inteira deixa a nuvem igual, então envio sem resposta só é repetido. O que foi sobrescrito fica no `hub_historico` (antes e depois de cada gravação, migration `02` da raiz).
- A base guardada passa pela mesma limpeza do db (`preparar`, `baseNormal`) antes de comparar: mudança só de formato nunca vira pendente.
- Conversa: todo texto da nota é escapado antes de virar HTML; link só com `http(s)`, `mailto` ou `tel`, em outra aba com `rel="noopener noreferrer"` (`markdownHtml`). Renderizador próprio, sem biblioteca.

## Infraestrutura

Resolução deste app para cada item de `../docs/DIRETRIZES.md` (o que vale para todos fica lá).

- **Migrations:** `migrations/00-notas-nota.sql` (tabela/RLS), `migrations/01-notas-titulo.sql` (separa o título e migra notas existentes) e `migrations/02-notas-ordem.sql` (coluna `ordem`; preenche a ordem de hoje, a editada mais recente primeiro), formato DataGrip, conferidas em `tests/estrutura.test.mjs`; numeração em `../tests/documentacao.test.mjs`. O histórico entra pela `migrations/02-historico-notas.sql` da raiz (só `create trigger`, reaproveitando `registrar_historico_hub`). Ordem de aplicação no DataGrip: `notas/00`, `notas/01`, a `02` da raiz e por último a `notas/02`. Sem a `notas/02` aplicada, o envio das Notas falha e a mudança fica pendente no aparelho (`docs/DECISOES.md`, "Ordem manual das notas").
- **Testes:** sem navegador, `tests/funcoes.test.mjs` (28 testes: parágrafos, Markdown, migração do título antigo, lista, ordem entre vizinhas, `moverNota` e a nota nova no topo, limpeza do db e da base, formato antigo sem `ordem`, sincronização); estrutura em `tests/estrutura.test.mjs` (9 testes: ordem de carga, service worker, migrations 00 a 02, `DONO`, prefixo `notas.` e `bootstrap.js`); navegador (Playwright da raiz, Supabase falso em `tests/helpers/app.mjs`) em `tests/notas.test.mjs` (7 testes: conversa no celular, `?nota=`, título da aba, arrastar a alça com o dedo, Alt+↓ na alça e Esc no meio do arraste) e `tests/editor.test.mjs` (8 testes: PC, editor, título separado, atalhos, salvar e navegação). Total: 52 testes. `node scripts/check.mjs` roda tudo, menos a higiene textual do vendor.
- **Pacotes:** sem `package.json`. `../supabase.js` da raiz, o Playwright da raiz e o CodeMirror 6 vendorizado em `vendor/codemirror.js` (IIFE minificado, global `CM`, ~360 KB): `@codemirror/state` 6.7.6, `@codemirror/view` 6.43.15, `@codemirror/commands` 6.11.1, `@codemirror/language` 6.13.1, `@codemirror/lang-markdown` 6.5.2, `@codemirror/search` 6.7.2 e `@lezer/highlight` 1.2.5; indiretas fixadas por `overrides`: `@codemirror/lint` 6.9.7, `@lezer/common` 1.5.5, `@lezer/lr` 1.4.12 e `style-mod` 4.1.4; gerado com `esbuild` 0.28.2. Regenerar: `node notas/scripts/codemirror.mjs [pasta-temp]` (instala na pasta temporária, confere as versões instaladas e grava o vendor; nada entra no `package.json` da raiz). ESLint, Prettier e EditorConfig ignoram `notas/vendor/`.
- **Backups:** cópia no aparelho (`notas.db.<conta>`, base em `notas.base.<conta>`) e `hub_historico` com `notas_nota` (antes e depois de cada gravação da nota inteira: é o log de cada edição). Recuperar uma versão = ler o `antes` dali.
- **Domínio:** `/hub/notas/`. Externo: só o Supabase. Os links das notas abrem em outra aba e não são do app.

## Como concluir uma mudança

1. Atualize `docs/REGRAS.md`.
2. Ajuste os testes (`tests/funcoes.test.mjs` primeiro; `tests/notas.test.mjs` e `tests/editor.test.mjs` no navegador, com o Playwright da raiz e o Supabase falso de `tests/helpers/app.mjs`; `tests/estrutura.test.mjs`).
3. Rode `node scripts/check.mjs` dentro de `notas/` e, antes do push, na raiz do hub.
4. Commit e push conforme `../AGENTS.md`.

- **Sem prints de tela:** não tire nem abra capturas de tela (screenshot) para conferir visual, a pedido do mantenedor (gastam muito do limite de uso). Confira pelos testes e por medidas no navegador (posição, tamanho, texto, classes) e diga o que não foi visto.
- **Testes: função primeiro, tela pouco, regex quase nunca:** 1) a função do código rodando (sem navegador); 2) Playwright só em poucos casos estratégicos; nunca regex no código, só onde o objeto é texto (SQL, docs, configuração, segredos). Detalhes e exceções em `../docs/DIRETRIZES.md`, seção 3.
