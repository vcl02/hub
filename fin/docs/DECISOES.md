# Decisões de arquitetura

## HTML estático único

O projeto permanece em um único `index.html` porque é publicado como site estático. Fragmentos HTML exigiriam build ou carregamento assíncrono e aumentariam a chance de scripts acessarem elementos antes de existirem.

## JavaScript clássico modular

Os arquivos em `js/` são scripts clássicos carregados em ordem explícita. Isso mantém a aplicação simples para editar, depurar no navegador e hospedar sem bundler. A ordem é um contrato testado.

## Estilo sem formatter pesado

O projeto usa `.editorconfig` e checagem nativa de tabs, espaços finais e newline final. ESLint e Prettier ficam fora por enquanto: em scripts clássicos globais eles exigiriam configuração extra e causariam um reformat amplo sem melhorar diretamente as regras financeiras.
_Atualização (01/11/2026):_ ESLint e Prettier passaram a rodar sobre o Fin a partir da raiz do hub (`npm run lint` e `npm run format:check`, no GitHub Actions). O `.editorconfig` do Fin ficou com `indent_size = 2`, igual ao `.prettierrc`, e a higiene de estilo é a `scripts/editorconfig.mjs` da raiz. Ver `docs/DECISOES.md` da raiz.

_Testes depois do Prettier (01/11/2026):_ o código passou a ser formatado, e muitos testes procuram trechos do texto do código. Por isso `tests/helpers/assert-tolerante.js` troca o `assert/strict` dos testes: o `match` tenta a regex original e, se não casar, compara a forma sem diferenças de formato (aspas, vírgula final, quebras de linha, `(x) =>` contra `x =>`), ignorando também maiúsculas e parênteses; o `doesNotMatch` continua estrito. Limite conhecido: um teste de texto fixo aceita a caixa trocada ou um parêntese a mais. Teste novo deve preferir a função rodando (`tests/helpers/carregar-funcoes.js`) a texto do código.

## Linguagem visual

O tema é sempre escuro, mas em cinza grafite legível, sem uma tela predominantemente preta. Ações compactas usam ícones com `title` e rótulo acessível; textos permanecem curtos e só aparecem quando esclarecem uma decisão. Formulários recebem somente campos necessários. O mobile tem paridade total com o desktop e só ajusta o layout. A conta restrita da Isabella saiu (out/2026): a interface é uma só. `Isabella` como categoria continua sendo uma categoria comum.

## Cadastro com layout fixo

Exceção pontual, sem mudar a direção minimalista: no cadastro, trocar Crédito ou Frequência desativa campos em vez de escondê-los. Vezes fica desativado mostrando a contagem da série, Fatura vira "—" no Débito e as faturas das parcelas 2..N ficam num modal aberto pelo "+N". Esconder e reaparecer campos movia Dividir, Fatura e Salvar a cada toque, o que pesava mais que um campo desativado à vista. Em Editar, Vezes e Dividir continuam escondidos: o modo é fixo durante toda a edição, então não há salto. Os demais formulários seguem a regra geral de mostrar só o necessário.

## Fatura e Crédito

Há dois cartões detalhados: Nubank (vence dia 12, todo o histórico) e Mercado Pago (vence dia 13). A fatura é derivada de `fin.fatura`; o título e os cálculos usam o ciclo correto, enquanto a tabela Crédito é uma prévia visual do ciclo seguinte, única para os dois cartões. Regra provisória: o cartão sai do dia do vencimento da fatura (`cartaoDaFatura`), sem coluna nova nem migration — escolha do mantenedor pela simplicidade, já que os dois vencimentos são dias diferentes. Nome e categoria continuam sem identificar cartão.

O limite contratado (Aprovado) de cada cartão e quanto do guardado vira garantia do Nubank são definidos por ciclo, na linha do ciclo na tabela `fin_ciclo`, herdando do ciclo anterior até outro definir outro — no banco, e não no navegador, para valerem igual em qualquer aparelho. O limite livre de cada cartão considera somente as próprias compras confirmadas (`pago = true`) e desconta as antecipações alocadas às faturas do próprio cartão. Só o Nubank acrescenta garantia: a parte escolhida do guardado positivo dos aportes/resgates reais **já pagos** até o ciclo (todo ele, sem escolha), nunca acima do guardado; o Mercado Pago não tem garantia. A garantia não obedece a filtros visuais e não inclui `Aporte sugerido` nem Aporte materializado ainda em aberto, pois apenas dinheiro aplicado na Nubank pode ampliar o limite. Pelo mesmo motivo, o Livre Hoje só libera limite com antecipação já paga. O mesmo título mostra o total utilizável (limite contratado mais garantia), para a soma não ficar implícita. Isso separa projeção de compra real e evita que antecipação libere mais do que a fatura paga.

A regra pelo dia do vencimento deixa de valer se os dois cartões passarem a vencer no mesmo dia ou se entrar um terceiro cartão. Nesse caso, a evolução é uma mudança de modelo deliberada: migration nova para uma identidade explícita de cartão em crédito e antecipação, mantendo os cálculos por cartão que já existem.

## Reserva de emergência

A meta usa nove ciclos futuros e somente despesas da categoria `Reserva`. Para cada nome, um valor cadastrado no ciclo substitui a estimativa anterior; sem ocorrência, o último valor conhecido é projetado. Isso acomoda aumentos graduais, como Evolução Obra.

## Dados e banco

Supabase é a fonte de dados. O frontend não executa migrations nem cria dados fictícios para testar. Migrations históricas são preservadas, e mudanças de esquema exigem uma nova migration numerada. Consultas de leitura, inclusive `SELECT` e inspeção de schema, podem apoiar diagnóstico; qualquer ação remota que altere estado exige confirmação explícita prévia do mantenedor, mesmo se o MCP expuser a ferramenta.

## Migrations no DataGrip

O mantenedor aplica as migrations no DataGrip, que divide o script em comandos a cada `;` sem entender blocos `$$` nem comentários. Um `;` dentro do corpo de uma função `plpgsql` ou de um `do $$ … $$` corta o comando no meio e o PostgreSQL responde `unterminated dollar-quoted string`; dali em diante a transação fica abortada (`current transaction is aborted, commands ignored until end of transaction block`) até um `rollback;`. Por isso, da migration 28 em diante:

