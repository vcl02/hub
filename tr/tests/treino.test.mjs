// Treino: pirâmide, séries, aquecimento, tempo, um treino por dia, resumo e lembrete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, arrastar, linhas } from './helpers/app.mjs';

prepararApp();

test('pirâmide usa o passo da máquina e começa com aquecimento; padrão é a invertida', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.tap('.slot >> nth=0');
  await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  assert.equal(await pg.getAttribute('[data-modo="invertida"]', 'aria-checked'), 'true');
  assert.deepEqual(await linhas(pg), ['Aquecimento20 kg × 15', 'Série 140 kg × 8', 'Série 235 kg × 10', 'Série 330 kg × 12']);
  assert.equal(await pg.textContent('#e-unidade'), 'kg');
  assert.deepEqual(erros, []); await ctx.close();
});

test('salva sozinho a cada série, ajusta reps e desfaz a última série', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.tap('.slot >> nth=0');
  await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita');                                                                // aquecimento: ainda nada salvo
  assert.match(await pg.textContent('#e-historico'), /Nenhum registro/);
  await pg.click('#t-feita'); await pg.click('#t-feita');                                    // séries 1 e 2, sem esperar o descanso
  assert.match(await pg.textContent('#e-historico'), /40\/35 kg\s*× 8\/10/);
  await pg.click('[data-linha="1"]'); await pg.click('[data-aj="reps"][data-d="-1"]');     // série 2: fez 9
  await pg.click('#t-feita');                                                                // série 3: última, já vai pro próximo
  assert.equal(await pg.textContent('#e-nome'), 'Cadeira flexora');
  await pg.click('#toast-desfazer');                                                         // toque duplo sem querer na série 3: volta pra ele
  assert.equal(await pg.textContent('#e-nome'), 'Leg press 45°');
  assert.match(await pg.textContent('#e-historico'), /40\/35 kg\s*× 8\/9(?!\/)/);
  assert.equal(await pg.locator('#t-plano li.ok').count(), 3);
  await pg.click('#t-desfazer');                                                             // e o botão desfaz mais uma, a qualquer hora
  assert.equal(await pg.locator('#t-plano li.ok').count(), 2);
  assert.match(await pg.textContent('#e-historico'), /40 kg\s*× 8(?!\/)/);
  assert.deepEqual(erros, []); await ctx.close();
});

test('peso trocado depois das séries atualiza o registro; trocar de variação não duplica', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita');
  await pg.fill('#e-carga', '42,5'); await pg.dispatchEvent('#e-carga', 'input');
  assert.match(await pg.textContent('#e-salvo'), /42,5 kg/);
  await pg.click('[data-var="1"]');                                                          // trocou para o substituto
  const hoje = await pg.evaluate(() => db.registros.filter(r => r.data === hoje()).length);
  assert.equal(hoje, 1);
  await ctx.close();
});

test('aquecimento só no 1º exercício de cada região', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-pular');
  await arrastar(ctx, pg, 330, 60);                                                          // 2º de pernas
  assert.equal((await linhas(pg)).length, 3);
  await arrastar(ctx, pg, 330, 60);                                                          // 1º da parte de cima
  assert.equal((await linhas(pg))[0].startsWith('Aquecimento'), true);
  await ctx.close();
});

test('arrastar para nas pontas da lista', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0');
  await arrastar(ctx, pg, 60, 330); assert.equal(await pg.textContent('#e-pos'), '1/6');
  for (let i = 0; i < 6; i++) await arrastar(ctx, pg, 330, 60);
  assert.equal(await pg.textContent('#e-pos'), '6/6');
  await ctx.close();
});

test('tempo de treino fecha após 30 min sem mexer', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-21T19:00:00') });
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.clock.fastForward('25:00'); await pg.click('#t-feita');                           // última interação 19:25
  await pg.goBack(); await pg.clock.fastForward('45:00');
  await pg.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(await pg.isVisible('#i-treino'), false);                                      // card só durante o treino
  assert.deepEqual(await pg.evaluate(() => [hhmm(db.treinos[0].inicio), hhmm(db.treinos[0].fim)]), ['19:00', '19:25']);
  await ctx.close();
});

