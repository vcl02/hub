// No navegador, num app só (cada passo segue o anterior): as marcas Reserva e Comprometido e a Frequência do cadastro, que são a
// ligação tela↔banco. No cadastro vêm desmarcadas e, marcadas, gravam em todas as parcelas; Duplicar e Editar levam as marcas;
// na tabela a célula mostra "—" e o toque grava na hora (na simulação, só na memória); Frequência mensal grava a série até
// dez/2032. O cabeçalho com a pergunta de cada marca está em telas-por-funcao.test.js.
const assert = require('./helpers/assert-tolerante');
const { test } = require('node:test');
const { prepararNavegador, abrirFin, dadosDeExemplo } = require('./helpers/navegador');

prepararNavegador();
const linha = (id) => `#out tr[data-sid="${id}"]`;

const celula = (pg, chave, id) =>
  pg.$eval(`${linha(id)} [data-tog-flag="${chave}:${id}"]`, (e) => e.textContent.trim());

async function cadastroComMarcas(c) {
  const { pg, dados } = c;

  await pg.click('#abreNovo');
  await pg.waitForSelector('#modalNovo', { state: 'visible' });
  assert.deepEqual(
    [await pg.isChecked('#fReserva'), await pg.isChecked('#fComprometido')],
    [false, false]
  );
  await pg.$eval('#fReserva', (e) => e.click());
  await pg.$eval('#fComprometido', (e) => e.click());
  await pg.fill('#fNome', 'Escola');
  await pg.fill('#fValor', '90000');
  await pg.fill('#fCateg', 'Educação');
  await pg.selectOption('#fParcelas', '3');
  await pg.click('#salvaNovo');
  await pg.waitForFunction(() =>
    /^Salvo/.test(document.getElementById('erroNovo').textContent)
  );
  const serie = dados.fin.filter((l) => l.nome === 'Escola');

  assert.equal(serie.length, 3);
  assert.ok(
    serie.every((l) => l.reserva === true && l.comprometido === true),
    JSON.stringify(serie)
  );
  await pg.click('#fechaNovo');
  await pg.waitForSelector('#modalNovo', { state: 'hidden' });
}

async function frequenciaMensal(c) {
  const { pg, dados, ocioso } = c;

  await pg.click('#abreNovo');
  await pg.waitForSelector('#modalNovo', { state: 'visible' });
  await pg.fill('#fNome', 'Internet');
  await pg.fill('#fValor', '10000');
  await pg.fill('#fCateg', 'Casa');
  await pg.selectOption('#fFreq', 'Mensal');
  assert.equal(await pg.isDisabled('#fParcelas'), true);
  assert.equal(await pg.locator('[data-fatura-parcela]').count(), 1); // só a 1ª fatura
  assert.equal(await pg.getAttribute('#faturaPrincipal select', 'title'), '1ª fatura');
  await pg.fill('#fData', '');
  await pg.click('#salvaNovo');
  assert.equal(await pg.textContent('#erroNovo'), 'Escolha a data da 1ª ocorrência.');
  await pg.fill('#fData', '2026-10-20');
  await pg.$eval('#fDivide', (e) => {
    if (e.checked) e.click();
  }); // conta mensal: o valor se repete (marcado, divide entre as 75)
  await pg.click('#salvaNovo');
  await pg.waitForFunction(() =>
    /^Salvo/.test(document.getElementById('erroNovo').textContent)
  );
  await ocioso();

  const serie = dados.fin
    .filter((l) => l.nome === 'Internet')
    .sort((a, b) => a.data.localeCompare(b.data));

  assert.equal(serie.length, 75); // out/2026 a dez/2032
  assert.deepEqual(
    [serie[0].data, serie.at(-1).data, serie[0].fatura, serie[1].fatura],
    ['2026-10-20', '2032-12-20', '2026-11-12', '2026-12-12']
  );
  assert.ok(serie.every((l) => l.freq === 'Mensal' && l.valor === -100));
  assert.equal(await pg.inputValue('#fFreq'), ''); // de volta a "sem recorrência"
  assert.equal(await pg.isDisabled('#fParcelas'), false);
  await pg.click('#fechaNovo');
  await pg.waitForSelector('#modalNovo', { state: 'hidden' });
  await ocioso();
}

