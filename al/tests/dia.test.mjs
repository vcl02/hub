// Tela do dia no navegador: saldo (gasto com basal, treino e caminhada), IA e cache das comidas, prévia, lista, dias e cópia local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, novaNuvem, comTreino, sincronizado, texto, app, DIA } from './helpers/app.mjs';

prepararApp();

const OVO = { nome: 'Ovo mexido', porcao: '2 unidades (~100 g)', kcal: 180, prot: 12.5, carb: 1.2, gord: 14 };
const PAO = { nome: 'Pão francês', porcao: '1 unidade (~50 g)', kcal: 150, prot: 4.7, carb: 29.3, gord: 1.5 };
const iaCom = (...itens) => () => ({ status: 200, corpo: { itens } });
const descrever = async (pg, frase) => { await pg.fill('#f-texto', frase); await pg.press('#f-texto', 'Enter'); };

test('gasto do dia: basal × 1,2 + o treino acima da basal; "Andei hoje" soma a caminhada e vai para a nuvem', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp({ nuvem: comTreino(novaNuvem()) });
  // basal 1998 × 1,2 = 2398 · treino 1 h: (3,5 − 1) × 1998 ÷ 24 = 208 · nada comido
  assert.equal(await texto(pg, '#s-valor'), '−2.606');
  assert.equal(await texto(pg, '#s-rotulo'), 'déficit');
  assert.match(await pg.getAttribute('#saldo', 'class'), /deficit/);
  assert.equal(await texto(pg, '#s-conta'), 'Comi 0 · Gastei 2.606');
  assert.equal(await texto(pg, '#s-gasto'), 'Basal 1.998 × 1,2 = 2.398 · Treino +208 · 100 kg');
  assert.equal(await texto(pg, '#andei'), 'Andei hoje · +139 kcal');   // 40 min: (3,5 − 1) × 1998 ÷ 24 × 40/60
  await pg.click('#andei');
  assert.equal(await pg.getAttribute('#andei', 'aria-pressed'), 'true');
  assert.equal(await texto(pg, '#s-valor'), '−2.745');
  assert.match(await texto(pg, '#s-gasto'), /Caminhada \+139/);
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_dia.map(x => [x.data, x.andou]), [[DIA, true]]);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('sem pesagem no Treino não há gasto nem saldo, só o que foi comido', async () => {
  const { ctx, pg } = await abrirApp();
  assert.equal(await texto(pg, '#s-valor'), '—');
  assert.equal(await texto(pg, '#s-conta'), 'Comi 0 · Sem peso no Treino para calcular o gasto');
  assert.equal(await pg.isVisible('#andei'), false);
  await ctx.close();
});

test('IA: a frase vira itens na prévia, dá pra corrigir antes de adicionar e o corrigido fica salvo para a próxima vez', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.ia = iaCom(OVO, PAO);
  const { ctx, pg, erros } = await abrirApp({ nuvem });
  await descrever(pg, '2 ovos mexidos e 1 pão francês');
  await pg.waitForSelector('#previa:not([hidden])');
  assert.equal(nuvem.chamadasIA, 1);
  assert.equal(await pg.locator('#p-lista li').count(), 2);
  await pg.fill('#p-lista li:nth-child(2) [data-campo="kcal"]', '140');   // corrige o pão
  await pg.click('#p-adicionar');
  await pg.waitForSelector('#previa', { state: 'hidden' });
  assert.equal(await pg.inputValue('#f-texto'), '');
  assert.equal(await pg.locator('#lista li').count(), 2);
  assert.match(await texto(pg, '#lista li:first-child'), /^15:30 Ovo mexido 2 unidades \(~100 g\) P 12,5 · C 1,2 · G 14 180 kcal/);
  // 180 + 140 = 320 comidos · 320 − 2606 = −2286
  assert.equal(await texto(pg, '#s-valor'), '−2.286');
  assert.equal(await texto(pg, '#macros .m-prot b'), '17g');   // 12,5 + 4,7
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_item.map(i => [i.nome, i.kcal, i.usos]).sort(), [['Ovo mexido', 180, 1], ['Pão francês', 140, 1]]);
  assert.equal(nuvem.tabelas.al_registro.length, 2);
  assert.ok(nuvem.tabelas.al_registro.every(r => r.data === DIA && r.hora === '15:30' && r.qtd === 1));

  // Da próxima vez: sugestão ao digitar e nome igual adicionam direto, sem chamar a IA
  await pg.fill('#f-texto', 'ovo');
  await pg.click('#f-sugestoes [data-item]');
  await descrever(pg, 'pão FRANCES');
  assert.equal(await pg.locator('#lista li').count(), 4);
  assert.equal(nuvem.chamadasIA, 1);
  assert.equal(await texto(pg, '#s-valor'), '−1.966');   // 320 × 2 − 2606
  // Campo vazio: as mais usadas
  assert.deepEqual(await pg.$$eval('#f-sugestoes b', bs => bs.map(b => b.textContent)), ['Ovo mexido', 'Pão francês']);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('IA fora do ar: avisa e abre a prévia para digitar à mão, com o nome já preenchido', async () => {
  const nuvem = novaNuvem();
  nuvem.ia = () => ({ status: 503, corpo: { erro: 'IA não configurada' } });
  const { ctx, pg } = await abrirApp({ nuvem });
  await descrever(pg, 'Açaí 500 ml');
  await pg.waitForSelector('#previa:not([hidden])');
  assert.equal(await texto(pg, '#toast'), 'IA indisponível agora. Digite os valores.');
  assert.equal(await pg.inputValue('#p-lista [data-campo="nome"]'), 'Açaí 500 ml');
  await pg.fill('#p-lista [data-campo="kcal"]', '560');
  await pg.fill('#p-lista [data-campo="carb"]', '90,5');
  await pg.click('#p-adicionar');
  assert.match(await texto(pg, '#lista li'), /Açaí 500 ml .* C 90,5 .* 560 kcal/);
  await sincronizado(pg);
  assert.equal(nuvem.tabelas.al_item[0].carb, 90.5);
  await ctx.close();
});