test('séries do dia continuam depois de recarregar', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=1'); await pg.fill('#e-carga', '25'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita');
  await pg.reload();                                                                         // sessão do Supabase fica salva
  await pg.waitForSelector('#v-exercicio:not([hidden])');
  assert.equal(await pg.inputValue('#e-carga'), '25');
  assert.equal(await pg.locator('#t-plano li.ok').count(), 1);
  assert.equal(await pg.isVisible('#t-rodando'), true);
  await ctx.close();
});

test('por lado mostra o total; lb mostra o equivalente em kg', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#e-lados');
  assert.match(await pg.textContent('#e-conv'), /80 kg no total/);
  assert.match(await pg.textContent('#t-plano'), /40 kg\/lado × 8/);
  await pg.click('#e-lados'); await pg.click('#e-unidade');                                  // kg → lb: o mesmo peso, convertido
  assert.equal(await pg.inputValue('#e-carga'), '88,2');
  assert.equal(await pg.inputValue('#e-conv-in'), '40');
  assert.equal(await pg.textContent('#e-conv-u'), 'kg');
  await ctx.close();
});

test('lb com o kg ao lado, editável de 1 em 1 no peso e em cada série', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.tap('.slot >> nth=1'); await pg.click('#e-unidade');                               // cadeira flexora em lb (máquina em libras)
  await pg.fill('#e-carga', '50'); await pg.dispatchEvent('#e-carga', 'input');
  assert.equal(await pg.inputValue('#e-conv-in'), '22,7');                                  // 50 lb ≈ 22,7 kg
  await pg.click('#e-conv-ed [data-conv="1"]');                                             // 22,7 → 23 kg
  assert.equal(await pg.inputValue('#e-conv-in'), '23');
  assert.equal(await pg.inputValue('#e-carga'), '50,71');
  await pg.click('#e-conv-ed [data-conv="1"]');                                             // 23 → 24 kg
  assert.equal(await pg.inputValue('#e-conv-in'), '24');
  await pg.fill('#e-conv-in', '27'); await pg.dispatchEvent('#e-conv-in', 'input');          // digitado em kg
  assert.equal(await pg.inputValue('#e-carga'), '59,52');
  await pg.fill('#e-carga', '50'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('[data-linha="1"]');                                                       // 2ª série em lb com o kg ao lado
  assert.equal(await pg.inputValue('[data-aj-in="conv"]'), '20,4');
  await pg.click('[data-aj="conv"][data-d="1"]');                                           // 20,4 → 21 kg
  assert.equal(await pg.inputValue('[data-aj-in="conv"]'), '21');
  assert.match((await linhas(pg))[2], /^Série 246,3 lb × 10/);                             // [0] é o aquecimento
  assert.deepEqual(erros, []); await ctx.close();
});

test('trocar kg ↔ lb converte o histórico da variação', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.evaluate(() => { const v = db.exercicios[1].variacoes[0]; db.registros.push({ variacao: v.id, data: '2026-10-01', series: [{ kg: 23, reps: 12 }, { kg: 27, reps: 10 }] }); gravar(); });
  await pg.tap('.slot >> nth=1'); await pg.click('#e-unidade');
  assert.match(await pg.textContent('#e-historico'), /50,7\/59,5 lb/);                      // 23 e 27 kg em lb
  await pg.click('#e-unidade');                                                             // e volta
  assert.match(await pg.textContent('#e-historico'), /23\/27 kg/);
  await ctx.close();
});

test('falhei: marca a série sem mexer nas reps e mostra onde vem falhando', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita'); await pg.click('#t-feita');        // aquecimento, séries 1 e 2
  assert.equal(await pg.locator('[data-linha="0"] [data-aj="falha"]').count(), 0);         // fechada: sem editor
  await pg.click('[data-linha="1"]'); await pg.click('[data-aj="falha"]');                 // falhou na 2ª
  assert.equal(await pg.getAttribute('[data-aj="falha"]', 'aria-pressed'), 'true');
  assert.match(await pg.getAttribute('[data-linha="1"]', 'class'), /falhou/);
  assert.match(await pg.textContent('#e-salvo'), /× 8\/10✗/);                              // reps continuam 10
  assert.deepEqual(await pg.evaluate(() => db.registros[0].series[1]), { kg: 35, reps: 10, falha: true });
  await pg.click('#t-desfazer'); await pg.click('#t-feita');                                 // refaz a 2ª: a marca saiu com ela
  assert.equal(await pg.evaluate(() => db.registros[0].series[1].falha), undefined);
  await pg.click('[data-linha="1"]'); await pg.click('[data-aj="falha"]');
  await pg.reload(); await pg.waitForSelector('#v-exercicio:not([hidden])');               // fica salvo (preparar não apaga a marca)
  assert.match(await pg.textContent('#e-ultima'), /✗ Falhou em 1 de 1 · série 2/);
  await pg.click('[data-voltar]');
  assert.match(await pg.textContent('.slot >> nth=0'), /✗ Falhou na última/);
  assert.deepEqual(erros, []); await ctx.close();
});

