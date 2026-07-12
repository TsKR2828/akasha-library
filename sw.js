const CACHE_NAME = 'akasha-library-0791553ebc';
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './privacy.html',
  './sw.js',

  // Icons (may not exist yet — addAll with ignoreErrors)
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/apple-touch-icon.png',

  // Shared styles & assets
  './assets/styles/shared.css',
  './assets/icons.js',

  // Core modules
  './core/ai.js',
  './core/auth.js',
  './core/billing.js',
  './core/chat-history.js',
  './core/config.js',
  './core/document-bridge.js',
  './core/drive.js',
  './core/embedding.js',
  './core/export.js',
  './core/export-core.js',
  './core/export/bridge.js',
  './core/export/clipboard.js',
  './core/export/fromPayload.js',
  './core/export/toPayload.js',
  './core/notion-connector.js',
  './core/notion-mapping.js',
  './core/persona.js',
  './core/prewritten.js',
  './core/room-summary.js',
  './core/security.js',
  './core/session-memory.js',
  './core/storage.js',
  './core/sync.js',
  './core/sync-queue.js',
  './core/translation-core.js',
  './core/bgm.js',
  './core/report-voice.js',
  './core/voice.js',
  './core/approved-memory.js',
  './core/text-decode.js',

  // Persona data (must be precached for offline AI)
  './persona.md',

  // Modules
  './modules/ai-settings/index.html',
  './modules/markdown/index.html',
  './modules/pdf-reader/index.html',
  './modules/pdf-reader/library-store.js',
  './modules/reading-room/index.html',
  './modules/daily-report/index.html',
  './modules/table-forge/index.html',
  './modules/table-forge/exporters.js',
  './modules/table-forge/md-extract.js',
  './modules/table-forge/parsers.js',
  './modules/table-forge/table-model.js',
  './modules/table-forge/table-ui.js',

  // Built Vite modules
  './dist/spreadsheet/index.html',
  './dist/spreadsheet/assets/index-BQ_jI8X5.js',
  './dist/script-editor/index.html',
  './dist/script-editor/assets/index-BSkjvPMz.js',
  './dist/script-editor/assets/index-CezaCN9g.css',
  './dist/script-editor/data/index.json',
  './dist/script-editor/data/works/lohengrin.json',
  './dist/script-editor/data/works/blackstar_ch1.json',
  './dist/script-editor/data/characters/lohengrin_characters.json',
  './dist/script-editor/data/characters/blackstar_ch1_characters.json',
  './dist/script-editor/data/lines/lohengrin_lines.jsonl',
  './dist/script-editor/data/lines/blackstar_ch1_lines.jsonl',
  './dist/script-editor/data/tags/tag_dictionary.json',
  './dist/script-editor/data/authors/richard_wagner.json',
  './dist/script-editor/data/sounds/library.json',
  './dist/script-editor/data/sounds/taxonomy.json',

  // Public library
  './public-library/index.html',
  './public-library/catalog.json',
];

// Install: cache local assets (skip missing files gracefully)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache files individually so missing icons don't break install
      const results = await Promise.allSettled(
        LOCAL_ASSETS.map(url => cache.add(url).catch(() => {
          // Silently skip files that don't exist yet (e.g. icons)
        }))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) {
        console.log(`[SW] ${failed} assets skipped (not found)`);
      }
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for static assets, network-first for navigation
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Cache-first for CDN / fonts / icons
  if (
    url.hostname === 'cdnjs.cloudflare.com' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for navigation (so updates are picked up)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Network-first for local assets (ensures JS matches HTML version)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Default: network only, fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
