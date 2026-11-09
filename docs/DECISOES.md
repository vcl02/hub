# Decisões do hub (página inicial e o que cruza os apps)

O porquê das escolhas. A regra vigente fica em `REGRAS.md` (página inicial), `../AGENTS.md` (todos os apps) e `DIRETRIZES.md` (infraestrutura).

## Um repositório, uma origem

- O Fin e o Treino vieram dos repositórios `vcl02/fin` e `vcl02/tr` com o histórico completo (`git subtree`); os antigos foram excluídos em 22/10/2026.
  Os apps novos (al, Corpo, Água) nasceram aqui.
- Tudo publicado junto no GitHub Pages, na mesma origem: uma sessão do Supabase vale para todos, um login entra em todos e um Sair sai de todos.
  O custo é dividir `localStorage` e caches, resolvido com prefixo por app e service worker que nunca apaga cache de outro prefixo.
- Login e Sair só na página inicial; app aberto sem sessão vai para o login do hub com `?volta`, aceito só para a pasta de um app da página (nunca externo nem `..`).
- Projeto pessoal, sem fluxo de PR: commit e push direto na `main`, a pedido do mantenedor.

## Página inicial = Hábitos (26/10/2026)

- A grade de cards virou o módulo Hábitos: cada hábito leva ao app dele.
  Fases seguintes, nesta ordem: gráficos, espelho do Google Agenda e Tarefas, personalização.
- O hub só lê as tabelas dos apps e guarda uma cópia (`hub-habitos.<conta>`) para abrir sem internet.
  Proteções, ofensivas e dias perfeitos são recalculados dos dados a cada abertura, sem tabela própria: nada para sincronizar nem para corrigir à mão.
- O gasto do dia (`al/gasto.js`) e as bebidas (`agua/bebidas.js`) são os mesmos arquivos do al e da Água: o hábito do déficit nunca diverge do app.
- 26/10/2026: cores dos estados iguais em todos os hábitos (verde, vermelho, azul); a cor do app fica só no ícone.
- 27/10/2026: a faixa passou a mostrar a semana de hoje (segunda a domingo, como no Treino), não os últimos 7 dias.
- 27/10/2026: hábito Besteira (Fin, R$ 22 nos dias presenciais); o Fin passou a abrir por ele.
- 27/10/2026: "Peso e sono" virou um hábito só e, no mesmo dia, voltou a ser dois (Peso e Sono), com o sono contando 7 h ou mais e a noite de terça para quarta de folga.
- 27/10/2026: **lançado no dia**. A partir dessa data só conta o que foi lançado no próprio dia, para o hábito medir o hábito e não o preenchimento depois.

## Dados sobre mim num lugar só (26/10/2026)

- Perfil, rotina da semana e a leitura das pesagens saíram do Treino para `corpo/perfil.js`; as pesagens, de `tr_medida` para `corpo_medida`.
  Antes, cada app repetia altura, idade e taxa basal.

## Conta `DONO` recriada (24/10/2026)

- Id novo em `hub.js` e `tr/js/config.js`, policies trocadas (`fin/40`, `tr/04`).
  Apagar a conta apagou as linhas `tr_*` (on delete cascade); o Treino adota a cópia da conta antiga que estava no aparelho.
  Por isso: senha se troca, conta nunca se recria.

## Nunca perder dado (27/10/2026)

- Problema: uma cópia velha do celular apagou a água do dia, porque o envio sobrescrevia o dia inteiro.
- Correção: envio que **mescla** as listas do dia com a nuvem, base do aparelho normalizada antes de comparar, testes "dois aparelhos" e "formato antigo" em cada app, e `hub_historico` (migration `00` da raiz) com antes e depois de toda linha das tabelas da Água, do Corpo, do al e do Treino.

## Migration não segura o push (26/10/2026)

- O push vai junto com a migration nova e a entrega diz o que aplicar; o mantenedor aplica logo depois.
  O app convive com a tabela ainda ausente (degrada, não quebra).

## Diretrizes gerais (28/10/2026)

- Pedido do mantenedor: todo projeto com Migrations, testes de funções e Playwright, Pacotes, Backups, Domínios, AGENTS, REGRAS e DECISOES, e uma diretriz geral com o que se repete.
- O que se repete foi para `DIRETRIZES.md`; cada `AGENTS.md` ganhou a seção Infraestrutura com a resolução própria; os projetos sem `DECISOES.md` (raiz, al, Corpo, Água) e sem `REGRAS.md` (raiz) ganharam os seus.
  O comportamento visível da página inicial saiu do `AGENTS.md` da raiz para `REGRAS.md`, como nos apps.
