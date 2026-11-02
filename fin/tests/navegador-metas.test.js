// No navegador, só a ligação tela↔banco do modal de metas (as contas e o HTML estão em metas.test.js e telas-por-funcao.test.js):
// cada campo grava o que deve e só quando deve (o mês com o ano pela metade não grava; a entrada nova volta o mês dela pra 1 mês
// antes; entrada depois do mês da meta não vale), Mês a mês abre o detalhe, Excluir pede confirmação, Comprar abre o cadastro da
// compra e marca a meta como comprada, "Mínimo" grava as vezes que cabem e, na simulação, nada vai ao banco.
const assert = require('./helpers/assert-tolerante');
const { test } = require('node:test');

const {
  prepararNavegador,
  abrirFin,
  dadosDeExemplo,
  esperar,
} = require('./helpers/navegador');

prepararNavegador();

// Ciclos de setembro/2026 a dezembro/2027 (o último aberto) e uma meta à vista em novembro
function dadosComMeta(meta = {}, outras = []) {
  const d = dadosDeExemplo();

  d.fin_ciclo = Array.from({ length: 16 }, (_, i) => {
    const ini = new Date(Date.UTC(2026, 8 + i, 15)),
      fim = new Date(Date.UTC(2026, 9 + i, 14));

    return {
      id: i + 1,
      inicio: ini.toISOString().slice(0, 10),
      fim: i === 15 ? null : fim.toISOString().slice(0, 10),
    };
  });
  d.fin_meta = [
    {
      id: 7,
      nome: 'Mesa',
      valor: 1500,
      mes: '2026-11-01',
      forma: 'avista',
      parcelas: null,
      entrada: null,
      meses_ate_parcela: null,
      status: 'aberta',
      ...meta,
    },
    ...outras,
  ];

  return d;
}

async function abrirMetas(meta, outras) {
  const r = await abrirFin('', dadosComMeta(meta, outras));

  await r.pg.click('#btMetas');
  await r.pg.waitForSelector('#modalMetas', { state: 'visible' });

  return r;
}

const campo = (c, id = 7) => `#corpoMetas [data-meta="${id}"] [data-campo="${c}"]`;

// Como o navegador faz ao terminar de digitar num campo: o valor e o change
const mudar = (pg, c, valor, id = 7) =>
  pg.$eval(
    campo(c, id),
    (i, v) => {
      i.value = v;
      i.dispatchEvent(new Event('change', { bubbles: true }));
    },
    valor
  );

// Depois de gravar, o Fin recarrega em segundo plano e redesenha o modal: o próximo passo espera isso acabar
const patches = (escritas) =>
  escritas.filter(([m, t]) => m === 'PATCH' && t === 'fin_meta').length;

// Espera a gravação chegar ao banco falso (o Fin pede o token antes de mandar) e a recarga em segundo plano terminar
async function gravou(escritas, ocioso, n) {
  for (let i = 0; i < 100 && patches(escritas) < n; i++)
    await new Promise((ok) => setTimeout(ok, 50));
  await ocioso();
}

