// Tela do Corpo no navegador: pesagem e barriga do dia, horário, outro dia, IMC, gráficos, histórico, nuvem e cópia para os outros apps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, novaNuvem, sincronizado, texto, DONO } from './helpers/app.mjs';

// Arrasto de lado com o dedo (eventos de toque na tela do app): dx > 0 = para a direita
const arrastar = (pg, sel, dx) => pg.evaluate(([sel, dx]) => {
  const el = document.querySelector(sel), toque = x => [new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 })];
  el.dispatchEvent(new TouchEvent('touchstart', { touches: toque(150), changedTouches: toque(150), bubbles: true }));
  el.dispatchEvent(new TouchEvent('touchmove', { touches: toque(150 + dx), changedTouches: toque(150 + dx), bubbles: true }));
  el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: toque(150 + dx), bubbles: true }));
}, [sel, dx]);

prepararApp();

// Sono do dia escolhido: dormi e acordei (vazio tira)
const sono = async (pg, dormiu, acordou) => {
  await pg.fill('#d-dormiu', dormiu); await pg.dispatchEvent('#d-dormiu', 'change');
  await pg.fill('#d-acordou', acordou); await pg.dispatchEvent('#d-acordou', 'change');
};
// Medidas de dias anteriores (na tela, só leitura): entram direto na cópia do aparelho, como se tivessem vindo da nuvem
const semear = (pg, L) => pg.evaluate(L => { db.medidas.push(...L); db = preparar(db); gravar(); desenhar(); }, L);
const salvar = async (pg, { peso, cintura, hora, data } = {}) => {
  if (data) { await pg.fill('#c-data', data); await pg.dispatchEvent('#c-data', 'change'); }
  if (hora) await pg.fill('#c-hora', hora);
  if (peso != null) await pg.fill('#c-peso', peso);
  if (cintura != null) await pg.fill('#c-cintura', cintura);
  await pg.click('#c-form button[type=submit]');
};

test('pesagem de hoje: horário livre (vem a hora de agora), 1 por dia, e só recomenda o horário de sempre', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();
  assert.equal(await pg.inputValue('#c-data'), '2026-10-22');
  assert.equal(await pg.inputValue('#c-hora'), '08:00');
  assert.equal(await pg.isVisible('#c-aviso'), false);
  await salvar(pg, { hora: '07:00', peso: '90' });
  assert.match(await texto(pg, '#c-historico'), /07:00 90 kg/);
  await pg.fill('#c-hora', '15:30'); await pg.dispatchEvent('#c-hora', 'input');
  assert.match(await texto(pg, '#c-aviso'), /Fora do seu horário de sempre \(07:00\)/);
  await salvar(pg, { peso: '89,5' });                                                         // salva fora do horário, no mesmo dia
  assert.equal(await pg.locator('#c-historico li').count(), 1);
  assert.match(await texto(pg, '#c-historico'), /15:30 89,5 kg/);
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_medida.map(m => [m.user_id, m.data, m.hora, m.peso, m.cintura]), [[DONO, '2026-10-22', '15:30', 89.5, null]]);
  assert.deepEqual(erros, []); await ctx.close();
});

test('horário de sempre: a mediana das últimas 7 pesagens com horário; uma fora da rotina não muda', async () => {
  const { ctx, pg, erros } = await abrirApp();                           // 22/10, 08:00
  const aviso = async h => { await pg.fill('#c-hora', h); await pg.dispatchEvent('#c-hora', 'input'); return pg.isVisible('#c-aviso') ? texto(pg, '#c-aviso') : ''; };
  await semear(pg, [['14', '06:50'], ['15', '07:10'], ['16', '07:00'], ['17', '07:05'], ['18', '06:55'], ['19', '07:00'], ['20', '21:00']].map(([d, hora]) => ({ data: `2026-10-${d}`, hora, peso: 90 })));
  assert.equal(await pg.evaluate(() => horaHabitual()), '07:00');                             // a das 21:00 (a mais recente) não muda
  assert.equal(await aviso('07:30'), '');
  assert.match(await aviso('09:00'), /Fora do seu horário de sempre \(07:00\)/);
  await semear(pg, [{ data: '2026-10-21', hora: '21:10', peso: 90 }, { data: '2026-10-12', hora: '21:05', peso: 90 }, { data: '2026-10-13', hora: '21:05', peso: 90 }]);   // 12 e 13: antigas, fora das últimas 7
  await salvar(pg, { hora: '21:10', peso: '90' });
  assert.equal(await pg.evaluate(() => horaHabitual()), '07:05');                              // 06:55 07:00 07:00 [07:05] 21:00 21:10 21:10: 3 noites ainda não viram a rotina
  assert.deepEqual(erros, []); await ctx.close();
});

