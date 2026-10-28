// Rede primeiro para o app sempre receber a publicação atual; o cache só atende falta de conexão.
// Mesmo padrão dos outros apps: cache de nome fixo e nada de outros domínios (Supabase e fontes ficam fora deste worker).
// Só apaga caches "agua-" antigos: os outros apps dividem a mesma origem e os mesmos caches.
const CACHE_ESTATICO = 'agua-estatico';
const ARQUIVOS_ESTATICOS = [
  './js/config.js', './js/util.js', './js/banco.js', './js/conta.js', './js/notificacoes.js', './js/telas.js', './js/bootstrap.js',
  './css/agua.css', './', './index.html', '../supabase.js', '../corpo/perfil.js', './bebidas.js', './manifest.webmanifest', './icons/agua-192.png', './icons/agua-512.png', './icons/agua-badge.png'];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE_ESTATICO).then(cache => Promise.all(
    ARQUIVOS_ESTATICOS.map(async arquivo => cache.put(arquivo, await fetch(arquivo, { cache: 'reload' })))
  )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => evento.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('agua-') && k !== CACHE_ESTATICO).map(k => caches.delete(k)))).then(() => self.clients.claim())
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

// Notificação de verdade (Web Push sem conteúdo): a função agua-lembrete manda quando é hora e falta água, ou 20 min depois
// de lançar comida no Alimentação (escovar os dentes). Sem conteúdo no push, o texto sai do último lembrete mandado, que a
// função responde em GET ?ultimo; sem resposta (sem internet), o de água.
// badge = ícone pequeno da barra do Android, que só usa a transparência: gota branca em fundo transparente (icons/agua-badge.svg).
const ULTIMO_LEMBRETE = 'https://yzmyncxoskvqzdczaill.supabase.co/functions/v1/agua-lembrete?ultimo';
const LEMBRETES = {
  agua: { titulo: 'Hora de beber água', corpo: 'Toque para registrar.', tag: 'agua-lembrete', icone: 'icons/agua-192.png', abre: './' },
  dentes: { titulo: 'Escove os dentes', corpo: 'Você comeu há 20 minutos.', tag: 'dentes', icone: '../icons/hub-192.png', abre: '../' }
};
self.addEventListener('push', evento => {
  // Imagens com endereço completo (a partir do escopo da Água), sem depender de como o Android resolve caminho relativo
  const url = caminho => new URL(caminho, self.registration.scope).href;
  evento.waitUntil(fetch(ULTIMO_LEMBRETE, { cache: 'no-store' }).then(r => r.json()).then(x => x.tipo, () => 'agua').then(tipo => {
    const l = LEMBRETES[tipo] || LEMBRETES.agua;
    return self.registration.showNotification(l.titulo, {
      body: l.corpo, icon: url(l.icone), badge: url('icons/agua-badge.png'), tag: l.tag, renotify: true, data: { abre: l.abre }
    });
  }));
});
// Tocar na notificação abre a Água (o de dentes, a página inicial), ou volta para ela se já estiver aberta
self.addEventListener('notificationclick', evento => {
  evento.notification.close();
  const alvo = new URL(evento.notification.data?.abre || './', self.registration.scope).pathname;
  evento.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(L => {
    const aberta = L.find(c => new URL(c.url).pathname === alvo || (alvo.endsWith('/agua/') && new URL(c.url).pathname.startsWith(alvo)));
    return aberta ? aberta.focus() : self.clients.openWindow(alvo);
  }));
});