- nenhum `do $$`; laços e numeração viram SQL de conjunto (`row_number()`, `generate_series`, tabela temporária `on commit drop`);
- função só em `language sql` com uma expressão (ex.: `select case when … then nextval(…) end`), sem `;` no corpo;
- nenhum `;` em linha de comentário, nem como pontuação;
- tudo entre `begin;` e `commit;`, com pré-requisitos que falham sozinhos (`select 'public.fin_historico'::regclass;`) em vez de `if` procedural;
- idempotência: rodar de novo não muda nada (filtros como "só datas depois da última", "só liga a marca");
- mudança de sequência (`setval`, `nextval`) não volta com `rollback` — a migration precisa produzir o mesmo número se for rodada de novo.

Os testes de cada migration (`tests/recorrencia-id-lote.test.js`, `tests/pra-sempre.test.js`, `tests/migrations-2032.test.js`) verificam esse formato. Antes de entregar, a migration roda num PostgreSQL local (PGlite) partida em `;` e é comparada com uma prévia só de leitura no banco real.

## Limite de geração das séries

O cadastro gera séries de Frequência até `DATA_LIMITE_RECORRENCIA` (`js/domain.js`), hoje 31/12/2032. O limite é fixo em código para o banco não crescer sem fim; o que não tem data pra acabar leva a marca `pra_sempre`. Quando o limite sobe, três coisas andam juntas: o código, uma migration que estende as séries pra sempre a partir da ocorrência mais recente de cada uma (como a 33) e os ciclos em `fin_ciclo` até o novo limite (como a 34) — sem os ciclos, tudo depois do último início cai no ciclo aberto e ele soma anos de uma vez.

## Histórico de problemas e correções

Registro do que deu errado e do que mudou para não repetir.

**Out/2026 — migrations e dados**

- _Migration 28 no DataGrip:_ a primeira versão criava a função em `plpgsql` e a 29 usava `do $$`; o DataGrip partiu os blocos nos `;` (`unterminated dollar-quoted string`) e a sessão ficou com a transação abortada. Foi preciso `rollback;` e baixar a versão nova. O `setval` da tentativa abortada persistiu, porque sequência não é transacional. Correção: a 28 virou função `language sql` com `case`, a 29 perdeu o `do`, os comentários perderam `;` e os testes passaram a barrar o formato (ver "Migrations no DataGrip").
- _Migration 27 pelo MCP:_ `apply_migration` estourou o tempo; foi aplicada com `execute_sql` em duas partes (criação, depois `revoke`). Uma revisão automática posterior afirmou que a 27 não estava aplicada sem consultar o banco; estava (`fin_historico` com milhares de linhas). Regra: estado do banco só se afirma depois de um `SELECT`.
- _Critério da migration 31:_ marcava pra sempre só o grupo cuja última ocorrência caía em dez/2029. Séries Anual/Semestral com outro mês (aniversários, Páscoa, Contadora, TFE…) acabam antes de dezembro mesmo indo até o limite, e 31 grupos ficaram de fora. A 32 trocou para um critério por frequência: a próxima ocorrência depois da última já passaria do limite.
- _Default `'Mensal'` em `fin.freq`:_ toda linha inserida pelo DataGrip sem `freq` virava Mensal; cinco antecipações de fatura ficaram como "série". A 35 limpou essas linhas e removeu o default.
- _Limite 2029 → 2032:_ as séries pra sempre paravam em 31/12/2029 e o último ciclo era aberto. As migrations 32 a 35 foram aplicadas pelo mantenedor no DataGrip e conferidas por `SELECT` em 17/10/2026: 776 linhas novas em 57 grupos pra sempre, 77 ciclos (36 novos, de jan/2030 a dez/2032, um único aberto, sem buraco, cada um começando num Faturamento PJ em dia útil), nenhuma antecipação com Frequência e `freq` sem default.
- _Resgate com data 31/12/9999:_ uma linha real (id 5229) tinha herdado a data técnica do ciclo aberto; corrigida com autorização para a data de fechamento provisória (06/01/2030). Depois disso, nenhum cálculo ou tela usa mais 31/12/9999 como data: o ciclo aberto sempre usa `dataDeFechamentoDoCiclo`.

**Out/2026 — revisão do código**

- A consolidação automática (15 min) podia reescrever o valor de um Aporte/Resgate **já pago**; agora só consolida em linha aberta, e só uma gravação de ajuste roda por vez (antes, duas consolidações simultâneas podiam inserir dois Aportes).
- Aporte materializado em aberto contava como garantia Nubank e antecipação em aberto liberava Livre Hoje; os dois passaram a exigir `pago`.
- A recarga após gravar podia apagar lançamentos simulados; agora espera a simulação acabar. O toggle de Reserva/Comprometido/Pra sempre virou um único `UPDATE` (tudo ou nada).
- O teto Besteira contava categorias que só _continham_ "besteira" (ex.: a antiga `Besteira Isabella`); agora compara o item inteiro.
- O saldo diário com `!Categoria` partia de outra base e usava o guardado da conta inteira; agora usa a mesma base e o guardado do próprio recorte.

**Out/2026 — token da captura do Nubank exposto**

- Os XMLs do Tasker subiram para o repositório (público) com o token da Edge Function no cabeçalho `x-fin-token`. O valor saiu dos arquivos (passaram a usar `%FINTOKEN`) e a função foi reescrita para ler o token do secret `FIN_TOKEN` em vez de um hash no código. Em 18/10/2026 o mantenedor criou o secret com um token novo e essa versão foi publicada (versão 6 no Supabase, conferida igual ao arquivo do repositório): o token antigo, que continua no histórico do git, não é mais aceito. Nenhum lançamento estranho com `obs = 'auto:tasker'` foi encontrado até a troca.

**Ferramentas de teste**

- O harness de navegador (Playwright com Supabase simulado) remove o `integrity` (SRI) do `index.html` apenas na cópia servida localmente; sem isso o navegador recusa o `supabase-js` falso. O arquivo publicado mantém o SRI.
- Com o relógio congelado do harness, comparar horários de carga e gravação falhava (mesmo milissegundo); a recarga após gravar passou a usar contador de gravações em vez de relógio.

## Captura do Nubank (Tasker + Edge Function)

O celular lê as notificações do Nubank no Tasker (`tasker/*.xml`) e envia cada compra à Edge Function `captura-nubank`, cujo código fica versionado em `supabase/functions/captura-nubank/index.ts` e é publicado no Supabase por deploy (o repositório não publica sozinho). A função grava com a chave de serviço, ou seja, **passa por cima do RLS de `fin`** — exceção deliberada, porque o Tasker não tem sessão de usuário; a única barreira é o token.

