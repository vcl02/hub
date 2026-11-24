# Notas (`notas`)

Anotações em Markdown, várias notas. No PC, um editor como o do VS Code (Ctrl+D, Ctrl+X na linha, Alt+↑/↓) com o Markdown formatado ao vivo; no celular, a nota como conversa (um balão por parágrafo, segurar para selecionar, apagar, editar, copiar e favoritar). Parágrafo favorito termina com ` ★` e aparece no card Favoritas, no topo da lista. A lista das notas se ordena arrastando a alça ⠿ (ou Alt+↑/↓ com a alça em foco). Abre pelo atalho Anotações da página inicial. Regras em `docs/REGRAS.md`; guia em `AGENTS.md`.

## Implantação (uma vez, feita pelo mantenedor)

1. Rodar `migrations/00-notas-nota.sql` (desta pasta) no DataGrip. Cria `notas_nota` (RLS só do Victor).
2. Rodar `migrations/01-notas-titulo.sql` (desta pasta) no DataGrip. Separa o título e migra a primeira linha das notas existentes para ele.
3. Rodar `migrations/02-historico-notas.sql` da raiz do hub no DataGrip. Liga `notas_nota` ao `hub_historico` (antes e depois de cada gravação). Precisa da `00` da raiz (já aplicada) e da tabela criada e atualizada nos passos anteriores.
4. Rodar `migrations/02-notas-ordem.sql` (desta pasta) no DataGrip. Acrescenta a coluna `ordem` e dá às notas que já existem a ordem de hoje (a editada mais recente primeiro). Sem ela, o envio das Notas falha e fica pendente no aparelho.

Rodar de novo as migrations não repete a migração de dados.

## CodeMirror

`vendor/codemirror.js` é gerado: `node notas/scripts/codemirror.mjs [pasta-temporária]` na raiz do hub (precisa de internet para o npm). Versões em `AGENTS.md`, Pacotes.

## Testes

`node scripts/check.mjs` dentro de `notas/`. Os testes de navegador usam o Playwright instalado na raiz.
