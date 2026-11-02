// Roda o bootstrap.js de um app inteiro num contexto isolado (node:vm), sem navegador, como a página o carrega: devolve o
// que ele registrou no service worker, para onde mandou o navegador e quais telas chamou (carregar com a sessão salva ou
// telaLogin). Os nomes que o bootstrap usa e que moram em outros arquivos do app são espiões ou "nada" (aceita qualquer uso).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const nada = new Proxy(function () {}, {
  get: (_, k) => (k === 'then' ? undefined : nada),
  set: () => true,
  apply: () => nada,
});

export async function rodarBootstrapApp(
  arquivo,
  { pathname = '/', search = '', hash = '', sessao = null, extras = () => ({}) } = {}
) {
  const registros = [],
    destinos = [],
    chamadas = [];

  const contexto = {
    $: () => nada,
    db: null,
    usuario: null,
    base: null,
    pilha: ['inicio'],
    T: {},
    document: nada,
    addEventListener: () => {},
    setInterval: () => 0,
    setTimeout: () => 0,
    hoje: () => '2026-09-18',
    toast: () => {},
    fetch: async () => ({ ok: false }),
    sb: { auth: { getSession: async () => ({ data: { session: sessao } }) } },
    carregar: (usuario) => chamadas.push(['carregar', usuario]),
    telaLogin: () => chamadas.push(['telaLogin']),
    navigator: {
      onLine: false,
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
    ...extras(chamadas), // nomes do app que o bootstrap usa sem declarar (e, se ele os declara, os dele valem)
  };

  vm.runInNewContext(readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  return { registros, destinos, chamadas };
}
