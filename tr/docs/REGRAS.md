# Regras do Diário de Carga

Fonte de verdade do comportamento do app. Toda mudança de regra atualiza este arquivo e os testes na mesma alteração.

## Interface

- O app é só do mantenedor: nada de textos explicando como usar o app (dicas de uso, instruções, legendas de ajuda). Ficam só dados, rótulos curtos e avisos de erro.
- As dicas de execução dos exercícios (posição, postura) não são ajuda do app: ficam, dentro de "Como fazer, ajustes e anotações".
- `aria-label` em botões só de ícone continua (não aparece na tela).
- Tela inicial: só "Full body" no título (sem data), centralizado na altura dos botões do canto.
- Edição de treino e de pesagem na própria linha, com botões só de ícone: lixeira (excluir, toque duplo), X (cancelar) e ✓ (salvar). No histórico de pesagens, lápis (editar) e lixeira (apagar, toque duplo).
- Confirmações (apagar, excluir) são por toque duplo: o 1º toque deixa o botão vermelho por 3 s, o 2º confirma. Sem alertas nem avisos escritos pedindo confirmação.
- Voltar: só a seta azul "<" no canto superior esquerdo (sem texto).
- Esc: fecha a tela cheia aberta (garrafinha = X, parabéns = Ver resumo), senão cancela a edição na linha, senão volta uma tela. Na tela inicial e no login não faz nada.
- Só tema escuro, o mesmo do hub e do fin (cinza grafite `#1B1E21`), mesmo com o celular no modo claro.
- Cores: azul = app e ações, verde = feito/sucesso, vermelho = erro/abaixo da meta. Tokens no topo de `css/base.css`.

## Login e conta

- Login por **usuário** (`victor`) ou e-mail, e senha, Enter entra. Campos na cor das superfícies (`#24272B`) com borda e o nome do campo dentro ("Usuário", "Senha"). Enquanto entra (login e 1ª carga), os campos travam e aparece "Entrando…"; a senha só é limpa depois de entrar (erro mantém) (`emailDoLogin`). Usuário desconhecido nem chega ao Supabase e recebe a mesma mensagem de senha errada (`Usuário ou senha inválidos.`).
- Mesma conta do fin. Só a conta `DONO` (`js/config.js`) entra: outra conta sai na hora com "Esta conta não tem acesso ao Diário de Carga.". O RLS das tabelas `tr_*` também só libera essa conta (migration 02).
- Sem "Esqueci a senha" e sem "Trocar senha": a senha é a do Supabase e se troca fora do app.
- Tela inicial, canto superior direito: marca do hub (volta ao hub, `../`), balança (peso corporal), engrenagem, que vai direto para a edição de exercícios (no fim dela: instalar e o estado da conta e da nuvem). Não há tela de Ajustes nem botão de sair: o login e o Sair ficam só na página inicial do hub.
- A sessão fica salva no aparelho e é a mesma do hub: o app entra direto, inclusive sem internet. Sair só pelo hub; a cópia local continua no aparelho, e o que estiver pendente envia no próximo login.
- Dentro do hub (`…/tr/`), o login é o da página inicial: sem sessão, o tr vai direto para `../?volta=tr/` e o hub devolve para cá depois de entrar (`irParaLoginDoHub` em `js/bootstrap.js`). A tela de login própria só aparece com o tr servido fora do hub (ex.: testes).

## Banco e sincronização

Supabase do projeto `fin`, tabelas com prefixo `tr_`, todas com `user_id`:

| Tabela | Chave | Campos |
|---|---|---|
| `tr_exercicio` | `id` | ordem, grupo, regiao, series, reps, descanso, modo, ativo |
| `tr_variacao` | `id` | exercicio_id, ordem (0 principal, 1 substituto, 2 halter), nome, unidade, passo, lados, equip, nota |
| `tr_registro` | `variacao_id, data` | series `[{ kg, reps, falha? }]` (`falha: true` só na série que falhou) |
| `tr_treino` | `inicio` | fim, fechado |
| `tr_medida` | `data` | hora, peso, cintura (a barriga, na linha do umbigo: o nome da coluna ficou) |

