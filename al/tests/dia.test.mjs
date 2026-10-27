// Tela do dia no navegador: saldo (gasto com basal, treino e caminhada), IA e cache das comidas, prévia, lista, dias e cópia local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, abrirApp, novaNuvem, comTreino, sincronizado, texto, app, DIA } from './helpers/app.mjs';

prepararApp();

const OVO = { nome: 'Ovo mexido', porcao: '1 unidade (~50 g)', qtd: 2, kcal: 180, prot: 12.5, carb: 1.2, gord: 14 };   // 2 ovos: total
const PAO = { nome: 'Pão francês', porcao: '1 unidade (~50 g)', kcal: 150, prot: 4.7, carb: 29.3, gord: 1.5 };
const iaCom = (...itens) => () => ({ status: 200, corpo: { itens } });
const linhasDe = (pg, sel) => pg.$$eval(`${sel} > span`, L => L.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
const trechos = pg => pg.$$eval('#c-lista button', B => B.map(b => b.textContent));
const descrever = async (pg, frase) => { await pg.fill('#f-texto', frase); await pg.press('#f-texto', 'Enter'); };

test('gasto do dia: basal × 1,2 + o treino acima da basal; "Andei +" soma cada trecho de caminhada e vai para a nuvem', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp({ nuvem: comTreino(novaNuvem()) });
  // basal 1998 × 1,2 = 2398 · treino 1 h: (3,5 − 1) × 1998 ÷ 24 = 208 · gasto 2606 − 500 de déficit = meta 2106 · nada comido
  assert.equal(await texto(pg, '#s-valor'), '2.106');
  assert.equal(await texto(pg, '#s-rotulo'), 'kcal restantes');        // hoje: quanto ainda cabe, não o déficit do dia inteiro
  assert.match(await pg.getAttribute('#saldo', 'class'), /deficit/);
  // uma por linha, déficit pequeno na da meta · gastei hoje = até agora: 2398 × 15h30/24h = 1549 + treino 208 = 1757
  assert.deepEqual(await linhasDe(pg, '#s-conta'), ['Meta 500 kcal déficit 2.106 kcal', 'Comi 0 kcal', 'Gastei 1.757 kcal']);
  assert.equal(await pg.locator('#s-gasto').count(), 0);                 // sem a conta do gasto
  assert.equal(await pg.isVisible('#andei'), true);
  assert.equal(await texto(pg, '#c-kcal'), '');                          // sem trecho, sem caminhada
  await pg.click('#c-mais');                                             // fui: sem tempo nem distância = 20 min
  // Padrão 20 min a 5 km/h: MET (0,1 × 83,3 + 3,5) ÷ 3,5 = 3,38 · (3,38 − 1) × 1998 ÷ 24 × 20/60 = 66
  assert.deepEqual(await trechos(pg), ['15:30 · 20 min ×']);
  assert.equal(await texto(pg, '#c-kcal'), '−66 kcal');
  assert.equal(await texto(pg, '#s-valor'), '2.172');                    // a caminhada sobe o gasto e a meta junto
  await pg.clock.fastForward('01:00:00');
  await pg.fill('#c-min', '40'); await pg.press('#c-min', 'Enter');      // voltei: 40 min a 5 km/h = 132
  assert.equal(await texto(pg, '#c-kcal'), '−198 kcal');
  assert.equal(await pg.inputValue('#c-min'), '');                       // campos limpos para o próximo trecho
  await pg.clock.fastForward('02:00:00');
  await pg.fill('#c-min', '40'); await pg.fill('#c-km', '3,0'); await pg.click('#c-mais');   // mercado: 3 km em 40 min = 4,5 km/h, MET 3,14 = 119
  assert.deepEqual(await trechos(pg), ['15:30 · 20 min ×', '16:30 · 40 min ×', '18:30 · 40 min · 3 km ×']);
  assert.equal(await texto(pg, '#c-kcal'), '−317 kcal');
  assert.equal(await texto(pg, '#s-valor'), '2.423');
  await pg.fill('#c-km', '80'); await pg.click('#c-mais');
  assert.equal(await texto(pg, '#toast'), 'Até 600 min e 60 km por trecho');
  assert.equal((await trechos(pg)).length, 3);
  await pg.fill('#c-km', '');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_dia.map(x => [x.data, x.caminhadas]), [[DIA, [{ hora: '15:30' }, { hora: '16:30', minutos: 40 }, { hora: '18:30', minutos: 40, km: 3 }]]]);
  await pg.reload();                                                     // volta da nuvem igual
  await pg.waitForSelector('#v-dia:not([hidden])');
  assert.deepEqual(await trechos(pg), ['15:30 · 20 min ×', '16:30 · 40 min ×', '18:30 · 40 min · 3 km ×']);
  await pg.click('[data-tirar-trecho="1"]');                             // toque duplo tira: o 1º só arma
  assert.equal((await trechos(pg)).length, 3);
  await pg.click('[data-tirar-trecho="1"]');
  assert.equal(await texto(pg, '#c-kcal'), '−185 kcal');
  await pg.click('[data-tirar-trecho="0"]'); await pg.click('[data-tirar-trecho="0"]');
  await pg.click('[data-tirar-trecho="0"]'); await pg.click('[data-tirar-trecho="0"]');
  assert.deepEqual(await trechos(pg), []);
  assert.equal(await texto(pg, '#s-valor'), '2.106');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_dia, []);                            // sem trecho, o dia sai
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('cardio na esteira do Treino (tr_treino.cardio) entra no gasto, só o que passa da basal', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.tabelas.tr_treino[0].cardio = { inicio: Date.parse('2026-09-18T14:00:00+00:00'), ms: 30 * 6e4, vel: 6, incl: 0 };
  const { ctx, pg, erros } = await abrirApp({ nuvem });
  // 30 min a 6 km/h no plano: MET 3,86 × 1998 ÷ 24 × 0,5 h = 161, menos a basal dessa meia hora (42) = 119 · meta 2106 + 119
  assert.equal(await texto(pg, '#s-valor'), '2.225');
  assert.deepEqual(erros, []); await ctx.close();
});

