# Guia de manutenção da Água (`agua`)

## Propósito e fontes de verdade

- App estático (HTML/CSS/JavaScript clássico, sem build): água bebida (ml, com horário) e idas ao banheiro (xixi), para entender quanto dá para beber por dia sem ficar insustentável. Lembretes dentro do app e por notificação de verdade (Web Push), com as mesmas regras.
- `docs/REGRAS.md` é a fonte de verdade das regras e do comportamento visível; `README.md` tem a implantação. Guia geral do hub em `../AGENTS.md`.

## Arquitetura

- `index.html` é o único documento; um stylesheet só (`css/agua.css`).
- Scripts clássicos nesta ordem, depois de `../supabase.js` (do hub) e `../corpo/perfil.js` (módulo do Corpo: `ROTINA` com os dias presenciais): `config`, `util`, `banco`, `conta`, `notificacoes`, `telas`, `bootstrap`. A 1ª linha de cada um diz a responsabilidade.
- Arquivo novo em `css/` ou `js/` entra no `index.html` e no `ARQUIVOS_ESTATICOS` do `sw.js` (`tests/estrutura.test.mjs` confere). Cache `agua-estatico`; o service worker só apaga caches `agua-`.
- Todo arquivo `.js`, `.mjs`, `.css` e `.sql` começa com um comentário curto de responsabilidade.

## Dados e segurança

- Tabela `agua_dia` (1 linha por dia: `aguas` e `xixis` em listas), só a conta `DONO` (RLS `somente_dono` + restritiva `somente_victor`), `anon` sem acesso. Migration nova e numerada em `migrations/`, formato do DataGrip; o mantenedor aplica.
- Cópia local primeiro, envio por diferença (`js/banco.js`). As listas da base são cópias: editar o dia não pode mexer na base.
- Notificações: Edge Function `supabase/functions/agua-lembrete` (deploy com `verify_jwt` desligado: o agendamento chama sem sessão) e migration `01` (`push_inscricao`, `push_chave`, pg_cron de hora em hora no minuto 1). Push sem conteúdo (o texto fica no `sw.js`), sem biblioteca de criptografia: só a assinatura VAPID (ES256, WebCrypto).
- As chaves VAPID e o token do agendamento nascem na função e ficam só em `push_chave` (sem policy: só a chave de serviço e o banco leem). Nunca no código, no repositório nem no chat. A função repete `PRESENCIAL`, `INICIO`/`FIM` e `DONO` (Deno não carrega `../corpo/perfil.js`); os testes conferem que batem com o app.
- O futuro módulo Hábitos pode ler `agua_dia` (só leitura).

## Como concluir uma mudança

1. Atualize `docs/REGRAS.md`.
2. Ajuste os testes (`tests/agua.test.mjs` e `tests/notificacoes.test.mjs` no navegador, com o Playwright do `tr/node_modules` e o Supabase falso de `tests/helpers/app.mjs`; `tests/funcao.test.mjs` roda a função de verdade com rede falsa; `tests/estrutura.test.mjs`).
3. Rode `node scripts/check.mjs` dentro de `agua/` e, antes do push, na raiz do hub.
4. Commit e push conforme `../AGENTS.md`.
