# Guia de manutenção do hub

## O que é

- Um repositório só (`vcl02/hub`), publicado inteiro no GitHub Pages: a página inicial na raiz e cada app numa pasta.
- `fin/` (finanças) e `tr/` (Treino) vieram dos repositórios `vcl02/fin` e `vcl02/tr` com o histórico completo (`git subtree`). Os repositórios antigos foram excluídos em 22/10/2026: o código e o histórico vivem só aqui, e os endereços antigos (`/fin/`, `/tr/`) não existem mais.
- `al/` (Alimentação: déficit calórico do dia, com IA) e `corpo/` (pesagem, barriga e os dados sobre mim; saiu do Treino) nasceram aqui em 26/10/2026, e `agua/` (água e xixi, com lembretes no app e notificações) logo depois.
- A página inicial é o módulo **Hábitos** (26/10/2026): os hábitos do dia, que levam aos apps, com ofensivas, dias perfeitos e proteções, no lugar da antiga grade de cards. Fases seguintes, nesta ordem: gráficos (e o do Fin), espelho do Google Agenda e Tarefas (CRUD, por Edge Function com o refresh token) e personalização.
- Cada app tem o próprio guia (`fin/AGENTS.md`, `tr/AGENTS.md`, `al/AGENTS.md`, `corpo/AGENTS.md`, `agua/AGENTS.md`), regras (`docs/REGRAS.md`) e testes. Este arquivo cobre só o que é do hub. Em caso de conflito, uma solicitação explícita do mantenedor vence os guias.

## Estrutura

| Caminho | O que é |
|---|---|
| `index.html` · `hub.css` · `hub.js` | Página inicial: login, os hábitos (uma linha por hábito, que abre o app) e os atalhos fixos embaixo (Fin, Agenda, Anotações). `hub.js` baixa os dados dos apps (só leitura) e desenha |
| `habitos.js` | Regras dos hábitos, só funções puras: estado de cada dia, ofensivas, dias perfeitos, proteções e o resumo de hoje (testes em `tests/habitos.test.mjs`) |
| `al/gasto.js` | Gasto e meta do dia (módulo do al), o mesmo no al e no hábito do déficit |
| `supabase.js` | `@supabase/supabase-js` (UMD), cópia byte a byte de `tr/supabase.js` (o teste confere); atualize os dois juntos. O al usa este (`../supabase.js`), sem cópia própria |
| `sw.js` · `manifest.webmanifest` · `icons/` | Instalação e cache offline da página inicial |
| `fin/` · `tr/` · `al/` · `corpo/` · `agua/` | Os apps, cada um com `index.html`, service worker e manifest próprios |
| `corpo/perfil.js` | Dados sobre mim para todos os apps: perfil (altura, nascimento, sexo), rotina da semana (`ROTINA`: dias de treino e presenciais), `idadeEm`/`tmb`, calorias do treino e da esteira (`kcalTreino`, `kcalEsteira`) e a leitura das pesagens (`lerMedidas`, `medidasGuardadas`, `pesoNoDia`); tr, al e agua carregam com `../corpo/perfil.js` |
| `tests/` | Estrutura do hub (`hub.test.mjs`), regras dos hábitos (`habitos.test.mjs`) e, no Chromium com o Supabase falso do tr, login no hub, os hábitos com os dados dos apps e os apps abrindo com a mesma sessão (`navegacao.test.mjs`) |
| `scripts/check.mjs` | Validação completa: raiz, `fin/`, `tr/`, `al/`, `corpo/` e `agua/` |
| `.github/workflows/` | Validação em todo push e e-mail de publicação do Pages (só funcionam na raiz) |
| `.claude/settings.json` · `.claude/hooks/session-start.sh` | Sessões do Claude Code na nuvem: instalam o Playwright do tr ao começar, pra validação completa rodar sempre |

## Regras do hub

