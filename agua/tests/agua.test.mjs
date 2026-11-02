// Tela da Água no navegador, só o que precisa dela: o caminho principal (beber, tirar e a nuvem), os lembretes desenhados, a
// navegação entre dias (gestos, ‹ ›, ← → e o endereço), abrir sem internet e o layout no celular. As regras (bebidas, botões
// de ml, lembretes, envio com dois aparelhos, envio sem resposta, formato antigo, Esc, limite de tempo) são funções testadas
// sem navegador em funcoes.test.mjs e em ../../tests/regras-apps.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepararApp,
  abrirApp,
  novaNuvem,
  sincronizado,
  texto,
  DONO,
} from './helpers/app.mjs';

// Arrasto de lado com o dedo (eventos de toque na tela do app): dx > 0 = para a direita
const arrastar = (pg, sel, dx) =>
  pg.evaluate(
    ([sel, dx]) => {
      const el = document.querySelector(sel),
        toque = (x) => [
          new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 }),
        ];

      el.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: toque(150),
          changedTouches: toque(150),
          bubbles: true,
        })
      );
      el.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: toque(150 + dx),
          changedTouches: toque(150 + dx),
          bubbles: true,
        })
      );
      el.dispatchEvent(
        new TouchEvent('touchend', {
          touches: [],
          changedTouches: toque(150 + dx),
          bubbles: true,
        })
      );
    },
    [sel, dx]
  );

prepararApp();

const linhas = (pg) =>
  pg.$$eval('#b-lista li', (L) =>
    L.map((li) => li.textContent.replace(/\s+/g, ' ').trim())
  ); // a lista do dia (peça da base)

const beber = async (pg, ml) => {
  await pg.fill('#b-ml', String(ml));
  await pg.press('#b-ml', 'Enter');
};

const botoes = (pg) => pg.$$eval('#b-botoes button', (B) => B.map((b) => b.textContent));

test('beber: o ml digitado entra com o horário de agora e vira botão; suco conta só a água dele; tirar pede toque duplo; tudo vai para a nuvem', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp(); // segunda 19/10, 09:00

  assert.deepEqual(await botoes(pg), []); // sem quantidade fixa
  await beber(pg, 300);
  assert.equal(await texto(pg, '#t-ml'), '300');
  assert.deepEqual(await botoes(pg), ['300 ml']);
  await sincronizado(pg); // já foi para a nuvem: o que vem depois precisa ir também
  await pg.clock.fastForward('01:00:00');
  await pg.click('[data-ml="300"]'); // o botão repete o copo
  await pg.click('[data-bebida="suco"]');
  await beber(pg, 300); // suco: 300 × 88% = 264 ml de água
  await beber(pg, 500); // a escolha voltou para água
  assert.deepEqual(await linhas(pg), [
    '09:00 Água 300 ml ×',
    '10:00 Água 300 ml ×',
    '10:00 Suco 300 ml · 120 kcal 264 ml ×',
    '10:00 Água 500 ml ×',
  ]);
  assert.deepEqual(await botoes(pg), ['300 ml', '500 ml']);
  assert.equal(await texto(pg, '#t-ml'), '1.364');
  assert.equal(await pg.isVisible('#t-bateu'), true); // passou de 1.000 ml

  await pg.click('[data-tirar-agua="3"]'); // o 1º toque só arma o botão
  assert.equal((await linhas(pg)).length, 4);
  await pg.click('[data-tirar-agua="3"]'); // o 2º tira
  // a tela redesenha depois do clique: espera o valor novo em vez de ler na pressa (sob carga lia o antigo)
  await pg.waitForFunction(
    () => document.querySelector('#t-ml').textContent.trim() === '864'
  );
  assert.equal(await pg.isVisible('#t-bateu'), false);
  await beber(pg, 5000);
  assert.equal(await texto(pg, '#toast'), 'De 1 a 3.000 ml');
  await sincronizado(pg);
  assert.deepEqual(
    nuvem.tabelas.agua_dia.map((x) => [x.user_id, x.data, x.aguas]),
    [
      [
        DONO,
        '2026-10-19',
        [
          { hora: '09:00', ml: 300 },
          { hora: '10:00', ml: 300 },
          { hora: '10:00', ml: 264, bebida: 'suco', volume: 300 },
        ],
      ],
    ]
  );
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('lembretes desenhados: o atrasado da vez vira "Hora de beber água" e some ao beber; depois das 17h não chama mais', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-19T11:20:00-03:00') }); // segunda (casa)

  const classes = () =>
    pg.$$eval('#l-horas li', (L) => L.map((x) => x.className.replace(/^chip /, '')));

  assert.deepEqual(
    await pg.$$eval('#l-horas li', (L) => L.map((x) => x.textContent.trim())),
    ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']
  );
  assert.equal(await texto(pg, '#l-agora'), 'Hora de beber água (11:00)');
  assert.deepEqual(await classes(), [
    'atrasado',
    'atrasado vez',
    'depois',
    'depois',
    'depois',
    'depois',
    'depois',
  ]);
  await beber(pg, 250);
  assert.equal(await pg.isVisible('#l-agora'), false);
  assert.equal((await classes())[1], 'feito');
  assert.equal(await texto(pg, '#l-horas li:nth-child(2)'), '11:00 ✓');

  await pg.clock.fastForward('05:50:00'); // 17:10: o das 16:00 ficou atrasado, mas à noite ninguém chama para beber
  await pg.evaluate(() => desenhar());
  assert.equal(await pg.isVisible('#l-agora'), false);
  assert.equal((await classes())[6], 'atrasado');
  await ctx.close();
});

