// ============================================================
// AbsenO Service Worker - Offline-First PWA
// Versi: 1.0.0
// Naikkan angka ini setiap update untuk refresh cache
// ============================================================
const CACHE_VERSION = 'abseno-v1.0.0';

// === Aset wajib (aplikasi tidak bisa jalan tanpa ini) ===
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  // Library CDN
  'https://fonts.googleapis.com/css2?family=Philosopher:ital,wght@0,700;1,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
  'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js'
];

// === Model AI wajah (di-cache sekali, dipakai selamanya) ===
const FACE_MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
const FACE_MODEL_FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2'
];

// ============================================================
// INSTALL: cache semua aset inti + model AI
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing', CACHE_VERSION);
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      
      // Step 1: cache aset inti (kalau gagal → gagal install)
      try {
        await cache.addAll(CORE_ASSETS);
        console.log('[SW] ✓ Aset inti tersimpan');
      } catch (err) {
        console.error('[SW] ✕ Gagal cache aset inti:', err);
      }
      
      // Step 2: cache model AI (kalau gagal → lanjut saja)
      await Promise.allSettled(
        FACE_MODEL_FILES.map(async (file) => {
          const url = `${FACE_MODEL_URL}/${file}`;
          try {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response);
              console.log('[SW] ✓ Model:', file);
            }
          } catch (err) {
            console.warn('[SW] ⚠ Skip model:', file);
          }
        })
      );
    })()
  );
  
  self.skipWaiting(); // langsung aktif
});

// ============================================================
// ACTIVATE: hapus cache versi lama
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating', CACHE_VERSION);
  
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => {
            console.log('[SW] Hapus cache lama:', key);
            return caches.delete(key);
          })
      );
      await self.clients.claim(); // kontrol semua tab sekarang
    })()
  );
});

// ============================================================
// FETCH: strategi Cache First, fallback ke Network
// ============================================================
self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  // Hanya GET (POST/PUT/DELETE tidak di-cache)
  if (req.method !== 'GET') return;
  
  // Skip chrome-extension dan scheme lain
  if (!req.url.startsWith('http://') && !req.url.startsWith('https://')) return;
  
  // Jangan cache request Firestore (harus live)
  if (req.url.includes('firestore.googleapis.com')) return;
  
  event.respondWith(
    (async () => {
      // 1) Cek cache dulu
      const cached = await caches.match(req);
      if (cached) {
        // Update cache di background (stale-while-revalidate)
        fetch(req).then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            caches.open(CACHE_VERSION).then((c) => c.put(req, res));
          }
        }).catch(() => {});
        return cached;
      }
      
      // 2) Tidak ada cache → ambil dari internet
      try {
        const response = await fetch(req);
        
        // Cache response baru (runtime caching)
        if (response && (response.status === 200 || response.type === 'opaque')) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
        }
        return response;
      } catch (err) {
        // 3) Offline + tidak ada cache
        if (req.mode === 'navigate') {
          // Fallback ke index.html untuk navigasi
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
        }
        return new Response(
          JSON.stringify({ error: 'offline', message: 'Konten tidak tersedia offline' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
    })()
  );
});

// ============================================================
// MESSAGE: dari index.html (untuk cek update manual)
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