- Tudo em tema escuro, com a mesma paleta (fundo `#1B1E21`, superfícies `#24272B`), mesmo com o celular no modo claro.
- **Login antes de tudo:** a página inicial abre no login (usuário `victor` ou e-mail, e senha) e só mostra os hábitos depois de entrar. Só a conta `DONO` (a mesma do tr) passa; outra conta sai na hora. Com a sessão salva, entra direto (inclusive sem internet). Sair, no canto superior direito, pede toque duplo e encerra a sessão neste aparelho para todos os apps.
- Sair existe só no hub: fin e tr não têm botão de sair.
- App aberto sem sessão (link direto, ícone antigo) vai para o login do hub com `?volta=<pasta>/…` e, depois de entrar, o hub devolve para ele. `?volta` só é aceito se for a pasta de um app da página (hábito ou atalho do hub; nunca externo, outro site ou `..`). A tela de login própria dos apps só aparece com eles servidos fora do hub (testes).
- Hábito ou atalho não fica selecionado: destaque com mouse (`@media (hover: hover)`), teclado ou toque (`.tocado`, desde o toque; a navegação para os apps do hub espera 180 ms pra ela aparecer). Ao voltar, o tocado cresce de novo e volta ao normal sozinho em 0,7 s.
- O app é só do mantenedor: na página inicial, só o login, os hábitos e os atalhos; nada de textos explicando como usar.
- Quase só celular: tudo pensado para a tela do celular em pé, com os atalhos fixos embaixo, ao alcance do polegar.
- Cada app volta para a página inicial pelo ícone do hub (a marca em traço: nó central ligado a quatro pontas; link para `../`).
- A marca do hub é `icons/hub.svg` (favicon e login; nenhum hábito ou atalho usa a marca; o título da tela dos hábitos é só o texto); `hub-32.png` (favicon de reserva), `hub-180.png` (iPhone) e `hub-192/512.png` (manifest, fundo inteiro para o sistema recortar) saem dela.
- Caminhos sempre relativos (`./`, `../`): o site roda em `/hub/`, e os apps em `/hub/fin/`, `/hub/tr/`, `/hub/al/`, `/hub/corpo/` e `/hub/agua/`.
- Mesma origem para todos: `localStorage`, caches e a sessão do Supabase são compartilhados.
  - Chaves de `localStorage` e nomes de cache sempre com prefixo do app (`fin-`, `carga-`/`tr.`, `al-`/`al.`, `corpo-`/`corpo.`, `agua-`/`agua.`, `hub-`). Nenhum service worker apaga cache de outro prefixo.
  - A sessão do Supabase (mesmo projeto, mesma chave) vale para todos os apps: entrar em um entra em todos, e Sair em qualquer um sai de todos.
- O service worker da raiz só atende os arquivos da própria página inicial (incluindo os módulos que ela carrega, `corpo/perfil.js` e `al/gasto.js`, só para ela); cada app tem o seu, com escopo na própria pasta.
- **Dados sobre mim num lugar só (app Corpo):** perfil (altura, nascimento, sexo, só no código) e o que sai dele (idade, taxa basal, calorias do treino) ficam em `corpo/perfil.js`; pesagem e barriga ficam na tabela `corpo_medida` e o registro do dia (sono e evacuações) em `corpo_dia`, que só o Corpo grava. App que usa carrega `<script src="../corpo/perfil.js">` antes dos próprios scripts e põe `../corpo/perfil.js` no próprio service worker (offline); lê as pesagens com `lerMedidas`/`medidasGuardadas`/`pesoNoDia`; nenhum app repete esses valores nem grava pesagens.

## Hábitos (página inicial)

- Hábitos: **Treino** (quarta e quinta, `ROTINA.treino`; segunda não conta, nem treinando), **Déficit** (comido ≤ meta do dia = gasto − 500, pela mesma conta do al), **Peso e sono** (um hábito só, do Corpo, todo dia: feito com os dois lançados no dia; o 1º registro de qualquer um começa o hábito) e **Água** (1.000 ml, a meta da Água). Cada um abre o app dele.
- **Lançado no dia:** a partir de 27/10/2026, só conta o que foi lançado no próprio dia. Peso e sono pelo instante gravado pelo Corpo (`peso_em`, `sono_em`); comida e caminhada do al pela hora (o al grava sem hora o que é lançado em outro dia): dia com comida lançada depois falha, e caminhada lançada depois não sobe a meta. Água só se lança no dia. Antes de 27/10, tudo conta como lançado no dia.
- **Déficit:** hoje conta como feito enquanto o comido couber na meta (com pelo menos um registro); passou da meta, volta a pendente (treino ou caminhada ainda podem subir a meta) e à meia-noite o dia fecha. Sem nenhum registro de comida no dia, falha.
- Estados de cada dia: feito, falhou, protegido, pendente (hoje), folga (dia sem o hábito) e antes (antes do 1º registro do hábito).
- **Ofensiva** de cada hábito: dias feitos seguidos até hoje; hoje pendente, folga e protegido não quebram nem somam; falha quebra. No treino, a ofensiva conta treinos (só qua e qui). A chama acende quando o de hoje já foi feito ou, em dia de folga, quando a ofensiva está em dia.
- Faixa de 7 dias em cada hábito (de 6 dias atrás até hoje): verde = feito, vermelho = falhou, azul = protegido, as mesmas em todos os hábitos (a cor do app fica só no ícone), contorno = hoje pendente, fina = folga, apagada = antes do 1º registro.
- **Dia perfeito:** todos os hábitos feitos (treino pode ser folga), sem proteção; o de hoje conta quando tudo já está feito. No topo, os dias perfeitos seguidos e os últimos 7 dias.
- **Proteções:** +1 a cada semana de treino perfeita (quarta e quinta feitas, contada na quinta), no máximo 2 guardadas. Dia que falha gasta uma automaticamente, na ordem dos hábitos, e fica protegido. Tudo é recalculado dos dados a cada abertura, sem tabela própria.
- Dados: o hub só lê (`tr_treino`, `al_registro`, `al_dia`, `corpo_medida` por `lerMedidas`, `corpo_dia`, `agua_dia`), com cópia em `hub-habitos.<conta>` para abrir sem internet; tabela que falha fica com a cópia. Busca de novo ao voltar para a página. O que um app ainda não enviou à nuvem (sem internet, ou a página fechada antes do envio de 0,8 s) só aparece aqui depois de enviado.
- Atalhos sem hábito, fixos embaixo: Fin (o gráfico dele vem na fase de gráficos), Agenda e Anotações.

