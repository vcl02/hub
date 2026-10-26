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

test('evacuou: Sim ou Não no dia escolhido, salva no toque, tocar de novo desmarca; mostra a última e avisa com 3 dias sem', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_dia.push({ user_id: DONO, data: '2026-10-19', evacuou: true }, { user_id: DONO, data: '2026-10-20', evacuou: false });
  const { ctx, pg, erros } = await abrirApp({ nuvem });                 // 22/10
  assert.equal(await texto(pg, '#ev-rotulo'), 'Evacuou hoje');
  assert.equal(await pg.getAttribute('#ev-sim', 'aria-pressed'), 'false');
  assert.equal(await pg.getAttribute('#ev-nao', 'aria-pressed'), 'false');
  assert.equal(await texto(pg, '#ev-ultima'), 'Última: há 3 dias (19/10)');
  assert.match(await pg.getAttribute('#ev-ultima', 'class'), /alerta/);
  await pg.click('#ev-sim');
  assert.equal(await pg.getAttribute('#ev-sim', 'aria-pressed'), 'true');
  assert.equal(await texto(pg, '#ev-ultima'), 'Última: hoje');
  assert.doesNotMatch(await pg.getAttribute('#ev-ultima', 'class'), /alerta/);
  await pg.fill('#c-data', '2026-10-20'); await pg.dispatchEvent('#c-data', 'change');   // outro dia: o que foi marcado nele
  assert.equal(await texto(pg, '#ev-rotulo'), 'Evacuou neste dia');
  assert.equal(await pg.getAttribute('#ev-nao', 'aria-pressed'), 'true');
  await pg.click('#ev-nao');                                              // tocar de novo desmarca
  assert.equal(await pg.getAttribute('#ev-nao', 'aria-pressed'), 'false');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_dia.map(x => [x.data, x.evacuou]).sort(), [['2026-10-19', true], ['2026-10-22', true]]);
  assert.equal(nuvem.tabelas.corpo_medida.length, 0);                     // evacuou não mexe nas pesagens
  assert.deepEqual(erros, []); await ctx.close();
});

test('sem a tabela corpo_dia (migration 01 não aplicada): pesagens funcionam e "Evacuou" some, sem erro', async () => {
  const nuvem = novaNuvem();
  delete nuvem.tabelas.corpo_dia;                                          // o falso responde 404, como o PostgREST sem a tabela
  const { ctx, pg, erros } = await abrirApp({ nuvem });
  assert.equal(await pg.isVisible('#ev-cartao'), false);
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
  await pg.click('#ev-sim');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.corpo_dia.map(x => [x.data, x.evacuou]), [['2026-10-22', true]]);
  assert.equal(nuvem.tabelas.corpo_medida.length, 1);                     // nada apagado nem duplicado
  await ctx.close();
});

test('a cópia para os outros apps (corpo.medidas.<conta>) acompanha cada mudança, e pesoNoDia lê dela', async () => {
  const { ctx, pg } = await abrirApp();
  await salvar(pg, { data: '2026-10-20', peso: '91' });
  await salvar(pg, { data: '2026-10-22', cintura: '100' });
  const L = await pg.evaluate(id => medidasGuardadas(id), DONO);
  assert.deepEqual(L, [{ data: '2026-10-20', hora: '08:00', peso: 91 }, { data: '2026-10-22', hora: '08:00', cintura: 100 }]);
  assert.deepEqual(await pg.evaluate(L => [pesoNoDia(L, '2026-10-19'), pesoNoDia(L, '2026-10-22'), pesoNoDia([], '2026-10-22')], L), [91, 91, null]);
  await ctx.close();
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