test('modal de metas: cada campo grava só quando deve, Mês a mês abre, Excluir pede confirmação e Comprar marca a meta como comprada', async () => {
  const carro = {
    id: 8,
    nome: 'Carro',
    valor: 6000,
    mes: '2026-11-01',
    forma: 'financiamento',
    parcelas: 10,
    entrada: null,
    meses_ate_parcela: null,
    status: 'aberta',
  };

  const { ctx, pg, erros, dados, escritas, ocioso } = await abrirMetas({}, [carro]);
  const meta = (id) => dados.fin_meta.find((m) => m.id === id);

  // campos da meta 7 (à vista): cada mudança grava; o mês com o ano pela metade não grava; valor inválido avisa e não grava
  await mudar(pg, 'nome', 'Mesa de jantar');
  await gravou(escritas, ocioso, 1);
  assert.equal(meta(7).nome, 'Mesa de jantar');
  await mudar(pg, 'mes', '0202-01');
  await new Promise((ok) => setTimeout(ok, 300));
  await ocioso(); // o navegador manda o ano a cada dígito
  assert.equal(patches(escritas), 1);
  await mudar(pg, 'mes', '2027-01');
  await gravou(escritas, ocioso, 2);
  assert.equal(meta(7).mes, '2027-01-01');
  await mudar(pg, 'valor', '0,00'); // valor total zero não vale
  await pg.waitForFunction(() =>
    [...document.querySelectorAll('#toast strong')].some(
      (t) => t.textContent === 'Valor inválido'
    )
  );
  await ocioso();
  assert.equal(meta(7).valor, 1500);
  assert.equal(patches(escritas), 2);

  // parcelado (meta 8): digitar Vezes ainda não grava (sair do campo grava); entrada nova vai pra 1 mês antes; entrada depois do mês não vale
  const parcelas = campo('parcelas', 8);

  await pg.fill(parcelas, '20');
  assert.equal(patches(escritas), 2); // digitando, ainda não grava
  await pg.press(parcelas, 'Tab'); // saiu do campo: grava
  await gravou(escritas, ocioso, 3);
  assert.equal(meta(8).parcelas, 20);
  await mudar(pg, 'entrada', '1.000,00', 8);
  await gravou(escritas, ocioso, 4);
  await pg.waitForFunction(() =>
    document.querySelector('#corpoMetas [data-meta="8"] [data-campo="mes_entrada"]')
  );
  assert.deepEqual([meta(8).entrada, meta(8).meses_ate_parcela], [1000, 1]); // 1 mês antes da 1ª parcela
  await mudar(pg, 'mes_entrada', '2027-03', 8); // depois de novembro/2026: não vale
  await pg.waitForFunction(() =>
    [...document.querySelectorAll('#toast strong')].some(
      (t) => t.textContent === 'Mês inválido'
    )
  );
  assert.equal(patches(escritas), 4);

  // Mês a mês abre o detalhe da meta 7
  await pg.click('#corpoMetas [data-meta="7"] [data-acao=mesAMes]');
  await pg.waitForSelector('#modalPlanoMeta', { state: 'visible' });
  assert.match(await pg.textContent('#corpoPlanoMeta'), /Comprometido/);
  await pg.keyboard.press('Escape');

  // Excluir a meta 8 pede confirmação (recusar não apaga)
  let resposta = false;

  pg.on('dialog', (d) => (resposta ? d.accept() : d.dismiss()));
  await pg.click('#corpoMetas [data-meta="8"] [data-acao=excluir]');
  await new Promise((ok) => setTimeout(ok, 200));
  assert.equal(dados.fin_meta.length, 2); // recusou
  resposta = true;
  await pg.click('#corpoMetas [data-meta="8"] [data-acao=excluir]');
  await pg.waitForFunction(() => !document.querySelector('#corpoMetas [data-meta="8"]'));
  assert.deepEqual(
    [dados.fin_meta.length, escritas.filter(([m]) => m === 'DELETE').length],
    [1, 1]
  );
  await ocioso();

  // Comprar a meta 7: abre o cadastro com a compra; salvar grava o lançamento e marca a meta como comprada
  await pg.click('#corpoMetas [data-meta="7"] [data-acao=comprar]');
  await pg.waitForSelector('#modalNovo', { state: 'visible' });
  assert.equal(await pg.isVisible('#modalMetas'), false);
  assert.equal(await pg.inputValue('#fNome'), 'Mesa de jantar');
  await pg.fill('#fCateg', 'Casa');
  await pg.click('#salvaNovo');
  await pg.waitForFunction(
    () =>
      /^Salvo/.test(document.getElementById('erroNovo').textContent) ||
      !document.getElementById('modalNovo').open
  );

  for (let i = 0; i < 20 && meta(7).status !== 'comprada'; i++)
    await new Promise((ok) => setTimeout(ok, 100));
  assert.equal(meta(7).status, 'comprada');
  const compra = dados.fin.find((l) => l.nome === 'Mesa de jantar');

  assert.ok(compra, 'o lançamento da compra não foi gravado');
  assert.equal(compra.valor, -1500);
  assert.deepEqual(erros, []);
  await ctx.close();
});

// Uma meta que não cabe: R$ 60.000 em 3× no débito em dezembro, com o salário de cada mês lançado
function dadosQueNaoCabe() {
  const d = dadosComMeta({
    nome: 'Carro',
    valor: 60000,
    mes: '2026-12-01',
    forma: 'financiamento',
    parcelas: 3,
  });

  d.fin.push(
    ...Array.from({ length: 15 }, (_, i) => ({
      id: String(100 + i),
      nome: 'Salário',
      data: new Date(Date.UTC(2026, 10 + i, 15)).toISOString().slice(0, 10),
      valor: 9000,
      categ: 'Salário',
      cred: false,
      pago: false,
      fatura: null,
      freq: null,
    }))
  );

  return d;
}

async function abrirQueNaoCabe() {
  const r = await abrirFin('', dadosQueNaoCabe());

  await r.pg.click('#btMetas');
  await r.pg.waitForSelector('#modalMetas', { state: 'visible' });

  return r;
}

test('meta que não cabe: Mínimo grava as vezes que cabem', async () => {
  const { ctx, pg, erros, dados, ocioso } = await abrirQueNaoCabe();
  const minimo = await pg.getAttribute('#corpoMetas [data-acao=usarVezes]', 'data-vezes');

  await pg.click('#corpoMetas [data-acao=usarVezes]');
  await esperar(() => dados.fin_meta[0].parcelas !== 3);
  await ocioso();
  assert.equal(dados.fin_meta[0].parcelas, +minimo);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('Mês a mês da meta que não cabe: o comprometido abre a lista; Simular a receita liga a simulação e nada vai ao banco', async () => {
  const { ctx, pg, erros, dados, escritas, ocioso } = await abrirFin(
    '',
    dadosQueNaoCabe()
  );

  await pg.click('#btMetas');
  await pg.waitForSelector('#modalMetas', { state: 'visible' });
  await pg.click('#corpoMetas [data-meta="7"] [data-acao=mesAMes]');
  await pg.waitForSelector('#modalPlanoMeta', { state: 'visible' });
  await pg.click('#corpoPlanoMeta [data-acao=verComprometidos]');
  await pg.waitForSelector('#modalComprometidos', { state: 'visible' });
  await pg.keyboard.press('Escape');
  await pg.click('#corpoPlanoMeta [data-acao=simularReceita]');
  await pg.waitForFunction(() =>
    document.getElementById('toggleSimulacao').classList.contains('ativo')
  );
  await pg.keyboard.press('Escape'); // fecha o Mês a mês; o modal das metas continua aberto
  await pg.click('#corpoMetas [data-acao=usarVezes]'); // na simulação: só na memória
  await ocioso();
  await new Promise((ok) => setTimeout(ok, 300));
  assert.deepEqual(escritas, []); // simular é só na memória
  assert.equal(dados.fin_meta[0].parcelas, 3);
  assert.deepEqual(erros, []);
  await ctx.close();
});