test('barriga sem peso (e peso sem barriga) num dia; outro dia pela data, só leitura (?dia= acompanha); não deixa salvar vazio nem dia futuro', async () => {
  const { ctx, pg, nuvem } = await abrirApp();
  await salvar(pg);
  assert.equal(await texto(pg, '#toast'), 'Informe o peso ou a barriga');
  await salvar(pg, { cintura: '101,5' });
  assert.match(await texto(pg, '#c-historico'), /22\/10 08:00 101,5 cm/);
  await semear(pg, [{ data: '2026-10-20', hora: '07:00', peso: 91 }]);
  await pg.fill('#c-data', '2026-10-20'); await pg.dispatchEvent('#c-data', 'change');
  assert.equal(await pg.inputValue('#c-peso'), '91');                                          // o dia escolhido mostra o que já foi medido
  assert.equal(await pg.isDisabled('#c-form button[type=submit]'), true);                      // dia anterior: só leitura
  assert.equal(await pg.isDisabled('#c-data'), false);                                         // a data troca, para voltar
  assert.equal(await pg.evaluate(() => location.search), '?dia=2026-10-20');                   // o dia no endereço, como o ?ciclo do Fin
  await pg.goBack();                                                                           // Voltar do navegador: o dia de antes
  await pg.waitForFunction(() => document.getElementById('c-data').value === '2026-10-22');
  assert.equal(await pg.evaluate(() => location.search), '');
  assert.equal(await pg.inputValue('#c-peso'), ''); assert.equal(await pg.inputValue('#c-cintura'), '101,5');
  assert.equal(await pg.getAttribute('#c-data', 'max'), '2026-10-22');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_medida.map(m => [m.data, m.peso, m.cintura]).sort(), [['2026-10-20', 91, null], ['2026-10-22', null, 101.5]]);
  await salvar(pg, { peso: '20' });
  assert.equal(await texto(pg, '#toast'), 'Peso entre 30 e 300 kg');
  await ctx.close();
});

test('IMC com 1,78 m, faixa, quanto falta, perfil e variação desde a 1ª pesagem', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_medida.push({ user_id: DONO, data: '2026-10-15', hora: '07:00', peso: '92', cintura: '104' });
  const { ctx, pg } = await abrirApp({ nuvem });
  await salvar(pg, { peso: '90', cintura: '102' });
  assert.match(await texto(pg, '#c-historico'), /90 kg · 102 cm · IMC 28,4/);                 // 90 / 1,78²
  const resumo = await texto(pg, '#c-resumo');
  assert.match(resumo, /^90kg IMC 28,4 · Sobrepeso 11 kg até Normal −2 kg desde 15\/10 Barriga 102 cm · −2 cm$/);
  assert.equal(await texto(pg, '#c-perfil'), '24 anos · 1,78 m · basal ~1.898 kcal/dia');
  const faixa = await pg.evaluate(() => [15.9, 16, 17, 18.4, 18.5, 24.9, 25, 29.9, 30, 34.9, 35, 39.9, 40].map(faixaImc));
  assert.deepEqual(faixa, ['Magreza III', 'Magreza II', 'Magreza I', 'Magreza I', 'Normal', 'Normal', 'Sobrepeso', 'Sobrepeso',
    'Obesidade I', 'Obesidade I', 'Obesidade II', 'Obesidade II', 'Obesidade III']);
  assert.deepEqual(await pg.evaluate(() => [102.3, 75, 50].map(rumoAoNormal)), ['7,5 kg até Sobrepeso', '', '0,6 kg até Magreza II']);
  assert.deepEqual(await pg.evaluate(() => [faixaImc(imc(94.8)), faixaImc(imc(94.9))]), ['Sobrepeso', 'Obesidade I']);
  await ctx.close();
});