test('lista do dia: porções mudam o total e apagar pede toque duplo', async () => {
  const nuvem = novaNuvem();
  nuvem.ia = iaCom(PAO);
  const { ctx, pg } = await abrirApp({ nuvem });
  await descrever(pg, 'pão');
  await pg.click('#p-adicionar');
  await pg.selectOption('#lista select', '2');
  assert.match(await texto(pg, '#lista li'), /2 × 1 unidade .* 300 kcal/);
  assert.equal(await texto(pg, '#s-conta'), 'Comi 300 · Sem peso no Treino para calcular o gasto');
  await pg.click('#lista [data-apagar]');
  assert.equal(await pg.locator('#lista li').count(), 1);   // 1º toque só arma
  await pg.click('#lista [data-apagar]');
  assert.equal(await pg.locator('#lista li').count(), 0);
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_registro, []);
  assert.equal(nuvem.tabelas.al_item.length, 1);   // a comida salva continua
  await ctx.close();
});

test('app novo começa hoje: sem dia anterior para ver e só hoje nos últimos 7 dias', async () => {
  const { ctx, pg } = await abrirApp({ nuvem: comTreino(novaNuvem()) });
  assert.equal(await pg.isDisabled('#d-ant'), true);
  assert.equal(await pg.isDisabled('#d-prox'), true);
  assert.equal(await pg.locator('#semana li').count(), 1);
  assert.match(await texto(pg, '#semana li'), /^Hoje/);
  await ctx.close();
});

test('dias anteriores: ‹ e os últimos 7 dias mostram o dia, com saldo e média dos dias com comida', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.tabelas.al_registro.push({ user_id: 'x', id: 'r1', data: '2026-09-13', hora: '20:00', item_id: null, nome: 'Pizza', porcao: '4 fatias', qtd: '1', kcal: '1100', prot: '44', carb: '120', gord: '48' });
  const { ctx, pg } = await abrirApp({ nuvem });
  assert.equal(await pg.isDisabled('#d-prox'), true);
  // 13/09: 23 anos, basal 2003 × 1,2 = 2404, sem treino · 1100 − 2404 = −1304
  assert.match(await texto(pg, '#semana li:nth-child(2)'), /^Ontem 1\.100 kcal −1\.304$/);
  assert.equal(await texto(pg, '#semana .sem-media'), 'Média de 1 dia: −1.304 kcal/dia');
  assert.equal(await pg.locator('#semana li').count(), 2);   // começou ontem: nada antes
  await pg.click('#d-ant');
  assert.equal(await texto(pg, '#d-nome'), 'Ontem');
  assert.equal(await pg.isDisabled('#d-prox'), false);
  assert.equal(await pg.isDisabled('#d-ant'), true);          // 1º dia do app
  assert.match(await texto(pg, '#lista li'), /^20:00 Pizza/);
  assert.equal(await texto(pg, '#andei'), 'Andei neste dia · +139 kcal');
  await pg.click('#semana [data-dia="2026-09-14"]');
  assert.equal(await texto(pg, '#d-nome'), 'Hoje');
  await ctx.close();
});

test('sem internet: abre com a cópia do aparelho e envia o que ficou pendente ao reconectar', async () => {
  const nuvem = novaNuvem();
  nuvem.ia = iaCom(OVO);
  const { ctx, pg } = await abrirApp({ nuvem });
  await descrever(pg, 'ovos');
  await pg.click('#p-adicionar');
  await sincronizado(pg);
  nuvem.online = false;
  await pg.reload();
  await pg.waitForSelector('#v-dia:not([hidden])');
  assert.equal(await pg.locator('#lista li').count(), 1);
  await pg.click('#f-sugestoes [data-item]');   // mais um ovo, offline
  await pg.waitForSelector('#sync:not([hidden])');
  assert.match(await texto(pg, '#sync'), /Sem internet/);
  nuvem.online = true;
  await pg.evaluate(() => enviar());
  await sincronizado(pg);
  assert.equal(nuvem.tabelas.al_registro.length, 2);
  await ctx.close();
});

test('outra conta entra no Supabase mas não passa do login', async () => {
  const { ctx, pg } = await abrirApp({ conta: 'outra-conta' });
  await pg.waitForFunction(() => document.getElementById('l-erro').textContent);
  assert.equal(await texto(pg, '#l-erro'), 'Esta conta não tem acesso.');
  assert.equal(await pg.isVisible('#v-dia'), false);
  await ctx.close();
});

test('tela no celular sem rolagem para o lado', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.ia = iaCom(OVO, PAO);
  const { ctx, pg } = await abrirApp({ nuvem });
  await descrever(pg, 'café');
  await pg.waitForSelector('#previa:not([hidden])');
  assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'prévia cabe na largura');
  await pg.click('#p-adicionar');
  assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'lista cabe na largura');
  assert.ok(app.url);
  await ctx.close();
});