test('sem pesagem no Corpo não há gasto nem saldo, só o que foi comido', async () => {
  const { ctx, pg } = await abrirApp();
  assert.equal(await texto(pg, '#s-valor'), '—');
  assert.deepEqual(await linhasDe(pg, '#s-conta'), ['Comi 0 kcal', 'Sem pesagem no Corpo para calcular o gasto']);
  assert.equal(await pg.isVisible('#andei'), false);
  await ctx.close();
});

test('IA: a frase vira itens na prévia (quantas × porção, com o total), dá pra corrigir; hoje entra o total e fica salva 1 porção', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.ia = iaCom(OVO, PAO);
  const { ctx, pg, erros } = await abrirApp({ nuvem });
  await descrever(pg, '2 ovos mexidos e 1 pão francês');
  await pg.waitForSelector('#previa:not([hidden])');
  assert.equal(nuvem.chamadasIA, 1);
  assert.equal(await pg.locator('#p-lista li').count(), 2);
  assert.deepEqual([await pg.inputValue('#p-lista li:first-child [data-campo="qtd"]'), await pg.inputValue('#p-lista li:first-child [data-campo="porcao"]'),
    await pg.inputValue('#p-lista li:first-child [data-campo="kcal"]')], ['2', '1 unidade (~50 g)', '180']);   // o total dos 2
  await pg.fill('#p-lista li:nth-child(2) [data-campo="kcal"]', '140');   // corrige o pão
  await pg.click('#p-adicionar');
  await pg.waitForSelector('#previa', { state: 'hidden' });
  assert.equal(await pg.inputValue('#f-texto'), '');
  assert.equal(await pg.locator('#lista li').count(), 2);
  assert.match(await texto(pg, '#lista li:first-child'), /^15:30 Ovo mexido 2 × 1 unidade \(~50 g\) P 12,5 · C 1,2 · G 14 180 kcal/);
  // 180 + 140 = 320 comidos · meta 2106 − 320 = 1786 restam
  assert.equal(await texto(pg, '#s-valor'), '1.786');
  // Metas: proteína 1,6 × 100 kg = 160 g · gordura 25% de 2106 ÷ 9 = 59 g · carboidrato (2106 − 640 − 531) ÷ 4 = 234 g
  assert.equal(await texto(pg, '#macros .m-prot p'), 'Proteína 17 / 160 g faltam 143 g');   // 12,5 + 4,7
  assert.equal(await texto(pg, '#macros .m-carb p'), 'Carboidrato 31 / 234 g faltam 203 g');
  assert.equal(await texto(pg, '#macros .m-gord p'), 'Gordura 16 / 59 g faltam 43 g');
  // Barras proporcionais: 17 de 160 g é ~11% da largura, 31 de 234 g ~13%
  const larg = await pg.$$eval('#macros .m-barra', B => B.map(b => Math.round(b.firstElementChild.getBoundingClientRect().width / b.getBoundingClientRect().width * 100)));
  assert.deepEqual(larg, [11, 13, 27]);
  await sincronizado(pg);
  // Salvas por 1 porção: o ovo fica com 90 kcal (180 ÷ 2); o registro de hoje tem qtd 2
  assert.deepEqual(nuvem.tabelas.al_item.map(i => [i.nome, i.porcao, i.kcal, i.prot, i.usos]).sort(), [['Ovo mexido', '1 unidade (~50 g)', 90, 6.25, 1], ['Pão francês', '1 unidade (~50 g)', 140, 4.7, 1]]);
  assert.equal(nuvem.tabelas.al_registro.length, 2);
  assert.ok(nuvem.tabelas.al_registro.every(r => r.data === DIA && r.hora === '15:30'));
  assert.deepEqual(nuvem.tabelas.al_registro.map(r => [r.nome, r.qtd, r.kcal]).sort(), [['Ovo mexido', 2, 90], ['Pão francês', 1, 140]]);

  // Da próxima vez: sugestão ao digitar e nome igual abrem a prévia com 1 porção (pede quantas), sem chamar a IA
  await pg.fill('#f-texto', 'ovo');
  await pg.click('#f-sugestoes [data-item]');
  await pg.waitForSelector('#previa:not([hidden])');
  assert.deepEqual([await pg.inputValue('#p-lista [data-campo="qtd"]'), await pg.inputValue('#p-lista [data-campo="porcao"]'), await pg.inputValue('#p-lista [data-campo="kcal"]')],
    ['1', '1 unidade (~50 g)', '90']);
  assert.equal(await pg.evaluate(() => document.activeElement.dataset.campo), 'qtd');    // já no campo de quantas
  await pg.fill('#p-lista [data-campo="qtd"]', '3');                                     // 3 ovos: o total acompanha
  assert.deepEqual([await pg.inputValue('#p-lista [data-campo="kcal"]'), await pg.inputValue('#p-lista [data-campo="prot"]')], ['270', '18,8']);
  assert.equal(await pg.locator('#lista li').count(), 2);                                // ainda não entrou
  await pg.click('#p-adicionar');
  await descrever(pg, 'pão FRANCES');
  await pg.waitForSelector('#previa:not([hidden])');
  await pg.click('#p-adicionar');
  assert.equal(await pg.locator('#lista li').count(), 4);
  assert.equal(nuvem.chamadasIA, 1);
  assert.equal(await texto(pg, '#s-valor'), '1.376');   // 2106 − 320 − 3 ovos (270) − 1 pão (140)
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_item.map(i => [i.nome, i.kcal, i.usos]).sort(), [['Ovo mexido', 90, 2], ['Pão francês', 140, 2]]);   // a salva continua por 1 porção
  // Campo vazio: as mais usadas
  assert.deepEqual(await pg.$$eval('#f-sugestoes b', bs => bs.map(b => b.textContent)), ['Ovo mexido', 'Pão francês']);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('uma comida salva por nome: repetidas de antes viram uma só (a mais usada) e a IA atualiza a porção da mesma', async () => {
  const nuvem = comTreino(novaNuvem());
  const arroz = (id, porcao, kcal, usos) => ({ user_id: 'x', id, nome: 'Arroz branco', porcao, kcal, prot: 2, carb: 30, gord: 0, usos });
  nuvem.tabelas.al_item.push(arroz('a1', '4,5 colheres de sopa (~112 g)', 140, 1), arroz('a2', '7 colheres de sopa (~175 g)', 220, 3));
  nuvem.tabelas.al_registro.push({ user_id: 'x', id: 'r1', data: '2026-09-17', hora: '12:00', item_id: 'a1', nome: 'Arroz branco', porcao: '4,5 colheres de sopa (~112 g)', qtd: 1, kcal: 140, prot: 2, carb: 30, gord: 0 });
  nuvem.ia = iaCom({ nome: 'arroz BRANCO', porcao: '1 colher de sopa (~25 g)', qtd: 4, kcal: 128, prot: 2.4, carb: 28, gord: 0.4 });
  const { ctx, pg, erros } = await abrirApp({ nuvem });
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_item.map(i => [i.id, i.porcao, i.usos]), [['a2', '7 colheres de sopa (~175 g)', 4]]);   // a mais usada, usos somados
  assert.deepEqual(nuvem.tabelas.al_registro.map(r => [r.item_id, r.kcal]), [['a2', 140]]);                               // o que foi comido não muda
  await pg.fill('#f-texto', 'arroz');
  assert.equal(await pg.locator('#f-sugestoes [data-item]').count(), 1);
  await descrever(pg, '4 colheres de arroz branco');                    // a IA: a mesma comida salva, agora por 1 colher
  await pg.click('#p-adicionar');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_item.map(i => [i.id, i.porcao, i.kcal, i.usos]), [['a2', '1 colher de sopa (~25 g)', 32, 5]]);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('hoje passou da meta: mostra quanto passou (vermelho), e os macros que passaram; dia passado mostra o saldo final', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.ia = iaCom({ nome: 'Rodízio', porcao: '1 noite', kcal: 3000, prot: 150, carb: 300, gord: 120 });
  const { ctx, pg } = await abrirApp({ nuvem });
  await descrever(pg, 'rodízio de pizza');
  await pg.click('#p-adicionar');
  assert.equal(await texto(pg, '#s-valor'), '894');                    // 3000 − 2106
  assert.equal(await texto(pg, '#s-rotulo'), 'kcal acima da meta');
  assert.match(await pg.getAttribute('#saldo', 'class'), /superavit/);
  assert.equal(await texto(pg, '#macros .m-gord i'), 'passou 61 g');   // 120 − 59
  assert.match(await pg.getAttribute('#macros .m-gord i', 'class'), /ruim/);
  assert.equal(await pg.evaluate(() => document.querySelector('#macros .m-gord .m-barra span').style.width), '100%');
  await ctx.close();
});

