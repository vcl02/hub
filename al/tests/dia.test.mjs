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

test('dois aparelhos no mesmo dia: a caminhada mescla com a nuvem (nada do outro aparelho some)', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp({ nuvem: comTreino(novaNuvem()) });   // 18/09, 15:30
  await pg.click('#c-mais');
  await sincronizado(pg);
  nuvem.tabelas.al_dia[0].caminhadas = [{ hora: '14:00', km: 1 }, ...nuvem.tabelas.al_dia[0].caminhadas];   // outro aparelho
  await pg.clock.fastForward('00:10:00');
  await pg.click('#c-mais');                                             // este envia o dia: mescla, não sobrescreve
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_dia[0].caminhadas.map(t => t.hora), ['14:00', '15:30', '15:40']);
  assert.deepEqual(await trechos(pg), ['14:00 · 1 km ×', '15:30 · 20 min ×', '15:40 · 20 min ×']);
  assert.deepEqual(erros, []); await ctx.close();
});

test('toque duplo sem querer no "Andei +" lança um trecho só', async () => {
  const { ctx, pg, erros } = await abrirApp({ nuvem: comTreino(novaNuvem()) });
  await pg.dblclick('#c-mais');
  assert.deepEqual(await trechos(pg), ['15:30 · 20 min ×']);
  assert.deepEqual(erros, []); await ctx.close();
});

test('metrô: o envio da caminhada chega ao banco mas a resposta se perde; o próximo não soma o mesmo trecho de novo', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp({ nuvem: comTreino(novaNuvem()) });   // 18/09, 15:30
  nuvem.perderResposta = 1;
  await pg.click('#c-mais');
  await pg.waitForFunction(() => erroSync && !enviando);                  // falhou sem resposta: fica pendente
  assert.equal(nuvem.tabelas.al_dia[0].caminhadas.length, 1);             // mas o banco já gravou
  await pg.evaluate(() => enviar());                                       // a próxima tentativa
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_dia[0].caminhadas.map(t => t.hora), ['15:30']);   // um trecho só
  assert.deepEqual(await trechos(pg), ['15:30 · 20 min ×']);
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

