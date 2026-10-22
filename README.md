# Diário de Carga

PWA para registrar evolução de carga na academia: pirâmide automática, substituto por exercício, cronômetro de descanso, peso corporal e pontos/conquistas. Dados no Supabase do projeto `fin` (tabelas `tr_*`), com cópia local para funcionar sem internet.

| Arquivo | O que é |
|---|---|
| `index.html` | Telas |
| `style.css` | Visual |
| `app.js` | Lógica e banco (formato comentado no topo) |
| `sw.js` | Cache offline |
| `supabase.js` | Cliente do Supabase |
| `manifest.webmanifest` + ícones | Instalação na tela inicial |
| `tests/app.test.mjs` | Testes de ponta a ponta |
| `migrations/` | SQL das tabelas `tr_*` (formato DataGrip, já aplicadas) |
| `scripts/check.mjs` | Validação completa (sintaxe, higiene textual, testes) |
| `docs/REGRAS.md` | Regras do app (fonte de verdade) |
| `AGENTS.md` · `docs/` | Guia de manutenção, decisões e checklist de publicação |

## Testes

```
npm install
npx playwright install chromium
node scripts/check.mjs   # ou só os testes: npm test
```
