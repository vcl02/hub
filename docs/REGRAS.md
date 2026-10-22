# Regras do Diário de Carga

Fonte de verdade do comportamento do app. Toda mudança de regra atualiza este arquivo e os testes na mesma alteração.

## Interface

- O app é só do mantenedor: nada de textos explicando como usar o app (dicas de uso, instruções, legendas de ajuda). Ficam só dados, rótulos curtos e avisos de erro.
- As dicas de execução dos exercícios (posição, postura) não são ajuda do app: ficam, dentro de "Como fazer, ajustes e anotações".
- `aria-label` em botões só de ícone continua (não aparece na tela).
- Tela inicial: "Full body" e a data curta ("Qui, 22/10") na mesma linha, centralizados na altura dos botões de engrenagem e sair.
- Edição de treino e de pesagem na própria linha, com botões só de ícone: lixeira (excluir, 2 toques), X (cancelar) e ✓ (salvar).
- Voltar: só a seta azul "<" no canto superior esquerdo (sem texto).
- Esc: fecha a tela cheia aberta (garrafinha = X, parabéns = Ver resumo), senão cancela a edição na linha, senão volta uma tela. Na tela inicial e no login não faz nada.
- Só tema claro, mesmo com o celular no modo escuro.
- Cores: azul = app e ações, verde = feito/sucesso, vermelho = erro/abaixo da meta. Tokens no topo de `css/base.css`.

## Login e conta

- Login por **usuário** (`victor`) ou e-mail, e senha, Enter entra. Campos brancos com borda e o nome do campo dentro ("Usuário", "Senha") (`emailDoLogin`). Usuário desconhecido nem chega ao Supabase e recebe a mesma mensagem de senha errada (`Usuário ou senha inválidos.`).
- Mesma conta do fin. Só a conta `DONO` (`js/config.js`) entra: outra conta sai na hora com "Esta conta não tem acesso ao Diário de Carga.". O RLS das tabelas `tr_*` também só libera essa conta (migration 02).
- Sem "Esqueci a senha" e sem "Trocar senha": a senha é a do Supabase e se troca fora do app.
- Tela inicial, canto superior direito: balança (peso corporal), engrenagem, que vai direto para a edição de exercícios (no fim dela: instalar e o estado da conta e da nuvem), e o botão de sair, só ícone e vermelho como no fin. Não há tela de Ajustes.
- A sessão fica salva no aparelho: o app entra direto, inclusive sem internet. "Sair" apaga a cópia local se não houver nada pendente; se houver, o 1º toque avisa e o 2º (em até 3 s) sai, mantendo a cópia para enviar no próximo login.

## Banco e sincronização

Supabase do projeto `fin`, tabelas com prefixo `tr_`, todas com `user_id`:

| Tabela | Chave | Campos |
|---|---|---|
| `tr_exercicio` | `id` | ordem, grupo, regiao, series, reps, descanso, modo, ativo |
| `tr_variacao` | `id` | exercicio_id, ordem (0 principal, 1 substituto, 2 halter), nome, unidade, passo, lados, equip, nota |
| `tr_registro` | `variacao_id, data` | series `[{ kg, reps }]` |
| `tr_treino` | `inicio` | fim, fechado |
| `tr_medida` | `data` | hora, peso, cintura |

- O app grava primeiro uma cópia local (`tr.db.<usuário>`) e, 0,8 s depois de cada mudança, envia só as linhas que mudaram em relação à última versão confirmada (`tr.base.<usuário>`): upsert de pais para filhos, delete de filhos para pais.
- Sem internet, a mudança fica pendente e envia ao reconectar, ao voltar para o app ou a cada 1 min. Ao abrir, envia o pendente e só então baixa a versão da nuvem, que passa a valer.
- Pendência ou erro de envio aparece em uma linha na tela inicial; no fim da edição de exercícios aparece o estado ("Tudo salvo na nuvem.").
- Registro de variação que não existe mais é descartado.
- **Versão antiga** (cofre criptografado `carga.vault.v1`): no 1º login é juntada à conta automaticamente se a chave estava salva; sem a chave, fica no aparelho sem ser aberta (não existe mais senha mestra: a senha é só a do Supabase). No mesmo dia (treino), variação+dia (registro) ou dia (pesagem), vale o do aparelho.
- Sem backup manual (baixar ou restaurar .json): os dados já ficam no Supabase.
- Fica só no aparelho, fora do banco: fotos das máquinas (`carga.foto.<variação>`), sessão do dia (`carga.sessao`), lembrete da água (`carga.agua`).

