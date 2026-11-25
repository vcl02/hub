// Aba parada (sem navegador): o al aberto horas ou dias num aparelho, outro aparelho mexe na mesma comida salva, comida do dia
// ou marmita, e este mexe depois. O banco.js publicado roda inteiro (../../tests/nuvem-falsa.mjs) com uma nuvem falsa: nenhuma
// linha sobe inteira por cima do que este aparelho não viu (enviarMesclado do núcleo), contadores somam as duas mudanças e
// apagar não apaga o que mudou na nuvem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rodarBanco } from '../../tests/nuvem-falsa.mjs';

const HUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = (a) => path.join(HUB, a);
const json = (x) => JSON.parse(JSON.stringify(x));

const HOJE = '2026-11-24',
  V = { kcal: 100, prot: 10, carb: 10, gord: 2 };

function aparelho(d) {
  const nuvem = { tabelas: {} },
    B = rodarBanco(
      [
        A('base/nucleo.js'),
        A('corpo/perfil.js'),
        A('agua/bebidas.js'),
        A('al/gasto.js'),
        A('al/js/config.js'),
        A('al/js/util.js'),
        A('al/js/banco.js'),
      ],
      {
        nuvem,
        nomes: ['enviar', 'preparar', 'linhas', 'temPendente'],
        estado: ['db', 'base', 'usuario', 'erroSync'],
      }
    );

  B.E.usuario = { id: 'u1' };
  B.E.db = B.preparar(d);
  B.E.base = B.linhas(B.E.db);

  for (const [t, L] of Object.entries(B.E.base))
    nuvem.tabelas[t] = Object.values(L).map((l) => ({ user_id: 'u1', ...json(l) }));

  return { B, nuvem };
}

const linhaDe = (nuvem, t, id) => nuvem.tabelas[t].find((l) => l.id === id);

test('aba parada: comida salva mexida nos dois aparelhos (nome aqui, kcal lá) fica com as duas mudanças; os usos somam', async () => {
  const { B, nuvem } = aparelho({
    itens: [{ id: 'i1', nome: 'Arroz', porcao: '100 g', ...V, usos: 3 }],
    registros: [],
    dias: [],
    marmitas: [
      { id: 'm1', nome: 'Frango', restam: 4, itens: [{ nome: 'Frango', ...V }] },
    ],
  });

  // outro aparelho: kcal da comida, usou mais uma vez; comeu uma marmita
  Object.assign(linhaDe(nuvem, 'al_item', 'i1'), { kcal: 130, usos: 4 });
  linhaDe(nuvem, 'al_marmita', 'm1').restam = 3;

  // este (cópia velha): o nome, usou mais duas vezes; comeu uma marmita
  const d = json(B.E.db);

  Object.assign(d.itens[0], { nome: 'Arroz branco', usos: 5 });
  d.marmitas[0].restam = 3;
  B.E.db = B.preparar(d);
  await B.enviar();

  assert.equal(B.E.erroSync, '');
  const i1 = linhaDe(nuvem, 'al_item', 'i1');

  assert.deepEqual([i1.nome, i1.kcal, i1.usos], ['Arroz branco', 130, 6]);
  assert.equal(linhaDe(nuvem, 'al_marmita', 'm1').restam, 2);
  assert.deepEqual(
    json([B.E.db.itens[0].nome, B.E.db.itens[0].kcal, B.E.db.itens[0].usos]),
    ['Arroz branco', 130, 6]
  );
  assert.equal(B.E.db.marmitas[0].restam, 2);
  assert.equal(B.temPendente(), false);
});

test('aba parada: apagar aqui a comida do dia que mudou na nuvem não apaga (volta para cá); a que não mudou sai', async () => {
  const r = (id, qtd) => ({
    id,
    data: HOJE,
    hora: '12:00',
    nome: 'Arroz',
    porcao: '100 g',
    qtd,
    ...V,
  });

  const { B, nuvem } = aparelho({
    itens: [],
    registros: [r('r1', 1), r('r2', 1)],
    dias: [],
    marmitas: [],
  });

  linhaDe(nuvem, 'al_registro', 'r1').qtd = 2;
  B.E.db = B.preparar({ ...json(B.E.db), registros: [] });
  await B.enviar();

  assert.deepEqual(
    nuvem.tabelas.al_registro.map((l) => l.id),
    ['r1']
  );
  assert.deepEqual(json(B.E.db.registros.map((x) => [x.id, x.qtd])), [['r1', 2]]);
  assert.equal(B.temPendente(), false);
});