- O app grava primeiro uma cópia local (`tr.db.<usuário>`) e, 0,8 s depois de cada mudança, envia só as linhas que mudaram em relação à última versão confirmada (`tr.base.<usuário>`): upsert de pais para filhos, delete de filhos para pais.
- Sem internet, a mudança fica pendente e envia ao reconectar, ao voltar para o app ou a cada 1 min. Ao abrir, envia o pendente e só então baixa a versão da nuvem, que passa a valer.
- Pendência ou erro de envio aparece em uma linha na tela inicial; no fim da edição de exercícios aparece o estado ("Tudo salvo na nuvem.").
- Registro de variação que não existe mais é descartado.
- **Versão antiga** (cofre criptografado `carga.vault.v1`): no 1º login é juntada à conta automaticamente se a chave estava salva; sem a chave, fica no aparelho sem ser aberta (não existe mais senha mestra: a senha é só a do Supabase). No mesmo dia (treino), variação+dia (registro) ou dia (pesagem), vale o do aparelho.
- Sem backup manual (baixar ou restaurar .json): os dados já ficam no Supabase.
- Fica só no aparelho, fora do banco: fotos das máquinas (`carga.foto.<variação>`), sessão do dia (`carga.sessao`), lembrete da água (`carga.agua`).

## Treino

- **Dias:** `DIAS_FIXOS` (quarta, quinta) e `DIAS_EXTRA` (segunda) em `js/config.js`.
- **Pirâmide:** `modo` crescente (+10% de peso, −2 reps), reta (mesma carga) ou invertida. **Padrão de exercício novo: invertida** (`MODO_PADRAO`). Você põe o peso da 1ª série; as outras sobem (ou descem, na invertida) ~10% arredondado ao `passo` do aparelho, no mínimo 1 passo. Cada série pode ter peso e reps ajustados. Bateu todas as reps-alvo, sem falha = pirâmide completa ("↑ Subir carga").
- **Unidades:** `kg`, `lb` ou `nível` (máquina que marca só a posição/placa, sem peso: não converte e não entra no volume). `lados: 2` = peso por lado (mostra o total).
  - O botão da unidade alterna **kg ↔ lb**; `nível` se escolhe em Editar exercícios. Os pesos ficam guardados na unidade da variação, então trocar kg ↔ lb (no botão ou no editor) **converte** o histórico da variação, as séries de hoje e o peso digitado (1 casa decimal).
  - Ao lado do peso aparece o mesmo peso na outra unidade (lb → kg, kg → lb), **editável**: digitar converte para a unidade da variação, e − / + andam de 1 em 1 indo para o inteiro vizinho (22,7 → 23 → 24). O mesmo vale no editor de cada série.