test('"Se ajuste" nos últimos 7 s do descanso, na tela e na faixa de baixo', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-22T08:00:00') });
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita');                                    // série 1: descanso de 90 s
  assert.equal(await pg.isVisible('#t-ajuste'), false);
  await pg.clock.runFor(84000);                                                               // faltam 6 s
  assert.equal(await pg.isVisible('#t-ajuste'), true);
  await pg.click('[data-voltar]'); await pg.clock.runFor(300);                               // fora do exercício: a faixa avisa
  assert.match(await pg.textContent('#mini-n'), /^Se ajuste · Leg press/);
  assert.match(await pg.getAttribute('#mini', 'class'), /ajuste/);
  await pg.clock.runFor(7000);
  assert.equal(await pg.isVisible('#mini'), false);
  assert.deepEqual(erros, []); await ctx.close();
});

test('finalizar antes: o resumo mostra o que ficou de fora', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita');
  await pg.click('#e-finalizar');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-faltou'), /Ficou de fora: Cadeira flexora, Supino máquina, Puxada alta, Remada sentada máquina, Desenvolvimento máquina\./);
  await ctx.close();
});

test('modos de pirâmide e edição do peso de uma série futura', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=1'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('[data-modo="invertida"]');
  assert.deepEqual((await linhas(pg)).slice(1), ['Série 140 kg × 8', 'Série 235 kg × 10', 'Série 330 kg × 12']);
  await pg.click('[data-modo="reta"]');
  assert.deepEqual((await linhas(pg)).slice(1), ['Série 140 kg × 12', 'Série 240 kg × 12', 'Série 340 kg × 12']);
  await pg.click('[data-linha="2"]'); await pg.fill('[data-aj-in="kg"]', '37'); await pg.dispatchEvent('[data-aj-in="kg"]', 'change');
  assert.match((await linhas(pg))[3], /^Série 337 kg × 12/);
  await ctx.close();
});

test('última série já mostra o próximo (o descanso segue na faixa); no fim mostra o resumo', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.evaluate(() => { db.exercicios.forEach(e => { e.series = 1; }); });               // treino curto para o teste
  await pg.tap('.slot >> nth=4'); await pg.fill('#e-carga', '30'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita');                                    // aquecimento + série (a última)
  assert.equal(await pg.textContent('#e-nome'), 'Desenvolvimento máquina');                  // próximo que falta, na hora
  assert.equal(await pg.isVisible('#mini'), true);                                          // descanso do anterior na faixa de baixo
  assert.match(await pg.textContent('#mini-n'), /^Descanso · Remada sentada máquina/);
  for (const nome of ['Leg press 45°', 'Cadeira flexora', 'Supino máquina', 'Puxada alta']) {
    const antes = await pg.textContent('#e-nome');
    await pg.fill('#e-carga', '20'); await pg.dispatchEvent('#e-carga', 'input');
    for (let k = 0; k < 4 && await pg.textContent('#e-nome') === antes; k++) await pg.click('#t-feita');
    assert.equal(await pg.textContent('#e-nome'), nome);
  }
  await pg.fill('#e-carga', '20'); await pg.dispatchEvent('#e-carga', 'input');            // o último: sem próximo, fica no descanso
  while (await pg.isVisible('#t-parado')) await pg.click('#t-feita');
  await pg.click('#t-pular');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-tiles'), /6\/6/);
  await pg.click('#parabens-ok'); await pg.click('#v-fim [data-ir="inicio"]');
  assert.equal(await pg.isVisible('#i-treino'), false);                                      // treino fechado: só no histórico
  assert.deepEqual(erros, []); await ctx.close();
});

