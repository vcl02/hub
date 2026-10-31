# Diretrizes gerais do hub

Valem para a página inicial (raiz) e para todos os apps (`fin/`, `tr/`, `al/`, `corpo/`, `agua/`).
Aqui fica só o que se repete.
O que é de um projeto fica na seção **Infraestrutura** do `AGENTS.md` dele (Migrations, Testes, Pacotes, Backups, Domínio), com a resolução própria.
Projeto que foge de uma diretriz escreve a exceção no próprio `AGENTS.md` e o motivo no próprio `docs/DECISOES.md`.
Pedido explícito do mantenedor vence tudo.

## Projetos

| Projeto | Pasta | Endereço | Tabelas próprias | Migrations | Edge Function |
|---|---|---|---|---|---|
| Hub (página inicial) | raiz | `/hub/` | `hub_historico` (as dos apps, só lê) | `migrations/` 00 a 01 | — |
| Fin | `fin/` | `/hub/fin/` | `fin`, `fin_ciclo`, `fin_meta`, `fin_historico` | 00 a 41 | `captura-nubank` |
| Treino | `tr/` | `/hub/tr/` | `tr_exercicio`, `tr_variacao`, `tr_registro`, `tr_treino` | 00 a 07 | — |
| Alimentação | `al/` | `/hub/al/` | `al_item`, `al_registro`, `al_dia`, `al_marmita`, `al_uso` | 00 a 03 | `al-estimar` |
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
- Camadas, em todo projeto que tem a peça correspondente. Cada uma pega um tipo de erro; nenhuma substitui a outra:
  1. **Funções** (sem navegador, milissegundos): regras e contas puras, com a função tirada do próprio arquivo publicado (sem copiar código para o teste). Pega erro de lógica com precisão.
     Ex.: `tests/habitos.test.mjs`, `fin/tests/*.test.js` (carga em `fin/tests/helpers/carregar-funcoes.js`), o `perfil.js` em `tests/hub.test.mjs`.
     **Funções repetidas entre apps** (`tests/repetidas.test.mjs`, com `tests/funcoes.mjs`): cada cópia de `mesclar`, `diferenca`, `diaDaUrl` e `repetido` sai do arquivo do app e passa pelos mesmos casos (dois aparelhos, cópia velha, dois iguais, dia inválido, toque repetido). Até irem para `base/nucleo.js` (seção 8, passo 4), cópia que divergir falha aqui.
     **Regras próprias dos apps** (`tests/regras-apps.test.mjs`): as contas com números fixos, tiradas dos arquivos dos apps — gasto e meta do dia (`al/gasto.js` com `corpo/perfil.js`: basal, caminhada, treino previsto e feito), lembretes e limpeza do db da Água (formato antigo, bebidas), horas e nível de sono do Corpo, a pirâmide do Treino (peso e reps por série, aquecimento, completo, kg ↔ lb) e o **formato antigo** de cada app (a cópia local de uma versão anterior vira o formato de agora: Corpo, Alimentação, Treino e Água; horário impossível, como 25:61, sai).
  2. **Navegador** (Playwright + Chromium, segundos): o app servido localmente com o Supabase falso, clicando como no celular. Pega o que só a tela mostra (botão escondido, script fora de ordem, fluxo quebrado).
     Cobre login, cópia local, envio por diferença e, onde há lista no dia, os casos "dois aparelhos", "formato antigo" e "metrô" (envio sem resposta).
  3. **Estrutura** (`estrutura.test.mjs` ou equivalente): cabeçalhos, HTML/CSS balanceados, ordem de carga igual no `index.html` e no service worker, PWA, migrations no formato e com RLS, nenhum segredo (`service_role`, `sb_secret_`, chave da Anthropic), a base comum carregada e sem as cores antigas.
  4. **Edge Function**: o código da função roda de verdade com rede e SDK falsos (`al/tests/funcao.test.mjs`, `agua/tests/funcao.test.mjs`, `fin/tests/captura-nubank.test.js`).
