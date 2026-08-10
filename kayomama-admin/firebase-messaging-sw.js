// バックグラウンド用 FCM Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCxYGRBN2laaY0KOmSkxzutdMCIc4_FXYU',
  authDomain: 'kayomama-admin.firebaseapp.com',
  projectId: 'kayomama-admin',
  storageBucket: 'kayomama-admin.firebasestorage.app',
  messagingSenderId: '1092542902975',
  appId: '1:1092542902975:web:554a1b86f2f826b36fcc0a'
});

var messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var n = payload.notification || {};
  var title = n.title || '通知';
  var body = n.body || '';
  var options = {
    body: body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: payload.data || {},
    vibrate: [150, 50, 150],
    tag: 'kayomama-admin'
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('/kayomama-admin/') >= 0) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
