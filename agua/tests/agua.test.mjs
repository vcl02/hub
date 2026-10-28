// Tela da Água no navegador: beber (ml digitado vira botão), meta, lembretes por tipo de dia, 7 dias e nuvem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, novaNuvem, sincronizado, texto, DONO } from './helpers/app.mjs';

prepararApp();

const beber = async (pg, ml) => { await pg.fill('#b-ml', String(ml)); await pg.press('#b-ml', 'Enter'); };
const etiquetas = (pg, sel) => pg.$$eval(`${sel} li`, L => L.map(x => x.textContent.trim()));

test('beber: ml digitado entra com o horário de agora e vira botão; botões pelas quantidades mais usadas; meta de 1 L', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();                     // segunda 19/10, 09:00
  assert.equal(await pg.locator('#b-botoes li').count(), 0);              // sem quantidade fixa
  await beber(pg, 300);
  assert.equal(await texto(pg, '#t-ml'), '300');
  assert.deepEqual(await pg.$$eval('#b-botoes button', B => B.map(b => b.textContent)), ['300 ml']);
  await sincronizado(pg);                                                  // já foi para a nuvem: o que vem depois precisa ir também
  await pg.clock.fastForward('01:00:00');
  await pg.click('[data-ml="300"]');
  await beber(pg, 500);
  assert.deepEqual(await pg.$$eval('#b-lista button', B => B.map(b => b.textContent)), ['09:00 · 300 ml ×', '10:00 · 300 ml ×', '10:00 · 500 ml ×']);
  assert.deepEqual(await pg.$$eval('#b-botoes button', B => B.map(b => b.textContent)), ['300 ml', '500 ml']);
  assert.equal(await texto(pg, '#t-ml'), '1.100');
  assert.equal(await pg.isVisible('#t-bateu'), true);                      // passou de 1.000 ml
  await pg.click('[data-tirar-agua="2"]'); await pg.click('[data-tirar-agua="2"]');   // toque duplo tira
  assert.equal(await texto(pg, '#t-ml'), '600');
  assert.equal(await pg.isVisible('#t-bateu'), false);
  await beber(pg, 5000);
  assert.equal(await texto(pg, '#toast'), 'De 1 a 3.000 ml');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.agua_dia.map(x => [x.user_id, x.data, x.aguas]), [[DONO, '2026-10-19', [{ hora: '09:00', ml: 300 }, { hora: '10:00', ml: 300 }]]]);
  assert.deepEqual(erros, []); await ctx.close();
});

test('outras bebidas (suco, refri, cappuccino, leite com Toddy): só a parte que é água conta para a meta, marcados na lista; a escolha volta para água', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();                     // segunda 19/10, 09:00
  assert.equal(await pg.getAttribute('[data-bebida="agua"]', 'aria-pressed'), 'true');
  await pg.click('[data-bebida="suco"]');
  assert.equal(await pg.getAttribute('[data-bebida="suco"]', 'aria-pressed'), 'true');
  await beber(pg, 300);                                                    // suco: 300 × 88% = 264 ml de água
  assert.equal(await texto(pg, '#t-ml'), '264');
  assert.equal(await texto(pg, '#toast'), 'Suco 300 ml: 264 ml de água às 09:00');
  assert.equal(await pg.getAttribute('[data-bebida="agua"]', 'aria-pressed'), 'true');   // volta para água
  await pg.click('[data-bebida="refri"]');
  await beber(pg, 350);                                                    // refri: 350 × 89% = 312
  await pg.click('[data-ml="300"]');                                       // o botão é o volume do copo; agora, água pura
  assert.deepEqual(await pg.$$eval('#b-lista button', B => B.map(b => b.textContent)),
    ['09:00 · suco 300 ml (264 ml de água · 120 kcal) ×', '09:00 · refri 350 ml (312 ml de água · 147 kcal) ×', '09:00 · 300 ml ×']);
  assert.equal(await texto(pg, '#t-ml'), '876');                           // 264 + 312 + 300
  await pg.click('[data-bebida="toddy"]'); await beber(pg, 200);           // leite com Toddy: 200 × 82% = 164
  await pg.click('[data-bebida="cappuccino"]'); await beber(pg, 150);      // cappuccino: 150 × 88% = 132
  assert.deepEqual((await pg.$$eval('#b-lista button', B => B.map(b => b.textContent))).slice(3), ['09:00 · leite com toddy 200 ml (164 ml de água · 170 kcal) ×', '09:00 · cappuccino 150 ml (132 ml de água · 90 kcal) ×']);
  assert.equal(await texto(pg, '#t-ml'), '1.172');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.agua_dia[0].aguas, [
    { hora: '09:00', ml: 264, bebida: 'suco', volume: 300 }, { hora: '09:00', ml: 312, bebida: 'refri', volume: 350 }, { hora: '09:00', ml: 300 },
    { hora: '09:00', ml: 164, bebida: 'toddy', volume: 200 }, { hora: '09:00', ml: 132, bebida: 'cappuccino', volume: 150 }]);
  assert.deepEqual(erros, []); await ctx.close();
});

