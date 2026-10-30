# Guia de manutenção do hub

## O que é

- Um repositório só (`vcl02/hub`), publicado inteiro no GitHub Pages: a página inicial na raiz e cada app numa pasta.
- `fin/` (finanças) e `tr/` (Treino) vieram dos repositórios `vcl02/fin` e `vcl02/tr` com o histórico completo (`git subtree`). Os repositórios antigos foram excluídos em 22/10/2026: o código e o histórico vivem só aqui, e os endereços antigos (`/fin/`, `/tr/`) não existem mais.
- `al/` (Alimentação: déficit calórico do dia, com IA) e `corpo/` (pesagem, barriga e os dados sobre mim; saiu do Treino) nasceram aqui em 26/10/2026, e `agua/` (água e xixi, com lembretes no app e notificações) logo depois.
- A página inicial é o módulo **Hábitos** (26/10/2026): os hábitos do dia, que levam aos apps, com ofensivas, dias perfeitos e proteções, no lugar da antiga grade de cards. Fases seguintes, nesta ordem: gráficos (e o do Fin), espelho do Google Agenda e Tarefas (CRUD, por Edge Function com o refresh token) e personalização.
- Cada projeto (a raiz e cada app) tem o próprio guia (`AGENTS.md`), regras (`docs/REGRAS.md`), decisões (`docs/DECISOES.md`) e testes. O que se repete entre todos (documentação, migrations, testes, pacotes, backups e domínios) está em `docs/DIRETRIZES.md`; cada guia tem a seção **Infraestrutura** com a resolução própria. Este arquivo cobre só o que é do hub. Em caso de conflito, uma solicitação explícita do mantenedor vence os guias.

## Estrutura

| Caminho | O que é |
|---|---|
| `docs/` | `DIRETRIZES.md` (diretrizes gerais de todos os projetos), `REGRAS.md` (comportamento visível da página inicial: login, hábitos e atalhos) e `DECISOES.md` (o porquê das escolhas do hub) |
| `index.html` · `hub.css` · `hub.js` | Página inicial: login, os hábitos (uma linha por hábito, que abre o app; o Fin pela Besteira) e os atalhos fixos embaixo (Agenda, Anotações). `hub.js` baixa os dados dos apps (só leitura) e desenha |
| `habitos.js` | Regras dos hábitos, só funções puras: estado de cada dia, ofensivas, dias perfeitos, proteções e o resumo de hoje (testes em `tests/habitos.test.mjs`) |
| `al/gasto.js` | Gasto e meta do dia (módulo do al), o mesmo no al e no hábito do déficit |
| `agua/bebidas.js` | Bebidas da Água além da água (suco, refri, cappuccino, leite com Toddy, leite integral): quanto é água e kcal/macros por 100 ml; a Água, o al e a página inicial carregam |
| `supabase.js` | `@supabase/supabase-js` (UMD), cópia byte a byte de `tr/supabase.js` (o teste confere); atualize os dois juntos. O al usa este (`../supabase.js`), sem cópia própria |
| `sw.js` · `manifest.webmanifest` · `icons/` | Instalação e cache offline da página inicial |
| `fin/` · `tr/` · `al/` · `corpo/` · `agua/` | Os apps, cada um com `index.html`, service worker e manifest próprios |
| `corpo/perfil.js` | Dados sobre mim para todos os apps: perfil (altura, nascimento, sexo), rotina da semana (`ROTINA`: dias de treino e presenciais), `idadeEm`/`tmb`, calorias do treino e da esteira (`kcalTreino`, `kcalEsteira`) e a leitura das pesagens (`lerMedidas`, `medidasGuardadas`, `pesoNoDia`); tr, al e agua carregam com `../corpo/perfil.js` |
| `tests/` | Estrutura do hub (`hub.test.mjs`), documentação e migrations de todos os projetos (`documentacao.test.mjs`), regras dos hábitos (`habitos.test.mjs`) e, no Chromium com o Supabase falso do tr, login no hub, os hábitos com os dados dos apps e os apps abrindo com a mesma sessão (`navegacao.test.mjs`) |
| `scripts/check.mjs` | Validação completa: raiz, `fin/`, `tr/`, `al/`, `corpo/` e `agua/` |
| `migrations/` | Migrations do hub inteiro (não de um app só): `00` histórico de mudanças das tabelas dos apps (`hub_historico`) |
| `.github/workflows/` | Validação em todo push e e-mail de publicação do Pages (só funcionam na raiz) |
| `.claude/settings.json` · `.claude/hooks/session-start.sh` | Sessões do Claude Code na nuvem: instalam o Playwright do tr ao começar, pra validação completa rodar sempre |

## Regras do hub

Valem para todos os apps. O comportamento visível da página inicial (login, hábitos, atalhos) está em `docs/REGRAS.md`.

