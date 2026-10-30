# Regras da Água

## Acesso

- Só a conta do Victor. Dentro do hub, sem sessão vai para o login do hub (`../?volta=agua/`) e volta depois de entrar; login próprio só fora do hub (testes). Sem botão de sair.
- Abre na hora com a cópia do aparelho, inclusive sem internet; depois envia o que estava pendente e traz a nuvem. Sem a cópia e sem a nuvem (ou sem a tabela ainda criada), abre vazio.
- **Rede ruim (metrô):** cada pedido ao Supabase tem limite de 15 s; estourou, conta como sem internet (fica salvo no aparelho e envia na próxima tentativa), e o envio nunca fica preso. Envio que chegou à nuvem mas cuja resposta se perdeu não é somado de novo na tentativa seguinte (o mesmo copo não entra duas vezes).
- **Aberto pela página inicial num dia anterior** (`?dia=AAAA-MM-DD`): a tela é daquele dia, só leitura: total, meta e o que foi bebido (sem tirar), sem lembretes, sem beber; em cima, o dia e **Hoje**, que volta ao app normal. Hoje, futuro ou texto inválido em `?dia`: o app normal.

## Hoje

- **Total:** ml bebidos hoje contra a meta de **1.000 ml** (mínimo, começando), com barra. Bateu a meta: "Meta batida" no canto e a barra fica verde.
- **Beber:** digite os ml e toque em + (ou Enter): entra com o horário de agora (o do celular, fuso de São Paulo). De 1 a 3.000 ml por vez.
- **Outras bebidas:** acima do campo, **Água · Suco · Refri · Cappuccino · Leite com Toddy · Leite** (começa em Água). Escolhida outra bebida, o próximo lançamento (campo ou botão) conta só a parte que é água: suco 88%, refri 89%, cappuccino 88%, leite com Toddy 82%, leite integral 88% (estimativa de tabelas de composição). Na lista aparece marcado, com contorno tracejado: "09:00 · suco 300 ml (264 ml de água)". Depois de cada lançamento de outra bebida, a escolha volta para Água. O que conta para a meta, os lembretes e a página inicial é a água (264 ml no exemplo). As calorias da bebida (por 100 ml, em `bebidas.js`: suco 40 kcal, refri 42, cappuccino 60, leite com Toddy 85, leite integral 60) aparecem na lista ("264 ml de água · 120 kcal") e contam como comido no Alimentação e no hábito do déficit.
- **Botões de ml:** não há quantidade fixa. Cada quantidade já digitada (o volume do copo, de qualquer bebida) vira botão; aparecem as 6 mais usadas (em ordem de ml). Tocar num botão bebe aquela quantidade agora.
- **Toque duplo sem querer:** a mesma quantidade da mesma bebida de novo em menos de 0,5 s é ignorada (o dedo que bate duas vezes); outro copo de verdade é só tocar de novo.
- Embaixo, o que foi bebido hoje ("10:00 · 300 ml ×"); tocar duas vezes tira.
- Xixi e bexiga ficam no Corpo (`../corpo/`), que lê a água daqui para os ml por xixi.

## Lembretes

- Das **10 às 16**, nunca antes nem depois (para não precisar levantar de noite para o banheiro).
- **Em casa** (dia útil fora dos presenciais: seg, ter e sex): de hora em hora (10, 11, …, 16).
- **Presencial** (qua e qui, `ROTINA.presencial` em `../corpo/perfil.js`) e **fim de semana**: de 2 em 2 horas (10, 12, 14, 16).
- Cada horário vale até o próximo; é cumprido quando há água bebida nesse intervalo (ou até 30 min antes dele): etiqueta com ✓. Passou sem beber: vermelha. O mais recente que já chegou e não foi cumprido aparece em destaque: "Hora de beber água (11:00)". Some ao beber, e a partir das 17h não aparece mais (à noite não chama para beber).
- Com o app aberto, a tela se atualiza a cada minuto.

## Notificações

- Notificação de verdade (chega com o app fechado) nos mesmos horários dos lembretes, só se ainda não bebeu água de 30 min antes do horário até a hora do envio (no minuto 1 de cada hora). Texto: "Hora de beber água · Toque para registrar."; tocar abre a Água (ou volta para ela). Ícone grande: o do app; ícone pequeno da barra do Android: a gota branca (`icons/agua-badge.png`, fundo transparente).
- Embaixo dos lembretes: **Ativar notificações** (pede a permissão e inscreve este aparelho). Ligadas: "Notificações ligadas". Permissão negada: "Notificações bloqueadas nas configurações do celular". Navegador sem notificação (iPhone fora da tela de início): a linha não aparece.
- Cada aparelho ativado recebe; aparelho que o navegador desinscreveu sai sozinho da lista.
- **Escovar os dentes:** 20 min depois de lançar comida no Alimentação (comida nova de hoje), chega "Escove os dentes · Você comeu há 20 minutos.", a qualquer hora, com o ícone da escova (o pequeno da barra, escova branca). Outra comida antes disso empurra para 20 min depois da última: uma notificação por refeição. Mudar porções ou lançar em dia passado não agenda. Tocar abre a página inicial. Vai pelas mesmas notificações da Água (é preciso tê-las ativado).

## Últimos 7 dias

- Dia e ml (verde quando bateu a meta).