test('lembretes: em casa de hora em hora das 10 às 16; o atrasado da vez vira "Hora de beber água" e some ao beber', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-19T11:20:00-03:00') });   // segunda (casa)
  assert.deepEqual(await etiquetas(pg, '#l-horas'), ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
  assert.equal(await texto(pg, '#l-agora'), 'Hora de beber água (11:00)');
  assert.deepEqual(await pg.$$eval('#l-horas li', L => L.map(x => x.className)), ['atrasado', 'atrasado vez', 'depois', 'depois', 'depois', 'depois', 'depois']);
  await beber(pg, 250);
  assert.equal(await pg.isVisible('#l-agora'), false);
  assert.deepEqual(await pg.$$eval('#l-horas li', L => L.map(x => x.className)), ['atrasado', 'feito', 'depois', 'depois', 'depois', 'depois', 'depois']);
  assert.equal(await texto(pg, '#l-horas li:nth-child(2)'), '11:00 ✓');
  await ctx.close();
});

test('lembretes: depois das 17h não chama mais para beber (mesmo com o das 16:00 atrasado)', async () => {
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-19T16:40:00-03:00') });
  assert.equal(await texto(pg, '#l-agora'), 'Hora de beber água (16:00)');
  await pg.clock.fastForward('00:30:00');                                   // 17:10
  await pg.evaluate(() => desenhar());
  assert.equal(await pg.isVisible('#l-agora'), false);
  assert.match(await pg.getAttribute('#l-horas li:last-child', 'class'), /atrasado/);   // a etiqueta continua mostrando que passou
  await ctx.close();
});

test('lembretes: presencial (qua e qui) e fim de semana de 2 em 2 horas; antes das 10 nada atrasado', async () => {
  for (const [quando, dia] of [['2026-10-21T08:00:00-03:00', 'quarta'], ['2026-10-24T08:00:00-03:00', 'sábado']]) {
    const { ctx, pg } = await abrirApp({ relogio: new Date(quando) });
    assert.deepEqual(await etiquetas(pg, '#l-horas'), ['10:00', '12:00', '14:00', '16:00'], dia);
    assert.equal(await pg.isVisible('#l-agora'), false, dia);
    await ctx.close();
  }
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-23T09:40:00-03:00') });   // sexta (casa): bebeu 9:40, conta para as 10
  await beber(pg, 200);
  assert.equal(await texto(pg, '#l-horas li:first-child'), '10:00 ✓');
  await ctx.close();
});

test('dois aparelhos no mesmo dia: o envio mescla com a nuvem (nada do outro aparelho some)', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();                     // segunda 19/10, 09:00
  await beber(pg, 300);
  await sincronizado(pg);
  // Outro aparelho (o computador) lança 500 ml no mesmo dia; este não sabe
  nuvem.tabelas.agua_dia[0].aguas = [...nuvem.tabelas.agua_dia[0].aguas, { hora: '09:00', ml: 500 }];
  await beber(pg, 200);                                                    // este aparelho envia o dia: mescla, não sobrescreve
  await sincronizado(pg);
  const nuvemMl = () => nuvem.tabelas.agua_dia[0].aguas.map(a => a.ml).sort((a, b) => a - b);
  assert.deepEqual(nuvemMl(), [200, 300, 500]);
  assert.equal(await texto(pg, '#t-ml'), '1.000');                         // e a tela já mostra o do outro aparelho
  await pg.click('[data-tirar-agua="0"]'); await pg.click('[data-tirar-agua="0"]');   // tirar aqui tira só o que foi tirado
  await sincronizado(pg);
  assert.equal(nuvem.tabelas.agua_dia[0].aguas.length, 2);
  assert.deepEqual(erros, []); await ctx.close();
});

test('toque duplo sem querer num botão de ml bebe uma vez só; tocar de novo depois bebe de novo', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await beber(pg, 300);
  await pg.waitForTimeout(600); await pg.dblclick('[data-ml="300"]');      // o dedo bateu duas vezes
  assert.equal(await texto(pg, '#t-ml'), '600');
  await pg.waitForTimeout(600); await pg.click('[data-ml="300"]');         // outro copo de verdade
  assert.equal(await texto(pg, '#t-ml'), '900');
  assert.deepEqual(erros, []); await ctx.close();
});

test('metrô: o envio chega ao banco mas a resposta se perde; o próximo não soma o mesmo copo de novo', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();
  nuvem.perderResposta = 1;
  await beber(pg, 300);
  await pg.waitForFunction(() => erroSync && !enviando);                  // falhou sem resposta: fica pendente
  assert.deepEqual(nuvem.tabelas.agua_dia[0].aguas.map(a => a.ml), [300]);   // mas o banco já gravou
  await pg.evaluate(() => enviar());                                       // a próxima tentativa (ao reconectar, 1 min…)
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.agua_dia[0].aguas.map(a => a.ml), [300]);   // um copo só
  assert.equal(await texto(pg, '#t-ml'), '300');
  await beber(pg, 200);                                                    // e o seguinte segue normal
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.agua_dia[0].aguas.map(a => a.ml).sort((a, b) => a - b), [200, 300]);
  assert.deepEqual(erros, []); await ctx.close();
});

