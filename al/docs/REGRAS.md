# Regras da Alimentação

## Acesso

- Só a conta do Victor (a mesma do hub e do Treino). Dentro do hub, sem sessão vai para o login do hub (`../?volta=al/`) e volta depois de entrar. A tela de login própria (usuário e senha) só aparece com o app servido fora do hub (testes). Outra conta: "Esta conta não tem acesso." Sem botão de sair (Sair fica no hub).
- Abre na hora com a cópia do aparelho, inclusive sem internet; depois envia o que estava pendente e traz a nuvem e o Treino.
- **Rede ruim (metrô):** cada pedido ao Supabase tem limite de 15 s (a IA, 40 s); estourou, conta como sem internet (fica salvo no aparelho e envia na próxima tentativa), e o envio nunca fica preso. Envio que chegou à nuvem mas cuja resposta se perdeu não é somado de novo na tentativa seguinte (o mesmo trecho de caminhada não entra duas vezes; comida vai por id e repetir não duplica).

## Gasto do dia

- **Peso:** a pesagem mais recente até o dia, lida do app Corpo (`pesoNoDia`). Sem nenhuma pesagem: sem gasto e sem saldo ("Sem pesagem no Corpo para calcular o gasto"), só o que foi comido.
- **Basal:** Mifflin-St Jeor com o perfil do Corpo (`../corpo/perfil.js`) e a idade no dia.
- **Rotina:** basal × 1,2 (fator de atividade sedentário).
- **Treino:** treinos do dia no Treino. Soma só o que passa da basal: calorias do treino (`kcalTreino`, 3,5 MET × basal/hora × horas, a mesma conta do Treino) − basal/hora × horas = (3,5 − 1) × basal ÷ 24 × horas. O cardio na esteira feito depois do treino (no Treino, `tr_treino.cardio`) entra aqui também, pela mesma regra: `kcalEsteira` − basal/hora × horas na esteira.
- **Caminhada (cumulativa):** linha "Andei" com minutos, km e **+**. Cada caminhada do dia (ida, volta, mercado…) é um **trecho**: toque em + (ou Enter num campo) e ele entra com o horário de agora, com os min e/ou km digitados; vazios = padrão de 20 min. Os campos limpam para o próximo. Até 600 min e 60 km por trecho, até 30 trechos por dia. Os trechos aparecem embaixo ("12:10 · 20 min ×"); toque duplo tira. O gasto soma todos. Nenhum dia vem marcado sozinho (nem quarta e quinta): sem trecho = não andou, e o dia sai de `al_dia`. Só dias com trecho contam como 1º dia do app. Gravado em `al_dia.caminhadas`; o total antigo do dia (antes da migration 02) virou 1 trecho sem horário.
  - **Toque duplo sem querer** no + com os mesmos minutos e km, no mesmo dia, em menos de 0,5 s, é ignorado. Adicionar a prévia duas vezes também não duplica (o 1º toque já fecha a prévia); a IA não é chamada de novo com a pergunta anterior ainda no ar.
  - Conta por trecho (equação de caminhada do ACSM, terreno plano): MET = (0,1 × velocidade em m/min + 3,5) ÷ 3,5; soma (MET − 1) × basal ÷ 24 × horas.
  - Com minutos e km, a velocidade é a real (limitada a 2–7 km/h); só minutos ou só km, 5 km/h (só km: tempo = km ÷ 5). Ex.: 20 min sem km = 66 kcal; 3 km = 119 kcal (com basal 1.998).
  - Ao lado do +, o efeito de todos os trechos no saldo ("−66 kcal"). Esteira dentro do horário de um treino do Treino, ou marcada como cardio no Treino, já conta no treino: lance só a caminhada fora dele.
- **Gasto** = rotina + treino + caminhada (soma dos trechos). A conta fica em `gasto.js`, a mesma do hábito do déficit na página inicial do hub.
- **Treino previsto:** hoje é dia de treino (quarta e quinta, `ROTINA.treino`; ou segunda, o extra opcional, `ROTINA.treinoExtra`) e ainda não há treino registrado no Treino: linha em amarelo "Você ganha 157 kcal a mais para comer se treinar" (segunda: "… (treino opcional)"), com a duração média dos últimos 8 treinos (sem nenhum, 1 h). É só aviso: a meta sobe de verdade quando o treino é registrado.
- **Treino obrigatório (dia opcional):** hoje é o dia do treino extra (segunda, `ROTINA.treinoExtra`), ainda sem treino registrado, e o que foi comido passou da meta: no lugar do aviso amarelo, alerta vermelho "Treino obrigatório hoje" (ícone pulsando) com quanto passou, o que o treino previsto faz ("Se treinar, você ganha 208 kcal e volta para a meta" ou "… e o excesso cai para X kcal"), e, se sem treino o dia fecharia em superávit, quanto ("…; treinando, ainda fecha em déficit" quando é o caso). Botão "Ir treinar" abre o Treino (`../tr/`). Nos dias fixos (quarta e quinta, já obrigatórios) e nos dias passados não aparece.

## Meta, saldo e macros