test('comida salva por nome + medida: medidas diferentes ficam separadas; repetidas iguais viram uma só', async () => {
  const nuvem = comTreino(novaNuvem());
  const feijao = (id, porcao, kcal, usos) => ({ user_id: 'x', id, nome: 'Feijão', porcao, kcal, prot: 3, carb: 9, gord: 0.3, usos });
  nuvem.tabelas.al_item.push(feijao('f1', '1 concha pequena (~70 g)', 53, 2), feijao('f2', '1 concha pequena (~70 g)', 53, 1));
  nuvem.tabelas.al_registro.push({ user_id: 'x', id: 'r1', data: '2026-09-17', hora: '12:00', item_id: 'f2', nome: 'Feijão', porcao: '1 concha pequena (~70 g)', qtd: 1, kcal: 53, prot: 3, carb: 9, gord: 0.3 });
  nuvem.ia = iaCom({ nome: 'feijão', porcao: '1 concha normal (~100 g)', qtd: 1, kcal: 76, prot: 4.8, carb: 13.6, gord: 0.5 });
  const { ctx, pg, erros } = await abrirApp({ nuvem });
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_item.map(i => [i.id, i.usos]), [['f1', 3]]);                // mesma medida: uma só, usos somados
  assert.deepEqual(nuvem.tabelas.al_registro.map(r => [r.item_id, r.kcal]), [['f1', 53]]);      // o que foi comido não muda
  await descrever(pg, '1 concha normal de feijão');                    // medida nova: outra comida salva
  await pg.click('#p-adicionar');
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_item.map(i => [i.nome, i.porcao, i.kcal]).sort(), [['Feijão', '1 concha pequena (~70 g)', 53], ['feijão', '1 concha normal (~100 g)', 76]]);
  await pg.fill('#f-texto', 'feijao');
  assert.equal(await pg.locator('#f-sugestoes [data-item]').count(), 2);   // as duas medidas
  await pg.press('#f-texto', 'Enter');                                     // nome igual com 2 medidas: escolhe na sugestão
  assert.equal(await texto(pg, '#toast'), 'Escolha a medida nas sugestões');
  assert.equal(await pg.isVisible('#previa'), false);
  assert.equal(nuvem.chamadasIA, 1);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('bebidas lançadas na Água (suco, refri…) contam como comido: na lista, só para ver, e no saldo e nos macros', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.tabelas.agua_dia.push({ user_id: 'x', data: DIA, aguas: [{ hora: '10:00', ml: 200 }, { hora: '12:27', ml: 132, bebida: 'suco', volume: 150 }] });
  const { ctx, pg, erros } = await abrirApp({ nuvem });
  // suco 150 ml: 40 kcal e 10 g de carboidrato por 100 ml = 60 kcal e 15 g · a água pura não entra
  assert.equal(await pg.locator('#lista li').count(), 1);
  assert.match(await texto(pg, '#lista li.da-agua'), /^12:27 Suco 150 ml · da Água P 0 · C 15 · G 0 60 kcal$/);
  assert.equal(await pg.locator('#lista li.da-agua select, #lista li.da-agua button').count(), 0);   // muda na Água, não aqui
  assert.equal(await texto(pg, '#s-valor'), '2.046');                  // 2106 − 60
  assert.match(await texto(pg, '#macros .m-carb p'), /^Carboidrato 15 \//);
  assert.equal(nuvem.tabelas.agua_dia[0].aguas.length, 2);              // só lê a Água
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('marmita: guarda a prévia sem entrar na conta; aplicar abre a prévia com as quantidades e gasta uma; a última some', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.ia = iaCom({ nome: 'Arroz branco', porcao: '1 colher de sopa (~25 g)', qtd: 6, kcal: 192, prot: 3.6, carb: 42, gord: 0.6 },
    { nome: 'Frango grelhado', porcao: '100 g', qtd: 1.5, kcal: 240, prot: 48, carb: 0, gord: 4.5 });
  const { ctx, pg, erros } = await abrirApp({ nuvem });
  await descrever(pg, 'marmita: 6 colheres de arroz e 150 g de frango');
  await pg.waitForSelector('#previa:not([hidden])');
  await pg.fill('#p-m-nome', 'Almoço'); await pg.fill('#p-m-qtd', '2');
  await pg.click('#p-marmita');
  assert.equal(await texto(pg, '#toast'), 'Marmita guardada (2): Almoço');
  assert.equal(await pg.isVisible('#previa'), false);
  assert.equal(await pg.locator('#lista li').count(), 0);                // não entrou na conta
  assert.equal(await texto(pg, '#s-valor'), '2.106');
  assert.match(await texto(pg, '#marmitas li'), /^Almoço 2 itens · restam 2 432 kcal/);
  await sincronizado(pg);
  const linha = nuvem.tabelas.al_marmita[0];
  assert.deepEqual([linha.nome, linha.restam, linha.itens.map(i => [i.nome, i.qtd, i.kcal])], ['Almoço', 2, [['Arroz branco', 6, 32], ['Frango grelhado', 1.5, 160]]]);   // por porção
  // No dia seguinte (aqui, já): aplicar abre a prévia com os itens; comeu só metade do arroz
  await pg.click('[data-marmita]');
  await pg.waitForSelector('#previa:not([hidden])');
  assert.equal(await pg.isVisible('#p-guardar'), false);                 // aplicando, não guarda outra
  assert.deepEqual(await pg.$$eval('#p-lista [data-campo="qtd"]', L => L.map(x => x.value)), ['6', '1,5']);
  await pg.fill('#p-lista li:first-child [data-campo="qtd"]', '3');
  await pg.click('#p-adicionar');
  assert.equal(await texto(pg, '#toast'), 'Almoço aplicada (restam 1)');
  assert.equal(await pg.locator('#lista li').count(), 2);
  assert.equal(await texto(pg, '#s-valor'), '1.770');                    // 2106 − 96 (3 colheres) − 240
  await sincronizado(pg);
  assert.equal(nuvem.tabelas.al_marmita[0].restam, 1);
  await pg.click('[data-marmita]'); await pg.click('#p-adicionar');       // a última: some (e sai da nuvem)
  assert.equal(await pg.locator('#marmitas li').count(), 0);
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.al_marmita, []);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('marmita: × com toque duplo joga fora; sem a tabela (migration 03 pendente), o app segue sem marmitas', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.tabelas.al_marmita.push({ user_id: 'x', id: 'm1', nome: 'Janta', restam: 3, itens: [{ nome: 'Sopa', porcao: '1 concha', qtd: 2, kcal: 90, prot: 4, carb: 12, gord: 3 }] });
  const a = await abrirApp({ nuvem });
  await a.pg.click('[data-jogar="m1"]');
  assert.equal(await a.pg.locator('#marmitas li').count(), 1);           // 1º toque só arma
  await a.pg.click('[data-jogar="m1"]');
  await sincronizado(a.pg);
  assert.deepEqual(nuvem.tabelas.al_marmita, []);
  await a.ctx.close();
  const sem = comTreino(novaNuvem()); delete sem.tabelas.al_marmita;
  sem.ia = iaCom(PAO);
  const b = await abrirApp({ nuvem: sem });
  await descrever(b.pg, 'pão');
  await b.pg.waitForSelector('#previa:not([hidden])');
  assert.equal(await b.pg.isVisible('#p-guardar'), false);
  await b.pg.click('#p-adicionar');
  await sincronizado(b.pg);
  assert.equal(sem.tabelas.al_registro.length, 1);                       // o resto segue normal
  assert.equal(await b.pg.isVisible('#sync'), false);
  assert.deepEqual(b.erros, []);
  await b.ctx.close();
});

test('hoje passou da meta mas ainda abaixo do gasto: diz que ainda está em déficit (menor que os 500 planejados)', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.ia = iaCom({ nome: 'Marmita', porcao: '1', kcal: 2300, prot: 100, carb: 250, gord: 80 });
  const { ctx, pg, erros } = await abrirApp({ nuvem });
  assert.equal(await pg.isVisible('#s-ainda'), false);                  // dentro da meta: nada
  await descrever(pg, 'marmita'); await pg.click('#p-adicionar');
  assert.equal(await texto(pg, '#s-valor'), '194');                     // 2300 − 2106
  assert.equal(await texto(pg, '#s-rotulo'), 'kcal acima da meta');
  assert.equal(await texto(pg, '#s-ainda'), 'Ainda em déficit de 306 kcal');   // 2606 − 2300
  assert.match(await pg.getAttribute('#s-ainda', 'class'), /bom/);
  assert.deepEqual(erros, []); await ctx.close();
});

