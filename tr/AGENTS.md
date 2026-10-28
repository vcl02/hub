# Guia de manutenção do Treino (`tr`)

## Propósito e fontes de verdade

- App estático (HTML/CSS/JavaScript clássico, sem build) para registrar a evolução de carga na academia. Usa o Supabase do projeto `fin` (tabelas com prefixo `tr_`) somente pelo cliente do navegador.
- `docs/REGRAS.md` é a fonte de verdade das regras e do comportamento visível. Não duplique regras aqui: atualize aquele arquivo quando uma regra mudar.
- `docs/DECISOES.md` guarda o porquê das decisões de arquitetura. Este arquivo define como trabalhar no repositório. Em caso de conflito, uma solicitação explícita do usuário vence este guia.

## Arquitetura

- O Treino mora em `tr/` do repositório `vcl02/hub`, publicado junto com a página inicial do hub e os outros apps (guia geral em `../AGENTS.md`). Dentro de `tr/`, `tr/index.html` é o único documento: cada tela é uma `<section class="view">`. Não crie outras páginas HTML nesta pasta nem introduza framework sem decisão explícita.
- Os estilos são carregados nesta ordem (cascata): `css/base.css`, `inicio.css`, `telas.css`, `flutuantes.css`, `exercicio.css`, `resumo.css`, `cardio.css`.
- Os scripts clássicos são carregados nesta ordem, depois de `supabase.js` e do módulo do app Corpo (`../corpo/perfil.js`: `PERFIL`, `idadeEm`, `tmb`, `kcalTreino`, `kcalEsteira`, `medidasGuardadas`, `lerMedidas`, `pesoNoDia`; o Treino só lê as pesagens, nunca grava): `config`, `util`, `piramide`, `banco`, `login`, `pontos`, `inicio`, `exercicio`, `treino`, `cardio`, `series`, `interacoes`, `ajustes`, `bootstrap`. Eles compartilham o escopo global: código que roda ao carregar (não dentro de função) só pode usar o que veio de um arquivo anterior. Preserve a responsabilidade de cada módulo, descrita na 1ª linha dele.
- Arquivo novo em `css/` ou `js/` entra no `index.html` e no `ARQUIVOS_ESTATICOS` do `sw.js`; o teste `tests/estrutura.test.mjs` confere.
- `supabase.js` é o `@supabase/supabase-js` copiado byte a byte (UMD) para funcionar offline: atualize versão e arquivo juntos, de preferência para uma versão publicada há pelo menos duas semanas.
- `sw.js` busca da rede primeiro e só usa o cache sem internet; não intercepta outros domínios (Supabase, fontes). Ao criar arquivo estático novo, inclua-o em `ARQUIVOS_ESTATICOS`.
- Todo arquivo `.js`, `.mjs`, `.css` e `.sql` começa com um comentário curto de responsabilidade.

## Regras de dados e segurança

- Login por e-mail e senha do Supabase (mesma conta do fin). Só a conta `DONO` (`js/config.js`) entra, e o RLS das tabelas `tr_*` só libera essa conta (migration 02). Nova policy ou grant precisa preservar isso; `anon` não tem acesso.
- A chave do Supabase em `js/config.js` é a publicável; nunca coloque chave de serviço nem segredo no repositório, que é público.
- Consultas somente de leitura ao Supabase (`SELECT`, schema, advisors, logs) podem ser feitas para diagnóstico. A disponibilidade de uma ferramenta de escrita no MCP não é autorização para usá-la.
- Antes de qualquer operação remota que mude estado — `INSERT`, `UPDATE`, `DELETE`, `UPSERT`, `CREATE`/`ALTER`/`DROP`, grants, RLS, Auth, Storage ou execução de migration — peça confirmação explícita do mantenedor nesta conversa, com alvo e efeito informados. Não crie dados de teste no banco: os testes usam um Supabase falso em memória.
- Preserve migrations aplicadas. Para mudar o esquema, crie uma migration nova e numerada em `migrations/`; não reescreva as históricas.
- Migrations seguem o formato do DataGrip, que parte o script em **cada** `;`: nenhum bloco `do $$`, nenhum `;` em comentário, tudo entre `begin;` e `commit;`. Depois que o mantenedor aplicar, confira o resultado com `SELECT` antes de declarar aplicada.
- O app grava primeiro a cópia local e envia ao Supabase só a diferença; mudanças no formato do `db` precisam continuar compatíveis com `linhas()`/`deLinhas()` e com a cópia local já gravada nos aparelhos.

