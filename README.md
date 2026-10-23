# hub

Página inicial que reúne os apps pessoais, todos em tema escuro e publicados juntos no GitHub Pages.

| Pasta | App |
|---|---|
| `fin/` | Finanças (ver `fin/AGENTS.md`) |
| `tr/` | Treino (ver `tr/README.md`) |

## Validação

```
cd tr && npm ci && npx playwright install chromium && cd ..
node scripts/check.mjs
```

Guia de manutenção em `AGENTS.md`.