test('nº do aparelho e anotações ficam salvos', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=2');
  await pg.fill('#e-equip', '12'); await pg.click('#e-dicas summary'); await pg.fill('#e-nota', 'banco no furo 4');
  await pg.waitForTimeout(700);
  await pg.reload(); await pg.waitForSelector('#v-exercicio:not([hidden])');
  assert.equal(await pg.inputValue('#e-equip'), '12');
  assert.equal(await pg.inputValue('#e-nota'), 'banco no furo 4');
  assert.match(await pg.textContent('#e-guia'), /Banco na altura/);
  await ctx.close();
});

test('editar o horário do treino e ver calorias', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-21T19:00:00') });
  await pg.click('#i-corpo'); await pg.fill('#c-peso', '90'); await pg.click('#c-form button[type=submit]'); await pg.goBack();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.clock.fastForward('10:00'); await pg.click('#t-feita');
  await pg.click('#e-finalizar');
  await pg.waitForSelector('#v-fim:not([hidden])');
  await pg.click('#parabens-ok');
  await pg.click('[data-editar-treino]');                                                      // editar no resumo
  await pg.fill('#et-fim', '19:50'); await pg.click('[data-salvar-treino]');
  assert.match(await pg.textContent('#f-treino'), /19:00–19:50 · ~231 kcal/);              // 3,5 × basal 1.898 kcal/dia ÷ 24 × 50/60 h
  assert.deepEqual(erros, []); await ctx.close();
});

test('anotação digitada fica no exercício certo mesmo trocando rápido', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-equip', '7');
  await pg.evaluate(() => trocarExercicio(1));                                               // troca antes de 0,5 s
  await pg.waitForTimeout(700);
  const r = await pg.evaluate(() => db.exercicios.map(e => e.variacoes[0].equip || ''));
  assert.deepEqual(r.slice(0, 2), ['7', '']);
  await ctx.close();
});

test('um treino por dia: depois de finalizar, trava; dá para reabrir', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita');
  await pg.click('#e-finalizar'); await pg.click('#parabens-ok'); await pg.click('#v-fim [data-ir="inicio"]');
  await pg.tap('.slot >> nth=1');
  assert.equal(await pg.isVisible('#e-travado'), true);
  const antes = await pg.evaluate(() => T.series);
  await pg.click('#t-feita', { force: true });                                               // bloqueado
  assert.deepEqual(await pg.evaluate(() => T.series), antes);
  await pg.click('#e-travado [data-reabrir]');
  assert.equal(await pg.isVisible('#e-travado'), false);
  await pg.fill('#e-carga', '30'); await pg.dispatchEvent('#e-carga', 'input'); await pg.click('#t-feita');
  assert.equal(await pg.evaluate(() => db.treinos.length), 1);                               // continua o mesmo treino
  assert.deepEqual(erros, []); await ctx.close();
});

test('abrir o app e não treinar não trava o dia', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-21T18:00:00') });
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.clock.fastForward('40:00');                                                       // esteira, sem marcar série
  await pg.click('#t-feita');
  assert.equal(await pg.isVisible('#e-travado'), false);
  const t = await pg.evaluate(() => db.treinos.map(x => new Date(x.inicio).getHours() + ':' + new Date(x.inicio).getMinutes()));
  assert.deepEqual(t, ['18:40']);                                                           // começou de novo, sem 2º treino
  await ctx.close();
});

test('excluir um treino ao editar', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita');
  await pg.click('#e-finalizar'); await pg.click('#parabens-ok');
  await pg.click('[data-editar-treino]');
  await pg.click('[data-excluir-treino]'); await pg.click('[data-excluir-treino]');            // confirma
  assert.equal(await pg.evaluate(() => db.treinos.length + db.registros.length), 0);
  await pg.waitForSelector('#v-inicio:not([hidden])');
  assert.equal(await pg.locator('#i-semana [data-dia]').count(), 0);
  await pg.click('#toast-desfazer');
  assert.equal(await pg.evaluate(() => db.treinos.length), 1);
  await ctx.close();
});

