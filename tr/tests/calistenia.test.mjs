// Flexão, barra e antebraço no navegador: séries sem peso (corpo) e em segundos (pendurar), o plano por mês na tela e o cronômetro
// de segurar. As contas do plano (etapas, semanas, o que o plano escolhe) rodam como função em piramide.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, linhas, sincronizado } from './helpers/app.mjs';

prepararApp();

// Os três exercícios como a migration 07 grava (ids dos PLANOS de js/config.js)
const v = (id, nome, unidade, passo = 1) => ({ id, nome, unidade, passo });

const CALISTENIA = [
  {
    id: 'flexao',
    grupo: 'Flexão',
    regiao: 'Superior',
    series: 3,
    reps: 6,
    descanso: 60,
    modo: 'reta',
    variacoes: [
      v('flexao0', 'Flexão com joelhos apoiados', 'corpo'),
      v('flexao1', 'Flexão completa', 'corpo'),
      v('flexao2', '', 'corpo'),
    ],
  },
  {
    id: 'barrafix',
    grupo: 'Barra fixa',
    regiao: 'Superior',
    series: 3,
    reps: 15,
    descanso: 90,
    modo: 'reta',
    variacoes: [
      v('barrafx0', 'Pendurar na barra', 's'),
      v('barrafx1', 'Negativa na barra', 'corpo'),
      v('barrafx2', 'Barra fixa', 'corpo'),
    ],
  },
  {
    id: 'antebraco',
    grupo: 'Antebraço',
    regiao: 'Superior',
    series: 2,
    reps: 15,
    descanso: 45,
    modo: 'reta',
    variacoes: [
      v('antebr0', 'Rosca de punho com halteres', 'kg', 2),
      v('antebr1', 'Rosca de punho invertida com halteres', 'kg', 2),
      v('antebr2', '', 'kg', 2),
    ],
  },
];

async function abrirComCalistenia(relogio) {
  const a = await abrirApp({ relogio: new Date(relogio) });

  await a.pg.evaluate((X) => {
    db = preparar({ ...db, exercicios: [...db.exercicios, ...X] });
    gravar();
    ir('inicio');
  }, CALISTENIA);

  return a;
}

const texto = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ').trim();

test('flexão: sem campo de peso nem aquecimento, marca as séries só com reps e salva (kg 0) até na nuvem', async () => {
  const { ctx, pg, erros, nuvem } = await abrirComCalistenia('2026-10-28T19:00:00'); // quarta, 1º dia do plano

  assert.match(
    await texto(pg, '[data-ex="flexao"]'),
    /^Flexão · mês 1 ?Flexão com joelhos apoiados ?3 × 6 reps · 60 s/
  );
  await pg.click('[data-ex="flexao"]');
  assert.equal(await pg.isVisible('#e-carga'), false);
  assert.equal(await pg.isVisible('#e-variacoes'), false); // o plano escolhe a variação
  assert.equal(await pg.isVisible('#t-modos'), false);
  assert.match(await texto(pg, '#e-presc'), /^3 × 6 reps · descanso 60 s$/);
  assert.equal(
    await texto(pg, '#e-plano'),
    'Mês 1 de 3 · semana 1 · Flexão completa a partir de 28/11'
  );
  assert.deepEqual(await linhas(pg), ['Série 16 reps', 'Série 26 reps', 'Série 36 reps']); // sem aquecimento
  await pg.click('#t-feita');
  await pg.click('#t-feita');
  await pg.click('[data-linha="1"]');
  await pg.click('[data-aj="reps"][data-d="-1"]'); // 2ª série: deu 5
  assert.equal(await pg.locator('.linha-ed [data-aj="kg"]').count(), 0); // sem peso no editor da série
  await pg.click('#t-feita');
  assert.equal(await pg.textContent('#e-nome'), 'Pendurar na barra'); // última série: já foi para o próximo
  await pg.click('[data-voltar]');
  await pg.click('[data-ex="flexao"]');
  assert.equal(await texto(pg, '#e-salvo'), '✓ Salvo: 6/5/6 reps');
  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.tr_registro.map((r) => [r.variacao_id, r.series]),
    [
      [
        'flexao0',
        [
          { kg: 0, reps: 6 },
          { kg: 0, reps: 5 },
          { kg: 0, reps: 6 },
        ],
      ],
    ]
  );
  await pg.reload();
  await pg.waitForSelector('#v-exercicio:not([hidden])'); // reabre o exercício aberto, como sempre
  assert.equal(
    await pg.evaluate(() => db.registros.filter((r) => r.variacao === 'flexao0').length),
    1
  ); // a cópia do aparelho guarda o registro sem peso
  await pg.click('[data-voltar]');
  assert.match(
    await texto(pg, '[data-ex="flexao"]'),
    /✓ Feito hoje.*6reps ?6\/5\/6 · hoje/
  );
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('pendurar: o botão conta a série, "Soltei" marca os segundos que deu e no alvo marca sozinho', async () => {
  const { ctx, pg, erros } = await abrirComCalistenia('2026-10-28T19:00:00');

  await pg.click('[data-ex="barrafix"]');
  assert.equal(await pg.textContent('#e-nome'), 'Pendurar na barra');
  assert.match(await texto(pg, '#e-presc'), /^3 × 15 s · descanso 90 s$/);
  assert.equal(await pg.textContent('#t-feita'), 'Pendurar · 15 s');
  await pg.click('#t-feita'); // começa a segurar
  await pg.clock.fastForward('00:10');
  assert.equal(await pg.textContent('#t-feita'), 'Soltei · 10 s');
  assert.equal(await pg.textContent('#t-relogio'), '0:05');
  await pg.click('#t-feita'); // soltou antes: 10 s
  assert.equal(
    await pg.evaluate(() => T.feitas.barrafix.map((s) => s.reps)).then((x) => x.join()),
    '10'
  );
  assert.equal(await pg.isVisible('#t-rodando'), true); // e o descanso começou
  await pg.click('#t-feita'); // 2ª série: começar encerra o descanso
  await pg.clock.fastForward('00:16'); // passou do alvo: marca 15 sozinho
  assert.deepEqual(
    await pg.evaluate(() => T.feitas.barrafix.map((s) => s.reps)),
    [10, 15]
  );
  assert.equal(await texto(pg, '#e-salvo'), '✓ Salvo: 10/15 s');
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('no 2º mês a barra vira negativa e a flexão vira completa, com poucas reps', async () => {
  const { ctx, pg, erros } = await abrirComCalistenia('2026-12-02T19:00:00');

  assert.match(
    await texto(pg, '[data-ex="barrafix"]'),
    /^Barra fixa · mês 2 ?Negativa na barra ?3 × 3 reps · 90 s/
  );
  await pg.click('[data-ex="flexao"]');
  assert.equal(await pg.textContent('#e-nome'), 'Flexão completa');
  assert.equal(
    await texto(pg, '#e-plano'),
    'Mês 2 de 3 · semana 1 · mais reps a partir de 28/12'
  );
  assert.deepEqual(erros, []);
  await ctx.close();
});