- **Meta do dia** = gasto do dia − 500 kcal (déficit planejado, ~0,5 kg de gordura por semana). Sobe junto com treino e caminhada.
- **Macros da meta:** proteína 1,6 g por kg de peso; gordura 25% das kcal da meta (÷ 9); carboidrato com o resto ((meta − proteína × 4 − gordura × 9) ÷ 4). Arredondados para gramas inteiros.
- **Hoje** (o dia não fechou): número grande = quanto ainda cabe até a meta ("1.450 kcal restantes", verde) ou quanto passou dela ("320 kcal acima da meta", vermelho). O gasto do dia inteiro não vira déficit antes da hora.
- **Dia passado:** saldo final = comido − gasto, sem sinal: "1.304 kcal de déficit" (verde) ou "kcal de superávit" (vermelho).
- Embaixo do número, uma informação por linha, na mesma ordem hoje e nos dias passados: "Meta", "Comi" e "Gastei". **Gastei** no dia passado é o gasto do dia inteiro; hoje é o que já foi gasto até agora (a rotina, basal × 1,2, na proporção das horas já passadas do dia, mais o treino e a caminhada já lançados). Na linha da meta, pequeno, o déficit planejado ("Meta · 500 kcal déficit · 1.901 kcal"; meta = gasto − 500). A conta do gasto (basal, dia a dia, treino, caminhada) não aparece.
- **Macros:** cada um com comido / meta em gramas, "faltam X g" ou "passou X g" (vermelho) e a barra até a meta, proporcional ao comido (0 g = barra vazia; cheia ao bater ou passar a meta). Sem pesagem no Corpo, sem meta: só as gramas comidas.

## Registrar o que comi

- Um campo: "O que você comeu?". Enter (ou +) envia.
- **Comida salva primeiro:** enquanto digita, aparecem as comidas salvas que têm todas as palavras digitadas (sem acento e maiúsculas), as mais usadas primeiro. Com o campo vazio, aparecem as 8 mais usadas. Tocar numa delas (ou digitar o nome igual, quando só há uma medida dele) abre a **prévia com 1 porção** e o cursor em **quantas**: mudar a quantidade recalcula o total (porção × quantas); só entra no dia ao tocar em Adicionar. Nome igual com mais de uma medida: "Escolha a medida nas sugestões". Nada disso chama a IA.
- **IA:** texto novo vai para a IA (Edge Function `al-estimar`, Claude Haiku), que separa em itens com **1 porção** (com gramas aproximados), **quantas porções** foram comidas e os valores estimados de tabelas brasileiras **do total comido**. Abre a **prévia**: cada item com nome, quantas × porção ("2 × 1 unidade (~50 g)") e kcal, P, C e G do total, todos editáveis (mudar quantas recalcula o total; corrigir o total muda o valor da porção), e × para tirar. "Adicionar" registra; "Cancelar" descarta.
- **Sem IA** (sem internet, IA fora do ar, limite do dia, nada reconhecido): aviso curto e a prévia abre com um item com o texto como nome, para digitar os valores.
- Ao adicionar, **hoje entra o total comido** (a porção com a quantidade: "2 × 1 unidade", 180 kcal) e cada item vira comida salva (`al_item`) **por 1 porção**: o total ÷ quantas (2 ovos de 180 kcal salvam "1 unidade" com 90 kcal). **Comida salva = nome + medida** (sem balança, a medida caseira é a unidade): "Feijão · 1 concha pequena" e "Feijão · 1 concha normal" são duas comidas salvas, cada uma por 1 unidade da sua medida. Mesmo nome e mesma medida atualiza os valores (vale a correção); medida nova cria outra. Repetidas iguais (mesmo nome e mesma medida) viram uma só ao abrir o app, a mais usada, com os usos somados. Usar a comida salva depois abre a prévia com 1 porção para dizer quantas. O registro do dia copia os valores da porção: corrigir a comida salva depois não muda o que já foi comido.
- Registro leva a hora de agora (só se lança no dia de hoje). Registros antigos sem hora são de quando dava para lançar em outro dia.

## Lista do dia

- **Bebidas da Água:** suco, refri, cappuccino, leite com Toddy e leite são lançados na Água (lá conta a parte que é água) e aparecem aqui na lista do dia, com contorno tracejado e "· da Água", só para ver (mudam na Água). As kcal e os macros deles (por 100 ml, `../agua/bebidas.js`: suco 40 kcal, refri 42, cappuccino 60, leite com Toddy 85, leite integral 60) contam como comido no saldo e nos macros. Bebida com calorias não se lança aqui.
- **Lembrete dos dentes:** comida nova de hoje agenda, no banco, uma notificação "Escove os dentes" para 20 min depois (outra comida antes disso empurra). Vai pelas notificações da Água (`../agua/`, migration `agua/02`).
- Em ordem de hora (sem hora no fim): hora, nome, porção (com "2 × " quando há mais de uma), P/C/G e kcal do total.
- Porções: ½, 1, 1½, 2, 3 (multiplica a porção salva).
- Apagar: lixeira com toque duplo (o 1º deixa vermelho por 3 s). Apaga só o registro; a comida salva continua.

## Dias

- O app começa no 1º dia com algo registrado (comida ou "Andei"); sem nada, hoje. ‹ › trocam o dia mostrado: ‹ para no 1º dia, › para em hoje. Tudo (saldo, macros, lista, "Andei") é do dia mostrado.
- **Dia passado é só leitura:** o campo de comida, as sugestões, as porções, apagar e a caminhada (campos, + e tirar trecho) ficam desativados; o campo diz "Dia fechado: só leitura". Só hoje aceita mudanças.
- **Últimos 7 dias** (até hoje, sem dias antes do 1º dia do app): dia, kcal comidas e saldo final de cada dia fechado (verde déficit, vermelho superávit; sem comida, sem saldo). Hoje não tem saldo nem entra na média, porque ainda não fechou. Tocar abre o dia. Embaixo, a média do saldo dos dias fechados com comida registrada ("Média de 3 dias fechados: −480 kcal/dia").
- Com o app aberto na virada do dia, ao voltar para ele "Hoje" passa a ser o dia novo.

## Limites da IA

- No máximo 40 consultas por dia (`al_uso`), contadas antes de chamar a IA. Texto de até 500 caracteres. Até 20 itens por resposta; valores limitados como nas tabelas (kcal até 5.000, gramas até 500).
