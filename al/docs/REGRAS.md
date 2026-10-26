# Regras da Alimentação

## Acesso

- Só a conta do Victor (a mesma do hub e do Treino). Dentro do hub, sem sessão vai para o login do hub (`../?volta=al/`) e volta depois de entrar. A tela de login própria (usuário e senha) só aparece com o app servido fora do hub (testes). Outra conta: "Esta conta não tem acesso." Sem botão de sair (Sair fica no hub).
- Abre na hora com a cópia do aparelho, inclusive sem internet; depois envia o que estava pendente e traz a nuvem e o Treino.

## Gasto do dia

- **Peso:** a pesagem mais recente até o dia, lida do app Corpo (`pesoNoDia`). Sem nenhuma pesagem: sem gasto e sem saldo ("Sem pesagem no Corpo para calcular o gasto"), só o que foi comido.
- **Basal:** Mifflin-St Jeor com o perfil do Corpo (`../corpo/perfil.js`) e a idade no dia.
- **Rotina:** basal × 1,2 (fator de atividade sedentário).
- **Treino:** treinos do dia no Treino. Soma só o que passa da basal: calorias do treino (`kcalTreino`, 3,5 MET × basal/hora × horas, a mesma conta do Treino) − basal/hora × horas = (3,5 − 1) × basal ÷ 24 × horas.
- **Caminhada:** botão "Andei" por dia, gravado em `al_dia`; desmarcar apaga a linha do dia (linha antiga com `andou` falso vale como nenhuma). Marcado, aparecem dois campos para o **total do dia** (rua aos poucos ou esteira, tanto faz): minutos e/ou km. Vazios = padrão de 20 min.
  - Conta (equação de caminhada do ACSM, terreno plano): MET = (0,1 × velocidade em m/min + 3,5) ÷ 3,5; soma (MET − 1) × basal ÷ 24 × horas.
  - Com minutos e km, a velocidade é a real (limitada a 2–7 km/h); só minutos ou só km, 5 km/h (só km: tempo = km ÷ 5). Ex.: 20 min sem km = 66 kcal; 3 km = 119 kcal (com basal 1.998).
  - Ao lado dos campos, o efeito no saldo ("−66 kcal"). Esteira dentro do horário de um treino do Treino já conta no treino: lance só a caminhada fora dele.
- **Gasto** = rotina + treino + caminhada (se marcada). Valores arredondados para kcal inteiras em cada parte.

## Meta, saldo e macros

- **Meta do dia** = gasto do dia − 500 kcal (déficit planejado, ~0,5 kg de gordura por semana). Sobe junto com treino e caminhada.
- **Macros da meta:** proteína 1,6 g por kg de peso; gordura 25% das kcal da meta (÷ 9); carboidrato com o resto ((meta − proteína × 4 − gordura × 9) ÷ 4). Arredondados para gramas inteiros.
- **Hoje** (o dia não fechou): número grande = quanto ainda cabe até a meta ("1.450 kcal restantes", verde) ou quanto passou dela ("320 kcal acima da meta", vermelho). O gasto do dia inteiro não vira déficit antes da hora.
- **Dia passado:** saldo final = comido − gasto, sem sinal: "1.304 kcal de déficit" (verde) ou "kcal de superávit" (vermelho).
- Embaixo do número, uma informação por linha: hoje "Meta" e "Comi"; dia passado "Comi", "Gastei" e "Meta". Depois, em letra menor, de onde sai o gasto ("Gasto 2.606 = basal 1.998 + dia a dia 400 + treino 208 + caminhada 66"; dia a dia = a parte do fator 1,2) e o déficit planejado ("500 kcal de déficit"; meta = gasto − 500).
- **Macros:** cada um com comido / meta em gramas, "faltam X g" ou "passou X g" (vermelho) e a barra até a meta, proporcional ao comido (0 g = barra vazia; cheia ao bater ou passar a meta). Sem pesagem no Corpo, sem meta: só as gramas comidas.

## Registrar o que comi

- Um campo: "O que você comeu?". Enter (ou +) envia.
- **Comida salva primeiro:** enquanto digita, aparecem as comidas salvas que têm todas as palavras digitadas (sem acento e maiúsculas), as mais usadas primeiro; tocar adiciona 1 porção. Com o campo vazio, aparecem as 8 mais usadas. Texto igual ao nome de uma comida salva adiciona direto. Nada disso chama a IA.
- **IA:** texto novo vai para a IA (Edge Function `al-estimar`, Claude Haiku), que separa em itens com porção (com gramas aproximados) e valores estimados de tabelas brasileiras. Abre a **prévia**: cada item com nome, porção, kcal, P, C e G editáveis, e × para tirar. "Adicionar" registra; "Cancelar" descarta.
- **Sem IA** (sem internet, IA fora do ar, limite do dia, nada reconhecido): aviso curto e a prévia abre com um item com o texto como nome, para digitar os valores.
- Ao adicionar, cada item vira comida salva (`al_item`): mesmo nome e porção atualiza os valores (vale a correção), senão cria. O registro do dia copia os valores da porção: corrigir a comida salva depois não muda o que já foi comido.
- Registro de hoje leva a hora; de outro dia, fica sem hora.

## Lista do dia

- Em ordem de hora (sem hora no fim): hora, nome, porção (com "2 × " quando há mais de uma), P/C/G e kcal do total.
- Porções: ½, 1, 1½, 2, 3 (multiplica a porção salva).
- Apagar: lixeira com toque duplo (o 1º deixa vermelho por 3 s). Apaga só o registro; a comida salva continua.

## Dias

- O app começa no 1º dia com algo registrado (comida ou "Andei"); sem nada, hoje. ‹ › trocam o dia mostrado: ‹ para no 1º dia, › para em hoje. Tudo (saldo, macros, lista, "Andei") é do dia mostrado, e o que for adicionado entra nele.
- **Últimos 7 dias** (até hoje, sem dias antes do 1º dia do app): dia, kcal comidas e saldo final de cada dia fechado (verde déficit, vermelho superávit; sem comida, sem saldo). Hoje não tem saldo nem entra na média, porque ainda não fechou. Tocar abre o dia. Embaixo, a média do saldo dos dias fechados com comida registrada ("Média de 3 dias fechados: −480 kcal/dia").
- Com o app aberto na virada do dia, ao voltar para ele "Hoje" passa a ser o dia novo.

## Limites da IA

- No máximo 40 consultas por dia (`al_uso`), contadas antes de chamar a IA. Texto de até 500 caracteres. Até 20 itens por resposta; valores limitados como nas tabelas (kcal até 5.000, gramas até 500).
