// Treino no navegador (Chromium, Supabase falso): os caminhos principais da tela, ligados aos dados. As contas e regras rodam como
// função, sem navegador: pirâmide, unidades e planos em piramide.test.mjs; aquecimento e séries do dia em piramide.test.mjs; o
// treino do dia (começa, fecha por inatividade, trava) em sessao.test.mjs; pontos, calorias e conquistas em pontos.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepararApp,
  abrirApp,
  linhas,
  novaNuvem,
  sincronizado,
} from './helpers/app.mjs';

prepararApp();

const digitar = async (pg, seletor, valor) => {
  await pg.fill(seletor, valor);
  await pg.dispatchEvent(seletor, 'input');
};

test('série a série: sem peso não marca, salva sozinho, ajusta reps, desfaz (toast e botão), "falhei" e continua depois de recarregar', async () => {
  const { ctx, pg, erros } = await abrirApp();

  await pg.tap('.slot >> nth=0');
  await pg.click('#t-feita');
  assert.equal(await pg.locator('#t-plano li.ok').count(), 0);
  assert.match(await pg.textContent('#toast-msg'), /Coloque o peso/); // sem peso o treino não seria salvo
  await digitar(pg, '#e-carga', '40');
  assert.equal(await pg.getAttribute('[data-modo="invertida"]', 'aria-checked'), 'true');
  assert.deepEqual(await linhas(pg), [
    'Aquecimento20 kg × 15',
    'Série 140 kg × 8',
    'Série 235 kg × 10',
    'Série 330 kg × 12',
  ]);
  assert.equal(await pg.textContent('#e-unidade'), 'kg');
  await pg.click('#t-feita'); // aquecimento: ainda nada salvo
  assert.match(await pg.textContent('#e-historico'), /Nenhum registro/);
  await pg.click('#t-feita');
  await pg.click('#t-feita'); // séries 1 e 2, sem esperar o descanso
  assert.match(await pg.textContent('#e-historico'), /40\/35 kg\s*× 8\/10/);
  await pg.click('[data-linha="1"]');
  await pg.click('[data-aj="reps"][data-d="-1"]'); // série 2: fez 9
  await pg.click('#t-feita'); // série 3: última, já vai pro próximo
  assert.equal(await pg.textContent('#e-nome'), 'Cadeira flexora');
  await pg.click('#toast-desfazer'); // toque duplo sem querer na série 3: volta pra ele
  assert.equal(await pg.textContent('#e-nome'), 'Leg press 45°');
  assert.match(await pg.textContent('#e-historico'), /40\/35 kg\s*× 8\/9(?!\/)/);
  assert.equal(await pg.locator('#t-plano li.ok').count(), 3);
  await pg.click('#t-desfazer'); // e o botão desfaz mais uma, a qualquer hora
  assert.equal(await pg.locator('#t-plano li.ok').count(), 2);
  assert.match(await pg.textContent('#e-historico'), /40 kg\s*× 8(?!\/)/);

  // falhei: marca a série sem mexer nas reps
  assert.equal(await pg.locator('[data-linha="0"] [data-aj="falha"]').count(), 0); // fechada: sem editor
  await pg.click('#t-feita'); // refaz a 2ª
  await pg.click('[data-linha="1"]');
  await pg.click('[data-aj="falha"]');
  assert.equal(await pg.getAttribute('[data-aj="falha"]', 'aria-pressed'), 'true');
  assert.match(await pg.getAttribute('[data-linha="1"]', 'class'), /falhou/);
  assert.match(await pg.textContent('#e-salvo'), /× 8\/10✗/); // as reps continuam
  assert.deepEqual(await pg.evaluate(() => db.registros[0].series[1]), {
    kg: 35,
    reps: 10,
    falha: true,
  });
  await pg.click('#t-desfazer');
  await pg.click('#t-feita'); // refaz a 2ª: a marca saiu com ela
  assert.equal(await pg.evaluate(() => db.registros[0].series[1].falha), undefined);
  await pg.click('[data-linha="1"]');
  await pg.click('[data-aj="falha"]');

  // recarregar mantém as séries do dia, o peso e a marca de falha (preparar não apaga)
  await pg.reload();
  await pg.waitForSelector('#v-exercicio:not([hidden])');
  assert.equal(await pg.inputValue('#e-carga'), '40');
  assert.equal(await pg.locator('#t-plano li.ok').count(), 3);
  assert.equal(await pg.isVisible('#t-rodando'), true);
  assert.match(await pg.textContent('#e-ultima'), /✗ Falhou em 1 de 1 · série 2/);
  await pg.click('[data-voltar]');
  assert.match(await pg.textContent('.slot >> nth=0'), /✗ Falhou na última/);

  // peso trocado depois das séries atualiza o registro; trocar de variação não duplica
  await pg.tap('.slot >> nth=0');
  await digitar(pg, '#e-carga', '42,5');
  assert.match(await pg.textContent('#e-salvo'), /42,5\/37,5 kg/);
  await pg.click('[data-var="1"]'); // trocou para o substituto
  assert.equal(
    await pg.evaluate(() => db.registros.filter((r) => r.data === hoje()).length),
    1
  );
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('finalizar: parabéns em tela cheia, o que ficou de fora, pontos, editar o horário (calorias), um treino por dia e excluir', async () => {
  const nuvem = novaNuvem();

  nuvem.tabelas.corpo_medida.push({
    user_id: 'x',
    data: '2026-10-21',
    hora: '07:00',
    peso: '90',
    cintura: null,
  }); // pesagem do app Corpo

  const { ctx, pg, erros } = await abrirApp({
    relogio: new Date('2026-10-21T19:00:00'), // quarta: sem o bônus de dia extra (segunda)
    nuvem,
  });

  await pg.tap('.slot >> nth=0');
  await digitar(pg, '#e-carga', '40');
  await pg.clock.fastForward('10:00');
  await pg.click('#t-feita');
  await pg.click('#t-feita');
  await pg.click('#e-finalizar');
  await pg.waitForSelector('#parabens:not([hidden])');
  const caixa = await pg.locator('#parabens').boundingBox();

  assert.deepEqual([caixa.x, caixa.y, caixa.width, caixa.height], [0, 0, 390, 844]); // tela cheia no celular
  assert.match(await pg.textContent('#parabens-info'), /1 exercício · \+60 pts/);
  assert.match(await pg.textContent('#parabens-ganhos'), /★ Primeiro treino/);
  assert.equal(await pg.locator('#parabens .fechar').count(), 0); // sem X: só "Ver resumo"
  assert.match(
    await pg.textContent('#f-faltou'),
    /Ficou de fora: Cadeira flexora, Supino máquina, Puxada alta, Remada sentada máquina, Desenvolvimento máquina\./
  );
  await pg.click('#parabens-ok');
  assert.equal(await pg.isVisible('#parabens'), false);
  assert.equal(await pg.isVisible('#v-fim'), true);

  // editar o horário do treino: as calorias acompanham (3,5 × basal 1.898 kcal/dia ÷ 24 × 50/60 h)
  await pg.click('[data-editar-treino]');
  await pg.fill('#et-fim', '19:50');
  await pg.click('[data-salvar-treino]');
  assert.match(await pg.textContent('#f-treino'), /19:00–19:50 · ~231 kcal/);

  // placar e conquistas na tela
  await pg.click('#v-fim [data-ir="inicio"]');
  assert.equal(await pg.textContent('#g-pts'), '60 pts'); // 50 treino + 10 exercício
  await pg.click('#i-semana [data-dia]'); // resumo pela semana: sem tela cheia
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.equal(await pg.isVisible('#parabens'), false);
  await pg.click('#v-fim [data-ir="inicio"]');
  await pg.click('.game');
  assert.match(await pg.textContent('#q-lista li.on'), /Primeiro treino/);
  assert.equal(await pg.locator('#q-lista li.q-ano').count(), 5); // os 5 anos de longo prazo
  assert.equal(await pg.locator('#q-lista li:not(.q-ano)').count(), 33); // sem as de pesagem, que saíram com ela para o Corpo
  await pg.goBack();

  // um treino por dia: depois de finalizar, trava; dá para reabrir
  await pg.tap('.slot >> nth=1');
  assert.equal(await pg.isVisible('#e-travado'), true);
  const antes = await pg.evaluate(() => T.series);

  await pg.click('#t-feita', { force: true }); // bloqueado
  assert.deepEqual(await pg.evaluate(() => T.series), antes);
  await pg.click('#e-travado [data-reabrir]');
  assert.equal(await pg.isVisible('#e-travado'), false);
  await digitar(pg, '#e-carga', '30');
  await pg.click('#t-feita');
  assert.equal(await pg.evaluate(() => db.treinos.length), 1); // continua o mesmo treino

  // excluir o treino ao editar, com Desfazer
  await pg.click('#e-finalizar');
  await pg.click('#parabens-ok');
  await pg.click('[data-editar-treino]');
  await pg.click('[data-excluir-treino]');
  await pg.click('[data-excluir-treino]'); // confirma
  assert.equal(await pg.evaluate(() => db.treinos.length + db.registros.length), 0);
  await pg.waitForSelector('#v-inicio:not([hidden])');
  assert.equal(await pg.locator('#i-semana [data-dia]').count(), 0);
  await pg.click('#toast-desfazer');
  assert.equal(await pg.evaluate(() => db.treinos.length), 1);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('peso na tela: por lado, kg ↔ lb com o kg ao lado (peso e série), histórico convertido, modos e peso de uma série futura', async () => {
  const { ctx, pg, erros } = await abrirApp();

  await pg.evaluate(() => {
    const v = db.exercicios[1].variacoes[0];

    db.registros.push({
      variacao: v.id,
      data: '2026-10-01',
      series: [
        { kg: 23, reps: 12 },
        { kg: 27, reps: 10 },
      ],
    });
    gravar();
  });

  // por lado mostra o total
  await pg.tap('.slot >> nth=0');
  await digitar(pg, '#e-carga', '40');
  await pg.click('#e-lados');
  assert.match(await pg.textContent('#e-conv'), /80 kg no total/);
  assert.match(await pg.textContent('#t-plano'), /40 kg\/lado × 8/);
  await pg.click('#e-lados');
  await pg.click('#e-unidade'); // kg → lb: o mesmo peso, convertido
  assert.equal(await pg.inputValue('#e-carga'), '88,2');
  assert.equal(await pg.inputValue('#e-conv-in'), '40');
  assert.equal(await pg.textContent('#e-conv-u'), 'kg');
  await pg.click('#e-unidade'); // e volta
  await pg.click('[data-voltar]');

  // trocar kg ↔ lb converte o histórico da variação
  await pg.tap('.slot >> nth=1');
  await pg.click('#e-unidade');
  assert.match(await pg.textContent('#e-historico'), /50,7\/59,5 lb/); // 23 e 27 kg em lb
  await pg.click('#e-unidade');
  assert.match(await pg.textContent('#e-historico'), /23\/27 kg/);

  // lb com o kg ao lado, editável de 1 em 1 no peso e em cada série
  await pg.click('#e-unidade'); // cadeira flexora em lb (máquina em libras)
  await digitar(pg, '#e-carga', '50');
  assert.equal(await pg.inputValue('#e-conv-in'), '22,7'); // 50 lb ≈ 22,7 kg
  await pg.click('#e-conv-ed [data-conv="1"]'); // 22,7 → 23 kg
  assert.equal(await pg.inputValue('#e-conv-in'), '23');
  assert.equal(await pg.inputValue('#e-carga'), '50,71');
  await pg.click('#e-conv-ed [data-conv="1"]'); // 23 → 24 kg
  assert.equal(await pg.inputValue('#e-conv-in'), '24');
  await digitar(pg, '#e-conv-in', '27'); // digitado em kg
  assert.equal(await pg.inputValue('#e-carga'), '59,52');
  await digitar(pg, '#e-carga', '50');
  await pg.click('[data-linha="1"]'); // 2ª série em lb com o kg ao lado
  assert.equal(await pg.inputValue('[data-aj-in="conv"]'), '20,4');
  await pg.click('[data-aj="conv"][data-d="1"]'); // 20,4 → 21 kg
  assert.equal(await pg.inputValue('[data-aj-in="conv"]'), '21');
  assert.match((await linhas(pg))[2], /^Série 246,3 lb × 10/); // [0] é o aquecimento

  // modos de pirâmide e edição do peso de uma série futura
  await pg.click('#e-unidade'); // de volta a kg
  await digitar(pg, '#e-carga', '40');
  await pg.click('[data-modo="reta"]');
  assert.deepEqual((await linhas(pg)).slice(1), [
    'Série 140 kg × 12',
    'Série 240 kg × 12',
    'Série 340 kg × 12',
  ]);
  await pg.click('[data-modo="invertida"]');
  assert.deepEqual((await linhas(pg)).slice(1), [
    'Série 140 kg × 8',
    'Série 235 kg × 10',
    'Série 330 kg × 12',
  ]);
  await pg.click('[data-modo="reta"]');
  await pg.click('[data-linha="2"]');
  await pg.fill('[data-aj-in="kg"]', '37');
  await pg.dispatchEvent('[data-aj-in="kg"]', 'change');
  assert.match((await linhas(pg))[3], /^Série 337 kg × 12/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('"Se ajuste" nos últimos 7 s do descanso, na tela e na faixa de baixo', async () => {
  const { ctx, pg, erros } = await abrirApp({ relogio: new Date('2026-10-22T08:00:00') });

  await pg.tap('.slot >> nth=0');
  await digitar(pg, '#e-carga', '40');
  await pg.click('#t-feita');
  await pg.click('#t-feita'); // série 1: descanso de 90 s
  assert.equal(await pg.isVisible('#t-ajuste'), false);
  await pg.clock.runFor(84000); // faltam 6 s
  assert.equal(await pg.isVisible('#t-ajuste'), true);
  await pg.click('[data-voltar]');
  await pg.clock.runFor(300); // fora do exercício: a faixa avisa
  assert.match(await pg.textContent('#mini-n'), /^Se ajuste · Leg press/);
  assert.match(await pg.getAttribute('#mini', 'class'), /ajuste/);
  await pg.clock.runFor(7000);
  assert.equal(await pg.isVisible('#mini'), false);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('última série já mostra o próximo (o descanso segue na faixa); no fim mostra o resumo', async () => {
  const { ctx, pg, erros } = await abrirApp();

  await pg.evaluate(() => {
    db.exercicios.forEach((e) => {
      e.series = 1;
    });
  }); // treino curto para o teste
  await pg.tap('.slot >> nth=4');
  await digitar(pg, '#e-carga', '30');
  await pg.click('#t-feita');
  await pg.click('#t-feita'); // aquecimento + série (a última)
  assert.equal(await pg.textContent('#e-nome'), 'Desenvolvimento máquina'); // próximo que falta, na hora
  assert.equal(await pg.isVisible('#mini'), true); // descanso do anterior na faixa de baixo
  assert.match(await pg.textContent('#mini-n'), /^Descanso · Remada sentada máquina/);

  for (const nome of [
    'Leg press 45°',
    'Cadeira flexora',
    'Supino máquina',
    'Puxada alta',
  ]) {
    const antes = await pg.textContent('#e-nome');

    await digitar(pg, '#e-carga', '20');

    for (let k = 0; k < 4 && (await pg.textContent('#e-nome')) === antes; k++)
      await pg.click('#t-feita');
    assert.equal(await pg.textContent('#e-nome'), nome);
  }

  await digitar(pg, '#e-carga', '20'); // o último: sem próximo, fica no descanso

  while (await pg.isVisible('#t-parado')) await pg.click('#t-feita');
  await pg.click('#t-pular');
  await pg.waitForSelector('#v-fim:not([hidden])');
  assert.match(await pg.textContent('#f-tiles'), /6\/6/);
  await pg.click('#parabens-ok');
  await pg.click('#v-fim [data-ir="inicio"]');
  assert.equal(await pg.isVisible('#i-treino'), false); // treino fechado: só no histórico
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('nº do aparelho e anotações ficam salvos (e no exercício certo, mesmo trocando antes do 0,5 s)', async () => {
  const { ctx, pg } = await abrirApp();

  await pg.tap('.slot >> nth=0');
  await pg.fill('#e-equip', '7');
  await pg.evaluate(() => trocarExercicio(1)); // troca antes de 0,5 s
  await pg.waitForFunction(() => db.exercicios[0].variacoes[0].equip === '7'); // salvou no exercício em que foi digitado
  assert.deepEqual(
    (await pg.evaluate(() => db.exercicios.map((e) => e.variacoes[0].equip || ''))).slice(
      0,
      2
    ),
    ['7', '']
  );

  await pg.click('[data-voltar]');
  await pg.tap('.slot >> nth=2');
  await pg.fill('#e-equip', '12');
  await pg.click('#e-dicas summary');
  await pg.fill('#e-nota', 'banco no furo 4');
  await pg.waitForFunction(
    () =>
      db.exercicios[2].variacoes[0].equip === '12' &&
      db.exercicios[2].variacoes[0].nota === 'banco no furo 4'
  ); // salvou (0,5 s depois de parar de digitar)
  await pg.reload();
  await pg.waitForSelector('#v-exercicio:not([hidden])');
  assert.equal(await pg.inputValue('#e-equip'), '12');
  assert.equal(await pg.inputValue('#e-nota'), 'banco no furo 4');
  assert.match(await pg.textContent('#e-guia'), /Banco na altura/);
  await ctx.close();
});

test('lembrete da garrafinha ao abrir o 1º exercício do dia', async () => {
  const { ctx, pg } = await abrirApp({
    relogio: new Date('2026-10-23T17:00:00'),
    agua: true,
  }); // sexta: vale em qualquer dia

  assert.equal(await pg.locator('#v-inicio .agua').count(), 0); // não fica na tela inicial
  await pg.tap('.slot >> nth=0');
  assert.equal(await pg.isVisible('#agua'), true);
  const caixa = await pg.locator('#agua').boundingBox();

  assert.deepEqual([caixa.x, caixa.y, caixa.width, caixa.height], [0, 0, 390, 844]); // tela cheia
  assert.equal(await pg.getAttribute('#agua-x', 'aria-label'), 'Fechar');
  await pg.click('#agua-x'); // X só fecha
  assert.equal(await pg.isVisible('#agua'), false);
  await pg.evaluate(() => trocarExercicio(1));
  assert.equal(await pg.isVisible('#agua'), false); // não volta a cada exercício
  await pg.reload();
  await pg.waitForSelector('#v-exercicio:not([hidden])');
  assert.equal(await pg.isVisible('#agua'), true); // começou de novo: volta
  await pg.click('#agua-ok'); // "Já peguei" vale o dia
  await pg.reload();
  await pg.waitForSelector('#v-exercicio:not([hidden])');
  assert.equal(await pg.isVisible('#agua'), false); // não volta no mesmo dia
  await ctx.close();
});

// Recarrega com a busca da nuvem segurada (a tela abre com a cópia do aparelho) e devolve a função que solta a nuvem e espera o
// redesenho que ela traz (mostrar a tela de novo): a chegada da nuvem entre o 1º e o 2º toque, como no al (al/tests/dia.test.mjs)
async function recarregarComNuvemSegurada(pg, tela) {
  let soltar;
  const porta = new Promise((ok) => (soltar = ok));

  await pg.route(/supabase\.co\/rest\/v1\//, async (rota) => {
    if (rota.request().method() === 'GET') await porta;
    await rota.fallback(); // segue para a nuvem falsa do helper
  });
  await pg.reload();
  await pg.waitForSelector(`${tela}:not([hidden])`);
  await pg.evaluate(() => {
    window.redesenhos = 0;
    const original = mostrar;

    window.mostrar = function (...args) {
      window.redesenhos++;

      return original.apply(this, args);
    };
  });

  return async () => {
    soltar();
    await pg.waitForFunction(() => window.redesenhos > 0);
  };
}

test('Apagar do histórico: a nuvem traz um registro antes do armado e o 2º toque apaga o armado, não o vizinho; o que sumiu não apaga nada', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp({
    relogio: new Date('2026-10-21T19:00:00'),
  });

  const datas = () =>
    pg.$$eval('#e-historico [data-apagar]', (B) => B.map((b) => b.dataset.apagar));

  const armados = () =>
    pg.$$eval('#e-historico [data-apagar]', (B) =>
      B.map((b) => b.classList.contains('armado'))
    );

  await pg.tap('.slot >> nth=0');
  await pg.evaluate(() => {
    const vid = exAtual().variacoes[exAtual().ativo].id;

    for (const data of ['2026-10-10', '2026-10-15'])
      db.registros.push({ variacao: vid, data, series: [{ kg: 40, reps: 8 }] });
    gravar();
    telas.exercicio();
  });
  await sincronizado(pg);
  nuvem.tabelas.tr_registro.push({
    ...nuvem.tabelas.tr_registro.find((r) => r.data === '2026-10-10'),
    data: '2026-10-12',
  }); // outro aparelho lançou um registro entre os dois
  const chegada = await recarregarComNuvemSegurada(pg, '#v-exercicio');

  assert.deepEqual(await datas(), ['2026-10-15', '2026-10-10']);
  await pg.click('#e-historico [data-apagar] >> nth=1'); // arma o 10/10
  await chegada();
  assert.deepEqual(await datas(), ['2026-10-15', '2026-10-12', '2026-10-10']);
  assert.deepEqual(await armados(), [false, false, true]); // o armado andou com o 10/10, não ficou na posição 1
  await pg.click('#e-historico [data-apagar] >> nth=2'); // 2º toque no 10/10: apaga
  assert.deepEqual(await datas(), ['2026-10-15', '2026-10-12']);
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.tr_registro.map((r) => r.data).sort(), [
    '2026-10-12',
    '2026-10-15',
  ]);

  // O registro armado some dos dados antes do 2º toque (a lista ainda com o botão dele): não apaga nada, sem aviso nem Desfazer
  await pg.evaluate(() => {
    window.avisos = [];
    const original = toast;

    window.toast = (...a) => (avisos.push(a[0]), original(...a));
  });
  await pg.click('#e-historico [data-apagar] >> nth=0'); // arma o 15/10
  await pg.evaluate(() => {
    db.registros = db.registros.filter((r) => r.data !== '2026-10-15');
  });
  await pg.click('#e-historico [data-apagar] >> nth=0');
  assert.deepEqual(await pg.evaluate(() => db.registros.map((r) => r.data)), [
    '2026-10-12',
  ]);
  assert.deepEqual(await pg.evaluate(() => avisos), []);

  // Excluir treino (na edição da linha): o treino armado some antes do 2º toque; não exclui nada nem quebra
  await pg.evaluate(() => {
    db.treinos.push({
      inicio: new Date('2026-10-20T18:00:00').getTime(),
      fim: new Date('2026-10-20T19:00:00').getTime(),
      fechado: true,
    });
    gravar();
  });
  await pg.click('#v-exercicio .back');
  await pg.click('#i-semana [data-dia="2026-10-20"]');
  await pg.click('[data-editar-treino]');
  await pg.click('[data-excluir-treino]'); // arma
  await pg.evaluate(() => {
    db.treinos = [];
  });
  await pg.click('[data-excluir-treino]');
  assert.deepEqual(await pg.evaluate(() => db.registros.map((r) => r.data)), [
    '2026-10-12',
  ]); // nada saiu
  assert.deepEqual(await pg.evaluate(() => avisos), []);
  assert.deepEqual(erros, []);
  await ctx.close();
});