test('gráficos só com 2 medidas ou mais (sem caixa vazia nem título)', async () => {
  const { ctx, pg } = await abrirApp();
  await salvar(pg, { peso: '102,3', cintura: '110' });
  for (const id of ['#c-grafico', '#c-grafico-cint']) {
    assert.equal(await pg.isVisible(id), false, id);
    assert.equal(await pg.isVisible(`h3.sec:has(+ ${id})`), false, id);
  }
  await semear(pg, [{ data: '2026-10-21', hora: '07:00', peso: 103 }]);
  assert.equal(await pg.isVisible('#c-grafico svg'), true);
  assert.equal(await pg.isVisible('#c-grafico-cint'), false);                                   // barriga só em 1 dia
  await ctx.close();
});

test('gráficos: com o mouse em cima (ou o dedo) mostram a data, o horário e o valor do ponto mais perto', async () => {
  const nuvem = novaNuvem();
  [['2026-10-15', 104, ''], ['2026-10-18', 103.1, '07:40'], ['2026-10-21', 102.3, '']].forEach(([data, peso, hora]) => nuvem.tabelas.corpo_medida.push({ user_id: DONO, data, hora, peso, cintura: null }));
  const { ctx, pg } = await abrirApp({ nuvem });
  assert.equal(await pg.getAttribute('#c-grafico .dica', 'visibility'), 'hidden');
  await pg.locator('#c-grafico svg').scrollIntoViewIfNeeded();             // o mouse só alcança o que está na tela
  const caixa = await pg.locator('#c-grafico svg').boundingBox();
  await pg.mouse.move(caixa.x + caixa.width * 0.55, caixa.y + caixa.height / 2);   // perto do ponto do meio
  assert.equal(await pg.getAttribute('#c-grafico .dica', 'visibility'), 'visible');
  assert.equal(await texto(pg, '#c-grafico .dica text'), '18/10 07:40 · 103,1 kg');   // com o horário da pesagem
  await pg.mouse.move(caixa.x + caixa.width - 2, caixa.y + 10);                     // ponta direita: o último
  assert.equal(await texto(pg, '#c-grafico .dica text'), '21/10 · 102,3 kg');           // sem horário, só a data
  await pg.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height + 200);     // saiu do gráfico: some
  assert.equal(await pg.getAttribute('#c-grafico .dica', 'visibility'), 'hidden');
  await ctx.close();
});

test('evolução: só os últimos 90 dias, eixo pela data, 3 datas embaixo e 3 valores do lado', async () => {
  const nuvem = novaNuvem();
  // 22/10 é hoje: 90 dias contando hoje = desde 25/07. A de 24/07 fica de fora.
  [['2026-07-24', 110], ['2026-07-25', 108], ['2026-09-01', 104], ['2026-10-20', 100]].forEach(([data, peso]) => nuvem.tabelas.corpo_medida.push({ user_id: DONO, data, hora: '', peso, cintura: null }));
  const { ctx, pg } = await abrirApp({ nuvem });
  assert.deepEqual(await pg.$$eval('#c-grafico .eixo-x', T => T.map(t => t.textContent)), ['25/07', '06/09', '20/10']);   // 1ª, meio (pela data) e última
  assert.deepEqual(await pg.$$eval('#c-grafico .eixo-y', T => T.map(t => t.textContent)), ['108', '104', '100']);       // maior, meio e menor
  assert.equal(await pg.locator('#c-grafico svg > circle').count(), 4);                                                   // 3 pontos + o destaque do último
  // a distância entre os pontos segue as datas: 25/07 → 01/09 são 38 dias e 01/09 → 20/10 são 49
  const xs = await pg.$$eval('#c-grafico svg > circle', C => C.slice(0, 3).map(c => +c.getAttribute('cx')));
  assert.ok(Math.abs((xs[1] - xs[0]) / (xs[2] - xs[1]) - 38 / 49) < 0.01, String(xs));
  await ctx.close();
});