test('hoje passou da meta: mostra quanto passou (vermelho), e os macros que passaram; dia passado mostra o saldo final', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.ia = iaCom({ nome: 'Rodízio', porcao: '1 noite', kcal: 3000, prot: 150, carb: 300, gord: 120 });
  const { ctx, pg } = await abrirApp({ nuvem });
  await descrever(pg, 'rodízio de pizza');
  await pg.click('#p-adicionar');
  assert.equal(await texto(pg, '#s-valor'), '894');                    // 3000 − 2106
  assert.equal(await texto(pg, '#s-rotulo'), 'kcal acima da meta');
  assert.equal(await texto(pg, '#s-ainda'), 'Já em superávit de 394 kcal');   // 3000 − 2606 (o gasto do dia inteiro)
  assert.match(await pg.getAttribute('#s-ainda', 'class'), /ruim/);
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

test('aberto pela página inicial num dia anterior (?dia=): abre nele, só leitura; › volta para hoje', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.tabelas.al_registro.push({ user_id: 'x', id: 'r1', data: '2026-09-17', hora: '20:00', item_id: null, nome: 'Pizza', porcao: '4 fatias', qtd: '1', kcal: '1100', prot: '44', carb: '120', gord: '48' });
  const { ctx, pg, erros } = await abrirApp({ nuvem, busca: '?dia=2026-09-17' });
  assert.equal(await texto(pg, '#d-nome'), 'Ontem');
  assert.equal(await pg.isDisabled('#f-texto'), true);
  assert.equal(await pg.isDisabled('#c-mais'), true);
  await pg.click('#d-prox');
  assert.equal(await texto(pg, '#d-nome'), 'Hoje');
  assert.equal(await pg.isDisabled('#f-texto'), false);
  assert.equal(await pg.evaluate(() => location.search), '');                // hoje: sem ?dia
  await pg.click('#d-ant');                                                  // trocar o dia põe o ?dia, como o ?ciclo do Fin
  assert.equal(await pg.evaluate(() => location.search), '?dia=2026-09-17');
  await pg.goBack();                                                         // Voltar do navegador: o dia visto antes
  await pg.waitForFunction(() => document.getElementById('d-nome').textContent === 'Hoje');
  await pg.reload(); await pg.waitForSelector('#v-dia:not([hidden])');
  assert.equal(await texto(pg, '#d-nome'), 'Hoje');
  assert.deepEqual(erros, []); await ctx.close();
  const semNada = await abrirApp({ nuvem: comTreino(novaNuvem()), busca: '?dia=2026-09-10' });   // dia antes de qualquer lançamento no al: abre nele mesmo
  assert.notEqual(await texto(semNada.pg, '#d-nome'), 'Hoje');
  assert.equal(await semNada.pg.evaluate(() => [diaVisto, location.search].join(' ')), '2026-09-10 ?dia=2026-09-10');
  await semNada.ctx.close();
  const hojeMesmo = await abrirApp({ nuvem: comTreino(novaNuvem()), busca: '?dia=2026-09-18' });   // hoje (ou futuro): o app normal
  assert.equal(await texto(hojeMesmo.pg, '#d-nome'), 'Hoje');
  await hojeMesmo.ctx.close();
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

test('trocar o dia arrastando de lado (para a direita, o anterior) e com ← → no computador; no campo de texto as setas não trocam', async () => {
  const nuvem = comTreino(novaNuvem());
  nuvem.tabelas.al_registro.push({ user_id: 'x', id: 'r1', data: '2026-09-17', hora: '20:00', item_id: null, nome: 'Pizza', porcao: '4 fatias', qtd: '1', kcal: '1100', prot: '44', carb: '120', gord: '48' });
  const { ctx, pg, erros } = await abrirApp({ nuvem });
  const arrastar = async (x1, x2) => {
    const b = await pg.locator('#saldo').boundingBox(), y = b.y + b.height / 2;   // sobre o saldo (campo de texto não arrasta)
    const cdp = await ctx.newCDPSession(pg);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / 10, y }] }); await pg.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await arrastar(60, 330);
  assert.equal(await texto(pg, '#d-nome'), 'Ontem');
  await arrastar(60, 330);                                                // 1º dia do app: para
  assert.equal(await texto(pg, '#d-nome'), 'Ontem');
  await arrastar(330, 60);
  assert.equal(await texto(pg, '#d-nome'), 'Hoje');
  await pg.locator('#d-nome').click();                                   // foco fora dos campos
  await pg.keyboard.press('ArrowLeft');
  assert.equal(await texto(pg, '#d-nome'), 'Ontem');
  await pg.keyboard.press('ArrowRight');
  assert.equal(await texto(pg, '#d-nome'), 'Hoje');
  await pg.focus('#f-texto'); await pg.keyboard.press('ArrowLeft');     // digitando: a seta anda no texto
  assert.equal(await texto(pg, '#d-nome'), 'Hoje');
  assert.deepEqual(erros, []); await ctx.close();
});

test('Esc: fecha a prévia aberta; num campo só tira o foco; sem nada aberto, sai do app (volta para a página inicial do hub)', async () => {
  const nuvem = novaNuvem();
  nuvem.ia = iaCom(OVO);
  const { ctx, pg, erros } = await abrirApp({ nuvem });
  await pg.evaluate(() => { window.saidas = 0; sairDoApp = () => { saidas++; }; });   // fora do hub ../ é a própria raiz
  await descrever(pg, 'ovo');
  await pg.waitForSelector('#previa:not([hidden])');
  await pg.keyboard.press('Escape');
  assert.equal(await pg.isVisible('#previa'), false);
  assert.equal(await pg.evaluate(() => saidas), 0);
  await pg.focus('#f-texto'); await pg.keyboard.press('Escape');
  assert.deepEqual(await pg.evaluate(() => [saidas, document.activeElement.id]), [0, '']);
  await pg.keyboard.press('Escape');
  assert.equal(await pg.evaluate(() => saidas), 1);
  assert.deepEqual(erros, []); await ctx.close();
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
