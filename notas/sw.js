// Rede primeiro para o app sempre receber a publicação atual; o cache só atende falta de conexão.
// Mesmo padrão dos outros apps: cache de nome fixo e nada de outros domínios (Supabase e fontes ficam fora deste worker).
// Só apaga caches "notas-" antigos: os outros apps dividem a mesma origem e os mesmos caches.
const CACHE_ESTATICO = 'notas-estatico';

const ARQUIVOS_ESTATICOS = [
  './js/config.js',
  './js/util.js',
  './js/banco.js',
  './js/markdown.js',
  './js/editor.js',
  './js/telas.js',
  './js/bootstrap.js',
  './css/notas.css',
  './vendor/codemirror.js',
  './',
  './index.html',
  '../supabase.js',
  '../base/nucleo.js',
  '../base/tokens.css',
  '../base/componentes.css',
  './manifest.webmanifest',
  './icons/notas-192.png',
  './icons/notas-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_ESTATICO)
      .then((cache) =>
        Promise.all(
          ARQUIVOS_ESTATICOS.map(async (arquivo) =>
            cache.put(arquivo, await fetch(arquivo, { cache: 'reload' }))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) =>
  evento.waitUntil(
    caches
      .keys()
      .then((ks) =>
        Promise.all(
          ks
            .filter((k) => k.startsWith('notas-') && k !== CACHE_ESTATICO)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
);

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  const url = new URL(evento.request.url);

  if (url.origin !== self.location.origin) return;

  // Com busca: ?nota=… (a nota aberta no endereço, como o ?dia dos outros apps) abre a mesma página; sem internet, a do
  // cache. Outras buscas (ex.: ?v=…, a checagem de versão) vão direto à rede, sem cache.
  if (url.search) {
    if (evento.request.mode === 'navigate')
      evento.respondWith(
        fetch(evento.request).catch(() =>
          caches.match('./').then((r) => r || caches.match('./index.html'))
        )
      );

    return;
  }

  evento.respondWith(
    fetch(evento.request, { cache: 'no-cache' })
      .then(async (resposta) => {
        if (resposta.ok)
          await (await caches.open(CACHE_ESTATICO)).put(evento.request, resposta.clone());

        return resposta;
      })
      .catch(() =>
        caches
          .match(evento.request, { ignoreSearch: true })
          .then((r) => r || caches.match('./index.html'))
      )
  );
});
