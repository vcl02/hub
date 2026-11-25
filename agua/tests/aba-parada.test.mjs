// Aba parada + metrô (sem navegador): a Água aberta horas num aparelho, outro aparelho lança água no mesmo dia, este lança
// também e o envio chega à nuvem mas a resposta se perde. Na tentativa seguinte, nada se repete e nada do outro aparelho sai
// (o voo guarda também o dia daqui daquele envio: agua.vooAqui.<conta>). O banco.js publicado roda inteiro
// (../../tests/nuvem-falsa.mjs) com uma nuvem falsa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rodarBanco } from '../../tests/nuvem-falsa.mjs';

const HUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = (a) => path.join(HUB, a);
const json = (x) => JSON.parse(JSON.stringify(x));

const HOJE = '2026-11-24',
  copo = (hora) => ({ hora, ml: 200 });

function aparelho(aguas) {
  const nuvem = { tabelas: {} },
    B = rodarBanco(
      [
        A('base/nucleo.js'),
        A('corpo/perfil.js'),
        A('agua/bebidas.js'),
        A('agua/js/config.js'),
        A('agua/js/util.js'),
        A('agua/js/banco.js'),
      ],
      {
        nuvem,
        nomes: ['enviar', 'preparar', 'linhas', 'temPendente'],
        estado: ['db', 'base', 'usuario', 'erroSync'],
      }
    );

  B.E.usuario = { id: 'u1' };
  B.E.db = B.preparar({ dias: [{ data: HOJE, aguas }] });
  B.E.base = B.linhas(B.E.db);
  nuvem.tabelas.agua_dia = Object.values(B.E.base).map((l) => ({
    user_id: 'u1',
    ...json(l),
  }));

  return { B, nuvem };
}

const doDia = (nuvem) => json(nuvem.tabelas.agua_dia.find((l) => l.data === HOJE).aguas);

test('metrô na aba parada: a mescla chegou sem resposta → a tentativa seguinte não repete o copo daqui nem tira o do outro aparelho', async () => {
  const { B, nuvem } = aparelho([copo('08:00')]);

  nuvem.tabelas.agua_dia[0].aguas.push(copo('09:00')); // outro aparelho
  B.E.db = B.preparar({ dias: [{ data: HOJE, aguas: [copo('08:00'), copo('10:00')] }] });

  nuvem.semResposta = true;
  await B.enviar();
  assert.equal(B.temPendente(), true);
  assert.deepEqual(doDia(nuvem), [copo('08:00'), copo('09:00'), copo('10:00')]);

  nuvem.semResposta = false;
  await B.enviar();
  assert.deepEqual(doDia(nuvem), [copo('08:00'), copo('09:00'), copo('10:00')]);
  assert.deepEqual(json(B.E.db.dias[0].aguas), [
    copo('08:00'),
    copo('09:00'),
    copo('10:00'),
  ]);
  assert.equal(B.temPendente(), false);
});

test('voo de uma versão anterior (sem o dia daqui do envio): a base continua sendo o voo, como antes', async () => {
  const { B, nuvem } = aparelho([copo('08:00')]);

  // o envio anterior (versão velha) mandou 08:00 + 10:00 e não teve resposta; nada mudou aqui desde então
  B.E.db = B.preparar({ dias: [{ data: HOJE, aguas: [copo('08:00'), copo('10:00')] }] });
  nuvem.tabelas.agua_dia[0].aguas.push(copo('10:00'));
  B.guardado.set(
    'agua.voo.u1',
    JSON.stringify({ [HOJE]: [copo('08:00'), copo('10:00')] })
  );
  await B.enviar();

  assert.deepEqual(doDia(nuvem), [copo('08:00'), copo('10:00')]);
  assert.equal(B.temPendente(), false);
});

test('aba parada (sem metrô): o outro aparelho lançou água no dia e aqui também; sobem os dois. Tirar aqui um copo não tira o que o outro lançou', async () => {
  const { B, nuvem } = aparelho([copo('08:00'), copo('08:30')]);

  nuvem.tabelas.agua_dia[0].aguas.push(copo('09:00')); // outro aparelho, depois que esta aba parou
  B.E.db = B.preparar({ dias: [{ data: HOJE, aguas: [copo('08:00'), copo('10:00')] }] }); // tirou 08:30, lançou 10:00
  await B.enviar();

  assert.deepEqual(doDia(nuvem), [copo('08:00'), copo('09:00'), copo('10:00')]);
  assert.deepEqual(json(B.E.db.dias[0].aguas), [
    copo('08:00'),
    copo('09:00'),
    copo('10:00'),
  ]);
  assert.equal(B.temPendente(), false);
});
