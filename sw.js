// Offline + sempre a versão mais nova quando há internet.
// Arquivos do app: rede primeiro, revalidando com o servidor (ignora o cache do navegador); sem internet, usa o cache.
const VERSAO = 'carga-v20';
const ARQUIVOS = ['./', 'index.html', 'style.css', 'app.js', 'supabase.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  const local = url.origin === location.origin, fonte = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (req.method !== 'GET' || (!local && !fonte) || (local && url.search)) return;   // ?v=... é a checagem de versão: direto na rede
  e.respondWith(fetch(local ? url.href : req, local ? { cache: 'no-cache' } : undefined)
    .then(r => { if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); } return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