- **O que cada projeto tem** (atualize ao mudar):

  | Projeto | Funções | Navegador | Estrutura | Edge Function |
  |---|---|---|---|---|
  | Página inicial | `tests/habitos.test.mjs`, `tests/repetidas.test.mjs`, `tests/regras-apps.test.mjs` | `tests/navegacao.test.mjs` (login, hábitos com os dados dos apps, cada app abrindo com a mesma sessão e no dia escolhido) | `tests/hub.test.mjs`, `tests/documentacao.test.mjs` | — |
  | Fin | `tests/*.test.js` (a maior parte) | `tests/navegador.test.js` (abrir, ciclo, lançar, apagar, simulação, metas, cartão), `navegador-celular.test.js` (gestos e layout no celular), `navegador-linhas.test.js` (edição na linha, série parcelada) | `tests/estrutura-*.test.js`, `tests/pwa.test.js` e outros | `tests/captura-nubank.test.js` |
  | Treino | pela raiz (`repetidas`, `regras-apps`: pirâmide) | `tests/treino`, `dias`, `ajustes`, `calistenia`, `cardio`, `nuvem`, `pontos` | `tests/estrutura.test.mjs` | — |
  | Alimentação | pela raiz (`repetidas`, `regras-apps`: gasto e meta) | `tests/dia.test.mjs` | `tests/estrutura.test.mjs` | `tests/funcao.test.mjs` (`al-estimar`) |
  | Corpo | pela raiz (`repetidas`, `regras-apps`: sono) | `tests/corpo.test.mjs` | `tests/estrutura.test.mjs` | — |
  | Água | pela raiz (`repetidas`, `regras-apps`: lembretes, limpeza do db) | `tests/agua.test.mjs`, `tests/notificacoes.test.mjs` | `tests/estrutura.test.mjs` | `tests/funcao.test.mjs` (`agua-lembrete`) |
- **Prioridade dos testes (regra geral, a pedido do mantenedor, 31/10/2026), em todo projeto:**
  1. **Código: a função rodando.** Primeira escolha sempre. A função é tirada do próprio arquivo publicado e roda com dados fixos, sem navegador (`tests/funcoes.mjs` na raiz, `fin/tests/helpers/carregar-funcoes.js` no Fin), e o teste confere o que ela devolve ou grava. Regra, conta, validação, formato antigo, sincronização, o que vai no payload: tudo aqui. Lógica presa num handler de tela? Extraia a parte pura para uma função e teste ela.
  2. **Tela (Playwright), em poucos casos estratégicos.** Só o que a função sozinha não prova: o caminho principal de cada app (abrir, lançar, apagar), gestos, layout medido no celular e a ligação entre a tela e o banco (grava uma vez só, na simulação não grava). Não é o lugar padrão de regra nenhuma: se a regra pode ser testada como função, o teste de tela não a repete.
- **Nunca regex onde ela não é estritamente necessária.** Procurar uma linha ou um trecho do código (`assert.match(js, /if \(eixo !== 'x'…/)`) não prova que funciona e quebra a cada reorganização: é proibido em teste novo. Regex só onde o próprio objeto é texto: SQL das migrations (formato, RLS), documentação, configuração (`.editorconfig`, manifest), ausência de segredos, ou a saída de uma função que o teste rodou (o HTML que ela gerou). O Fin ainda tem conferências antigas no código em conversão (eram ~900; o mapa sai de contar `assert.match` sobre o que foi lido de `js/`, `css/` e `index.html`), e elas viram teste de função (1) antes de teste de tela (2).
- **Onde pôr um teste novo:** pela prioridade acima — função primeiro; tela só se for um dos casos estratégicos; formato de arquivo, migration e segredo → estrutura (regex permitida, é texto).
- **Playwright numa instalação só:** `tr/package.json`.
  Os outros carregam de lá: `createRequire(path.join(HUB, 'tr', 'package.json'))('playwright')` (o Fin também, em `tests/navegador.test.js`).
  Não crie `package.json` em outro projeto só para testar.