- O token vive em dois lugares só: o secret `FIN_TOKEN` da função (painel do Supabase) e a variável global `%FINTOKEN` do Tasker. Nunca no código, nos XMLs, no histórico do git ou em print: este repositório é público e publicado no GitHub Pages. `tests/tasker-sem-segredo.test.js` e `tests/captura-nubank.test.js` barram token ou hash de token nesses arquivos.
- Sem o secret (ou com menos de 32 caracteres) a função recusa tudo (503); token errado dá 401. A comparação é feita pelos hashes, em tempo constante.
- A confirmação final (`Nubank B`) mostra o nome digitado no diálogo Nome (`%fim`, que começa por `%nome R$ %valor`); deixado em branco, vale o estabelecimento da notificação, mesma regra da Edge Function.
  Cada perfil leva a tarefa dele inteira (`Nubank.prf.xml` com a Nubank A, `Nubank_Click.prf.xml` com a Nubank B), igual ao arquivo avulso (`Nubank_A.tsk.xml`, `Nubank_B.tsk.xml`): mudar uma é mudar as duas, e o teste confere (o `Nubank.prf.xml` ficou com a Nubank A antiga até 29/10/2026).
- **Notificação da Nubank apagada:** `Nubank A`, logo depois do Stop do que não é compra, cancela a notificação da Nubank com o plugin AutoNotification (Cancel: app Nubank, texto `aprovad`, sem diferenciar caixa), pros dois caminhos — lançado sozinho ou a notificação do Fin pra tocar. Sem condição própria: o Stop de antes já garante que é compra (a 1ª versão, configurada no celular, tinha `depesa*` e nunca rodava). O Tasker não apaga notificação de outro app sozinho; o AutoNotification tem licença própria, separada da do Tasker.
- **Atalhos da captura (migration 42, a pedido do mantenedor):** lugar de sempre lança sozinho, sem tocar em nada. A tabela `fin_atalho` liga um trecho do estabelecimento da notificação (`chave`: sem acento, em minúsculas, pontuação e espaços viram um espaço só) ao nome, categoria e parcelas.
  `Nubank A`, assim que a notificação chega e é uma compra, manda a compra com `auto: true`: com atalho, a função lança com ele (parcelas da notificação, como o "em 3x" do NuPay, valem sobre as do atalho) e o Tasker para em silêncio (até 01/11/2026 mostrava a notificação "Café R$ 12,50 · Besteira", "Lançado sozinho"; o mantenedor tirou: era uma notificação a mais); sem atalho, a função responde `lancado: false` sem gravar nada e o Tasker segue o fluxo de tocar de sempre. Sem internet ou com erro, também segue o fluxo de sempre.
  O lugar entra na lista pelo `Nubank B`: depois de Nome, Categoria e Parcelas, "Sempre assim?" (Sim/Não); com Sim, abre o campo do trecho, já preenchido com o estabelecimento inteiro, e a função grava (ou troca) o atalho depois de lançar. O flash final mostra o trecho que ficou ("Café R$ 12.50 · atalho: naquele cafe"). Perguntar em vez de gravar toda escolha evita que um lançamento fora do padrão (o mercado que variou de categoria) vire regra.
  _Trecho, não o nome inteiro (29/10/2026, a pedido do mantenedor):_ a maquininha muda o texto do mesmo lugar (prefixo do adquirente, nome cortado), e a 1ª versão comparava o nome inteiro. Agora o atalho vale se o trecho está em qualquer parte do estabelecimento, comparando sem acento, maiúscula, espaço nem pontuação (`NAQUELECAFE`, `SUMUP *NAQUELE CAFE` e `Naquele Café` acham `naquele cafe`); com dois atalhos que servem, ganha o trecho mais longo. Trecho vazio, com menos de 4 letras (pegaria lugar demais, como `uber` em `UBER EATS`) ou que não está no nome vira o nome inteiro, com aviso no flash. Chaves gravadas no formato antigo continuam valendo (a comparação normaliza as duas pontas), sem migration.
  Falhar ao gravar o atalho vira aviso, não erro: o lançamento já entrou, e erro faria tentar de novo e duplicar. Pra tirar ou corrigir um atalho, por enquanto, é no DataGrip (`fin_atalho`); o histórico fica em `fin_historico`.
  Mesmo risco de antes: se a resposta do lançamento automático se perder depois de gravar, o Tasker cai no fluxo de tocar e um segundo lançamento é possível (raro: a função responde em menos de um segundo e o limite é 20 s).
- **Débito Nubank e crédito Mercado Pago (30/10/2026, a pedido do mantenedor):** a `Nubank A` lê também "Compra no débito aprovada | Compra de R$ X em Y" (tipo `despesa_debito`: Débito, pago, sem fatura, sempre 1 parcela, mesmo com atalho parcelado, e sem o diálogo de Parcelas) e, pelo perfil do app Mercado Pago (criado pelo mantenedor no celular, com a mesma tarefa), "Você pagou R$ X a Y | …fatura do seu Cartão Mercado Pago" (crédito com `cartao: "mp"`). Sem a frase da fatura (saldo, Pix) e o cashback ficam de fora: não são compra no cartão.
  O cartão vai junto até a função (e no pendente do fluxo de tocar) e decide a fatura: Nubank fecha dia 5 e vence dia 12, Mercado Pago fecha dia 6 e vence dia 13. O fechamento do Mercado Pago é suposição (o mantenedor não sabia: 7 dias antes do vencimento, como o Nubank); compras de 14/10 a 27/10/2026 caíram em 13/11, o que não contradiz. Se uma fatura real mostrar outro dia, muda só `CARTOES` no `index.ts`.
  Apagar a notificação: o Cancel do Nubank passou a procurar `Compra` (no débito, "aprovada" só está no título) e o do Mercado Pago procura `Cartão Mercado Pago`, sem app fixo porque o pacote do app não está no repositório (o mantenedor pode marcar o app na ação); cada um só roda na compra do próprio banco (`%cartao`).
  O flash do fluxo de tocar termina com a forma (Nubank, Mercado Pago ou débito); o que entra sozinho não avisa.
