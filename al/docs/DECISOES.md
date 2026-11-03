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

## Marmitas (30/10/2026)

- Para refeições montadas antes (à noite, para o almoço do dia seguinte): a prévia vira marmita em vez de entrar na conta, e aplicar lança tudo no dia em que for comida.
- Várias iguais com contador (`restam`), não uma por vez nem um modelo permanente: é o jeito de quem prepara a semana; a última aplicada apaga a linha.
- Aplicar abre a prévia (um toque a mais), para ajustar o que de fato foi comido; entrar direto obrigaria a corrigir na lista depois.
- Tabela própria (`al_marmita`, migration 03), por id como `al_item`: aplicar em dois aparelhos ao mesmo tempo pode contar errado o `restam` (o último a enviar vence); o histórico (`01` da raiz) guarda o anterior.
- Sem a tabela, o app segue sem marmitas (mesma ideia do Corpo sem `corpo_dia`).

## Fora do al

- Água e outros hábitos (sem doce etc.) não entram aqui: são módulos próprios (a Água já existe).

## Auditoria dos testes (02/11/2026)

- Sem navegador agora: `tests/regras.test.mjs` (13 testes) roda as contas do dia, os avisos do saldo, as comidas salvas, as marmitas e as respostas da IA, com as funções tiradas dos arquivos publicados. `tests/helpers/rodar.mjs` roda o `sw.js` e o `bootstrap.js` em `node:vm`. O navegador de `tests/dia.test.mjs` caiu de 27 para 20 testes.
- Mudança de código, só para poder testar (02/11/2026): `avisoAinda`, `alertaUrgente` e `linhasDoAlerta` saíram de `pintarSaldo` (`js/telas.js`) para `js/conta.js`, com o mesmo texto. `pintarSaldo` só chama essas funções e grava o HTML. O aviso "ainda em déficit" e o alerta do treino extra são regra, e agora rodam sem tela. Nada muda para quem usa; `docs/REGRAS.md` não muda.
- Continua em Playwright: lançar e apagar com a ligação ao banco, a caminhada entre dois aparelhos e no "metrô", a IA na prévia, a marmita na tela, a lista do dia, a troca de dia (`?dia`, arrasto, ← →), o Esc e o caso sem internet.
- Lacunas: nenhuma registrada nesta rodada.
- Relógio falso pausado (02/11/2026): o helper de navegador usa `../tests/relogio.mjs`, o mesmo dos outros apps e da raiz. A oscilação do toque duplo em `[data-tirar-trecho]` não era relógio: a nuvem chegava depois do `reload` e redesenhava a lista, e o redesenho desarmava o botão. Desde 03/11/2026 o armado sobrevive ao redesenho ("Toque duplo pela chave do item", abaixo), e os testes seguram a nuvem (`recarregarComNuvemSegurada`) para fazer a chegada entre os toques de propósito.

## Toque duplo pela chave do item (03/11/2026)

- Antes, o armado era só a classe `armado` no botão: a nuvem que chegava entre o 1º e o 2º toque redesenhava a lista com botões novos, o vermelho sumia e o 2º toque só armava de novo (era preciso um 3º). Corrigido em todos os apps (al, Água, Corpo, Treino) do mesmo jeito.
- O armado fica em `armados` (`js/util.js`), pela chave do item no `data-armavel` do botão, com o mesmo prazo de 3 s. Um `MutationObserver` reaplica o vermelho depois de qualquer redesenho (em vez de chamar em cada desenho, que no Treino são muitos). `armar`, `estaArmado`, `desarmar`, `pintarArmados` e `confirmar` são pequenos e iguais nos quatro apps, para irem juntos para `base/nucleo.js` numa fatia futura.
- Chave, não posição: os trechos não têm id, e a nuvem que traz um trecho mais cedo muda a posição; com o índice, o 2º toque tiraria o vizinho. A chave é o conteúdo (dia, horário, min, km) e a vez entre iguais (`chavesDosItens`); comida e marmita usam o id. Item que sumiu da lista: nada sai.
- Botão sem `data-armavel` nunca arma nem confirma (`confirmar` devolve false e avisa no console): antes, a chave vazia virava a string `"undefined"`, todos os botões sem o atributo dividiam a mesma, e armar um e tocar outro apagava sem ele ter sido armado (achado do qa, 03/11/2026). Teste de função em `tests/repetidas.test.mjs` da raiz (dois botões com `dataset` vazio), nos quatro apps; o `MutationObserver` também roda ali, com um observador falso que guarda o callback (repinta só com item armado).
- Chave estável também onde o item ainda não tem id: o exercício novo do editor do Treino ganha a chave local uma vez, no + Novo (`e.chave`, só na tela; nunca vai para o db), em vez de um `novoId()` a cada desenho, que perderia o armado num redesenho.
- Item que sumiu entre os toques não apaga nada também no Treino: excluir treino e apagar registro do histórico conferem o item antes (o excluir quebrava com o treino sumido; o apagar mostrava "Registro apagado" com um Desfazer que voltaria a cópia velha). Testes de navegador com a nuvem segurada (`recarregarComNuvemSegurada`) na Água, no Corpo e no Treino, no mesmo molde do al: o armado anda com o item, o vizinho fica e o que sumiu não sai.