- `tests/documentacao.test.mjs` confere os três documentos, a seção Infraestrutura e a numeração das migrations em todos os projetos, para a estrutura não se perder no próximo app.
- Não foi criado `package.json` por app: uma instalação só, na raiz, serve a todos (era no `tr/` até 01/11/2026).

## Respostas do mantenedor às pendências (28/10/2026)

- **Sempre na `main`:** commit e push direto na `main`, inclusive quando a sessão do Claude Code sugerir outra branch.
- **Gatilhos:** o mantenedor não sabe como o DataGrip trata função `plpgsql`. Regra adotada: reaproveitar função de gatilho que já existe (a `fin/41` faz isso) e, quando uma função nova for inevitável, aplicar pelo SQL Editor do Supabase, conferindo depois com `SELECT`.
- **Backup:** nenhuma cópia fora do Supabase por enquanto; só o que o mantenedor exportar pelo DataGrip. O plano atual do Supabase não faz backup, segundo ele. Os históricos no banco (`hub_historico`, `fin_historico`) seguem como a forma de recuperar dado.
- **Histórico das metas:** `fin_meta` entra no `fin_historico` (`fin/41`).
- **Versões:** o Fin passou a usar o `supabase-js` 2.118.0, o mesmo dos outros apps, e os tipos das Edge Functions ganharam versão fixa (`jsr:@supabase/functions-js@2.118.0`), a mesma do `supabase-js`.
- **Aplicação (28/10/2026):** `fin/41`, `00` da raiz e `agua/02` foram rodadas juntas, num script só, pelo SQL Editor do Supabase, e conferidas por `SELECT` (tudo presente, 10 gatilhos de `hub_historico`).

## Rede ruim e toques repetidos (28/10/2026)

- Pergunta do mantenedor: o que acontece começando algo sem conexão ou com a conexão caindo no meio (metrô), e o que impede duplicar ações de clique.
- **Duplicação achada e corrigida:** na Água, no Corpo e na caminhada do al, o envio mescla a lista do dia com a nuvem. Se o envio chegava ao banco e a resposta se perdia, a base não era atualizada e a tentativa seguinte somava de novo o que já tinha subido (o mesmo copo duas vezes). Agora o aparelho guarda o que vai deixar na nuvem antes de mandar e, na tentativa seguinte, reconhece que chegou. Resta um caso raro: outro aparelho mudar o mesmo dia entre a resposta perdida e a nova tentativa (a nuvem fica diferente do esperado e a mescla volta ao jeito antigo).
- **Limite de tempo:** os clientes do Supabase fora do Fin não tinham teto; um pedido sem resposta podia prender o envio (`enviando`) ou a busca dos hábitos (`buscando`) por minutos. O `supabase-js` 2.118.0 repete sozinho até 3 vezes as leituras que falham por rede, então o pior caso de uma leitura fica perto de 1 min, mas sempre termina.
- **Toque repetido:** 0,5 s para a mesma ação, porque dois copos, dois xixis ou dois trechos iguais nesse intervalo só acontecem por toque duplo sem querer. O toque duplo para apagar continua sendo o de confirmação (`confirmar`).
- **Fin:** já tinha teto, repetição só do que é idempotente e `INSERT` nunca repetido sozinho. Faltava trava em Nova meta/Excluir meta (o 2º clique criava outra meta) e nos selos (o 2º clique reenviava o mesmo valor em vez de desfazer), e recarregar sozinho quando a conexão volta.

## Dias anteriores na página inicial (30/10/2026)

