# Decisões da Água (`agua`)

O porquê das escolhas. A regra vigente fica em `REGRAS.md`; o jeito de trabalhar, em `../AGENTS.md`; o que vale para todos os apps, em `../../docs/DIRETRIZES.md`.

## App próprio (26/10/2026)

- Água bebida com horário contra a meta do dia, numa linha por dia (`agua_dia.aguas`), com lembretes das 10 às 16.
  Nada de lembrete depois das 17h, para não precisar levantar de noite para o banheiro.
- 27/10/2026: xixi e bexiga saíram para o Corpo (migration `corpo/04`): os dados do corpo ficam num lugar só.

## Notificações de verdade (Web Push)

- Sem biblioteca de criptografia: o push vai sem conteúdo e só leva a assinatura VAPID (ES256, WebCrypto); o texto fica no `sw.js`.
- As chaves VAPID e o token do agendamento nascem na 1ª chamada da função e ficam só em `push_chave`, sem policy: nada de secret para configurar, nada no repositório.
- A função `agua-lembrete` é publicada com Verify JWT desligado porque o pg_cron chama sem sessão; a barreira é o token de `push_chave`.
- Deno não carrega `../corpo/perfil.js`, então a função repete `PRESENCIAL`, `INICIO`/`FIM` e `DONO`; os testes conferem que batem com o app.
- 26/10/2026: o botão Testar saiu; a função só atende o agendamento.

## Lembrete de escovar os dentes (28/10/2026)

- 20 min depois de lançar comida no al, pelo mesmo push: gatilho em `al_registro` agenda em `push_agendado`, e o pg_cron de minuto em minuto chama a função.
- Como o push vai sem conteúdo, a função grava o tipo em `push_ultimo` e o `sw.js` pergunta qual texto mostrar; sem resposta, mostra o de água. Sem a tabela `push_ultimo` (antes da migration 02, aplicada em 28/10/2026), o lembrete de água seguia normal.

## Outras bebidas (27/10/2026)

- Suco, refri, cappuccino e leite com Toddy gravam `bebida` e `volume`; `ml` é só a parte que é água, o que soma para a meta.
- As kcal saem de `volume` × a tabela de `bebidas.js` na hora, não são gravadas: mudou a tabela, muda o histórico também (aceito, para o al e o hábito do déficit lerem sempre a mesma conta).

## Nunca perder dado (27/10/2026)

- Uma cópia velha do celular apagou a água do dia porque o envio sobrescrevia o dia inteiro.
  Desde então o envio mescla as listas do dia com a nuvem (ver `../../docs/DECISOES.md`).
