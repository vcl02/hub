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

**Pirâmide:** o registro guarda o peso da 1ª série (`carga`) e as reps feitas na última (`reps`). As outras séries são calculadas: +10% de peso e −2 reps por série. O 1º exercício do dia ganha uma série de aquecimento (50% × 15, descanso de 45 s).

**Sessão do dia** (séries feitas, cronômetro, exercício aberto, valores digitados): item `carga.sessao` no `localStorage`, sem criptografia; zera quando muda o dia.

Dias de treino: `DIAS_FIXOS` e `DIAS_EXTRA` no topo de `app.js`.