test('dias: dia anterior só leitura pelo endereço, ‹ ›, arrastar de lado e ← →; Hoje, Voltar e recarregar mantêm o dia no endereço', async () => {
  const nuvem = novaNuvem();

  nuvem.tabelas.agua_dia.push(
    { user_id: DONO, data: '2026-10-17', aguas: [{ hora: '10:00', ml: 500 }] },
    {
      user_id: DONO,
      data: '2026-10-18',
      aguas: [
        { hora: '10:00', ml: 300 },
        { hora: '12:27', ml: 132, bebida: 'suco', volume: 150 },
      ],
    }
  );
  const { ctx, pg, erros } = await abrirApp({ nuvem, busca: '?dia=2026-10-18' }); // aberto pela página inicial

  const t = (n) =>
    pg.waitForFunction(
      (x) => document.getElementById('t-ml').textContent === x,
      String(n)
    );

  const busca = () => pg.evaluate(() => location.search);

  await t(432);
  assert.equal(await texto(pg, '#dia-visto'), 'domingo, 18 de outubro · só leitura Hoje');

  for (const id of ['#lembretes', '#b-tipos', '#b-form', '#b-botoes'])
    assert.equal(await pg.isVisible(id), false, id);
  assert.equal(await pg.locator('#b-lista [data-tirar-agua]').count(), 0); // nada para tirar
  assert.deepEqual(await linhas(pg), [
    '10:00 Água 300 ml',
    '12:27 Suco 150 ml · 60 kcal 132 ml',
  ]);

  await arrastar(pg, '#v-agua', 150); // para a direita: o dia anterior
  assert.deepEqual(
    [await texto(pg, '#d-nome'), await texto(pg, '#t-ml')],
    ['sábado, 17/10', '500']
  );
  assert.equal(await pg.isDisabled('#d-ant'), true); // 1º dia com água
  assert.equal(await busca(), '?dia=2026-10-17');
  await arrastar(pg, '#v-agua', -150); // para a esquerda: o seguinte
  assert.equal(await texto(pg, '#d-nome'), 'Ontem');
  await pg.keyboard.press('ArrowRight');
  assert.equal(await texto(pg, '#d-nome'), 'Hoje');
  assert.equal(await pg.isDisabled('#d-prox'), true);
  assert.equal(await pg.isVisible('#b-form'), true); // hoje: dá para beber
  assert.equal(await busca(), '');
  await pg.keyboard.press('ArrowLeft');
  assert.equal(await texto(pg, '#d-nome'), 'Ontem');
  await pg.click('#d-prox');
  await pg.click('#semana [data-dia="2026-10-18"]'); // os Últimos 7 dias abrem o dia, com o ?dia
  await t(432);
  assert.equal(await busca(), '?dia=2026-10-18');
  await pg.goBack(); // Voltar do navegador: hoje
  await t(0);
  await pg.goForward();
  await t(432);
  await pg.reload();
  await pg.waitForSelector('#v-agua:not([hidden])'); // recarregar mantém o dia
  await t(432);
  await pg.click('#dia-hoje'); // Hoje: o app normal (o ?dia sai do endereço)
  await pg.waitForSelector('#b-form:not([hidden])');
  await t(0);
  assert.equal(await pg.isVisible('#dia-visto'), false);
  assert.equal(await busca(), '');
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('últimos 7 dias, sem internet (abre com a cópia e envia ao reconectar) e tabela ainda não criada', async () => {
  const nuvem = novaNuvem();

  nuvem.tabelas.agua_dia.push({
    user_id: DONO,
    data: '2026-10-18',
    aguas: [{ hora: '10:00', ml: 1200 }],
  });
  const { ctx, pg } = await abrirApp({ nuvem });

  assert.equal(await texto(pg, '#semana li:nth-child(2)'), 'Ontem 1.200 ml');
  await beber(pg, 300);
  await sincronizado(pg);
  nuvem.online = false;
  await pg.reload();
  await pg.waitForSelector('#v-agua:not([hidden])');
  assert.equal(await texto(pg, '#t-ml'), '300'); // cópia do aparelho
  await beber(pg, 200);
  await pg.waitForSelector('#sync:not([hidden])');
  nuvem.online = true;
  await pg.evaluate(() => enviar());
  await sincronizado(pg);
  assert.equal(
    nuvem.tabelas.agua_dia.find((x) => x.data === '2026-10-19').aguas.length,
    2
  );
  await ctx.close();
  const sem = novaNuvem();

  delete sem.tabelas.agua_dia; // migration ainda não aplicada: abre vazio, sem quebrar
  const b = await abrirApp({ nuvem: sem });

  assert.equal(await texto(b.pg, '#t-ml'), '0');
  assert.deepEqual(b.erros, []);
  await b.ctx.close();
});

test('outra conta não passa do login; tema escuro mesmo com o celular no modo claro; sem rolagem para o lado', async () => {
  const a = await abrirApp({ conta: 'outra-conta' });

  await a.pg.waitForFunction(() => document.getElementById('l-erro').textContent);
  assert.equal(await texto(a.pg, '#l-erro'), 'Esta conta não tem acesso.');
  await a.ctx.close();
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-19T11:20:00-03:00') });

  await pg.emulateMedia({ colorScheme: 'light' });
  assert.equal(
    await pg.evaluate(() => getComputedStyle(document.body).backgroundColor),
    'rgb(27, 30, 33)'
  );

  for (const ml of [150, 200, 250, 300, 350, 500]) await beber(pg, ml); // a linha cheia de botões
  assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await ctx.close();
});
