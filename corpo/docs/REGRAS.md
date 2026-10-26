# Regras do Corpo

## Acesso

- Só a conta do Victor. Dentro do hub, sem sessão vai para o login do hub (`../?volta=corpo/`) e volta depois de entrar; login próprio só fora do hub (testes). Outra conta: "Esta conta não tem acesso." Sem botão de sair.
- Abre na hora com a cópia do aparelho, inclusive sem internet; depois envia o que estava pendente e traz a nuvem.

## Perfil (só em código, `perfil.js`)

- Altura 1,78 m, nascimento 14/09/2002, sexo masculino. Idade no dia (`idadeEm`), taxa basal Mifflin-St Jeor (`tmb`) e calorias do treino (`kcalTreino`, 3,5 MET × basal/hora × horas) saem daqui para todos os apps.
- Linha do perfil embaixo do card: "24 anos · 1,78 m · basal ~1.898 kcal/dia" (basal com o peso mais recente).

## Medida do dia

- 1 por dia, em `corpo_medida`: peso (kg) e/ou barriga (cm, na linha do umbigo; coluna `cintura`), com o horário. Pelo menos um dos dois.
- Formulário: dia (hoje por padrão; até hoje, nunca futuro), horário (vem a hora de agora, livre), peso e barriga com − / + (peso de 0,1 em 0,1 kg; barriga de 0,5 em 0,5 cm). O dia escolhido já mostra o que foi medido nele; "Salvar" troca a medida desse dia.
- Peso de 30 a 300 kg; barriga maior que zero (sem trava baixa). Vazio = não medido.
- **Horário de sempre:** o da pesagem mais recente com horário. Mais de 1 h longe dele: aviso (só recomenda, salva igual).

## Peso atual

- Card do topo: peso mais recente em destaque; a data só aparece se não for de hoje ("ontem", "há 3 dias"…); IMC e faixa ("IMC 28,4 · Sobrepeso"); quanto falta para a faixa seguinte rumo ao normal; variação desde a 1ª pesagem (verde se caiu); barriga mais recente e a variação desde a 1ª medida de barriga. Variação zero não aparece.
- **IMC:** peso ÷ altura², 1 casa. Faixas da OMS com graus: < 16 Magreza III, < 17 Magreza II, < 18,5 Magreza I, < 25 Normal, < 30 Sobrepeso, < 35 Obesidade I, < 40 Obesidade II, ≥ 40 Obesidade III.
- **Quanto falta:** em passos de 0,1 kg com o mesmo IMC arredondado da tela ("7,5 kg até Sobrepeso"; abaixo do normal, "0,6 kg até Magreza II"; no normal, nada), sem sinal: a faixa seguinte já diz se é perder ou ganhar.

## Evolução e histórico

- Gráficos do peso e da barriga (últimas 16 medidas de cada), só com 2 ou mais; com menos, nem a caixa nem o título.
- Histórico, mais recente primeiro: data e horário, peso e barriga numa linha e o IMC. Lápis edita na linha (data, horário, peso, barriga; 1 por dia: "Já tem medida em 15/10"); Esc ou × cancela. Lixeira apaga com toque duplo.

## Para os outros apps

- Treino (calorias do treino) e Alimentação (gasto do dia) leem as pesagens por `perfil.js`: peso do dia = a pesagem mais recente até ele (`pesoNoDia`). Nenhum dos dois grava medidas.
