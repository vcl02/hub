# Decisões de arquitetura

O porquê das escolhas do Treino. A regra vigente fica em `REGRAS.md`; o jeito de trabalhar, em `../AGENTS.md`; o que vale para todos os apps, em `../../docs/DIRETRIZES.md`.

## Estático, sem build

- Um `index.html` com uma `<section class="view">` por tela e scripts clássicos em ordem fixa, como no Fin: abre direto do GitHub Pages, sem bundler, e a ordem de carga é um contrato testado (`tests/estrutura.test.mjs`).

## Funciona na academia sem internet

- O app grava primeiro a cópia local e envia ao Supabase só a diferença, 0,8 s depois de cada mudança; sem internet, fica pendente e envia ao reconectar.
- `supabase.js` é uma cópia local do `@supabase/supabase-js` (UMD), não CDN como no Fin, para o app abrir sem internet.
  A página inicial do hub usa a mesma cópia (`../supabase.js`, igual byte a byte).
- `sw.js` busca da rede primeiro e só usa o cache sem internet; não intercepta Supabase nem fontes.

## Mínimo do Supabase

- Plano gratuito: nada de Storage, Edge Functions ou Realtime sem pedido explícito.
  Fotos das máquinas, sessão do dia, cardio em andamento e o lembrete da água ficam só no aparelho.
- Sem backup manual (baixar ou restaurar `.json`): os dados já ficam no Supabase, e o histórico de cada linha fica em `hub_historico` desde 27/10/2026.

## Conta e login

- Mesma conta do Fin e do hub; só a conta `DONO` entra (RLS da migration 02, trocada pela 04 quando a conta foi recriada em 24/10/2026).
- Conta recriada: a nuvem da conta antiga foi apagada junto (on delete cascade).
  Ao entrar com a nova, o app adota a cópia da antiga que estava no aparelho (`DONO_ANTIGO`) e reenvia tudo.
- Versão antiga com cofre criptografado (`carga.vault.v1`): juntada à conta no 1º login se a chave estava salva; não existe mais senha mestra.
- Login e Sair ficam no hub; a tela de login própria só aparece fora do hub (testes).

## Pesagens saíram para o Corpo (26/10/2026)

- `tr_medida` foi copiada para `corpo_medida` (migration `corpo/00`) e depois apagada pelo mantenedor.
  O Treino só lê as pesagens, pelo `../corpo/perfil.js`, para as calorias do treino.

## Playwright mora aqui

- O Treino veio do repositório próprio com `package.json` e Playwright.
  Os testes de navegador da raiz, do al, do Corpo e da Água reaproveitam essa instalação em vez de cada um ter a sua.

## Botões com texto, por enquanto

- O mantenedor quer migrar para botões só com ícone, como no Fin, depois de se acostumar com o app; até ele pedir, fica o texto.

## Auditoria dos testes (02/11/2026)

- Sem navegador agora: `tests/banco.test.mjs` (formato do db com os formatos antigos, linhas para o Supabase e de volta, junção com a versão antiga, login por usuário), `tests/piramide.test.mjs` (pirâmide, unidades, planos por mês) e `tests/sessao.test.mjs` (início do treino, fechamento por inatividade, um treino por dia, passagem entre dias). As funções saem dos `js/` publicados por `tests/helpers/js.mjs`, com relógio fixo e o estado do app. `tests/funcoes.mjs` ganhou o parâmetro `depois` em `carregar`, que expõe um `let` do arquivo.
- Navegador: de 59 para 27 testes, contando os arquivos de `tr/tests` que abrem o navegador (contagem de 02/11/2026; o relatório dizia 41 para 22, a conferir).
- Continua em Playwright: `treino`, `calistenia` e `cardio` (série, descanso e finalização na tela, com o que a tela grava), `nuvem` (dois aparelhos, sem internet, login), `dias` (arrasto, ‹ ›, ← →, `?dia`) e `ajustes` (Esc, atualização da versão, ícones). Gesto e layout ficam aqui porque só o navegador mede.
- Ressalvas fechadas em 02/11/2026:
  - `tests/estrutura.test.mjs`: a ordem de fechamento entre tags diferentes é conferida por `aninhamento(html)` (`fin/tests/helpers/html.js`, reexportado por `tests/leitores.mjs`), uma pilha em que cada fechamento tem de casar com a última etiqueta aberta. `</div>` com `<p>` aberto vira violação. `balanceamento` continua conferindo cada tag por si. Prova: `fin/tests/helpers-html.test.js` (ordem trocada, fecho sem abertura, abertura sem fecho) e a `index.html` real do Tr.
  - `js/bootstrap.js`: a linha `else if (!irParaLoginDoHub()) telaLogin()` tem teste em `tests/estrutura.test.mjs`, que roda o `bootstrap.js` em `node:vm` com `rodarBootstrapApp` (`tests/bootstrap-falso.mjs`): com sessão carrega o app; sem sessão, dentro do hub vai ao login do hub (`../?volta=…`); fora do hub mostra `telaLogin`.
  - Concorrência (observada em 02/11/2026: 3 testes de navegador falhavam com os 11 arquivos juntos): a causa era o relógio falso. `abrirApp` (`tests/helpers/app.mjs`) instalava `pg.clock`, que seguia correndo em tempo real, então o cronômetro somava os segundos entre um toque e o seguinte numa máquina cheia (181000 em vez de 180000). Agora o relógio nasce 5 min antes do horário pedido (cobre a carga e o login) e é pausado com `pauseAt` no horário pedido; `sincronizado` anda 800 ms no relógio pausado. Provado com 5 rodadas seguidas e 4 em paralelo. A regra está em `docs/DIRETRIZES.md`, seção 3. A correção nasceu aqui e foi generalizada em 02/11/2026: o relógio agora é `tests/relogio.mjs`, o mesmo para todos os apps e a raiz.
