// Service worker: guarda o app no aparelho para abrir sem internet.
// Ao mudar arquivos do app, aumente VERSAO para forçar a atualização.
const VERSAO = 'v8';
const CACHE_APP = `gerenciagro-app-${VERSAO}`;
const CACHE_VENDOR = 'gerenciagro-vendor';

const APP = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/auth.js',
  'js/calc.js',
  'js/forragem.js',
  'js/grafico.js',
  'js/config.js',
  'js/icons.js',
  'js/store.js',
  'js/sync.js',
  'js/ui.js',
  'js/data/adubos.js',
  'js/data/culturas.js',
  'js/data/forrageiras.js',
  'js/data/interpretacao.js',
  'js/extract/index.js',
  'js/extract/parsers.js',
  'js/views/adubos.js',
  'js/views/analise.js',
  'js/views/auth.js',
  'js/views/config.js',
  'js/views/lista.js',
  'js/views/planejamento.js',
  'js/views/relatorio.js',
  'js/views/tabelas.js',
];
// Leitor de PDF entra no cache já na instalação; o OCR é baixado sob demanda
const VENDOR_PRECACHE = ['vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const app = await caches.open(CACHE_APP);
    await app.addAll(APP);
    const vendor = await caches.open(CACHE_VENDOR);
    for (const u of VENDOR_PRECACHE) {
      if (!(await vendor.match(new URL(u, self.registration.scope).href))) await vendor.add(u);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('gerenciagro-app-') && k !== CACHE_APP) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return;

  // Bibliotecas grandes (pdf.js, OCR): cache primeiro, rede se faltar
  if (url.pathname.includes('/vendor/')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_VENDOR);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const resp = await fetch(req);
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    })());
    return;
  }

  // App: responde do cache na hora e atualiza em segundo plano
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_APP);
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
    const rede = fetch(req).then((resp) => {
      if (resp.ok && resp.type === 'basic') cache.put(req, resp.clone());
      return resp;
    }).catch(() => null);
    if (hit) {
      e.waitUntil(rede);
      return hit;
    }
    return (await rede) || new Response('Offline', { status: 503 });
  })());
});
