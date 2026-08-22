/* STC Oberland · Sportcenter Hahn — leichter Service Worker für Offline-Fallback und Asset-Cache. */
'use strict';

var CACHE = 'stc-v1';
var SHELL = [
  '/offline.html',
  '/assets/css/style.css',
  '/assets/js/main.js',
  '/assets/img/pwa-icon-192.png',
  '/assets/img/pwa-icon-512.png',
  '/favicon.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function istAsset(url) {
  return url.pathname.startsWith('/assets/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname.endsWith('.woff2');
}

function assetKey(request) {
  var url = new URL(request.url);
  if (!istAsset(url)) return request;
  url.search = '';
  return new Request(url.toString(), { method: 'GET' });
}

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  /* HTML-Navigation: zuerst Netzwerk, sonst Cache, sonst Offline-Seite. */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        return res;
      }).catch(function () {
        return caches.match(event.request).then(function (cached) {
          return cached || caches.match('/offline.html');
        });
      })
    );
    return;
  }

  /* Statische Assets: Cache zuerst, im Hintergrund aktualisieren. */
  if (istAsset(url)) {
    var key = assetKey(event.request);
    event.respondWith(
      caches.match(key).then(function (cached) {
        var netz = fetch(event.request).then(function (res) {
          if (res.ok) {
            caches.open(CACHE).then(function (cache) { cache.put(key, res.clone()); });
          }
          return res;
        }).catch(function () { return cached; });
        return cached || netz;
      })
    );
  }
});
