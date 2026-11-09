// Service worker da Água (sw.js num contexto falso, sem navegador): o push mostra a notificação do último lembrete e tocar nela
// foca o app aberto ou abre. Inscrever o aparelho, a permissão negada e o que a linha mostra são funções testadas em
// funcoes.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('service worker: push mostra o último lembrete (água, ou sem resposta da função; dentes); tocar foca o app aberto ou abre', async () => {
  const ouvintes = {},
    mostradas = [],
    abertas = [],
    focadas = [],
    pedidos = [];

  let janelas = [],
    ultimo = null;

  const contexto = {
    URL,
    Promise,
    console,
    caches: {},
    fetch: async (u) => {
      pedidos.push(u);

      if (!ultimo) throw new Error('rede');

      return { json: async () => ({ tipo: ultimo }) };
    },
    self: {
      location: 'https://vcl02.github.io/hub/agua/sw.js',
      addEventListener: (tipo, f) => {
        ouvintes[tipo] = f;
      },
      registration: {
        scope: 'https://vcl02.github.io/hub/agua/',
        showNotification: async (titulo, o) => {
          mostradas.push({ titulo, ...o });
        },
      },
      clients: {
        matchAll: async () => janelas,
        openWindow: async (u) => {
          abertas.push(u);
        },
      },
    },
  };

  vm.createContext(contexto);
  vm.runInContext(readFileSync(path.join(RAIZ, 'sw.js'), 'utf8'), contexto);

  const disparar = async (tipo, extra = {}) => {
    let p;

    ouvintes[tipo]({
      waitUntil: (x) => {
        p = x;
      },
      ...extra,
    });
    await p;
  };

  await disparar('push'); // sem resposta da função: o de água
  assert.equal(mostradas.length, 1);
  assert.equal(
    pedidos[0],
    'https://yzmyncxoskvqzdczaill.supabase.co/functions/v1/agua-lembrete?ultimo'
  );
  assert.equal(mostradas[0].titulo, 'Hora de beber água');
  assert.equal(mostradas[0].tag, 'agua-lembrete');
  assert.equal(
    mostradas[0].badge,
    'https://vcl02.github.io/hub/agua/icons/agua-badge.png'
  );
  assert.equal(mostradas[0].icon, 'https://vcl02.github.io/hub/agua/icons/agua-192.png');
  // o Android pinta de branco tudo que não é transparente no badge: precisa de canal de transparência
  const png = readFileSync(path.join(RAIZ, 'icons/agua-badge.png'));

  assert.equal(png.readUInt32BE(16), 96);
  assert.equal(png[25], 6); // 96 px, RGBA
  const notificacao = { close: () => {}, data: mostradas[0].data };

  await disparar('notificationclick', { notification: notificacao });
  assert.deepEqual(abertas, ['/hub/agua/']);
  janelas = [
    { url: 'https://vcl02.github.io/hub/fin/', focus: () => focadas.push('fin') },
    { url: 'https://vcl02.github.io/hub/agua/', focus: () => focadas.push('agua') },
  ];
  await disparar('notificationclick', { notification: notificacao });
  assert.deepEqual(focadas, ['agua']);
  assert.deepEqual(abertas, ['/hub/agua/']);
  ultimo = 'dentes'; // 20 min depois de comer
  await disparar('push');
  assert.deepEqual(
    [mostradas[1].titulo, mostradas[1].body, mostradas[1].tag, mostradas[1].icon],
    [
      'Escove os dentes',
      'Você comeu há 20 minutos.',
      'dentes',
      'https://vcl02.github.io/hub/agua/icons/dentes-192.png',
    ]
  );
  assert.equal(
    mostradas[1].badge,
    'https://vcl02.github.io/hub/agua/icons/dentes-badge.png'
  ); // escova, não a gota
  const escova = readFileSync(path.join(RAIZ, 'icons/dentes-badge.png'));

  assert.equal(escova.readUInt32BE(16), 96);
  assert.equal(escova[25], 6); // 96 px, RGBA
  janelas = [];
  await disparar('notificationclick', {
    notification: { close: () => {}, data: mostradas[1].data },
  });
  assert.deepEqual(abertas, ['/hub/agua/', '/hub/']); // abre a página inicial
});