- `node scripts/check.mjs` em cada projeto: sintaxe (`node --check`), higiene textual do `.editorconfig` (sem tab, sem espaço no fim, newline final), testes e `git diff --check`.
  Na raiz roda tudo, **os testes da raiz e os cinco apps ao mesmo tempo** (cada um com o próprio servidor numa porta livre e o próprio Chromium; a saída de cada um sai inteira, com o tempo): ~55 s, o tempo do mais lento. Arquivo de navegador que passa de ~20 s vale dividir por assunto (o Node roda arquivos diferentes ao mesmo tempo): foi assim com `tr/tests/dias.test.mjs`. O GitHub Actions (`.github/workflows/validacao.yml`) roda o mesmo em todo push.
- Supabase falso imita o banco no que o app depende: ids numéricos, defaults de coluna (ex.: `fin_meta.status`), e `atraso` nas escritas para testar o toque repetido com o pedido no ar.
- **Sem espera fixa** (`waitForTimeout`): espere a condição (`waitForFunction` no dado salvo, na tela trocada, em `document.getAnimations()` sem animação rodando, como no `arrastar` de `tr/tests/helpers/app.mjs`). Espera fixa só onde o teste é justamente o tempo real (o 0,5 s do toque repetido na Água) ou a prova de que algo **não** aconteceu (um 2º pedido que não chegou).
- **Gravar e conferir sem corrida:** depois de uma ação que grava, espere o dado chegar ao Supabase falso (`esperar(() => …)` no helper do Fin) e só então a rede ficar quieta (`ocioso()`): o app pede o token antes de mandar, e a recarga em segundo plano redesenha a tela. Esperar só a rede quieta, ou um valor que o próprio teste escreveu, passa antes da gravação e falha quando a máquina está cheia. Campo digitado só grava ao sair dele (Tab), como no celular: saia antes do próximo passo. Teste novo de navegador: rode 5 vezes com a máquina ocupada antes de dar por estável.
- Teste com tempo: relógio falso (`page.clock`) em vez de esperar de verdade; toque repetido com `{ timeout: 500 }` no 2º clique (senão o Playwright espera 30 s o botão travado).
- Feature nova: regra + teste. Correção: teste de regressão que falhava antes (confira que falha: quebre o código de propósito, rode, desfaça).
- No relato, separar teste local, navegador local, celular e Supabase real; nunca alegar o que não rodou.
- **Sem prints de tela:** não tire nem abra capturas de tela (screenshot) para conferir visual, a pedido do mantenedor (gastam muito do limite de uso). Confira pelos testes e por medidas no navegador (posição, tamanho, texto, classes) e diga o que não foi visto.

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

## 8. Base comum: o mesmo visual e o mesmo código em todos os módulos

Todos os módulos (página inicial, Fin, Treino, Alimentação, Corpo e Água) são o mesmo app: as mesmas peças, só a cor de destaque, os dados e as funções mudam.
Pedido do mantenedor em 30/10/2026, feito aos poucos, passo a passo, e sempre para o app todo.

- **Visual:** `base/tokens.css` (cores, cores com significado, textos, espaços, raios, tempos) e `base/componentes.css` (cabeçalho do módulo, barra do dia com a pílula "Hoje" na cor do módulo, semana seg a dom, cartão, número grande, lista, chips, botões, campos, avisos).
  O módulo carrega os dois antes do próprio CSS, define só `--cor` e acrescenta só o que é dele; nunca redefine uma peça da base.
  Peça que falta e serve a mais de um módulo entra na base, não no módulo.
