# Diário de Carga

PWA para registrar evolução de carga na academia: pirâmide automática, substituto por exercício, cronômetro de descanso, peso corporal e pontos/conquistas.

| Arquivo | O que é |
|---|---|
| `index.html` | Telas |
| `style.css` | Visual |
| `app.js` | Lógica e banco (formato comentado no topo) |
| `sw.js` | Cache offline |
| `manifest.webmanifest` + ícones | Instalação na tela inicial |
| `tests/app.test.mjs` | Testes de ponta a ponta |

**Banco:** um item no `localStorage`, criptografado (AES-GCM, chave derivada da senha mestra com PBKDF2):

```
{ exercicios: [{ id, grupo, regiao, series, reps, descanso, modo, ativo,
                 variacoes: [{ id, nome, unidade, passo, lados, equip?, nota? }] }],
  registros:  [{ variacao, data, series: [{ kg, reps }] }],
  treinos:    [{ inicio, fim, fechado? }],
  medidas:    [{ data, hora, peso, cintura? }] }
```

- **Pirâmide:** `modo` crescente (+10% de peso, −2 reps), reta (mesma carga) ou invertida. O peso sobe pelo `passo` do aparelho; cada série pode ter peso e reps ajustados. O registro guarda peso e reps de cada série.
- **Unidades:** `kg`, `lb` (mostra o equivalente em kg) ou `nível`; `lados: 2` = peso por lado (mostra o total).
- **Calorias:** estimativa = 3,5 MET (Compendium of Physical Activities, 02054) × peso corporal × horas de treino.
- **Fotos das máquinas:** `localStorage` `carga.foto.<variação>`, fora do banco e do backup.
- **Aquecimento:** o 1º exercício de cada `regiao` (Pernas / Superior) no dia ganha 1 série de 50% × 15, com 45 s de descanso.
- **Tempo de treino:** começa no 1º toque dentro de um exercício; 30 min sem mexer encerra no horário da última interação.
- **Pontos e conquistas:** calculados a partir dos dados, nada extra é guardado.
- **Sessão do dia** (séries marcadas, reps, cronômetro, exercício aberto, peso digitado): item `carga.sessao` no `localStorage`, sem criptografia; zera quando muda o dia.
- **Cores:** azul = app e ações, verde = feito/sucesso, vermelho = erro/abaixo da meta; tokens no topo de `style.css`.
- **Atualização:** ao abrir, ao voltar para o app e a cada 10 min, `app.js` compara `index.html`, `app.js` e `style.css` publicados com os que estão rodando; se mudaram, recarrega (fora de telas com formulário). O `sw.js` busca da rede revalidando com o servidor e só usa o cache sem internet.
- Dias de treino: `DIAS_FIXOS` e `DIAS_EXTRA` no topo de `app.js`.

## Testes

```
npm install
npx playwright install chromium
npm test
```