## Atalho externo

- Atalho com `class="app atalho externo"` (ex.: Agenda → Google Agenda): link para fora, em outra aba, nunca aceito como `?volta`. No Android, `hub.js` troca o link por um `intent://` que abre o app (`com.google.android.calendar`), com a web como reserva (`browser_fallback_url`).
- Anotações → conversa do WhatsApp comigo mesmo (ícone `icons/anotacoes.svg`, bloco de anotações) (`wa.me/<número>`, número público no repositório).

## Novo app

1. Crie a pasta (`nome/`) com `index.html`, caminhos relativos e o ícone do hub para `../`.
2. Acrescente o app à página inicial: com hábito, a linha em `index.html` e o hábito em `habitos.js` (mesma lista e ordem); sem hábito, um atalho na doca. O teste `tests/hub.test.mjs` confere a lista e que a pasta tem `index.html`. Acrescente a pasta ao `scripts/check.mjs` se ela tiver validação própria.
3. Use a paleta escura e prefixe chaves de `localStorage` e caches.
4. Precisa de altura, idade, sexo, taxa basal ou peso? Use `corpo/perfil.js` (ver Regras do hub).

## Como concluir uma mudança

1. Atualize as regras e os testes do app afetado (ver o guia dele).
2. Rode `node scripts/check.mjs` na raiz. Ele roda a validação de `fin/` e `tr/` e precisa das dependências do tr (`npm ci` e `npx playwright install chromium` dentro de `tr/`; nas sessões na nuvem, o hook de início já instala). Informe precisamente o que foi validado; não alegue validação no celular ou no Supabase real se ela não ocorreu.
3. Faça commit e push direto na `main`: projeto pessoal, sem fluxo de PR, sem worktree nem branch auxiliar. Nunca inclua alterações alheias no commit.
4. Nunca reescreva o histórico importado de `fin/` e `tr/` (rebase, amend, troca de autor).

## Dados e segurança

- Os apps usam o mesmo projeto Supabase (`fin`, tabelas `tr_*`, `al_*`, `corpo_*`, `agua_*` e `push_*`), pelo cliente do navegador e com a chave publicável. Nunca coloque chave de serviço nem segredo no repositório, que é público.
- Edge Functions (código versionado, publicado por deploy pelo mantenedor): `fin/supabase/functions/captura-nubank` `al/supabase/functions/al-estimar` (IA do al; a chave da Anthropic fica só no secret `ANTHROPIC_API_KEY`) e `agua/supabase/functions/agua-lembrete` (notificações da Água, chamada de hora em hora pelo pg_cron; chaves VAPID só na tabela `push_chave`).
- O al só lê `tr_treino` e `corpo_medida` (treinos e peso para o gasto do dia); o tr só lê `corpo_medida`. `tr_medida` (onde o tr gravava as pesagens) foi copiada para `corpo_medida` pela migration `corpo/00` e depois apagada pelo mantenedor (por isso a `corpo/00` não roda de novo).
- Conta `DONO` recriada em 24/10/2026 (id novo em `hub.js` e `tr/js/config.js`; policies trocadas pelas migrations `fin/40` e `tr/04`). Apagar a conta apaga as linhas `tr_*` (on delete cascade): para trocar senha, use a troca de senha, nunca recrie a conta.
- Migration nova não segura o push: faça o push junto com ela e informe o que aplicar; o mantenedor roda a migration logo depois.
- Qualquer operação remota que mude estado no Supabase (dados, esquema, RLS, Auth) exige confirmação explícita do mantenedor, com alvo e efeito informados. Consultas só de leitura podem apoiar diagnóstico (`.mcp.json` já é somente leitura).
