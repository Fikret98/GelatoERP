self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      image: data.image || null, // Rich media support
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/'
      },
      actions: data.actions || [] // Action buttons support
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  let targetUrl = event.notification.data.url;

  // Handle specific action button clicks
  if (event.action === 'view_inventory') {
    targetUrl = '/inventory';
  } else if (event.action === 'view_pos') {
    targetUrl = '/pos';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