async function duplicarEEditar(c) {
  const { pg, ocioso, corpos } = c;

  await pg.click(linha(1) + ' td:last-child');
  await pg.click('#seldup');
  await pg.waitForSelector('#modalNovo', { state: 'visible' });
  assert.deepEqual(
    [await pg.isChecked('#fReserva'), await pg.isChecked('#fComprometido')],
    [true, false]
  );
  await pg.click('#fechaNovo');
  await pg.waitForSelector('#modalNovo', { state: 'hidden' });
  await ocioso(); // fechar limpa a seleção logo depois: espera acabar

  if (!(await pg.isVisible('#selbar'))) await pg.click(linha(1) + ' td:last-child'); // fechar o cadastro pode limpar a seleção
  await pg.click('#seledit');
  await pg.waitForSelector('#modalNovo', { state: 'visible' });
  assert.deepEqual(
    [await pg.isChecked('#fReserva'), await pg.isChecked('#fComprometido')],
    [true, false]
  );
  await pg.fill('#fNome', 'Salário extra');
  await pg.click('#salvaNovo');
  await pg.waitForFunction(() =>
    /Salário extra/.test(document.getElementById('out').textContent)
  );
  assert.ok(
    corpos.some(
      (c) => c.reserva === true && c.comprometido === false && c.nome === 'Salário extra'
    ),
    JSON.stringify(corpos)
  );
}

async function marcaNaTabela(c) {
  const { pg, dados, escritas } = c;
  const antes = escritas.length; // as gravações dos passos de antes

  assert.equal(await celula(pg, 'reserva', '2'), '—');
  await pg.click(`${linha(2)} [data-tog-flag="reserva:2"]`);
  await pg.waitForFunction(
    () =>
      document
        .querySelector('#out tr[data-sid="2"] [data-tog-flag="reserva:2"]')
        .textContent.trim() !== '—'
  );
  assert.equal(dados.fin.find((l) => l.id === '2').reserva, true);
  assert.deepEqual(escritas.slice(antes), [['PATCH', 'fin']]);
  await pg.click('#toggleSimulacao');
  await pg.waitForFunction(() =>
    document.getElementById('toggleSimulacao').classList.contains('ativo')
  );
  await pg.click(`${linha(2)} [data-tog-flag="comprometido:2"]`);
  await pg.waitForFunction(
    () =>
      document
        .querySelector('#out tr[data-sid="2"] [data-tog-flag="comprometido:2"]')
        .textContent.trim() !== '—'
  );
  assert.deepEqual(escritas.slice(antes), [['PATCH', 'fin']]); // nada a mais no banco
  assert.equal(dados.fin.find((l) => l.id === '2').comprometido, undefined);
}

test('as marcas Reserva e Comprometido: o cadastro grava nas parcelas, Duplicar e Editar levam as duas, a tabela grava na hora e na simulação só na tela', async () => {
  const d = dadosDeExemplo();

  Object.assign(
    d.fin.find((l) => l.id === '1'),
    { reserva: true, comprometido: false }
  );
  const { ctx, pg, erros, dados, escritas, ocioso } = await abrirFin('', d);
  const corpos = [];

  pg.on('request', (r) => {
    if (r.method() === 'PATCH') corpos.push(JSON.parse(r.postData()));
  });
  const c = { pg, dados, escritas, ocioso, corpos };

  await cadastroComMarcas(c);
  await frequenciaMensal(c);
  await duplicarEEditar(c);
  await marcaNaTabela(c);
  assert.deepEqual(erros, []);
  await ctx.close();
});
