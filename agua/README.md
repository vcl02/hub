# Água (`agua`)

Água bebida e xixis do dia, meta de 1 L, lembretes dentro do app das 10 às 16 e o que dá para entender da bexiga. Regras em `docs/REGRAS.md`; guia em `AGENTS.md`.

## Implantação (uma vez, feita pelo mantenedor)

1. Rodar `migrations/00-agua-dia.sql` no DataGrip. Cria `agua_dia` (RLS só do Victor). Sem ela, o app abre vazio e não sobe nada para a nuvem.

## Testes

`node scripts/check.mjs` dentro de `agua/`. Os testes de navegador usam o Playwright instalado em `tr/`.
