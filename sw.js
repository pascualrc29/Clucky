// Clucky service worker — offline support.
// Bump VERSION whenever you change any app file so installed apps pick up the update.
const VERSION = 'clucky-v2';
const FONT_CACHE = 'clucky-fonts';

const SHELL = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.webmanifest',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(VERSION)
            .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Serve from cache immediately, refresh the cache in the background.
function staleWhileRevalidate(event, cacheName, fallbackUrl) {
    const { request } = event;
    const cached = caches.open(cacheName).then((cache) =>
        cache.match(request, { ignoreSearch: request.mode === 'navigate' })
            .then((hit) => hit || (fallbackUrl ? cache.match(fallbackUrl) : undefined))
    );
    const network = fetch(request).then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(cacheName).then((cache) => cache.put(request, copy));
        }
        return response;
    });
    event.waitUntil(network.then(() => {}, () => {}));
    return cached.then((hit) => hit || network);
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (url.origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(event, VERSION, request.mode === 'navigate' ? './index.html' : null));
    } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(staleWhileRevalidate(event, FONT_CACHE));
    }
});
