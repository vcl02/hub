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