test('quarta e quinta sem caminhada automática; dia no formato antigo (total do dia) vira 1 trecho sem horário', async () => {
  const nuvem = comTreino(novaNuvem());
  const { ctx, pg } = await abrirApp({ nuvem, relogio: new Date('2026-09-16T09:00:00-03:00') });   // quarta
  assert.deepEqual(await trechos(pg), []);
  assert.equal(await texto(pg, '#c-kcal'), '');
  await ctx.close();
  const antiga = comTreino(novaNuvem());
  antiga.tabelas.al_dia.push({ user_id: 'x', data: '2026-09-17', andou: true, minutos: '40', km: null });
  const b = await abrirApp({ nuvem: antiga });
  await b.pg.click('#d-ant');
  assert.deepEqual(await trechos(b.pg), ['40 min']);                    // dia passado: só leitura, sem ×
  assert.equal(await texto(b.pg, '#c-kcal'), '−132 kcal');
  await b.ctx.close();
});

test('dia de treino (quarta e quinta, e a segunda opcional) ainda sem treino: avisa quanto a meta sobe depois de treinar', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_medida.push({ user_id: 'x', data: '2026-09-10', hora: '', peso: '100', cintura: null });
  nuvem.tabelas.tr_treino.push({ user_id: 'x', inicio: '2026-09-10T13:00:00+00:00', fim: '2026-09-10T13:45:00+00:00', fechado: true });
  const { ctx, pg } = await abrirApp({ nuvem, relogio: new Date('2026-09-16T08:00:00-03:00') });   // quarta, antes de treinar
  // duração média dos treinos: 45 min · 3,5 × 1998 ÷ 24 × 0,75 = 219, menos a basal dessas horas (62) = 157
  assert.equal(await texto(pg, '#s-previsto'), 'Você ganha 157 kcal a mais para comer se treinar');
  assert.equal(await texto(pg, '#s-valor'), '1.898');                    // a meta ainda não conta o treino (2398 − 500)
  await ctx.close();
  const seg = await abrirApp({ nuvem, relogio: new Date('2026-09-14T08:00:00-03:00') });   // segunda: treino extra, opcional
  assert.equal(await texto(seg.pg, '#s-previsto'), 'Você ganha 157 kcal a mais para comer se treinar (treino opcional)');
  await seg.ctx.close();
  const sex = await abrirApp({ nuvem, relogio: new Date('2026-09-18T08:00:00-03:00') });   // sexta: fora da rotina, sem aviso
  assert.equal(await sex.pg.isVisible('#s-previsto'), false);
  await sex.ctx.close();
  const b = await abrirApp({ nuvem: comTreino(novaNuvem()) });         // quinta já com treino registrado: sem aviso
  assert.equal(await b.pg.isVisible('#s-previsto'), false);
  await b.ctx.close();
});

