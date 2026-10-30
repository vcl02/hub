# Regras do Corpo

## Acesso

- Só a conta do Victor. Dentro do hub, sem sessão vai para o login do hub (`../?volta=corpo/`) e volta depois de entrar; login próprio só fora do hub (testes). Outra conta: "Esta conta não tem acesso." Sem botão de sair.
- Abre na hora com a cópia do aparelho, inclusive sem internet; depois envia o que estava pendente e traz a nuvem.
- **Rede ruim (metrô):** cada pedido ao Supabase tem limite de 15 s; estourou, conta como sem internet (fica salvo no aparelho e envia na próxima tentativa), e o envio nunca fica preso. Envio que chegou à nuvem mas cuja resposta se perdeu não é somado de novo na tentativa seguinte (a mesma evacuação ou o mesmo xixi não entra duas vezes).
- **Dia anterior é só leitura** (escolhido na data do formulário ou aberto pela página inicial): o formulário e o cartão do dia (sono, evacuações e xixis) mostram o que foi lançado nele, com campos e botões desativados (a data não, para voltar). Em cima, o dia e **Hoje**, que volta para hoje. No histórico, só a medida de hoje se edita (horário, peso e barriga; o dia não muda) ou apaga. O dia fica no endereço (`?dia=AAAA-MM-DD`, como o `?ciclo` do Fin; em hoje, sem): recarregar mantém, e o Voltar do navegador volta ao dia de antes. Hoje, futuro ou texto inválido em `?dia`: hoje.
- **Trocar o dia:** a barra ‹ dia › no topo (Hoje, Ontem ou "quarta, 21/10"), arrastar a tela de lado (para a direita, o dia anterior; para a esquerda, o seguinte; fora dos gráficos, que usam o dedo para a dica) ou ← → no computador, como no al; ou a data do formulário. Para trás até o 1º dia com registro (ou o pedido pelo `?dia`), para frente até hoje.
- **Esc:** cancela a edição na linha do histórico; num campo de texto, só tira o foco; sem nada aberto, sai do app para a página inicial do hub (`../`), como em todos os apps.

## Perfil (só em código, `perfil.js`)

- Altura 1,78 m, nascimento 14/09/2002, sexo masculino. Rotina da semana (`ROTINA`): treino fixo quarta e quinta, extra sugerido (opcional) segunda e dias presenciais quarta e quinta (o Treino, o Alimentação e a Água usam). Idade no dia (`idadeEm`), taxa basal Mifflin-St Jeor (`tmb`) calorias do treino (`kcalTreino`, 3,5 MET × basal/hora × horas) e da esteira (`kcalEsteira`, cardio do Treino: MET das equações do ACSM, de caminhada até 8 km/h e de corrida a partir daí, com a inclinação, × basal/hora × horas) saem daqui para todos os apps.
- Linha do perfil embaixo do card: "24 anos · 1,78 m · basal ~1.898 kcal/dia" (basal com o peso mais recente).

## Medida do dia

- 1 por dia, em `corpo_medida`: peso (kg) e/ou barriga (cm, na linha do umbigo; coluna `cintura`), com o horário. Pelo menos um dos dois.
- Formulário: dia (hoje por padrão; até hoje, nunca futuro; dia anterior só para ver), horário (vem a hora de agora, livre), peso e barriga com − / + (peso de 0,1 em 0,1 kg; barriga de 0,5 em 0,5 cm). O dia escolhido já mostra o que foi medido nele; "Salvar" (só hoje) troca a medida do dia.
- Peso de 30 a 300 kg; barriga maior que zero (sem trava baixa). Vazio = não medido.
- **Quando o peso foi lançado** (`peso_em`, migration 03): o instante em que o dia ganhou um peso, pelo relógio do celular (no formulário ou no lápis do histórico). Corrigir o peso do mesmo dia mantém o primeiro lançamento; mudar a medida de dia pelo lápis é lançamento novo no dia de destino; só barriga não tem. Os hábitos da página inicial do hub só contam pesagem lançada no próprio dia (a partir de 27/10/2026).
- **Horário de sempre:** a mediana dos horários das últimas 7 pesagens com horário (com número par, o mais cedo dos dois do meio): uma pesagem fora da rotina não muda a referência. Mais de 1 h longe dele: aviso (só recomenda, salva igual).

## Sono, evacuações e xixi

