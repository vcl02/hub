// Rede primeiro para a interface sempre receber a publicação atual; o cache só atende falta
// de conexão. Dados e operações do Supabase continuam em rede e fora deste worker.
const CACHE_ESTATICO = 'fin-estatico';
const ARQUIVOS_ESTATICOS = [
    './', './index.html', './manifest.webmanifest',
    './css/base.css', './css/dashboard.css', './css/forms.css', './css/charts.css', './css/utilities.css', './css/mobile.css',
    './js/app-state.js', './js/domain.js', './js/shared.js', './js/supabase-api.js', './js/finance.js', './js/data-ui.js',
    './js/tables.js', './js/cycle-views.js', './js/interactions.js', './js/charts.js', './js/form.js', './js/bootstrap.js',
    './icons/fin-192.png', './icons/fin-512.png',
];

self.addEventListener('install', evento => {
    evento.waitUntil(caches.open(CACHE_ESTATICO).then(cache => Promise.all(
        ARQUIVOS_ESTATICOS.map(async arquivo => {
            const resposta = await fetch(arquivo, { cache: 'reload' });
            await cache.put(arquivo, resposta);
        }),
    )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => {
    evento.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', evento => {
    if (evento.request.method !== 'GET') return;
    const url = new URL(evento.request.url);
    // Não intercepta CDN, Supabase nem nenhum outro domínio: respostas financeiras ficam fora do cache.
    if (url.origin !== self.location.origin) return;
    evento.respondWith(fetch(evento.request).then(async resposta => {
        // Cache é só uma cópia de segurança da última interface que a rede entregou.
        if (resposta.ok) {
            const cache = await caches.open(CACHE_ESTATICO);
            await cache.put(evento.request, resposta.clone());
        }
        return resposta;
    }).catch(() => caches.match(evento.request)));
});
