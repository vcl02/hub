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
- Não foi criado `package.json` por app: o único pacote de desenvolvimento é o Playwright, e uma instalação em `tr/` serve a todos.

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
- Cabeçalho: sem o "ontem", a data com largura fixa (pra nada pular) e o Hoje só como ícone, o mesmo botão do Sair (em roxo, a cor do dia anterior), que some em hoje. Os ‹ › só no computador: no celular não cabem ao lado da data fixa, do Hoje e do Sair.
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
