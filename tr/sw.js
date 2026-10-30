// Rede primeiro para o app sempre receber a publicação atual; o cache só atende falta de conexão.
// Mesmo padrão do fin: cache de nome fixo (sem versão para trocar a cada deploy) e nada de outros
// domínios — Supabase e fontes do Google ficam fora deste worker.
const CACHE_ESTATICO = 'carga-estatico';
const ARQUIVOS_ESTATICOS = [
  './js/config.js', './js/util.js', './js/piramide.js', './js/banco.js', './js/login.js', './js/pontos.js', './js/inicio.js', './js/exercicio.js', './js/treino.js', './js/cardio.js', './js/series.js', './js/interacoes.js', './js/ajustes.js', './js/bootstrap.js',
  './css/base.css', './css/inicio.css', './css/telas.css', './css/flutuantes.css', './css/exercicio.css', './css/resumo.css', './css/cardio.css',
  './', './index.html', './supabase.js', '../corpo/perfil.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE_ESTATICO).then(cache => Promise.all(
    ARQUIVOS_ESTATICOS.map(async arquivo => cache.put(arquivo, await fetch(arquivo, { cache: 'reload' })))
  )).then(() => self.skipWaiting()));
});

// Apaga os caches das versões antigas ("carga-v1" … "carga-v21"). Só os "carga-": no hub, fin e
// a página inicial dividem a mesma origem e os mesmos caches.
self.addEventListener('activate', evento => evento.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('carga-') && k !== CACHE_ESTATICO).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', evento => {
  if (evento.request.method !== 'GET') return;
  const url = new URL(evento.request.url);
  if (url.origin !== self.location.origin) return;
  // Com busca: ?dia=… (o dia no endereço, como o ?ciclo do Fin) abre a mesma página; sem internet, a do cache. Outras
  // buscas (ex.: ?v=…, a checagem de versão) vão direto à rede, sem cache.
  if (url.search) {
    if (evento.request.mode === 'navigate') evento.respondWith(fetch(evento.request).catch(() => caches.match('./').then(r => r || caches.match('./index.html'))));
    return;
  }
  evento.respondWith(fetch(evento.request, { cache: 'no-cache' }).then(async resposta => {
    // Cache é só uma cópia de segurança da última versão que a rede entregou.
    if (resposta.ok) await (await caches.open(CACHE_ESTATICO)).put(evento.request, resposta.clone());
    return resposta;
  }).catch(() => caches.match(evento.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