- **Contas previstas: Pix e boleto pagam o que já existe (30/10/2026, a pedido do mantenedor, migration 43):** pagar conta (Pix "Transferência realizada", boleto) e receber (Pix "Transferência recebida") marcam como paga a linha em aberto de `fin`, com o dia e o valor reais (decisão do mantenedor: data do pagamento e valor pago; o previsto fica no histórico).
  _Vínculo em tabela própria (`fin_vinculo`), não em `fin_atalho`:_ o atalho tem um lançamento por lugar (chave única), e o mantenedor paga a mesma pessoa por contas diferentes (o iPhone e outra); o vínculo é único por trecho + conta, então uma pessoa acumula várias contas e o valor desempata.
  _Quando paga sozinha:_ só com vínculo e sem dúvida (uma conta, valor igual ou até 30% diferente, limite escolhido pelo mantenedor; várias, a única de valor exato). Valor sem vínculo nunca basta: em 30/10/2026, Trybe (09/11) e Água (10/11) estavam em aberto com R$ 250,00 cada. Conta do próximo ciclo só pela lista, porque mudar a data muda o ciclo (o Faturamento PJ de R$ 9.600 recebido dois dias antes cairia no ciclo anterior).
  _Duas contas num Pix só:_ acontece, mas o mantenedor preferiu começar sem (transações separadas).
  _Textos supostos:_ a Nubank A reconhece "Transferência realizada"/"Pix enviado", boleto com "pago/realizado/confirmado/efetuado" (sem "vence", "agendado" nem "lembrete", pra um lembrete com vínculo não pagar a conta) e "Transferência recebida"/"Pix recebido"/"Você recebeu"; o nome é o que vem depois de "para" (saída) ou de "R$ X de" (entrada), sem "foi…", "com sucesso" e "via". Ainda sem print das notificações reais: ajustar quando chegarem. Sem nome (boleto), não há vínculo e sempre pergunta.
  _Tasker:_ a Nubank B ganhou um bloco (If `%tipo ~ conta*`) logo depois de achar o pendente: pede a lista à função (`acao: "opcoes"`, rótulos sem vírgula, com "‚" no centavo, porque a lista do Tasker separa por vírgula), paga a escolhida (`id`) e pergunta "Sempre assim?"; Novo lançamento sai do bloco e segue o fluxo de compra como `despesa_debito` ou `receita_debito`. O Cancel da Nubank passou a regex `(?is).*(compra|nupay|transfer|boleto).*` pra apagar também Pix e boleto; `nupay` entrou em 01/11/2026, porque a notificação do NuPay não diz "Compra" e as corridas de Uber lançadas sozinhas deixavam a notificação no celular.
- **Trocar o token:** gerar um novo (ex.: no DataGrip, `select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`, que mostra o valor só no resultado), gravá-lo no secret `FIN_TOKEN` e em `%FINTOKEN`. A troca do secret vale na hora, sem deploy, e o token antigo para de funcionar.

## Metas (migration 36)

- _Tabela própria, só com o que o mantenedor decide:_ `fin_meta` guarda nome, valor médio, mês (ou âncora ± meses), forma, vezes, entrada, juros, custo/mês e status. O plano não é gravado: é recalculado a cada desenho, porque depende de tudo o que muda todo dia (guardado projetado, limite, Comprometido).
- _Âncora, depois retirada:_ a 1ª versão tinha âncora na mesma tabela (uma meta sem valor era uma data com nome que outras seguiam ± meses, coluna `ancora_meta_id`). O mantenedor pediu pra tirar de tudo: complicava a linha da meta sem uso real (nenhuma âncora chegou a ser gravada). A migration 38 remove `ancora_meta_id` e `deslocamento` e torna o valor obrigatório, abortando antes de remover se houver alguma âncora.
- _Escolhas do mantenedor (20/10/2026):_ as metas entram nas projeções como linhas previstas; podem usar o guardado abaixo da meta da Reserva (o atraso aparece na data dela); âncora já na 1ª versão. Logo depois saíram os juros (parcela = resto ÷ vezes), o Custo/mês e o "Automático"; o parcelado ganhou duas datas (entrada e 1ª parcela) e o plano passou a conferir o dinheiro em cada mês de pagamento, com o Comprometido só informativo. A migration 37 troca `juros_mensal` e `custo_mensal` por `meses_ate_parcela` (a 36 pode já estar aplicada, então não foi reescrita). Em seguida o mês de cima passou a ser o da 1ª parcela (débito) ou da compra (cartão), com o mês da entrada embaixo, ao lado dela: `meses_ate_parcela` passou a contar os meses da entrada até o mês da meta. Sem migration: a única meta gravada com entrada tinha 0 meses, que dá o mesmo plano nas duas leituras.
- _Plano em cascata, não otimização:_ cada meta, pela data, usa a forma escolhida (À vista, Parcelado Crédito ou Parcelado Débito; sem "Automático", a pedido do mantenedor) e o plano diz se cabe; a entrada, parte do total, sai à vista. É previsível e explicável no próprio texto do plano; uma busca pela "melhor combinação" de todas as metas mudaria o plano de uma meta por causa de outra sem que isso fique claro na tela.
- _Plano calculado com os caches zerados:_ `limparCachesFinanceiros` refaz o plano na hora. Se ele nascesse no meio de um saldo em cálculo (a memoização trava o ciclo com 0 enquanto calcula), o guardado projetado sairia errado.

## Celular: tabela legível sem tirar coluna (28/10/2026)

- _Paridade mantida:_ nenhuma coluna some no celular. Em vez de recortar colunas, a tabela ganhou larguras próprias pra Data, Nome e Valor caberem na primeira tela, e o Nome fica fixo ao rolar de lado (sticky, sem JavaScript).
- _Ano curto por CSS:_ o século vai num `<span class=seculo>` escondido no celular. O texto e a edição da data não mudam, e o desktop mostra o ano inteiro.
- _Fundo da coluna fixa:_ o fundo padrão dela usa um seletor fraco (`td.cNome`) de propósito, pra o fundo das linhas especiais (fatura, previstas, aporte, seleção) continuar valendo; Mercado Pago (translúcido) e simulação (listrado) ganham base opaca própria.

## Atrasados contam no ciclo de hoje (28/10/2026)

- _Pedido do mantenedor:_ não pagar uma conta (débito) ou a fatura de um ciclo passado precisava avisar e ser puxado pro ciclo atual.
- _Pelo ciclo, num ponto só:_ o débito atrasado muda só o ciclo calculado (`periodoDoLancamento`); tabela, saldo, Aporte/Resgate, indicadores e Comparar seguem sozinhos, sem gravar nada no banco. A fatura atrasada sai e entra pela mesma função das linhas de fatura (`faturasLiquidasDoCiclo`), que o saldo do ciclo passou a usar também — senão o saldo e a linha divergiriam.
- _Investimento fora:_ Aporte/Resgate aberto de ciclo passado não é conta a pagar; rolar ele pro ciclo de hoje faria o Consolidar achar dois Aportes no mesmo ciclo.
- _Duplicadas fora:_ a detecção de recorrência duplicada agrupa por mês; sem a exclusão, o atrasado de setembro faria o Consolidar mover o Condomínio de outubro pro próximo ciclo.
- _Pagar = hoje:_ a regra antiga (ciclo diferente pede confirmação e mantém a data) deixaria a conta paga no ciclo passado, longe da tela. Como o pagamento atrasado acontece agora, a data vira hoje e o toast mostra a antiga.
- _Depende de registrar o pagamento da fatura:_ fatura passada sem Antecipação Fatura vira atrasada. Se algum pagamento antigo não foi lançado, ele aparece como atrasado até ser lançado.

