# Diário de Carga

PWA para registrar evolução de carga na academia: pirâmide automática, substituto por exercício, cronômetro de descanso, peso corporal e pontos/conquistas.

| Arquivo | O que é |
|---|---|
| `index.html` | Telas |
| `style.css` | Visual |
| `app.js` | Lógica e banco (formato comentado no topo) |
| `sw.js` | Cache offline |
| `supabase.js` | Cliente do Supabase |
| `manifest.webmanifest` + ícones | Instalação na tela inicial |
| `tests/app.test.mjs` | Testes de ponta a ponta |

**Banco:** Supabase (projeto `fin`), login por e-mail e senha (mesma conta do fin). Cada tabela tem `user_id` e RLS "só o dono":

| Tabela | Chave | Campos |
|---|---|---|
| `tr_exercicio` | `id` | ordem, grupo, regiao, series, reps, descanso, modo, ativo |
| `tr_variacao` | `id` | exercicio_id, ordem (0 principal, 1 substituto, 2 halter), nome, unidade, passo, lados, equip, nota |
| `tr_registro` | `variacao_id, data` | series `[{ kg, reps }]` |
| `tr_treino` | `inicio` | fim, fechado |
| `tr_medida` | `data` | hora, peso, cintura |

- **Sincronização:** o app guarda uma cópia local (`tr.db.<usuário>`) e, 0,8 s depois de cada mudança, envia só as linhas que mudaram em relação à última versão confirmada (`tr.base.<usuário>`). Sem internet, fica pendente e envia ao reconectar. Ao abrir, envia o pendente e baixa a versão da nuvem.
- **Versão antiga** (cofre criptografado `carga.vault.v1`): no 1º login é juntada à conta automaticamente se a chave estava salva; senão, Ajustes › Backup pede a senha mestra antiga.
- `supabase.js` = `@supabase/supabase-js` 2.118.0 (UMD), copiado para funcionar offline.
- **Pirâmide:** `modo` crescente (+10% de peso, −2 reps), reta (mesma carga) ou invertida. O peso sobe pelo `passo` do aparelho; cada série pode ter peso e reps ajustados. O registro guarda peso e reps de cada série.
- **Unidades:** `kg`, `lb` (mostra o equivalente em kg) ou `nível`; `lados: 2` = peso por lado (mostra o total).
- **Calorias:** estimativa = 3,5 MET (Compendium of Physical Activities, 02054) × peso corporal × horas de treino.
- **Fotos das máquinas:** `localStorage` `carga.foto.<variação>`, fora do banco e do backup (ficam só no aparelho).
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

Os testes usam um Supabase falso em memória (sem internet).