- Pedido do mantenedor: navegar para os dias anteriores com swipe, com os hábitos abrindo os apps naqueles dias, só leitura.
- A página inicial recalcula tudo dos dados (sem tabela própria), então um dia passado é só olhar os estados de `calcularHabitos` naquele dia: a ofensiva e os dias perfeitos são contados para trás a partir dele (`ateODia`). As proteções não têm histórico por dia e ficam as de agora.
- Arrastar para a direita volta um dia (como virar a página para trás). No mesmo dia, a pedido do mantenedor, todo o hub passou a usar esse sentido: a semana e o resumo do Treino, que iam ao contrário, foram alinhados (regra em `../AGENTS.md`).
- Cabeçalho: sem o "ontem", a data com largura fixa (pra nada pular) e o Hoje só como ícone, o mesmo botão do Sair (em roxo, a cor do dia anterior), que some em hoje. Os ‹ › só no computador: no celular não cabem ao lado da data fixa, do Hoje e do Sair. Em 30/10/2026, na base comum, a data foi para a barra do dia da base, numa linha só dela, e os ‹ › passaram a aparecer também no celular, como nos outros módulos.
- Só leitura por `?dia=` em cada app, sem nada novo no banco. O Fin não tem modo só leitura, a pedido do mantenedor: com `?dia` ele só abre no ciclo daquele dia, editável como sempre.
- **O dia no endereço em todos** (`?dia=AAAA-MM-DD`), a pedido do mantenedor, como o `?ciclo` do Fin: recarregar mantém o dia e o Voltar do navegador volta ao dia de antes. Para o endereço sempre querer dizer a mesma coisa, o mantenedor escolheu: **dia anterior é só leitura em todos os apps** (o Corpo deixava lançar e corrigir dias passados e deixou de deixar). O Fin fica de fora (editável; o `?dia` só escolhe o ciclo). No Treino o dia só substitui o endereço, porque as telas já empilham no histórico. Os service workers dos apps passaram a servir a página com `?dia` sem internet (antes ignoravam todo endereço com `?`).

## Déficit com o que o al ainda não enviou (30/10/2026)

- O mantenedor lançou uma caminhada no al, voltou para a página inicial e o Déficit não mudou: o al envia 0,8 s depois de cada mudança e a página fecha antes, então a caminhada só subia na próxima vez que o al abrisse.
- A página inicial e o al são da mesma origem: a página lê a cópia do al no aparelho (`al.db` e `al.base`) e, nos dias em que ela difere da base (algo pendente), usa a cópia do aparelho para comida e caminhada (`comPendentesDoAl`, em `habitos.js`). Os outros dias ficam com a nuvem, para não esconder o que outro aparelho lançou. O al também tenta enviar no `pagehide`, mas sem garantia de terminar.

## Base comum para todos os módulos (30/10/2026)

- O mantenedor sentia a troca entre módulos pesada e desconexa: cada módulo é uma página com o próprio CSS (de 97 a 4.040 linhas), o "hoje" marcado de jeitos diferentes, cabeçalhos e listas diferentes, e o mesmo código (toast, confirmar, sincronização, login) copiado de 3 a 6 vezes.
- Escolha: uma base comum (tokens, componentes e, depois, um núcleo de código), adotada módulo a módulo, em vez de virar uma página única (reescrever tudo, o Fin sozinho tem cerca de 8 mil linhas).
- Ponto de partida: os tokens do Treino (o sistema mais completo), com as cores com significado dos hábitos (verde feito, vermelho falhou, azul protegido) e uma cor de destaque por módulo.
- Plano e estado em `DIRETRIZES.md`, seção 8.

## `package.json` da raiz para o editor (01/11/2026)

- O mantenedor pediu ESLint, Prettier e EditorConfig de um lugar só. A raiz ganhou `package.json` com `eslint`, `@eslint/js` e `prettier` (versões exatas), mais `.prettierignore`, `.prettierrc` e `eslint.config.mjs`.
- Só ferramenta de editor: não entra em `scripts/check.mjs`, no GitHub Actions nem em nenhum app. O Playwright, antes em `tr/package.json`, também vive nesse mesmo `package.json` (um só `package.json` e um só `node_modules`) desde 01/11/2026.
- `globals` 17.13.0 (versão exata; a 17.14.0 saiu hoje, por isso não foi usada) serve ao ESLint.

### `no-undef` ligado, com globais por página (01/11/2026)

- Os apps são scripts clássicos: um arquivo usa o que outro declara no topo, na mesma página. Em vez de desligar `no-undef`, o `eslint.config.mjs` lê os `<script src>` do `index.html` de cada página (raiz, `fin/`, `tr/`, `al/`, `corpo/`, `agua/`) e dá a cada arquivo, como globais, o que os outros scripts da página declaram.
- A descoberta é por leitura de texto: `function`, `const`/`let`/`var`, `class`, declarações em várias linhas e `window.x = …` no topo. Um nome declarado fora desses padrões some da lista e o seu uso aparece como `no-undef`; a saída é ampliar a leitura, não desligar a regra.
- Os testes de cada pasta recebem os globais da página (o `page.evaluate` roda lá) e `globals.browser`. `supabase` e `Chart` entram como globais de terceiros; `supabase.js` e `tr/supabase.js` são ignorados.
- O porquê: com a regra desligada, nome digitado errado ou função que sumiu passariam batidos. Assim, continuam sendo pegos.
- Estado: `npm run lint` saiu sem nenhum achado em 01/11/2026 (antes eram 12.732).

