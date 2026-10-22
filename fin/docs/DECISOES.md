# Decisões de arquitetura

## HTML estático único

O projeto permanece em um único `index.html` porque é publicado como site estático. Fragmentos HTML exigiriam build ou carregamento assíncrono e aumentariam a chance de scripts acessarem elementos antes de existirem.

## JavaScript clássico modular

Os arquivos em `js/` são scripts clássicos carregados em ordem explícita. Isso mantém a aplicação simples para editar, depurar no navegador e hospedar sem bundler. A ordem é um contrato testado.

## Estilo sem formatter pesado

O projeto usa `.editorconfig` e checagem nativa de tabs, espaços finais e newline final. ESLint e Prettier ficam fora por enquanto: em scripts clássicos globais eles exigiriam configuração extra e causariam um reformat amplo sem melhorar diretamente as regras financeiras.

## Linguagem visual

O tema é sempre escuro, mas em cinza grafite legível, sem uma tela predominantemente preta. Ações compactas usam ícones com `title` e rótulo acessível; textos permanecem curtos e só aparecem quando esclarecem uma decisão. Formulários recebem somente campos necessários. O mobile tem paridade total com o desktop e só ajusta o layout. A única casca restrita é a da conta da Isabella, reconhecida pelo e-mail da sessão (`modoRestrito()`, com `modoSimples()` como sinônimo), em qualquer aparelho; o detalhe fica em `docs/REGRAS.md`, seção "Conta restrita (Isabella)". `Isabella` como categoria continua sendo uma categoria comum.

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

- *Migration 28 no DataGrip:* a primeira versão criava a função em `plpgsql` e a 29 usava `do $$`; o DataGrip partiu os blocos nos `;` (`unterminated dollar-quoted string`) e a sessão ficou com a transação abortada. Foi preciso `rollback;` e baixar a versão nova. O `setval` da tentativa abortada persistiu, porque sequência não é transacional. Correção: a 28 virou função `language sql` com `case`, a 29 perdeu o `do`, os comentários perderam `;` e os testes passaram a barrar o formato (ver "Migrations no DataGrip").
- *Migration 27 pelo MCP:* `apply_migration` estourou o tempo; foi aplicada com `execute_sql` em duas partes (criação, depois `revoke`). Uma revisão automática posterior afirmou que a 27 não estava aplicada sem consultar o banco; estava (`fin_historico` com milhares de linhas). Regra: estado do banco só se afirma depois de um `SELECT`.
- *Critério da migration 31:* marcava pra sempre só o grupo cuja última ocorrência caía em dez/2029. Séries Anual/Semestral com outro mês (aniversários, Páscoa, Contadora, TFE…) acabam antes de dezembro mesmo indo até o limite, e 31 grupos ficaram de fora. A 32 trocou para um critério por frequência: a próxima ocorrência depois da última já passaria do limite.
- *Default `'Mensal'` em `fin.freq`:* toda linha inserida pelo DataGrip sem `freq` virava Mensal; cinco antecipações de fatura ficaram como "série". A 35 limpou essas linhas e removeu o default.
- *Limite 2029 → 2032:* as séries pra sempre paravam em 31/12/2029 e o último ciclo era aberto. As migrations 32 a 35 foram aplicadas pelo mantenedor no DataGrip e conferidas por `SELECT` em 17/10/2026: 776 linhas novas em 57 grupos pra sempre, 77 ciclos (36 novos, de jan/2030 a dez/2032, um único aberto, sem buraco, cada um começando num Faturamento PJ em dia útil), nenhuma antecipação com Frequência e `freq` sem default.
- *Resgate com data 31/12/9999:* uma linha real (id 5229) tinha herdado a data técnica do ciclo aberto; corrigida com autorização para a data de fechamento provisória (06/01/2030). Depois disso, nenhum cálculo ou tela usa mais 31/12/9999 como data: o ciclo aberto sempre usa `dataDeFechamentoDoCiclo`.

**Out/2026 — revisão do código**

- A consolidação automática (15 min) podia reescrever o valor de um Aporte/Resgate **já pago**; agora só consolida em linha aberta, e só uma gravação de ajuste roda por vez (antes, duas consolidações simultâneas podiam inserir dois Aportes).
- Aporte materializado em aberto contava como garantia Nubank e antecipação em aberto liberava Livre Hoje; os dois passaram a exigir `pago`.
- A recarga após gravar podia apagar lançamentos simulados; agora espera a simulação acabar. O toggle de Reserva/Comprometido/Pra sempre virou um único `UPDATE` (tudo ou nada).
- O teto Besteira contava categorias que só *continham* "besteira" (ex.: a antiga `Besteira Isabella`); agora compara o item inteiro.
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
- **Trocar o token:** gerar um novo (ex.: no DataGrip, `select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`, que mostra o valor só no resultado), gravá-lo no secret `FIN_TOKEN` e em `%FINTOKEN`. A troca do secret vale na hora, sem deploy, e o token antigo para de funcionar.

