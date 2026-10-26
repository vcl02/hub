# Regras da Água

## Acesso

- Só a conta do Victor. Dentro do hub, sem sessão vai para o login do hub (`../?volta=agua/`) e volta depois de entrar; login próprio só fora do hub (testes). Sem botão de sair.
- Abre na hora com a cópia do aparelho, inclusive sem internet; depois envia o que estava pendente e traz a nuvem. Sem a cópia e sem a nuvem (ou sem a tabela ainda criada), abre vazio.

## Hoje

- **Total:** ml bebidos hoje contra a meta de **1.000 ml** (mínimo, começando), com barra. Bateu a meta: "Meta batida" no canto e a barra fica verde.
- **Beber:** digite os ml e toque em + (ou Enter): entra com o horário de agora (o do celular, fuso de São Paulo). De 1 a 3.000 ml por vez.
- **Botões de ml:** não há quantidade fixa. Cada quantidade já digitada vira botão; aparecem as 6 mais usadas (em ordem de ml). Tocar num botão bebe aquela quantidade agora.
- Embaixo, o que foi bebido hoje ("10:00 · 300 ml ×"); tocar duas vezes tira.
- **Xixi:** contador e **+1** (horário de agora). Cada horário aparece como etiqueta; tocar duas vezes tira.

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

## Bexiga

- Só contando (sem medir cada xixi) não dá para saber o volume da bexiga. O app mostra o que dá para tirar disso, dos últimos 7 dias com xixi registrado (hoje entra se já tiver xixi):
  - **xixis por dia** (média);
  - **intervalo** médio entre um xixi e o seguinte no mesmo dia ("2 h 53");
  - **ml bebidos por xixi** (água dos dias ÷ xixis).
- Com esses números dá para ver quanto é possível beber por dia sem ir ao banheiro toda hora.

## Últimos 7 dias

- Dia, ml (verde quando bateu a meta) e xixis.
