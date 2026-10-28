# Diretrizes gerais do hub

Valem para a página inicial (raiz) e para todos os apps (`fin/`, `tr/`, `al/`, `corpo/`, `agua/`).
Aqui fica só o que se repete.
O que é de um projeto fica na seção **Infraestrutura** do `AGENTS.md` dele (Migrations, Testes, Pacotes, Backups, Domínio), com a resolução própria.
Projeto que foge de uma diretriz escreve a exceção no próprio `AGENTS.md` e o motivo no próprio `docs/DECISOES.md`.
Pedido explícito do mantenedor vence tudo.

## Projetos

| Projeto | Pasta | Endereço | Tabelas próprias | Migrations | Edge Function |
|---|---|---|---|---|---|
| Hub (página inicial) | raiz | `/hub/` | `hub_historico` (as dos apps, só lê) | `migrations/` 00 | — |
| Fin | `fin/` | `/hub/fin/` | `fin`, `fin_ciclo`, `fin_meta`, `fin_historico` | 00 a 41 | `captura-nubank` |
| Treino | `tr/` | `/hub/tr/` | `tr_exercicio`, `tr_variacao`, `tr_registro`, `tr_treino` | 00 a 07 | — |
| Alimentação | `al/` | `/hub/al/` | `al_item`, `al_registro`, `al_dia`, `al_uso` | 00 a 02 | `al-estimar` |
| Corpo | `corpo/` | `/hub/corpo/` | `corpo_medida`, `corpo_dia` | 00 a 05 | — |
| Água | `agua/` | `/hub/agua/` | `agua_dia`, `push_inscricao`, `push_chave`, `push_agendado`, `push_ultimo` | 00 a 02 | `agua-lembrete` |

Todos usam o mesmo projeto Supabase e a mesma conta `DONO`.

## 1. Documentação: AGENTS, REGRAS, DECISOES

Todo projeto tem os três (o teste `tests/documentacao.test.mjs` confere):

| Arquivo | Guarda | Não guarda |
|---|---|---|
| `AGENTS.md` | Como trabalhar: arquitetura, ordem de carga, dados e segurança, **Infraestrutura**, como concluir uma mudança | Regra de negócio (vai para o REGRAS) |
| `docs/REGRAS.md` | Fonte de verdade do comportamento visível e das contas | Como mexer no código |
| `docs/DECISOES.md` | O porquê das escolhas, alternativas descartadas e problemas que já aconteceram (com data) | Regra vigente repetida |

- Opcionais: `README.md` (o que é e a implantação: migration, secret, deploy) e `docs/CHECKLIST-PUBLICACAO.md` (conferência manual; fin e tr).
- Mudou uma regra: o REGRAS muda no mesmo commit.
  Escolheu entre caminhos ou corrigiu um problema que pode voltar: entrada no DECISOES.
  Mudou o jeito de trabalhar: AGENTS.
- Uma informação num lugar só; os outros apontam para ela (ex.: "ver `../docs/DIRETRIZES.md`").
- Português, frases curtas, datas absolutas (dd/mm/aaaa).
- Todo `.js`, `.mjs`, `.ts`, `.css` e `.sql` começa com um comentário curto de responsabilidade.

## 2. Migrations

- Uma pasta `migrations/` por projeto, só com as tabelas dele.
  O que cruza apps (ex.: o histórico de todas as tabelas) fica em `migrations/` da raiz.
- Nome `NN-o-que-faz.sql`, numeração seguida a partir de `00`, sem pular nem repetir (`tests/documentacao.test.mjs` confere).
- Migration aplicada nunca é reescrita: correção é migration nova.
- 1ª linha `-- ` com o que faz; o cabeçalho diz onde aplicar, depois de qual e se roda de novo.
- **Formato DataGrip** (o mantenedor aplica lá, e o DataGrip parte o script em cada `;`):
  tudo entre `begin;` e `commit;`, nenhum `do $$`, nenhum `;` em comentário nem dentro do comando de `cron.schedule`, função em `language sql` com uma expressão sempre que der.
  Motivo e histórico em `fin/docs/DECISOES.md`, "Migrations no DataGrip".
