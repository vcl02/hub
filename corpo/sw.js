// Rede primeiro para o app sempre receber a publicação atual; o cache só atende falta de conexão.
// Mesmo padrão do tr e do al: cache de nome fixo e nada de outros domínios (Supabase e fontes ficam fora deste worker).
// Só apaga caches "corpo-" antigos: os outros apps dividem a mesma origem e os mesmos caches.
const CACHE_ESTATICO = 'corpo-estatico';
const ARQUIVOS_ESTATICOS = [
  './perfil.js', './js/config.js', './js/util.js', './js/banco.js', './js/telas.js', './js/bootstrap.js',
  './css/corpo.css', './', './index.html', '../supabase.js', './manifest.webmanifest', './icons/corpo-192.png', './icons/corpo-512.png'];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE_ESTATICO).then(cache => Promise.all(
    ARQUIVOS_ESTATICOS.map(async arquivo => cache.put(arquivo, await fetch(arquivo, { cache: 'reload' })))
  )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => evento.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('corpo-') && k !== CACHE_ESTATICO).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', evento => {
  if (evento.request.method !== 'GET') return;
  const url = new URL(evento.request.url);
  if (url.origin !== self.location.origin || url.search) return;
  evento.respondWith(fetch(evento.request, { cache: 'no-cache' }).then(async resposta => {
    if (resposta.ok) await (await caches.open(CACHE_ESTATICO)).put(evento.request, resposta.clone());
    return resposta;
  }).catch(() => caches.match(evento.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
