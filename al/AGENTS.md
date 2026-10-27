# Guia de manutenção da Alimentação (`al`)

## Propósito e fontes de verdade

- App estático (HTML/CSS/JavaScript clássico, sem build) para controlar o déficit calórico: o que comi no dia (kcal e macros) contra o gasto do dia. Usa o Supabase do projeto `fin` (tabelas `al_*`) pelo cliente do navegador e uma Edge Function (`al-estimar`) para a IA.
- `docs/REGRAS.md` é a fonte de verdade das regras e do comportamento visível; atualize-o junto com a mudança. `README.md` tem a implantação (migration, secret e deploy da função). Guia geral do hub em `../AGENTS.md`.

## Arquitetura

- `index.html` é o único documento; telas são `<section class="view">`. Um stylesheet só: `css/al.css`.
- Scripts clássicos nesta ordem, depois de `../supabase.js` (do hub), `../corpo/perfil.js` (módulo do app Corpo) e `gasto.js`: `config`, `util`, `banco`, `conta`, `ia`, `telas`, `bootstrap`. Escopo global compartilhado; a 1ª linha de cada um diz a responsabilidade.
- **Módulo compartilhado:** `gasto.js` (funções puras) tem o gasto e a meta do dia (`gastoNoDia`, `metaKcal`, fator de atividade, caminhada e `DEFICIT_META`). A página inicial do hub usa o mesmo arquivo para o hábito do déficit: mudou a conta, ela muda nos dois. Não declare ali nomes que o hub ou os apps já usam (`$`, `iso`, `sb`…).
- Arquivo novo em `css/` ou `js/` entra no `index.html` e no `ARQUIVOS_ESTATICOS` do `sw.js` (o teste `tests/estrutura.test.mjs` confere). O service worker é rede primeiro, cache `al-estatico`, e só apaga caches `al-`.
- Perfil, taxa basal, calorias do treino e pesagens vêm de `../corpo/perfil.js` (`PERFIL`, `idadeEm`, `tmb`, `kcalTreino`, `kcalEsteira`, `medidasGuardadas`, `lerMedidas`, `pesoNoDia`): nunca repita esses valores aqui.
- Treinos (`tr_treino`), pesagens (`corpo_medida`, do app Corpo) e as bebidas com calorias da Água (`agua_dia`, kcal por `../agua/bebidas.js`) são **só lidos** e guardados no aparelho (`al.tr.<id>`, `corpo.medidas.<id>` e `al.bebidas.<id>`). O al nunca grava em `tr_*` nem em `corpo_medida`.
- Todo arquivo `.js`, `.mjs`, `.ts`, `.css` e `.sql` começa com um comentário curto de responsabilidade.

## IA (Edge Function `al-estimar`)

- Código em `supabase/functions/al-estimar/index.ts`, publicado por deploy (o repositório não publica sozinho; ver `README.md`).
- A chave da Anthropic fica só no secret `ANTHROPIC_API_KEY` da função. Nunca no código, no navegador, no histórico ou em print: o repositório é público. `tests/funcao.test.mjs` e `tests/estrutura.test.mjs` barram chave no código.
- A função confere a sessão no Auth (só a conta `DONO`), limita as chamadas do dia (`al_uso`, com a sessão do próprio Victor, sem chave de serviço) e devolve só itens limpos. Modelo: `claude-haiku-5-5`, effort `low`, saída em JSON com esquema.
- O que a IA devolve vira comida salva (`al_item`) quando adicionado: a mesma comida não volta para a IA.

## Dados e segurança

- Só a conta `DONO` entra (a mesma do hub e do tr); o RLS de todas as `al_*` só libera ela (policy `somente_dono` + restritiva `somente_victor`). `anon` sem acesso.
- Chave do Supabase no código é a publicável. Nunca coloque chave de serviço nem segredo no repositório.
- Mudança de esquema: migration nova e numerada em `migrations/`, no formato do DataGrip (sem `do $$`, sem `;` em comentário, entre `begin;` e `commit;`). O mantenedor aplica; operações remotas que mudam estado (migration, secret, deploy) exigem confirmação explícita dele.
- Cópia local primeiro, envio por diferença (`linhas()`/`deLinhas()` em `js/banco.js`): mudanças no formato do `db` precisam continuar compatíveis com a cópia já gravada nos aparelhos.

## Como concluir uma mudança

1. Atualize `docs/REGRAS.md`.
2. Ajuste os testes em `tests/`: `dia` (navegador, Playwright do `tr/node_modules`, Supabase e IA falsos em `tests/helpers/app.mjs`), `funcao` (a Edge Function rodando com SDK e rede simulados) e `estrutura`.
3. Rode `node scripts/check.mjs` dentro de `al/` e, antes do push, na raiz do hub. Informe precisamente o que foi validado; não alegue validação no celular, no Supabase real ou com a IA real se ela não ocorreu.
4. Commit e push conforme `../AGENTS.md`.

## Preferências do mantenedor

- Mínimo esforço para registrar: nada de formulário longo; a IA faz o trabalho e o cache evita repetir.
- Textos curtos em português; nada de texto explicando como usar. Botões só com ícone têm `title` e `aria-label`.
- Água e hábitos (sem doce etc.) não entram aqui: serão módulos próprios.