## Treino

- **Dias:** `DIAS_FIXOS` (quarta, quinta) e `DIAS_EXTRA` (segunda) em `js/config.js`.
- **Pirâmide:** `modo` crescente (+10% de peso, −2 reps), reta (mesma carga) ou invertida. Você põe o peso da 1ª série; as outras sobem pelo `passo` do aparelho. Cada série pode ter peso e reps ajustados. Bateu todas as reps-alvo = pirâmide completa ("↑ Subir carga").
- **Unidades:** `kg`, `lb` (mostra o equivalente em kg) ou `nível`. `lados: 2` = peso por lado (mostra o total).
- **Aquecimento:** o 1º exercício de cada `regiao` (Pernas / Superior) no dia ganha 1 série de 50% × 15, com 45 s de descanso.
- **Série sem peso:** não pode ser marcada (sem peso o registro não é salvo).
- **Registro:** 1 por exercício por dia, salvo a cada série marcada, ajuste, peso ou troca de variação.
- **Card de tempo na tela inicial:** só durante o treino ("Treino em andamento" + Finalizar). Treino encerrado aparece só em "Últimos treinos".
- **Tempo de treino:** começa no 1º toque dentro de um exercício. "Finalizar" ou 30 min sem mexer encerram (no horário da última interação).
- **Um treino por dia:** depois de encerrado, o dia trava até "Reabrir". Abrir o app e não treinar (sem registro e sem finalizar) recomeça a contagem no próximo toque, sem criar 2º treino.
- **Dia treinado:** tem registro **ou** treino finalizado (`fechado`), mesmo sem séries salvas. Conta para a semana, os pontos e as conquistas; o dia aparece como "✓ Treino feito".
- **Parabéns:** ao finalizar o treino de hoje, tela cheia verde com duração, exercícios, recordes, pontos e o que foi ganho no dia (nível novo e conquistas desbloqueadas pelos dados do dia). "Ver resumo" fecha e mostra o resumo (sem X).
- **Resumo:** no fim do treino e ao tocar num dia feito (semana, "Últimos treinos" ou "Ver todos os treinos"): duração, calorias, exercícios, volume, pontos e o que foi feito.
- **Lembrete da garrafinha:** tela cheia azul ao abrir o 1º exercício do dia (qualquer dia), até "Já peguei" (não volta mais no dia) ou o dia contar como treinado. O X (canto superior direito) só fecha: ela volta ao começar o treino de novo (reabrir o app) no mesmo dia.

## Peso corporal

- Pesagem diária: 1 por dia (a nova substitui a do dia), em qualquer horário. Peso de 30 a 300 kg; cintura opcional. Na tela inicial, a balança fica no canto superior (ao lado da engrenagem), com um ponto azul enquanto não houver pesagem hoje.
- O horário habitual é o da pesagem mais recente; mais de 1 h fora dele só recomenda voltar a ele (aviso azul), nunca bloqueia.
- Na edição dá para mudar data, horário e peso. Data no futuro ou dia que já tem pesagem é recusado.
- **IMC:** peso ÷ altura² com `ALTURA` = 1,78 m (`js/config.js`), 1 casa decimal. Faixas da OMS: < 18,5 abaixo do peso, < 25 normal, < 30 sobrepeso, ≥ 30 obesidade. Aparece no card do topo da tela de peso (peso atual em destaque, IMC e variação desde a 1ª pesagem) e em cada pesagem do histórico.
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