### Critério da limpeza do ESLint (01/11/2026)

- `catch (e)` sem uso virou `catch {`.
- Bloco de `catch` que engole o erro de propósito tem um comentário dizendo por quê.
- `throw` dentro de `catch` passa `{ cause }`, para o erro original não se perder.
- `.prettierignore` ignora `supabase.js` (cópia de terceiros que o Prettier tinha expandido); o resto segue o `.prettierrc`.

## Validação no GitHub, EditorConfig próprio e Fin com 2 espaços (01/11/2026)

- O mantenedor pediu que o push falhe se o estilo quebrar. O workflow `.github/workflows/validacao.yml` roda, nesta ordem: instalar (`npm ci` e Chromium), `npm run lint`, `npm run format:check`, `npm run editorconfig` e `node scripts/check.mjs`. Se um passo falha, o workflow para. `tests/hub.test.mjs` confere os passos e os scripts do `package.json`.
- `npm run validar` encadeia lint, format:check, editorconfig e test, para rodar a mesma sequência na máquina.
- `scripts/editorconfig.mjs` é próprio e não tem dependências. Motivo: o `editorconfig-checker` 7.0.0 quebra no Node 22, e a 6.1.1 baixa um binário que não existe para Windows. Ele confere os arquivos versionados e os novos contra o `.editorconfig` mais próximo de cada um (raiz, `fin/`, `tr/`): UTF-8 sem BOM, LF, newline final, sem espaço no fim e sem tab na indentação. Não confere o tamanho da indentação, que é do Prettier. Ignora `supabase.js`, `tr/supabase.js` (cópia de terceiros) e `fin/tasker/` (XML do Tasker, com tab).
- `fin/.editorconfig`: `indent_size` passou de 4 para 2, igual ao `.prettierrc`. O código do Fin já segue 2 espaços; com 4, o editor e o Prettier discordariam.
- `hub.js` (`dadosComPendentes`): se a cópia do al (`al.db`) ou a base dele (`al.base`) estiver ilegível, a página inicial fica só com os dados da nuvem. Antes, um `al.base` ilegível com `al.db` válido contava todo dia como pendente. `al.db` sem base (o al nunca sincronizou) continua valendo como pendente. Teste: `tests/regras-apps.test.mjs`.
- `fin/tests/helpers/assert-tolerante.js`: o `match` tolerante ignora maiúsculas e parênteses, para aceitar o que o Prettier reescreve; o `doesNotMatch` continua estrito. Limite conhecido: um `match` pode aceitar caixa ou parênteses diferentes do código. O que precisa sumir do código fica com `doesNotMatch`.

## Auditoria dos testes (02/11/2026)

- Critérios iguais aos do Fin, em `docs/DIRETRIZES.md`, seção 3: a função rodando primeiro; Playwright só onde a função não prova; regex só onde o objeto é texto.
- Sem navegador agora: `tests/hub.test.mjs` lê o `index.html` como elementos (`tests/leitores.mjs`), roda o `hub.js` com o HTML real (`tests/hub-falso.mjs`) e roda os service workers em `node:vm` (`tests/sw-falso.mjs`), em vez de procurar trechos do código com regex. `tests/navegacao.test.mjs` caiu de 14 para 8 testes de navegador (contagem de 02/11/2026).
- Continua em Playwright: login, hábitos com os dados dos apps e cada app abrindo com a mesma sessão e no dia escolhido. É a ligação entre a página inicial e os apps, que nenhuma função prova sozinha.
- Ressalvas fechadas em 02/11/2026:
  - Lint de nomes antigos da base comum (seção 8 das diretrizes): a regex `var(--teal…)` sobre o HTML e o JS saiu de `tests/hub.test.mjs`. O teste "módulos na base comum só usam as cores da base" lê o CSS como regras (`regras`, `declaracoes`) e extrai os `var(--x)` por varredura (`usosDeVar`); cada `--x` tem de estar em `base/tokens.css`, em `base/componentes.css` ou no próprio módulo. Os estilos inline do `index.html` são lidos como etiquetas.
  - Em `destinoDaVolta` (volta do login para a página), a mutação `.app:not(.externo)` → `.app` não é mais equivalente. Desde que o `iniciarHub` aceita `linksExtras` (`tests/hub-falso.mjs`), o teste de `?volta` põe um atalho externo na lista (`class="app atalho externo"`, `href="externo/"`): com `.app:not(.externo)`, `?volta=externo/` vira `null`; sem a classe `externo` o mesmo link vale, o que prova que foi o seletor que barrou. Com a mutação, esse caso falha.