- **Referência:** `base/referencia.html` mostra cada peça em cada módulo (`/hub/base/referencia.html`). Mudou a base, a referência acompanha.
- **Ordem dos passos** (cada um vale para todos os módulos antes do próximo):
  1. Base visual e referência: criadas e aprovadas em 30/10/2026 (cores e detalhes se ajustam depois, na base, para todos).
  2. Cada módulo passa a carregar a base e troca as peças próprias pelas da base: Água, Corpo, Alimentação, Treino, página inicial e, por último, o Fin (o maior, que começa só renomeando os tokens próprios para os da base).
     Feito: Água (30/10/2026: cabeçalho, barra do dia com a pílula Hoje, cartão de destaque, chips, campo com +, lista do dia e avisos da base; o CSS próprio ficou só com a cor, os lembretes, a meta batida e os 7 dias).
     Feito: Corpo (30/10/2026: as mesmas peças, o histórico na lista da base e os horários do dia em chips; o gráfico passou a usar `--cor`).
     Feito: Alimentação (30/10/2026: as mesmas peças; a lista de comidas na lista da base, com as bebidas da Água tracejadas como vindas de outro módulo, a caminhada e as sugestões em chips; o CSS próprio ficou com a cor, as cores dos macros, o saldo, a prévia e as marmitas).
     Feito: Treino (30/10/2026: cabeçalho da base em todas as telas, barra ‹ semana › da base acima da semana, hoje com o anel da cor, cartões, barras, chips, botões e aviso da base; os estados ao lado do nome viraram o selo, peça nova da base; o CSS próprio ficou com a semana, a lista de exercícios, o registro do peso, a pirâmide, o cronômetro, o resumo e o cardio).
     Feito: página inicial (30/10/2026: é o módulo Hábitos, com o nome no cabeçalho da base; Hoje e Sair viraram botões de ícone da base, a data foi para a barra do dia da base (com ‹ › também no celular e a pílula em hoje), os hábitos e o quadro dos dias perfeitos viraram cartões sólidos (sem o vidro e os brilhos do fundo) e as cores vêm da base; o login segue com a marca do hub).
     Mesma coluna em todos (30/10/2026): largura `--largura` (560 px) na base, também na página inicial; espaço da barra de rolagem sempre reservado; a página inicial com a marca no lugar do ícone do hub, pra o título não pular; as mesmas fontes em todos.
     O servidor de teste de cada módulo entrega `../base/` (como `../corpo/perfil.js`).
     Módulo na base usa só as cores da base (`--cor`, `--ok`, `--erro`…), também no JavaScript (ex.: o gráfico): `tests/hub.test.mjs` confere.
  3. Navegação leve: transição entre páginas (`@view-transition`, ligada em todos os módulos no mesmo commit: com só uma das duas páginas aceitando, o navegador cancela a transição com erro na página; e a página que troca antes de aparecer, como o redirecionamento para o login, precisa tratar a transição cancelada), pré-carregar os módulos a partir da página inicial e um service worker só, na raiz.
  4. Núcleo de código comum (`base/nucleo.js`): cliente do Supabase com limite de tempo, login e volta ao hub, armazenamento, toast, confirmar, repetido, datas, barra do dia e o motor de sincronização (diferença, mescla e voo), testados uma vez; os módulos migram na mesma ordem do passo 2.
- Página única (cada módulo uma rota) fica fora por enquanto: seria reescrever tudo; os passos 1 a 4 dão quase a mesma sensação com bem menos risco.

## 7. Pendências

Nenhuma em aberto.

Aplicadas em 28/10/2026 pelo mantenedor, num script só pelo SQL Editor do Supabase: `fin/41`, `00` da raiz e `agua/02` (rodar de novo não muda nada, então a `00` já aplicada antes não teria mudado).
Conferidas pelo `SELECT` do fim do script: gatilho `fin_meta_historico`, `hub_historico` com os 10 gatilhos, `push_agendado`, `push_ultimo`, gatilho `agendar_dentes` e o agendamento `dentes-lembrete`.

Resolvidas em 28/10/2026, a pedido do mantenedor: commit e push sempre na `main`; histórico de `fin_meta` (`fin/41`); `supabase-js` 2.118.0 também no Fin; tipos das Edge Functions com versão fixa; sem backup fora do Supabase por enquanto; o plano atual do Supabase não faz backup.
