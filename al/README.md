# Alimentação (`al`)

Déficit calórico do dia: o que comi (kcal, proteína, carboidrato e gordura) contra o gasto (basal × 1,2 + treino + caminhada). Regras em `docs/REGRAS.md`; guia de manutenção em `AGENTS.md`.

## Implantação (uma vez, feita pelo mantenedor)

1. **Tabelas:** rodar `migrations/00-tabelas-al.sql` no DataGrip (projeto do fin). Cria `al_item`, `al_registro`, `al_dia` e `al_uso`, com RLS só do Victor.
2. **Chave da IA:** criar uma chave em console.anthropic.com (cobrança da API, separada da assinatura do Claude). Não colar em chat, arquivo nem print.
3. **Secret:** no painel do Supabase, Edge Functions → Secrets, criar `ANTHROPIC_API_KEY` com a chave. Pela CLI: `supabase secrets set ANTHROPIC_API_KEY=<chave> --project-ref yzmyncxoskvqzdczaill` (cuidado: fica no histórico do terminal).
4. **Função:** dentro de `al/`, `supabase functions deploy al-estimar --project-ref yzmyncxoskvqzdczaill --no-verify-jwt`. O `--no-verify-jwt` deixa o pedido de CORS do navegador (sem sessão) chegar à função; a própria função confere a sessão no Auth e recusa quem não for o Victor.

Sem os passos 2 a 4 o app funciona com digitação à mão (a prévia abre para preencher os valores).

## Testes

`node scripts/check.mjs` dentro de `al/`. Os testes de navegador usam o Playwright instalado em `tr/` (`npm ci` e `npx playwright install chromium` lá).