- Fechadas em 03/11/2026 (eram "ressalvas que continuam"):
  - Os scripts que montam HTML com `style="… var(--x)"` (e SVG com `fill="var(--x)"`) deixaram de ser conferidos pelo texto do código. `tests/estilos-gerados.test.mjs` roda as funções e lê a saída: o gráfico de linha do Corpo e do Treino (`grafico`, com uma caixa falsa), o chip do teto ligado do Fin (`vCiclo` em `carregarTela`, com `Estado.filtroTeto`) e cada estado de cada filtro por clique do Fin (`botaoFiltroEstado` para tudo de `ESTADOS_FILTRO_CLIQUE`). Todo `var(--x)` gerado tem de estar na base ou no CSS do próprio módulo. Um teste de guarda confere que só esses quatro scripts (`corpo/js/util.js`, `tr/js/util.js`, `fin/js/cycle-views.js`, `fin/js/tables.js`) escrevem `var(--`; um script novo com isso falha até entrar no arquivo. Mutações (token trocado por um que não existe, em cada um dos quatro, e um `var(--a)` solto no `hub.js`) falham o teste. `usosDeVar` e `definidasEm` passaram para `tests/leitores.mjs`, usados também por `tests/hub.test.mjs`. Nenhuma função ficou sem rodar: o Hábitos, a Água e o Alimentação não escrevem `var(--` em JavaScript.
  - O workflow do GitHub Actions: a sequência (`npm ci` e Chromium, `npm run lint`, `npm run format:check`, `npm run editorconfig`, `node scripts/check.mjs`) é conferida em `tests/hub.test.mjs` ("workflows só na raiz") contra o `package.json`, e os mesmos comandos rodam na máquina local ao fim de cada tarefa. Não executável neste ambiente: a execução no próprio GitHub Actions (sem `act` nem acesso ao GitHub daqui).

## Núcleo comum, fatia 1 (02/11/2026)

- Passo 4 da base comum (`DIRETRIZES.md`, seção 8): o código que os módulos repetem vai para `base/nucleo.js`, script clássico sem módulos nem build (como `corpo/perfil.js`), carregado logo depois do `supabase.js` em cada página e guardado no service worker de cada módulo.
- **Por que em fatias, e nesta ordem:** primeiro o que é mais crítico para não perder dado e mais repetido, em pedaços pequenos que não mudam nada visível. O `fetchComTeto` (limite de tempo de todo pedido ao Supabase, 15 s; a função, 40 s) abriu: estava em cinco arquivos (`hub.js`, `agua/js/banco.js`, `al/js/banco.js`, `corpo/js/banco.js`, `tr/js/banco.js`), as cinco cópias iguais byte a byte (comentário, limites e função), e um app que ficasse sem ele prenderia o envio no metrô. Ele não depende de nada do app, então sair dali não toca no motor de sincronização.
- **Como ficou:** `criarFetchComTeto({ rede, funcao })` monta o fetch com teto para um par de limites, e `fetchComTeto` é ele com os limites de sempre (15 s e 40 s), o mesmo comportamento, a mesma mensagem (`TypeError('Failed to fetch: sem resposta em N s', { cause })`) e os mesmos tempos. O Fin fica fora desta fatia: o `fetchComLimite` dele (12 s) devolve `{ ok, status, texto }` e erros com `semResposta`, para a repetição do que é idempotente; quando migrar, cria o seu com `criarFetchComTeto({ rede: 12000 })` ou o núcleo ganha o formato dele.
- **Testes:** a função é testada uma vez, no arquivo publicado (`tests/nucleo.test.mjs`: 15 s e 40 s, resposta inteira, sem corpo, prazo limpo, falha de rede com `cause`, leitura do corpo dentro do prazo, cancelado pelo chamador, sem internet e limites próprios). `tests/repetidas.test.mjs` deixou de testar cinco cópias e passou a provar que os cinco arquivos usam a única: nenhum declara a sua (pela árvore do código, `espree`), o `createClient` de cada um recebe a função do núcleo e a página carrega o núcleo depois do `supabase.js` e antes do arquivo. Mutações em cada limite, no caminho da função, no `clearTimeout`, nos status sem corpo, na mensagem, no `cause`, no tipo do erro e no cancelamento pelo chamador fazem os testes falharem.
- **Próximas fatias, nesta ordem (a 2ª, abaixo, já saiu):** `repetido` (toque repetido, em `js/util.js` da Água, do al e do Corpo); armazenamento com prefixo do app (`localStorage` com `try`, chaves `<app>.db/.base/.voo.<conta>`); toast e confirmar; datas (`hoje`, `diaDaUrl`/`diaNaUrl`, barra do dia); login e volta ao hub; e por último o motor de sincronização (diferença, mescla e voo), o mais delicado, que só sai dos apps com os testes "dois aparelhos", "formato antigo" e "metrô" de cada um passando antes e depois. O Fin entra quando o formato do `fetchComLimite` couber no núcleo.

