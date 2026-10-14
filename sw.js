/* NBA Universe Manager PWA. Somente arquivos do próprio domínio: jamais acessa IndexedDB, saves ou APIs externas. */
const VERSION = 'nuv-management-20261014-r1';
const CACHE = `nba-universe-${VERSION}`;
const ROOT = new URL('./', self.registration.scope);
const local = path => new URL(path, ROOT).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(local('offline-assets.json'), { cache: 'no-store' });
    if (!response.ok) throw Error('Manifesto offline indisponível');
    const manifest = await response.json();
    if (!Array.isArray(manifest.files) || !manifest.files.includes('index.html')) throw Error('Manifesto offline inválido');
    const cache = await caches.open(CACHE);
    const paths = [...new Set(['./', ...manifest.files])];
    // Grupos menores evitam uma avalanche de conexões em celulares e redes lentas.
    for (let i = 0; i < paths.length; i += 18) {
      await cache.addAll(paths.slice(i, i + 18).map(local));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('nba-universe-') && name !== CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== ROOT.origin || !url.href.startsWith(ROOT.href)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(response => response.ok ? response : caches.match(local('index.html')) || response)
      .catch(() => caches.match(local('index.html'))));
    return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(req, copy)));
    }
    return response;
  })));
});