- Cartão logo abaixo do formulário, para o mesmo dia escolhido nele, gravado em `corpo_dia` (1 linha por dia; dia sem sono, evacuação nem xixi não fica guardado).
- **Sono:** "Dormi" e "Acordei" (horários, `dormiu` e `acordou`, migration 05), da noite que terminou no dia escolhido; salvos ao mudar cada campo, vazio tira. As horas (`sono`) saem dos dois, passando da meia-noite (23:40 → 07:10 = 7 h 30), e continuam gravadas para o hábito do hub e os outros apps; com um só dos dois, o horário fica guardado e não há horas. Abaixo, as horas e a etiqueta: **BOM** (8 h ou mais, verde), **OK** (de 7 a 8) e **RUIM** (menos de 7, vermelho). Guarda quando foi lançado (`sono_em`, migration 03): o primeiro lançamento completo do dia fica (corrigir os horários não muda), e tirar o sono tira junto. O hábito do sono no hub só conta sono lançado no próprio dia.
  - **Sono antigo** (só as horas, antes dos horários): conta como dormiu às 23:00 e acordou 23:00 + as horas (9 h → 23:00 → 08:00). A migration 05 grava isso no banco, e o app faz o mesmo com a cópia do aparelho.
- **Cartão Sono** (abaixo do cartão do dia): média das últimas 7 noites com sono (hoje entra se já tiver), com a etiqueta, e cada noite, da mais recente: data, "23:00 → 08:00", as horas e a etiqueta. Sem nenhuma: "Registre o sono para ver aqui." Some junto com o cartão do dia sem a tabela `corpo_dia`.
- **Evacuação:** quantas no dia e um **+1**, que grava com o horário de agora (o do celular, fuso de São Paulo). Cada horário aparece como etiqueta; tocar duas vezes tira. O "sim" antigo (migration 01) aparece como "sem horário".
- Sem linha da última evacuação. Só com 3 dias ou mais desde a última aparece, em vermelho, "3 dias sem evacuar (última em 19/10)" (prisão de ventre é comum em dieta: fibra e água).
- **Xixi:** quantos no dia e um **+1** com o horário de agora, como a evacuação; tocar duas vezes tira. Veio da Água (migration 04 copiou os xixis de `agua_dia` para `corpo_dia.xixis`).
- **Toque duplo sem querer** no +1 (evacuação ou xixi) de novo em menos de 0,5 s, no mesmo dia, é ignorado.

## Bexiga

- Só contando (sem medir cada xixi) não dá para saber o volume da bexiga. O cartão mostra o que dá para tirar disso, dos últimos 7 dias com xixi registrado (hoje entra se já tiver xixi):
  - **xixis por dia** (média);
  - **intervalo** médio entre um xixi e o seguinte no mesmo dia ("2 h 53");
  - **ml bebidos por xixi** (água desses dias, lida da Água em `agua_dia`, ÷ xixis; sem água registrada, "—").
- Sem nenhum xixi: "Registre os xixis para ver aqui." Sem a tabela `corpo_dia`, o cartão some junto com o do dia.
- Sem a tabela `corpo_dia` ou sem as colunas da migration 02 no banco, o cartão some e o resto do Corpo funciona normal.

## Peso atual

- Card do topo: peso mais recente em destaque; a data só aparece se não for de hoje ("ontem", "há 3 dias"…); IMC e faixa ("IMC 28,4 · Sobrepeso"); quanto falta para a faixa seguinte rumo ao normal; variação desde a 1ª pesagem (verde se caiu); barriga mais recente e a variação desde a 1ª medida de barriga. Variação zero não aparece.
- **IMC:** peso ÷ altura², 1 casa. Faixas da OMS com graus: < 16 Magreza III, < 17 Magreza II, < 18,5 Magreza I, < 25 Normal, < 30 Sobrepeso, < 35 Obesidade I, < 40 Obesidade II, ≥ 40 Obesidade III.
- **Quanto falta:** em passos de 0,1 kg com o mesmo IMC arredondado da tela ("7,5 kg até Sobrepeso"; abaixo do normal, "0,6 kg até Magreza II"; no normal, nada), sem sinal: a faixa seguinte já diz se é perder ou ganhar.

## Evolução e histórico

- Gráficos do peso e da barriga com as medidas dos **últimos 90 dias** (contando hoje), só com 2 ou mais; com menos, nem a caixa nem o título. O eixo horizontal segue as datas (pontos mais longe = mais dias entre eles), com 3 datas embaixo (a 1ª, a do meio e a última); do lado, 3 valores (o maior, o do meio e o menor), cada um com sua linha tracejada. Mouse em cima (ou o dedo encostado e arrastando para o lado) mostra a data, o horário da medida (se tiver) e o valor do ponto mais perto ("18/10 07:40 · 103,1 kg"; sem horário, "18/10 · 103,1 kg"), com uma linha até ele; sai do gráfico, some.
- Histórico, mais recente primeiro: data e horário, peso e barriga numa linha e o IMC. Lápis edita na linha (data, horário, peso, barriga; 1 por dia: "Já tem medida em 15/10"); Esc ou × cancela. Lixeira apaga com toque duplo.

## Para os outros apps

- Treino (calorias do treino) e Alimentação (gasto do dia) leem as pesagens por `perfil.js`: peso do dia = a pesagem mais recente até ele (`pesoNoDia`). Nenhum dos dois grava medidas.