- **Falha:** numa série já feita, o editor dela tem **Falhei**: marca que não completou a série sem mexer nas reps (fica `falha: true` na série). A série fica com ✗ vermelho, as reps aparecem com ✗ ("8/10✗/12") e a pirâmide não conta como completa. Na tela do exercício: "✗ Falhou em N de M · série X" (últimos 5 registros da variação); na tela inicial: "✗ Falhou na última".
- **Desfazer série:** "Desfazer última série" (abaixo do cronômetro) desmarca a última série marcada, a qualquer hora; o aviso logo depois de marcar também tem Desfazer. Desfazer depois de já ter ido para o próximo exercício volta para o exercício da série.
- **Aquecimento:** o 1º exercício de cada `regiao` (Pernas / Superior) no dia ganha 1 série de 50% × 15, com 45 s de descanso.
- **Série sem peso:** não pode ser marcada (sem peso o registro não é salvo).
- **Registro:** 1 por exercício por dia, salvo a cada série marcada, ajuste, peso ou troca de variação.
- **Descanso:** faltando 7 s (`AVISO_AJUSTE`), aparece **"Se ajuste"** piscando acima do cronômetro, a faixa de baixo troca "Descanso" por "Se ajuste" e o celular vibra uma vez, para se ajeitar na máquina. Com +15 s depois do aviso, avisa de novo.
- **Última série do exercício:** a tela já vai para o próximo exercício que falta, e o descanso que sobra segue na faixa de baixo (a mesma de quando você sai do exercício durante o descanso). Sem próximo (era o último que faltava), fica no descanso e, no fim dele, encerra o treino.
- **Card de tempo na tela inicial:** só durante o treino ("Treino em andamento" + Finalizar).
- **Semanas:** ‹ › ao lado da linha da semana, ou arrastar a linha para o lado (para a **esquerda volta**, para a direita avança), trocam a semana mostrada, para trás até a do 1º dia treinado e para frente até a atual. Em semana passada, a linha mostra o período ("13/10 a 19/10") e os fixos feitos nela. Sem lista de treinos nem tela de histórico: o dia feito (✓) abre o resumo.
- **Tempo de treino:** começa no 1º toque dentro de um exercício. "Finalizar" ou 30 min sem mexer encerram (no horário da última interação).
- **Um treino por dia:** depois de encerrado, o dia trava até "Reabrir". Abrir o app e não treinar (sem registro e sem finalizar) recomeça a contagem no próximo toque, sem criar 2º treino.
- **Dia treinado:** tem registro **ou** treino finalizado (`fechado`), mesmo sem séries salvas. Conta para a semana, os pontos e as conquistas; o dia aparece como "✓ Treino feito".
- **Parabéns:** ao finalizar o treino de hoje, tela cheia verde com duração, exercícios, recordes, pontos e o que foi ganho no dia (nível novo e conquistas desbloqueadas pelos dados do dia). "Ver resumo" fecha e mostra o resumo (sem X).
- **Resumo:** no fim do treino e ao tocar num dia feito (✓) da semana: duração, calorias, exercícios, volume, pontos, o que foi feito e a linha do horário com Editar (mudar horário ou excluir o treino do dia). Finalizou antes de fazer todos: abaixo dos números, "Ficou de fora: …" com os exercícios sem registro no dia. No resumo, ‹ › ao lado da data, ou arrastar a tela (para a esquerda o anterior, para a direita o seguinte), vão de um treino para o outro (só dias treinados; para no 1º); depois do mais recente, › e arrastar para a direita voltam para a lista de hoje.
- **Lista da tela inicial em outro dia:** arrastar a lista (ou a barra de progresso) para a **direita** (o contrário das semanas) mostra, **na própria tela inicial**, o treino anterior: cada exercício com o que foi feito naquele dia (peso, reps, ✓ Feito / Não feito, ✗ Falhou), o progresso do dia ("Qua, 21/10 · 1/6") e o dia marcado em azul na semana, que acompanha. Para a esquerda avança até hoje; "Hoje" volta direto. Sair da tela inicial e voltar mostra hoje de novo.
- **Lembrete da garrafinha:** tela cheia azul ao abrir o 1º exercício do dia (qualquer dia), até "Já peguei" (não volta mais no dia) ou o dia contar como treinado. O X (canto superior direito) só fecha: ela volta ao começar o treino de novo (reabrir o app) no mesmo dia.

## Peso corporal