test('segunda (treino opcional) passando da meta sem ter treinado: alerta urgente, treino obrigatório e botão para o Treino', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_medida.push({ user_id: 'x', data: '2026-09-10', hora: '', peso: '100', cintura: null });
  let kcal = 2000;
  nuvem.ia = () => ({ status: 200, corpo: { itens: [{ nome: 'Comida', porcao: '1', kcal, prot: 10, carb: 10, gord: 10 }] } });
  const { ctx, pg } = await abrirApp({ nuvem, relogio: new Date('2026-09-14T20:00:00-03:00') });   // segunda, sem treino registrado
  assert.equal(await pg.isVisible('#s-alerta'), false);                 // dentro da meta: só o aviso amarelo
  assert.equal(await pg.isVisible('#s-previsto'), true);
  // meta 1898 (2398 − 500) · treino previsto 1 h = +208 · comeu 2000: passou 102, o treino cobre
  await descrever(pg, 'jantar'); await pg.click('#p-adicionar');
  assert.equal(await pg.isVisible('#s-alerta'), true);
  assert.equal(await pg.isVisible('#s-previsto'), false);
  assert.equal(await texto(pg, '#s-alerta .alerta-titulo'), 'Treino obrigatório hoje');
  assert.deepEqual(await linhasDe(pg, '#s-alerta-txt'), ['Passou 102 kcal da meta.', 'Se treinar, você ganha 208 kcal e volta para a meta.']);
  assert.equal(await pg.getAttribute('#s-alerta-bt', 'href'), '../tr/');
  // mais 600: passou 702, o treino só reduz (494); sem treino fecha em superávit (2600 − 2398 = 202), com treino ainda déficit
  kcal = 600; await descrever(pg, 'sobremesa'); await pg.click('#p-adicionar');
  assert.deepEqual(await linhasDe(pg, '#s-alerta-txt'), ['Passou 702 kcal da meta.', 'Se treinar, você ganha 208 kcal e o excesso cai para 494 kcal.',
    'Sem treino o dia fecha em superávit de 202 kcal; treinando, ainda fecha em déficit.']);
  await ctx.close();
});

