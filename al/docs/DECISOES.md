# Decisões da Alimentação (`al`)

O porquê das escolhas. A regra vigente fica em `REGRAS.md`; o jeito de trabalhar, em `../AGENTS.md`; o que vale para todos os apps, em `../../docs/DIRETRIZES.md`.

## IA numa Edge Function (26/10/2026)

- A chave da Anthropic não pode ir para o navegador nem para o repositório (público): fica só no secret `ANTHROPIC_API_KEY` da função `al-estimar`.
- A função confere a sessão no Auth e recusa quem não for a conta `DONO`.
  O deploy é com `--no-verify-jwt` para o pedido de CORS do navegador (sem sessão) chegar à função; a conferência da sessão fica no código.
- Limite de 40 consultas por dia em `al_uso`, gravado com a sessão do próprio mantenedor, sem chave de serviço: o custo da API tem teto e o RLS continua valendo.
- Modelo `claude-haiku-5-5`, effort `low`, saída em JSON com esquema; a função devolve só itens limpos.
- O que a IA devolve vira comida salva (`al_item`) ao ser adicionado: a mesma comida não volta para a IA.
  27/10/2026: uma comida salva por nome + medida (concha pequena e concha normal separadas); repetidas viram uma só ao abrir.
- Sem a chave ou sem a função, o app segue com digitação à mão.

## Gasto do dia compartilhado

- `gasto.js` (funções puras) é o mesmo arquivo no al e no hábito do déficit da página inicial: a conta nunca diverge.
- Perfil, taxa basal e calorias do treino vêm de `../corpo/perfil.js`; treinos e pesagens são só lidos.
- Fator de atividade 1,2 (sedentário) e déficit de 500 kcal (~0,5 kg de gordura por semana).

## Registro com mínimo esforço

- Nada de formulário longo: a IA faz o trabalho e a comida salva evita repetir.
- 26/10/2026: caminhada cumulativa em trechos (migration 02), em vez de um total por dia; o total antigo virou 1 trecho sem horário.
- 27/10/2026: dia passado é só leitura na tela, e o que é lançado em outro dia é gravado sem hora, para o hábito "lançado no dia" da página inicial.
- 27/10/2026: as bebidas da Água com calorias contam como comido, lidas de `agua_dia` (só leitura).

## Fora do al

- Água e outros hábitos (sem doce etc.) não entram aqui: são módulos próprios (a Água já existe).