test('histórico: só a medida de hoje se edita (horário, peso e barriga) ou apaga com toque duplo; as anteriores, só leitura', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_medida.push({ user_id: DONO, data: '2026-10-15', hora: '07:00', peso: 91, cintura: null });
  const { ctx, pg } = await abrirApp({ nuvem });
  await salvar(pg, { peso: '90' });
  assert.equal(await pg.isDisabled('[data-editar="2026-10-15"]'), true);
  assert.equal(await pg.isDisabled('[data-apagar="2026-10-15"]'), true);
  await pg.click('[data-editar="2026-10-22"]');
  assert.deepEqual([await pg.getAttribute('#em-data', 'min'), await pg.getAttribute('#em-data', 'max')], ['2026-10-22', '2026-10-22']);   // o dia não muda
  await pg.fill('#em-hora', '07:30'); await pg.fill('#em-cint', '101,5'); await pg.click('[data-salvar]');
  assert.match(await texto(pg, '#c-historico'), /22\/10 07:30 90 kg · 101,5 cm · IMC/);
  await pg.click('[data-editar="2026-10-22"]'); await pg.keyboard.press('Escape');
  assert.equal(await pg.locator('#c-historico li.editando').count(), 0);
  await pg.click('[data-apagar="2026-10-22"]');
  assert.equal(await pg.locator('#c-historico li').count(), 2);                                 // 1º toque só arma
  await pg.click('[data-apagar="2026-10-22"]');
  assert.equal(await pg.locator('#c-historico li').count(), 1);
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_medida.map(m => [m.data, m.peso, m.cintura]), [['2026-10-15', 91, null]]);
  await ctx.close();
});

test('evacuação: +1 grava com o horário de agora, conta, tira com toque duplo e avisa com 3 dias sem', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_dia.push({ user_id: DONO, data: '2026-10-19', evacuou: null, evacuacoes: [''], sono: null });   // o sim da migration 01, já convertido pela 02
  const { ctx, pg, erros } = await abrirApp({ nuvem });                 // 22/10, 08:00
  assert.equal(await texto(pg, '#ev-total'), '0');
  assert.equal(await texto(pg, '#ev-ultima'), '3 dias sem evacuar (última em 19/10)');   // só aparece com 3 dias ou mais
  await pg.click('#ev-mais');
  await sincronizado(pg);                                                // já na nuvem: o +1 seguinte também precisa subir
  await pg.clock.fastForward('06:30:00'); await pg.click('#ev-mais');   // 14:30
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_dia.find(x => x.data === '2026-10-22').evacuacoes, ['08:00', '14:30']);
  assert.equal(await texto(pg, '#ev-total'), '2');
  assert.deepEqual(await pg.$$eval('#ev-horas button', B => B.map(b => b.textContent)), ['08:00 ×', '14:30 ×']);
  assert.equal(await pg.isVisible('#ev-ultima'), false);                  // evacuou hoje: sem linha
  await pg.click('[data-tirar-ev="0"]');
  assert.equal(await texto(pg, '#ev-total'), '2');                       // 1º toque só arma
  await pg.click('[data-tirar-ev="0"]');
  assert.deepEqual(await pg.$$eval('#ev-horas button', B => B.map(b => b.textContent)), ['14:30 ×']);
  await pg.fill('#c-data', '2026-10-19'); await pg.dispatchEvent('#c-data', 'change');   // dia anterior: só leitura
  assert.equal(await pg.isDisabled('#ev-mais'), true);
  assert.equal(await pg.$$eval('#ev-horas button', B => B.every(b => b.disabled)), true);
  await pg.evaluate(() => mudarDia(x => { x.evacuacoes.push('21:15'); }));             // nem por baixo grava
  await pg.click('#dia-hoje');                                                         // Hoje volta
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_dia.map(x => [x.data, x.evacuacoes, x.evacuou]).sort(),
    [['2026-10-19', [''], null], ['2026-10-22', ['14:30'], null]]);
  assert.equal(nuvem.tabelas.corpo_medida.length, 0);                     // não mexe nas pesagens
  assert.deepEqual(erros, []); await ctx.close();
});

