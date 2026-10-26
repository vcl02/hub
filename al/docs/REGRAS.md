# Regras da Alimentação

## Acesso

- Só a conta do Victor (a mesma do hub e do Treino). Dentro do hub, sem sessão vai para o login do hub (`../?volta=al/`) e volta depois de entrar. A tela de login própria (usuário e senha) só aparece com o app servido fora do hub (testes). Outra conta: "Esta conta não tem acesso." Sem botão de sair (Sair fica no hub).
- Abre na hora com a cópia do aparelho, inclusive sem internet; depois envia o que estava pendente e traz a nuvem e o Treino.

## Gasto do dia

- **Peso:** a pesagem mais recente até o dia, lida do Treino. Sem nenhuma pesagem: sem gasto e sem saldo ("Sem peso no Treino para calcular o gasto"), só o que foi comido.
- **Basal:** Mifflin-St Jeor com o perfil do hub (`../perfil.js`) e a idade no dia.
- **Rotina:** basal × 1,2 (fator de atividade sedentário).
- **Treino:** treinos do dia no Treino. Soma só o que passa da basal: calorias do treino (`kcalTreino`, 3,5 MET × basal/hora × horas, a mesma conta do Treino) − basal/hora × horas = (3,5 − 1) × basal ÷ 24 × horas.
- **Caminhada:** toque "Andei hoje" (ou "Andei neste dia") por dia, gravado em `al_dia`. Soma 40 min de caminhada moderada: (3,5 − 1) × basal ÷ 24 × 40/60. O botão mostra quanto soma.
- **Gasto** = rotina + treino + caminhada (se marcada). Valores arredondados para kcal inteiras em cada parte.

## Saldo

- Saldo = comido − gasto. Negativo ou zero = **déficit** (verde); positivo = **superávit** (vermelho). Número grande com sinal (−2.606), "Comi X · Gastei Y" e a conta do gasto embaixo ("Basal 1.998 × 1,2 = 2.398 · Treino +208 · Caminhada +139 · 100 kg").
- **Macros do dia:** proteína, carboidrato e gordura em gramas inteiros, com a parte de cada um nas kcal dos macros (4/4/9 kcal por grama) e uma barra.

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

- ‹ › trocam o dia mostrado; › para em hoje. Tudo (saldo, macros, lista, "Andei") é do dia mostrado, e o que for adicionado entra nele.
- **Últimos 7 dias** (até hoje): dia, kcal comidas e saldo de cada um (verde déficit, vermelho superávit; sem comida, sem saldo). Tocar abre o dia. Média do saldo dos dias com comida registrada.
- Com o app aberto na virada do dia, ao voltar para ele "Hoje" passa a ser o dia novo.

## Limites da IA

- No máximo 40 consultas por dia (`al_uso`), contadas antes de chamar a IA. Texto de até 500 caracteres. Até 20 itens por resposta; valores limitados como nas tabelas (kcal até 5.000, gramas até 500).