test('não marca série sem peso (senão o treino não seria salvo)', async () => {
  const { ctx, pg } = await abrirApp();
  await pg.tap('.slot >> nth=0');
  await pg.click('#t-feita');
  assert.equal(await pg.locator('#t-plano li.ok').count(), 0);
  assert.match(await pg.textContent('#toast-msg'), /Coloque o peso/);
  await ctx.close();
});

test('treino finalizado sem séries salvas conta como feito e não é apagado ao abrir um exercício', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-21T20:00:00') });
  await pg.evaluate(() => { db.treinos.push({ inicio: new Date('2026-10-21T17:43').getTime(), fim: new Date('2026-10-21T18:37').getTime(), fechado: true }); gravar(); mostrar('inicio'); });
  assert.match(await pg.textContent('#i-cont'), /Treino feito/);
  assert.match(await pg.textContent('#i-semana .today'), /✓/);
  await pg.tap('.slot >> nth=0');
  assert.equal(await pg.isVisible('#e-travado'), true);
  await pg.goBack();
  assert.deepEqual(await pg.evaluate(() => [hhmm(db.treinos[0].inicio), hhmm(db.treinos[0].fim)]), ['17:43', '18:37']);   // não recomeçou a contagem
  assert.equal(await pg.evaluate(() => db.treinos.length), 1);
  assert.deepEqual(erros, []); await ctx.close();
});

test('lembrete da garrafinha ao abrir o 1º exercício do dia', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-23T17:00:00'), agua: true }); // sexta: vale em qualquer dia
  assert.equal(await pg.locator('#v-inicio .agua').count(), 0);                               // não fica na tela inicial
  await pg.tap('.slot >> nth=0');
  assert.equal(await pg.isVisible('#agua'), true);
  const caixa = await pg.locator('#agua').boundingBox();
  assert.deepEqual([caixa.x, caixa.y, caixa.width, caixa.height], [0, 0, 390, 844]);           // tela cheia
  assert.equal(await pg.getAttribute('#agua-x', 'aria-label'), 'Fechar');
  await pg.click('#agua-x');                                                                    // X só fecha
  assert.equal(await pg.isVisible('#agua'), false);
  await pg.evaluate(() => trocarExercicio(1));
  assert.equal(await pg.isVisible('#agua'), false);                                          // não volta a cada exercício
  await pg.reload(); await pg.waitForSelector('#v-exercicio:not([hidden])');
  assert.equal(await pg.isVisible('#agua'), true);                                           // começou de novo: volta
  await pg.click('#agua-ok');                                                                   // "Já peguei" vale o dia
  await pg.reload(); await pg.waitForSelector('#v-exercicio:not([hidden])');
  assert.equal(await pg.isVisible('#agua'), false);                                        // não volta no mesmo dia
  await ctx.close();
});

test('ver o resumo de um treino antigo', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-22T19:00:00') });
  await pg.evaluate(() => {
    db.registros.push({ variacao: db.exercicios[0].variacoes[0].id, data: '2026-10-21', series: [{ kg: 40, reps: 12 }, { kg: 45, reps: 10 }] });
    db.treinos.push({ inicio: new Date('2026-10-21T17:43').getTime(), fim: new Date('2026-10-21T18:37').getTime(), fechado: true });
    gravar(); mostrar('inicio');
  });
  await pg.click('#i-semana [data-dia="2026-10-21"]');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-titulo'), /Resumo do treino/);
  assert.match(await pg.textContent('#f-data'), /21 de outubro/);
  assert.match(await pg.textContent('#f-lista'), /Leg press 45°.*40\/45 kg.*12\/10/);
  assert.match(await pg.textContent('#f-tiles'), /54 min/);
  assert.equal(await pg.locator('#i-treinos, #v-treinos').count(), 0);                        // sem lista nem tela de histórico
  assert.deepEqual(erros, []); await ctx.close();
});