- Pesagem diária: 1 por dia (a nova substitui a do dia), em qualquer horário. Peso de 30 a 300 kg; **barriga** opcional, medida **na linha do umbigo** (em cm; guardada no campo `cintura`), sem limite de valor (vazia ou 0 = sem barriga). Na tela inicial, a balança fica no canto superior (ao lado da engrenagem), com um ponto azul enquanto não houver pesagem hoje.
- O horário é livre: o campo vem com a hora de agora. O habitual é o da pesagem mais recente; mais de 1 h fora dele só recomenda voltar a ele (aviso azul), nunca bloqueia.
- Na edição dá para mudar data, horário, peso e barriga (vazia = sem barriga, sem limite de valor).
- Gráficos: evolução do peso (com 2+ pesagens) e, com 2+ medidas de barriga, evolução da barriga. Com menos de 2 pontos, o gráfico e o título dele somem (vale também para a evolução da carga dos exercícios). O card do topo mostra a barriga mais recente e a variação desde a 1ª (menos = verde). Data no futuro ou dia que já tem pesagem é recusado.
- **IMC:** peso ÷ altura² com `ALTURA` = 1,78 m (`js/config.js`), 1 casa decimal. Faixas da OMS com graus: < 16 Magreza III, < 17 Magreza II, < 18,5 Magreza I, < 25 Normal, < 30 Sobrepeso, < 35 Obesidade I, < 40 Obesidade II, ≥ 40 Obesidade III. No card do topo, IMC e faixa ficam numa linha ("IMC 31,5 · Obesidade I"); a data só aparece se a última pesagem não for de hoje; variação de peso ou de barriga igual a zero não aparece. O card também mostra quanto falta para a faixa seguinte rumo ao normal ("−7,5 kg até Sobrepeso"; abaixo do normal, "+X kg até…"; no normal, nada), em passos de 0,1 kg com o mesmo IMC arredondado da tela, para o número sempre bater com a faixa mostrada. Aparece no card do topo da tela de peso (peso atual em destaque, IMC e variação desde a 1ª pesagem) e em cada pesagem do histórico, numa linha só: peso e barriga juntos e o IMC logo depois ("102,3 kg · 101,5 cm · IMC 32,3"), com a hora embaixo da data.
- **Perfil** (constantes no topo do código, fora do banco): altura 1,78 m, nascimento 14/09/2002, sexo masculino. A tela de peso mostra idade, altura e a taxa basal.
- **Taxa basal (TMB):** Mifflin-St Jeor = 10 × peso + 6,25 × altura (cm) − 5 × idade + 5 (homem), em kcal/dia, com a idade no dia.
- **Calorias:** estimativa com MET corrigido = 3,5 MET (Compendium of Physical Activities, 02054) × TMB ÷ 24 × horas de treino, com o peso da pesagem mais recente até o dia. O padrão assume 1 MET = 1 kcal/kg/h para todo mundo; usar a sua basal ajusta a conta para idade, altura e sexo.

## Pontos e conquistas

- Calculados a partir dos dados, nada extra é guardado. +50 por dia treinado, +10 por exercício, +10 por pirâmide completa, +25 por recorde, +20 por treino extra, +10 por semana com pesagem. Nível sobe a cada 300 pontos.
- Sequência = semanas seguidas com 2+ treinos; a semana atual só entra quando bate a meta.
- **Longo prazo, ano a ano (1 a 5):** base de ~80 treinos e ~40 semanas batidas por ano. Ano N: N anos desde o 1º treino com 80×N treinos · 40×N semanas batidas (não precisam ser seguidas) · 25×N recordes · 100×N pirâmides perfeitas.

## Atualização e offline

- Ao abrir, ao voltar para o app e a cada 10 min, o app compara `index.html` e os arquivos de `css/` e `js/` publicados com os que estão rodando; se mudaram, recarrega, nunca no meio do treino nem em tela com formulário.
- `sw.js`: rede primeiro (revalidando com o servidor), cache só sem internet. Cache de nome fixo e nada de outros domínios (Supabase, fontes).
- `supabase.js` = `@supabase/supabase-js` 2.118.0 (UMD), copiado para funcionar offline.

## Testes

- Playwright + `node:test` em `tests/` (um arquivo por área, infra em `tests/helpers/app.mjs`), com um Supabase falso em memória: nenhum dado de teste no banco real.
- `tests/estrutura.test.mjs` (sem navegador): cabeçalho de responsabilidade em todo arquivo, tags do HTML e chaves do CSS balanceadas, ordem de carga igual à do `sw.js`, PWA, migrations no formato do DataGrip com RLS só do dono e nenhum segredo no repositório.
- `node scripts/check.mjs` roda sintaxe, higiene textual, testes e `git diff --check`; o GitHub Actions roda o mesmo.
