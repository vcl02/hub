# Corpo (`corpo`)

Pesagem e barriga dia a dia, IMC e evolução, e o perfil (idade, altura, basal). Também é o módulo que os outros apps usam para os dados sobre mim (`perfil.js`). Regras em `docs/REGRAS.md`; guia em `AGENTS.md`.

## Implantação (uma vez, feita pelo mantenedor)

1. Rodar `migrations/00-corpo-medida.sql` no DataGrip. Cria `corpo_medida` (RLS só do Victor) e copia o que já estava em `tr_medida`, sem apagar nada lá.

## Testes

`node scripts/check.mjs` dentro de `corpo/`. Os testes de navegador usam o Playwright instalado em `tr/`.
