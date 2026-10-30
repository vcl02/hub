# Decisões do Corpo (`corpo`)

O porquê das escolhas. A regra vigente fica em `REGRAS.md`; o jeito de trabalhar, em `../AGENTS.md`; o que vale para todos os apps, em `../../docs/DIRETRIZES.md`.

## Dados sobre mim num lugar só (26/10/2026)

- Antes, o Treino guardava as pesagens (`tr_medida`) e cada app repetia altura, idade e taxa basal.
  O Corpo nasceu para ser o único dono disso: `perfil.js` (perfil, rotina da semana, contas) para todos os apps e as tabelas `corpo_medida` e `corpo_dia`, que só ele grava.
- Perfil (altura, nascimento, sexo) só em código, sem tabela nem tela de edição.
- A migration 00 copiou `tr_medida` para `corpo_medida` sem apagar nada; depois o mantenedor apagou `tr_medida`, então a 00 não roda de novo.

## Registro do dia (`corpo_dia`)

- 26/10/2026: evacuou sim ou não (migration 01), logo trocado por evacuações com horário e sono em horas (migration 02).
  Sem a tabela, o app segue só com as pesagens e esconde o cartão.
- 27/10/2026: `peso_em` e `sono_em` (migration 03) guardam quando o dado foi lançado, para os hábitos da página inicial contarem só o lançado no próprio dia.
- 27/10/2026: xixi e bexiga saíram da Água para cá (migration 04 copiou os xixis de `agua_dia`); o Corpo lê a água bebida para os ml por xixi.
- 27/10/2026: sono por horário (dormi e acordei, migration 05) com BOM, OK e RUIM; o sono antigo (só horas) conta como dormiu às 23:00, no banco e na cópia do aparelho.
  As horas continuam gravadas para o hábito do sono e os outros apps.

## Gráficos

- 26/10/2026: evolução só dos últimos 90 dias, eixo pela data, com data e valor do ponto ao passar o mouse ou o dedo; 27/10/2026: o horário da medida também.

## Dia anterior só leitura (30/10/2026)

- Com o dia no endereço (`?dia=`) em todos os apps, o mantenedor escolheu que dia anterior seja só leitura também no Corpo, como no al. Antes dava para lançar ou corrigir peso, sono, evacuações e xixis de dias passados pelo formulário e pelo lápis do histórico; agora só hoje aceita lançar, e no histórico só a medida de hoje se edita ou apaga. Corrigir um dia passado fica para o DataGrip.