- Tudo em tema escuro, com a mesma paleta (fundo `#1B1E21`, superfícies `#24272B`), mesmo com o celular no modo claro.
- Sair existe só no hub: fin e tr não têm botão de sair.
- App aberto sem sessão (link direto, ícone antigo) vai para o login do hub com `?volta=<pasta>/…` e, depois de entrar, o hub devolve para ele. `?volta` só é aceito se for a pasta de um app da página (hábito ou atalho do hub; nunca externo, outro site ou `..`). A tela de login própria dos apps só aparece com eles servidos fora do hub (testes).
- Cada app volta para a página inicial pelo ícone do hub (a marca em traço: nó central ligado a quatro pontas; link para `../`).
- **`?dia=AAAA-MM-DD`:** a página inicial, num dia anterior, abre o app daquele hábito naquele dia, só leitura (Treino, Alimentação, Corpo e Água; `diaDaUrl` no `js/util.js` de cada um). Hoje, futuro ou texto inválido: o app normal. O Fin não tem modo só leitura: com `?dia` ele só abre no ciclo daquele dia, normal.
- Caminhos sempre relativos (`./`, `../`): o site roda em `/hub/`, e os apps em `/hub/fin/`, `/hub/tr/`, `/hub/al/`, `/hub/corpo/` e `/hub/agua/`.
- Mesma origem para todos: `localStorage`, caches e a sessão do Supabase são compartilhados.
  - Chaves de `localStorage` e nomes de cache sempre com prefixo do app (`fin-`, `carga-`/`tr.`, `al-`/`al.`, `corpo-`/`corpo.`, `agua-`/`agua.`, `hub-`). Nenhum service worker apaga cache de outro prefixo.
  - A sessão do Supabase (mesmo projeto, mesma chave) vale para todos os apps: entrar em um entra em todos, e Sair em qualquer um sai de todos.
- O service worker da raiz só atende os arquivos da própria página inicial (incluindo os módulos que ela carrega, `corpo/perfil.js`, `agua/bebidas.js` e `al/gasto.js`, só para ela); cada app tem o seu, com escopo na própria pasta.
- **Dados sobre mim num lugar só (app Corpo):** perfil (altura, nascimento, sexo, só no código) e o que sai dele (idade, taxa basal, calorias do treino) ficam em `corpo/perfil.js`; pesagem e barriga ficam na tabela `corpo_medida` e o registro do dia (sono, evacuações e xixis) em `corpo_dia`, que só o Corpo grava. App que usa carrega `<script src="../corpo/perfil.js">` antes dos próprios scripts e põe `../corpo/perfil.js` no próprio service worker (offline); lê as pesagens com `lerMedidas`/`medidasGuardadas`/`pesoNoDia`; nenhum app repete esses valores nem grava pesagens.

## Novo app

1. Crie a pasta (`nome/`) com `index.html`, caminhos relativos e o ícone do hub para `../`, e os documentos e pastas de `docs/DIRETRIZES.md`: `AGENTS.md` (com a seção Infraestrutura), `docs/REGRAS.md`, `docs/DECISOES.md`, `migrations/` (a partir de `00`), `tests/` e `scripts/check.mjs`. Acrescente o projeto à lista de `tests/documentacao.test.mjs` e à tabela de projetos das diretrizes.
2. Acrescente o app à página inicial: com hábito, a linha em `index.html` e o hábito em `habitos.js` (mesma lista e ordem); sem hábito, um atalho na doca. O teste `tests/hub.test.mjs` confere a lista e que a pasta tem `index.html`. Acrescente a pasta ao `scripts/check.mjs` se ela tiver validação própria.
3. Use a paleta escura e prefixe chaves de `localStorage` e caches.
4. Precisa de altura, idade, sexo, taxa basal ou peso? Use `corpo/perfil.js` (ver Regras do hub).

## Como concluir uma mudança

1. Atualize as regras e os testes do app afetado (ver o guia dele) e, se houve escolha entre caminhos ou um problema que pode voltar, o `docs/DECISOES.md` dele.
2. Rode `node scripts/check.mjs` na raiz. Ele roda a validação da raiz e de todos os apps e precisa das dependências do tr (`npm ci` e `npx playwright install chromium` dentro de `tr/`; nas sessões na nuvem, o hook de início já instala). Informe precisamente o que foi validado; não alegue validação no celular ou no Supabase real se ela não ocorreu.
3. Faça commit e push direto na `main`: projeto pessoal, sem fluxo de PR, sem worktree nem branch auxiliar. Nunca inclua alterações alheias no commit.
4. Nunca reescreva o histórico importado de `fin/` e `tr/` (rebase, amend, troca de autor).

## Infraestrutura

Resolução da página inicial para cada item de `docs/DIRETRIZES.md`.