test('parabéns em tela cheia ao finalizar, com as conquistas ganhas no treino', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.tap('.slot >> nth=0'); await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita');
  await pg.click('#e-finalizar');
  await pg.waitForSelector('#parabens:not([hidden])');
  const caixa = await pg.locator('#parabens').boundingBox();
  assert.deepEqual([caixa.x, caixa.y, caixa.width, caixa.height], [0, 0, 390, 844]);
  assert.match(await pg.textContent('#parabens-info'), /1 exercício · \+60 pts/);
  assert.match(await pg.textContent('#parabens-ganhos'), /★ Primeiro treino/);
  assert.equal(await pg.locator('#parabens .fechar').count(), 0);                             // sem X: só "Ver resumo"
  await pg.click('#parabens-ok');
  assert.equal(await pg.isVisible('#parabens'), false);
  assert.equal(await pg.isVisible('#v-fim'), true);
  await pg.click('#v-fim [data-ir="inicio"]');
  await pg.click('#i-semana [data-dia]');                                                      // resumo pela semana: sem tela cheia
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.equal(await pg.isVisible('#parabens'), false);
  assert.deepEqual(erros, []); await ctx.close();
});

test('arrastar a semana para os lados e, no resumo, de um treino para o outro', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-22T19:00:00') });   // quinta
  await pg.evaluate(() => {
    for (const d of ['2026-10-08', '2026-10-15']) db.treinos.push({ inicio: new Date(d + 'T18:00').getTime(), fim: new Date(d + 'T19:00').getTime(), fechado: true });
    gravar(); mostrar('inicio');
  });
  const y = async sel => { const b = await pg.locator(sel).boundingBox(); return b.y + b.height / 2; };
  await arrastar(ctx, pg, 60, 330, await y('#i-semana'));                                     // para a direita: semana anterior
  assert.match(await pg.textContent('#i-msg'), /12\/10 a 18\/10/);
  await arrastar(ctx, pg, 60, 330, await y('.week-msg'));                                     // também pela linha de baixo
  assert.match(await pg.textContent('#i-msg'), /05\/10 a 11\/10/);
  await arrastar(ctx, pg, 60, 330, await y('#i-semana'));                                     // semana do 1º treino: para
  assert.match(await pg.textContent('#i-msg'), /05\/10 a 11\/10/);
  await arrastar(ctx, pg, 330, 60, await y('#i-semana'));                                     // para a esquerda: avança
  assert.match(await pg.textContent('#i-msg'), /12\/10 a 18\/10/);
  await pg.click('#i-semana [data-dia="2026-10-15"]');                                        // resumo de um treino
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-data'), /15 de outubro/);
  await arrastar(ctx, pg, 60, 330, 400);                                                      // para a direita: treino anterior
  assert.match(await pg.textContent('#f-data'), /8 de outubro/);
  assert.equal(await pg.isDisabled('#f-ant'), true);                                          // o 1º treino: para
  await arrastar(ctx, pg, 60, 330, 400);
  assert.match(await pg.textContent('#f-data'), /8 de outubro/);
  await pg.click('#f-prox');                                                                  // e os botões ‹ › fazem o mesmo
  assert.match(await pg.textContent('#f-data'), /15 de outubro/);
  assert.equal(await pg.isDisabled('#f-prox'), true);                                         // sem treino depois
  assert.deepEqual(erros, []); await ctx.close();
});

test('voltar as semanas até a do 1º treino', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-22T19:00:00') });   // quinta
  await pg.evaluate(() => { db.treinos.push({ inicio: new Date('2026-10-08T18:00').getTime(), fim: new Date('2026-10-08T19:00').getTime(), fechado: true }); gravar(); mostrar('inicio'); });
  assert.equal(await pg.isDisabled('#i-sem-prox'), true);                                     // já está na semana atual
  await pg.click('#i-sem-ant');
  assert.match(await pg.textContent('#i-msg'), /12\/10 a 18\/10/);
  await pg.click('#i-sem-ant');
  assert.match(await pg.textContent('#i-msg'), /05\/10 a 11\/10/);
  assert.equal(await pg.isDisabled('#i-sem-ant'), true);                                      // semana do 1º treino: para
  assert.match(await pg.textContent('#i-cont-semana'), /1\/2 fixos/);
  await pg.click('#i-semana [data-dia="2026-10-08"]');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-treino'), /18:00–19:00/);
  await pg.goBack(); await pg.click('#i-sem-prox'); await pg.click('#i-sem-prox');
  assert.match(await pg.textContent('#i-msg'), /Hoje é dia de treino fixo/);
  assert.deepEqual(erros, []); await ctx.close();
});