test('metrô na aba parada: a caminhada mesclada chegou sem resposta → a tentativa seguinte não repete o trecho daqui nem tira o do outro aparelho', async () => {
  const t = (hora) => ({ hora, minutos: 10 }),
    { B, nuvem } = aparelho({
      itens: [],
      registros: [],
      dias: [{ data: HOJE, caminhadas: [t('08:00')] }],
      marmitas: [],
    });

  nuvem.tabelas.al_dia[0].caminhadas.push(t('09:00')); // outro aparelho
  B.E.db = B.preparar({
    ...json(B.E.db),
    dias: [{ data: HOJE, caminhadas: [t('08:00'), t('10:00')] }],
  });

  nuvem.semResposta = true;
  await B.enviar();
  assert.equal(B.temPendente(), true);

  nuvem.semResposta = false;
  await B.enviar();
  assert.deepEqual(json(nuvem.tabelas.al_dia[0].caminhadas), [
    t('08:00'),
    t('09:00'),
    t('10:00'),
  ]);
  assert.equal(B.temPendente(), false);
});

test('o contador já subiu e um passo seguinte do mesmo envio falhou → a tentativa seguinte não soma a mudança daqui de novo (o voo fica até o envio inteiro dar certo)', async () => {
  const { B, nuvem } = aparelho({
    itens: [{ id: 'i1', nome: 'Arroz', porcao: '100 g', ...V, usos: 2 }],
    registros: [],
    dias: [],
    marmitas: [],
  });

  const d = json(B.E.db);

  d.itens[0].usos = 3;
  d.registros.push({
    id: 'r1',
    data: HOJE,
    hora: '12:00',
    item: 'i1',
    nome: 'Arroz',
    porcao: '100 g',
    qtd: 1,
    ...V,
  });
  B.E.db = B.preparar(d);

  nuvem.recusar = { al_registro: 'timeout' };
  await B.enviar();
  assert.equal(B.E.erroSync, 'timeout');
  assert.equal(linhaDe(nuvem, 'al_item', 'i1').usos, 3);

  nuvem.recusar = null;
  await B.enviar();
  assert.equal(linhaDe(nuvem, 'al_item', 'i1').usos, 3);
  assert.equal(B.E.db.itens[0].usos, 3);
  assert.equal(B.temPendente(), false);
});

// ---------- contador no metrô (marca do envio, coluna envios da migration 04) ----------
// O outro aparelho grava como o banco.js publicado grava: a mescla com a lista de marcas da nuvem mais a dele
function outroAparelhoSoma(nuvem, id, mais) {
  const l = linhaDe(nuvem, 'al_item', id);

  l.usos += mais;
  l.envios = [...(l.envios || []), 'outro' + l.usos];
}

const comArroz = (usos) => ({
  itens: [{ id: 'i1', nome: 'Arroz', porcao: '100 g', ...V, usos }],
  registros: [],
  dias: [],
  marmitas: [],
});

test('contador no metrô: o envio chegou sem resposta e outro aparelho somou antes do reenvio → a mudança daqui conta uma vez só', async () => {
  const { B, nuvem } = aparelho(comArroz(2));
  const d = json(B.E.db);

  d.itens[0].usos = 3; // usou uma vez aqui
  B.E.db = B.preparar(d);

  nuvem.semResposta = true;
  await B.enviar();
  assert.equal(B.temPendente(), true);
  assert.equal(linhaDe(nuvem, 'al_item', 'i1').usos, 3); // chegou

  outroAparelhoSoma(nuvem, 'i1', 1); // o outro usou uma vez: 4

  nuvem.semResposta = false;
  await B.enviar();
  assert.equal(B.E.erroSync, '');
  assert.equal(linhaDe(nuvem, 'al_item', 'i1').usos, 4);
  assert.equal(B.E.db.itens[0].usos, 4);
  assert.equal(B.temPendente(), false);
  // a coluna das marcas não entra no aparelho
  assert.equal('envios' in B.E.db.itens[0], false);
});

test('contador no metrô: o envio não chegou e outro aparelho somou mais → a mudança daqui entra (a mesma linha na nuvem, outra resposta)', async () => {
  const { B, nuvem } = aparelho(comArroz(2));
  const d = json(B.E.db);

  d.itens[0].usos = 3;
  B.E.db = B.preparar(d);

  nuvem.recusar = { al_item: 'timeout' };
  await B.enviar();
  assert.equal(linhaDe(nuvem, 'al_item', 'i1').usos, 2); // não chegou

  outroAparelhoSoma(nuvem, 'i1', 2); // o outro usou duas vezes: 4, a mesma linha do teste acima

  nuvem.recusar = null;
  await B.enviar();
  assert.equal(linhaDe(nuvem, 'al_item', 'i1').usos, 5);
  assert.equal(B.temPendente(), false);
});