test('dias fixos (quarta e quinta) e dias passados não têm o alerta urgente, mesmo passando da meta', async () => {
  const nuvem = novaNuvem();
  nuvem.tabelas.corpo_medida.push({ user_id: 'x', data: '2026-09-10', hora: '', peso: '100', cintura: null });
  nuvem.tabelas.al_registro.push({ user_id: 'x', id: 'r1', data: '2026-09-14', hora: '20:00', item_id: null, nome: 'Rodízio', porcao: '1', qtd: '1', kcal: '3000', prot: '1', carb: '1', gord: '1' });
  nuvem.ia = iaCom({ nome: 'Rodízio', porcao: '1', kcal: 3000, prot: 1, carb: 1, gord: 1 });
  const { ctx, pg } = await abrirApp({ nuvem, relogio: new Date('2026-09-16T20:00:00-03:00') });   // quarta (fixo)
  await descrever(pg, 'rodízio'); await pg.click('#p-adicionar');
  assert.equal(await texto(pg, '#s-rotulo'), 'kcal acima da meta');
  assert.equal(await pg.isVisible('#s-alerta'), false);
  assert.equal(await pg.isVisible('#s-previsto'), true);
  await pg.click('#semana [data-dia="2026-09-14"]');                    // a segunda que passou: dia fechado, sem alerta
  assert.equal(await pg.isVisible('#s-alerta'), false);
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
  assert.deepEqual(await linhasDe(pg, '#s-conta'), ['Comi 300 kcal', 'Sem pesagem no Corpo para calcular o gasto']);
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
  const nuvem = comTreino(novaNuvem());
  nuvem.tabelas.al_dia.push({ user_id: 'x', data: '2026-09-12', andou: false });   // "não andei" de uma versão antiga: não conta
  const { ctx, pg } = await abrirApp({ nuvem });
  assert.equal(await pg.isDisabled('#d-ant'), true);
  assert.equal(await pg.isDisabled('#d-prox'), true);
  assert.equal(await pg.locator('#semana li').count(), 1);
  assert.match(await texto(pg, '#semana li'), /^Hoje/);
  await ctx.close();
});