## Coluna Parcela (antes Próx. 3) (28/10/2026)

- _Começo:_ a coluna olhava só os 3 ciclos seguintes (Repete/Some e, no meio, uma contagem). Ao longo do dia, com os prints do mantenedor: "n de 3" sozinho era lido como número de parcela (agosto parecia mais adiantado que setembro); ciclo que ainda não começou contava como "não"; depois, "ainda não" fazia Repete com uma confirmação só (supor o futuro). Cada ajuste ficou nos commits.
- _Decisão final, do mantenedor:_ tudo vira parcela, sem Repete, Some nem traço — "2 de 3 (até Out/26)" em toda linha com ciclo, contando a sequência inteira de ciclos seguidos (sem a janela de 3).
- _Regras que ficaram dos ajustes:_ só o que está nos dados (o fim é o último ciclo cadastrado); ciclo da tela em tudo (no Crédito, o das compras), pra uma série que mistura Débito e Crédito não ficar desencontrada; o "(2/12)" do Tasker no nome não separa as parcelas.
- _Ciclo sem o compromisso encerra a sequência:_ sem essa regra, o café de Jul e o de Dez seriam "parcelas" da mesma série. Recomeçar em 1 é previsível e não depende de um limite de "buraco" escolhido à toa.
- _Linha calculada vazia:_ Fatura, Saldo e Aporte/Resgate não são compromisso do banco; a célula fica vazia em vez de "—".
- _Fora da numeração ("—"), a pedido do mantenedor, um por um:_ 1 de 1, pra sempre (sem fim, "de N" seria só até 2032), Besteira, Isabella, Transporte, Alimentação, Investimento, Teste e antecipação/pagamento de fatura — gasto do dia a dia, plano do guardado ou transferência, em que a numeração não diz nada. As categorias ficam numa lista só (`CATEGORIAS_SEM_PARCELA`); a antecipação usa `ehTransferenciaFatura`, que também a reconhece pelo nome.

## Documentação de produto

As regras financeiras vivem em `docs/REGRAS.md`, junto das decisões e do checklist de publicação. O `AGENTS.md` na raiz continua curto e operacional, para orientar manutenção e automação.

## Hub abandonado

A fundação paralela `hub/Vcl.FinHub` (.NET, ABP, Angular, PostgreSQL local) foi encerrada e removida do repositório. A aplicação estática e `docs/REGRAS.md` continuam sendo a única fonte de verdade; não há plano ativo de migração para outro produto.

## Dependências externas fixadas

- `supabase-js` e `Chart.js` vêm do jsDelivr com **versão exata** e `integrity` (sha384), nunca por faixa (`@2`). Sem isso, uma versão nova entraria sozinha (podendo quebrar o login) e um CDN comprometido rodaria código com acesso à sessão.
- O jsDelivr serve o arquivo do pacote npm byte a byte, então o hash é calculado do próprio pacote: `npm pack <pacote>@<versão>`, extrair e rodar `openssl dgst -sha384 -binary <arquivo> | openssl base64 -A`. Atualize versão e hash juntos, de preferência para uma versão publicada há pelo menos duas semanas.
- 28/10/2026: `supabase-js` passou de 2.117.2 para 2.118.0, a mesma versão da cópia local da raiz do hub, a pedido do mantenedor: todos os apps dividem a origem e a sessão, então rodam a mesma versão. Como o jsDelivr serve o arquivo do pacote byte a byte e a cópia da raiz é igual ao do pacote npm 2.118.0, o `integrity` é o hash de `../supabase.js`, e `tests/pwa.test.js` confere isso.

## Supabase: itens só do plano Pro

- **Leaked Password Protection** (Auth recusa senhas que constam no HaveIBeenPwned): o advisor de segurança do Supabase aponta como desligada (`auth_leaked_password_protection`), mas o recurso só está disponível no plano Pro. No plano atual o aviso fica aceito; ao migrar para o Pro, ligar em Authentication → Policies/Password security.

## Base comum: tokens (01/11/2026)

- O Fin entra na base comum do hub como os outros módulos, começando pelos tokens: `../base/tokens.css` carrega antes de `css/base.css`, que não redefine nenhum token da base (só escolhe `--cor`) e guarda só os tons que só o Fin usa (`--bg-soft`, `--surface-2-hover`, `--ok-hover`, `--erro-hover`, `--laranja-soft`). A sombra passou a ser a da base (opacidade .35 em vez de .42).
- As cores deixaram de ser conferidas procurando o texto do CSS (cada token renomeado quebrava dezenas de regex) e passaram a ser medidas no estilo calculado, comparando com o token resolvido pelo próprio navegador (`tests/navegador-estilos.test.js`, uma página só).
- `.btFiltro` saiu do CSS: o botão de Visualizações não existe mais na tela, e a regra só sobrava (com dois testes conferindo o texto dela).
- `.catCompartilhada` usava `var(--red)` e `.multiSelAll` `var(--ac)`, variáveis que nunca existiram no Fin (os dois herdavam a cor do texto). Corrigidos a pedido do mantenedor: o asterisco em `--erro` e o Selecionar tudo em `--cor`.

## Base comum: componentes e fonte (01/11/2026)

- `../base/componentes.css` carrega depois dos tokens e antes do CSS do Fin. A fonte, o tamanho e a entrelinha passam a ser os da base (Barlow 16 px, entrelinha 1,4; antes, a do sistema em 15 px e 1,55): as linhas da tabela ficam 1 a 4 px mais baixas. Botões e campos herdam a fonte da página, como nos outros módulos.
- Largura: o Fin **não** usa a coluna de 560 px da base (`--largura`); as tabelas usam a tela toda (pedido do mantenedor).
- Colisão de nome com peça da base: `.wrap` (a moldura que rola cada tabela) virou `.rolagem`.
- Dez declarações `font: 700 1.05rem/1.3 inherit` eram inválidas (`inherit` não entra no atalho `font`) e o navegador sempre as ignorou. Com os botões herdando a fonte da base, as setas ▸▾ dos blocos ficariam em negrito: viraram propriedades separadas (`font-weight`, `font-size`, `line-height`), com o que o código já pedia.
- Conferido sem print: posição, tamanho, fonte e cor de cada elemento medidos no navegador antes e depois (computador, cadastro aberto e celular); fora a fonte, só mudaram as alturas da entrelinha e os tamanhos das declarações que voltaram a valer. Nada passou a estourar a largura. Não vi a Barlow carregada (os testes bloqueiam a internet e usam a fonte de reserva).