test('contador no metrô duas vezes: o 1º envio chegou, o 2º não, o outro aparelho somou entre eles → a mudança daqui conta uma vez', async () => {
  const { B, nuvem } = aparelho(comArroz(2));
  const d = json(B.E.db);

  d.itens[0].usos = 3;
  B.E.db = B.preparar(d);

  nuvem.semResposta = true;
  await B.enviar(); // chegou: 3
  outroAparelhoSoma(nuvem, 'i1', 1); // 4

  nuvem.semResposta = false;
  nuvem.recusar = { al_item: 'timeout' };
  await B.enviar(); // não chegou
  outroAparelhoSoma(nuvem, 'i1', 1); // 5

  nuvem.recusar = null;
  await B.enviar();
  assert.equal(linhaDe(nuvem, 'al_item', 'i1').usos, 5);
  assert.equal(B.E.db.itens[0].usos, 5);
  assert.equal(B.temPendente(), false);
});

test('sem a coluna envios na nuvem (migration 04 não aplicada): o envio grava sem a marca e segue', async () => {
  const { B, nuvem } = aparelho(comArroz(2));

  nuvem.semColuna = { al_item: 'envios', al_marmita: 'envios' };

  for (const usos of [3, 4]) {
    const d = json(B.E.db);

    d.itens[0].usos = usos;
    B.E.db = B.preparar(d);
    await B.enviar();
    assert.equal(B.E.erroSync, '');
    assert.equal(linhaDe(nuvem, 'al_item', 'i1').usos, usos);
    assert.equal(B.temPendente(), false);
  }

  assert.equal('envios' in linhaDe(nuvem, 'al_item', 'i1'), false);
});

test('marmita: os dois aparelhos comeram as últimas (2 restavam, cada um uma) → sai da nuvem, sem gravar restam 0 (o banco recusaria)', async () => {
  const { B, nuvem } = aparelho({
    itens: [],
    registros: [],
    dias: [],
    marmitas: [
      { id: 'm1', nome: 'Frango', restam: 2, itens: [{ nome: 'Frango', ...V }] },
    ],
  });

  linhaDe(nuvem, 'al_marmita', 'm1').restam = 1; // o outro comeu uma
  const d = json(B.E.db);

  d.marmitas[0].restam = 1; // este comeu outra
  B.E.db = B.preparar(d);
  await B.enviar();

  assert.equal(B.E.erroSync, '');
  assert.deepEqual(nuvem.tabelas.al_marmita, []);
  assert.deepEqual(json(B.E.db.marmitas), []);
  assert.equal(B.temPendente(), false);
  assert.ok(
    !nuvem.pedidos.some(
      ([tipo, t, corpo]) =>
        tipo === 'upsert' && t === 'al_marmita' && corpo.some((l) => l.restam <= 0)
    )
  );
});

test('marmita: a que acabou foi apagada e um passo seguinte do envio falhou → a tentativa seguinte não a recria', async () => {
  const { B, nuvem } = aparelho({
    itens: [],
    registros: [],
    dias: [],
    marmitas: [
      { id: 'm1', nome: 'Frango', restam: 2, itens: [{ nome: 'Frango', ...V }] },
    ],
  });

  linhaDe(nuvem, 'al_marmita', 'm1').restam = 1;
  const d = json(B.E.db);

  d.marmitas[0].restam = 1;
  B.E.db = B.preparar(d);

  // o apagar chega, a gravação seguinte (a caminhada, al_dia) falha: o envio inteiro tenta de novo
  d.dias.push({ data: HOJE, caminhadas: [{ hora: '08:00', minutos: 10 }] });
  B.E.db = B.preparar(d);
  nuvem.recusar = { al_dia: 'timeout' };
  await B.enviar();
  assert.equal(B.E.erroSync, 'timeout');
  assert.deepEqual(nuvem.tabelas.al_marmita, []);

  nuvem.recusar = null;
  await B.enviar();
  assert.equal(B.E.erroSync, '');
  assert.deepEqual(nuvem.tabelas.al_marmita, []);
  assert.equal(B.temPendente(), false);
});

test('marmita no metrô: a que acabou foi apagada sem resposta → a tentativa seguinte não a recria', async () => {
  const { B, nuvem } = aparelho({
    itens: [],
    registros: [],
    dias: [],
    marmitas: [
      { id: 'm1', nome: 'Frango', restam: 2, itens: [{ nome: 'Frango', ...V }] },
    ],
  });

  linhaDe(nuvem, 'al_marmita', 'm1').restam = 1; // o outro comeu uma
  const d = json(B.E.db);

  d.marmitas[0].restam = 1; // este comeu outra
  B.E.db = B.preparar(d);

  nuvem.semRespostaApagar = true;
  await B.enviar();
  assert.equal(B.E.erroSync, 'Failed to fetch');
  assert.deepEqual(nuvem.tabelas.al_marmita, []); // chegou
  assert.equal(B.E.db.marmitas.length, 1); // o aparelho não soube

  nuvem.semRespostaApagar = false;
  await B.enviar();
  assert.equal(B.E.erroSync, '');
  assert.deepEqual(nuvem.tabelas.al_marmita, []);
  assert.deepEqual(json(B.E.db.marmitas), []);
  assert.equal(B.temPendente(), false);
});

