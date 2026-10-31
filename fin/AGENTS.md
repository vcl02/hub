# Guia de manutenção do `fin`

## Propósito e fontes de verdade

- Esta é uma aplicação estática, em HTML/CSS/JavaScript clássico, para acompanhamento financeiro pessoal. Ela usa o Supabase somente pelo cliente do navegador.
- `docs/REGRAS.md` é a fonte de verdade das regras financeiras e de comportamento visível. Não duplique regras de negócio aqui: atualize aquele arquivo quando uma regra mudar.
- Este arquivo define como trabalhar no repositório. Em caso de conflito, uma solicitação explícita do usuário vence este guia.

## Arquitetura

- O fin mora em `fin/` do repositório `vcl02/hub`, publicado junto com a página inicial do hub e os outros apps (guia geral em `../AGENTS.md`). Dentro de `fin/`, `fin/index.html` é o único documento do app; não introduza fragmentos HTML ou um framework sem uma decisão explícita. Outras páginas do hub ficam fora desta pasta.
- Os estilos são carregados nesta ordem: `css/base.css`, `css/dashboard.css`, `css/forms.css`, `css/charts.css`, `css/utilities.css`, `css/mobile.css`. `mobile.css` precisa ser o último, pois contém os overrides responsivos.
- Os scripts clássicos são carregados nesta ordem: `app-state`, `domain`, `shared`, `supabase-api`, `finance`, `data-ui`, `tables`, `cycle-views`, `interactions`, `charts`, `form`, `bootstrap`. Respeite as dependências globais entre eles.
- Preserve a responsabilidade de cada módulo: estado/configuração, utilitários, API, cálculos, carga, tabelas, visões, interações, gráficos, formulário e inicialização.
- Todo arquivo `.js`, `.css`, `.sql` e `.test.js` deve começar com um cabeçalho curto de responsabilidade; no HTML, comente as regiões que são preenchidas ou controladas pelo JavaScript. O teste `documentacao-estrutura.test.js` protege esse padrão.

## Regras de dados e segurança

- Valores são assinados: entrada positiva, saída negativa. Não transforme o sinal apenas para apresentação antes de um cálculo.
- Linhas reais têm `id` positivo; linhas sintéticas e simuladas não existem no banco. Nunca envie PATCH/DELETE para uma linha sintética ou simulada.
- Consultas somente de leitura ao Supabase, como `SELECT`, inspeção de schema, migrations e advisors, podem ser feitas para diagnóstico. A disponibilidade de uma ferramenta de escrita no MCP não é autorização para usá-la.
- Antes de qualquer operação remota que possa mudar estado — `INSERT`, `UPDATE`, `DELETE`, `UPSERT`, RPC com efeito, `CREATE`/`ALTER`/`DROP`, grants, RLS, Auth, Storage, configuração ou execução de migration — peça confirmação explícita do mantenedor nesta conversa, com alvo e efeito informados. Não crie dados de teste no banco.
- Criação, edição, exclusão ou atualização real já são ações do usuário dentro da interface. Fora desse fluxo, não altere dados financeiros no Supabase sem autorização explícita.
- Preserve migrations aplicadas. Para uma alteração de esquema, crie uma migration nova e numerada; não reescreva migrations históricas.
- O mantenedor aplica migrations e ajusta dados diretamente no DataGrip; prepare a migration versionada quando ela for necessária, mas não a execute sem a confirmação explícita definida acima.
- Toda migration precisa rodar no DataGrip, que parte o script em **cada** `;` — inclusive dentro de `$$` e de comentário. Por isso, a partir da 28: nenhum bloco `do $$`, nenhuma função com `;` no corpo (use `language sql` com uma única expressão, ex.: `case`), nenhum `;` em linha de comentário, tudo entre `begin;` e `commit;`. Pré-requisitos são conferidos com comandos que falham sozinhos (`select 'public.x'::regclass;`), e rodar de novo não pode mudar nada. Detalhes e motivos em `docs/DECISOES.md`, seção "Migrations no DataGrip".
- Antes de entregar uma migration de dados: prévia só de leitura no banco real (quantas linhas e quais grupos ela toca) e teste num PostgreSQL local (PGlite) executando o script partido em `;`, como o DataGrip. Depois que o mantenedor aplicar, confira o resultado com `SELECT` antes de declarar aplicada.
- O RLS de `fin`, `fin_ciclo` e `fin_meta` permite leitura e escrita somente ao mantenedor (migrations 20 e 39); `anon` não tem acesso. Nova policy ou grant precisa preservar isso.
- Segredos (ex.: o token da captura do Nubank) ficam só em secret do Supabase e no celular, nunca em arquivo do repositório, que é público. A Edge Function `captura-nubank` é a única exceção ao RLS; ver `docs/DECISOES.md`, "Captura do Nubank".
- Não exponha chaves de serviço nem contorne RLS. Toda atualização por nome deve usar a igualdade exata e `encodeURIComponent` no filtro PostgREST.

