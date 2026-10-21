# Diário de Carga

PWA para registrar evolução de carga na academia, com substituto por exercício e cronômetro de descanso.

| Arquivo | O que é |
|---|---|
| `index.html` | Telas |
| `style.css` | Visual |
| `app.js` | Lógica e banco (comentado no topo) |
| `sw.js` | Cache offline |
| `manifest.webmanifest` + ícones | Instalação na tela inicial |

**Banco:** um item no `localStorage`, criptografado (AES-GCM, chave derivada da senha mestra com PBKDF2):

```
{ exercicios: [{ id, grupo, series, reps, descanso, ativo, variacoes: [{ id, nome, unidade }] }],
  registros:  [{ variacao, data, carga, reps }] }
```

Dias de treino: `DIAS_FIXOS` e `DIAS_EXTRA` no topo de `app.js`.
