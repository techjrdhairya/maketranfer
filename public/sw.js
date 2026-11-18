// MakeTransfer service worker: receives files from the system Share menu and focuses the app
// when a notification is tapped. It deliberately caches nothing else, so new deploys show up at once.
const SHARE_CACHE = 'mt-share-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShare(event.request));
  }
});

async function handleShare(request) {
  try {
    const form = await request.formData();
    const cache = await caches.open(SHARE_CACHE);
    for (const key of await cache.keys()) await cache.delete(key);
    let i = 0;
    for (const file of form.getAll('files')) {
      if (typeof file === 'string') continue;
      await cache.put(
        '/__shared/' + i++,
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name || 'shared-file'),
            'X-Last-Modified': String(file.lastModified || Date.now()),
          },
        })
      );
    }
    const text = [form.get('title'), form.get('text'), form.get('url')].filter((v) => typeof v === 'string' && v).join('\n').slice(0, 1500);
    const params = new URLSearchParams({ shared: '1' });
    if (text) params.set('text', text);
    return Response.redirect('/devices?' + params.toString(), 303);
  } catch (err) {
    return Response.redirect('/devices', 303);
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => 'focus' in w);
      if (open) {
        await open.focus();
        if ('navigate' in open) await open.navigate('/devices').catch(() => {});
      } else {
        await self.clients.openWindow('/devices');
      }
    })()
  );
});