## Infraestrutura

Resolução deste app para cada item de `../docs/DIRETRIZES.md` (o que vale para todos fica lá).

- **Migrations:** `migrations/` 00 a 43. Formato DataGrip desde a 28; a 27 (`fin_historico`) é a exceção de gatilho, aplicada pelo MCP em duas partes. Migration de dados: prévia só de leitura e teste num PostgreSQL local (PGlite) com o script partido em `;` (ver Regras de dados e segurança). Formato conferido em `tests/recorrencia-id-lote.test.js`, `tests/pra-sempre.test.js` e `tests/migrations-2032.test.js`; numeração em `../tests/documentacao.test.mjs`.
- **Testes:** funções e estrutura com `node:test`, sem navegador, em `tests/*.test.js` (carga das funções em `tests/helpers/carregar-funcoes.js`); a Edge Function em `tests/captura-nubank.test.js`. No navegador (helper `tests/helpers/navegador.js`), `tests/navegador.test.js`, `navegador-celular.test.js` (390 px com toque: arrastar ciclo, nada estoura a largura, Data/Nome/Valor na 1ª tela com o Nome grudado ao rolar, vãos do cadastro, fatura por parcela) `navegador-linhas.test.js` (± e Nome na própria célula, data, excluir várias, comparar, série parcelada num pedido só), `navegador-metas.test.js` (o modal de metas), `navegador-consolidar.test.js` (Recarregar consolida), `navegador-cartoes.test.js` (os dois cartões), `navegador-diagnostico.test.js` (botão, modal, carga lenta e falha), `navegador-tetos.test.js` (Besteira e Isabella), `navegador-marcas.test.js` (Reserva, Comprometido e a série por Frequência) e `navegador-cartao.test.js` (o modal de um cartão): o Fin servido em `/hub/fin/` com login no hub, o Supabase falso do tr para a sessão e as tabelas `fin`, `fin_ciclo` e `fin_meta` em memória no próprio teste (abre no ciclo de hoje, troca de ciclo pelo endereço, lançar e apagar gravam uma vez só, simulação não grava nada e desligar descarta, Nova meta grava uma vez só com a rede lenta, compra no crédito entra na fatura do cartão certo; sem erro nem arquivo faltando). O falso aplica o que o banco faz e o app espera (`fin_meta.status = 'aberta'`, ids numéricos, `id=in.(…)`, a `rpc/proxima_recorrencia`). **Regex só no que é texto** (SQL, docs, configuração, segredos) ou na saída de uma função rodada; comportamento de tela e de código vai para a função rodando ou para o navegador (conversão em andamento: ver `docs/DIRETRIZES.md`, seção 3); a raiz ainda confere a sessão e o `?ciclo` em `../tests/navegacao.test.mjs`. `node scripts/check.mjs` dentro de `fin/` usa o Playwright de `../tr` (`npm ci` lá; nas sessões na nuvem o hook já instala).
- **Pacotes:** sem `package.json`. `supabase-js` 2.118.0 (a mesma versão da cópia da raiz do hub; `tests/pwa.test.js` confere o `integrity` contra `../supabase.js`) e `chart.js` 4.4.1 pelo jsDelivr com versão exata e `integrity` (ver `docs/DECISOES.md`, "Dependências externas fixadas"). A Edge Function `captura-nubank` não usa pacote além dos tipos `jsr:@supabase/functions-js@2.118.0`.
- **Backups:** `fin_historico` guarda antes e depois de cada linha de `fin` e `fin_ciclo` (migration 27) e de `fin_meta` (migration 41, aplicada em 28/10/2026). O download do Fin exporta o recorte filtrado. Migration destrutiva guarda as linhas afetadas antes (ex.: a 07 não se reaplica sem isso).
- **Domínio:** `/hub/fin/`. Externos: o Supabase (inclusive `functions/v1/captura-nubank`, chamada pelo Tasker do celular) e `cdn.jsdelivr.net`.