test('xixi: +1 com o horário de agora, tira com toque duplo; bexiga com xixis por dia, intervalo e ml por xixi (água da Água)', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_dia.push({ user_id: DONO, data: '2026-10-18', evacuacoes: [], xixis: ['09:00', '12:00', '15:00', '18:00'], sono: null });
  nuvem.tabelas.agua_dia.push({ user_id: DONO, data: '2026-10-18', aguas: [{ hora: '10:00', ml: 500 }, { hora: '14:00', ml: 300 }] });
  const { ctx, pg, erros } = await abrirApp({ nuvem });                 // 22/10, 08:00
  const numeros = () => pg.$$eval('#bexiga .numeros li', L => L.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  // só o dia 18: 4 xixis, 3 h entre um e outro, 800 ml ÷ 4 = 200 ml por xixi
  assert.deepEqual(await numeros(), ['4 xixis por dia', '3 h entre um e outro', '200 ml bebidos por xixi']);
  await pg.click('#x-mais');
  await sincronizado(pg);
  await pg.clock.fastForward('02:30:00'); await pg.click('#x-mais');   // 10:30
  assert.equal(await texto(pg, '#x-total'), '2');
  assert.deepEqual(await pg.$$eval('#x-horas button', B => B.map(b => b.textContent)), ['08:00 ×', '10:30 ×']);
  // 18 e 22: (4 + 2) ÷ 2 = 3 por dia · intervalos 180, 180, 180, 150 → 173 min · 800 ÷ 6 = 133 ml
  assert.deepEqual(await numeros(), ['3 xixis por dia', '2 h 53 entre um e outro', '133 ml bebidos por xixi']);
  assert.equal(await texto(pg, '#bexiga .bx-nota'), 'Média de 2 dias com xixi registrado.');
  await pg.click('[data-tirar-xixi="0"]'); await pg.click('[data-tirar-xixi="0"]');
  assert.equal(await texto(pg, '#x-total'), '1');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_dia.find(x => x.data === '2026-10-22').xixis, ['10:30']);
  assert.equal(nuvem.tabelas.agua_dia.length, 1);                         // a água só é lida
  assert.deepEqual(erros, []); await ctx.close();
  const vazio = await abrirApp();
  assert.equal(await texto(vazio.pg, '#bexiga'), 'Registre os xixis para ver aqui.');
  await vazio.ctx.close();
});

test('dois aparelhos no mesmo dia: evacuações, xixis e sono mesclam com a nuvem (nada do outro aparelho some)', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();                    // 22/10, 08:00
  await pg.click('#ev-mais');
  await sincronizado(pg);
  // Outro aparelho lança uma evacuação, um xixi e o sono no mesmo dia; este não sabe
  Object.assign(nuvem.tabelas.corpo_dia[0], { evacuacoes: ['07:00', '08:00'], xixis: ['07:30'], sono: 7, dormiu: '00:00', acordou: '07:00' });
  await pg.click('#x-mais');                                             // este envia o dia: mescla, não sobrescreve
  await sincronizado(pg);
  const d = nuvem.tabelas.corpo_dia[0];
  assert.deepEqual([d.evacuacoes, d.xixis, d.sono, d.dormiu, d.acordou], [['07:00', '08:00'], ['07:30', '08:00'], 7, '00:00', '07:00']);
  assert.equal(await texto(pg, '#ev-total'), '2');                       // a tela já mostra o do outro aparelho
  assert.deepEqual(erros, []); await ctx.close();
});

test('aberto pela página inicial num dia anterior (?dia=): o dia dele, só leitura; Hoje volta ao app normal', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_medida.push({ user_id: DONO, data: '2026-10-20', hora: '07:10', peso: 99.5, cintura: null });
  nuvem.tabelas.corpo_dia.push({ user_id: DONO, data: '2026-10-20', evacuacoes: ['09:00'], xixis: ['08:00', '11:00'], sono: 7.5, dormiu: '23:30', acordou: '07:00' });
  const { ctx, pg, erros } = await abrirApp({ nuvem, busca: '?dia=2026-10-20' });
  await pg.waitForFunction(() => document.getElementById('x-total').textContent === '2');
  assert.match(await texto(pg, '#dia-visto'), /^terça-feira, 20 de outubro · só leitura Hoje$/);
  assert.deepEqual([await pg.inputValue('#c-data'), await pg.inputValue('#c-hora'), await pg.inputValue('#c-peso')], ['2026-10-20', '07:10', '99,5']);
  assert.equal(await texto(pg, '#ev-total'), '1');
  for (const sel of ['#c-peso', '#ev-mais', '#x-mais', '#d-dormiu', '#c-form button[type="submit"]']) assert.equal(await pg.isDisabled(sel), true, sel);
  assert.equal(await pg.isDisabled('#c-data'), false);
  assert.equal(await pg.$$eval('#c-historico button', L => L.every(b => b.disabled)), true);
  await pg.evaluate(() => mudarDia(x => { x.xixis.push('12:00'); }));                   // nem por baixo grava
  assert.equal(await texto(pg, '#x-total'), '2');
  await pg.click('#dia-hoje');                                                          // Hoje: o app normal (o ?dia sai do endereço)
  await pg.waitForFunction(() => !location.search && document.getElementById('c-data').value === '2026-10-22');
  assert.equal(await pg.isVisible('#dia-visto'), false);
  assert.equal(await pg.isDisabled('#x-mais'), false);
  assert.deepEqual(erros, []); await ctx.close();
});