## Base comum: cabeçalho e aviso (01/11/2026)

- Pedido do mantenedor: o Fin entra 100% na base, sem peça à parte onde a base tem uma.
- Cabeçalho: o da base (`.topo`: ícone do hub `#i-hub` e o nome **Fin** com a bolinha da cor) fica no alto, como nos outros módulos; a navegação de ciclos, os indicadores e os botões vêm logo abaixo. O ícone do hub saiu do fim dos botões (era `#voltarHub`). Ocupa uma linha a mais (escolha do mantenedor entre isso e só trocar os botões).
- Aviso: o `.toast` da base (um só, embaixo no meio, que quebra linha) no lugar dos cartões empilhados no canto com título, texto e ×. O título vai em negrito e o texto na mesma linha; um aviso novo troca o anterior; some em 7 s (mais que nos outros módulos, porque as mensagens do Fin são mais longas). Falha, valor inválido e não salvo ficam em vermelho (`.toast.erro`, regra em `avisoDeErro`); antes, todos tinham a borda vermelha. O som curto continua.

## Base comum: botões de ícone (01/11/2026)

- ‹ › da navegação de ciclos e todos os botões do cabeçalho (e os de ícone dentro dos modais) são o `.bt-ic` da base: 40 px, raio, borda e fundo dela; saíram `.btIcone` e `.btNavCiclo` (eram 32 a 35 px, raio 9 px). O Fin só acrescenta a cor dos que têm significado próprio: Recarregar verde, Simular laranja, Diagnóstico vermelho com inconsistência, os cartões na cor de cada um e o ligado (Diferentes) em verde.
- Novo lançamento virou o `.bt-ic.ok` da base, preenchido na cor do Fin (era branco).
- O foco do teclado é o da base (contorno na cor do módulo); o do Fin (verde com o botão meio apagado) saiu.
- Celular: a grade de 6 colunas continua, com a altura da base (40 px; era 2,5 rem, o mesmo) e, com o dedo (`pointer: coarse`), 44 px desde 03/11/2026 (alvo de toque). ‹ De Até › seguem numa linha; o conteúdo desce 5 px porque ‹ › cresceram. Conferido medindo no navegador (`navegador-estilos.test.js`).

## Testes do Fin: telas por função (01/11/2026; lacunas fechadas em 03/11/2026)

- Os testes de navegador passaram de 11 arquivos e 54 testes para 8 arquivos e 30 testes (em 02/11/2026, 31 nesses 8 arquivos; em 03/11/2026, 36 em 9, com `navegador-alvos.test.js`). Saíram `navegador-tetos.test.js`, `navegador-cartoes.test.js` e `navegador-diagnostico.test.js`; os demais foram reduzidos ou fundidos. Os estratégicos (`navegador.test.js`, `navegador-celular.test.js` e `navegador-linhas.test.js`) ficaram como estavam.
- O que era conferido na tela e não depende de toque, foco ou banco de verdade roda agora como função, em `telas-por-funcao.test.js` (18 testes, com `carregarTela`): o ciclo desenhado, os cartões, o diagnóstico, as metas e as dicas do cabeçalho. O `scripts/check.mjs` do Fin caiu de ~43 s para ~30 s.
- A única mudança de código de produção foi extrair `textoDoCadastroSalvo` de `submeteNovoLancamento` (`js/form.js`), com o mesmo texto, para o teste rodar a função.
- CSS: os testes leem o CSS como regras (`tests/helpers/regras-css.js`, `declaracoes`), não por regex.
- O título do 1º seletor de fatura ("1ª fatura", "Fatura da parcela 1" ou "Parcela única") saiu de `form.js` para `tituloDaPrimeiraFatura(freq, parcelas)`, com o mesmo texto; o teste roda a função.
- As duas condições do `resumoDebitoIgual` (`Math.abs(...saldo...)` e `Math.abs(...guardado...)`) não se cobrem, ao contrário do que se supunha em 01/11/2026: cada uma tem um caso só dela, em `telas-por-funcao.test.js` ("saldo e guardado são condições independentes"). Só o guardado difere: um aporte (categoria Investimento) pago em ciclo que fechou antes de `SALDO_DESDE` fica fora do saldo de hoje e do total do ciclo, mas entra no `guardadoAte`. Só o saldo difere: um gasto pago com data antes do 1º ciclo (sem ciclo) entra no saldo de hoje, não no total do ciclo. Mutações: trocar cada condição por `true` falha o teste (verificado nas duas).

Fechadas em 03/11/2026 (o que estava escrito como lacuna):

- A máscara de dinheiro ligada ao campo de limite do cartão: `mascara-dinheiro.test.js` ("campos de limite") roda o `ligarCamposDeLimite` real (`js/interactions.js`) sobre uma raiz falsa: a máscara em centavos a cada tecla com o cursor no fim, a seleção ao focar, Enter tirando o foco, Esc redesenhando, a confirmação ao mudar e nada acontecendo fora de um campo de limite. Mutações que falham o teste: tirar a máscara, trocar `select()` por `focus()`, tirar o `desenhar()` do Esc e trocar a confirmação.
- Os handlers `badInput` da edição inline de data (`js/interactions.js`) já tinham teste de função (`preferencias-interface.test.js`, `editarDataComCampo`, com o campo falso e o `validity.badInput`); trocar a condição por `false` falha o teste. O `matchMedia` do foco no cadastro do celular (`js/form.js`) também (`abrirCadastro({ largura })`, mesmo arquivo); trocar `641px` falha.
- `Estado.cartoesDoCiclo = null` (`js/interactions.js`) é conferido por função em `modal-cartao.test.js` (o que o estado valia quando `atualizarCartoes` foi chamado); tirar a linha falha o teste.

Lacunas fechadas em 01/11/2026: o rótulo da parcela e o modal do diagnóstico (`telas-por-funcao.test.js`); o botão do Mercado Pago (`telas-por-funcao.test.js`); `resumoDebitoIgual`, que o `vCiclo` alcança quando o resultado do ciclo fecha em zero, sem Aporte sugerido (salário 1000, gasto −1000, tudo pago), em 4 casos do mesmo arquivo; e `regras-css.js` com contexto `''`, que confere só as regras da base, fora de `@media`.

