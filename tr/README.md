# Treino

PWA para registrar a evolução de carga na academia: pirâmide automática, substituto por exercício, cronômetro de descanso e pontos/conquistas (peso corporal fica no app Corpo, `../corpo/`). Dados no Supabase do projeto `fin` (tabelas `tr_*`), com cópia local para funcionar sem internet.

| Arquivo | O que é |
|---|---|
| `index.html` | Telas |
| `css/` | Visual, em 6 arquivos (ordem no `index.html`) |
| `js/` | Lógica em 14 módulos; formato do banco comentado em `js/config.js` |
| `sw.js` | Cache offline |
| `supabase.js` | Cliente do Supabase |
| `manifest.webmanifest` + ícones | Instalação na tela inicial |
| `tests/` | Testes por área + `estrutura.test.mjs`; infra em `tests/helpers/` |
| `migrations/` | SQL das tabelas `tr_*` (formato DataGrip, já aplicadas) |
| `scripts/check.mjs` | Validação completa (sintaxe, higiene textual, testes) |
| `docs/REGRAS.md` | Regras do app (fonte de verdade) |
| `AGENTS.md` · `docs/` | Guia de manutenção, decisões e checklist de publicação |

## Testes

Dentro de `tr/`:

```
npm install
npx playwright install chromium
node scripts/check.mjs   # ou só os testes: npm test
```

Fica em `tr/` do repositório `hub`; antes do push rode também `node scripts/check.mjs` na raiz.