test('‹ › e arrastar de lado trocam o dia (até o 1º dia com registro e até hoje), como no al; ← → no computador', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_medida.push({ user_id: DONO, data: '2026-10-20', hora: '07:10', peso: 99.5, cintura: null });
  const { ctx, pg, erros } = await abrirApp({ nuvem });                    // 22/10
  await pg.waitForFunction(() => db.medidas.length === 1);
  assert.equal(await texto(pg, '#d-nome'), 'Hoje');
  assert.equal(await pg.isDisabled('#d-prox'), true);                    // não passa de hoje
  await pg.click('#d-ant');
  assert.deepEqual([await texto(pg, '#d-nome'), await pg.inputValue('#c-data')], ['Ontem', '2026-10-21']);
  await arrastar(pg, '#v-corpo', 150);                                   // para a direita: o dia anterior
  assert.deepEqual([await texto(pg, '#d-nome'), await pg.inputValue('#c-peso')], ['terça, 20/10', '99,5']);
  assert.equal(await pg.isDisabled('#d-ant'), true);                     // 20/10 é o 1º dia com registro
  assert.equal(await pg.evaluate(() => location.search), '?dia=2026-10-20');
  await arrastar(pg, '#v-corpo', -150);                                  // para a esquerda: o seguinte
  assert.equal(await pg.inputValue('#c-data'), '2026-10-21');
  await pg.keyboard.press('ArrowRight');
  assert.equal(await texto(pg, '#d-nome'), 'Hoje');
  assert.equal(await pg.isDisabled('#x-mais'), false);                   // hoje: lança de novo
  assert.deepEqual(erros, []); await ctx.close();
});

test('toque duplo sem querer no +1 conta uma vez só', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.dblclick('#x-mais'); await pg.dblclick('#ev-mais');
  assert.equal(await texto(pg, '#x-total'), '1');
  assert.equal(await texto(pg, '#ev-total'), '1');
  assert.deepEqual(erros, []); await ctx.close();
});

test('metrô: o envio chega ao banco mas a resposta se perde; o próximo não soma o mesmo xixi de novo', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();
  await pg.click('#x-mais');
  await sincronizado(pg);
  nuvem.perderResposta = 1;
  await pg.click('#ev-mais');
  await pg.waitForFunction(() => erroSync && !enviando);                  // falhou sem resposta: fica pendente
  assert.deepEqual(nuvem.tabelas.corpo_dia[0].evacuacoes, ['08:00']);      // mas o banco já gravou
  await pg.evaluate(() => enviar());                                       // a próxima tentativa
  await sincronizado(pg);
  const d = nuvem.tabelas.corpo_dia[0];
  assert.deepEqual([d.evacuacoes, d.xixis], [['08:00'], ['08:00']]);     // uma evacuação só, e o xixi de antes intacto
  assert.equal(await texto(pg, '#ev-total'), '1');
  assert.deepEqual(erros, []); await ctx.close();
});

test('sono: dormi e acordei (passando da meia-noite), as horas e BOM, OK ou RUIM; vazio tira; dia sem nada some', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();                    // 22/10
  assert.equal(await pg.isVisible('#d-sono-res'), false);
  await pg.fill('#d-dormiu', '23:40'); await pg.dispatchEvent('#d-dormiu', 'change');   // só um dos dois: guarda, sem horas
  assert.deepEqual(await pg.evaluate(() => db.dias.map(x => [x.dormiu, x.sono])), [['23:40', undefined]]);
  await pg.fill('#d-acordou', '07:10'); await pg.dispatchEvent('#d-acordou', 'change');
  assert.equal(await texto(pg, '#d-sono-res'), '7 h 30 OK');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_dia.map(x => [x.data, x.dormiu, x.acordou, x.sono, x.evacuacoes, x.xixis]), [['2026-10-22', '23:40', '07:10', 7.5, [], []]]);
  const nivel = async (d, a) => { await sono(pg, d, a); return [await texto(pg, '#d-sono-res'), await pg.getAttribute('#d-sono-res .nivel', 'class')]; };
  assert.deepEqual(await nivel('22:30', '06:30'), ['8 h BOM', 'nivel bom']);              // 8 h já é BOM
  assert.deepEqual(await nivel('00:15', '07:14'), ['6 h 59 RUIM', 'nivel ruim']);         // menos de 7: vermelho
  assert.deepEqual(await nivel('01:00', '08:00'), ['7 h OK', 'nivel ok']);
  await sono(pg, '', '');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_dia, []);
  assert.deepEqual(erros, []); await ctx.close();
});

