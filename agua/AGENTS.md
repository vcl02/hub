# Guia de manutenção da Água (`agua`)

## Propósito e fontes de verdade

- App estático (HTML/CSS/JavaScript clássico, sem build): água bebida (ml, com horário) contra a meta do dia. Xixi e bexiga ficam no Corpo, que lê `agua_dia` (só leitura) para os ml por xixi. Lembretes dentro do app e por notificação de verdade (Web Push), com as mesmas regras.
- `docs/REGRAS.md` é a fonte de verdade das regras e do comportamento visível; `README.md` tem a implantação. Guia geral do hub em `../AGENTS.md`.

## Arquitetura

- `index.html` é o único documento; um stylesheet só (`css/agua.css`).
- Scripts clássicos nesta ordem, depois de `../supabase.js` (do hub) e `../corpo/perfil.js` (módulo do Corpo: `ROTINA` com os dias presenciais): `config`, `util`, `banco`, `conta`, `notificacoes`, `telas`, `bootstrap`. A 1ª linha de cada um diz a responsabilidade.
- Arquivo novo em `css/` ou `js/` entra no `index.html` e no `ARQUIVOS_ESTATICOS` do `sw.js` (`tests/estrutura.test.mjs` confere). Cache `agua-estatico`; o service worker só apaga caches `agua-`.
- Todo arquivo `.js`, `.mjs`, `.css` e `.sql` começa com um comentário curto de responsabilidade.

## Dados e segurança

- Tabela `agua_dia` (1 linha por dia: `aguas` em lista; `xixis` saiu para `corpo_dia` na migration `corpo/04`), só a conta `DONO` (RLS `somente_dono` + restritiva `somente_victor`), `anon` sem acesso. Migration nova e numerada em `migrations/`, formato do DataGrip; o mantenedor aplica.
- Cópia local primeiro, envio por diferença (`js/banco.js`). As listas da base são cópias: editar o dia não pode mexer na base.
- Notificações: Edge Function `supabase/functions/agua-lembrete` (deploy com `verify_jwt` desligado: o agendamento chama sem sessão) e migration `01` (`push_inscricao`, `push_chave`, pg_cron de hora em hora no minuto 1). Push sem conteúdo (o texto fica no `sw.js`), sem biblioteca de criptografia: só a assinatura VAPID (ES256, WebCrypto).
- **Dentes** (migration `02`): gatilho em `al_registro` (só inserção, comida de hoje) agenda em `push_agendado` para 20 min depois (comida nova empurra); pg_cron de minuto em minuto tira o vencido e chama a função com `{ tipo: "dentes" }`. O push vai sem conteúdo: a função grava o tipo em `push_ultimo` e o `sw.js` pergunta em `GET ?ultimo` qual texto mostrar (sem resposta, o de água).
- As chaves VAPID e o token do agendamento nascem na função e ficam só em `push_chave` (sem policy: só a chave de serviço e o banco leem). Nunca no código, no repositório nem no chat. A função repete `PRESENCIAL`, `INICIO`/`FIM` e `DONO` (Deno não carrega `../corpo/perfil.js`); os testes conferem que batem com o app.
- **Outras bebidas** (`bebidas.js`, módulo compartilhado, carregado depois de `../corpo/perfil.js`): cada lançamento de suco, refri, cappuccino ou leite com Toddy grava `bebida` e `volume`, e `ml` é só a parte que é água (o que soma para a meta). As kcal saem de `volume` × a tabela, na hora: o al e o hábito do déficit leem `agua_dia` e contam como comido. Mudou a tabela, muda o histórico também.
- Quem lê `agua_dia` (só leitura): a página inicial (hábitos), o Corpo (bexiga) e o al (bebidas com calorias).

## Infraestrutura

Resolução deste app para cada item de `../docs/DIRETRIZES.md` (o que vale para todos fica lá).

- **Migrations:** `migrations/` 00 a 02, formato DataGrip, RLS só do Victor em `agua_dia`; tabelas `push_*` sem policy. A 02 tem função de gatilho em `plpgsql` (exceção das diretrizes) e estava pendente em 28/10/2026. Conferido em `tests/estrutura.test.mjs`, numeração em `../tests/documentacao.test.mjs`.
- **Testes:** navegador em `tests/agua.test.mjs` e `tests/notificacoes.test.mjs` (Playwright do `tr/`, Supabase falso em `tests/helpers/app.mjs`); a Edge Function em `tests/funcao.test.mjs` (rede falsa); estrutura em `tests/estrutura.test.mjs`.
- **Pacotes:** sem `package.json`. `../supabase.js` da raiz e o Playwright do `tr/`; a função não usa pacote (WebCrypto do Deno), só os tipos `jsr:`.
- **Backups:** cópia no aparelho (`agua.db.<conta>`, base em `agua.base.<conta>`) e `hub_historico` com `agua_dia`. As tabelas `push_*` ficam fora: perdida `push_chave`, a função gera chaves novas e cada aparelho precisa reativar as notificações.
- **Domínio:** `/hub/agua/`. Externos: o Supabase (inclusive `functions/v1/agua-lembrete`, chamada pelo pg_cron e pelo `sw.js`) e o serviço de push de cada navegador inscrito. Os testes usam `https://vcl02.github.io/hub/agua/`: mudou o domínio, eles mudam.

## Como concluir uma mudança

1. Atualize `docs/REGRAS.md`.
2. Ajuste os testes (`tests/agua.test.mjs` e `tests/notificacoes.test.mjs` no navegador, com o Playwright do `tr/node_modules` e o Supabase falso de `tests/helpers/app.mjs`; `tests/funcao.test.mjs` roda a função de verdade com rede falsa; `tests/estrutura.test.mjs`).
3. Rode `node scripts/check.mjs` dentro de `agua/` e, antes do push, na raiz do hub.
4. Commit e push conforme `../AGENTS.md`.