## Como concluir uma mudança

1. Mapeie a regra afetada em `docs/REGRAS.md` e atualize-a na mesma alteração.
2. Acrescente ou ajuste testes de regressão para o comportamento alterado. Prefira `node:test`, determinístico e sem criar lançamentos de teste no banco.
3. Documente no código a intenção de regras financeiras, arredondamentos, filtros e efeitos de linhas sintéticas. Comentários devem explicar o porquê, não reescrever a sintaxe.
4. Rode `node --test tests/*.test.js`, `git diff --check` e verificações de sintaxe aplicáveis. A suíte deve incluir a checagem de estrutura HTML/CSS: todo `<div>` precisa fechar na ordem correta e cada stylesheet precisa ter chaves balanceadas. Informe precisamente o que foi validado; não alegue validação visual ou Supabase se ela não ocorreu.
   O atalho oficial é `node scripts/check.mjs` (dentro de `fin/`), que executa a validação local completa sem dependências adicionais, inclusive higiene textual definida no `.editorconfig`. Antes do push, rode também `node scripts/check.mjs` na raiz do hub, que valida a página inicial, o fin e o tr juntos.
5. Depois de os testes passarem, faça commit e push para `origin/main` do `vcl02/hub` por padrão, salvo pedido contrário do usuário. Nunca inclua alterações alheias no commit.
6. Trabalhe sempre no checkout principal, direto na branch `main`: este é um projeto pessoal, sem fluxo de PR. Nunca crie git worktree, branch auxiliar nem peça revisão antes de puxar pra `main` — pedido explícito do mantenedor.
- **Sem prints de tela:** não tire nem abra capturas de tela (screenshot) para conferir visual, a pedido do mantenedor (gastam muito do limite de uso). Confira pelos testes e por medidas no navegador (posição, tamanho, texto, classes) e diga o que não foi visto.
- **Testes: função primeiro, tela pouco, regex quase nunca:** 1) a função do código rodando (sem navegador); 2) Playwright só em poucos casos estratégicos; nunca regex no código, só onde o objeto é texto (SQL, docs, configuração, segredos). Detalhes e exceções em `../docs/DIRETRIZES.md`, seção 3.

## Preferências do mantenedor

- Prefira mudanças pontuais que preservem o restante do comportamento e dados diretamente editáveis no DataGrip.
- Não crie páginas HTML adicionais, testes em Python ou dados fictícios no banco apenas para testar.
- Para cada nova feature ou correção, regras e testes são parte obrigatória da entrega.
- Ao relatar a entrega, diferencie teste local, validação de navegador e validação integrada com Supabase.
- Mantenha dark mode definitivo, porém em tons de cinza escuro legíveis; evite preto quase puro dominando toda a interface.
- Prefira ícones a textos nos botões de ação. Todo ícone precisa de `title` e `aria-label`; texto visível só entra quando for indispensável para entendimento.
- Busque minimalismo: informação útil, textos curtos e formulários somente com campos necessários ao cadastro.
- O app é só do mantenedor: nada de dicas, guias, instruções na tela nem botões ou modais de ajuda. Quando uma explicação for útil, no máximo um hover (`title`).
- O mobile tem paridade total com o desktop: mesmas colunas, edição inline, Editar/Duplicar/Excluir, Crédito, Comparar, gráficos, Consolidar, simulação e cadastro. Não restrinja funcionalidade por tamanho de tela; o mobile só ajusta layout.
- Não há conta restrita: a conta da Isabella saiu e a interface é uma só, a do mantenedor. A categoria `Isabella` (teto e fatura dela) continua.
