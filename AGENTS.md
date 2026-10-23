# Guia de manutenção do hub

## O que é

- Um repositório só (`vcl02/hub`), publicado inteiro no GitHub Pages: a página inicial na raiz e cada app numa pasta.
- `fin/` (finanças) e `tr/` (Diário de Carga) vieram dos repositórios `vcl02/fin` e `vcl02/tr` com o histórico completo (`git subtree`). Os repositórios antigos foram excluídos em 22/10/2026: o código e o histórico vivem só aqui, e os endereços antigos (`/fin/`, `/tr/`) não existem mais.
- Cada app tem o próprio guia (`fin/AGENTS.md`, `tr/AGENTS.md`), regras (`docs/REGRAS.md`) e testes. Este arquivo cobre só o que é do hub. Em caso de conflito, uma solicitação explícita do mantenedor vence os guias.

## Estrutura

| Caminho | O que é |
|---|---|
| `index.html` · `hub.css` · `hub.js` | Página inicial: login e um card por app (só ícone e nome, sem subtítulo) |
| `supabase.js` | `@supabase/supabase-js` (UMD), cópia byte a byte de `tr/supabase.js` (o teste confere); atualize os dois juntos |
| `sw.js` · `manifest.webmanifest` · `icons/` | Instalação e cache offline da página inicial |
| `fin/` · `tr/` | Os apps, cada um com `index.html`, service worker e manifest próprios |
| `tests/` | Estrutura do hub (`hub.test.mjs`) e, no Chromium com o Supabase falso do tr, login no hub e os apps abrindo com a mesma sessão (`navegacao.test.mjs`) |
| `scripts/check.mjs` | Validação completa: raiz, `fin/` e `tr/` |
| `.github/workflows/` | Validação em todo push e e-mail de publicação do Pages (só funcionam na raiz) |
| `.claude/settings.json` · `.claude/hooks/session-start.sh` | Sessões do Claude Code na nuvem: instalam o Playwright do tr ao começar, pra validação completa rodar sempre |

## Regras do hub

- Tudo em tema escuro, com a mesma paleta (fundo `#1B1E21`, superfícies `#24272B`), mesmo com o celular no modo claro.
- **Login antes de tudo:** a página inicial abre no login (usuário `victor` ou e-mail, e senha) e só mostra os cards depois de entrar. Só a conta `DONO` (a mesma do tr) passa; outra conta sai na hora. Com a sessão salva, entra direto (inclusive sem internet). Sair, no canto superior direito, pede toque duplo e encerra a sessão neste aparelho para todos os apps.
- Sair existe só no hub: fin e tr não têm botão de sair.
- App aberto sem sessão (link direto, ícone antigo) vai para o login do hub com `?volta=<pasta>/…` e, depois de entrar, o hub devolve para ele. `?volta` só é aceito se for a pasta de um card (nunca outro site ou `..`). A tela de login própria dos apps só aparece com eles servidos fora do hub (testes).
- Card não fica selecionado: destaque só com mouse (`@media (hover: hover)`) ou teclado, e `hub.js` solta o foco ao voltar para a página.
- O app é só do mantenedor: na página inicial, só o login e os cards; nada de textos explicando como usar.
- Cada app volta para a página inicial pelo ícone do hub (a marca em traço: nó central ligado a quatro pontas; link para `../`).
- A marca do hub é `icons/hub.svg` (favicon e login; nenhum card usa a marca; o título da tela dos cards é só o texto); `hub-32.png` (favicon de reserva), `hub-180.png` (iPhone) e `hub-192/512.png` (manifest, fundo inteiro para o sistema recortar) saem dela.
- Caminhos sempre relativos (`./`, `../`): o site roda em `/hub/`, e os apps em `/hub/fin/` e `/hub/tr/`.
- Mesma origem para todos: `localStorage`, caches e a sessão do Supabase são compartilhados.
  - Chaves de `localStorage` e nomes de cache sempre com prefixo do app (`fin-`, `carga-`/`tr.`, `hub-`). Nenhum service worker apaga cache de outro prefixo.
  - A sessão do Supabase (mesmo projeto, mesma chave) vale para todos os apps: entrar em um entra em todos, e Sair em qualquer um sai de todos.
- O service worker da raiz só atende os arquivos da própria página inicial; cada app tem o seu, com escopo na própria pasta.

## Atalho externo

- Card com `class="app externo"` (ex.: Agenda → Google Agenda): link para fora, em outra aba, nunca aceito como `?volta`. No Android, `hub.js` troca o link por um `intent://` que abre o app (`com.google.android.calendar`), com a web como reserva (`browser_fallback_url`).
- Anotações → conversa do WhatsApp comigo mesmo (ícone `icons/anotacoes.svg`, bloco de anotações) (`wa.me/<número>`, número público no repositório).

## Novo app

1. Crie a pasta (`nome/`) com `index.html`, caminhos relativos e o ícone do hub para `../`.
2. Acrescente o card em `index.html` (o teste `tests/hub.test.mjs` confere a lista e que a pasta tem `index.html`) e a pasta ao `scripts/check.mjs` se ela tiver validação própria.
3. Use a paleta escura e prefixe chaves de `localStorage` e caches.

## Como concluir uma mudança

1. Atualize as regras e os testes do app afetado (ver o guia dele).
2. Rode `node scripts/check.mjs` na raiz. Ele roda a validação de `fin/` e `tr/` e precisa das dependências do tr (`npm ci` e `npx playwright install chromium` dentro de `tr/`; nas sessões na nuvem, o hook de início já instala). Informe precisamente o que foi validado; não alegue validação no celular ou no Supabase real se ela não ocorreu.
3. Faça commit e push direto na `main`: projeto pessoal, sem fluxo de PR, sem worktree nem branch auxiliar. Nunca inclua alterações alheias no commit.
4. Nunca reescreva o histórico importado de `fin/` e `tr/` (rebase, amend, troca de autor).

## Dados e segurança

- Os dois apps usam o mesmo projeto Supabase (`fin` e tabelas `tr_*`), só pelo cliente do navegador e com a chave publicável. Nunca coloque chave de serviço nem segredo no repositório, que é público.
- Qualquer operação remota que mude estado no Supabase (dados, esquema, RLS, Auth) exige confirmação explícita do mantenedor, com alvo e efeito informados. Consultas só de leitura podem apoiar diagnóstico (`.mcp.json` já é somente leitura).