Conversão de regex em função, rodadas 2 a 4 (01/11/2026): `parcela-coluna` e `recarregar-faz-tudo` (lote 3); `frequencia-serie` e `resumo-alinhado` (lote 4); `recorrencia-duplicada`, `pra-sempre`, `revisao-achados`, `pago-ajusta-data`, `ciclo-query` e `cadastro-layout-fixo` (lote 5) passaram a rodar as funções reais (handlers, `submeteNovoLancamento`, `consolidarTudo`, `recarregarDados`, menu de Visualizações, clique do selo Pago, `popstate`...) e o CSS por `declaracoes`; todas as mutações pontuais falharam os testes. Os outros arquivos do lote (`gasto-previsto`, `tabelas-filtros`, `celulas-tabela`, `editar-lancamento`, `reserva-comprometido-toggle`, `valor-nulo-negativo`, `ciclo-inicio-fim`, `fin-ciclo`, `ciclo-desenhado`) só têm regex sobre texto legítimo (REGRAS.md, SQL de migrations, HTML devolvido por função) e foram deixados. Três ressalvas (todas fechadas: a primeira na rodada seguinte, as outras duas em 02/11/2026, ver abaixo): `limite-besteira` mantinha um `html.includes('title="Besteira: seus caprichos…')`, cópia de texto de interface no `index.html`, sem função que o renderize; `pra-sempre` lê a tag `<input id="fPraSempre">` do `index.html` para conferir que ela nasce sem `checked`; `ciclo-query` confere por `includes` que não há `signOut` em `index.html` e `js/*.js` (ausência, como "sem segredo no código"). Em `frequencia-serie`, o `fFreq` Mensal pega menos que o regex antigo.

Rodada 5, lotes A e B (01/11/2026): a conversão cobre os 58 arquivos restantes de `fin/tests`, e o total de `assert.match` e `doesNotMatch` caiu de 1125 para 999 (em 02/11/2026, 910; ver a auditoria abaixo). O que sobrou é texto: REGRAS, DECISOES e AGENTS, SQL de migrations, XML do Tasker, `.editorconfig`, `.mcp.json` e `.vscode`, manifest, PNG e hash do `pwa`, ordem de `<script>` e `<link>` do `index.html`, balanço de `<div>` e de chaves CSS, e saída de função. `limite-besteira` lê o `title` do rótulo com `etiquetas(html)` (`tests/helpers/html.js`), e o `html-elementos.js` duplicado saiu. A ressalva de `ciclo-query` (`includes` do `signOut` em `index.html` e `js/*.js`) foi fechada em 02/11/2026, ver a auditoria abaixo. As outras duas que existiam foram convertidas em 02/11/2026: `pra-sempre` lê a tag `fPraSempre` com `elementoPorId` (`type` e ausência de `checked` por atributo) e `frequencia-serie` confere a ausência dos ids, classes e seletores de ajuda (`ajudaFrequencia`, `ajudaCategorias`, `btAjudaMini`, `modalAjuda`) por `etiquetas` e `regras` do CSS, com controle positivo e mutação nos dois.

Métodos novos (01/11/2026):

- `diagnosticos-interface` roda o `Linter` do ESLint com a regra `no-alert` sobre o código: a análise é da árvore, não de texto, e acha cada `alert`, `confirm` e `prompt` de verdade.
- `estilo-editorconfig` roda `scripts/check-style.mjs` numa pasta temporária do sistema.
- `pwa.test.js` roda o `service-worker.js` num `vm`: confere instalação, ativação, que só o GET próprio é interceptado e o cache offline. Também confere que tudo que o `index.html` carrega está no cache, e o contrário.
- `simulacao-memoria` e `recarga-apos-gravacao` rodam os handlers reais. `recarga-apos-gravacao` faz 7 escritas reais (`inserirLancamentos`, `atualizarLancamentos`, `excluirLancamento`, `salvarLimiteDoCiclo`, `inserirMeta`, `atualizarMeta`, `excluirMeta`) com um `fetch` espião, e confere uma recarga para cada uma.

Fechadas em 02 e 03/11/2026 (eram "lacunas conhecidas" de 01/11/2026):

- O detector antigo, que conferia "o código tem exatamente 5 `method:`", tinha sido perdido na conversão. Agora `recarga-apos-gravacao` lista pela árvore (`espree`) as funções de `js/supabase-api.js`, chama cada uma com `fetch` espião e falha se uma função que pede escrita não estiver nas 7 testadas nem nas exceções (com motivo), dizendo o nome dela. `espree` não está no `package.json` da raiz: vem como dependência indireta do ESLint, e trocar o ESLint exige listá-lo.
- A mutação `|| r.periodoIdx == null` em `dadosMetaReservaEmergencia` (`js/charts.js`) sobrevivia por ser equivalente: a chave nula do `Map` nunca é lida (o laço lê só os índices numéricos dos nove ciclos). Corrigido em 03/11/2026 tirando o código morto (`js/charts.js`, a guarda sumiu) e provando o comportamento: `meta-reserva-emergencia.test.js` ("linha sem ciclo... não entra na meta") confere que linhas com `periodoIdx` nulo ou ausente não mudam o resultado.

Auditoria dos lotes A e B (02/11/2026):

- O total de `assert.match` e `doesNotMatch` em `fin/tests/*.test.js` foi de 999 para 910 (contagem em `docs/DIRETRIZES.md`, seção 3). `fin/tests` tem 793 testes (798 em 03/11/2026) (contagem `^test(` de 02/11/2026; a auditoria tinha contado 778 antes das ressalvas fechadas no mesmo dia).
- Sobras convertidas: o `index.html` é lido como elementos (`etiquetas`, `elementoPorId`), o CSS por `declaracoes`, e `matchMedia` e `Estado.cartoesDoCiclo` por função. Com isso, as lacunas de `cartoesDoCiclo` e de `matchMedia` listadas em 01/11/2026 deixam de ser só regex.
- Ressalvas fechadas em 02/11/2026: `pra-sempre` lê a tag `fPraSempre` com `elementoPorId(…, { obrigatorio: true })` (`type` e a ausência de `checked` por atributo); os `indexOf` que sobram só cortam as funções do arquivo publicado, não leem o HTML. `ciclo-query` confere a ausência de `signOut` pela árvore dos scripts (`espree`, sem `includes`) e a da página por `etiquetas` e `textosDasEtiquetas` (texto visível de botões, links e entradas), com controle positivo (o analisador acha `signOut` em código sintético e botão de sair em HTML). Não restam ressalvas de texto no Fin.
- `tests/helpers/html.js` ficou mais rígido: pula o corpo de `<script>` e `<style>`; atributo repetido vale o primeiro; decodifica `&quot; &amp; &lt; &gt; &#39; &nbsp;`; `textoDaEtiqueta` casa a etiqueta inteira (`<titlex>` não é `<title>`) e lança erro sem o fecho; `elementoPorId(html, id, { obrigatorio: true })` lança quando o id não existe. `tests/helpers-html.test.js` (8 testes) cobre esses casos e confere o `index.html` real.
- `pwa.test.js` agora falha com item órfão no cache offline (arquivo no cache que nem o `index.html`, nem o manifest, nem os ícones carregam) e exige que o manifest e os ícones dele estejam no cache.
- Favicon offline, corrigido em 02/11/2026: o `./icons/fin-192.svg` (`<link rel="icon">` do `index.html`) entrou em `ARQUIVOS_ESTATICOS` de `service-worker.js`, e o `pwa.test.js` agora exige todo `<link rel="icon">` da página no cache offline (e o reconhece como item legítimo, não órfão). O teste foi escrito antes e falhou com "./icons/fin-192.svg não está no cache offline" até o arquivo entrar na lista.

