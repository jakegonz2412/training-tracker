/*
  sw.js — the "service worker": makes the app work with NO signal.

  A service worker is a small script the browser keeps running in the
  background for your site. It sits between the app and the internet:
  every time the app asks for a file, this script decides where it comes from.

  Our rule ("network first"):
    1. Try the internet, so you always get the newest version of the app.
    2. Save a copy of whatever came back.
    3. No signal (basement gym)? Hand over the saved copy instead.

  Your workout DATA isn't stored here. It's in localStorage, which already
  works offline. This only keeps the app's own files available.
*/

const CACHE_NAME = "training-tracker";

// The files the app needs, saved as soon as the service worker installs
const APP_FILES = [
  "./",
  "index.html",
  "style.css",
  "manifest.json",
  "js/storage.js",
  "js/calc.js",
  "js/chart.js",
  "js/app.js",
  "icons/icon-192.png",
];

// First visit: download and save every app file
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting(); // start working right away
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim()); // take control of open pages
});

// Every file request goes through here
self.addEventListener("fetch", (event) => {
  // Only handle normal downloads of our own files
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Got it from the internet: keep a copy for offline use
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      // No internet: use the saved copy
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