test('metrô: pedido sem resposta nenhuma desiste no limite de tempo e o envio não fica preso', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();
  nuvem.pendurar = true;
  await beber(pg, 300);
  await pg.waitForFunction(() => enviando);
  // Cada tentativa desiste em 15 s; a leitura ainda é repetida pelo supabase-js (até 3 vezes, com espera curta)
  for (let i = 0; i < 8 && await pg.evaluate(() => enviando); i++) { await pg.clock.fastForward(16000); await pg.waitForTimeout(50); }
  await pg.waitForFunction(() => !enviando && /Failed to fetch/.test(erroSync));
  assert.match(await texto(pg, '#sync'), /Sem internet: salvo no aparelho/);
  nuvem.pendurar = false;
  await pg.evaluate(() => enviar());
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.agua_dia[0].aguas.map(a => a.ml), [300]);
  assert.deepEqual(erros, []); await ctx.close();
});

test('cópia do aparelho num formato antigo (com xixis) não sobe por cima da nuvem nem apaga o dia', async () => {
  // O que aconteceu em 27/10/2026: o celular tinha a base e a cópia da versão com xixi; hoje só com xixi (sem água).
  // A nuvem já tinha a água de hoje (lançada em outro aparelho) e uma bebida em ontem que a cópia não conhecia.
  const nuvem = novaNuvem();
  nuvem.tabelas.agua_dia.push(
    { user_id: DONO, data: '2026-10-18', aguas: [{ hora: '10:00', ml: 300 }, { hora: '12:27', ml: 132, bebida: 'suco', volume: 150 }] },
    { user_id: DONO, data: '2026-10-19', aguas: [{ hora: '08:30', ml: 500 }] });
  const antigo = ([dono, base, local]) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('agua.base.' + dono, JSON.stringify(base)); localStorage.setItem('agua.db.' + dono, JSON.stringify(local));
  };
  const dias = [{ data: '2026-10-18', aguas: [{ hora: '10:00', ml: 300 }], xixis: [] }, { data: '2026-10-19', aguas: [], xixis: ['08:00'] }];
  const base = Object.fromEntries(dias.map(d => [d.data, d]));
  const { ctx, pg, erros } = await abrirApp({ nuvem, iniciar: [antigo, [DONO, base, { dias }]] });
  await sincronizado(pg);
  assert.equal(await texto(pg, '#t-ml'), '500');                           // a água de hoje, da nuvem
  assert.deepEqual(nuvem.tabelas.agua_dia.map(x => [x.data, x.aguas.length]).sort(), [['2026-10-18', 2], ['2026-10-19', 1]]);   // nada apagado
  assert.equal(nuvem.tabelas.agua_dia.find(x => x.data === '2026-10-18').aguas[1].bebida, 'suco');   // nem sobrescrito
  assert.deepEqual(erros, []); await ctx.close();
});

test('últimos 7 dias, sem internet e tabela ainda não criada', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.agua_dia.push({ user_id: DONO, data: '2026-10-18', aguas: [{ hora: '10:00', ml: 1200 }] });
  const { ctx, pg } = await abrirApp({ nuvem });
  assert.match(await texto(pg, '#semana li:nth-child(2)'), /^Ontem 1\.200 ml$/);
  await beber(pg, 300);
  await sincronizado(pg);
  nuvem.online = false;
  await pg.reload(); await pg.waitForSelector('#v-agua:not([hidden])');
  assert.equal(await texto(pg, '#t-ml'), '300');                          // cópia do aparelho
  await beber(pg, 200);
  await pg.waitForSelector('#sync:not([hidden])');
  nuvem.online = true;
  await pg.evaluate(() => enviar()); await sincronizado(pg);
  assert.equal(nuvem.tabelas.agua_dia.find(x => x.data === '2026-10-19').aguas.length, 2);
  await ctx.close();
  const sem = novaNuvem(); delete sem.tabelas.agua_dia;                   // migration ainda não aplicada: abre vazio, sem quebrar
  const b = await abrirApp({ nuvem: sem });
  assert.equal(await texto(b.pg, '#t-ml'), '0');
  assert.deepEqual(b.erros, []);
  await b.ctx.close();
});

test('outra conta não passa do login; tema escuro; sem rolagem para o lado', async () => {
  const a = await abrirApp({ conta: 'outra-conta' });
  await a.pg.waitForFunction(() => document.getElementById('l-erro').textContent);
  assert.equal(await texto(a.pg, '#l-erro'), 'Esta conta não tem acesso.');
  await a.ctx.close();
  const { ctx, pg } = await abrirApp({ relogio: new Date('2026-10-19T11:20:00-03:00') });
  await pg.emulateMedia({ colorScheme: 'light' });
  assert.equal(await pg.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(27, 30, 33)');
  for (const ml of [150, 200, 250, 300, 350, 500, 750]) await beber(pg, ml);
  assert.equal(await pg.locator('#b-botoes li').count(), 6);              // no máximo 6 botões
  assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await ctx.close();
});