test('sono antigo (só as horas, antes dos horários) vira dormiu às 23:00 e acordou 23:00 + as horas; a lista e a média das noites', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_dia.push({ user_id: DONO, data: '2026-10-20', evacuacoes: [], xixis: [], sono: 9 }, { user_id: DONO, data: '2026-10-21', evacuacoes: [], xixis: [], sono: 6.5 });
  const { ctx, pg, erros } = await abrirApp({ nuvem });                  // 22/10
  assert.deepEqual(await pg.evaluate(() => db.dias.map(x => [x.data, x.dormiu, x.acordou, x.sono])), [['2026-10-20', '23:00', '08:00', 9], ['2026-10-21', '23:00', '05:30', 6.5]]);
  await sono(pg, '23:00', '07:30');                                       // hoje: 8 h 30
  assert.equal(await texto(pg, '#sono .sono-media'), 'Média de 3 noites: 8 h BOM');     // (8,5 + 6,5 + 9) ÷ 3 = 8: BOM
  assert.deepEqual(await pg.$$eval('#sono .noites li', L => L.map(li => [...li.children].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' '))),
    ['22/10 23:00 → 07:30 8 h 30 BOM', '21/10 23:00 → 05:30 6 h 30 RUIM', '20/10 23:00 → 08:00 9 h BOM']);
  await pg.fill('#c-data', '2026-10-20'); await pg.dispatchEvent('#c-data', 'change');  // o dia antigo no formulário, com os horários
  assert.deepEqual([await pg.inputValue('#d-dormiu'), await pg.inputValue('#d-acordou')], ['23:00', '08:00']);
  assert.deepEqual(erros, []); await ctx.close();
});

test('sem a tabela corpo_dia (ou sem as colunas da migration 02): pesagens funcionam e o cartão do dia some, sem erro', async () => {
  const nuvem = novaNuvem();
  delete nuvem.tabelas.corpo_dia;                                          // o falso responde 404, como o PostgREST sem a tabela
  const { ctx, pg, erros } = await abrirApp({ nuvem });
  assert.equal(await pg.isVisible('#ev-cartao'), false);
  assert.equal(await pg.isVisible('#bexiga'), false);
  await pg.fill('#c-peso', '90'); await pg.click('#c-form button[type=submit]');
  await sincronizado(pg);
  assert.equal(nuvem.tabelas.corpo_medida.length, 1);
  assert.equal(await pg.isVisible('#sync'), false);                        // sem erro de envio
  assert.deepEqual(erros, []); await ctx.close();
});

test('cópia do aparelho da versão anterior (base só com pesagens) continua sincronizando', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_medida.push({ user_id: DONO, data: '2026-10-20', hora: '07:00', peso: 91, cintura: null });
  const { ctx, pg } = await abrirApp({ nuvem });
  await pg.evaluate(id => {   // como ficava gravado antes do corpo_dia
    localStorage.setItem('corpo.base.' + id, JSON.stringify({ '2026-10-20': { data: '2026-10-20', hora: '07:00', peso: 91, cintura: null } }));
    localStorage.setItem('corpo.db.' + id, JSON.stringify({ medidas: [{ data: '2026-10-20', hora: '07:00', peso: 91 }] }));
  }, DONO);
  await pg.reload(); await pg.waitForSelector('#v-corpo:not([hidden])');
  assert.match(await texto(pg, '#c-historico'), /91 kg/);
  await pg.click('#ev-mais');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_dia.map(x => [x.data, x.evacuacoes]), [['2026-10-22', ['08:00']]]);
  assert.equal(nuvem.tabelas.corpo_medida.length, 1);                     // nada apagado nem duplicado
  await ctx.close();
});

test('a cópia para os outros apps (corpo.medidas.<conta>) acompanha cada mudança, e pesoNoDia lê dela', async () => {
  const { ctx, pg } = await abrirApp();
  await semear(pg, [{ data: '2026-10-20', hora: '08:00', peso: 91 }]);
  await salvar(pg, { peso: '90', cintura: '100' });
  const L = await pg.evaluate(id => medidasGuardadas(id), DONO);
  assert.match(L[1].pesoEm, /^2026-10-22T11:00/);                                             // quando o peso foi lançado
  assert.deepEqual(L, [{ data: '2026-10-20', hora: '08:00', peso: 91 }, { data: '2026-10-22', hora: '08:00', peso: 90, cintura: 100, pesoEm: L[1].pesoEm }]);
  assert.deepEqual(await pg.evaluate(L => [pesoNoDia(L, '2026-10-19'), pesoNoDia(L, '2026-10-22'), pesoNoDia([], '2026-10-22')], L), [91, 90, null]);
  await ctx.close();
});

