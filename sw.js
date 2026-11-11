// sw.js — service worker: cache เฉพาะไฟล์หน้าเว็บ (app shell) ให้เปิดเร็ว/ติดตั้งเป็นแอปได้
// ข้อมูลจาก Google Apps Script ไม่ cache ที่นี่ (api.js เก็บ cache ของตัวเองใน localStorage)
// แก้ไฟล์หน้าเว็บแล้วให้เปลี่ยนเลข VERSION เพื่อบังคับโหลดใหม่
const VERSION = 'pos-v1';
const SHELL = [
  './', 'index.html', 'css/styles.css', 'icon.svg', 'manifest.webmanifest',
  'js/app.js', 'js/api.js', 'js/demo.js', 'js/config.js', 'js/ui.js', 'js/barcode.js', 'js/product-form.js',
  'js/pages/pos.js', 'js/pages/products.js', 'js/pages/sales.js', 'js/pages/expenses.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// network-first: ออนไลน์ได้ไฟล์ใหม่เสมอ, ออฟไลน์ใช้ของใน cache
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