// ---------- marmita apagada aqui (comeu as últimas, jogou fora) contra o outro aparelho mexendo no restam ----------
const comMarmita = (restam) => ({
  itens: [],
  registros: [],
  dias: [],
  marmitas: [{ id: 'm1', nome: 'Frango', restam, itens: [{ nome: 'Frango', ...V }] }],
});

async function comeuTodas(B) {
  const d = json(B.E.db);

  d.marmitas = []; // a última aplicada tira a marmita do db (js/telas.js)
  B.E.db = B.preparar(d);
  await B.enviar();
}

test('marmita: este comeu as 3 (apagou), o outro comeu 1 → sai da nuvem, sem voltar com porções que não existem', async () => {
  const { B, nuvem } = aparelho(comMarmita(3));

  linhaDe(nuvem, 'al_marmita', 'm1').restam = 2;
  await comeuTodas(B);

  assert.equal(B.E.erroSync, '');
  assert.deepEqual(nuvem.tabelas.al_marmita, []);
  assert.deepEqual(json(B.E.db.marmitas), []);
  assert.equal(B.temPendente(), false);
});

test('marmita: este comeu as 3, a nuvem não mudou → apaga como sempre', async () => {
  const { B, nuvem } = aparelho(comMarmita(3));

  await comeuTodas(B);
  assert.deepEqual(nuvem.tabelas.al_marmita, []);
  assert.deepEqual(json(B.E.db.marmitas), []);
  assert.equal(B.temPendente(), false);
});

test('marmita: este comeu as 3, o outro preparou mais uma (restam 4) → fica 1, aqui também', async () => {
  const { B, nuvem } = aparelho(comMarmita(3));

  linhaDe(nuvem, 'al_marmita', 'm1').restam = 4;
  await comeuTodas(B);

  assert.equal(B.E.erroSync, '');
  assert.equal(linhaDe(nuvem, 'al_marmita', 'm1').restam, 1);
  assert.deepEqual(json(B.E.db.marmitas.map((m) => [m.id, m.restam])), [['m1', 1]]);
  assert.equal(B.temPendente(), false);
});

test('marmita no metrô: este comeu as 3 e o outro 1, o apagar chegou sem resposta → continua apagada, sem voltar', async () => {
  const { B, nuvem } = aparelho(comMarmita(3));

  linhaDe(nuvem, 'al_marmita', 'm1').restam = 2;
  nuvem.semRespostaApagar = true;
  await comeuTodas(B);
  assert.equal(B.E.erroSync, 'Failed to fetch');
  assert.deepEqual(nuvem.tabelas.al_marmita, []);

  nuvem.semRespostaApagar = false;
  await B.enviar();
  assert.equal(B.E.erroSync, '');
  assert.deepEqual(nuvem.tabelas.al_marmita, []);
  assert.deepEqual(json(B.E.db.marmitas), []);
  assert.equal(B.temPendente(), false);
});

test('marmita no metrô: este comeu as 3 e o outro preparou mais uma, a gravação (restam 1) chegou sem resposta → a tentativa seguinte não tira a nova', async () => {
  const { B, nuvem } = aparelho(comMarmita(3));

  linhaDe(nuvem, 'al_marmita', 'm1').restam = 4;
  nuvem.semResposta = true;
  await comeuTodas(B);
  assert.equal(linhaDe(nuvem, 'al_marmita', 'm1').restam, 1);

  nuvem.semResposta = false;
  await B.enviar();
  assert.equal(B.E.erroSync, '');
  assert.equal(linhaDe(nuvem, 'al_marmita', 'm1').restam, 1);
  assert.deepEqual(json(B.E.db.marmitas.map((m) => [m.id, m.restam])), [['m1', 1]]);
  assert.equal(B.temPendente(), false);
});

test('comida salva apagada aqui que o outro aparelho usou: volta (apagar só apaga o que a nuvem tem como a base; usos não é porção)', async () => {
  const { B, nuvem } = aparelho(comArroz(2));

  linhaDe(nuvem, 'al_item', 'i1').usos = 3;
  B.E.db = B.preparar({ ...json(B.E.db), itens: [] });
  await B.enviar();

  assert.equal(linhaDe(nuvem, 'al_item', 'i1').usos, 3);
  assert.deepEqual(json(B.E.db.itens.map((i) => [i.id, i.usos])), [['i1', 3]]);
  assert.equal(B.temPendente(), false);
});
