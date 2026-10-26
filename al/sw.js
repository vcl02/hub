// Rede primeiro para o app sempre receber a publicação atual; o cache só atende falta de conexão.
// Mesmo padrão do tr: cache de nome fixo e nada de outros domínios (Supabase e fontes ficam fora deste worker).
// Só apaga caches "al-" antigos: fin, tr e a página inicial dividem a mesma origem e os mesmos caches.
const CACHE_ESTATICO = 'al-estatico';
const ARQUIVOS_ESTATICOS = [
  './js/config.js', './js/util.js', './js/banco.js', './js/conta.js', './js/ia.js', './js/telas.js', './js/bootstrap.js',
  './css/al.css', './', './index.html', '../supabase.js', '../corpo/perfil.js', './gasto.js', './manifest.webmanifest', './icons/al-192.png', './icons/al-512.png'];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE_ESTATICO).then(cache => Promise.all(
    ARQUIVOS_ESTATICOS.map(async arquivo => cache.put(arquivo, await fetch(arquivo, { cache: 'reload' })))
  )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => evento.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('al-') && k !== CACHE_ESTATICO).map(k => caches.delete(k)))).then(() => self.clients.claim())
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
