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
- Ressalvas, pendentes:
  - `tests/estrutura.test.mjs`: `balanceamento` confere cada tag por si (abre e fecha o mesmo número de vezes). Perdeu a ordem de fechamento entre tags diferentes: um fechamento fora de lugar pode passar. Não há regex no lugar; essa ordem fica sem teste.
  - `js/bootstrap.js`: a linha `else if (!irParaLoginDoHub()) telaLogin()` não tem teste próprio. `irParaLoginDoHub` é testado em `tests/ajustes.test.mjs`; a ramificação só roda no navegador.
  - Concorrência (observado em 02/11/2026): rodando os 11 arquivos de `tr/tests` juntos (`node --test`), 3 testes de navegador falharam (um clique esperou 30 s; dois valores de tela não bateram). Cada arquivo, sozinho, passou. Pode ser máquina ocupada: antes de dar um teste de navegador por estável, rodar 5 vezes (`docs/DIRETRIZES.md`, seção 3).
