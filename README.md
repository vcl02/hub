# hub

Página inicial com os hábitos do dia (ofensivas, dias perfeitos e proteções) que levam aos apps pessoais, todos em tema escuro e publicados juntos no GitHub Pages.

| Pasta    | App                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| `fin/`   | Finanças (ver `fin/AGENTS.md`)                                                                                   |
| `tr/`    | Treino (guia em `tr/AGENTS.md`)                                                                                  |
| `al/`    | Alimentação: déficit calórico do dia, com IA (guia em `al/AGENTS.md`, implantação incluída)                      |
| `corpo/` | Corpo: pesagem, barriga e os dados sobre mim usados pelos outros apps (guia em `corpo/AGENTS.md`)                |
| `agua/`  | Água: água e xixi do dia, meta e lembretes no app (guia em `agua/AGENTS.md`)                                     |
| `notas/` | Notas: anotações em Markdown, editor no PC e conversa no celular; o atalho Anotações (guia em `notas/AGENTS.md`) |

## Validação

```
npm ci && npx playwright install chromium
node scripts/check.mjs
```

Guia de manutenção em `AGENTS.md`; diretrizes comuns a todos os projetos (documentação, migrations, testes, pacotes, backups e domínios) em `docs/DIRETRIZES.md`.