## Metas (migration 36)

- *Tabela própria, só com o que o mantenedor decide:* `fin_meta` guarda nome, valor médio, mês (ou âncora ± meses), forma, vezes, entrada, juros, custo/mês e status. O plano não é gravado: é recalculado a cada desenho, porque depende de tudo o que muda todo dia (guardado projetado, limite, Comprometido).
- *Âncora, depois retirada:* a 1ª versão tinha âncora na mesma tabela (uma meta sem valor era uma data com nome que outras seguiam ± meses, coluna `ancora_meta_id`). O mantenedor pediu pra tirar de tudo: complicava a linha da meta sem uso real (nenhuma âncora chegou a ser gravada). A migration 38 remove `ancora_meta_id` e `deslocamento` e torna o valor obrigatório, abortando antes de remover se houver alguma âncora.
- *Escolhas do mantenedor (20/10/2026):* as metas entram nas projeções como linhas previstas; podem usar o guardado abaixo da meta da Reserva (o atraso aparece na data dela); âncora já na 1ª versão. Logo depois saíram os juros (parcela = resto ÷ vezes), o Custo/mês e o "Automático"; o parcelado ganhou duas datas (entrada e 1ª parcela) e o plano passou a conferir o dinheiro em cada mês de pagamento, com o Comprometido só informativo. A migration 37 troca `juros_mensal` e `custo_mensal` por `meses_ate_parcela` (a 36 pode já estar aplicada, então não foi reescrita). Em seguida o mês de cima passou a ser o da 1ª parcela (débito) ou da compra (cartão), com o mês da entrada embaixo, ao lado dela: `meses_ate_parcela` passou a contar os meses da entrada até o mês da meta. Sem migration: a única meta gravada com entrada tinha 0 meses, que dá o mesmo plano nas duas leituras.
- *Plano em cascata, não otimização:* cada meta, pela data, usa a forma escolhida (À vista, Parcelado Crédito ou Parcelado Débito; sem "Automático", a pedido do mantenedor) e o plano diz se cabe; a entrada, parte do total, sai à vista. É previsível e explicável no próprio texto do plano; uma busca pela "melhor combinação" de todas as metas mudaria o plano de uma meta por causa de outra sem que isso fique claro na tela.
- *Plano calculado com os caches zerados:* `limparCachesFinanceiros` refaz o plano na hora. Se ele nascesse no meio de um saldo em cálculo (a memoização trava o ciclo com 0 enquanto calcula), o guardado projetado sairia errado.

## Documentação de produto

As regras financeiras vivem em `docs/REGRAS.md`, junto das decisões e do checklist de publicação. O `AGENTS.md` na raiz continua curto e operacional, para orientar manutenção e automação.

## Hub abandonado

A fundação paralela `hub/Vcl.FinHub` (.NET, ABP, Angular, PostgreSQL local) foi encerrada e removida do repositório. A aplicação estática e `docs/REGRAS.md` continuam sendo a única fonte de verdade; não há plano ativo de migração para outro produto.

## Dependências externas fixadas

- `supabase-js` e `Chart.js` vêm do jsDelivr com **versão exata** e `integrity` (sha384), nunca por faixa (`@2`). Sem isso, uma versão nova entraria sozinha (podendo quebrar o login) e um CDN comprometido rodaria código com acesso à sessão.
- O jsDelivr serve o arquivo do pacote npm byte a byte, então o hash é calculado do próprio pacote: `npm pack <pacote>@<versão>`, extrair e rodar `openssl dgst -sha384 -binary <arquivo> | openssl base64 -A`. Atualize versão e hash juntos, de preferência para uma versão publicada há pelo menos duas semanas.

## Supabase: itens só do plano Pro

- **Leaked Password Protection** (Auth recusa senhas que constam no HaveIBeenPwned): o advisor de segurança do Supabase aponta como desligada (`auth_leaked_password_protection`), mas o recurso só está disponível no plano Pro. No plano atual o aviso fica aceito; ao migrar para o Pro, ligar em Authentication → Policies/Password security.