- **Exceção: função de gatilho.** Gatilho exige `plpgsql`, com `;` dentro de `$$`.
  Hoje são três: `fin/migrations/27` (aplicada pelo MCP em duas partes, ver `fin/docs/DECISOES.md`), `migrations/00` (raiz) e `agua/migrations/02`.
  1. Primeiro, reaproveitar uma função de gatilho que já existe: o gatilho novo é só `create trigger … execute function …`, sem `plpgsql` (ex.: `fin/41` usa a `registrar_historico` da 27; tabela nova da Água, do Corpo, do al ou do Treino usa a `registrar_historico_hub` da `00` da raiz).
  2. Função nova inevitável: o cabeçalho avisa que tem corpo `plpgsql` e que não vai pelo DataGrip.
     Aplicar pelo **SQL Editor do painel do Supabase**, colando o arquivo inteiro e rodando de uma vez.
     Recomendação: o SQL Editor manda o script inteiro, sem partir em `;`; não testei isso a partir deste repositório.
  3. Saber se já foi aplicada (só leitura, no DataGrip ou no SQL Editor): `select to_regclass('public.hub_historico');` para a `00` da raiz e `select to_regclass('public.push_ultimo');` para a `agua/02`. Vazio = não aplicada.
- Idempotente: rodar de novo não muda nada (`if not exists`, `drop … if exists` antes de `create trigger`/`create policy`, filtros).
- Pré-requisito que falha sozinho: `select 'public.x'::regclass;`, nunca `if` procedural.
- Tabela nova: RLS ligado, `revoke all … from anon`, policy só da conta `DONO` (`somente_dono` + restritiva `somente_victor` nos apps novos).
  Tabela de sistema (ex.: `push_chave`) fica sem policy: só o banco e a chave de serviço da função leem.
- Tabela nova de app entra no histórico na mesma leva: gatilho para `hub_historico` (migration nova na raiz) ou, no Fin, para `fin_historico`.
- O app convive com a migration ainda não aplicada: sem a tabela, degrada e segue (ex.: Corpo sem `corpo_dia`, `agua-lembrete` sem `push_ultimo`), nunca quebra.
- Aplicação: só o mantenedor.
  O push não espera a migration; a entrega diz o que aplicar e em que ordem.
  Depois de aplicada, um `SELECT` confirma antes de dizer "aplicada".
  Script abortado: `rollback;` antes de tentar de novo.
- Migration de dados: prévia só de leitura (quantas linhas, quais grupos) antes de entregar.
  Destrutiva (`drop`, `delete`, `update` em massa): ver Backups.

## 3. Testes: funções e Playwright

- Só `node:test`; nada de Python nem outro framework.
- Nenhum dado de teste no Supabase real: os testes usam um Supabase falso em memória.
- Camadas, em todo projeto que tem a peça correspondente:
  1. **Funções** (sem navegador): regras e contas puras (ex.: `tests/habitos.test.mjs`, `fin/tests/*.test.js`, o `perfil.js` em `tests/hub.test.mjs`).
  2. **Navegador** (Playwright + Chromium): o app servido localmente com o Supabase falso de `tests/helpers/app.mjs`.
     Cobre login, cópia local, envio por diferença e, onde há lista no dia, os casos "dois aparelhos" e "formato antigo".
  3. **Estrutura** (`estrutura.test.mjs` ou equivalente): cabeçalhos, HTML/CSS balanceados, ordem de carga igual no `index.html` e no service worker, PWA, migrations no formato e com RLS, nenhum segredo (`service_role`, `sb_secret_`, chave da Anthropic).
  4. **Edge Function**: o código da função roda de verdade com rede e SDK falsos (`al/tests/funcao.test.mjs`, `agua/tests/funcao.test.mjs`, `fin/tests/captura-nubank.test.js`).
- **Playwright numa instalação só:** `tr/package.json`.
  Os outros carregam de lá: `createRequire(path.join(HUB, 'tr', 'package.json'))('playwright')`.
  Não crie `package.json` em outro projeto só para testar.