## Infraestrutura

Resolução deste app para cada item de `../docs/DIRETRIZES.md` (o que vale para todos fica lá).

- **Migrations:** `migrations/` 00 a 07, formato DataGrip, RLS só do dono em todas as `tr_*`; conferido em `tests/estrutura.test.mjs`, numeração em `../tests/documentacao.test.mjs`.
- **Testes:** Playwright + `node:test`, um arquivo por área (`treino`, `pontos`, `nuvem`, `ajustes`, `calistenia`, `cardio`), com servidor e Supabase falso em `tests/helpers/app.mjs` (o teste de navegação da raiz usa o mesmo Supabase falso); funções e estrutura em `tests/estrutura.test.mjs`.
- **Pacotes:** o único `package.json` do hub: `playwright` 1.56.1 (com `package-lock.json`), que serve também à raiz, ao al, ao Corpo e à Água. Instalar: `npm ci` e `npx playwright install chromium` dentro de `tr/`. `supabase.js` é o `supabase-js` 2.118.0, igual byte a byte ao da raiz.
- **Backups:** cópia no aparelho (`tr.db.<usuário>`, base em `tr.base.<usuário>`) e `hub_historico` com `tr_treino`, `tr_registro`, `tr_exercicio` e `tr_variacao` (migration `00` da raiz). Sem backup manual em `.json`. Fotos das máquinas ficam só no aparelho, sem cópia.
- **Domínio:** `/hub/tr/`. Externo: só o Supabase.

## Como concluir uma mudança

1. Mapeie a regra afetada em `docs/REGRAS.md` e atualize-a na mesma alteração.
2. Acrescente ou ajuste testes de regressão em `tests/`: um arquivo por área (`treino`, `pontos`, `nuvem`, `ajustes`) com Playwright + `node:test` e a infra em `tests/helpers/app.mjs` (servidor, Supabase falso); `estrutura.test.mjs` protege cabeçalhos, HTML/CSS balanceados, ordem de carga, PWA, migrations/RLS e segredos.
3. Rode `node scripts/check.mjs` dentro de `tr/` (sintaxe, higiene textual do `.editorconfig`, testes e `git diff --check`) e, antes do push, também na raiz do hub (página inicial, fin e tr juntos). Informe precisamente o que foi validado; não alegue validação no celular ou no Supabase real se ela não ocorreu.
4. Depois de os testes passarem, faça commit e push para `origin/main` do `vcl02/hub`. Nunca inclua alterações alheias no commit.
5. Trabalhe direto na branch `main`: projeto pessoal, sem fluxo de PR. Não crie worktree, branch auxiliar nem peça revisão antes de puxar pra `main`.

## Preferências do mantenedor

- Prefira mudanças pontuais que preservem o restante do comportamento.
- Para cada nova feature ou correção, regras e testes são parte obrigatória da entrega.
- Ao relatar a entrega, diferencie teste local, validação no celular e validação integrada com o Supabase.
- Use o mínimo de recursos do Supabase (plano gratuito): nada de Storage, Edge Functions ou Realtime sem pedido explícito. Fotos das máquinas e lembretes ficam só no aparelho.
- **Botões só com ícone (futuro):** o mantenedor quer migrar os botões de ação para só ícone, como no fin, depois de se acostumar com o app. Até ele pedir, mantenha o texto; quando migrar, todo ícone ganha `title` e `aria-label`.
- Textos curtos em português. O app é só do mantenedor: nada de textos explicando como usar o app; a tela de login é só usuário e senha.
