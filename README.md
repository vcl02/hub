# hub

Página inicial que reúne os apps pessoais, todos em tema escuro e publicados juntos no GitHub Pages.

| Pasta | App |
|---|---|
| `fin/` | Finanças (ver `fin/AGENTS.md`) |
| `tr/` | Treino (ver `tr/README.md`) |
| `al/` | Alimentação: déficit calórico do dia, com IA (ver `al/README.md`, implantação incluída) |
| `corpo/` | Corpo: pesagem, barriga e os dados sobre mim usados pelos outros apps (ver `corpo/README.md`) |
| `agua/` | Água: água e xixi do dia, meta e lembretes no app (ver `agua/README.md`) |

## Validação

```
cd tr && npm ci && npx playwright install chromium && cd ..
node scripts/check.mjs
```

Guia de manutenção em `AGENTS.md`.
