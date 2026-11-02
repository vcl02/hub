// Roda código publicado do app num contexto isolado (node:vm), sem navegador: o service worker (install e activate) e o
// bootstrap (o que ele faz ao abrir). Não mexe nos contratos de helpers/app.mjs.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Service worker: devolve o que ele guarda no install (arquivo → cache) e o que apaga no activate (dado o que já existe).
export async function rodarServiceWorker(arquivo, existentes = []) {
  const ouvintes = {},
    guardados = [],
    apagados = [],
    abertos = [];

  const contexto = {
    self: {
      addEventListener: (tipo, f) => {
        ouvintes[tipo] = f;
      },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: {
      open: async (nome) => {
        abertos.push(nome);

        return {
          put: async (chave) => {
            guardados.push(chave);
          },
        };
      },
      keys: async () => existentes,
      delete: async (k) => {
        apagados.push(k);

        return true;
      },
    },
    fetch: async () => ({ ok: true }),
    URL,
  };

  vm.runInNewContext(readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo });

  const roda = async (tipo) => {
    let pronto;

    ouvintes[tipo]({
      waitUntil: (p) => {
        pronto = p;
      },
    });
    // install e activate têm de segurar o evento (waitUntil); sem isso o navegador o encerraria antes do fim
    assert.ok(pronto, `service worker: o evento ${tipo} não chamou waitUntil`);
    await pronto;
  };

  await roda('install');
  await roda('activate');

  return { guardados, apagados, abertos };
}

// Um objeto que aceita qualquer uso (leitura, chamada, atribuição): faz de conta de tela para o bootstrap rodar sem página.
const nada = new Proxy(function () {}, {
  get: (_, k) => (k === 'then' ? undefined : nada),
  set: () => true,
  apply: () => nada,
});

// bootstrap.js inteiro, como a página o carrega: devolve o que ele registrou no service worker e para onde mandou o navegador.
export async function rodarBootstrap(
  arquivo,
  { pathname = '/', search = '', hash = '' } = {}
) {
  const registros = [],
    destinos = [];

  const contexto = {
    $: () => nada,
    db: null,
    usuario: null,
    base: null,
    document: nada,
    addEventListener: () => {},
    hoje: () => '2026-09-18',
    toast: () => {},
    sb: { auth: { getSession: async () => ({ data: { session: null } }) } },
    navigator: {
      serviceWorker: {
        register: (url, opcoes) => {
          registros.push([url, { ...opcoes }]);

          return Promise.resolve();
        },
      },
    },
    location: {
      pathname,
      search,
      hash,
      replace: (destino) => {
        destinos.push(destino);
      },
    },
    encodeURIComponent,
  };

  vm.runInNewContext(readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  return { registros, destinos };
}