## Núcleo comum, fatia 2 (03/11/2026)

- **O que saiu dos apps:** o toque repetido sem querer (`repetido`, `REPETIDO_MS` = 500 ms, `ultimaAcao`) e o toque duplo para confirmar inteiro (`ARMADO_MS` = 3 s, `armados`, `estaArmado`, `armar`, `desarmar`, `pintarArmados`, `confirmar`, `chavesDosItens` e o `MutationObserver` que repinta o armado quando a tela é redesenhada) foram para `base/nucleo.js`. Já é a fatia "toast e confirmar" pela metade: o confirmar veio junto porque as cópias eram iguais e o `repetido` mora ao lado dele; o toast fica para depois (o texto e o tempo variam por app).
- **Comparação das cópias (03/11/2026):** o código das quatro cópias (`js/util.js` da Água, do al, do Corpo e do Treino) era igual byte a byte; só os comentários mudavam (qual item cada app arma, "lista" ou "tela" redesenhada). O Treino não tinha `repetido` nem `chavesDosItens`, e não precisa: não tem botão que acrescenta à lista do dia (o registro de um exercício é um por dia e gravar de novo o substitui, o treino do dia é um só e os ajustes refazem a lista a partir do formulário), e os itens que ele arma têm chave própria. O +5 min do cardio soma tempo, não item, aparece na hora e para em 4 h: fica fora da regra do toque repetido, como está. Nada divergia no comportamento, então nada foi corrigido em app.
- **Por que o observador mora no núcleo, inclusive na página inicial:** ele é parte do toque duplo (sem ele, a nuvem que redesenha a lista entre o 1º e o 2º toque desarmaria o item), então vai junto, como estava em cada `util.js`. Na página inicial, que carrega o núcleo pelo `fetchComTeto` e não arma nada, a lista de armados fica vazia e o callback só confere `Object.keys({})`: não percorre a tela. Separar o observador numa chamada que cada app faria (`vigiarArmados()`) foi descartado: seria mais uma linha por app para esquecer.
- **Relógio:** as duas funções usam `Date.now()`, que o relógio falso do Playwright (`tests/relogio.mjs`, pausado) e o contexto do `node:vm` nos testes controlam; não precisou de relógio injetado.
- **Testes:** as funções são testadas uma vez, no arquivo publicado (`tests/nucleo.test.mjs`: mesma ação em menos de 0,5 s ignorada, 0,499 s e 0,5 s na fronteira, conta do último toque, ações diferentes não se bloqueiam, chave por botão, quantidade e dia; armado por 3 s, o armado que sobrevive ao redesenho, botão sem `data-armavel`, o observador que só repinta com item armado e as chaves por conteúdo e vez). `tests/repetidas.test.mjs` deixou de testar quatro cópias e passou a provar pela árvore do código (`espree`) que nenhum script de nenhuma das quatro páginas declara essas funções nem as recebe como parâmetro, quantas vezes cada arquivo chama `repetido`, `confirmar` e `chavesDosItens` (um botão que deixa de chamar falha), e que quem chama vem depois do núcleo na página. Mutações nos 500 ms (499, 501, `<=`), na chave, em "conta do último", nos 3 s, na chave vazia, no observador, nas chaves dos itens, num app que declara a própria cópia, num handler sem a chamada e no núcleo fora de ordem fazem os testes falharem. Os testes de navegador de toque duplo e de "+1"/"+ml" de cada app continuam passando sem mudança.
- **Próximas fatias, nesta ordem:** armazenamento com prefixo do app; o toast; datas (`hoje`, `diaDaUrl`/`diaNaUrl`, barra do dia); login e volta ao hub; e por último o motor de sincronização (diferença, mescla e voo). O Fin continua fora (trava o botão enquanto o pedido está no ar, sem `repetido`; `confirmar` próprio).
