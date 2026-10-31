# Guia de manutenção do Corpo (`corpo`)

## Propósito e fontes de verdade

- App estático (HTML/CSS/JavaScript clássico, sem build) com os dados sobre mim: pesagem e barriga dia a dia (tabela `corpo_medida`), IMC e evolução, e o perfil fixo (altura, nascimento, sexo, só em código).
- **Módulo compartilhado:** `perfil.js` é o que os outros apps usam (`<script src="../corpo/perfil.js">`): `PERFIL`, `ROTINA` (dias de treino e presenciais), `idadeEm`, `tmb`, `kcalTreino`, `kcalEsteira` (cardio do Treino) e a leitura das medidas (`lerMedidas`, `medidasGuardadas`, `pesoNoDia`). Mudou a forma? Ajuste os apps que usam (tr, al) na mesma alteração.
- `docs/REGRAS.md` é a fonte de verdade das regras e do comportamento visível; `README.md` tem a implantação. Guia geral do hub em `../AGENTS.md`.

## Arquitetura

- `index.html` é o único documento; um stylesheet só (`css/corpo.css`).
- Scripts clássicos nesta ordem, depois de `../supabase.js` (do hub) e `perfil.js`: `config`, `util`, `banco`, `telas`, `bootstrap`. A 1ª linha de cada um diz a responsabilidade.
- Arquivo novo em `css/` ou `js/` entra no `index.html` e no `ARQUIVOS_ESTATICOS` do `sw.js` (`tests/estrutura.test.mjs` confere). Cache `corpo-estatico`; o service worker só apaga caches `corpo-`.
- Todo arquivo `.js`, `.mjs`, `.css` e `.sql` começa com um comentário curto de responsabilidade.

## Dados e segurança

- **Só o Corpo grava `corpo_medida` e `corpo_dia`** (sono, evacuações e xixis com horário, migrations 01, 02 e 04; quando o peso e o sono foram lançados, `peso_em` e `sono_em`, migration 03, usados pelos hábitos da página inicial do hub). Treino e Alimentação só leem, por `perfil.js`. A cópia que eles leem sem internet (`corpo.medidas.<conta>`) é atualizada pelo Corpo a cada mudança e por `lerMedidas`.
- Lê `agua_dia` (da Água, só leitura: `data, aguas`) para a bexiga (ml bebidos por xixi), com cópia em `corpo.aguas.<conta>` para abrir sem internet.
- `tr_medida` (onde o Treino gravava) foi copiada para `corpo_medida` pela migration 00 e depois apagada pelo mantenedor: a 00 não roda de novo (ela lê `tr_medida`).
- Só a conta `DONO`; RLS de `corpo_medida` com `somente_dono` + restritiva `somente_victor`; `anon` sem acesso. Chave do Supabase no código é a publicável; nunca segredo no repositório.
- Mudança de esquema: migration nova e numerada em `migrations/`, formato do DataGrip. Operações remotas que mudam estado exigem confirmação explícita do mantenedor.

## Infraestrutura

Resolução deste app para cada item de `../docs/DIRETRIZES.md` (o que vale para todos fica lá).

- **Migrations:** `migrations/` 00 a 05, formato DataGrip, RLS só do Victor; a 00 não roda de novo (lê `tr_medida`, já apagada). Conferido em `tests/estrutura.test.mjs`, numeração em `../tests/documentacao.test.mjs`.
- **Testes:** navegador em `tests/corpo.test.mjs` (Playwright do `tr/`, Supabase falso em `tests/helpers/app.mjs`); estrutura em `tests/estrutura.test.mjs`. As funções de `perfil.js` (idade, basal, calorias, pesagens) são testadas em `../tests/hub.test.mjs`.
- **Pacotes:** sem `package.json`. `../supabase.js` da raiz e o Playwright do `tr/`.
- **Backups:** cópia no aparelho (`corpo.db.<conta>`, base em `corpo.base.<conta>`) e `hub_historico` com `corpo_medida` e `corpo_dia`. O perfil está no código (git).
- **Domínio:** `/hub/corpo/`. Externo: só o Supabase.

## Como concluir uma mudança

1. Atualize `docs/REGRAS.md`.
2. Ajuste os testes (`tests/corpo.test.mjs` no navegador, com o Playwright do `tr/node_modules` e o Supabase falso de `tests/helpers/app.mjs`; `tests/estrutura.test.mjs`).
3. Rode `node scripts/check.mjs` dentro de `corpo/` e, antes do push, na raiz do hub. Informe precisamente o que foi validado.
4. Commit e push conforme `../AGENTS.md`.
- **Sem prints de tela:** não tire nem abra capturas de tela (screenshot) para conferir visual, a pedido do mantenedor (gastam muito do limite de uso). Confira pelos testes e por medidas no navegador (posição, tamanho, texto, classes) e diga o que não foi visto.
- **Testes: função primeiro, tela pouco, regex quase nunca:** 1) a função do código rodando (sem navegador); 2) Playwright só em poucos casos estratégicos; nunca regex no código, só onde o objeto é texto (SQL, docs, configuração, segredos). Detalhes e exceções em `../docs/DIRETRIZES.md`, seção 3.

## Preferências do mantenedor

- Textos curtos em português; nada de texto explicando como usar. Botões só com ícone têm `title` e `aria-label`.