test('dias anteriores: ‹ e os últimos 7 dias mostram o dia, com saldo e média dos dias com comida; dia passado é só leitura', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.tabelas.al_registro.push({ user_id: 'x', id: 'r1', data: '2026-09-17', hora: '20:00', item_id: null, nome: 'Pizza', porcao: '4 fatias', qtd: '1', kcal: '1100', prot: '44', carb: '120', gord: '48' });
  const { ctx, pg } = await abrirApp({ nuvem });
  assert.equal(await pg.isDisabled('#d-prox'), true);
  // 17/09 (quinta, dia de treino sem treino registrado, sem caminhada): 2398 · 1100 − 2398 = −1298
  assert.match(await texto(pg, '#semana li:nth-child(2)'), /^Ontem 1\.100 kcal −1\.298$/);
  assert.equal(await texto(pg, '#semana .sem-media'), 'Média de 1 dia fechado: −1.298 kcal/dia');   // hoje ainda não fechou: fora da média
  assert.match(await texto(pg, '#semana li:nth-child(1)'), /^Hoje —$/);
  assert.equal(await pg.locator('#semana li').count(), 2);   // começou ontem: nada antes
  await pg.click('#d-ant');
  assert.equal(await texto(pg, '#d-nome'), 'Ontem');
  assert.equal(await pg.isDisabled('#d-prox'), false);
  assert.equal(await pg.isDisabled('#d-ant'), true);          // 1º dia do app
  assert.match(await texto(pg, '#lista li'), /^20:00 Pizza/);
  assert.equal(await texto(pg, '#s-valor'), '1.298');                  // dia fechado: saldo final, sem sinal (o rótulo diz)
  assert.equal(await texto(pg, '#s-rotulo'), 'kcal de déficit');
  assert.deepEqual(await linhasDe(pg, '#s-conta'), ['Meta 500 kcal déficit 1.898 kcal', 'Comi 1.100 kcal', 'Gastei 2.398 kcal']);
  // Só leitura: campo de comida, sugestões, porções, apagar e a caminhada desativados; nada muda
  for (const sel of ['#f-texto', '#f-enviar', '#c-min', '#c-km', '#c-mais', '#lista select', '#lista [data-apagar]']) assert.equal(await pg.isDisabled(sel), true, sel);
  assert.equal(await pg.locator('#f-sugestoes li').count(), 0);
  assert.equal(await pg.getAttribute('#f-texto', 'placeholder'), 'Dia fechado: só leitura');
  await pg.evaluate(() => mudar(() => { db.registros = []; }));          // nem por código
  assert.equal(await pg.locator('#lista li').count(), 1);
  await pg.click('#semana [data-dia="2026-09-18"]');
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
  await pg.click('#p-adicionar');
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