## Fin na base visual (02/11/2026)

- Pedido do mantenedor: o Fin 100% na base comum (`../base/tokens.css` e `../base/componentes.css`), sem peça própria onde a base tem uma. Campos, botões, modais, listas, chips, selos e avisos já são as peças da base.
- Peças novas entraram na base só acrescentadas (nenhuma regra que os outros módulos usam mudou): os tokens `--aviso` e `--aviso-soft` (o laranja de atenção que o Fin já usava); `.modal` e `.modal-topo`; `label.bt-ic` (liga e desliga), `.bt-ic.sinal` (`.pos` e `.neutro`) e `.bt-ic.compacto`; `select.campo` (a setinha) e `.campo:focus-within`; `.campo.compacto` e `select.campo.compacto`; `.modal .cartao:not(.destaque)` e `.modal .lista:not(.suspensa) li`; `.lista.texto` e `.lista.suspensa`; `.chip.ok`, `.chip.erro`, `.chip.aviso` e `.chip.compacto`; `.selo.aviso` e `.selo.longo`.
- Medido: `fin/tests/navegador-estilos.test.js` mede no estilo calculado as cores e os tamanhos de cada peça, vindos da base, e confere que o Fin não redefine os tokens dela (o Fin só define as cores próprias, como `--cor`, `--reserva`, `--comprometido` e `--pra-sempre`).
- Ficou no Fin, por ser de um módulo só (dados ou layout que nenhum outro módulo tem): as tabelas do ciclo, com os campos de edição e de busca na altura da linha (e `.resumoLinha`); os gráficos; `.visTab`; as tabelas do Mês a mês (`.pm*`); o cartão desenhado; a calculadora (`.calc*`); a disposição de cada modal; as caixas de aviso `.pcAviso` e `.avisoFr`; `.tagFatura`; `.tog`; e as cores das marcas Reserva, Comprometido e Pra sempre (`--reserva`, `--comprometido`, `--pra-sempre`, tons do Fin).
- Medido em 03/11/2026 (sem captura de tela; `navegador-alvos.test.js`, no Chromium, com os dados de uma meta que não cabe e de categorias de nomes longos), o que antes estava como "não foi visto":
  - **Alvo de toque (celular, `pointer: coarse`):** a medição achou os botões de ação (`.bt-ic`: cabeçalho, ‹ ›, fechar dos modais, ± do cadastro) com 40 px, os campos compactos das metas com 36 px, os chips compactos com 22 a 23 px e o + das seções (`.tog`) com 22 px. Corrigido no CSS do Fin, sem tocar na base nem nos outros módulos: `css/mobile.css` leva `.bt-ic:not(.compacto)` a 44 × 44 e `.campo.compacto` a 44 de altura só com o dedo, e, também só com o dedo, `.chip.compacto` e `.tog` a no mínimo 24 px (fora do `pointer: coarse`, no computador o chip do teto ia de 21,6 para 24 px; o teste em 1280 px com o mouse compara a página com ela mesma sem essas regras, tiradas pelo CSSOM, com tolerância 0). O teste exige 44 px nos botões de ação (página, cadastro e modais de metas), 44 px nos campos do cadastro e das metas, e 24 px nas peças compactas, e falhou antes da correção. Limite técnico declarado: as peças compactas das linhas das tabelas ficam em 24 px de propósito (uma área de toque maior por cima delas roubaria o toque das linhas vizinhas).
  - **Chip e selo lado a lado nas metas:** a medição achou alturas de 21, 23 e 24 px no mesmo plano (`.metaPlano`, que já alinha por `align-items: center`). Corrigido em `css/forms.css` com `line-height` por peça (selo 20 px, chip 18 px, com o preenchimento e a borda de cada um dão 24 px); o teste exige `align-items: center` e uma altura só em todo plano, em 390 e em 1280 px.
  - **Chips de categoria no celular:** em 390 px quebram em várias linhas e nenhum chip passa da borda do modal do gráfico (o teste abre a lista pelo botão e mede cada chip).
  - **Modais de Mês a mês, comprometidos e gráfico** (e o das metas, de onde se abrem), em 390 e em 1280 px: abertos no navegador com esses dados, a página não ganha rolagem horizontal, o modal cabe na tela, nenhuma peça passa da borda dele (fora da tabela do Mês a mês, que rola por conta própria) e não há erro de página. O gráfico roda com uma classe `Chart` mínima (`abrirFin(..., { chartFalso: true })`), porque o Chart.js vem de uma CDN que o teste bloqueia: o desenho da pizza em si (canvas) não é medido.
  - Mutações (CSS estragado, depois restaurado) que falham o teste: os 44 px do botão, os 44 px do campo compacto, o mínimo de 24 px do chip, o do `.tog`, esses dois mínimos fora do `pointer: coarse`, o `line-height` do selo e um bloco largo dentro do modal dos comprometidos (rolagem horizontal) e `flex-wrap: nowrap` nos chips do gráfico.
  - Não executável neste ambiente: a aparência (cor, espaçamento, sensação ao toque) em aparelho real e `base/referencia.html`. A regra do hub é não tirar captura de tela; o que se mede (tamanho, posição, classe, estilo calculado) está acima.

## Relógio falso pausado (02/11/2026)

- O helper de navegador do Fin usa `../tests/relogio.mjs`, o mesmo relógio pausado de todos os apps e da raiz: nasce até 5 min antes e é pausado no horário pedido. A regra está em `../docs/DIRETRIZES.md`, seção 3.