test('quando o peso e o sono foram lançados (peso_em, sono_em): o primeiro lançamento fica e vai para a nuvem', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();
  await salvar(pg, { cintura: '100' });                                                       // só barriga: nada de peso_em
  await salvar(pg, { peso: '90' });                                                            // 08:00 de 22/10 (11:00 UTC)
  await pg.clock.fastForward('02:00:00');
  await salvar(pg, { peso: '89,8' });                                                          // corrigir mantém o 1º lançamento
  await sono(pg, '00:00', '07:30');
  await sono(pg, '00:00', '08:00');                                                            // corrigir o sono também mantém
  await sincronizado(pg);
  const minuto = t => t?.slice(0, 16);   // o relógio do teste anda: compara até o minuto
  const M = Object.fromEntries(nuvem.tabelas.corpo_medida.map(m => [m.data, minuto(m.peso_em)]));
  assert.deepEqual(M, { '2026-10-22': '2026-10-22T11:00' });
  assert.deepEqual(nuvem.tabelas.corpo_dia.map(x => [x.data, x.sono, minuto(x.sono_em)]), [['2026-10-22', 8, '2026-10-22T13:00']]);
  await sono(pg, '', '');                                                                      // tirar o sono tira o lançamento
  assert.equal(await pg.evaluate(() => db.dias.length), 0);
  await pg.reload(); await pg.waitForSelector('#v-corpo:not([hidden])');                       // volta da nuvem com os lançamentos
  assert.deepEqual(await pg.evaluate(() => db.medidas.map(m => m.pesoEm?.slice(0, 16))), ['2026-10-22T11:00']);
  assert.deepEqual(erros, []); await ctx.close();
});

test('sem internet: abre com a cópia do aparelho e envia ao reconectar', async () => {
  const { ctx, pg, nuvem } = await abrirApp();
  await salvar(pg, { peso: '90' });
  await sincronizado(pg);
  nuvem.online = false;
  await pg.reload(); await pg.waitForSelector('#v-corpo:not([hidden])');
  await salvar(pg, { cintura: '101' });
  await pg.waitForSelector('#sync:not([hidden])');
  assert.match(await texto(pg, '#sync'), /Sem internet/);
  nuvem.online = true;
  await pg.evaluate(() => enviar());
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_medida.map(m => [m.peso, m.cintura]), [[90, 101]]);
  await ctx.close();
});

test('outra conta não passa do login; tema escuro mesmo com o celular no modo claro; sem rolagem para o lado', async () => {
  const a = await abrirApp({ conta: 'outra-conta' });
  await a.pg.waitForFunction(() => document.getElementById('l-erro').textContent);
  assert.equal(await texto(a.pg, '#l-erro'), 'Esta conta não tem acesso.');
  await a.ctx.close();
  const { ctx, pg } = await abrirApp();
  await pg.emulateMedia({ colorScheme: 'light' });
  assert.equal(await pg.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(27, 30, 33)');
  await salvar(pg, { peso: '102,3', cintura: '110' });
  await pg.click('[data-editar]');
  assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await ctx.close();
});

test('Esc: cancela a edição na linha; num campo só tira o foco; sem nada aberto, sai do app (volta para a página inicial do hub)', async () => {
  const { ctx, pg, erros } = await abrirApp();
  await pg.evaluate(() => { window.saidas = 0; sairDoApp = () => { saidas++; }; });   // fora do hub ../ é a própria raiz
  await salvar(pg, { peso: '90' });
  await pg.click('[data-editar="2026-10-22"]');
  await pg.keyboard.press('Escape');
  assert.deepEqual([await pg.locator('#c-historico li.editando').count(), await pg.evaluate(() => saidas)], [0, 0]);
  await pg.focus('#c-peso'); await pg.keyboard.press('Escape');
  assert.equal(await pg.evaluate(() => saidas), 0);
  await pg.keyboard.press('Escape');
  assert.equal(await pg.evaluate(() => saidas), 1);
  assert.deepEqual(erros, []); await ctx.close();
});
