// Ajuda dos testes de service worker (sem navegador): roda o arquivo publicado (sw.js, fin/service-worker.js...) num contexto
// com `self`, `caches` e `fetch` falsos e devolve o que ele fez. Assim a regra "não apaga o cache de outro app" e "só atende
// os arquivos da própria página" é conferida pelo comportamento, não pelo texto do código.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// existentes: nomes de cache que já estão no navegador; cacheado: o que o cache devolve por endereço ('./', './index.html'...);
// rede: false simula estar sem internet. Devolve { apagados, pedidos, ativar(), atende(url, opcoes) }.
export function rodarSw(
  arquivo,
  {
    origem = 'https://vcl02.github.io',
    pasta = '/hub/',
    existentes = [],
    cacheado = {},
    rede = true,
  } = {}
) {
  const ouvintes = {},
    apagados = [],
    pedidos = [];

  const cache = { put: async () => {}, match: async () => undefined },
    local = origem + pasta + arquivo.split(/[\\/]/).slice(-1)[0];

  const contexto = {
    URL,
    Promise,
    console,
    Request,
    caches: {
      keys: async () => [...existentes],
      delete: async (nome) => {
        apagados.push(nome);

        return true;
      },
      open: async () => cache,
      match: async (chave) => cacheado[typeof chave === 'string' ? chave : chave.url],
    },
    fetch: async (pedido) => {
      pedidos.push(String(pedido.url || pedido));

      if (!rede) throw new TypeError('Failed to fetch');

      return new Response('ok');
    },
    self: {
      location: new URL(local),
      addEventListener: (tipo, f) => {
        ouvintes[tipo] = f;
      },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
    },
  };

  vm.runInNewContext(readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo });

  const disparar = async (tipo, evento) => {
    let espera;

    ouvintes[tipo]({
      waitUntil: (p) => {
        espera = p;
      },
      ...evento,
    });

    // install e activate têm de segurar o evento (waitUntil); sem isso o navegador o encerraria antes do fim
    if (tipo === 'install' || tipo === 'activate')
      assert.ok(espera, `service worker: o evento ${tipo} não chamou waitUntil`);
    await espera;
  };

  return {
    apagados,
    pedidos,
    ativar: () => disparar('activate', {}),
    // O worker atende o pedido (respondWith) ou deixa passar para a rede? Devolve também o que respondeu.
    async atende(url, { metodo = 'GET', modo = 'no-cors' } = {}) {
      let resposta = null;

      ouvintes.fetch({
        request: { url, method: metodo, mode: modo },
        respondWith: (p) => {
          resposta = Promise.resolve(p);
        },
      });

      return resposta ? { atendeu: true, resposta: await resposta } : { atendeu: false };
    },
  };
}
