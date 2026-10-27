// Tela do Corpo no navegador: pesagem e barriga do dia, horário, outro dia, IMC, gráficos, histórico, nuvem e cópia para os outros apps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, novaNuvem, sincronizado, texto, DONO } from './helpers/app.mjs';

prepararApp();

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

test('barriga sem peso (e peso sem barriga) num dia; outro dia pela data; não deixa salvar vazio nem dia futuro', async () => {
  const { ctx, pg, nuvem } = await abrirApp();
  await salvar(pg);
  assert.equal(await texto(pg, '#toast'), 'Informe o peso ou a barriga');
  await salvar(pg, { cintura: '101,5' });
  assert.match(await texto(pg, '#c-historico'), /22\/10 08:00 101,5 cm/);
  await salvar(pg, { data: '2026-10-20', peso: '91' });
  assert.equal(await pg.inputValue('#c-peso'), '91');                                          // o dia escolhido mostra o que já foi medido
  await pg.fill('#c-data', '2026-10-22'); await pg.dispatchEvent('#c-data', 'change');
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
  await salvar(pg, { data: '2026-10-21', peso: '103' });
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

test('histórico: editar data, horário, peso e barriga (1 por dia), apagar com toque duplo', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_medida.push({ user_id: DONO, data: '2026-10-15', hora: '07:00', peso: 91, cintura: null });
  const { ctx, pg } = await abrirApp({ nuvem });
  await salvar(pg, { peso: '90' });
  await pg.click('[data-editar="2026-10-22"]');
  await pg.fill('#em-data', '2026-10-15'); await pg.click('[data-salvar]');
  assert.equal(await texto(pg, '#toast'), 'Já tem medida em 15/10');
  await pg.fill('#em-data', '2026-10-20'); await pg.fill('#em-cint', '101,5'); await pg.click('[data-salvar]');
  assert.match(await texto(pg, '#c-historico'), /20\/10 08:00 90 kg · 101,5 cm · IMC/);
  await pg.click('[data-editar="2026-10-20"]'); await pg.keyboard.press('Escape');
  assert.equal(await pg.locator('#c-historico li.editando').count(), 0);
  await pg.click('[data-apagar="2026-10-15"]');
  assert.equal(await pg.locator('#c-historico li').count(), 2);                                 // 1º toque só arma
  await pg.click('[data-apagar="2026-10-15"]');
  assert.equal(await pg.locator('#c-historico li').count(), 1);
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_medida.map(m => [m.data, m.peso, m.cintura]), [['2026-10-20', 90, 101.5]]);
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
  await pg.fill('#c-data', '2026-10-20'); await pg.dispatchEvent('#c-data', 'change');   // outro dia: também o horário de agora
  await pg.fill('#c-hora', '21:15'); await pg.click('#ev-mais');
  assert.deepEqual(await pg.$$eval('#ev-horas button', B => B.map(b => b.textContent)), ['14:30 ×']);
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_dia.map(x => [x.data, x.evacuacoes, x.evacuou]).sort(),
    [['2026-10-19', [''], null], ['2026-10-20', ['14:30'], null], ['2026-10-22', ['14:30'], null]]);
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

test('sono: horas do dia escolhido (vírgula aceita), vazio tira; dia sem sono nem evacuação some', async () => {
  const { ctx, pg, nuvem } = await abrirApp();
  await pg.fill('#d-sono', '7,5'); await pg.locator('#d-sono').blur();
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_dia.map(x => [x.data, x.sono, x.evacuacoes, x.xixis]), [['2026-10-22', 7.5, [], []]]);
  await pg.fill('#d-sono', '30'); await pg.locator('#d-sono').blur();
  assert.equal(await texto(pg, '#toast'), 'Sono em horas, de 0 a 24');
  await pg.fill('#d-sono', ''); await pg.locator('#d-sono').blur();
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_dia, []);
  await ctx.close();
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
  await salvar(pg, { data: '2026-10-20', peso: '91' });
  await salvar(pg, { data: '2026-10-22', cintura: '100' });
  const L = await pg.evaluate(id => medidasGuardadas(id), DONO);
  assert.match(L[0].pesoEm, /^2026-10-22T11:00/);                                             // quando o peso foi lançado
  assert.deepEqual(L, [{ data: '2026-10-20', hora: '08:00', peso: 91, pesoEm: L[0].pesoEm }, { data: '2026-10-22', hora: '08:00', cintura: 100 }]);
  assert.deepEqual(await pg.evaluate(L => [pesoNoDia(L, '2026-10-19'), pesoNoDia(L, '2026-10-22'), pesoNoDia([], '2026-10-22')], L), [91, 91, null]);
  await ctx.close();
});

test('quando o peso e o sono foram lançados (peso_em, sono_em): o primeiro lançamento fica e vai para a nuvem', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();
  await salvar(pg, { cintura: '100' });                                                       // só barriga: nada de peso_em
  await salvar(pg, { peso: '90' });                                                            // 08:00 de 22/10 (11:00 UTC)
  await pg.clock.fastForward('02:00:00');
  await salvar(pg, { peso: '89,8' });                                                          // corrigir mantém o 1º lançamento
  await salvar(pg, { data: '2026-10-20', peso: '91' });                                        // dia passado lançado agora
  await pg.fill('#c-data', '2026-10-22'); await pg.dispatchEvent('#c-data', 'change');
  await pg.fill('#d-sono', '7,5'); await pg.dispatchEvent('#d-sono', 'change');
  await pg.fill('#d-sono', '8'); await pg.dispatchEvent('#d-sono', 'change');                // corrigir o sono também mantém
  await sincronizado(pg);
  const minuto = t => t?.slice(0, 16);   // o relógio do teste anda: compara até o minuto
  const M = Object.fromEntries(nuvem.tabelas.corpo_medida.map(m => [m.data, minuto(m.peso_em)]));
  assert.deepEqual(M, { '2026-10-20': '2026-10-22T13:00', '2026-10-22': '2026-10-22T11:00' });
  assert.deepEqual(nuvem.tabelas.corpo_dia.map(x => [x.data, x.sono, minuto(x.sono_em)]), [['2026-10-22', 8, '2026-10-22T13:00']]);
  await pg.fill('#d-sono', ''); await pg.dispatchEvent('#d-sono', 'change');                 // tirar o sono tira o lançamento
  assert.equal(await pg.evaluate(() => db.dias.length), 0);
  await pg.reload(); await pg.waitForSelector('#v-corpo:not([hidden])');                       // volta da nuvem com os lançamentos
  assert.deepEqual(await pg.evaluate(() => db.medidas.map(m => m.pesoEm?.slice(0, 16))), ['2026-10-22T13:00', '2026-10-22T11:00']);
  assert.deepEqual(erros, []); await ctx.close();
});

test('sem internet: abre com a cópia do aparelho e envia ao reconectar', async () => {
  const { ctx, pg, nuvem } = await abrirApp();
  await salvar(pg, { peso: '90' });
  await sincronizado(pg);
  nuvem.online = false;
  await pg.reload(); await pg.waitForSelector('#v-corpo:not([hidden])');
  await salvar(pg, { data: '2026-10-21', peso: '90,8' });
  await pg.waitForSelector('#sync:not([hidden])');
  assert.match(await texto(pg, '#sync'), /Sem internet/);
  nuvem.online = true;
  await pg.evaluate(() => enviar());
  await sincronizado(pg);
  assert.equal(nuvem.tabelas.corpo_medida.length, 2);
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
