# Corpo (`corpo`)

Pesagem e barriga dia a dia, IMC e evolução, e o perfil (idade, altura, basal). Também é o módulo que os outros apps usam para os dados sobre mim (`perfil.js`). Regras em `docs/REGRAS.md`; guia em `AGENTS.md`.

## Implantação (uma vez, feita pelo mantenedor)

1. Rodar `migrations/00-corpo-medida.sql` no DataGrip. Cria `corpo_medida` (RLS só do Victor) e copia o que já estava em `tr_medida`, sem apagar nada lá.
2. Depois, na ordem, as outras de `migrations/` (`01` e `02` registro do dia, `03` quando foi lançado, `04` xixi vindo da Água, que tira `xixis` de `agua_dia`).

## Testes

`node scripts/check.mjs` dentro de `corpo/`. Os testes de navegador usam o Playwright instalado em `tr/`.
