// Cache offline só da página inicial do hub. Rede primeiro; o cache só atende falta de conexão.
// fin/ e tr/ têm o próprio service worker (escopo mais específico) e não passam por aqui: nem
// antes de eles se registrarem, pra este worker nunca guardar nem servir arquivo de outro app.
const CACHE_ESTATICO = 'hub-estatico';
const ARQUIVOS_ESTATICOS = ['./', './index.html', './hub.css', './hub.js', './supabase.js', './manifest.webmanifest', './icons/hub-192.png', './icons/hub-512.png'];
const ENDERECOS = new Set(ARQUIVOS_ESTATICOS.map(arquivo => new URL(arquivo, self.location).href));

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE_ESTATICO).then(cache => Promise.all(
    ARQUIVOS_ESTATICOS.map(async arquivo => cache.put(arquivo, await fetch(arquivo, { cache: 'reload' })))
  )).then(() => self.skipWaiting()));
});

// Nada de apagar caches aqui: fin e tr dividem a mesma origem e os mesmos caches.
self.addEventListener('activate', evento => evento.waitUntil(self.clients.claim()));

self.addEventListener('fetch', evento => {
  if (evento.request.method !== 'GET') return;
  const url = new URL(evento.request.url);
  url.search = '';
  if (!ENDERECOS.has(url.href)) return;
  evento.respondWith(fetch(evento.request, { cache: 'no-cache' }).then(async resposta => {
    if (resposta.ok) await (await caches.open(CACHE_ESTATICO)).put(evento.request, resposta.clone());
    return resposta;
  }).catch(() => caches.match(evento.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