- `node scripts/check.mjs` em cada projeto: sintaxe (`node --check`), higiene textual do `.editorconfig` (sem tab, sem espaço no fim, newline final), testes e `git diff --check`.
  Na raiz roda tudo; o GitHub Actions (`.github/workflows/validacao.yml`) roda o mesmo em todo push.
- Feature nova: regra + teste. Correção: teste de regressão que falhava antes.
- No relato, separar teste local, navegador local, celular e Supabase real; nunca alegar o que não rodou.

## 4. Pacotes

- Sem build, sem bundler e sem `node_modules` publicado: os apps são HTML/CSS/JavaScript clássico servidos como estão.
- Inventário (a fonte é o arquivo citado):

| Pacote | Versão | Onde | Como |
|---|---|---|---|
| `playwright` | 1.56.1 | `tr/package.json` + `tr/package-lock.json` | Só testes (raiz, tr, al, corpo, agua) |
| `@supabase/supabase-js` | 2.118.0 | `supabase.js` (raiz) e `tr/supabase.js`, iguais byte a byte | Cópia UMD, abre sem internet; raiz, tr, al, corpo, agua |
| `@supabase/supabase-js` | 2.118.0 | `fin/index.html` | jsDelivr com `integrity` igual ao hash da cópia da raiz (`fin/tests/pwa.test.js` confere) |
| `chart.js` | 4.4.1 | `fin/index.html` | jsDelivr com `integrity` |
| `@anthropic-ai/sdk` | 0.133.0 | `al/supabase/functions/al-estimar/index.ts` | `npm:` no Deno |
| `@supabase/functions-js` (tipos) | 2.118.0 | as três Edge Functions | `jsr:@supabase/functions-js@2.118.0/edge-runtime.d.ts`, só os tipos do editor |

- Versão exata sempre (nunca `@2`, `^`, `~`, nem import sem versão), de preferência publicada há pelo menos duas semanas.
- `supabase-js` na mesma versão em todos os apps (mesma origem, mesma sessão), e os tipos `jsr:@supabase/functions-js` das Edge Functions na mesma versão dele: atualizar tudo junto (`tests/documentacao.test.mjs` confere).
- CDN só com `integrity` (sha384); atualizar versão, arquivo e hash juntos (como fazer em `fin/docs/DECISOES.md`, "Dependências externas fixadas").
- App que precisa abrir sem internet usa cópia local, não CDN.
- `supabase.js` da raiz e do tr mudam juntos (o teste confere que são iguais).
- Pacote novo só com entrada no DECISOES do projeto: o que resolve e por que não dá sem.
- Atualizar o Playwright: em `tr/`, `npm install -D playwright@<versão exata>` e `npx playwright install chromium`; depois `node scripts/check.mjs` na raiz.
  O hook de início das sessões na nuvem (`.claude/hooks/session-start.sh`) reinstala sozinho.

## 5. Backups

O que existe hoje (conferido no repositório):

| Camada | Cobre | Onde |
|---|---|---|
| Código | Todo o repositório, com histórico | GitHub `vcl02/hub` e os clones |
| Histórico no banco | Antes e depois de cada linha inserida, alterada ou apagada | `fin_historico` (`fin` e `fin_ciclo` pela migration `fin/27`, `fin_meta` pela `fin/41`) e `hub_historico` (Água, Corpo, al e Treino, migration `00` da raiz) |
| Cópia no aparelho | O banco do app naquele aparelho (`localStorage`) | Uma chave por app e conta (ex.: `tr.db.<conta>`) |
| Exportação do Fin | O recorte filtrado | Download no próprio Fin |
| Backup do Supabase | Não tem: o plano atual (gratuito) não faz backup, segundo o mantenedor em 28/10/2026 | — |

Diretriz:

- Recuperar dado = ler `hub_historico` ou `fin_historico` (`SELECT`) e montar a correção; aplicar só com confirmação do mantenedor.
- Antes de migration destrutiva ou correção em massa: as linhas afetadas ficam guardadas antes (exportadas pelo mantenedor no DataGrip, ou copiadas pela própria migration para `<tabela>_bkp_<aaaammdd>`).
- Tabela nova de app entra no histórico (ver Migrations).
- Nunca recriar a conta `DONO`: apagar a conta apaga as linhas `tr_*` (on delete cascade). Senha se troca, conta não.
- Envio que mescla e base normalizada (ver "Nunca perder dado" em `../AGENTS.md`) valem para todo app com cópia local.
- Dump do banco nunca entra no repositório (público) nem em artefato do GitHub Actions sem criptografia: tem dados pessoais e financeiros.

**Nenhuma cópia fora do projeto Supabase** (decisão do mantenedor, 28/10/2026: por enquanto, sem backup além do DataGrip).
Se o projeto for perdido, os dois históricos vão junto.
O único caminho de cópia é o mantenedor exportar as tabelas pelo DataGrip quando quiser, guardando o arquivo fora do repositório.
Nenhum app, workflow ou script faz backup automático; mudar isso é decisão nova, registrada no `docs/DECISOES.md` da raiz.

## 6. Domínios e endereços

- Publicação: GitHub Pages do `vcl02/hub`, sem domínio próprio (não há `CNAME`): `https://vcl02.github.io/hub/`, endereço que os testes da Água usam.
  Cada app numa subpasta (`/hub/fin/`, `/hub/tr/`, `/hub/al/`, `/hub/corpo/`, `/hub/agua/`).
- Caminhos sempre relativos (`./`, `../`).
  Nenhum arquivo de app tem o domínio escrito (só os testes); continue assim.
- Mesma origem para todos: prefixos de `localStorage` e cache por app (ver `../AGENTS.md`).
- Domínios externos (lista fechada; um novo entra aqui e no AGENTS do projeto):

| Domínio | Para quê | Quem |
|---|---|---|
| `yzmyncxoskvqzdczaill.supabase.co` | Banco, Auth e `functions/v1/*` | Todos |
| `cdn.jsdelivr.net` | `supabase-js` e `chart.js` | Fin |
| `api.anthropic.com` | IA, pelo SDK | Só a função `al-estimar` |
| Serviço de push do navegador | Endpoint de cada inscrição | Só a função `agua-lembrete` |
| `api.resend.com` | E-mail de publicação | Workflow `avisar-pages-publicado.yml` |
| `calendar.google.com`, `wa.me` | Atalhos Agenda e Anotações | Página inicial |
| `mcp.supabase.com` | MCP só de leitura | `.mcp.json` (sessões do Claude Code) |

- **Mudar de domínio** (domínio próprio ou outro host) cria uma **origem nova**. Antes de trocar:
  1. Abrir todos os apps em todos os aparelhos e confirmar que não há nada pendente: `localStorage` e caches ficam na origem antiga.
  2. Contar com novo login em cada aparelho e reinstalar os apps na tela de início.
  3. Reativar as notificações da Água em cada aparelho: as inscrições de `push_inscricao` são da origem antiga.
  4. Conferir no painel do Supabase se alguma configuração de Auth usa o endereço do site (não verificado; o login é por senha).
     O CORS das funções é `*` e não muda.
  5. Atualizar esta seção, os testes da Água e o `docs/DECISOES.md` da raiz.

## 7. Pendências

1. **Migrations com função de gatilho ainda não conferidas:** a `00` da raiz e a `agua/02` (pendente em 28/10/2026) têm corpo `plpgsql`.
   Conferir se já foram aplicadas e, se não, aplicar pelo SQL Editor (ver Migrations, "Exceção: função de gatilho").
2. **`fin/41`** (histórico das metas) entregue em 28/10/2026, a aplicar no DataGrip.

Resolvidas em 28/10/2026, a pedido do mantenedor: commit e push sempre na `main`; histórico de `fin_meta` (`fin/41`); `supabase-js` 2.118.0 também no Fin; tipos das Edge Functions com versão fixa; sem backup fora do Supabase por enquanto; o plano atual do Supabase não faz backup.
