// Aba parada (sem navegador): o Corpo aberto horas ou dias num aparelho, outro aparelho grava a pesagem do mesmo dia, e este
// mexe nela depois. O banco.js publicado roda inteiro (../../tests/nuvem-falsa.mjs) com uma nuvem falsa; a pesagem não sobe
// inteira por cima do que este aparelho não viu (mesclarLinha do núcleo), e apagar não apaga o que mudou na nuvem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rodarBanco } from '../../tests/nuvem-falsa.mjs';

const HUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = (a) => path.join(HUB, a);
const json = (x) => JSON.parse(JSON.stringify(x));

function aparelho(nuvem, medidas) {
  const B = rodarBanco(
    [
      A('base/nucleo.js'),
      A('corpo/perfil.js'),
      A('corpo/js/config.js'),
      A('corpo/js/util.js'),
      A('corpo/js/banco.js'),
    ],
    {
      nuvem,
      nomes: ['enviar', 'preparar', 'linhas', 'temPendente'],
      estado: ['db', 'base', 'usuario', 'erroSync'],
    }
  );

  B.E.usuario = { id: 'u1' };
  B.E.db = B.preparar({ medidas, dias: [] });
  B.E.base = B.linhas(B.E.db);

  return B;
}

const HOJE = '2026-11-24',
  linha = (m) => ({ user_id: 'u1', hora: '', peso: null, cintura: null, ...m });

test('aba parada: este aparelho (cópia sem a pesagem de hoje) lança a barriga; o peso que o outro lançou hoje fica', async () => {
  const nuvem = {
      tabelas: { corpo_medida: [linha({ data: HOJE, hora: '07:00', peso: 80 })] },
    },
    ap = aparelho(nuvem, []);

  // o formulário daqui grava o dia só com a barriga (o peso de lá não estava na tela)
  ap.E.db = ap.preparar({
    medidas: [{ data: HOJE, hora: '20:00', cintura: 90 }],
    dias: [],
  });
  await ap.enviar();

  const n = nuvem.tabelas.corpo_medida.find((l) => l.data === HOJE);

  assert.equal(n.peso, 80);
  assert.equal(n.cintura, 90);
  assert.equal(ap.E.erroSync, '');
  // este aparelho fica com o dia inteiro, e nada pendente
  assert.deepEqual(json(ap.E.db.medidas.map((m) => [m.data, m.peso, m.cintura])), [
    [HOJE, 80, 90],
  ]);
  assert.equal(ap.temPendente(), false);
});

test('aba parada: os dois mexeram na pesagem conhecida, cada um numa coluna: as duas mudanças ficam; sem mudança na nuvem, sobe a daqui', async () => {
  const conhecida = { data: HOJE, hora: '07:00', peso: 80, cintura: 90 },
    nuvem = { tabelas: { corpo_medida: [linha({ ...conhecida, cintura: 88 })] } },
    ap = aparelho(nuvem, [conhecida]);

  ap.E.db = ap.preparar({ medidas: [{ ...conhecida, peso: 79 }], dias: [] });
  await ap.enviar();
  assert.deepEqual(json(nuvem.tabelas.corpo_medida.map((l) => [l.peso, l.cintura])), [
    [79, 88],
  ]);
  assert.equal(ap.temPendente(), false);

  // agora a nuvem é a que este conhece: a mudança daqui sobe como está
  ap.E.db = ap.preparar({ medidas: [{ ...conhecida, peso: 78, cintura: 88 }], dias: [] });
  await ap.enviar();
  assert.deepEqual(json(nuvem.tabelas.corpo_medida.map((l) => [l.peso, l.cintura])), [
    [78, 88],
  ]);
});

test('aba parada: apagar aqui a pesagem que mudou na nuvem não apaga (ela volta para cá); a que não mudou é apagada', async () => {
  const d1 = { data: '2026-11-22', hora: '07:00', peso: 81 },
    d2 = { data: HOJE, hora: '07:00', peso: 80 },
    nuvem = {
      tabelas: { corpo_medida: [linha({ ...d1, cintura: 91 }), linha(d2)] },
    },
    ap = aparelho(nuvem, [d1, d2]);

  ap.E.db = ap.preparar({ medidas: [], dias: [] });
  await ap.enviar();

  assert.deepEqual(
    nuvem.tabelas.corpo_medida.map((l) => l.data),
    ['2026-11-22']
  );
  assert.deepEqual(json(ap.E.db.medidas.map((m) => [m.data, m.peso, m.cintura])), [
    ['2026-11-22', 81, 91],
  ]);
  assert.equal(ap.temPendente(), false);
});

test('metrô na aba parada: o dia mesclado (xixis) chegou sem resposta → a tentativa seguinte não repete o daqui nem tira o do outro aparelho', async () => {
  const nuvem = { tabelas: { corpo_medida: [] } },
    ap = aparelho(nuvem, []);

  ap.E.db = ap.preparar({ medidas: [], dias: [{ data: HOJE, xixis: ['08:00'] }] });
  ap.E.base = ap.linhas(ap.E.db);
  nuvem.tabelas.corpo_dia = Object.values(ap.E.base.corpo_dia).map((l) => ({
    user_id: 'u1',
    ...json(l),
  }));

  nuvem.tabelas.corpo_dia[0].xixis.push('09:00'); // outro aparelho
  ap.E.db = ap.preparar({
    medidas: [],
    dias: [{ data: HOJE, xixis: ['08:00', '10:00'] }],
  });

  nuvem.semResposta = true;
  await ap.enviar();
  assert.equal(ap.temPendente(), true);

  nuvem.semResposta = false;
  await ap.enviar();
  assert.deepEqual(json(nuvem.tabelas.corpo_dia[0].xixis), ['08:00', '09:00', '10:00']);
  assert.deepEqual(json(ap.E.db.dias[0].xixis), ['08:00', '09:00', '10:00']);
  assert.equal(ap.temPendente(), false);
});
