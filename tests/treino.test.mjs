// Treino: pirâmide, séries, aquecimento, tempo, um treino por dia, resumo e lembrete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, arrastar, linhas } from './helpers/app.mjs';

prepararApp();

test('pirâmide usa o passo da máquina e começa com aquecimento', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.tap('.slot >> nth=0');
  await pg.fill('#e-carga', '40'); await pg.dispatchEvent('#e-carga', 'input');
  assert.deepEqual(await linhas(pg), ['Aquecimento20 kg × 15', 'Série 140 kg × 12', 'Série 245 kg × 10', 'Série 350 kg × 8']);
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
  assert.match(await pg.textContent('#e-historico'), /40\/45 kg\s*× 12\/10/);
  await pg.click('[data-linha="1"]'); await pg.click('[data-aj="reps"][data-d="-1"]');     // série 2: fez 9
  await pg.click('#t-feita');                                                                // série 3
  assert.match(await pg.textContent('#e-salvo'), /Salvo: 40\/45\/50 kg × 12\/9\/8/);
  await pg.click('#toast-desfazer');                                                         // toque duplo sem querer na série 3
  assert.match(await pg.textContent('#e-historico'), /40\/45 kg\s*× 12\/9(?!\/)/);
  assert.equal(await pg.locator('#t-plano li.ok').count(), 3);
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
  assert.match(await pg.textContent('#i-treino'), /19:00–19:25.*25 min/);
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
  assert.match(await pg.textContent('#t-plano'), /40 kg\/lado × 12/);
  await pg.click('#e-lados'); await pg.click('#e-unidade');                                  // kg → lb
  assert.match(await pg.textContent('#e-conv'), /≈ 18,1 kg/);
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

test('depois do último descanso vai para o próximo; no fim mostra o resumo', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.evaluate(() => { db.exercicios.forEach(e => { e.series = 1; }); });               // treino curto para o teste
  await pg.tap('.slot >> nth=4'); await pg.fill('#e-carga', '30'); await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita'); await pg.click('#t-feita'); await pg.click('#t-pular');        // aquecimento + série + pula o descanso
  assert.equal(await pg.textContent('#e-nome'), 'Desenvolvimento máquina');                  // próximo que falta
  for (const nome of ['Leg press 45°', 'Cadeira flexora', 'Supino máquina', 'Puxada alta']) {
    await pg.fill('#e-carga', '20'); await pg.dispatchEvent('#e-carga', 'input');
    while (await pg.isVisible('#t-parado')) await pg.click('#t-feita');
    await pg.click('#t-pular');
    if (nome !== 'Puxada alta') assert.equal(await pg.textContent('#e-nome'), nome);
  }
  await pg.fill('#e-carga', '20'); await pg.dispatchEvent('#e-carga', 'input');
  while (await pg.isVisible('#t-parado')) await pg.click('#t-feita');
  await pg.click('#t-pular');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-tiles'), /6\/6/);
  await pg.click('#parabens-ok'); await pg.click('#v-fim [data-ir="inicio"]');
  assert.match(await pg.textContent('#i-treino'), /Último treino/);                           // treino fechado
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
  await pg.click('#parabens-ok'); await pg.click('#v-fim [data-ir="inicio"]');
  await pg.click('[data-editar-treino]');
  await pg.fill('#et-fim', '19:50'); await pg.click('[data-salvar-treino]');
  assert.match(await pg.textContent('#i-treinos'), /19:00–19:50 · ~231 kcal/);              // 3,5 × basal 1.898 kcal/dia ÷ 24 × 50/60 h
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
  await pg.click('#e-finalizar'); await pg.click('#parabens-ok'); await pg.click('#v-fim [data-ir="inicio"]');
  await pg.click('[data-editar-treino]');
  await pg.click('[data-excluir-treino]'); await pg.click('[data-excluir-treino]');            // confirma
  assert.equal(await pg.evaluate(() => db.treinos.length + db.registros.length), 0);
  assert.equal(await pg.isVisible('#i-hist-box'), false);
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
  assert.match(await pg.textContent('#i-treino'), /17:43–18:37/);                            // não recomeçou a contagem
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
  await pg.click('#i-treinos li[data-dia="2026-10-21"]');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-titulo'), /Resumo do treino/);
  assert.match(await pg.textContent('#f-data'), /21 de outubro/);
  assert.match(await pg.textContent('#f-lista'), /Leg press 45°.*40\/45 kg.*12\/10/);
  assert.match(await pg.textContent('#f-tiles'), /54 min/);
  await pg.goBack();
  await pg.click('[data-ir="treinos"]');
  assert.match(await pg.textContent('#t-dias'), /Qua 21\/10.*1 exercício.*54 min/);
  await pg.goBack();
  await pg.click('#i-semana [data-dia="2026-10-21"]');                                       // dia feito na semana também abre
  await pg.waitForSelector('#v-fim:not([hidden])');
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
  await pg.click('#i-treinos li[data-dia]');                                                   // resumo de dia antigo: sem tela cheia
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.equal(await pg.isVisible('#parabens'), false);
  assert.deepEqual(erros, []); await ctx.close();
});
