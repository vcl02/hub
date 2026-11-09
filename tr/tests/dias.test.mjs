// Navegação entre dias, semanas e treinos no Treino (no navegador): arrastar de lado, ‹ ›, ← → no computador, o resumo de
// um treino antigo e o ?dia aberto pela página inicial. O dia vizinho (anterior/seguinte) roda como função em sessao.test.mjs;
// o ?dia no endereço (diaDaUrl/diaNaUrl) em tests/repetidas.test.mjs da raiz. Separado de treino.test.mjs para os dois
// arquivos rodarem ao mesmo tempo (os gestos esperam a animação de verdade).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, app, abrirApp, arrastar, inicioDoRelogio } from './helpers/app.mjs';

prepararApp();

test('o relógio de teste nunca nasce no dia anterior: entre 00:00 e 00:05 a margem encolhe para o início do mesmo dia', async () => {
  const dia = (d) => new Date(d).getDate();

  for (const h of [
    '2026-10-22T00:02:00',
    '2026-10-22T00:00:30',
    '2026-10-22T00:04:59.999',
  ]) {
    const inicio = inicioDoRelogio(new Date(h));

    assert.equal(dia(inicio), 22, h);
    assert.ok(inicio <= new Date(h), h);
  }

  // longe da meia-noite, a margem cheia de 5 min
  assert.equal(
    new Date('2026-10-22T19:00:00') - inicioDoRelogio(new Date('2026-10-22T19:00:00')),
    5 * 60 * 1000
  );
  assert.equal(
    new Date('2026-10-22T00:05:00') - inicioDoRelogio(new Date('2026-10-22T00:05:00')),
    5 * 60 * 1000
  );

  // e o app aberto às 00:02 mostra o dia pedido como hoje (sem ?dia = hoje, não o dia anterior)
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-22T00:02:00') });

  assert.equal(await pg.evaluate(() => hoje()), '2026-10-22');
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('arrastar para nas pontas da lista', async () => {
  const { ctx, pg } = await abrirApp();

  await pg.tap('.slot >> nth=0');
  await arrastar(ctx, pg, 60, 330);
  assert.equal(await pg.textContent('#e-pos'), '1/6');

  for (let i = 0; i < 6; i++) await arrastar(ctx, pg, 330, 60);
  assert.equal(await pg.textContent('#e-pos'), '6/6');
  await ctx.close();
});

test('resumo de um treino antigo (tocando no ✓) e aberto pela página inicial (?dia=): só leitura, o dia no endereço; hoje continua normal', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-22T19:00:00') });

  await pg.evaluate(() => {
    db.registros.push({
      variacao: db.exercicios[0].variacoes[0].id,
      data: '2026-10-21',
      series: [
        { kg: 40, reps: 12 },
        { kg: 45, reps: 10 },
      ],
    });
    db.treinos.push({
      inicio: new Date('2026-10-21T17:43').getTime(),
      fim: new Date('2026-10-21T18:37').getTime(),
      fechado: true,
      cardio: {
        inicio: new Date('2026-10-21T18:40').getTime(),
        ms: 600000,
        vel: 6,
        incl: 0,
      },
    });
    gravar();
    mostrar('inicio');
  });
  await pg.click('#i-semana [data-dia="2026-10-21"]');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-titulo'), /Resumo do treino/);
  assert.match(await pg.textContent('#f-data'), /21 de outubro/);
  assert.match(await pg.textContent('#f-lista'), /Leg press 45°.*40\/45 kg.*12\/10/);
  assert.match(await pg.textContent('#f-tiles'), /54 min/);
  assert.equal(await pg.locator('#i-treinos, #v-treinos').count(), 0); // sem lista nem tela de histórico
  assert.equal(await pg.locator('#f-treino [data-editar-treino]').count(), 1); // pela semana, dá para editar

  // O hábito Treino da página inicial num dia anterior: o resumo daquele dia, só leitura
  await pg.goto(app.url + '?dia=2026-10-21');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-data'), /21 de outubro/);
  assert.match(await pg.textContent('#f-tiles'), /54 min/);
  assert.equal(await pg.locator('#f-treino [data-editar-treino]').count(), 0); // só leitura: sem Editar
  assert.equal(await pg.locator('#f-cardio [data-apagar-cardio]').count(), 0); // nem apagar o cardio
  assert.equal(await pg.evaluate(() => location.search), '?dia=2026-10-21'); // o dia no endereço
  await pg.click('#f-prox'); // › depois do último: a lista de hoje
  await pg.waitForSelector('#v-inicio:not([hidden])');
  assert.equal(await pg.evaluate(() => location.search), ''); // hoje: sem ?dia

  // Treino de hoje finalizado sem séries salvas conta como feito: a lista fica travada e o dia marcado
  await pg.evaluate(() => {
    db.treinos.push({
      inicio: new Date('2026-10-22T17:43').getTime(),
      fim: new Date('2026-10-22T18:37').getTime(),
      fechado: true,
    });
    gravar();
    mostrar('inicio');
  });
  assert.match(await pg.textContent('#i-cont'), /Treino feito/);
  assert.match(await pg.textContent('#i-semana .today'), /✓/);
  assert.match(await pg.textContent('.slot >> nth=0'), /Sem séries salvas hoje/);
  await pg.tap('.slot >> nth=0');
  assert.equal(await pg.isVisible('#e-travado'), true);
  await pg.goBack();
  assert.deepEqual(
    await pg.evaluate(() => [hhmm(db.treinos[1].inicio), hhmm(db.treinos[1].fim)]),
    ['17:43', '18:37']
  ); // abrir um exercício não recomeçou a contagem
  assert.equal(await pg.evaluate(() => db.treinos.length), 2);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('semanas, lista da tela inicial e resumo: para a direita o anterior, para a esquerda o seguinte (como em todo o hub)', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-22T19:00:00') }); // quinta

  await pg.evaluate(() => {
    for (const d of ['2026-10-08', '2026-10-15', '2026-10-21'])
      db.treinos.push({
        inicio: new Date(d + 'T18:00').getTime(),
        fim: new Date(d + 'T19:00').getTime(),
        fechado: true,
      });
    const v = db.exercicios[0].variacoes[0];

    db.registros.push({
      variacao: v.id,
      data: '2026-10-21',
      series: [
        { kg: 100, reps: 8 },
        { kg: 95, reps: 10, falha: true },
        { kg: 90, reps: 12 },
      ],
    });
    gravar();
    mostrar('inicio');
  });

  const y = async (sel) => {
    const b = await pg.locator(sel).boundingBox();

    return b.y + b.height / 2;
  };

  // Semanas: para a direita volta, para a esquerda avança
  await arrastar(ctx, pg, 60, 330, await y('#i-semana'));
  assert.match(await pg.textContent('#i-msg'), /12\/10 a 18\/10/);
  await arrastar(ctx, pg, 60, 330, await y('.week-msg')); // também pela linha de baixo
  assert.match(await pg.textContent('#i-msg'), /05\/10 a 11\/10/);
  await arrastar(ctx, pg, 60, 330, await y('#i-semana')); // semana do 1º treino: para
  assert.match(await pg.textContent('#i-msg'), /05\/10 a 11\/10/);
  await arrastar(ctx, pg, 330, 60, await y('#i-semana'));
  await arrastar(ctx, pg, 330, 60, await y('#i-semana'));
  assert.match(await pg.textContent('#i-msg'), /Hoje é dia de treino fixo/);
  // Lista de hoje: para a direita (como as semanas) mostra o treino de ontem aqui mesmo
  await arrastar(ctx, pg, 60, 330, await y('.slot >> nth=2'));
  assert.equal(await pg.isVisible('#v-inicio'), true);
  assert.equal(await pg.textContent('#i-cont-l'), 'Qua, 21/10');
  assert.equal(await pg.textContent('#i-cont'), '1/6');
  assert.match(
    await pg.textContent('.slot >> nth=0'),
    /✓ Feito[\s\S]*✗ Falhou[\s\S]*100kg[\s\S]*8\/10✗\/12 · 21\/10/
  );
  assert.match(await pg.textContent('.slot >> nth=1'), /Não feito/);
  assert.match(
    await pg.getAttribute('#i-semana [data-dia="2026-10-21"]', 'class'),
    /sel/
  ); // o dia fica marcado na semana
  await arrastar(ctx, pg, 60, 330, await y('.slot >> nth=2')); // o de antes: outra semana
  assert.equal(await pg.textContent('#i-cont-l'), 'Qui, 15/10');
  assert.match(await pg.textContent('#i-msg'), /12\/10 a 18\/10/);
  await arrastar(ctx, pg, 330, 60, await y('.slot >> nth=2')); // para a esquerda: 21
  assert.equal(await pg.textContent('#i-cont-l'), 'Qua, 21/10');
  await arrastar(ctx, pg, 330, 60, await y('.slot >> nth=2')); // e hoje
  assert.equal(await pg.textContent('#i-cont-l'), 'Registrados hoje');
  assert.equal(await pg.isVisible('#i-hoje'), false);
  await arrastar(ctx, pg, 60, 330, await y('.slot >> nth=2'));
  await pg.click('#i-hoje'); // "Hoje" volta direto
  assert.equal(await pg.textContent('#i-cont-l'), 'Registrados hoje');
  // Resumo de um dia (toque no ✓): ‹ › e arrastar vão de um treino para o outro; depois do mais recente, a lista de hoje
  await pg.click('#i-semana [data-dia="2026-10-21"]');
  await pg.waitForSelector('#v-fim:not([hidden])');
  await arrastar(ctx, pg, 60, 330, 400);
  assert.match(await pg.textContent('#f-data'), /15 de outubro/);
  await pg.click('#f-ant');
  assert.match(await pg.textContent('#f-data'), /8 de outubro/);
  assert.equal(await pg.isDisabled('#f-ant'), true);
  await arrastar(ctx, pg, 330, 60, 400);
  await arrastar(ctx, pg, 330, 60, 400);
  assert.match(await pg.textContent('#f-data'), /21 de outubro/);
  assert.equal(await pg.getAttribute('#f-prox', 'title'), 'Hoje');
  await arrastar(ctx, pg, 330, 60, 400);
  await pg.waitForSelector('#v-inicio:not([hidden])');
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('botões ‹ › das semanas até a do 1º treino, e ← → no computador (semana, treino anterior/seguinte no resumo e exercício)', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-22T19:00:00') }); // quinta

  await pg.evaluate(() => {
    for (const d of ['2026-10-08', '2026-10-15', '2026-10-21'])
      db.treinos.push({
        inicio: new Date(d + 'T18:00').getTime(),
        fim: new Date(d + 'T19:00').getTime(),
        fechado: true,
      });
    gravar();
    mostrar('inicio');
  });
  assert.equal(await pg.isDisabled('#i-sem-prox'), true); // já está na semana atual
  await pg.click('#i-sem-ant');
  assert.match(await pg.textContent('#i-msg'), /12\/10 a 18\/10/);
  await pg.click('#i-sem-ant');
  assert.match(await pg.textContent('#i-msg'), /05\/10 a 11\/10/);
  assert.equal(await pg.isDisabled('#i-sem-ant'), true); // semana do 1º treino: para
  assert.match(await pg.textContent('#i-cont-semana'), /1\/2 fixos/);
  await pg.click('#i-semana [data-dia="2026-10-08"]');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-treino'), /18:00–19:00/);
  await pg.goBack();
  await pg.click('#i-sem-prox');
  await pg.click('#i-sem-prox');
  assert.match(await pg.textContent('#i-msg'), /Hoje é dia de treino fixo/);

  await pg.keyboard.press('ArrowLeft');
  assert.match(await pg.textContent('#i-msg'), /12\/10 a 18\/10/);
  await pg.keyboard.press('ArrowRight');
  assert.match(await pg.textContent('#i-msg'), /Hoje é dia de treino fixo/);
  await pg.click('#i-semana [data-dia="2026-10-21"]');
  await pg.waitForSelector('#v-fim:not([hidden])');
  await pg.keyboard.press('ArrowLeft');
  assert.match(await pg.textContent('#f-data'), /15 de outubro/);
  await pg.keyboard.press('ArrowRight');
  assert.match(await pg.textContent('#f-data'), /21 de outubro/);
  await pg.click('#v-fim [data-ir="inicio"]');
  await pg.tap('.slot >> nth=0');
  await pg.keyboard.press('ArrowRight');
  assert.equal(await pg.textContent('#e-nome'), 'Cadeira flexora');
  await pg.keyboard.press('ArrowLeft');
  assert.equal(await pg.textContent('#e-nome'), 'Leg press 45°');
  await pg.focus('#e-carga');
  await pg.keyboard.press('ArrowRight'); // digitando o peso: a seta anda no texto
  assert.equal(await pg.textContent('#e-nome'), 'Leg press 45°');
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('relógio do helper: o tempo da página não anda sozinho (sem o relógio pausado os testes dependem da carga da máquina)', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-19T09:00:00-03:00') });
  const antes = await pg.evaluate(() => Date.now());

  await new Promise((ok) => setTimeout(ok, 1500)); // 1,5 s reais
  assert.equal(await pg.evaluate(() => Date.now()), antes);
  await pg.clock.runFor(800); // só anda quando o teste manda
  assert.equal(await pg.evaluate(() => Date.now()), antes + 800);
  await ctx.close();
});