- **Migrations:** `migrations/` da raiz, só o que cruza apps. `00` cria `hub_historico` e os gatilhos nas tabelas da Água, do Corpo, do al e do Treino; tem corpo `plpgsql` (exceção de gatilho: vai pelo SQL Editor do Supabase, ver as diretrizes). Tabela nova de app entra no histórico por migration nova aqui (`01`, …), só com `create trigger` reaproveitando `registrar_historico_hub` (formato DataGrip). O formato é conferido em `tests/hub.test.mjs` e a numeração em `tests/documentacao.test.mjs`.
- **Testes:** funções em `tests/habitos.test.mjs` (estado do dia, ofensivas, proteções); estrutura em `tests/hub.test.mjs` (lista de hábitos, PWA, service workers, workflows, `perfil.js`, migration da raiz); navegador em `tests/navegacao.test.mjs` (Chromium com o Supabase falso de `tr/tests/helpers/app.mjs`: login, hábitos com os dados dos apps e os apps abrindo com a mesma sessão); documentação em `tests/documentacao.test.mjs`. `node scripts/check.mjs` roda tudo isso e a validação de cada app; o mesmo roda no GitHub Actions.
- **Pacotes:** `supabase.js` (2.118.0, cópia de `tr/supabase.js`) e o Playwright de `tr/`. Nenhum `package.json` na raiz.
- **Backups:** a página inicial só lê; não tem dado próprio além da cópia `hub-habitos.<conta>`, que se refaz dos dados dos apps. Guarda o histórico dos apps em `hub_historico`.
- **Domínio:** `https://vcl02.github.io/hub/` (GitHub Pages, sem domínio próprio). Externos: Supabase, `calendar.google.com` (Agenda), `wa.me` (Anotações) e, no workflow, `api.resend.com`. Mudar de domínio: passo a passo nas diretrizes.

## Dados e segurança

- Os apps usam o mesmo projeto Supabase (`fin`, tabelas `tr_*`, `al_*`, `corpo_*`, `agua_*` e `push_*`), pelo cliente do navegador e com a chave publicável. Nunca coloque chave de serviço nem segredo no repositório, que é público.
- Edge Functions (código versionado, publicado por deploy pelo mantenedor): `fin/supabase/functions/captura-nubank` `al/supabase/functions/al-estimar` (IA do al; a chave da Anthropic fica só no secret `ANTHROPIC_API_KEY`) e `agua/supabase/functions/agua-lembrete` (notificações da Água, chamada de hora em hora pelo pg_cron, e a de escovar os dentes, 20 min depois de lançar comida no al; chaves VAPID só na tabela `push_chave`).
- O al só lê `tr_treino` e `corpo_medida` (treinos e peso para o gasto do dia); o tr só lê `corpo_medida`; o Corpo só lê `agua_dia` (água do dia, para a bexiga); o al também lê `agua_dia` (bebidas com calorias, que contam como comido). `tr_medida` (onde o tr gravava as pesagens) foi copiada para `corpo_medida` pela migration `corpo/00` e depois apagada pelo mantenedor (por isso a `corpo/00` não roda de novo).
- Conta `DONO` recriada em 24/10/2026 (id novo em `hub.js` e `tr/js/config.js`; policies trocadas pelas migrations `fin/40` e `tr/04`). Apagar a conta apaga as linhas `tr_*` (on delete cascade): para trocar senha, use a troca de senha, nunca recrie a conta.
- **Nunca perder dado (desde 27/10/2026, quando uma cópia velha do celular apagou a água do dia):**
  - **Envio que mescla:** app com cópia local envia por diferença para a base e, nas listas do dia (água, evacuações, xixis, caminhada), **mescla** com o que está na nuvem agora (o que este aparelho acrescentou ou tirou desde a base), nunca sobrescreve o dia inteiro nem apaga o dia só por não conhecê-lo. App novo com lista no dia nasce assim.
  - **Base normalizada:** a base guardada no aparelho passa pela mesma limpeza do db antes de comparar; mudança só de formato nunca vira "pendente".
  - **Envio sem resposta não duplica:** antes de mandar uma lista mesclada, o app guarda como cada dia vai ficar na nuvem (`<app>.voo.<conta>`); na tentativa seguinte, o dia que já está exatamente assim chegou, e a base dele passa a ser isso (senão a mescla somaria de novo o que já subiu). Teste "metrô" em cada app com lista no dia.
  - **Limite de tempo na rede:** todo cliente do Supabase (hub, tr, al, Corpo, Água) usa `fetchComTeto` (15 s, a função 40 s): pedido que perde o sinal no meio vira falha de rede e não prende o envio nem a busca. O Fin tem o seu (`fetchComLimite`, 12 s).
  - **Toque repetido sem querer:** botão que acrescenta à lista (+ml, +1, Andei +) ignora a mesma ação em menos de 0,5 s (`repetido` no `js/util.js` de cada app); o que grava no banco direto (Fin) fica travado enquanto o pedido está no ar.
  - **Mudou o formato de uma tabela ou do db?** Teste com cópia e base do formato antigo no aparelho e outro aparelho mexendo no mesmo dia (os testes "dois aparelhos" e "formato antigo" de cada app).
  - **Histórico:** `hub_historico` (migration da raiz `migrations/00`) guarda antes e depois de toda linha alterada ou apagada nas tabelas da Água, do Corpo, do al e do Treino; o Fin tem o `fin_historico`. Recuperar dado é ler dali.
- Migration nova não segura o push: faça o push junto com ela e informe o que aplicar; o mantenedor roda a migration logo depois.
- Qualquer operação remota que mude estado no Supabase (dados, esquema, RLS, Auth) exige confirmação explícita do mantenedor, com alvo e efeito informados. Consultas só de leitura podem apoiar diagnóstico (`.mcp.json` já é somente leitura).
