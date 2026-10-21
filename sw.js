// Cache para funcionar offline. Mude a versão a cada atualização.
const VERSAO = 'carga-v6';
const ARQUIVOS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
// Rede primeiro (pega atualizações); sem internet, usa o cache. Fontes do Google ficam em cache.
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || (url.origin !== location.origin && !url.hostname.endsWith('fonts.googleapis.com') && !url.hostname.endsWith('fonts.gstatic.com'))) return;
  e.respondWith(fetch(req)
    .then(r => { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
